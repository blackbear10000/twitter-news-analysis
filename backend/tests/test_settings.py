from app.core.config import get_settings


def test_default_settings():
    settings = get_settings()
    assert settings.app_name == "Twitter Insights"
    assert settings.mongo_twitter_db == "twitter_data"
    assert settings.mongo_biz_db == "biz_meta"

