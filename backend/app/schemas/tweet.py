from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, Field


class TweetRecord(BaseModel):
    id: str
    author: str
    username: str
    content: str
    created_at: datetime
    image: Optional[str]
    language: Optional[str]
    like_count: Optional[int] = 0
    retweet_count: Optional[int] = 0
    is_quoted: bool = False
    is_reply: bool = False
    is_retweet: bool = False
    original_author: Optional[str] = None
    original_content: Optional[str] = None
    original_id: Optional[str] = None
    original_conversationId: Optional[str] = Field(default=None, alias="original_conversationId")
    url: Optional[str] = None
    business_line: Optional[str] = None

    class Config:
        populate_by_name = True


class TweetListResponse(BaseModel):
    total: int
    records: List[TweetRecord]

