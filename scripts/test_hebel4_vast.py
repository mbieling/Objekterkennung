#!/usr/bin/env python3
"""scripts/test_hebel4_vast.py — Hebel-4-Test ohne Frontend.

Holt N existierende STEP-Dateien aus dem konfigurierten S3-Bucket,
kopiert sie unter NEUEN UUIDs (damit die Original-Production-Thumbnails
nicht ueberschrieben werden), legt parts-Eintraege in der Test-Neon-DB an
und ruft die volle Worker-Pipeline (worker.process_step.process)
inklusive Shape-Foundation-Modell auf.

Voraussetzungen auf der vast-Instanz:
  - worker/.env mit DATABASE_URL, AWS_*, AWS_S3_BUCKET_STEPS,
    AWS_S3_BUCKET_THUMBNAILS, HF_TOKEN
  - SHAPE_DISABLE=0 in worker/.env
  - Xvfb laeuft auf :99 (export DISPLAY=:99)
  - Modelle vorgeladen (DINOv3 + bayang/shape-foundation-small-v3)

Aufruf:
  cd /workspace/objekterkennung
  set -a; source worker/.env; set +a
  export DISPLAY=:99
  export HF_HOME=/workspace/model_cache
  python3 scripts/test_hebel4_vast.py 3   # 3 Teile testen
"""

import os
os.environ.setdefault("VTK_DEFAULT_OPENGL_WINDOW", "vtkOSOpenGLRenderWindow")

import sys
import uuid as uuid_lib
import hashlib
import traceback

import boto3
import psycopg2
from pgvector.psycopg2 import register_vector

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from worker.process_step import process


def main() -> int:
    n = int(sys.argv[1]) if len(sys.argv) > 1 else 1

    bucket = os.environ.get("AWS_S3_BUCKET_STEPS") or os.environ.get("BUCKET_STEPS")
    if not bucket:
        print("FEHLER: weder AWS_S3_BUCKET_STEPS noch BUCKET_STEPS gesetzt")
        return 1

    s3 = boto3.client(
        "s3",
        region_name=os.environ["AWS_REGION"],
        aws_access_key_id=os.environ["AWS_ACCESS_KEY_ID"],
        aws_secret_access_key=os.environ["AWS_SECRET_ACCESS_KEY"],
        endpoint_url=os.environ.get("DECOMPOSEDS3_ENDPOINT"),
    )

    print(f"[1] Suche STEPs in Bucket '{bucket}' ...")
    found = []
    for page in s3.get_paginator("list_objects_v2").paginate(Bucket=bucket):
        for obj in page.get("Contents", []):
            key = obj["Key"]
            if key.endswith("/original.step"):
                found.append((key, obj["Size"]))
                if len(found) >= n:
                    break
        if len(found) >= n:
            break

    if not found:
        print("    Keine STEP-Files gefunden. Stoppe.")
        return 1
    print(f"    {len(found)} Quellen ausgewaehlt")
    for k, sz in found:
        print(f"      {k} ({sz / 1024 / 1024:.1f} MB)")

    print(f"\n[2] DB-Verbindung herstellen ...")
    conn = psycopg2.connect(os.environ["DATABASE_URL"])
    register_vector(conn)
    cur = conn.cursor()

    ok_count = 0
    fail_count = 0
    for src_key, size in found:
        new_id = str(uuid_lib.uuid4())
        new_key = f"{new_id}/original.step"
        print(f"\n=== Test-Part {new_id} (Quelle: {src_key}) ===")

        # 1) S3-Copy
        try:
            s3.copy_object(
                Bucket=bucket,
                CopySource={"Bucket": bucket, "Key": src_key},
                Key=new_key,
            )
        except Exception as e:
            print(f"  ERROR S3-Copy: {e}")
            fail_count += 1
            continue

        # 2) sha256 aus der kopierten Datei
        body = s3.get_object(Bucket=bucket, Key=new_key)["Body"].read()
        sha = hashlib.sha256(body).hexdigest()

        # 3) parts-Eintrag in Test-Neon
        cur.execute(
            """
            INSERT INTO parts (id, name, original_filename, file_size_bytes, sha256, status)
            VALUES (%s, %s, %s, %s, %s, 'processing')
            """,
            (new_id, f"Hebel4 {new_id[:8]}", "test.step", size, sha),
        )
        conn.commit()

        # 4) volle Worker-Pipeline
        try:
            process(new_id)
        except Exception as e:
            print(f"  ERROR in process(): {type(e).__name__}: {e}")
            traceback.print_exc()
            fail_count += 1
            continue

        # 5) shape_embedding pruefen
        cur.execute(
            "SELECT shape_embedding IS NOT NULL FROM parts WHERE id = %s",
            (new_id,),
        )
        has_shape = cur.fetchone()[0]
        if has_shape:
            print(f"  shape_embedding: GEFUELLT  ->  Hebel 4 OK")
            ok_count += 1
        else:
            print(f"  shape_embedding: NULL  ->  Hebel 4 hat nicht gegriffen")
            fail_count += 1

    cur.close()
    conn.close()
    print(f"\n=== Bilanz ===")
    print(f"  OK:        {ok_count}/{len(found)}")
    print(f"  Fehler:    {fail_count}/{len(found)}")
    return 0 if fail_count == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
