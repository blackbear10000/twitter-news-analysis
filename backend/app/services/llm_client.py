import json
from typing import Any, Dict, List, Optional

import httpx

from ..core.config import get_settings


class LLMClient:
    """Unified LLM client supporting OpenAI, Deepseek, and Gemini."""

    def __init__(self):
        self.settings = get_settings()
        self.provider = self.settings.llm_provider.lower()

    async def generate_completion(
        self, prompt: str, system_prompt: Optional[str] = None, temperature: float = 0.7
    ) -> str:
        """Generate text completion using the configured LLM provider."""
        if self.provider == "openai":
            return await self._openai_completion(prompt, system_prompt, temperature)
        elif self.provider == "deepseek":
            return await self._deepseek_completion(prompt, system_prompt, temperature)
        elif self.provider == "gemini":
            return await self._gemini_completion(prompt, system_prompt, temperature)
        else:
            raise ValueError(f"Unsupported LLM provider: {self.provider}")

    async def _openai_completion(
        self, prompt: str, system_prompt: Optional[str], temperature: float
    ) -> str:
        """Generate completion using OpenAI API."""
        if not self.settings.openai_api_key:
            raise ValueError("OpenAI API key not configured")
        url = "https://api.openai.com/v1/chat/completions"
        headers = {
            "Authorization": f"Bearer {self.settings.openai_api_key}",
            "Content-Type": "application/json",
        }
        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": prompt})
        payload = {
            "model": self.settings.openai_model,
            "messages": messages,
            "temperature": temperature,
        }
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(url, headers=headers, json=payload)
            response.raise_for_status()
            data = response.json()
            return data["choices"][0]["message"]["content"]

    async def _deepseek_completion(
        self, prompt: str, system_prompt: Optional[str], temperature: float
    ) -> str:
        """Generate completion using Deepseek API."""
        if not self.settings.deepseek_api_key:
            raise ValueError("Deepseek API key not configured")
        url = f"{self.settings.deepseek_base_url}/v1/chat/completions"
        headers = {
            "Authorization": f"Bearer {self.settings.deepseek_api_key}",
            "Content-Type": "application/json",
        }
        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": prompt})
        payload = {
            "model": self.settings.deepseek_model,
            "messages": messages,
            "temperature": temperature,
        }
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(url, headers=headers, json=payload)
            response.raise_for_status()
            data = response.json()
            return data["choices"][0]["message"]["content"]

    async def _gemini_completion(
        self, prompt: str, system_prompt: Optional[str], temperature: float
    ) -> str:
        """Generate completion using Google Gemini API."""
        if not self.settings.gemini_api_key:
            raise ValueError("Gemini API key not configured")
        # Gemini uses a different API structure
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{self.settings.gemini_model}:generateContent?key={self.settings.gemini_api_key}"
        content_parts = []
        if system_prompt:
            content_parts.append(system_prompt)
        content_parts.append(prompt)
        payload = {
            "contents": [{"parts": [{"text": "\n\n".join(content_parts)}]}],
            "generationConfig": {"temperature": temperature},
        }
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(url, json=payload)
            response.raise_for_status()
            data = response.json()
            return data["candidates"][0]["content"]["parts"][0]["text"]

    async def analyze_topics(
        self, tweets: List[Dict[str, Any]], member_descriptions: Dict[str, str]
    ) -> List[Dict[str, Any]]:
        """Use LLM to analyze topics from tweets."""
        system_prompt = """You are an expert social media analyst. Analyze Twitter/X posts and identify key topics, themes, and trends.
Return your analysis as a JSON array of objects, each with:
- "topic": a concise topic name (2-5 words)
- "summary": a brief explanation (1-2 sentences)
- "score": a relevance score from 0.0 to 1.0
- "sentiment": sentiment analysis ("positive", "negative", or "neutral")
- "related_tweet_ids": array of tweet IDs (from the input) that are most relevant to this topic
- "related_user_ids": array of usernames who actively discussed this topic

Focus on identifying meaningful themes, not just hashtags. Consider context and member descriptions when available.
For related_tweet_ids, select the most representative tweets (5-10 per topic)."""
        tweet_texts = []
        for idx, tweet in enumerate(tweets[:100]):  # Limit to avoid token limits
            # Extract tweet ID - try multiple possible fields
            tweet_id = None
            if "_id" in tweet:
                tweet_id = str(tweet["_id"])
            elif "id" in tweet:
                tweet_id = str(tweet["id"])
            else:
                tweet_id = f"tweet_{idx}"
            
            username = tweet.get("username") or tweet.get("author", "unknown")
            content = tweet.get("content", "")
            desc = member_descriptions.get(username, "")
            if desc:
                tweet_texts.append(f"[ID:{tweet_id}] [{username} ({desc})]: {content}")
            else:
                tweet_texts.append(f"[ID:{tweet_id}] [{username}]: {content}")
        prompt = f"""Analyze the following Twitter posts and identify the top 5-8 key topics:

{chr(10).join(tweet_texts)}

Return only valid JSON array, no additional text."""
        try:
            response = await self.generate_completion(prompt, system_prompt, temperature=0.5)
            # Try to extract JSON from response
            response = response.strip()
            if response.startswith("```json"):
                response = response[7:]
            if response.startswith("```"):
                response = response[3:]
            if response.endswith("```"):
                response = response[:-3]
            response = response.strip()
            topics = json.loads(response)
            if not isinstance(topics, list):
                topics = [topics]
            return topics
        except Exception as e:
            # Fallback to simple keyword extraction
            return self._fallback_topic_extraction(tweets)

    async def analyze_key_persons(
        self, tweets: List[Dict[str, Any]], member_descriptions: Dict[str, str]
    ) -> Dict[str, Any]:
        """Use LLM to identify key persons and their relationships."""
        system_prompt = """You are an expert network analyst. Analyze Twitter/X posts to identify key persons (users) and their relationships/interactions.
Return your analysis as a JSON object with:
- "key_persons": array of objects with "username", "role_description", "importance_score" (0.0-1.0)
- "relationships": array of objects with:
  - "source": source username
  - "target": target username or topic name
  - "relationship_type": one of "retweet", "reply", "quote", "mention", "topic_discussion", "collaboration"
  - "strength": relationship strength (0.0-1.0)
  - "sentiment": optional sentiment ("support", "oppose", "neutral")
  - "related_tweet_ids": array of tweet IDs that establish this relationship

Relationship types:
- "retweet": direct retweet relationship
- "reply": direct reply relationship
- "quote": quote tweet relationship
- "mention": user mentioned in tweet
- "topic_discussion": users discussing the same topic (indirect relationship)
- "collaboration": users showing collaborative behavior

For topic_discussion relationships, connect users who discuss the same topics, especially if they show agreement or disagreement."""
        tweet_texts = []
        for idx, tweet in enumerate(tweets[:100]):
            # Extract tweet ID
            tweet_id = None
            if "_id" in tweet:
                tweet_id = str(tweet["_id"])
            elif "id" in tweet:
                tweet_id = str(tweet["id"])
            else:
                tweet_id = f"tweet_{idx}"
            
            username = tweet.get("username") or tweet.get("author", "unknown")
            content = tweet.get("content", "")
            desc = member_descriptions.get(username, "")
            
            # Include interaction metadata
            interaction_info = []
            if tweet.get("is_retweet"):
                original_author = tweet.get("original_author", "unknown")
                interaction_info.append(f"RETWEETED from @{original_author}")
            if tweet.get("is_reply"):
                interaction_info.append("REPLY")
            if tweet.get("is_quoted"):
                original_author = tweet.get("original_author", "unknown")
                original_content = tweet.get("original_content", "")
                interaction_info.append(f"QUOTED @{original_author}: {original_content[:100]}")
            
            interaction_str = " | ".join(interaction_info) if interaction_info else ""
            
            if desc:
                tweet_texts.append(f"[ID:{tweet_id}] [{username} ({desc})]{' ' + interaction_str + ' ' if interaction_str else ''}: {content}")
            else:
                tweet_texts.append(f"[ID:{tweet_id}] [{username}]{' ' + interaction_str + ' ' if interaction_str else ''}: {content}")
        prompt = f"""Analyze the following Twitter posts to identify key persons and their relationships.
Pay special attention to:
1. Retweet relationships: who retweets whom (indicates support/amplification)
2. Reply relationships: who replies to whom (indicates engagement/discussion)
3. Quote relationships: who quotes whom (indicates commentary/response)
4. Topic connections: users discussing the same topics
5. Sentiment: identify if relationships show support, opposition, or neutral stance

{chr(10).join(tweet_texts)}

Return only valid JSON object, no additional text."""
        try:
            response = await self.generate_completion(prompt, system_prompt, temperature=0.5)
            response = response.strip()
            if response.startswith("```json"):
                response = response[7:]
            if response.startswith("```"):
                response = response[3:]
            if response.endswith("```"):
                response = response[:-3]
            response = response.strip()
            return json.loads(response)
        except Exception as e:
            # Fallback to simple user counting
            return self._fallback_key_person_extraction(tweets)

    def _fallback_topic_extraction(self, tweets: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Fallback topic extraction using simple keyword counting."""
        from collections import Counter

        hashtags = Counter()
        for tweet in tweets:
            content = tweet.get("content", "")
            for word in content.split():
                if word.startswith("#") and len(word) > 1:
                    hashtags[word.lower()] += 1
        return [
            {"topic": tag, "summary": f"Topic related to {tag}", "score": min(count / 10.0, 1.0)}
            for tag, count in hashtags.most_common(5)
        ]

    def _fallback_key_person_extraction(
        self, tweets: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """Fallback key person extraction using simple counting."""
        from collections import Counter

        user_counts = Counter()
        for tweet in tweets:
            username = tweet.get("username") or tweet.get("author", "unknown")
            user_counts[username] += 1
        key_persons = [
            {
                "username": user,
                "role_description": "Active contributor",
                "importance_score": min(count / 20.0, 1.0),
            }
            for user, count in user_counts.most_common(10)
        ]
        return {"key_persons": key_persons, "relationships": []}

