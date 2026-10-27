"""Бизнес-логика статей: видимость, жизненный цикл (рецензирование), ревизии, поиск."""
from datetime import UTC, datetime

from fastapi import HTTPException, status
from sqlalchemy import func, literal_column, or_, select
from sqlalchemy.orm import Session, selectinload

from ..models import (
    Article,
    ArticleFact,
    ArticleLink,
    ArticleRevision,
    ArticleStatus,
    Bookmark,
    Category,
    QuizQuestion,
    Role,
    Tag,
    Topic,
    User,
)
from ..schemas import ArticleCard, ArticleDetail, ArticleIn, AuthorOut, FactIO, LinkOut
from .audit import log_action
from .cache import invalidate_all

# Допустимые переходы жизненного цикла статьи: (из, в) -> кто может выполнить
TRANSITIONS: dict[tuple[ArticleStatus, ArticleStatus], set[Role]] = {
    (ArticleStatus.DRAFT, ArticleStatus.PENDING): {Role.EDITOR, Role.ADMIN},
    (ArticleStatus.REJECTED, ArticleStatus.PENDING): {Role.EDITOR, Role.ADMIN},
    (ArticleStatus.PENDING, ArticleStatus.PUBLISHED): {Role.ADMIN},
    (ArticleStatus.PENDING, ArticleStatus.REJECTED): {Role.ADMIN},
    (ArticleStatus.PUBLISHED, ArticleStatus.ARCHIVED): {Role.ADMIN},
    (ArticleStatus.ARCHIVED, ArticleStatus.PUBLISHED): {Role.ADMIN},
}


# Выражение совпадает с индексом ix_articles_fts, чтобы планировщик использовал GIN-индекс
FTS_DOCUMENT = literal_column(
    "to_tsvector('russian', articles.title || ' ' || articles.summary || ' ' || articles.content)"
)


def can_transition(src: ArticleStatus, dst: ArticleStatus, role: Role) -> bool:
    return role in TRANSITIONS.get((src, dst), set())


def to_card(a: Article) -> ArticleCard:
    return ArticleCard(
        id=a.id,
        slug=a.slug,
        title=a.title,
        summary=a.summary,
        status=a.status,
        era_label=a.era_label,
        timeline_value=a.timeline_value,
        views=a.views,
        updated_at=a.updated_at,
        published_at=a.published_at,
        topic_slug=a.topic.slug,
        category_name=a.category.name,
        category_slug=a.category.slug,
    )


def card_query():
    return select(Article).options(selectinload(Article.topic), selectinload(Article.category))


def can_view(a: Article, user: User | None) -> bool:
    if a.status == ArticleStatus.PUBLISHED:
        return True
    if user is None:
        return False
    return user.role == Role.ADMIN or a.author_id == user.id


def can_edit(a: Article, user: User) -> bool:
    if user.role == Role.ADMIN:
        return True
    return user.role == Role.EDITOR and a.author_id == user.id


def get_by_slug(db: Session, slug: str) -> Article:
    a = db.scalar(
        select(Article)
        .where(Article.slug == slug)
        .options(
            selectinload(Article.topic),
            selectinload(Article.category),
            selectinload(Article.author),
            selectinload(Article.facts),
            selectinload(Article.tags),
        )
    )
    if a is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Статья не найдена")
    return a


def links_for(db: Session, a: Article) -> list[LinkOut]:
    out: list[LinkOut] = []
    rows = db.execute(
        select(ArticleLink.relation, Article.slug, Article.title)
        .join(Article, Article.id == ArticleLink.target_id)
        .where(ArticleLink.source_id == a.id, Article.status == ArticleStatus.PUBLISHED)
    ).all()
    out += [LinkOut(slug=s, title=t, relation=r, direction="out") for r, s, t in rows]
    rows = db.execute(
        select(ArticleLink.relation, Article.slug, Article.title)
        .join(Article, Article.id == ArticleLink.source_id)
        .where(ArticleLink.target_id == a.id, Article.status == ArticleStatus.PUBLISHED)
    ).all()
    out += [LinkOut(slug=s, title=t, relation=r, direction="in") for r, s, t in rows]
    return out


def to_detail(db: Session, a: Article, user: User | None) -> ArticleDetail:
    card = to_card(a)
    bookmarked = False
    if user is not None:
        bookmarked = db.get(Bookmark, (user.id, a.id)) is not None
    quiz_count = db.scalar(
        select(func.count()).select_from(QuizQuestion).where(QuizQuestion.article_id == a.id)
    )
    return ArticleDetail(
        **card.model_dump(),
        content=a.content,
        review_note=a.review_note if user and can_edit(a, user) else "",
        topic_id=a.topic_id,
        category_id=a.category_id,
        author=AuthorOut.model_validate(a.author) if a.author else None,
        facts=[FactIO.model_validate(f) for f in a.facts],
        tags=[t.name for t in a.tags],
        links=links_for(db, a),
        bookmarked=bookmarked,
        quiz_count=quiz_count or 0,
    )


def search_published(
    db: Session,
    *,
    q: str | None,
    topic: str | None,
    category: str | None,
    tag: str | None,
    sort: str,
    page: int,
    page_size: int,
) -> tuple[list[Article], int]:
    stmt = card_query().where(Article.status == ArticleStatus.PUBLISHED)
    if topic:
        stmt = stmt.join(Topic, Topic.id == Article.topic_id).where(Topic.slug == topic)
    if category:
        stmt = stmt.join(Category, Category.id == Article.category_id).where(Category.slug == category)
    if tag:
        stmt = stmt.where(Article.tags.any(Tag.name == tag.lower()))
    rank = None
    if q:
        doc = FTS_DOCUMENT
        query = func.websearch_to_tsquery(literal_column("'russian'"), q)
        # полнотекстовый поиск по GIN-индексу + подстрочный поиск по заголовку
        stmt = stmt.where(or_(doc.op("@@")(query), Article.title.ilike(f"%{q}%")))
        rank = func.ts_rank(doc, query)

    total = db.scalar(select(func.count()).select_from(stmt.order_by(None).subquery())) or 0
    if sort == "popular":
        stmt = stmt.order_by(Article.views.desc(), Article.id)
    elif sort == "timeline":
        stmt = stmt.order_by(Article.timeline_value.asc().nulls_last(), Article.id)
    elif sort == "title":
        stmt = stmt.order_by(Article.title)
    elif rank is not None:
        stmt = stmt.order_by(rank.desc(), Article.id)
    else:
        stmt = stmt.order_by(Article.published_at.desc().nulls_last(), Article.id.desc())
    items = db.scalars(stmt.offset((page - 1) * page_size).limit(page_size)).all()
    return list(items), total


def _get_or_create_tags(db: Session, names: list[str]) -> list[Tag]:
    if not names:
        return []
    existing = {t.name: t for t in db.scalars(select(Tag).where(Tag.name.in_(names)))}
    tags = []
    for n in names:
        t = existing.get(n)
        if t is None:
            t = Tag(name=n)
            db.add(t)
        tags.append(t)
    return tags


def _apply(db: Session, a: Article, data: ArticleIn) -> None:
    cat = db.get(Category, data.category_id)
    if cat is None:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Категория не найдена")
    clash = db.scalar(select(Article.id).where(Article.slug == data.slug, Article.id != (a.id or 0)))
    if clash:
        raise HTTPException(status.HTTP_409_CONFLICT, "Статья с таким адресом уже существует")
    a.title = data.title
    a.slug = data.slug
    a.summary = data.summary
    a.content = data.content
    a.category_id = cat.id
    a.topic_id = cat.topic_id
    a.era_label = data.era_label
    a.timeline_value = data.timeline_value
    a.facts = [ArticleFact(label=f.label, value=f.value, sort_order=i) for i, f in enumerate(data.facts)]
    a.tags = _get_or_create_tags(db, data.tags)


def _snapshot(db: Session, a: Article, user: User, comment: str) -> None:
    db.add(
        ArticleRevision(
            article_id=a.id,
            editor_id=user.id,
            title=a.title,
            summary=a.summary,
            content=a.content,
            comment=comment,
        )
    )


def create_article(db: Session, data: ArticleIn, user: User) -> Article:
    a = Article(author_id=user.id, status=ArticleStatus.DRAFT)
    _apply(db, a, data)
    db.add(a)
    db.flush()
    _snapshot(db, a, user, data.revision_comment or "Создание статьи")
    log_action(db, user, "article.create", "article", a.id, a.title)
    db.commit()
    return get_by_slug(db, a.slug)


def update_article(db: Session, a: Article, data: ArticleIn, user: User) -> Article:
    if not can_edit(a, user):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Редактировать может автор или администратор")
    _apply(db, a, data)
    # правка опубликованной статьи редактором отправляет её на повторное рецензирование
    if user.role != Role.ADMIN and a.status in (ArticleStatus.PUBLISHED, ArticleStatus.REJECTED):
        a.status = ArticleStatus.DRAFT if a.status == ArticleStatus.REJECTED else ArticleStatus.PENDING
    a.updated_at = datetime.now(UTC)
    _snapshot(db, a, user, data.revision_comment or "Правка")
    log_action(db, user, "article.update", "article", a.id, a.title)
    db.commit()
    invalidate_all()
    return get_by_slug(db, a.slug)


def change_status(db: Session, a: Article, dst: ArticleStatus, user: User, note: str = "") -> Article:
    if not can_transition(a.status, dst, user.role):
        raise HTTPException(
            status.HTTP_409_CONFLICT, f"Переход {a.status.value} → {dst.value} недопустим"
        )
    if user.role == Role.EDITOR and a.author_id != user.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Можно отправлять только свои статьи")
    src = a.status
    a.status = dst
    if dst == ArticleStatus.PUBLISHED and a.published_at is None:
        a.published_at = datetime.now(UTC)
    if dst in (ArticleStatus.REJECTED, ArticleStatus.PUBLISHED):
        a.review_note = note
    log_action(db, user, f"article.{dst.value}", "article", a.id, f"{src.value} → {dst.value}: {a.title}")
    db.commit()
    invalidate_all()
    return get_by_slug(db, a.slug)
