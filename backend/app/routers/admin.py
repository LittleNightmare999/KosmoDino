"""Панель системного администратора: модерация, пользователи, справочники, аудит, статистика."""
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from ..database import get_db
from ..deps import require_admin
from ..models import (
    Article,
    ArticleStatus,
    AuditLog,
    Bookmark,
    Category,
    Comment,
    CommentStatus,
    QuizAttempt,
    Role,
    Topic,
    User,
)
from ..schemas import (
    ArticleCard,
    ArticleDetail,
    AuditOut,
    CategoryIn,
    CategoryOut,
    CommentAdminOut,
    CommentModerate,
    Page,
    ReviewIn,
    StatsOut,
    UserAdminUpdate,
    UserOut,
)
from ..services import articles as svc
from ..services.audit import log_action
from ..services.cache import invalidate_all

router = APIRouter(prefix="/api/admin", tags=["admin"])


@router.get("/stats", response_model=StatsOut)
def stats(_: User = Depends(require_admin), db: Session = Depends(get_db)):
    def grouped(col, model):
        return {str(k.value if hasattr(k, "value") else k): v
                for k, v in db.execute(select(col, func.count()).select_from(model).group_by(col)).all()}

    by_topic = dict(
        db.execute(
            select(Topic.name, func.count(Article.id))
            .join(Article, Article.topic_id == Topic.id)
            .where(Article.status == ArticleStatus.PUBLISHED)
            .group_by(Topic.name)
        ).all()
    )
    top = db.scalars(
        svc.card_query().where(Article.status == ArticleStatus.PUBLISHED).order_by(Article.views.desc()).limit(5)
    )
    return StatsOut(
        users_total=db.scalar(select(func.count()).select_from(User)) or 0,
        users_by_role=grouped(User.role, User),
        articles_by_status=grouped(Article.status, Article),
        articles_by_topic=by_topic,
        comments_total=db.scalar(select(func.count()).select_from(Comment)) or 0,
        comments_hidden=db.scalar(
            select(func.count()).select_from(Comment).where(Comment.status == CommentStatus.HIDDEN)
        ) or 0,
        quiz_attempts=db.scalar(select(func.count()).select_from(QuizAttempt)) or 0,
        bookmarks_total=db.scalar(select(func.count()).select_from(Bookmark)) or 0,
        top_articles=[svc.to_card(a) for a in top],
    )


# ---------- Статьи и модерация ----------

@router.get("/articles", response_model=Page[ArticleCard])
def all_articles(
    status_: ArticleStatus | None = Query(default=None, alias="status"),
    q: str | None = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    stmt = svc.card_query()
    if status_:
        stmt = stmt.where(Article.status == status_)
    if q:
        stmt = stmt.where(Article.title.ilike(f"%{q}%"))
    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    items = db.scalars(stmt.order_by(Article.updated_at.desc(), Article.id.desc())
                       .offset((page - 1) * page_size).limit(page_size))
    return Page[ArticleCard](items=[svc.to_card(a) for a in items], total=total, page=page, page_size=page_size)


@router.post("/articles/{slug}/review", response_model=ArticleDetail)
def review(slug: str, data: ReviewIn, user: User = Depends(require_admin), db: Session = Depends(get_db)):
    a = svc.get_by_slug(db, slug)
    if not data.approve and not data.note.strip():
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Укажите причину отклонения")
    dst = ArticleStatus.PUBLISHED if data.approve else ArticleStatus.REJECTED
    return svc.to_detail(db, svc.change_status(db, a, dst, user, data.note), user)


@router.post("/articles/{slug}/archive", response_model=ArticleDetail)
def archive(slug: str, user: User = Depends(require_admin), db: Session = Depends(get_db)):
    a = svc.get_by_slug(db, slug)
    return svc.to_detail(db, svc.change_status(db, a, ArticleStatus.ARCHIVED, user), user)


@router.post("/articles/{slug}/restore", response_model=ArticleDetail)
def restore(slug: str, user: User = Depends(require_admin), db: Session = Depends(get_db)):
    a = svc.get_by_slug(db, slug)
    return svc.to_detail(db, svc.change_status(db, a, ArticleStatus.PUBLISHED, user), user)


@router.delete("/articles/{slug}", status_code=status.HTTP_204_NO_CONTENT)
def delete_article(slug: str, user: User = Depends(require_admin), db: Session = Depends(get_db)):
    a = svc.get_by_slug(db, slug)
    if a.status == ArticleStatus.PUBLISHED:
        raise HTTPException(status.HTTP_409_CONFLICT, "Опубликованную статью сначала переведите в архив")
    log_action(db, user, "article.delete", "article", a.id, a.title)
    db.delete(a)
    db.commit()
    invalidate_all()


# ---------- Пользователи ----------

@router.get("/users", response_model=Page[UserOut])
def users(
    q: str | None = None,
    role: Role | None = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    stmt = select(User)
    if q:
        stmt = stmt.where(User.username.ilike(f"%{q}%") | User.email.ilike(f"%{q}%") | User.full_name.ilike(f"%{q}%"))
    if role:
        stmt = stmt.where(User.role == role)
    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    items = db.scalars(stmt.order_by(User.id).offset((page - 1) * page_size).limit(page_size))
    return Page[UserOut](items=[UserOut.model_validate(u) for u in items], total=total, page=page, page_size=page_size)


@router.patch("/users/{user_id}", response_model=UserOut)
def update_user(user_id: int, data: UserAdminUpdate, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    u = db.get(User, user_id)
    if u is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Пользователь не найден")
    if u.id == admin.id and (data.role not in (None, Role.ADMIN) or data.is_active is False):
        raise HTTPException(status.HTTP_409_CONFLICT, "Нельзя понизить или заблокировать собственную учётную запись")
    changes = []
    if data.role is not None and data.role != u.role:
        changes.append(f"роль {u.role.value} → {data.role.value}")
        u.role = data.role
    if data.is_active is not None and data.is_active != u.is_active:
        changes.append("разблокирован" if data.is_active else "заблокирован")
        u.is_active = data.is_active
    if changes:
        log_action(db, admin, "user.update", "user", u.id, f"{u.username}: {', '.join(changes)}")
    db.commit()
    return u


# ---------- Комментарии ----------

@router.get("/comments", response_model=list[CommentAdminOut])
def all_comments(
    status_: CommentStatus | None = Query(default=None, alias="status"),
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    stmt = select(Comment).options(selectinload(Comment.user), selectinload(Comment.article))
    if status_:
        stmt = stmt.where(Comment.status == status_)
    rows = db.scalars(stmt.order_by(Comment.created_at.desc(), Comment.id.desc()).limit(200))
    return [
        CommentAdminOut(
            id=c.id, body=c.body, status=c.status, created_at=c.created_at, user=c.user,
            article_slug=c.article.slug, article_title=c.article.title,
        )
        for c in rows
    ]


@router.patch("/comments/{comment_id}", status_code=status.HTTP_204_NO_CONTENT)
def moderate_comment(
    comment_id: int, data: CommentModerate, admin: User = Depends(require_admin), db: Session = Depends(get_db)
):
    c = db.get(Comment, comment_id)
    if c is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Комментарий не найден")
    c.status = data.status
    log_action(db, admin, f"comment.{data.status.value}", "comment", c.id, c.body[:80])
    db.commit()


# ---------- Категории ----------

@router.post("/categories", response_model=CategoryOut, status_code=status.HTTP_201_CREATED)
def create_category(data: CategoryIn, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    if db.get(Topic, data.topic_id) is None:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Раздел не найден")
    if db.scalar(select(Category.id).where(Category.topic_id == data.topic_id, Category.slug == data.slug)):
        raise HTTPException(status.HTTP_409_CONFLICT, "Категория с таким адресом уже есть")
    c = Category(**data.model_dump())
    db.add(c)
    db.flush()
    log_action(db, admin, "category.create", "category", c.id, c.name)
    db.commit()
    invalidate_all()
    return c


@router.delete("/categories/{category_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_category(category_id: int, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    c = db.get(Category, category_id)
    if c is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Категория не найдена")
    if db.scalar(select(func.count()).select_from(Article).where(Article.category_id == c.id)):
        raise HTTPException(status.HTTP_409_CONFLICT, "В категории есть статьи")
    log_action(db, admin, "category.delete", "category", c.id, c.name)
    db.delete(c)
    db.commit()
    invalidate_all()


# ---------- Аудит ----------

@router.get("/audit", response_model=list[AuditOut])
def audit(limit: int = Query(default=100, ge=1, le=500), _: User = Depends(require_admin), db: Session = Depends(get_db)):
    stmt = select(AuditLog).options(selectinload(AuditLog.actor)).order_by(AuditLog.id.desc()).limit(limit)
    return list(db.scalars(stmt))
