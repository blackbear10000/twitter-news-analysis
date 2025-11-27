from collections import Counter, defaultdict
from datetime import datetime, timedelta
from typing import Dict, List, Tuple

from ..schemas.business_line import BusinessLinePublic
from ..schemas.insights import GraphEdge, GraphNode, InsightsResponse, TopicSummary
from ..services.biz_meta import BusinessLineService
from ..services.llm_client import LLMClient
from ..services.twitter_data import TwitterDataService


class InsightsService:
    def __init__(
        self,
        twitter_service: TwitterDataService,
        llm_client: LLMClient = None,
        biz_service: BusinessLineService = None,
    ):
        self.twitter_service = twitter_service
        self.llm_client = llm_client or LLMClient()
        self.biz_service = biz_service

    async def generate_insights(
        self, line: BusinessLinePublic, hours: int, use_llm: bool = True
    ) -> InsightsResponse:
        """Generate insights using LLM if available, otherwise fallback to simple analysis."""
        end = datetime.utcnow()
        start = end - timedelta(hours=hours)
        _, docs = await self.twitter_service.fetch_tweets(
            line.members, start, end, skip=0, limit=500
        )

        if not docs:
            return InsightsResponse(topics=[], nodes=[], edges=[])

        # Get member descriptions for LLM contextkey
        member_descriptions: Dict[str, str] = {}
        if self.biz_service:
            try:
                member_descriptions = await self.biz_service._fetch_members_with_descriptions(
                    line.id
                )
            except Exception:
                pass

        if use_llm:
            try:
                return await self._generate_llm_insights(docs, member_descriptions)
            except Exception as e:
                # Fallback to simple analysis if LLM fails
                print(f"LLM analysis failed, using fallback: {e}")
                return await self._generate_simple_insights(docs)

        return await self._generate_simple_insights(docs)

    async def generate_insights_for_tweets(
        self, docs: List[Dict], member_descriptions: Dict[str, str], use_llm: bool = True
    ) -> InsightsResponse:
        """Generate insights for a given list of tweets (used for historical reports)."""
        if not docs:
            return InsightsResponse(topics=[], nodes=[], edges=[])

        if use_llm:
            try:
                return await self._generate_llm_insights(docs, member_descriptions)
            except Exception as e:
                print(f"LLM analysis failed, using fallback: {e}")
                return await self._generate_simple_insights(docs)

        return await self._generate_simple_insights(docs)

    async def _generate_llm_insights(
        self, docs: List[Dict], member_descriptions: Dict[str, str]
    ) -> InsightsResponse:
        """Generate insights using LLM."""
        # Map twitter_id to username for descriptions
        username_to_desc = {}
        for doc in docs:
            username = doc.get("username") or doc.get("author", "unknown")
            twitter_id = doc.get("business_line_user_id", "")
            if twitter_id in member_descriptions:
                username_to_desc[username] = member_descriptions[twitter_id]

        # Create a mapping of tweet IDs to documents for validation
        tweet_id_to_doc = {}
        for idx, doc in enumerate(docs):
            tweet_id = None
            if "_id" in doc:
                tweet_id = str(doc["_id"])
            elif "id" in doc:
                tweet_id = str(doc["id"])
            else:
                tweet_id = f"tweet_{idx}"
            tweet_id_to_doc[tweet_id] = doc

        # Analyze topics using LLM
        topic_data = await self.llm_client.analyze_topics(docs, username_to_desc)
        topic_summaries = []
        for item in topic_data:
            # Extract and validate related tweet IDs
            related_tweet_ids = item.get("related_tweet_ids", [])
            if not isinstance(related_tweet_ids, list):
                related_tweet_ids = []
            # Filter to only include IDs that exist in our documents
            valid_tweet_ids = [
                tid for tid in related_tweet_ids
                if tid in tweet_id_to_doc
            ]
            
            # Extract related user IDs
            related_user_ids = item.get("related_user_ids", [])
            if not isinstance(related_user_ids, list):
                related_user_ids = []
            
            topic_summaries.append(
                TopicSummary(
                    topic=item.get("topic", "Unknown"),
                    summary=item.get("summary", ""),
                    score=float(item.get("score", 0.5)),
                    sentiment=item.get("sentiment"),
                    related_tweet_ids=valid_tweet_ids,
                    related_user_ids=related_user_ids,
                )
            )

        # Analyze key persons using LLM
        key_person_data = await self.llm_client.analyze_key_persons(docs, username_to_desc)
        key_persons = key_person_data.get("key_persons", [])
        relationships = key_person_data.get("relationships", [])

        # Build nodes
        nodes: List[GraphNode] = []
        user_weights: Dict[str, float] = {}
        for person in key_persons:
            username = person.get("username", "unknown")
            score = float(person.get("importance_score", 0.5))
            user_weights[username] = score
            nodes.append(
                GraphNode(
                    id=f"user:{username}",
                    label=username,
                    type="user",
                    weight=score,
                )
            )

        for topic in topic_summaries:
            nodes.append(
                GraphNode(
                    id=f"topic:{topic.topic}",
                    label=topic.topic,
                    type="topic",
                    weight=topic.score,
                )
            )

        # Build a set of valid node IDs for validation
        valid_node_ids = {node.id for node in nodes}

        # Build edges from relationships (can be user-user, user-topic, or topic-topic)
        edges: List[GraphEdge] = []
        for rel in relationships:
            source = rel.get("source", "")
            target = rel.get("target", "")
            strength = float(rel.get("strength", 0.5))
            relationship_type = rel.get("relationship_type", "")
            sentiment = rel.get("sentiment")
            related_tweet_ids = rel.get("related_tweet_ids", [])
            if not isinstance(related_tweet_ids, list):
                related_tweet_ids = []
            # Validate tweet IDs
            valid_related_tweet_ids = [
                tid for tid in related_tweet_ids
                if tid in tweet_id_to_doc
            ]
            
            if source and target:
                # Determine node IDs based on relationship type and source/target format
                # LLM may return usernames or topic names
                if source.startswith("topic:") or source in [t.topic for t in topic_summaries]:
                    # Source is a topic
                    source_topic = source.replace("topic:", "") if source.startswith("topic:") else source
                    source_id = f"topic:{source_topic}"
                else:
                    # Source is a user
                    source_id = f"user:{source}"
                
                if target.startswith("topic:") or target in [t.topic for t in topic_summaries]:
                    # Target is a topic
                    target_topic = target.replace("topic:", "") if target.startswith("topic:") else target
                    target_id = f"topic:{target_topic}"
                else:
                    # Target is a user
                    target_id = f"user:{target}"
                
                # Only add edge if both nodes exist
                if source_id in valid_node_ids and target_id in valid_node_ids:
                    edges.append(
                        GraphEdge(
                            source=source_id,
                            target=target_id,
                            weight=strength,
                            relationship_type=relationship_type if relationship_type else None,
                            sentiment=sentiment,
                            related_tweet_ids=valid_related_tweet_ids,
                        )
                    )

        # Add user-topic edges based on LLM's related_user_ids in TopicSummary
        # This ensures all topics are connected to their related users
        existing_user_topic_edges = {
            (e.source, e.target) for e in edges
            if e.source.startswith("user:") and e.target.startswith("topic:")
        }
        
        for topic in topic_summaries:
            target_id = f"topic:{topic.topic}"
            for username in topic.related_user_ids:
                source_id = f"user:{username}"
                # Only add edge if both nodes exist and edge doesn't already exist
                if (source_id in valid_node_ids and target_id in valid_node_ids and 
                    (source_id, target_id) not in existing_user_topic_edges):
                    edges.append(
                        GraphEdge(
                            source=source_id,
                            target=target_id,
                            weight=topic.score * 0.8,  # Weight based on topic score
                            relationship_type="topic_discussion",
                            related_tweet_ids=topic.related_tweet_ids[:5],  # Include some tweet IDs
                        )
                    )

        # Add user-topic edges based on topic mentions in user tweets (fallback if LLM didn't provide)
        user_topic_counts: Dict[Tuple[str, str], int] = defaultdict(int)
        for doc in docs:
            username = doc.get("username") or doc.get("author", "unknown")
            content = doc.get("content", "").lower()
            for topic in topic_summaries:
                topic_lower = topic.topic.lower()
                if topic_lower in content:
                    user_topic_counts[(username, topic.topic)] += 1

        # Only add user-topic edges if they don't already exist
        for (username, topic_name), count in user_topic_counts.items():
            if username in user_weights:
                source_id = f"user:{username}"
                target_id = f"topic:{topic_name}"
                # Only add edge if both nodes exist and edge doesn't already exist
                if (source_id in valid_node_ids and target_id in valid_node_ids and 
                    (source_id, target_id) not in existing_user_topic_edges):
                    edges.append(
                        GraphEdge(
                            source=source_id,
                            target=target_id,
                            weight=min(count / 5.0, 1.0),
                            relationship_type="topic_discussion",
                        )
                    )

        return InsightsResponse(topics=topic_summaries, nodes=nodes, edges=edges)

    async def _generate_simple_insights(self, docs: List[Dict]) -> InsightsResponse:
        """Fallback simple insights generation."""
        topics_counter = Counter()
        edges: Dict[Tuple[str, str], int] = defaultdict(int)
        user_weights: Counter = Counter()

        for doc in docs:
            content = doc.get("content", "")
            username = doc.get("username") or doc.get("author") or "unknown"
            user_weights[username] += 1
            for token in content.split():
                if token.startswith("#") and len(token) > 1:
                    normalized = token.lower()
                    topics_counter[normalized] += 1
                    edges[(username, normalized)] += 1

        top_topics = topics_counter.most_common(5)
        topic_summaries = [
            TopicSummary(topic=topic, summary=f"#{topic.strip('#')}", score=count)
            for topic, count in top_topics
        ]

        nodes: List[GraphNode] = []
        for user, weight in user_weights.most_common():
            nodes.append(
                GraphNode(id=f"user:{user}", label=user, type="user", weight=float(weight))
            )
        for topic, weight in top_topics:
            nodes.append(
                GraphNode(id=f"topic:{topic}", label=topic, type="topic", weight=float(weight))
            )

        edge_models = [
            GraphEdge(
                source=f"user:{source}",
                target=f"topic:{target}",
                weight=float(weight),
            )
            for (source, target), weight in edges.items()
            if topics_counter[target] > 0
        ]

        return InsightsResponse(topics=topic_summaries, nodes=nodes, edges=edge_models)

