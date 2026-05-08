# worker/main.py
# FastAPI-Endpunkte für Bauteil-Finder Worker
# Läuft als: uvicorn worker.main:app --host 0.0.0.0 --port 8000
# Endpunkte:
#   GET  /health  — Health-Check für Docker Compose + Monitoring
#   POST /enqueue — Nimmt part_id entgegen, schiebt Celery-Task in Redis-Queue

import logging
from fastapi import FastAPI
from pydantic import BaseModel, UUID4

from worker.tasks import process_step_task

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
