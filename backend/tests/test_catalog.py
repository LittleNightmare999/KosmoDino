"""Публичный каталог: разделы, поиск, фильтры, хронология, граф."""


def test_two_topics_with_categories(client):
    topics = {t["slug"]: t for t in client.get("/api/topics").json()}
    assert set(topics) == {"space", "dinosaurs"}
    assert topics["space"]["article_count"] >= 20
    assert len(topics["dinosaurs"]["categories"]) == 5


def test_pagination(client):
    r = client.get("/api/articles", params={"page_size": 5, "page": 2}).json()
    assert len(r["items"]) == 5 and r["page"] == 2 and r["total"] >= 40


def test_page_size_capped(client):
    r = client.get("/api/articles", params={"page_size": 1000}).json()
    assert r["page_size"] == 50


def test_only_published_listed(client):
    items = client.get("/api/articles", params={"page_size": 50}).json()["items"]
    assert all(i["status"] == "published" for i in items)
    assert "uranus" not in {i["slug"] for i in items}


def test_full_text_search_russian_morphology(client):
    # словоформа «астероида» находит статью, где встречается «астероид»
    slugs = [i["slug"] for i in client.get("/api/articles", params={"q": "астероида"}).json()["items"]]
    assert "kpg-extinction" in slugs


def test_filter_by_topic_category_and_tag(client):
    r = client.get("/api/articles", params={"topic": "dinosaurs", "category": "theropods"}).json()
    assert r["total"] == 6 and all(i["topic_slug"] == "dinosaurs" for i in r["items"])
    r = client.get("/api/articles", params={"tag": "газовый гигант"}).json()
    assert {i["slug"] for i in r["items"]} == {"jupiter", "saturn"}


def test_article_detail_and_views(client):
    first = client.get("/api/articles/tyrannosaurus").json()
    second = client.get("/api/articles/tyrannosaurus").json()
    assert second["views"] == first["views"] + 1
    assert first["facts"][0]["label"] == "Вид"
    assert any(l["slug"] == "triceratops" for l in first["links"])
    assert first["quiz_count"] == 2


def test_unpublished_hidden_from_guest(client, admin):
    assert client.get("/api/articles/uranus").status_code == 404
    assert client.get("/api/articles/uranus", headers=admin).status_code == 200


def test_unknown_article(client):
    assert client.get("/api/articles/no-such").status_code == 404


def test_timeline_sorted(client):
    items = client.get("/api/timeline/dinosaurs").json()
    values = [i["timeline_value"] for i in items]
    assert values == sorted(values) and values[0] == -252


def test_graph_edges_reference_nodes(client):
    g = client.get("/api/graph").json()
    ids = {n["id"] for n in g["nodes"]}
    assert g["edges"] and all(e["source"] in ids and e["target"] in ids for e in g["edges"])
    space = client.get("/api/graph", params={"topic": "space"}).json()
    assert all(n["topic_slug"] == "space" for n in space["nodes"])


def test_tags(client):
    tags = client.get("/api/tags", params={"topic": "dinosaurs"}).json()
    assert tags[0]["count"] >= tags[-1]["count"]


def test_health(client):
    assert client.get("/api/health").json() == {"status": "ok"}
