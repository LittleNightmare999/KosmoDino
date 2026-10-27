"""Рабочее место редактора: собственные статьи, правки, отправка на рецензию, связи, вопросы."""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import require_editor
from ..models import Article, ArticleLink, ArticleRevision, ArticleStatus, QuizQuestion, Role, User
from ..schemas import ArticleCard, ArticleDetail, ArticleIn, LinkIn, QuizQuestionIn, RevisionOut
from ..services import articles as svc
from ..services.audit import log_action
from ..services.cache import invalidate_all

router = APIRouter(prefix="/api/editor", tags=["editor"])


def _editable(db: Session, slug: str, user: User) -> Article:
    a = svc.get_by_slug(db, slug)
    if not svc.can_edit(a, user):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Нет прав на эту статью")
    return a


@router.get("/articles", response_model=list[ArticleCard])
def my_articles(user: User = Depends(require_editor), db: Session = Depends(get_db)):
    stmt = svc.card_query().where(Article.author_id == user.id).order_by(Article.updated_at.desc())
    return [svc.to_card(a) for a in db.scalars(stmt)]


@router.post("/articles", response_model=ArticleDetail, status_code=status.HTTP_201_CREATED)
def create(data: ArticleIn, user: User = Depends(require_editor), db: Session = Depends(get_db)):
    return svc.to_detail(db, svc.create_article(db, data, user), user)


@router.put("/articles/{slug}", response_model=ArticleDetail)
def edit(slug: str, data: ArticleIn, user: User = Depends(require_editor), db: Session = Depends(get_db)):
    a = svc.get_by_slug(db, slug)
    return svc.to_detail(db, svc.update_article(db, a, data, user), user)


@router.post("/articles/{slug}/submit", response_model=ArticleDetail)
def submit(slug: str, user: User = Depends(require_editor), db: Session = Depends(get_db)):
    a = _editable(db, slug, user)
    return svc.to_detail(db, svc.change_status(db, a, ArticleStatus.PENDING, user), user)


@router.get("/articles/{slug}/revisions", response_model=list[RevisionOut])
def revisions(slug: str, user: User = Depends(require_editor), db: Session = Depends(get_db)):
    a = _editable(db, slug, user)
    stmt = (
        select(ArticleRevision)
        .where(ArticleRevision.article_id == a.id)
        .order_by(ArticleRevision.created_at.desc(), ArticleRevision.id.desc())
    )
    return list(db.scalars(stmt))


@router.post("/articles/{slug}/links", status_code=status.HTTP_201_CREATED)
def add_link(slug: str, data: LinkIn, user: User = Depends(require_editor), db: Session = Depends(get_db)):
    a = _editable(db, slug, user)
    target = svc.get_by_slug(db, data.target_slug)
    if target.id == a.id:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Нельзя связать статью саму с собой")
    exists = db.scalar(
        select(ArticleLink.id).where(ArticleLink.source_id == a.id, ArticleLink.target_id == target.id)
    )
    if exists:
        raise HTTPException(status.HTTP_409_CONFLICT, "Связь уже существует")
    db.add(ArticleLink(source_id=a.id, target_id=target.id, relation=data.relation))
    log_action(db, user, "link.create", "article", a.id, f"{a.slug} → {target.slug}")
    db.commit()
    invalidate_all()
    return {"ok": True}


@router.delete("/articles/{slug}/links/{target_slug}", status_code=status.HTTP_204_NO_CONTENT)
def remove_link(slug: str, target_slug: str, user: User = Depends(require_editor), db: Session = Depends(get_db)):
    a = _editable(db, slug, user)
    target = svc.get_by_slug(db, target_slug)
    link = db.scalar(
        select(ArticleLink).where(ArticleLink.source_id == a.id, ArticleLink.target_id == target.id)
    )
    if link is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Связь не найдена")
    db.delete(link)
    db.commit()
    invalidate_all()


@router.get("/articles/{slug}/quiz")
def list_questions(slug: str, user: User = Depends(require_editor), db: Session = Depends(get_db)):
    a = _editable(db, slug, user)
    return [
        {"id": q.id, "question": q.question, "options": q.options, "correct_index": q.correct_index,
         "explanation": q.explanation}
        for q in db.scalars(select(QuizQuestion).where(QuizQuestion.article_id == a.id).order_by(QuizQuestion.id))
    ]


@router.post("/articles/{slug}/quiz", status_code=status.HTTP_201_CREATED)
def add_question(
    slug: str, data: QuizQuestionIn, user: User = Depends(require_editor), db: Session = Depends(get_db)
):
    a = _editable(db, slug, user)
    if data.correct_index >= len(data.options):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Индекс правильного ответа вне диапазона")
    q = QuizQuestion(article_id=a.id, **data.model_dump())
    db.add(q)
    db.commit()
    return {"id": q.id}


@router.delete("/quiz/{question_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_question(question_id: int, user: User = Depends(require_editor), db: Session = Depends(get_db)):
    q = db.get(QuizQuestion, question_id)
    if q is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Вопрос не найден")
    if user.role != Role.ADMIN and q.article.author_id != user.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Нет прав на этот вопрос")
    db.delete(q)
    db.commit()
