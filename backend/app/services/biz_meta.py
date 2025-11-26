from datetime import datetime
from typing import Dict, List, Optional

from bson import ObjectId
from fastapi import HTTPException, status
from motor.motor_asyncio import AsyncIOMotorCollection

from ..core.database import get_biz_db
from ..schemas.business_line import (
    BusinessLineCreate,
    BusinessLinePublic,
    BusinessLineUpdate,
)
from ..schemas.member import MemberCreate, MemberPublic, MemberUpdate


def _object_id(line_id: str) -> ObjectId:
    try:
        return ObjectId(line_id)
    except Exception as exc:  # pragma: no cover
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid business line id"
        ) from exc


class BusinessLineService:
    def __init__(self):
        db = get_biz_db()
        self._lines: AsyncIOMotorCollection = db["biz_lines"]
        self._members: AsyncIOMotorCollection = db["biz_members"]

    async def list_lines(self) -> List[BusinessLinePublic]:
        cursor = self._lines.find().sort("name", 1)
        lines = []
        async for doc in cursor:
            members = await self._fetch_members(str(doc["_id"]))
            lines.append(self._to_public(doc, members))
        return lines

    async def get_line(self, line_id: str) -> BusinessLinePublic:
        doc = await self._lines.find_one({"_id": _object_id(line_id)})
        if not doc:
            raise HTTPException(status_code=404, detail="Business line not found")
        members = await self._fetch_members(line_id)
        return self._to_public(doc, members)

    async def create_line(self, payload: BusinessLineCreate) -> BusinessLinePublic:
        now = datetime.utcnow()
        doc = {
            "name": payload.name,
            "description": payload.description,
            "created_at": now,
            "updated_at": now,
        }
        result = await self._lines.insert_one(doc)
        line_id = str(result.inserted_id)
        await self._set_members(line_id, payload.members)
        return await self.get_line(line_id)

    async def update_line(
        self, line_id: str, payload: BusinessLineUpdate
    ) -> BusinessLinePublic:
        to_update = {}
        if payload.name is not None:
            to_update["name"] = payload.name
        if payload.description is not None:
            to_update["description"] = payload.description
        if to_update:
            to_update["updated_at"] = datetime.utcnow()
            await self._lines.update_one({"_id": _object_id(line_id)}, {"$set": to_update})
        if payload.members is not None:
            await self._set_members(line_id, payload.members)
        return await self.get_line(line_id)

    async def delete_line(self, line_id: str) -> None:
        await self._lines.delete_one({"_id": _object_id(line_id)})
        await self._members.delete_many({"business_line_id": line_id})

    async def _set_members(self, line_id: str, members: List[str]) -> None:
        await self._members.delete_many({"business_line_id": line_id})
        if not members:
            return
        await self._members.insert_many(
            [
                {
                    "business_line_id": line_id,
                    "twitter_id": member,
                    "description": None,
                    "created_at": datetime.utcnow(),
                    "updated_at": datetime.utcnow(),
                }
                for member in members
            ]
        )

    async def _fetch_members(self, line_id: str) -> List[str]:
        cursor = self._members.find({"business_line_id": line_id})
        return [doc["twitter_id"] async for doc in cursor]

    async def _fetch_members_with_descriptions(self, line_id: str) -> Dict[str, str]:
        """Fetch members with their descriptions for LLM context."""
        cursor = self._members.find({"business_line_id": line_id})
        result = {}
        async for doc in cursor:
            twitter_id = doc["twitter_id"]
            description = doc.get("description")
            if description:
                result[twitter_id] = description
        return result

    # Member CRUD operations
    async def list_members(self, line_id: str) -> List[MemberPublic]:
        """List all members for a business line."""
        cursor = self._members.find({"business_line_id": line_id}).sort("twitter_id", 1)
        members = []
        async for doc in cursor:
            members.append(
                MemberPublic(
                    id=str(doc["_id"]),
                    twitter_id=doc["twitter_id"],
                    description=doc.get("description"),
                    business_line_id=doc["business_line_id"],
                    tweet_count=doc.get("tweet_count", 0),
                    created_at=doc.get("created_at", datetime.utcnow()),
                    updated_at=doc.get("updated_at", datetime.utcnow()),
                )
            )
        return members

    async def create_member(self, payload: MemberCreate) -> MemberPublic:
        """Create a new member."""
        now = datetime.utcnow()
        doc = {
            "business_line_id": payload.business_line_id,
            "twitter_id": payload.twitter_id,
            "description": payload.description,
            "tweet_count": 0,
            "created_at": now,
            "updated_at": now,
        }
        # Check for duplicates
        existing = await self._members.find_one(
            {"business_line_id": payload.business_line_id, "twitter_id": payload.twitter_id}
        )
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Member already exists for this business line",
            )
        result = await self._members.insert_one(doc)
        return await self.get_member(str(result.inserted_id))

    async def get_member(self, member_id: str) -> MemberPublic:
        """Get a member by ID."""
        doc = await self._members.find_one({"_id": _object_id(member_id)})
        if not doc:
            raise HTTPException(status_code=404, detail="Member not found")
        return MemberPublic(
            id=str(doc["_id"]),
            twitter_id=doc["twitter_id"],
            description=doc.get("description"),
            business_line_id=doc["business_line_id"],
            tweet_count=doc.get("tweet_count", 0),
            created_at=doc.get("created_at", datetime.utcnow()),
            updated_at=doc.get("updated_at", datetime.utcnow()),
        )

    async def update_member(self, member_id: str, payload: MemberUpdate) -> MemberPublic:
        """Update a member."""
        to_update = {"updated_at": datetime.utcnow()}
        if payload.description is not None:
            description = payload.description.strip()
            to_update["description"] = description or None
        await self._members.update_one({"_id": _object_id(member_id)}, {"$set": to_update})
        return await self.get_member(member_id)

    async def delete_member(self, member_id: str) -> None:
        """Delete a member."""
        result = await self._members.delete_one({"_id": _object_id(member_id)})
        if result.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Member not found")

    async def update_member_tweet_count(self, member_id: str, twitter_service) -> MemberPublic:
        """Update tweet count for a member by counting tweets in the database."""
        member = await self.get_member(member_id)
        # Count tweets directly from MongoDB collection
        from ..core.database import get_twitter_db
        twitter_db = get_twitter_db()
        collection = twitter_db[member.twitter_id]
        total = await collection.count_documents({})
        # Update the count
        await self._members.update_one(
            {"_id": _object_id(member_id)},
            {"$set": {"tweet_count": total, "updated_at": datetime.utcnow()}},
        )
        return await self.get_member(member_id)

    async def update_all_members_tweet_count(self, line_id: str, twitter_service) -> int:
        """Update tweet counts for all members in a business line."""
        members = await self.list_members(line_id)
        updated = 0
        for member in members:
            await self.update_member_tweet_count(member.id, twitter_service)
            updated += 1
        return updated

    def _to_public(self, doc, members: List[str]) -> BusinessLinePublic:
        return BusinessLinePublic(
            id=str(doc["_id"]),
            name=doc["name"],
            description=doc.get("description"),
            members=members,
            created_at=doc.get("created_at", datetime.utcnow()),
            updated_at=doc.get("updated_at", datetime.utcnow()),
        )

