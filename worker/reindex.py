# worker/reindex.py
# Re-Indexing-Skript: prozessiert alle parts.status='ready' neu durch die Pipeline.
#
# Nutzung:
#   docker compose exec worker python -m worker.reindex            # alle Teile
#   docker compose exec worker python -m worker.reindex <part-id>  # einzelnes Teil
#
# Hintergrund: Nach Pipeline-Änderungen (Hebel 1+2 — rembg, Multi-View-Index) müssen
# die existierenden Embeddings neu berechnet werden, damit Suche konsistent funktioniert.

import os
os.environ["VTK_DEFAULT_OPENGL_WINDOW"] = "vtkOSOpenGLRenderWindow"

import sys
import logging
import psycopg2
from pgvector.psycopg2 import register_vector
from dotenv import load_dotenv

from worker.process_step import process

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
)
logger = logging.getLogger("reindex")


def list_ready_parts() -> list[str]:
    """Liefert alle part_id-UUIDs mit status='ready'."""
    conn = psycopg2.connect(os.environ["DATABASE_URL"])
    register_vector(conn)
    cur = conn.cursor()
    cur.execute("SELECT id FROM parts WHERE status = 'ready' ORDER BY created_at ASC")
    ids = [str(row[0]) for row in cur.fetchall()]
    conn.close()
    return ids


def reindex_all() -> tuple[int, int]:
    """Reprozessiert alle ready-Teile. Returns (success, failed)."""
    part_ids = list_ready_parts()
    logger.info(f"Re-Indexing: {len(part_ids)} Teile zu prozessieren")

    success = 0
    failed = 0
    for i, part_id in enumerate(part_ids, 1):
        logger.info(f"[{i}/{len(part_ids)}] {part_id}")
        try:
            process(part_id)
            success += 1
        except Exception as e:
            logger.exception(f"[{part_id}] Re-Indexing fehlgeschlagen: {e}")
            failed += 1

    logger.info(f"Re-Indexing abgeschlossen: {success} OK, {failed} fehlgeschlagen")
    return success, failed


def main() -> int:
    if len(sys.argv) == 2:
        part_id = sys.argv[1]
        logger.info(f"Re-Indexing einzelnes Teil: {part_id}")
        try:
            process(part_id)
            logger.info(f"[{part_id}] OK")
            return 0
        except Exception as e:
            logger.exception(f"[{part_id}] Fehler: {e}")
            return 1

    success, failed = reindex_all()
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
