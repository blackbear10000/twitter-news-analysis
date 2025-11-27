from datetime import datetime
from typing import List, Optional

from bson import ObjectId
from fastapi import HTTPException, status
from motor.motor_asyncio import AsyncIOMotorCollection

from ..core.database import get_biz_db
from ..schemas.insights import (
    HistoricalReportCreate,
    HistoricalReportPublic,
    InsightSnapshotCreate,
    InsightSnapshotPublic,
)
from ..services.biz_meta import BusinessLineService


class InsightSnapshotService:
    """Service for managing insight snapshots (historical analysis results)."""

    def __init__(self):
        db = get_biz_db()
        self._collection: AsyncIOMotorCollection = db["biz_insight_snapshots"]
        self._reports_collection: AsyncIOMotorCollection = db["biz_historical_reports"]
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
            "is_public": False,  # Default to private
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
        public_only: bool = False,
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
        if public_only:
            query["is_public"] = True

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
        self, business_line_id: Optional[str] = None, public_only: bool = False
    ) -> Optional[InsightSnapshotPublic]:
        """Get the latest snapshot for a business line or overall."""
        query = {}
        if business_line_id:
            query["business_line_id"] = business_line_id
        if public_only:
            query["is_public"] = True
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
            is_public=doc.get("is_public", False),
            report_type=doc.get("report_type", "snapshot"),
        )

    async def create_historical_report(
        self, payload: HistoricalReportCreate
    ) -> HistoricalReportPublic:
        """Create a new historical report."""
        try:
            line = await self._biz_service.get_line(payload.business_line_id)
            line_name = line.name
        except Exception:
            line_name = None

        doc = {
            "business_line_id": payload.business_line_id,
            "business_line_name": line_name,
            "selected_user_ids": payload.selected_user_ids,
            "start_date": payload.start_date,
            "end_date": payload.end_date,
            "topics": [t.dict() for t in payload.topics],
            "nodes": [n.dict() for n in payload.nodes],
            "edges": [e.dict() for e in payload.edges],
            "raw_data_summary": payload.raw_data_summary,
            "created_at": datetime.utcnow(),
        }
        result = await self._reports_collection.insert_one(doc)
        return await self.get_historical_report(str(result.inserted_id))

    async def get_historical_report(self, report_id: str) -> HistoricalReportPublic:
        """Get a historical report by ID."""
        try:
            doc_id = ObjectId(report_id)
        except Exception:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid report id"
            )
        doc = await self._reports_collection.find_one({"_id": doc_id})
        if not doc:
            raise HTTPException(status_code=404, detail="Report not found")
        return self._report_to_public(doc)

    async def list_historical_reports(
        self,
        business_line_id: Optional[str] = None,
        limit: int = 50,
    ) -> List[HistoricalReportPublic]:
        """List historical reports with optional filters."""
        query = {}
        if business_line_id:
            query["business_line_id"] = business_line_id

        cursor = (
            self._reports_collection.find(query)
            .sort("created_at", -1)
            .limit(limit)
        )
        reports = []
        async for doc in cursor:
            reports.append(self._report_to_public(doc))
        return reports

    async def delete_historical_report(self, report_id: str) -> bool:
        """Delete a historical report."""
        try:
            doc_id = ObjectId(report_id)
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, 
                detail=f"Invalid report id format: {str(e)}"
            )
        result = await self._reports_collection.delete_one({"_id": doc_id})
        return result.deleted_count > 0
    
    async def delete_snapshot(self, snapshot_id: str) -> bool:
        """Delete a snapshot by ID."""
        try:
            doc_id = ObjectId(snapshot_id)
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid snapshot id format: {str(e)}"
            )
        result = await self._collection.delete_one({"_id": doc_id})
        return result.deleted_count > 0

    async def update_snapshot_visibility(self, snapshot_id: str, is_public: bool) -> InsightSnapshotPublic:
        """Update snapshot visibility (public/private)."""
        try:
            doc_id = ObjectId(snapshot_id)
        except Exception:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid snapshot id"
            )
        result = await self._collection.update_one(
            {"_id": doc_id},
            {"$set": {"is_public": is_public}}
        )
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Snapshot not found")
        return await self.get_snapshot(snapshot_id)

    def _report_to_public(self, doc) -> HistoricalReportPublic:
        """Convert MongoDB document to historical report schema."""
        from ..schemas.insights import GraphEdge, GraphNode, TopicSummary

        return HistoricalReportPublic(
            id=str(doc["_id"]),
            business_line_id=doc["business_line_id"],
            business_line_name=doc.get("business_line_name"),
            selected_user_ids=doc.get("selected_user_ids", []),
            start_date=doc["start_date"],
            end_date=doc["end_date"],
            topics=[TopicSummary(**t) for t in doc.get("topics", [])],
            nodes=[GraphNode(**n) for n in doc.get("nodes", [])],
            edges=[GraphEdge(**e) for e in doc.get("edges", [])],
            raw_data_summary=doc.get("raw_data_summary"),
            created_at=doc.get("created_at", datetime.utcnow()),
        )

