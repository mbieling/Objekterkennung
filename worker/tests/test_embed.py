# worker/tests/test_embed.py
# Pytest-Stubs für Plan 06-02: /embed-Endpunkt in worker/main.py
# Analog zu worker/tests/test_renderer.py — Quellcode-Analyse ohne Docker/FastAPI-Startup.

import os
import sys
import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..'))


def _get_main_source() -> str:
    """Liest worker/main.py Quellcode direkt (ohne FastAPI-Import-Seiteneffekte)."""
    main_path = os.path.join(os.path.dirname(__file__), '..', 'main.py')
    with open(main_path, 'r') as f:
        return f.read()


@pytest.mark.skip(reason="Wave 0 stub — implementiert wenn Plan 06-02 abgeschlossen")
def test_embed_endpoint_registered():
    """SEARCH-03: /embed-Endpunkt muss als @app.post('/embed') registriert sein."""
    source = _get_main_source()
    assert '@app.post("/embed")' in source or "@app.post('/embed')" in source


@pytest.mark.skip(reason="Wave 0 stub — implementiert wenn Plan 06-02 abgeschlossen")
def test_embed_request_model_defined():
    """SEARCH-03: EmbedRequest(s3_key: str) muss als Pydantic-BaseModel definiert sein."""
    source = _get_main_source()
    assert 'class EmbedRequest' in source


@pytest.mark.skip(reason="Wave 0 stub — implementiert wenn Plan 06-02 abgeschlossen")
def test_embed_response_model_defined():
    """SEARCH-03: EmbedResponse(embedding: list[float]) muss als Pydantic-BaseModel definiert sein."""
    source = _get_main_source()
    assert 'class EmbedResponse' in source


@pytest.mark.skip(reason="Wave 0 stub — implementiert wenn Plan 06-02 abgeschlossen")
def test_embed_calls_get_embedding():
    """SEARCH-03: embed()-Funktion muss get_embedding() aus worker.embedder aufrufen."""
    source = _get_main_source()
    assert 'get_embedding' in source


@pytest.mark.skip(reason="Wave 0 stub — implementiert wenn Plan 06-02 abgeschlossen")
def test_embed_has_finally_cleanup():
    """SEARCH-03: embed()-Funktion muss try/finally-Block für Temp-Datei-Cleanup haben."""
    source = _get_main_source()
    assert 'finally:' in source
    assert 'os.unlink' in source
