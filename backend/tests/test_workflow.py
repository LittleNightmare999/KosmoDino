"""Сквозной сценарий жизненного цикла статьи и разграничение прав (RBAC)."""
from tests.conftest import article_payload


def test_reader_cannot_write_or_moderate(client, reader, space_category, unique):
    r = client.post("/api/editor/articles", json=article_payload(unique("r"), space_category), headers=reader)
    assert r.status_code == 403
    assert client.get("/api/admin/stats", headers=reader).status_code == 403
    r = client.post("/api/admin/articles/uranus/review", json={"approve": True}, headers=reader)
    assert r.status_code == 403


def test_guest_gets_401(client):
    assert client.get("/api/admin/stats").status_code == 401


def test_full_lifecycle(client, editor, admin, space_category, unique):
    slug = unique("life")
    r = client.post("/api/editor/articles", json=article_payload(slug, space_category), headers=editor)
    assert r.status_code == 201 and r.json()["status"] == "draft"
    assert r.json()["tags"] == ["проверка", "тест"]  # нормализация и удаление дублей

    # черновик не виден гостю
    assert client.get(f"/api/articles/{slug}").status_code == 404

    # редактор не может опубликовать сам
    r = client.post(f"/api/admin/articles/{slug}/review", json={"approve": True}, headers=editor)
    assert r.status_code == 403

    assert client.post(f"/api/editor/articles/{slug}/submit", headers=editor).json()["status"] == "pending"
    # повторная отправка — недопустимый переход
    assert client.post(f"/api/editor/articles/{slug}/submit", headers=editor).status_code == 409

    # отклонение без причины запрещено
    r = client.post(f"/api/admin/articles/{slug}/review", json={"approve": False}, headers=admin)
    assert r.status_code == 422
    r = client.post(f"/api/admin/articles/{slug}/review",
                    json={"approve": False, "note": "Добавьте источники"}, headers=admin)
    assert r.json()["status"] == "rejected"
    assert client.get(f"/api/articles/{slug}", headers=editor).json()["review_note"] == "Добавьте источники"

    # правка отклонённой статьи возвращает её в черновик и создаёт ревизию
    payload = article_payload(slug, space_category, summary="Исправленное описание статьи",
                              revision_comment="Источники")
    assert client.put(f"/api/editor/articles/{slug}", json=payload, headers=editor).json()["status"] == "draft"
    revs = client.get(f"/api/editor/articles/{slug}/revisions", headers=editor).json()
    assert len(revs) == 2 and revs[0]["comment"] == "Источники"

    client.post(f"/api/editor/articles/{slug}/submit", headers=editor)
    r = client.post(f"/api/admin/articles/{slug}/review", json={"approve": True}, headers=admin)
    assert r.json()["status"] == "published" and r.json()["published_at"]
    assert client.get(f"/api/articles/{slug}").status_code == 200

    # опубликованную нельзя удалить, только архивировать
    assert client.delete(f"/api/admin/articles/{slug}", headers=admin).status_code == 409
    assert client.post(f"/api/admin/articles/{slug}/archive", headers=admin).json()["status"] == "archived"
    assert client.get(f"/api/articles/{slug}").status_code == 404
    assert client.delete(f"/api/admin/articles/{slug}", headers=admin).status_code == 204


def test_editor_edit_of_published_requires_review(client, editor):
    d = client.get("/api/articles/mars").json()
    payload = article_payload("mars", d["category_id"], title="Марс", summary=d["summary"],
                              content=d["content"], facts=d["facts"], tags=d["tags"])
    r = client.put("/api/editor/articles/mars", json=payload, headers=editor)
    assert r.status_code == 200 and r.json()["status"] == "pending"


def test_editor_cannot_edit_foreign_article(client, editor, space_category):
    # статья tyrannosaurus принадлежит editor2
    r = client.put("/api/editor/articles/tyrannosaurus",
                   json=article_payload("tyrannosaurus", space_category), headers=editor)
    assert r.status_code == 403


def test_slug_conflict(client, editor, space_category):
    r = client.post("/api/editor/articles", json=article_payload("sun", space_category), headers=editor)
    assert r.status_code == 409


def test_links_and_quiz_management(client, editor, space_category, unique):
    slug = unique("lnk")
    client.post("/api/editor/articles", json=article_payload(slug, space_category), headers=editor)
    link = {"target_slug": "sun", "relation": "изучает"}
    assert client.post(f"/api/editor/articles/{slug}/links", json=link, headers=editor).status_code == 201
    assert client.post(f"/api/editor/articles/{slug}/links", json=link, headers=editor).status_code == 409
    self_link = {"target_slug": slug, "relation": "сам"}
    assert client.post(f"/api/editor/articles/{slug}/links", json=self_link, headers=editor).status_code == 422
    assert client.delete(f"/api/editor/articles/{slug}/links/sun", headers=editor).status_code == 204

    bad = {"question": "Сколько?", "options": ["1", "2"], "correct_index": 5}
    assert client.post(f"/api/editor/articles/{slug}/quiz", json=bad, headers=editor).status_code == 422
    good = {"question": "Сколько планет?", "options": ["7", "8"], "correct_index": 1}
    qid = client.post(f"/api/editor/articles/{slug}/quiz", json=good, headers=editor).json()["id"]
    assert len(client.get(f"/api/editor/articles/{slug}/quiz", headers=editor).json()) == 1
    assert client.delete(f"/api/editor/quiz/{qid}", headers=editor).status_code == 204
