from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

from ..core.database import get_twitter_db


class TwitterDataService:
    def __init__(self):
        self._db = get_twitter_db()

    async def fetch_tweets(
        self,
        twitter_ids: List[str],
        start: Optional[datetime],
        end: Optional[datetime],
        skip: int = 0,
        limit: int = 50,
    ) -> Tuple[int, List[Dict[str, Any]]]:
        all_records: List[Dict[str, Any]] = []
        for twitter_id in twitter_ids:
            collection = self._db[twitter_id]
            query: Dict[str, Any] = {}
            created_filter: Dict[str, Any] = {}
            if start:
                created_filter["$gte"] = start.isoformat()
            if end:
                created_filter["$lte"] = end.isoformat()
            if created_filter:
                query["created_at"] = created_filter
            cursor = collection.find(query).sort("created_at", -1)
            async for doc in cursor:
                # annotate origin for downstream aggregation
                doc["business_line_user_id"] = twitter_id
                all_records.append(doc)
        all_records.sort(key=lambda x: x.get("created_at", ""), reverse=True)
        total = len(all_records)
        if limit <= 0:
            return total, all_records[skip:]
        return total, all_records[skip : skip + limit]

    async def fetch_user_tweets(
        self,
        twitter_id: str,
        start: Optional[datetime],
        end: Optional[datetime],
        skip: int = 0,
        limit: int = 50,
        tweet_type: Optional[str] = None,
    ) -> Tuple[int, List[Dict[str, Any]]]:
        collection = self._db[twitter_id]
        query: Dict[str, Any] = {}
        created_filter: Dict[str, Any] = {}
        if start:
            created_filter["$gte"] = start.isoformat()
        if end:
            created_filter["$lte"] = end.isoformat()
        if created_filter:
            query["created_at"] = created_filter

        if tweet_type == "retweet":
            query["is_retweet"] = True
        elif tweet_type == "reply":
            query["is_reply"] = True
        elif tweet_type == "quote":
            query["is_quoted"] = True
        elif tweet_type == "tweet":
            query["is_retweet"] = {"$ne": True}
            query["is_reply"] = {"$ne": True}
            query["is_quoted"] = {"$ne": True}

        total = await collection.count_documents(query)
        cursor = (
            collection.find(query)
            .sort("created_at", -1)
            .skip(skip)
            .limit(limit if limit > 0 else 0)
        )
        docs: List[Dict[str, Any]] = []
        async for doc in cursor:
            doc["business_line_user_id"] = twitter_id
            docs.append(doc)
        return total, docs

    async def bulk_tag_business_line(
        self, twitter_ids: List[str], business_line: str
    ) -> int:
        updated = 0
        for twitter_id in twitter_ids:
            collection = self._db[twitter_id]
            result = await collection.update_many(
                {"$or": [{"business_line": {"$exists": False}}, {"business_line": None}]},
                {"$set": {"business_line": business_line}},
            )
            updated += result.modified_count
        return updated

