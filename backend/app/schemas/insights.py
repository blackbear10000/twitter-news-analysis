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
    relationship_type: Optional[str] = Field(None, description="Type: 'retweet', 'reply', 'quote', 'mention', 'topic_discussion', 'collaboration'")
    sentiment: Optional[str] = Field(None, description="Sentiment: 'support', 'oppose', 'neutral'")
    # For topic-related edges, store related tweet IDs
    related_tweet_ids: List[str] = Field(default_factory=list, description="Tweet IDs that establish this relationship")


class TopicSummary(BaseModel):
    topic: str
    summary: str
    score: float
    sentiment: Optional[str] = Field(None, description="Sentiment: 'positive', 'negative', 'neutral'")
    # Store associated tweet IDs for direct linking
    related_tweet_ids: List[str] = Field(default_factory=list, description="Tweet IDs related to this topic")
    # Store associated user IDs for graph connections
    related_user_ids: List[str] = Field(default_factory=list, description="User IDs who discussed this topic")


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

