from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .core.config import get_settings
from .core.database import mongo_manager
from .routers import auth, biz_lines, insights, tweets
from .routers.insights import public_router
from .schemas.user import UserCreate
from .services.user_service import UserService


def create_app() -> FastAPI:
    settings = get_settings()
    application = FastAPI(title=settings.app_name)

    application.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    application.include_router(auth.router, prefix="/api/auth", tags=["auth"])
    application.include_router(biz_lines.router, prefix="/api/biz", tags=["business-lines"])
    application.include_router(tweets.router, prefix="/api/tweets", tags=["tweets"])
    application.include_router(insights.router, prefix="/api/insights", tags=["insights"])
    # Public endpoints for visualization
    application.include_router(
        public_router, prefix="/api/public/insights", tags=["public-insights"]
    )

    @application.on_event("startup")
    async def startup_event():
        mongo_manager.init_clients()
        user_service = UserService()
        await user_service.ensure_admin_user(
            UserCreate(
                username=settings.default_admin_username,
                password=settings.default_admin_password,
            )
        )

    return application


app = create_app()

