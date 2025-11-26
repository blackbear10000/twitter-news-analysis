from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status

from ..core.deps import get_current_user
from ..schemas.insights import InsightSnapshotCreate, InsightSnapshotPublic, InsightsResponse
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
    """List insight snapshots (public endpoint)."""
    return await snapshot_service.list_snapshots(
        business_line_id=business_line_id,
        start_date=start_date,
        end_date=end_date,
        limit=limit,
    )


@public_router.get("/snapshots/latest", response_model=Optional[InsightSnapshotPublic])
async def get_latest_snapshot(
    business_line_id: Optional[str] = Query(None, description="Filter by business line"),
    snapshot_service: InsightSnapshotService = Depends(InsightSnapshotService),
):
    """Get the latest snapshot (public endpoint)."""
    return await snapshot_service.get_latest_snapshot(business_line_id=business_line_id)


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

