from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status

from ..core.deps import get_current_user
from ..schemas.tweet import TweetListResponse, TweetRecord
from ..services.biz_meta import BusinessLineService
from ..services.twitter_data import TwitterDataService

router = APIRouter(dependencies=[Depends(get_current_user)])


def _parse_dt(value: Any) -> datetime:
    if isinstance(value, datetime):
        return value
    if isinstance(value, str):
        if value.endswith("Z"):
            value = value.replace("Z", "+00:00")
        try:
            return datetime.fromisoformat(value)
        except ValueError:
            pass
    return datetime.utcnow()


def _to_tweet_record(doc: Dict[str, Any], business_line: str) -> TweetRecord:
    return TweetRecord(
        id=doc.get("id", ""),
        author=doc.get("author", ""),
        username=doc.get("username", ""),
        content=doc.get("content", ""),
        created_at=_parse_dt(doc.get("created_at")),
        image=doc.get("image"),
        language=doc.get("language"),
        like_count=doc.get("like_count", 0),
        retweet_count=doc.get("retweet_count", 0),
        is_quoted=doc.get("is_quoted", False),
        is_reply=doc.get("is_reply", False),
        is_retweet=doc.get("is_retweet", False),
        original_author=doc.get("original_author"),
        original_content=doc.get("original_content"),
        original_id=doc.get("original_id"),
        original_conversationId=doc.get("original_conversationId"),
        url=doc.get("url"),
        business_line=business_line,
    )


@router.get("/", response_model=TweetListResponse)
async def list_recent_tweets(
    line_id: str = Query(..., description="Business line identifier"),
    hours: int = Query(24, ge=1, le=168),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    line_service: BusinessLineService = Depends(BusinessLineService),
    twitter_service: TwitterDataService = Depends(TwitterDataService),
):
    line = await line_service.get_line(line_id)
    if not line.members:
        return TweetListResponse(total=0, records=[])
    end = datetime.utcnow()
    start = end - timedelta(hours=hours)
    total, docs = await twitter_service.fetch_tweets(
        line.members, start, end, skip=skip, limit=limit
    )
    records = [_to_tweet_record(doc, line.name) for doc in docs]
    return TweetListResponse(total=total, records=records)


@router.post("/backfill/{line_id}")
async def backfill_business_line_tag(
    line_id: str,
    line_service: BusinessLineService = Depends(BusinessLineService),
    twitter_service: TwitterDataService = Depends(TwitterDataService),
):
    line = await line_service.get_line(line_id)
    if not line.members:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Business line has no members"
        )
    updated = await twitter_service.bulk_tag_business_line(line.members, line.name)
    return {"updated": updated}


@router.get("/user/{twitter_id}", response_model=TweetListResponse)
async def get_user_tweets(
    twitter_id: str,
    hours: Optional[int] = Query(
        None, description="Lookback window in hours. Omit for all available tweets."
    ),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    tweet_type: Optional[str] = Query(
        None,
        description="Filter by tweet type",
        pattern="^(tweet|retweet|reply|quote)$",
    ),
    twitter_service: TwitterDataService = Depends(TwitterDataService),
):
    """Get tweets for a specific Twitter user."""
    start: Optional[datetime] = None
    end: Optional[datetime] = None
    if hours and hours > 0:
        end = datetime.utcnow()
        start = end - timedelta(hours=hours)
    total, docs = await twitter_service.fetch_user_tweets(
        twitter_id, start, end, skip=skip, limit=limit, tweet_type=tweet_type
    )
    records = [_to_tweet_record(doc, "") for doc in docs]
    return TweetListResponse(total=total, records=records)

