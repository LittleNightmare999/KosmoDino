"""Заполнение базы данных тестовыми данными.

Запуск:  python -m app.seed.seed            — создать схему и наполнить, если база пуста
         python -m app.seed.seed --reset    — пересоздать схему и наполнить заново

Учётные записи (пароль у всех — password123):
    alice    — системный администратор
    editor1  — редактор раздела «Космос»
    editor2  — редактор раздела «Динозавры»
    reader1  — читатель
    reader2  — читатель
"""
import random
import sys
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..database import Base, SessionLocal, engine
from ..models import (
    Article,
    ArticleFact,
    ArticleLink,
    ArticleRevision,
    ArticleStatus,
    AuditLog,
    Bookmark,
    Category,
    Comment,
    CommentStatus,
    QuizAttempt,
    QuizQuestion,
    Role,
    Tag,
    Topic,
    User,
)
from ..security import hash_password
from . import data_dino, data_space

PASSWORD = "password123"

USERS = [
    ("alice", "alice@cosmodino.local", "Алиса Администратор", Role.ADMIN),
    ("editor1", "editor1@cosmodino.local", "Игорь Звёздный", Role.EDITOR),
    ("editor2", "editor2@cosmodino.local", "Мария Палеонтова", Role.EDITOR),
    ("reader1", "reader1@cosmodino.local", "Пётр Читатель", Role.READER),
    ("reader2", "reader2@cosmodino.local", "Ольга Любознательная", Role.READER),
]

COMMENTS = [
    ("tyrannosaurus", "reader1", "Не знал, что Сью нашла женщина, а скелет назвали в её честь. Отличная статья!"),
    ("tyrannosaurus", "reader2", "А есть данные, насколько быстро бегал тираннозавр? Было бы интересно добавить."),
    ("velociraptor", "reader2", "После фильмов совсем другое представление было. Спасибо за разбор."),
    ("mars", "reader1", "Сравнение долины Маринер с расстоянием Москва — Новосибирск очень наглядное."),
    ("jwst", "reader1", "Про раскрытие зеркала — это действительно инженерное чудо."),
    ("jwst", "reader2", "Хотелось бы раздел про экзопланеты, которые уже изучил телескоп."),
    ("kpg-extinction", "reader1", "Интересная связь с разделом «Космос» — астероид же оттуда :)"),
    ("vostok-1", "reader2", "Поехали! Хорошо, что указано точное место посадки."),
    ("saturn", "reader1", "Плавающий в ванне Сатурн — любимый факт моего сына."),
    ("diplodocus", "reader2", "Видела Диппи в Зоологическом музее, действительно огромный!"),
    ("triceratops", "reader1", "реклама: купите курсы по палеонтологии"),  # будет скрыт модератором
]


def _ensure_users(db: Session) -> dict[str, User]:
    users = {u.username: u for u in db.scalars(select(User))}
    for username, email, full_name, role in USERS:
        u = users.get(username)
        if u is None:
            u = User(username=username, email=email, full_name=full_name, role=role,
                     password_hash=hash_password(PASSWORD))
            db.add(u)
            users[username] = u
        elif username in ("alice", "reader1"):
            # обязательные учётные записи из задания: роль и пароль гарантированы
            u.role = role
            u.is_active = True
            u.password_hash = hash_password(PASSWORD)
    db.flush()
    return users


def _seed_topic(db, module, users, editor, rng, base_time, tag_cache, slug_to_article):
    topic = Topic(**module.TOPIC)
    db.add(topic)
    db.flush()
    cats = {}
    for i, (slug, name, desc) in enumerate(module.CATEGORIES):
        c = Category(topic_id=topic.id, slug=slug, name=name, description=desc, sort_order=i)
        db.add(c)
        cats[slug] = c
    db.flush()

    def tags_for(names):
        out = []
        for n in names:
            if n not in tag_cache:
                tag_cache[n] = Tag(name=n)
                db.add(tag_cache[n])
            out.append(tag_cache[n])
        return out

    entries = [(d, ArticleStatus.PUBLISHED) for d in module.ARTICLES] + [
        (d, ArticleStatus(d["status"])) for d in module.WORKFLOW_ARTICLES
    ]
    for idx, (d, status) in enumerate(entries):
        created = base_time + timedelta(days=idx * 2, hours=rng.randint(0, 20))
        a = Article(
            slug=d["slug"], title=d["title"], summary=d["summary"], content=d["content"],
            topic_id=topic.id, category_id=cats[d["category"]].id, author_id=editor.id, status=status,
            era_label=d.get("era", ""), timeline_value=d.get("tl"), review_note=d.get("review_note", ""),
            views=rng.randint(40, 900) if status == ArticleStatus.PUBLISHED else 0,
            created_at=created, updated_at=created + timedelta(days=1),
            published_at=created + timedelta(days=1) if status == ArticleStatus.PUBLISHED else None,
        )
        a.facts = [ArticleFact(label=l, value=v, sort_order=i) for i, (l, v) in enumerate(d["facts"])]
        a.tags = tags_for(d["tags"])
        for q, opts, correct, expl in d.get("quiz", []):
            a.quiz_questions.append(QuizQuestion(question=q, options=opts, correct_index=correct, explanation=expl))
        db.add(a)
        db.flush()
        db.add(ArticleRevision(article_id=a.id, editor_id=editor.id, title=a.title, summary=a.summary,
                               content=a.content, comment="Первая версия статьи", created_at=created))
        db.add(AuditLog(actor_id=editor.id, action="article.create", entity="article", entity_id=a.id,
                        details=a.title, created_at=created))
        if status in (ArticleStatus.PUBLISHED, ArticleStatus.REJECTED):
            db.add(AuditLog(actor_id=users["alice"].id, action=f"article.{status.value}", entity="article",
                            entity_id=a.id, details=f"pending → {status.value}: {a.title}",
                            created_at=created + timedelta(days=1)))
        slug_to_article[a.slug] = a
    return topic


def seed(db: Session) -> None:
    users = _ensure_users(db)
    if db.scalar(select(Topic.id).limit(1)):
        db.commit()
        print("База уже заполнена — обновлены только обязательные учётные записи.")
        return

    rng = random.Random(2026)
    base_time = datetime(2026, 3, 1, 10, 0, tzinfo=UTC)
    tag_cache: dict[str, Tag] = {}
    slugs: dict[str, Article] = {}
    topics = {
        "space": _seed_topic(db, data_space, users, users["editor1"], rng, base_time, tag_cache, slugs),
        "dinosaurs": _seed_topic(db, data_dino, users, users["editor2"], rng, base_time + timedelta(hours=5),
                                 tag_cache, slugs),
    }
    for src, dst, rel in data_space.LINKS + data_dino.LINKS:
        db.add(ArticleLink(source_id=slugs[src].id, target_id=slugs[dst].id, relation=rel))

    for i, (slug, username, body) in enumerate(COMMENTS):
        hidden = "реклама" in body
        db.add(Comment(article_id=slugs[slug].id, user_id=users[username].id, body=body,
                       status=CommentStatus.HIDDEN if hidden else CommentStatus.VISIBLE,
                       created_at=base_time + timedelta(days=50 + i)))
        if hidden:
            db.add(AuditLog(actor_id=users["alice"].id, action="comment.hidden", entity="comment",
                            details=body[:80], created_at=base_time + timedelta(days=50 + i, hours=2)))

    for username, slug_list in {
        "reader1": ["tyrannosaurus", "mars", "jwst", "kpg-extinction", "andromeda"],
        "reader2": ["velociraptor", "saturn", "diplodocus"],
    }.items():
        for slug in slug_list:
            db.add(Bookmark(user_id=users[username].id, article_id=slugs[slug].id))

    for username, topic_slug, score, total, day in [
        ("reader1", "space", 6, 8, 60), ("reader1", "dinosaurs", 7, 8, 62),
        ("reader1", "space", 8, 8, 70), ("reader2", "dinosaurs", 5, 8, 65),
    ]:
        db.add(QuizAttempt(user_id=users[username].id, topic_id=topics[topic_slug].id, score=score, total=total,
                           created_at=base_time + timedelta(days=day)))
    db.commit()
    n = db.query(Article).count()
    print(f"Готово: {len(users)} пользователей, {n} статей, {len(tag_cache)} тегов.")


def main() -> None:
    if "--reset" in sys.argv:
        Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    with SessionLocal() as db:
        seed(db)


if __name__ == "__main__":
    main()
