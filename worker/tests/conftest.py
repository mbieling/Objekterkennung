# worker/tests/conftest.py
# Shared pytest fixtures für Worker-Unit-Tests
import pytest
from unittest.mock import MagicMock, patch


@pytest.fixture
def mock_s3():
    """Mock-S3-Client — verhindert echte AWS-Aufrufe in Unit-Tests."""
    with patch("boto3.client") as mock:
        client = MagicMock()
        mock.return_value = client
        yield client


@pytest.fixture
def mock_db():
    """Mock-psycopg2-Verbindung — verhindert echte DB-Aufrufe in Unit-Tests."""
    with patch("psycopg2.connect") as mock_connect:
        conn = MagicMock()
        cur = MagicMock()
        conn.cursor.return_value = cur
        mock_connect.return_value = conn
        yield conn, cur
