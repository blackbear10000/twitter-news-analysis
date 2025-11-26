from datetime import datetime
from typing import Optional

from fastapi import Depends
from motor.motor_asyncio import AsyncIOMotorCollection

from ..core.database import get_biz_db
from ..core.security import hash_password, verify_password
from ..schemas.user import UserCreate, UserInDB


class UserService:
    def __init__(self):
        self._collection: AsyncIOMotorCollection = get_biz_db()["users"]

    async def get_user_by_username(self, username: str) -> Optional[UserInDB]:
        doc = await self._collection.find_one({"username": username})
        if not doc:
            return None
        return UserInDB(
            id=str(doc.get("_id")),
            username=doc["username"],
            password_hash=doc["password_hash"],
            role=doc.get("role", "admin"),
            created_at=doc.get("created_at", datetime.utcnow()),
        )

    async def verify_user(self, username: str, password: str) -> Optional[UserInDB]:
        user = await self.get_user_by_username(username)
        if not user:
            return None
        if not verify_password(password, user.password_hash):
            return None
        return user

    async def ensure_admin_user(self, create_payload: UserCreate) -> None:
        existing = await self.get_user_by_username(create_payload.username)
        if existing:
            return
        await self._collection.insert_one(
            {
                "username": create_payload.username,
                "password_hash": hash_password(create_payload.password),
                "role": create_payload.role,
                "created_at": datetime.utcnow(),
            }
        )

