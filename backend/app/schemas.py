"""DTO (Pydantic-схемы) — контракт REST API между клиентом и сервером."""
from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

from .models import ArticleStatus, CommentStatus, Role


class ORM(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# ---------- Пользователи и авторизация ----------

class RegisterIn(BaseModel):
    username: str = Field(min_length=3, max_length=40, pattern=r"^[A-Za-z0-9_.-]+$")
    email: EmailStr
    full_name: str = Field(default="", max_length=120)
    password: str = Field(min_length=8, max_length=128)


class LoginIn(BaseModel):
    username: str
    password: str


class UserOut(ORM):
    id: int
    username: str
    email: str
    full_name: str
    role: Role
    is_active: bool
    created_at: datetime
    last_login_at: datetime | None = None


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


class ProfileUpdate(BaseModel):
    full_name: str | None = Field(default=None, max_length=120)
    email: EmailStr | None = None


class PasswordChange(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8, max_length=128)


class UserAdminUpdate(BaseModel):
    role: Role | None = None
    is_active: bool | None = None


# ---------- Справочники ----------

class CategoryOut(ORM):
    id: int
    slug: str
    name: str
    description: str
    topic_id: int


class CategoryIn(BaseModel):
    topic_id: int
    slug: str = Field(min_length=2, max_length=60, pattern=r"^[a-z0-9-]+$")
    name: str = Field(min_length=2, max_length=80)
    description: str = ""
    sort_order: int = 0


class TopicOut(ORM):
    id: int
    slug: str
    name: str
    description: str
    timeline_unit: str
    categories: list[CategoryOut] = []
    article_count: int = 0


# ---------- Статьи ----------

class FactIO(ORM):
    label: str = Field(min_length=1, max_length=80)
    value: str = Field(min_length=1, max_length=200)


class AuthorOut(ORM):
    id: int
    username: str
    full_name: str


class ArticleCard(ORM):
    id: int
    slug: str
    title: str
    summary: str
    status: ArticleStatus
    era_label: str
    timeline_value: float | None
    views: int
    updated_at: datetime
    published_at: datetime | None
    topic_slug: str
    category_name: str
    category_slug: str


class LinkOut(BaseModel):
    slug: str
    title: str
    relation: str
    direction: str  # out | in


class ArticleDetail(ArticleCard):
    content: str
    review_note: str
    topic_id: int
    category_id: int
    author: AuthorOut | None
    facts: list[FactIO]
    tags: list[str]
    links: list[LinkOut] = []
    bookmarked: bool = False
    quiz_count: int = 0


class ArticleIn(BaseModel):
    title: str = Field(min_length=3, max_length=160)
    slug: str = Field(min_length=3, max_length=120, pattern=r"^[a-z0-9-]+$")
    summary: str = Field(min_length=10, max_length=500)
    content: str = Field(min_length=20)
    category_id: int
    era_label: str = Field(default="", max_length=80)
    timeline_value: float | None = None
    facts: list[FactIO] = []
    tags: list[str] = []
    revision_comment: str = Field(default="", max_length=300)

    @field_validator("tags")
    @classmethod
    def _clean_tags(cls, v: list[str]) -> list[str]:
        return sorted({t.strip().lower() for t in v if t.strip()})[:12]


class ReviewIn(BaseModel):
    approve: bool
    note: str = Field(default="", max_length=1000)


class Page[T](BaseModel):
    items: list[T]
    total: int
    page: int
    page_size: int


class RevisionOut(ORM):
    id: int
    title: str
    comment: str
    created_at: datetime
    editor: AuthorOut | None


class LinkIn(BaseModel):
    target_slug: str
    relation: str = Field(min_length=2, max_length=80)


# ---------- Граф знаний и хронология ----------

class GraphNode(BaseModel):
    id: int
    slug: str
    title: str
    topic_slug: str
    category_name: str


class GraphEdge(BaseModel):
    source: int
    target: int
    relation: str


class GraphOut(BaseModel):
    nodes: list[GraphNode]
    edges: list[GraphEdge]


# ---------- Комментарии и закладки ----------

class CommentIn(BaseModel):
    body: str = Field(min_length=2, max_length=2000)


class CommentOut(ORM):
    id: int
    body: str
    status: CommentStatus
    created_at: datetime
    user: AuthorOut


class CommentAdminOut(CommentOut):
    article_slug: str
    article_title: str


class CommentModerate(BaseModel):
    status: CommentStatus


# ---------- Викторины ----------

class QuizQuestionOut(BaseModel):
    id: int
    question: str
    options: list[str]
    article_slug: str
    article_title: str


class QuizAnswerIn(BaseModel):
    question_id: int
    selected_index: int


class QuizSubmitIn(BaseModel):
    topic_slug: str
    answers: list[QuizAnswerIn] = Field(min_length=1, max_length=30)


class QuizResultItem(BaseModel):
    question_id: int
    correct: bool
    correct_index: int
    explanation: str


class QuizResultOut(BaseModel):
    score: int
    total: int
    items: list[QuizResultItem]


class QuizAttemptOut(ORM):
    id: int
    score: int
    total: int
    created_at: datetime
    topic_name: str


class QuizQuestionIn(BaseModel):
    question: str = Field(min_length=5, max_length=300)
    options: list[str] = Field(min_length=2, max_length=6)
    correct_index: int = Field(ge=0)
    explanation: str = Field(default="", max_length=400)


# ---------- Администрирование ----------

class AuditOut(ORM):
    id: int
    action: str
    entity: str
    entity_id: int | None
    details: str
    created_at: datetime
    actor: AuthorOut | None


class StatsOut(BaseModel):
    users_total: int
    users_by_role: dict[str, int]
    articles_by_status: dict[str, int]
    articles_by_topic: dict[str, int]
    comments_total: int
    comments_hidden: int
    quiz_attempts: int
    bookmarks_total: int
    top_articles: list[ArticleCard]
