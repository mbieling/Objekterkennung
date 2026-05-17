#!/usr/bin/env python3
"""scripts/test_shape_embed.py — Isolierter Test: berechnet ein Shape-Embedding für
ein gegebenes Teil, schreibt es in die DB, liest es zurück. Zeigt jeden Schritt
einzeln, damit wir lokalisieren können wo der NULL-Wert herkommt.

Ausführen im Worker-Container:

    docker compose cp scripts/test_shape_embed.py worker:/tmp/t.py
    docker compose exec worker python /tmp/t.py <part-uuid>

Default-UUID: das erste Teil aus dem letzten Reindex-Lauf.
"""

import os
import sys
import tempfile

import boto3
import psycopg2
from pgvector.psycopg2 import register_vector

sys.path.insert(0, "/app")
from worker.shape_embedder import get_shape_embedding


def main() -> None:
    part_id = sys.argv[1] if len(sys.argv) >= 2 else "e89080b5-e48f-4a0e-a3fc-0eb5b269c09b"
    print(f"[1] Teste Shape-Embedding für Part: {part_id}")

    s3 = boto3.client(
        "s3",
        region_name=os.environ["AWS_REGION"],
        aws_access_key_id=os.environ["AWS_ACCESS_KEY_ID"],
        aws_secret_access_key=os.environ["AWS_SECRET_ACCESS_KEY"],
        endpoint_url=os.environ.get("DECOMPOSEDS3_ENDPOINT"),
    )

    with tempfile.NamedTemporaryFile(suffix=".step", delete=False) as tmp:
        tmp_path = tmp.name

    print(f"[2] STEP herunterladen → {tmp_path}")
    s3.download_file(
        os.environ["AWS_S3_BUCKET_STEPS"],
        f"{part_id}/original.step",
        tmp_path,
    )
    print(f"    Größe: {os.path.getsize(tmp_path)} Bytes")

    print(f"[3] Shape-Embedding berechnen ...")
    emb = get_shape_embedding(tmp_path)
    if emb is None:
        print(f"    FEHLER: get_shape_embedding lieferte None")
        return
    print(f"    type={type(emb).__name__}, shape={emb.shape}, dtype={emb.dtype}")
    print(f"    norm={float((emb * emb).sum() ** 0.5):.4f}")
    print(f"    erste 5 Werte: {emb[:5].tolist()}")

    print(f"[4] In DB schreiben ...")
    conn = psycopg2.connect(os.environ["DATABASE_URL"])
    register_vector(conn)
    cur = conn.cursor()
    cur.execute(
        "UPDATE parts SET shape_embedding = %s WHERE id = %s",
        (emb, part_id),
    )
    print(f"    Rows updated: {cur.rowcount}")
    conn.commit()

    print(f"[5] Aus DB zurücklesen ...")
    cur.execute(
        "SELECT shape_embedding IS NOT NULL, "
        "       array_length(shape_embedding::real[], 1) "
        "FROM parts WHERE id = %s",
        (part_id,),
    )
    row = cur.fetchone()
    print(f"    has_shape={row[0]}, dim={row[1]}")

    conn.close()
    os.unlink(tmp_path)
    print(f"[6] Test abgeschlossen")


if __name__ == "__main__":
    main()
