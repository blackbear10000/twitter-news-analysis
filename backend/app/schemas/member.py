from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class MemberBase(BaseModel):
    twitter_id: str = Field(min_length=1, max_length=100)
    description: Optional[str] = Field(default=None, max_length=500, description="Description for LLM context")


class MemberCreate(MemberBase):
    business_line_id: str


class MemberUpdate(BaseModel):
    description: Optional[str] = Field(default=None, max_length=500)


class MemberPublic(MemberBase):
    id: str
    business_line_id: str
    tweet_count: Optional[int] = Field(default=0, description="Number of tweets for this user")
    created_at: datetime
    updated_at: datetime

