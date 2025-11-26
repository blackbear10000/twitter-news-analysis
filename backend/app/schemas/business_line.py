from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, Field


class BusinessLineBase(BaseModel):
    name: str = Field(min_length=2, max_length=50)
    description: Optional[str] = Field(default=None, max_length=280)


class BusinessLineCreate(BusinessLineBase):
    members: List[str] = Field(default_factory=list, description="Twitter user IDs")


class BusinessLineUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=2, max_length=50)
    description: Optional[str] = Field(default=None, max_length=280)
    members: Optional[List[str]] = None


class BusinessLinePublic(BusinessLineBase):
    id: str
    members: List[str] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime

