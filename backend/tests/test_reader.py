"""Раздел читателя: комментарии, закладки, викторины."""


def test_comments_flow(client, reader, admin):
    r = client.post("/api/articles/sun/comments", json={"body": "Очень познавательно!"}, headers=reader)
    assert r.status_code == 201
    cid = r.json()["id"]
    assert any(c["id"] == cid for c in client.get("/api/articles/sun/comments").json())

    client.patch(f"/api/admin/comments/{cid}", json={"status": "hidden"}, headers=admin)
    assert all(c["id"] != cid for c in client.get("/api/articles/sun/comments").json())


def test_hidden_seed_comment_not_public(client):
    bodies = [c["body"] for c in client.get("/api/articles/triceratops/comments").json()]
    assert not any("реклама" in b for b in bodies)


def test_comment_requires_auth_and_foreign_delete_forbidden(client, reader):
    assert client.post("/api/articles/sun/comments", json={"body": "Гость"}).status_code == 401
    comments = client.get("/api/articles/tyrannosaurus/comments").json()
    foreign = next(c for c in comments if c["user"]["username"] == "reader2")
    assert client.delete(f"/api/comments/{foreign['id']}", headers=reader).status_code == 403


def test_bookmarks(client, reader):
    assert client.put("/api/me/bookmarks/saturn", headers=reader).status_code == 204
    assert client.put("/api/me/bookmarks/saturn", headers=reader).status_code == 204  # идемпотентно
    assert client.get("/api/articles/saturn", headers=reader).json()["bookmarked"] is True
    assert "saturn" in [a["slug"] for a in client.get("/api/me/bookmarks", headers=reader).json()]
    client.delete("/api/me/bookmarks/saturn", headers=reader)
    assert "saturn" not in [a["slug"] for a in client.get("/api/me/bookmarks", headers=reader).json()]


def test_quiz_hides_answers_and_scores(client, reader):
    questions = client.get("/api/quiz/space", params={"count": 5}).json()
    assert len(questions) == 5
    assert all("correct_index" not in q for q in questions)
    answers = [{"question_id": q["id"], "selected_index": 0} for q in questions]
    r = client.post("/api/quiz/submit", json={"topic_slug": "space", "answers": answers}, headers=reader).json()
    assert r["total"] == 5 and r["score"] == sum(i["correct"] for i in r["items"])
    assert client.get("/api/me/quiz-attempts", headers=reader).json()[0]["total"] == 5


def test_quiz_rejects_foreign_topic_questions(client, reader):
    q = client.get("/api/quiz/dinosaurs", params={"count": 1}).json()[0]
    body = {"topic_slug": "space", "answers": [{"question_id": q["id"], "selected_index": 0}]}
    assert client.post("/api/quiz/submit", json=body, headers=reader).status_code == 422


def test_my_stats(client, reader):
    s = client.get("/api/me/stats", headers=reader).json()
    assert s["bookmarks"] >= 5 and s["quiz_attempts"] >= 3
