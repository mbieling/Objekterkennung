# worker/celery_app.py
# Celery-Instanz-Konfiguration für Bauteil-Finder Worker
# Broker: Redis (lokal: redis://redis:6379/0 | prod: rediss://... Upstash)
import os
from celery import Celery

BROKER_URL = os.environ["CELERY_BROKER_URL"]         # KeyError wenn fehlend — explizit
RESULT_BACKEND = os.environ.get("CELERY_RESULT_BACKEND", BROKER_URL)  # Default = Broker

celery_app = Celery("bauteil_finder", broker=BROKER_URL, backend=RESULT_BACKEND)
celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_acks_late=True,            # Task erst nach erfolgreichem Abschluss aus Queue entfernen
    worker_prefetch_multiplier=1,   # Nur 1 Task gleichzeitig reservieren (STEP-Processing ist CPU-intensiv)
)
