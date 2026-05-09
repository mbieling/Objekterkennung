# worker/main.py
# FastAPI-Endpunkte für Bauteil-Finder Worker
# Läuft als: uvicorn worker.main:app --host 0.0.0.0 --port 8000
# Endpunkte:
#   GET  /health  — Health-Check für Docker Compose + Monitoring
#   POST /enqueue — Nimmt part_id entgegen, schiebt Celery-Task in Redis-Queue
#   POST /embed   — Synchron: S3-Key → Bild herunterladen → get_embedding() → 768 Floats

import logging
import boto3
import tempfile
import os

from fastapi import FastAPI
from pydantic import BaseModel, UUID4

from worker.tasks import process_step_task
from worker.embedder import get_embedding

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
)
logger = logging.getLogger(__name__)

app = FastAPI(title="Bauteil-Finder Worker", version="1.0.0")


class EnqueueRequest(BaseModel):
    """Request-Body für POST /enqueue.

    part_id wird als UUID4 validiert (Pydantic) — zweite Verteidigungslinie nach CR-01-Fix
    und Zod-UUID-Validierung in der Next.js Confirm-Route.
    """
    part_id: UUID4


class EmbedRequest(BaseModel):
    """Request-Body für POST /embed.

    s3_key ist der S3-Objektschlüssel des Thumbnails (z.B. "thumbnails/part-uuid/view-0.jpg").
    """
    s3_key: str


class EmbedResponse(BaseModel):
    """Response-Body für POST /embed.

    embedding enthält 768 Floats (DINOv2 ViT-B/14 Patch-Token Mean-Pool).
    """
    embedding: list[float]


@app.get("/health")
def health() -> dict:
    """Health-Check-Endpunkt.

    Antwortet mit HTTP 200 wenn der FastAPI-Server läuft.
    Celery-Worker-Status wird hier nicht geprüft — separater Monitoring-Endpunkt wenn nötig.
    """
    return {"status": "ok"}


@app.post("/enqueue", status_code=202)
def enqueue(req: EnqueueRequest) -> dict:
    """Nimmt part_id entgegen und schiebt Celery-Task in die Redis-Queue.

    Die eigentliche STEP-Verarbeitung läuft asynchron im Celery-Worker.
    HTTP 202 bedeutet: Job wurde akzeptiert und wird verarbeitet.
    """
    part_id_str = str(req.part_id)
    logger.info(f"[{part_id_str}] Job in Queue eingereiht")
    task = process_step_task.delay(part_id_str)
    return {"task_id": task.id, "part_id": part_id_str}


@app.post("/embed", response_model=EmbedResponse)
def embed(req: EmbedRequest) -> EmbedResponse:
    """Synchroner Embedding-Endpunkt (D-04: kein Celery, direktes HTTP 200).

    Lädt das Thumbnail-Bild per S3-Key aus dem S3-Bucket in eine Temp-Datei,
    ruft get_embedding() auf (DINOv2 ViT-B/14, 768-dim Patch-Token Mean-Pool)
    und gibt das Embedding zurück. Temp-Datei wird im finally-Block gelöscht.
    """
    logger.info(f"[{req.s3_key}] Embed-Request empfangen")

    s3_client = boto3.client(
        "s3",
        region_name=os.environ["AWS_REGION"],
        aws_access_key_id=os.environ["AWS_ACCESS_KEY_ID"],
        aws_secret_access_key=os.environ["AWS_SECRET_ACCESS_KEY"],
        endpoint_url=os.environ.get("DECOMPOSEDS3_ENDPOINT"),
    )

    with tempfile.NamedTemporaryFile(suffix=".jpg", delete=False) as tmp:
        tmp_path = tmp.name

    try:
        s3_client.download_file(
            os.environ["AWS_S3_BUCKET_THUMBNAILS"],
            req.s3_key,
            tmp_path,
        )
        embedding = get_embedding(tmp_path)
        logger.info(f"[{req.s3_key}] Embedding berechnet, shape={embedding.shape}")
        return EmbedResponse(embedding=embedding.tolist())
    finally:
        if os.path.exists(tmp_path):
            os.unlink(tmp_path)
