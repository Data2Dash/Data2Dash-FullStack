import os
import pytest
from fastapi.testclient import TestClient

os.environ.setdefault("DATABASE_URL", "sqlite:///./test.db")
os.environ.setdefault("GROQ_API_KEY", "test_key")
os.environ.setdefault("JWT_SECRET_KEY", "test_secret_key_for_ci")

from main import app

@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c
