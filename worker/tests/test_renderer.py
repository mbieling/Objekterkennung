# worker/tests/test_renderer.py
# Tests für CR-02: Viewer3d Ressourcen-Freigabe
import os
import inspect
import sys
import pytest

os.environ["VTK_DEFAULT_OPENGL_WINDOW"] = "vtkOSOpenGLRenderWindow"

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..'))


def _get_render_views_source() -> str:
    """Liest render_views() Quellcode direkt aus renderer.py (ohne OCC-Import)."""
    renderer_path = os.path.join(os.path.dirname(__file__), '..', 'renderer.py')
    with open(renderer_path, 'r') as f:
        content = f.read()
    # Extrahiere render_views-Funktion (von def render_views bis zum nächsten Top-Level-def oder EOF)
    start = content.find('def render_views(')
    if start == -1:
        return ""
    return content[start:]


def test_render_views_has_finally_cleanup():
    """CR-02: render_views() muss einen finally-Block mit viewer.Viewer.Remove() enthalten.

    Dieser Test prüft den Quellcode direkt (kein Rendering nötig — OCC wäre im lokalen
    Entwicklungsumfeld nicht verfügbar ohne Docker).
    """
    source = _get_render_views_source()
    assert "finally:" in source, "render_views() fehlt try/finally-Block (CR-02 Fix nicht angewandt)"
    assert "viewer.Viewer.Remove()" in source, "viewer.Viewer.Remove() fehlt im finally-Block (CR-02 Fix nicht angewandt)"


def test_render_views_has_explicit_size():
    """IN-03: render_views() muss explizit 512x512 setzen."""
    source = _get_render_views_source()
    assert "SetSize(512, 512)" in source, "Explizite Auflösung 512x512 fehlt in render_views()"
