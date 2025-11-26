from functools import lru_cache
from pydantic import Field
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    app_name: str = Field(default="Twitter Insights")
    secret_key: str = Field(default="change-me-secret")
    access_token_expire_minutes: int = Field(default=60 * 12)
    default_admin_username: str = Field(default="admin")
    default_admin_password: str = Field(default="ChangeMe123!")

    mongo_twitter_uri: str = Field(default="mongodb://localhost:27017")
    mongo_twitter_db: str = Field(default="twitter_data")
    mongo_biz_uri: str = Field(default="mongodb://localhost:27017")
    mongo_biz_db: str = Field(default="biz_meta")

    # LLM Configuration
    llm_provider: str = Field(default="openai", description="LLM provider: openai, deepseek, gemini")
    openai_api_key: str = Field(default="", description="OpenAI API key")
    openai_model: str = Field(default="gpt-4o-mini", description="OpenAI model name")
    deepseek_api_key: str = Field(default="", description="Deepseek API key")
    deepseek_model: str = Field(default="deepseek-chat", description="Deepseek model name")
    deepseek_base_url: str = Field(default="https://api.deepseek.com", description="Deepseek API base URL")
    gemini_api_key: str = Field(default="", description="Google Gemini API key")
    gemini_model: str = Field(default="gemini-pro", description="Gemini model name")

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        case_sensitive = False


@lru_cache
def get_settings() -> Settings:
    return Settings()

