# worker/tests/test_pipeline_e2e.py
# E2E-Stub: vollständiger Status-Zyklus pending → processing → ready/failed
# Dieser Test erfordert laufenden Docker+Redis+Worker — lokal als skip markiert
import pytest


@pytest.mark.skip(reason="E2E erfordert laufenden Docker+Redis+Worker — manuell via docker compose up testen")
def test_worker_status_cycle():
    """SC#4: Worker konsumiert Job und setzt parts.status: pending → processing → ready/failed."""
    pass


@pytest.mark.skip(reason="E2E erfordert laufenden Docker+Redis+Worker")
def test_worker_status_failed_on_invalid_step():
    """SC#4: Worker setzt status=failed bei ungültiger STEP-Datei."""
    pass
