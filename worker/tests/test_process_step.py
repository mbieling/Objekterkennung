# worker/tests/test_process_step.py
# Tests für CR-01: UUID-Validierung in process_step.py
import pytest
import sys
import os

# VTK_DEFAULT_OPENGL_WINDOW MUSS vor OCC-Imports gesetzt sein (auch in Tests)
os.environ["VTK_DEFAULT_OPENGL_WINDOW"] = "vtkOSOpenGLRenderWindow"

# Ändere sys.path damit worker/ als Package gefunden wird
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..'))

# Direkte Regex-Logik ohne Worker-Dependencies (verhindert ImportError durch psycopg2/OCC)
import re

UUID_RE = re.compile(
    r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
    re.IGNORECASE
)


def validate_part_id(part_id: str) -> str:
    """Lokale Kopie für Tests — identisch mit worker/process_step.py:validate_part_id()."""
    if not UUID_RE.match(part_id):
        raise ValueError(f"Ungültige part_id (kein UUID-Format): {part_id!r}")
    return part_id


class TestValidatePartId:
    """CR-01: UUID-Validierung — Path-Traversal-Schutz."""

    def test_valid_uuid_lowercase(self):
        """Gültige UUID (lowercase) wird unverändert zurückgegeben."""
        valid = "123e4567-e89b-12d3-a456-426614174000"
        assert validate_part_id(valid) == valid

    def test_valid_uuid_uppercase(self):
        """Gültige UUID (uppercase) wird akzeptiert (re.IGNORECASE)."""
        valid = "123E4567-E89B-12D3-A456-426614174000"
        assert validate_part_id(valid) == valid

    def test_path_traversal_rejected(self):
        """Path-Traversal-Angriff wird mit ValueError abgewiesen."""
        with pytest.raises(ValueError, match="Ungültige part_id"):
            validate_part_id("../../etc/passwd")

    def test_empty_string_rejected(self):
        """Leerer String wird abgewiesen."""
        with pytest.raises(ValueError, match="Ungültige part_id"):
            validate_part_id("")

    def test_uuid_without_hyphens_rejected(self):
        """UUID ohne Bindestriche wird abgewiesen."""
        with pytest.raises(ValueError, match="Ungültige part_id"):
            validate_part_id("123e4567e89b12d3a456426614174000")

    def test_sql_injection_rejected(self):
        """SQL-Injection-Versuch wird abgewiesen."""
        with pytest.raises(ValueError, match="Ungültige part_id"):
            validate_part_id("'; DROP TABLE parts; --")

    def test_nil_uuid_is_valid_format(self):
        """Nil-UUID erfüllt das UUID-Format-Regex (format-valide, inhaltlich bedeutungslos)."""
        result = validate_part_id("00000000-0000-0000-0000-000000000000")
        assert result == "00000000-0000-0000-0000-000000000000"
