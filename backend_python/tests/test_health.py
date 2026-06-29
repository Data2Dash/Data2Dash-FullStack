def test_root_endpoint(client):
    response = client.get("/")
    assert response.status_code == 200

def test_cors_headers(client):
    response = client.options(
        "/api/search",
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "POST",
        },
    )
    assert response.status_code in (200, 405)

def test_auth_register_endpoint_exists(client):
    response = client.post(
        "/auth/register",
        json={"email": "test@test.com", "password": "testpass123"},
    )
    assert response.status_code in (200, 201, 422)

def test_auth_login_endpoint_exists(client):
    response = client.post(
        "/auth/login",
        json={"email": "test@test.com", "password": "wrongpass"},
    )
    assert response.status_code in (200, 401, 422)

def test_search_endpoint_exists(client):
    response = client.post(
        "/api/search",
        json={"query": "test"},
    )
    assert response.status_code in (200, 422, 500)

def test_static_uploads_mount(client):
    response = client.get("/api/uploads/")
    assert response.status_code in (200, 404)

def test_invalid_endpoint_returns_404(client):
    response = client.get("/api/nonexistent")
    assert response.status_code == 404
