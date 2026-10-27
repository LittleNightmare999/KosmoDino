"""Доменная модель энциклопедии (ORM-сущности SQLAlchemy).

Сущности выделены по результатам анализа предметной области:
пользователи и роли, тематические разделы, категории, статьи с карточкой фактов,
связи между статьями (граф знаний), история правок, комментарии, закладки,
вопросы викторины, попытки прохождения и журнал аудита.
"""
from datetime import datetime
from enum import StrEnum

from sqlalchemy import (
    JSON,
    Boolean,
    CheckConstraint,
    Column,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Table,
    Text,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


class Role(StrEnum):
    READER = "reader"   # читатель: читает, комментирует, сохраняет, проходит викторины
    EDITOR = "editor"   # редактор: пишет и правит статьи, отправляет на рецензию
    ADMIN = "admin"     # системный администратор: модерация, пользователи, справочники


class ArticleStatus(StrEnum):
    DRAFT = "draft"
    PENDING = "pending"
    PUBLISHED = "published"
    REJECTED = "rejected"
    ARCHIVED = "archived"


class CommentStatus(StrEnum):
    VISIBLE = "visible"
    HIDDEN = "hidden"


def _enum(e: type[StrEnum], name: str) -> Enum:
    return Enum(e, name=name, values_callable=lambda x: [m.value for m in x])


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(String(40), unique=True, index=True)
    email: Mapped[str] = mapped_column(String(120), unique=True)
    full_name: Mapped[str] = mapped_column(String(120), default="")
    password_hash: Mapped[str] = mapped_column(String(200))
    role: Mapped[Role] = mapped_column(_enum(Role, "user_role"), default=Role.READER)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    articles: Mapped[list["Article"]] = relationship(back_populates="author")


class Topic(Base):
    """Тематический раздел энциклопедии: «Космос», «Динозавры»."""

    __tablename__ = "topics"

    id: Mapped[int] = mapped_column(primary_key=True)
    slug: Mapped[str] = mapped_column(String(40), unique=True)
    name: Mapped[str] = mapped_column(String(80))
    description: Mapped[str] = mapped_column(Text, default="")
    timeline_unit: Mapped[str] = mapped_column(String(40), default="")  # «год» / «млн лет назад»

    categories: Mapped[list["Category"]] = relationship(
        back_populates="topic", order_by="Category.sort_order"
    )


class Category(Base):
    __tablename__ = "categories"
    __table_args__ = (UniqueConstraint("topic_id", "slug"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    topic_id: Mapped[int] = mapped_column(ForeignKey("topics.id", ondelete="CASCADE"), index=True)
    slug: Mapped[str] = mapped_column(String(60))
    name: Mapped[str] = mapped_column(String(80))
    description: Mapped[str] = mapped_column(Text, default="")
    sort_order: Mapped[int] = mapped_column(Integer, default=0)

    topic: Mapped[Topic] = relationship(back_populates="categories")


article_tags = Table(
    "article_tags",
    Base.metadata,
    Column("article_id", ForeignKey("articles.id", ondelete="CASCADE"), primary_key=True),
    Column("tag_id", ForeignKey("tags.id", ondelete="CASCADE"), primary_key=True),
)


class Tag(Base):
    __tablename__ = "tags"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(50), unique=True)


class Article(Base):
    __tablename__ = "articles"
    __table_args__ = (
        Index("ix_articles_status_topic", "status", "topic_id"),
        Index(
            "ix_articles_fts",
            text("to_tsvector('russian', title || ' ' || summary || ' ' || content)"),
            postgresql_using="gin",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    slug: Mapped[str] = mapped_column(String(120), unique=True, index=True)
    title: Mapped[str] = mapped_column(String(160))
    summary: Mapped[str] = mapped_column(String(500))
    content: Mapped[str] = mapped_column(Text)
    topic_id: Mapped[int] = mapped_column(ForeignKey("topics.id"), index=True)
    category_id: Mapped[int] = mapped_column(ForeignKey("categories.id"), index=True)
    author_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    status: Mapped[ArticleStatus] = mapped_column(
        _enum(ArticleStatus, "article_status"), default=ArticleStatus.DRAFT
    )
    era_label: Mapped[str] = mapped_column(String(80), default="")
    timeline_value: Mapped[float | None] = mapped_column(Float)
    review_note: Mapped[str] = mapped_column(Text, default="")
    views: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    topic: Mapped[Topic] = relationship()
    category: Mapped[Category] = relationship()
    author: Mapped[User | None] = relationship(back_populates="articles")
    facts: Mapped[list["ArticleFact"]] = relationship(
        cascade="all, delete-orphan", order_by="ArticleFact.sort_order"
    )
    tags: Mapped[list[Tag]] = relationship(secondary=article_tags)
    quiz_questions: Mapped[list["QuizQuestion"]] = relationship(cascade="all, delete-orphan")


class ArticleFact(Base):
    """Строка карточки фактов (инфобокса): «Масса — 5,97·10²⁴ кг»."""

    __tablename__ = "article_facts"

    id: Mapped[int] = mapped_column(primary_key=True)
    article_id: Mapped[int] = mapped_column(ForeignKey("articles.id", ondelete="CASCADE"), index=True)
    label: Mapped[str] = mapped_column(String(80))
    value: Mapped[str] = mapped_column(String(200))
    sort_order: Mapped[int] = mapped_column(Integer, default=0)


class ArticleLink(Base):
    """Ориентированная связь между статьями — ребро графа знаний."""

    __tablename__ = "article_links"
    __table_args__ = (
        UniqueConstraint("source_id", "target_id"),
        CheckConstraint("source_id <> target_id", name="ck_link_not_self"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    source_id: Mapped[int] = mapped_column(ForeignKey("articles.id", ondelete="CASCADE"), index=True)
    target_id: Mapped[int] = mapped_column(ForeignKey("articles.id", ondelete="CASCADE"), index=True)
    relation: Mapped[str] = mapped_column(String(80))

    source: Mapped[Article] = relationship(foreign_keys=[source_id])
    target: Mapped[Article] = relationship(foreign_keys=[target_id])


class ArticleRevision(Base):
    __tablename__ = "article_revisions"

    id: Mapped[int] = mapped_column(primary_key=True)
    article_id: Mapped[int] = mapped_column(ForeignKey("articles.id", ondelete="CASCADE"), index=True)
    editor_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    title: Mapped[str] = mapped_column(String(160))
    summary: Mapped[str] = mapped_column(String(500))
    content: Mapped[str] = mapped_column(Text)
    comment: Mapped[str] = mapped_column(String(300), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    editor: Mapped[User | None] = relationship()


class Comment(Base):
    __tablename__ = "comments"

    id: Mapped[int] = mapped_column(primary_key=True)
    article_id: Mapped[int] = mapped_column(ForeignKey("articles.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    body: Mapped[str] = mapped_column(Text)
    status: Mapped[CommentStatus] = mapped_column(
        _enum(CommentStatus, "comment_status"), default=CommentStatus.VISIBLE
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    user: Mapped[User] = relationship()
    article: Mapped[Article] = relationship()


class Bookmark(Base):
    __tablename__ = "bookmarks"

    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    article_id: Mapped[int] = mapped_column(
        ForeignKey("articles.id", ondelete="CASCADE"), primary_key=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    article: Mapped[Article] = relationship()


class QuizQuestion(Base):
    __tablename__ = "quiz_questions"

    id: Mapped[int] = mapped_column(primary_key=True)
    article_id: Mapped[int] = mapped_column(ForeignKey("articles.id", ondelete="CASCADE"), index=True)
    question: Mapped[str] = mapped_column(String(300))
    options: Mapped[list[str]] = mapped_column(JSON)
    correct_index: Mapped[int] = mapped_column(Integer)
    explanation: Mapped[str] = mapped_column(String(400), default="")

    article: Mapped[Article] = relationship(back_populates="quiz_questions")


class QuizAttempt(Base):
    __tablename__ = "quiz_attempts"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    topic_id: Mapped[int] = mapped_column(ForeignKey("topics.id"))
    score: Mapped[int] = mapped_column(Integer)
    total: Mapped[int] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    topic: Mapped[Topic] = relationship()


class AuditLog(Base):
    __tablename__ = "audit_log"

    id: Mapped[int] = mapped_column(primary_key=True)
    actor_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    action: Mapped[str] = mapped_column(String(60))
    entity: Mapped[str] = mapped_column(String(40))
    entity_id: Mapped[int | None] = mapped_column(Integer)
    details: Mapped[str] = mapped_column(String(400), default="")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True
    )

    actor: Mapped[User | None] = relationship()
