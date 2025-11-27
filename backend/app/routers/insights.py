from datetime import datetime, timedelta
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status

from ..core.deps import get_current_user
from ..schemas.insights import (
    HistoricalReportCreate,
    HistoricalReportPublic,
    InsightSnapshotCreate,
    InsightSnapshotPublic,
    InsightsResponse,
)
from ..services.biz_meta import BusinessLineService
from ..services.insight_snapshot_service import InsightSnapshotService
from ..services.insights_service import InsightsService
from ..services.llm_client import LLMClient
from ..services.twitter_data import TwitterDataService

router = APIRouter(dependencies=[Depends(get_current_user)])


@router.get("/", response_model=InsightsResponse)
async def get_insights(
    line_id: str,
    hours: int = Query(24, ge=1, le=168),
    use_llm: bool = Query(True, description="Use LLM for analysis"),
    line_service: BusinessLineService = Depends(BusinessLineService),
    twitter_service: TwitterDataService = Depends(TwitterDataService),
):
    """Get real-time insights for a business line (admin only)."""
    line = await line_service.get_line(line_id)
    llm_client = LLMClient()
    service = InsightsService(twitter_service, llm_client, line_service)
    return await service.generate_insights(line, hours, use_llm=use_llm)


@router.post("/generate/{line_id}", response_model=InsightSnapshotPublic, status_code=201)
async def trigger_analysis(
    line_id: str,
    hours: int = Query(24, ge=1, le=168),
    line_service: BusinessLineService = Depends(BusinessLineService),
    twitter_service: TwitterDataService = Depends(TwitterDataService),
    snapshot_service: InsightSnapshotService = Depends(InsightSnapshotService),
):
    """Trigger analysis and save as snapshot (admin only)."""
    line = await line_service.get_line(line_id)
    if not line.members:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Business line has no members"
        )
    llm_client = LLMClient()
    insights_service = InsightsService(twitter_service, llm_client, line_service)
    insights = await insights_service.generate_insights(line, hours, use_llm=True)
    snapshot = InsightSnapshotCreate(
        business_line_id=line_id,
        analysis_date=datetime.utcnow(),
        topics=insights.topics,
        nodes=insights.nodes,
        edges=insights.edges,
        raw_data_summary=f"Analysis for {line.name} covering last {hours} hours",
    )
    return await snapshot_service.create_snapshot(snapshot)


@router.post("/reports/generate", response_model=InsightSnapshotPublic, status_code=201)
async def generate_historical_report(
    payload: HistoricalReportCreate,
    line_service: BusinessLineService = Depends(BusinessLineService),
    twitter_service: TwitterDataService = Depends(TwitterDataService),
    snapshot_service: InsightSnapshotService = Depends(InsightSnapshotService),
):
    """Generate a historical report for selected users and date range (admin only)."""
    line = await line_service.get_line(payload.business_line_id)
    if not payload.selected_user_ids:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="No users selected"
        )
    
    # Fetch tweets for selected users in the date range
    total, docs = await twitter_service.fetch_tweets(
        payload.selected_user_ids,
        payload.start_date,
        payload.end_date,
        skip=0,
        limit=5000,
    )
    
    if total == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No tweets found in the specified date range"
        )
    
    # Get member descriptions
    member_descriptions = {}
    if line_service:
        try:
            member_descriptions = await line_service._fetch_members_with_descriptions(
                payload.business_line_id
            )
            # Filter to only selected users
            member_descriptions = {
                k: v for k, v in member_descriptions.items()
                if k in payload.selected_user_ids
            }
        except Exception:
            pass
    
    # Generate insights using LLM
    llm_client = LLMClient()
    insights_service = InsightsService(twitter_service, llm_client, line_service)
    insights = await insights_service.generate_insights_for_tweets(
        docs, member_descriptions, use_llm=True
    )
    
    # Save as snapshot so it appears in Analysis History
    # Use end_date as analysis_date for the snapshot
    snapshot = InsightSnapshotCreate(
        business_line_id=payload.business_line_id,
        analysis_date=payload.end_date,
        topics=insights.topics,
        nodes=insights.nodes,
        edges=insights.edges,
        raw_data_summary=f"Historical analysis for {line.name} from {payload.start_date.date()} to {payload.end_date.date()} ({total} tweets, {len(payload.selected_user_ids)} users)",
    )
    return await snapshot_service.create_snapshot(snapshot)


@router.get("/reports", response_model=List[InsightSnapshotPublic])
async def list_historical_reports(
    business_line_id: Optional[str] = Query(None, description="Filter by business line"),
    limit: int = Query(50, ge=1, le=100),
    snapshot_service: InsightSnapshotService = Depends(InsightSnapshotService),
):
    """List all snapshots (admin only) - includes both public and private."""
    return await snapshot_service.list_snapshots(
        business_line_id=business_line_id,
        limit=limit,
        public_only=False,  # Admin can see all
    )


@router.put("/reports/{report_id}/visibility", response_model=InsightSnapshotPublic)
async def update_snapshot_visibility(
    report_id: str,
    is_public: bool = Query(..., description="Set to true to make public, false to make private"),
    snapshot_service: InsightSnapshotService = Depends(InsightSnapshotService),
):
    """Update snapshot visibility (admin only)."""
    return await snapshot_service.update_snapshot_visibility(report_id, is_public)


@router.delete("/reports/{report_id}", status_code=204)
async def delete_historical_report(
    report_id: str,
    snapshot_service: InsightSnapshotService = Depends(InsightSnapshotService),
):
    """Delete a historical report (admin only) - same as deleting a snapshot."""
    # Try to delete from snapshots collection first (since reports are now saved as snapshots)
    deleted = await snapshot_service.delete_snapshot(report_id)
    if deleted:
        return  # Successfully deleted from snapshots
    
    # Also try to delete from historical reports collection (for backward compatibility)
    deleted = await snapshot_service.delete_historical_report(report_id)
    if deleted:
        return  # Successfully deleted from historical reports
    
    # If we get here, the report was not found in either collection
    raise HTTPException(status_code=404, detail="Report not found")


# Public endpoints (no authentication required)
public_router = APIRouter()


@public_router.get("/snapshots", response_model=list[InsightSnapshotPublic])
async def list_public_snapshots(
    business_line_id: Optional[str] = Query(None, description="Filter by business line"),
    start_date: Optional[datetime] = Query(None, description="Start date filter"),
    end_date: Optional[datetime] = Query(None, description="End date filter"),
    limit: int = Query(50, ge=1, le=100),
    snapshot_service: InsightSnapshotService = Depends(InsightSnapshotService),
):
    """List insight snapshots (public endpoint) - only public snapshots."""
    return await snapshot_service.list_snapshots(
        business_line_id=business_line_id,
        start_date=start_date,
        end_date=end_date,
        limit=limit,
        public_only=True,  # Only show public snapshots
    )


@public_router.get("/snapshots/latest", response_model=Optional[InsightSnapshotPublic])
async def get_latest_snapshot(
    business_line_id: Optional[str] = Query(None, description="Filter by business line"),
    snapshot_service: InsightSnapshotService = Depends(InsightSnapshotService),
):
    """Get the latest snapshot (public endpoint) - only public snapshots."""
    return await snapshot_service.get_latest_snapshot(
        business_line_id=business_line_id, public_only=True
    )


@public_router.get("/snapshots/{snapshot_id}", response_model=InsightSnapshotPublic)
async def get_public_snapshot(
    snapshot_id: str,
    snapshot_service: InsightSnapshotService = Depends(InsightSnapshotService),
):
    """Get a specific insight snapshot (public endpoint)."""
    return await snapshot_service.get_snapshot(snapshot_id)


@public_router.get("/snapshots/{snapshot_id}/tweets", response_model=list)
async def get_snapshot_related_tweets(
    snapshot_id: str,
    node_id: str = Query(..., description="Node ID (e.g., 'user:username' or 'topic:TopicName')"),
    limit: int = Query(20, ge=1, le=100),
    snapshot_service: InsightSnapshotService = Depends(InsightSnapshotService),
    twitter_service: TwitterDataService = Depends(TwitterDataService),
    line_service: BusinessLineService = Depends(BusinessLineService),
):
    """Get tweets related to a specific node in a snapshot (public endpoint)."""
    snapshot = await snapshot_service.get_snapshot(snapshot_id)
    line = await line_service.get_line(snapshot.business_line_id)

    # Calculate time range (last 24 hours from analysis date)
    analysis_date = snapshot.analysis_date
    start = analysis_date - timedelta(hours=24)
    end = analysis_date

    # Fetch tweets for the business line
    _, all_docs = await twitter_service.fetch_tweets(
        line.members, start, end, skip=0, limit=500
    )

    # Filter tweets based on node type
    related_tweets = []
    if node_id.startswith("user:"):
        # Filter by username
        username = node_id.replace("user:", "")
        related_tweets = [
            doc
            for doc in all_docs
            if (doc.get("username") == username or doc.get("author") == username)
        ]
    elif node_id.startswith("topic:"):
        # Filter by topic keywords in content
        topic_name = node_id.replace("topic:", "")
        topic_lower = topic_name.lower()
        related_tweets = [
            doc
            for doc in all_docs
            if topic_lower in (doc.get("content", "") or "").lower()
        ]

    # Sort by created_at descending and limit
    related_tweets.sort(key=lambda x: x.get("created_at", ""), reverse=True)
    return related_tweets[:limit]

