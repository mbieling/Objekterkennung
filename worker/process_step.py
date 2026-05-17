# worker/process_step.py
# Python Worker Spike — vollständige Pipeline: S3 download → render → embed → S3 upload → DB write
# Ausführen: python process_step.py <part-uuid>
# Per D-10: kein FastAPI, kein Celery — direktes Skript für Spike-Validierung

# MUSS GANZ OBEN STEHEN — vor allen OCC-Imports (RESEARCH.md Pitfall 1)
import os
os.environ["VTK_DEFAULT_OPENGL_WINDOW"] = "vtkOSOpenGLRenderWindow"

import sys
import re
import tempfile
import logging
import numpy as np
import boto3
import psycopg2
from pgvector.psycopg2 import register_vector
from dotenv import load_dotenv

# Worker-Module (aus worker/-Verzeichnis)
from worker.renderer import load_step, validate_geometry, render_views, VIEW_COUNT
from worker.embedder import get_embedding, mean_pool, EMBEDDING_DIM
from worker.geometry import extract_geometry

# .env-Datei laden wenn vorhanden (lokale Entwicklung)
load_dotenv()

# Logging-Konfiguration
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
)
logger = logging.getLogger("process_step")

UUID_RE = re.compile(
    r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
    re.IGNORECASE
)


def validate_part_id(part_id: str) -> str:
    """Path-Traversal-Schutz: stellt sicher, dass part_id ein gültiges UUID-Format hat.

    Raises:
        ValueError: bei ungültigem Format (z.B. '../../../etc/passwd')
    """
    if not UUID_RE.match(part_id):
        raise ValueError(f"Ungültige part_id (kein UUID-Format): {part_id!r}")
    return part_id


# S3-Bucket-Konstanten (identisch mit src/lib/s3.ts BUCKET_STEPS / BUCKET_THUMBNAILS)
BUCKET_STEPS = os.environ["AWS_S3_BUCKET_STEPS"]            # "parts-steps"
BUCKET_THUMBNAILS = os.environ["AWS_S3_BUCKET_THUMBNAILS"]  # "parts-thumbnails"


def get_s3_client():
    """Erstellt boto3 S3-Client aus Env-Vars (analog zu src/lib/s3.ts)."""
    kwargs = dict(
        region_name=os.environ["AWS_REGION"],
        aws_access_key_id=os.environ["AWS_ACCESS_KEY_ID"],
        aws_secret_access_key=os.environ["AWS_SECRET_ACCESS_KEY"],
    )
    endpoint = os.environ.get("DECOMPOSEDS3_ENDPOINT")
    if endpoint:
        kwargs["endpoint_url"] = endpoint
        kwargs["config"] = __import__("botocore").config.Config(signature_version="s3v4")
    return boto3.client("s3", **kwargs)


def set_status(cur, part_id: str, status: str) -> None:
    """Setzt parts.status — updated_at via Datenbank-Trigger automatisch gesetzt."""
    cur.execute(
        "UPDATE parts SET status = %s WHERE id = %s",
        (status, part_id)
    )


def process(part_id: str) -> None:
    """Vollständige Pipeline für einen Teil-ID.

    Ablauf:
        1. DB: status → 'processing'
        2. S3: STEP-Datei herunterladen ({part_id}/original.step aus BUCKET_STEPS)
        3. STEP laden + Geometrie validieren (face_count >= 4, BBox-Volumen > 1e-6)
        4. 8 Views rendern (renderer.py) → 8 PNG-Dateien (512x512px)
        5. S3: 8 PNGs hochladen ({part_id}/view_0..7.png in BUCKET_THUMBNAILS)
        6. DINOv2: Embedding für alle N Views → Mean-Pool → EMBEDDING_DIM-Vektor
        7. DB: embedding, embedding_model, embedding_version, thumbnail_urls, status='ready'

    Fehlerbehandlung:
        - ValueError (INVALID_GEOMETRY:*): DB status='failed', Fehlercode in Log
        - Alle anderen Exceptions: DB status='failed', vollständiger Traceback in Log

    Args:
        part_id: UUID des parts-Eintrags in der Datenbank (muss existieren mit status='pending')
    """
    part_id = validate_part_id(part_id)  # CR-01 Fix: Path-Traversal-Schutz — vor jeder anderen Operation
    logger.info(f"[{part_id}] Pipeline gestartet")

    conn = None
    s3 = get_s3_client()

    try:
        # DB-Verbindung öffnen
        conn = psycopg2.connect(os.environ["DATABASE_URL"])
        register_vector(conn)  # PFLICHT vor erstem vector(N)-Query (RESEARCH.md Anti-Pattern)
        cur = conn.cursor()

        # Schritt 1: Status → 'processing'
        set_status(cur, part_id, "processing")
        conn.commit()
        logger.info(f"[{part_id}] Status: processing")

        with tempfile.TemporaryDirectory() as tmpdir:
            # Schritt 2: STEP-Datei aus S3 laden
            step_key = f"{part_id}/original.step"
            step_path = os.path.join(tmpdir, "part.step")
            logger.info(f"[{part_id}] S3-Download: s3://{BUCKET_STEPS}/{step_key}")
            s3.download_file(BUCKET_STEPS, step_key, step_path)
            logger.info(f"[{part_id}] STEP-Datei heruntergeladen: {os.path.getsize(step_path)} Bytes")

            # Schritt 3: STEP laden + validieren (ValueError bei ungültiger Geometrie)
            shape = load_step(step_path)
            validate_geometry(shape)
            logger.info(f"[{part_id}] Geometrie-Validierung: OK")

            # Schritt 3b: Geometrische Merkmale extrahieren (Hebel 3a — Re-Ranking in der Suche).
            # Nullable in DB — bei Extraktionsfehler wird die Pipeline nicht abgebrochen,
            # sondern die Werte fallen weg (Geometrie-Beitrag im Re-Ranking = 0).
            try:
                geometry = extract_geometry(shape)
            except Exception as geo_err:
                logger.warning(f"[{part_id}] Geometrie-Extraktion fehlgeschlagen, fahre ohne fort: {geo_err}")
                geometry = None

            # Schritt 4: VIEW_COUNT Views rendern
            views_dir = os.path.join(tmpdir, "views")
            os.makedirs(views_dir, exist_ok=True)
            png_paths = render_views(shape, views_dir)
            assert len(png_paths) == VIEW_COUNT, f"Erwartet {VIEW_COUNT} PNGs, erhalten: {len(png_paths)}"
            logger.info(f"[{part_id}] Rendering abgeschlossen: {VIEW_COUNT} PNGs in {views_dir}")

            # Schritt 5: PNGs nach S3 hochladen
            thumbnail_urls = []
            for i, local_path in enumerate(png_paths):
                s3_key = f"{part_id}/view_{i}.png"
                with open(local_path, "rb") as f:
                    s3.upload_fileobj(
                        f,
                        BUCKET_THUMBNAILS,
                        s3_key,
                        ExtraArgs={"ContentType": "image/png"}
                    )
                # URL-Format: s3://{bucket}/{key} — Phase 5 erstellt presigned URLs
                s3_url = f"s3://{BUCKET_THUMBNAILS}/{s3_key}"
                thumbnail_urls.append(s3_url)
                logger.info(f"[{part_id}] Hochgeladen: {s3_url}")

            # Schritt 6: DINOv2-Embeddings berechnen — mode='render' für die Pipeline-Konsistenz
            # (rembg läuft auch auf Renderings, damit beide Domänen identische Bildraum-Statistik haben)
            logger.info(f"[{part_id}] DINOv2-Inferenz für 8 Views...")
            embeddings = [get_embedding(path, mode="render") for path in png_paths]
            mean_embedding = mean_pool(embeddings)
            assert mean_embedding.shape == (EMBEDDING_DIM,), f"Embedding-Shape: {mean_embedding.shape}"
            logger.info(f"[{part_id}] Mean-Embedding: shape={mean_embedding.shape}, norm={np.linalg.norm(mean_embedding):.4f}")

            # Schritt 7a: Alte part_views löschen (Re-Processing-tauglich)
            cur.execute("DELETE FROM part_views WHERE part_id = %s", (part_id,))

            # Schritt 7b: Alle 8 View-Embeddings einzeln in part_views schreiben (Hebel 2)
            for view_idx, view_embedding in enumerate(embeddings):
                cur.execute(
                    "INSERT INTO part_views (part_id, view_idx, embedding) VALUES (%s, %s, %s)",
                    (part_id, view_idx, view_embedding)
                )
            logger.info(f"[{part_id}] {len(embeddings)} View-Embeddings in part_views geschrieben")

            # Schritt 7c: parts-Tabelle aktualisieren (Mean-Embedding bleibt als Fallback).
            # Geometrie-Werte als Tupel (möglicherweise None bei Extraktionsfehler).
            geo_x = geometry["bbox_x"] if geometry else None
            geo_y = geometry["bbox_y"] if geometry else None
            geo_z = geometry["bbox_z"] if geometry else None
            geo_vol = geometry["volume"] if geometry else None
            geo_surf = geometry["surface_area"] if geometry else None
            geo_faces = geometry["face_count"] if geometry else None

            cur.execute("""
                UPDATE parts SET
                    embedding = %s,
                    embedding_model = %s,
                    embedding_version = %s,
                    thumbnail_urls = %s,
                    thumbnail_count = %s,
                    bbox_x = %s,
                    bbox_y = %s,
                    bbox_z = %s,
                    volume = %s,
                    surface_area = %s,
                    face_count = %s,
                    status = 'ready'
                WHERE id = %s
            """, (
                mean_embedding,                                  # numpy(EMBEDDING_DIM,) → vector(EMBEDDING_DIM) via pgvector
                "dinov3-large",                                  # embedding_model
                "facebook/dinov3-vitl16-pretrain-lvd1689m",      # embedding_version
                thumbnail_urls,          # list[str] → text[]
                len(png_paths),          # thumbnail_count — benötigt von /api/parts/[id]/thumbnails
                geo_x, geo_y, geo_z, geo_vol, geo_surf, geo_faces,
                part_id
            ))
            conn.commit()
            logger.info(f"[{part_id}] Pipeline abgeschlossen: status=ready")

    except ValueError as e:
        # Strukturierter Fehlercode (D-09): z.B. "INVALID_GEOMETRY:face_count=2"
        error_code = str(e)
        logger.error(f"[{part_id}] Geometrie-Fehler: {error_code}")
        if conn:
            try:
                cur = conn.cursor()
                set_status(cur, part_id, "failed")
                conn.commit()
                logger.info(f"[{part_id}] Status: failed (Fehlercode: {error_code})")
            except Exception as db_err:
                logger.exception(f"[{part_id}] DB-Update für failed-Status fehlgeschlagen: {db_err}")

    except Exception as e:
        logger.exception(f"[{part_id}] Unerwarteter Fehler: {e}")
        if conn:
            try:
                cur = conn.cursor()
                set_status(cur, part_id, "failed")
                conn.commit()
                logger.info(f"[{part_id}] Status: failed (unerwarteter Fehler)")
            except Exception as db_err:
                logger.exception(f"[{part_id}] DB-Update für failed-Status fehlgeschlagen: {db_err}")
        raise

    finally:
        if conn:
            conn.close()


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(f"Usage: python process_step.py <part-uuid>")
        sys.exit(1)

    part_id = sys.argv[1]
    process(part_id)
