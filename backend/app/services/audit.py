"""Журнал аудита действий пользователей."""
from sqlalchemy.orm import Session

from ..models import AuditLog, User


def log_action(
    db: Session, actor: User | None, action: str, entity: str, entity_id: int | None, details: str = ""
) -> None:
    db.add(
        AuditLog(
            actor_id=actor.id if actor else None,
            action=action,
            entity=entity,
            entity_id=entity_id,
            details=details[:400],
        )
    )
