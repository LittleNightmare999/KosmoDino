"""Публичный каталог: разделы, категории, статьи, хронология и граф знаний."""
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..config import get_settings
from ..database import get_db
from ..deps import get_optional_user
from ..models import Article, ArticleLink, ArticleStatus, Tag, Topic, User, article_tags
from ..schemas import ArticleCard, ArticleDetail, GraphEdge, GraphNode, GraphOut, Page, TopicOut
from ..services import articles as svc
from ..services import views
from ..services.cache import ttl_cache

router = APIRouter(prefix="/api", tags=["catalog"])


@router.get("/topics", response_model=list[TopicOut])
@ttl_cache(seconds=30)
def topics(db: Session = Depends(get_db)):
    counts = dict(
        db.execute(
            select(Article.topic_id, func.count())
            .where(Article.status == ArticleStatus.PUBLISHED)
            .group_by(Article.topic_id)
        ).all()
    )
    out = []
    for t in db.scalars(select(Topic).order_by(Topic.id)):
        item = TopicOut.model_validate(t)
        item.article_count = counts.get(t.id, 0)
        out.append(item)
    return out


@router.get("/tags", response_model=list[dict])
def tags(topic: str | None = None, db: Session = Depends(get_db)):
    stmt = (
        select(Tag.name, func.count())
        .join(article_tags, article_tags.c.tag_id == Tag.id)
        .join(Article, Article.id == article_tags.c.article_id)
        .where(Article.status == ArticleStatus.PUBLISHED)
    )
    if topic:
        stmt = stmt.join(Topic, Topic.id == Article.topic_id).where(Topic.slug == topic)
    rows = db.execute(stmt.group_by(Tag.name).order_by(func.count().desc(), Tag.name).limit(40)).all()
    return [{"name": n, "count": c} for n, c in rows]


@router.get("/articles", response_model=Page[ArticleCard])
@ttl_cache(seconds=15)
def list_articles(
    q: str | None = Query(default=None, max_length=100),
    topic: str | None = None,
    category: str | None = None,
    tag: str | None = None,
    sort: str = Query(default="recent", pattern="^(recent|popular|timeline|title|relevance)$"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=12, ge=1),
    db: Session = Depends(get_db),
):
    page_size = min(page_size, get_settings().page_size_max)
    items, total = svc.search_published(
        db, q=q, topic=topic, category=category, tag=tag, sort=sort, page=page, page_size=page_size
    )
    return Page[ArticleCard](items=[svc.to_card(a) for a in items], total=total, page=page, page_size=page_size)


@ttl_cache(seconds=15)
def _public_detail(slug: str, db: Session):
    """Карточка опубликованной статьи для гостей — общая для всех, поэтому кэшируется."""
    a = svc.get_by_slug(db, slug)
    if a.status != ArticleStatus.PUBLISHED:
        return None
    pending, seen = views.snapshot(a.id)
    return svc.to_detail(db, a, None), a.views + pending, seen


@router.get("/articles/{slug}", response_model=ArticleDetail)
def article(slug: str, db: Session = Depends(get_db), user: User | None = Depends(get_optional_user)):
    if user is None:
        hit = _public_detail(slug=slug, db=db)
        if hit is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Статья не найдена")
        detail, base, seen_at_build = hit
        views.add(detail.id)
        # счётчик монотонно растёт и между обновлениями кэша
        return detail.model_copy(update={"views": base + views.seen(detail.id) - seen_at_build})

    a = svc.get_by_slug(db, slug)
    if not svc.can_view(a, user):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Статья не найдена")
    detail = svc.to_detail(db, a, user)
    if a.status == ArticleStatus.PUBLISHED:
        # просмотр копится в буфере и сбрасывается в БД пакетно (services/views.py)
        detail.views = a.views + views.add(a.id)
    return detail


@router.get("/timeline/{topic_slug}", response_model=list[ArticleCard])
@ttl_cache(seconds=30)
def timeline(topic_slug: str, db: Session = Depends(get_db)):
    stmt = (
        svc.card_query()
        .join(Topic, Topic.id == Article.topic_id)
        .where(
            Topic.slug == topic_slug,
            Article.status == ArticleStatus.PUBLISHED,
            Article.timeline_value.is_not(None),
        )
        .order_by(Article.timeline_value)
    )
    return [svc.to_card(a) for a in db.scalars(stmt)]


@router.get("/graph", response_model=GraphOut)
@ttl_cache(seconds=30)
def graph(topic: str | None = None, db: Session = Depends(get_db)):
    stmt = svc.card_query().where(Article.status == ArticleStatus.PUBLISHED)
    if topic:
        stmt = stmt.join(Topic, Topic.id == Article.topic_id).where(Topic.slug == topic)
    arts = list(db.scalars(stmt))
    ids = {a.id for a in arts}
    links = db.scalars(
        select(ArticleLink).where(ArticleLink.source_id.in_(ids), ArticleLink.target_id.in_(ids))
    )
    return GraphOut(
        nodes=[
            GraphNode(id=a.id, slug=a.slug, title=a.title, topic_slug=a.topic.slug, category_name=a.category.name)
            for a in arts
        ],
        edges=[GraphEdge(source=l.source_id, target=l.target_id, relation=l.relation) for l in links],
    )
