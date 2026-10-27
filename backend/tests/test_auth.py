"""Регистрация, вход, профиль."""
from tests.conftest import login


def test_required_accounts_exist(client):
    r = client.post("/api/auth/login", json={"username": "alice", "password": "password123"})
    assert r.status_code == 200 and r.json()["user"]["role"] == "admin"
    r = client.post("/api/auth/login", json={"username": "reader1", "password": "password123"})
    assert r.status_code == 200 and r.json()["user"]["role"] == "reader"


def test_register_creates_reader_and_logs_in(client, unique):
    name = unique("user").replace("-", "_")
    r = client.post("/api/auth/register", json={
        "username": name, "email": f"{name}@example.com", "full_name": "Новый", "password": "secret-pass"})
    assert r.status_code == 201, r.text
    assert r.json()["user"]["role"] == "reader"
    me = client.get("/api/auth/me", headers={"Authorization": f"Bearer {r.json()['access_token']}"})
    assert me.json()["username"] == name


def test_register_duplicate_rejected(client):
    r = client.post("/api/auth/register", json={
        "username": "ALICE", "email": "other@example.com", "password": "password123"})
    assert r.status_code == 409


def test_register_validation(client):
    r = client.post("/api/auth/register", json={"username": "ab", "email": "bad", "password": "1"})
    assert r.status_code == 422


def test_wrong_password(client):
    r = client.post("/api/auth/login", json={"username": "alice", "password": "nope"})
    assert r.status_code == 401


def test_me_requires_token(client):
    assert client.get("/api/auth/me").status_code == 401
    assert client.get("/api/auth/me", headers={"Authorization": "Bearer junk"}).status_code == 401


def test_profile_update_and_password_change(client, unique):
    name = unique("prof").replace("-", "_")
    client.post("/api/auth/register", json={"username": name, "email": f"{name}@ex.com", "password": "password123"})
    h = login(client, name)
    r = client.patch("/api/auth/me", json={"full_name": "Иван Иванов"}, headers=h)
    assert r.json()["full_name"] == "Иван Иванов"
    r = client.post("/api/auth/me/password", json={"current_password": "bad", "new_password": "newpassword1"}, headers=h)
    assert r.status_code == 400
    r = client.post("/api/auth/me/password", json={"current_password": "password123", "new_password": "newpassword1"}, headers=h)
    assert r.status_code == 204
    login(client, name, "newpassword1")
