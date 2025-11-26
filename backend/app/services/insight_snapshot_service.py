from datetime import datetime
from typing import List, Optional

from bson import ObjectId
from fastapi import HTTPException, status
from motor.motor_asyncio import AsyncIOMotorCollection

from ..core.database import get_biz_db
from ..schemas.insights import InsightSnapshotCreate, InsightSnapshotPublic
from ..services.biz_meta import BusinessLineService


class InsightSnapshotService:
    """Service for managing insight snapshots (historical analysis results)."""

    def __init__(self):
        db = get_biz_db()
        self._collection: AsyncIOMotorCollection = db["biz_insight_snapshots"]
        self._biz_service = BusinessLineService()

    async def create_snapshot(self, payload: InsightSnapshotCreate) -> InsightSnapshotPublic:
        """Create a new insight snapshot."""
        # Get business line name
        try:
            line = await self._biz_service.get_line(payload.business_line_id)
            line_name = line.name
        except Exception:
            line_name = None

        doc = {
            "business_line_id": payload.business_line_id,
            "business_line_name": line_name,
            "analysis_date": payload.analysis_date,
            "topics": [t.dict() for t in payload.topics],
            "nodes": [n.dict() for n in payload.nodes],
            "edges": [e.dict() for e in payload.edges],
            "raw_data_summary": payload.raw_data_summary,
            "created_at": datetime.utcnow(),
        }
        result = await self._collection.insert_one(doc)
        return await self.get_snapshot(str(result.inserted_id))

    async def get_snapshot(self, snapshot_id: str) -> InsightSnapshotPublic:
        """Get a snapshot by ID."""
        try:
            doc_id = ObjectId(snapshot_id)
        except Exception:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid snapshot id"
            )
        doc = await self._collection.find_one({"_id": doc_id})
        if not doc:
            raise HTTPException(status_code=404, detail="Snapshot not found")
        return self._to_public(doc)

    async def list_snapshots(
        self,
        business_line_id: Optional[str] = None,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
        limit: int = 50,
    ) -> List[InsightSnapshotPublic]:
        """List snapshots with optional filters."""
        query = {}
        if business_line_id:
            query["business_line_id"] = business_line_id
        if start_date or end_date:
            date_filter = {}
            if start_date:
                date_filter["$gte"] = start_date
            if end_date:
                date_filter["$lte"] = end_date
            query["analysis_date"] = date_filter

        cursor = (
            self._collection.find(query)
            .sort("analysis_date", -1)
            .limit(limit)
        )
        snapshots = []
        async for doc in cursor:
            snapshots.append(self._to_public(doc))
        return snapshots

    async def get_latest_snapshot(
        self, business_line_id: Optional[str] = None
    ) -> Optional[InsightSnapshotPublic]:
        """Get the latest snapshot for a business line or overall."""
        query = {}
        if business_line_id:
            query["business_line_id"] = business_line_id
        doc = await self._collection.find_one(query, sort=[("analysis_date", -1)])
        if not doc:
            return None
        return self._to_public(doc)

    def _to_public(self, doc) -> InsightSnapshotPublic:
        """Convert MongoDB document to public schema."""
        from ..schemas.insights import GraphEdge, GraphNode, TopicSummary

        return InsightSnapshotPublic(
            id=str(doc["_id"]),
            business_line_id=doc["business_line_id"],
            business_line_name=doc.get("business_line_name"),
            analysis_date=doc["analysis_date"],
            topics=[TopicSummary(**t) for t in doc.get("topics", [])],
            nodes=[GraphNode(**n) for n in doc.get("nodes", [])],
            edges=[GraphEdge(**e) for e in doc.get("edges", [])],
            raw_data_summary=doc.get("raw_data_summary"),
            created_at=doc.get("created_at", datetime.utcnow()),
        )

