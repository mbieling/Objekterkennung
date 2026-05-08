# worker/tasks.py
# Celery-Task-Wrapper für STEP-Verarbeitungs-Pipeline
#
# WARNUNG: Die folgende Zeile MUSS GANZ OBEN stehen — vor allen anderen Imports.
# Celery lädt tasks.py beim Worker-Start; process_step.py importiert OCC-Module transitiv.
# Ohne diese Zeile initialisiert VTK einen Display-basierten Window-Manager → Crash.
import os
os.environ["VTK_DEFAULT_OPENGL_WINDOW"] = "vtkOSOpenGLRenderWindow"

import logging
from worker.celery_app import celery_app
from worker.process_step import process

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
)
logger = logging.getLogger(__name__)


@celery_app.task(name="worker.tasks.process_step", bind=True, max_retries=0)
def process_step_task(self, part_id: str) -> None:
    """Celery-Task-Wrapper für process_step.process().

    max_retries=0: Fehler werden als 'failed' in DB geschrieben — kein automatischer Retry.
    Manueller Retry erfolgt über Admin-Katalog (Phase 5).

    Args:
        part_id: UUID des parts-Eintrags (wird von FastAPI /enqueue übergeben)
    """
    logger.info(f"[{part_id}] Celery-Task gestartet")
    try:
        process(part_id)
        logger.info(f"[{part_id}] Celery-Task abgeschlossen")
    except Exception as e:
        # process() setzt bereits status='failed' in der DB bei Exceptions.
        # Hier nur Logging — kein Re-Raise damit Celery den Task als SUCCESS markiert
        # (der Fehler ist bereits in der DB dokumentiert).
        logger.error(f"[{part_id}] Celery-Task fehlgeschlagen: {e}")
