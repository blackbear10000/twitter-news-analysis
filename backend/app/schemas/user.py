from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class UserBase(BaseModel):
    username: str = Field(min_length=3, max_length=50)


class UserCreate(UserBase):
    password: str = Field(min_length=8, max_length=128)
    role: str = Field(default="admin")


class UserPublic(UserBase):
    role: str


class UserInDB(UserBase):
    id: Optional[str] = None
    password_hash: str
    role: str = "admin"
    created_at: datetime

