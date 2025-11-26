from fastapi import APIRouter, Depends, HTTPException, status

from ..core.deps import get_current_user
from ..core.security import create_access_token
from ..schemas.auth import LoginRequest, TokenResponse
from ..schemas.user import UserPublic
from ..services.user_service import UserService

router = APIRouter()


@router.post("/token", response_model=TokenResponse)
async def login_for_access_token(
    payload: LoginRequest, user_service: UserService = Depends(UserService)
):
    user = await user_service.verify_user(payload.username, payload.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Incorrect credentials"
        )
    token = create_access_token(user.username)
    return TokenResponse(access_token=token)


@router.get("/me", response_model=UserPublic)
async def read_current_user(current_user=Depends(get_current_user)):
    return UserPublic(username=current_user.username, role=current_user.role)

