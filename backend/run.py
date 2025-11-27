#!/usr/bin/env python3
"""Backend server startup script that reads port from environment variables."""
import os
import uvicorn

from app.core.config import get_settings

if __name__ == "__main__":
    settings = get_settings()
    # Use reload only in development (not in Docker)
    use_reload = os.getenv("ENVIRONMENT", "development") == "development"
    uvicorn.run(
        "app.main:app",
        host=settings.server_host,
        port=settings.server_port,
        reload=use_reload,
    )

