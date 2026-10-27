"""Регистрация, вход и личный профиль."""
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import get_current_user
from ..models import Role, User
from ..schemas import LoginIn, PasswordChange, ProfileUpdate, RegisterIn, TokenOut, UserOut
from ..security import create_access_token, hash_password, verify_password
from ..services.audit import log_action

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _token(user: User) -> TokenOut:
    return TokenOut(
        access_token=create_access_token(user.id, user.role.value), user=UserOut.model_validate(user)
    )


@router.post("/register", response_model=TokenOut, status_code=status.HTTP_201_CREATED)
def register(data: RegisterIn, db: Session = Depends(get_db)):
    exists = db.scalar(
        select(User.id).where(
            or_(func.lower(User.username) == data.username.lower(), func.lower(User.email) == data.email.lower())
        )
    )
    if exists:
        raise HTTPException(status.HTTP_409_CONFLICT, "Пользователь с таким логином или почтой уже есть")
    # самостоятельная регистрация всегда даёт роль читателя
    user = User(
        username=data.username,
        email=data.email.lower(),
        full_name=data.full_name,
        password_hash=hash_password(data.password),
        role=Role.READER,
    )
    db.add(user)
    db.flush()
    log_action(db, user, "user.register", "user", user.id, user.username)
    db.commit()
    return _token(user)


@router.post("/login", response_model=TokenOut)
def login(data: LoginIn, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(func.lower(User.username) == data.username.lower()))
    if user is None or not verify_password(data.password, user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Неверный логин или пароль")
    if not user.is_active:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Учётная запись заблокирована")
    user.last_login_at = datetime.now(UTC)
    db.commit()
    return _token(user)


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)):
    return user


@router.patch("/me", response_model=UserOut)
def update_me(data: ProfileUpdate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if data.email and data.email.lower() != user.email:
        if db.scalar(select(User.id).where(User.email == data.email.lower())):
            raise HTTPException(status.HTTP_409_CONFLICT, "Почта уже используется")
        user.email = data.email.lower()
    if data.full_name is not None:
        user.full_name = data.full_name
    db.merge(user)
    db.commit()
    return user


@router.post("/me/password", status_code=status.HTTP_204_NO_CONTENT)
def change_password(
    data: PasswordChange, user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    if not verify_password(data.current_password, user.password_hash):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Текущий пароль указан неверно")
    user.password_hash = hash_password(data.new_password)
    db.merge(user)
    db.commit()
