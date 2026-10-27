"""Раздел читателя: комментарии, закладки, викторины и личная статистика."""
import random

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from ..database import get_db
from ..deps import get_current_user
from ..models import (
    Article,
    ArticleStatus,
    Bookmark,
    Comment,
    CommentStatus,
    QuizAttempt,
    QuizQuestion,
    Role,
    Topic,
    User,
)
from ..schemas import (
    ArticleCard,
    CommentIn,
    CommentOut,
    QuizAttemptOut,
    QuizQuestionOut,
    QuizResultItem,
    QuizResultOut,
    QuizSubmitIn,
)
from ..services import articles as svc
from ..services.audit import log_action

router = APIRouter(prefix="/api", tags=["reader"])


def _published(db: Session, slug: str) -> Article:
    a = svc.get_by_slug(db, slug)
    if a.status != ArticleStatus.PUBLISHED:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Статья не найдена")
    return a


# ---------- Комментарии ----------

@router.get("/articles/{slug}/comments", response_model=list[CommentOut])
def comments(slug: str, db: Session = Depends(get_db)):
    a = _published(db, slug)
    stmt = (
        select(Comment)
        .where(Comment.article_id == a.id, Comment.status == CommentStatus.VISIBLE)
        .options(selectinload(Comment.user))
        .order_by(Comment.created_at.desc(), Comment.id.desc())
        .limit(200)
    )
    return list(db.scalars(stmt))


@router.post("/articles/{slug}/comments", response_model=CommentOut, status_code=status.HTTP_201_CREATED)
def add_comment(slug: str, data: CommentIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    a = _published(db, slug)
    c = Comment(article_id=a.id, user_id=user.id, body=data.body.strip())
    db.add(c)
    db.commit()
    db.refresh(c)
    return c


@router.delete("/comments/{comment_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_comment(comment_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    c = db.get(Comment, comment_id)
    if c is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Комментарий не найден")
    if c.user_id != user.id and user.role != Role.ADMIN:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Можно удалить только свой комментарий")
    log_action(db, user, "comment.delete", "comment", c.id, c.body[:80])
    db.delete(c)
    db.commit()


# ---------- Закладки ----------

@router.get("/me/bookmarks", response_model=list[ArticleCard])
def bookmarks(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    stmt = (
        svc.card_query()
        .join(Bookmark, Bookmark.article_id == Article.id)
        .where(Bookmark.user_id == user.id, Article.status == ArticleStatus.PUBLISHED)
        .order_by(Bookmark.created_at.desc())
    )
    return [svc.to_card(a) for a in db.scalars(stmt)]


@router.put("/me/bookmarks/{slug}", status_code=status.HTTP_204_NO_CONTENT)
def add_bookmark(slug: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    a = _published(db, slug)
    if db.get(Bookmark, (user.id, a.id)) is None:
        db.add(Bookmark(user_id=user.id, article_id=a.id))
        db.commit()


@router.delete("/me/bookmarks/{slug}", status_code=status.HTTP_204_NO_CONTENT)
def remove_bookmark(slug: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    a = svc.get_by_slug(db, slug)
    b = db.get(Bookmark, (user.id, a.id))
    if b is not None:
        db.delete(b)
        db.commit()


# ---------- Викторины ----------

def _topic(db: Session, slug: str) -> Topic:
    t = db.scalar(select(Topic).where(Topic.slug == slug))
    if t is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Раздел не найден")
    return t


@router.get("/quiz/{topic_slug}", response_model=list[QuizQuestionOut])
def quiz(topic_slug: str, count: int = Query(default=8, ge=1, le=20), db: Session = Depends(get_db)):
    """Случайный набор вопросов раздела. Правильные ответы клиенту не передаются."""
    t = _topic(db, topic_slug)
    stmt = (
        select(QuizQuestion)
        .join(Article, Article.id == QuizQuestion.article_id)
        .where(Article.topic_id == t.id, Article.status == ArticleStatus.PUBLISHED)
        .options(selectinload(QuizQuestion.article))
    )
    pool = list(db.scalars(stmt))
    picked = random.sample(pool, min(count, len(pool)))
    return [
        QuizQuestionOut(
            id=q.id, question=q.question, options=q.options,
            article_slug=q.article.slug, article_title=q.article.title,
        )
        for q in picked
    ]


@router.post("/quiz/submit", response_model=QuizResultOut)
def submit_quiz(data: QuizSubmitIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    t = _topic(db, data.topic_slug)
    ids = [a.question_id for a in data.answers]
    questions = {
        q.id: q
        for q in db.scalars(
            select(QuizQuestion)
            .join(Article, Article.id == QuizQuestion.article_id)
            .where(QuizQuestion.id.in_(ids), Article.topic_id == t.id)
        )
    }
    if len(questions) != len(set(ids)):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Вопросы не относятся к разделу")
    items = []
    for ans in data.answers:
        q = questions[ans.question_id]
        items.append(
            QuizResultItem(
                question_id=q.id,
                correct=ans.selected_index == q.correct_index,
                correct_index=q.correct_index,
                explanation=q.explanation,
            )
        )
    score = sum(i.correct for i in items)
    db.add(QuizAttempt(user_id=user.id, topic_id=t.id, score=score, total=len(items)))
    db.commit()
    return QuizResultOut(score=score, total=len(items), items=items)


@router.get("/me/quiz-attempts", response_model=list[QuizAttemptOut])
def attempts(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    stmt = (
        select(QuizAttempt)
        .where(QuizAttempt.user_id == user.id)
        .options(selectinload(QuizAttempt.topic))
        .order_by(QuizAttempt.created_at.desc())
        .limit(30)
    )
    return [
        QuizAttemptOut(id=a.id, score=a.score, total=a.total, created_at=a.created_at, topic_name=a.topic.name)
        for a in db.scalars(stmt)
    ]


@router.get("/me/stats")
def my_stats(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    bm = db.scalar(select(func.count()).select_from(Bookmark).where(Bookmark.user_id == user.id))
    cm = db.scalar(select(func.count()).select_from(Comment).where(Comment.user_id == user.id))
    best = db.execute(
        select(func.coalesce(func.sum(QuizAttempt.score), 0), func.coalesce(func.sum(QuizAttempt.total), 0),
               func.count())
        .where(QuizAttempt.user_id == user.id)
    ).one()
    return {"bookmarks": bm, "comments": cm, "quiz_correct": best[0], "quiz_total": best[1], "quiz_attempts": best[2]}
