from typing import Optional

from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase

from .config import get_settings


class MongoManager:
    """Lazy Mongo client holder so FastAPI can reuse connections."""

    def __init__(self) -> None:
        self._twitter_client: Optional[AsyncIOMotorClient] = None
        self._biz_client: Optional[AsyncIOMotorClient] = None

    def init_clients(self) -> None:
        settings = get_settings()
        if self._twitter_client is None:
            self._twitter_client = AsyncIOMotorClient(settings.mongo_twitter_uri)
        if self._biz_client is None:
            # Allow separate URI in case of future split clusters
            self._biz_client = AsyncIOMotorClient(settings.mongo_biz_uri)

    @property
    def twitter_db(self) -> AsyncIOMotorDatabase:
        if self._twitter_client is None:
            self.init_clients()
        settings = get_settings()
        return self._twitter_client[settings.mongo_twitter_db]

    @property
    def biz_db(self) -> AsyncIOMotorDatabase:
        if self._biz_client is None:
            self.init_clients()
        settings = get_settings()
        return self._biz_client[settings.mongo_biz_db]


mongo_manager = MongoManager()


def get_twitter_db() -> AsyncIOMotorDatabase:
    return mongo_manager.twitter_db


def get_biz_db() -> AsyncIOMotorDatabase:
    return mongo_manager.biz_db

