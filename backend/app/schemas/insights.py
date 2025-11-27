from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, Field


class GraphNode(BaseModel):
    id: str
    label: str
    type: str
    weight: float = Field(ge=0)


class GraphEdge(BaseModel):
    source: str
    target: str
    weight: float = Field(ge=0)


class TopicSummary(BaseModel):
    topic: str
    summary: str
    score: float


class InsightsResponse(BaseModel):
    topics: List[TopicSummary]
    nodes: List[GraphNode]
    edges: List[GraphEdge]


class InsightSnapshotCreate(BaseModel):
    business_line_id: str
    analysis_date: datetime
    topics: List[TopicSummary]
    nodes: List[GraphNode]
    edges: List[GraphEdge]
    raw_data_summary: Optional[str] = None


class InsightSnapshotPublic(BaseModel):
    id: str
    business_line_id: str
    business_line_name: Optional[str] = None
    analysis_date: datetime
    topics: List[TopicSummary]
    nodes: List[GraphNode]
    edges: List[GraphEdge]
    raw_data_summary: Optional[str] = None
    created_at: datetime
    is_public: bool = Field(default=False, description="Whether this snapshot is publicly visible")
    report_type: Optional[str] = Field(default="snapshot", description="Type of report: snapshot or historical")


class HistoricalReportCreate(BaseModel):
    business_line_id: str
    selected_user_ids: List[str]
    start_date: datetime
    end_date: datetime


class HistoricalReportPublic(BaseModel):
    id: str
    business_line_id: str
    business_line_name: Optional[str] = None
    selected_user_ids: List[str]
    start_date: datetime
    end_date: datetime
    topics: List[TopicSummary]
    nodes: List[GraphNode]
    edges: List[GraphEdge]
    raw_data_summary: Optional[str] = None
    created_at: datetime

