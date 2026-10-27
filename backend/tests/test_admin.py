"""Панель администратора."""


def test_stats(client, admin):
    s = client.get("/api/admin/stats", headers=admin).json()
    assert s["users_by_role"]["admin"] >= 1
    assert s["articles_by_status"]["published"] >= 40
    assert len(s["top_articles"]) == 5


def test_article_filter_by_status(client, admin):
    r = client.get("/api/admin/articles", params={"status": "pending"}, headers=admin).json()
    assert all(i["status"] == "pending" for i in r["items"]) and r["total"] >= 1


def test_user_management(client, admin, unique):
    name = unique("blk").replace("-", "_")
    reg = {"username": name, "email": f"{name}@ex.com", "password": "password123"}
    uid = client.post("/api/auth/register", json=reg).json()["user"]["id"]
    r = client.patch(f"/api/admin/users/{uid}", json={"role": "editor"}, headers=admin)
    assert r.json()["role"] == "editor"
    client.patch(f"/api/admin/users/{uid}", json={"is_active": False}, headers=admin)
    assert client.post("/api/auth/login", json={"username": name, "password": "password123"}).status_code == 403
    found = client.get("/api/admin/users", params={"q": name}, headers=admin).json()
    assert found["total"] == 1 and found["items"][0]["is_active"] is False


def test_admin_cannot_demote_self(client, admin):
    me = client.get("/api/auth/me", headers=admin).json()
    assert client.patch(f"/api/admin/users/{me['id']}", json={"role": "reader"}, headers=admin).status_code == 409


def test_categories(client, admin):
    topic_id = client.get("/api/topics").json()[0]["id"]
    new = {"topic_id": topic_id, "slug": "exoplanets", "name": "Экзопланеты"}
    r = client.post("/api/admin/categories", json=new, headers=admin)
    assert r.status_code == 201
    assert any(c["slug"] == "exoplanets" for c in client.get("/api/topics").json()[0]["categories"])
    assert client.post("/api/admin/categories", json=new, headers=admin).status_code == 409
    assert client.delete(f"/api/admin/categories/{r.json()['id']}", headers=admin).status_code == 204
    used = client.get("/api/topics").json()[0]["categories"][0]["id"]
    assert client.delete(f"/api/admin/categories/{used}", headers=admin).status_code == 409


def test_audit_log_records_actions(client, admin):
    entries = client.get("/api/admin/audit", params={"limit": 500}, headers=admin).json()
    assert {"article.create", "article.published", "comment.hidden"} <= {e["action"] for e in entries}
    assert all(e["created_at"] for e in entries)


def test_comment_moderation_list(client, admin):
    hidden = client.get("/api/admin/comments", params={"status": "hidden"}, headers=admin).json()
    assert hidden and all(c["status"] == "hidden" for c in hidden)
