from fastapi import APIRouter, Depends

from ..core.deps import get_current_user
from ..schemas.business_line import (
    BusinessLineCreate,
    BusinessLinePublic,
    BusinessLineUpdate,
)
from ..schemas.member import MemberCreate, MemberPublic, MemberUpdate
from ..services.biz_meta import BusinessLineService
from ..services.twitter_data import TwitterDataService

router = APIRouter(dependencies=[Depends(get_current_user)])


@router.get("/", response_model=list[BusinessLinePublic])
async def list_business_lines(service: BusinessLineService = Depends(BusinessLineService)):
    return await service.list_lines()


@router.post("/", response_model=BusinessLinePublic, status_code=201)
async def create_business_line(
    payload: BusinessLineCreate, service: BusinessLineService = Depends(BusinessLineService)
):
    return await service.create_line(payload)


@router.get("/{line_id}", response_model=BusinessLinePublic)
async def get_business_line(line_id: str, service: BusinessLineService = Depends(BusinessLineService)):
    return await service.get_line(line_id)


@router.put("/{line_id}", response_model=BusinessLinePublic)
async def update_business_line(
    line_id: str,
    payload: BusinessLineUpdate,
    service: BusinessLineService = Depends(BusinessLineService),
):
    return await service.update_line(line_id, payload)


@router.delete("/{line_id}", status_code=204)
async def delete_business_line(line_id: str, service: BusinessLineService = Depends(BusinessLineService)):
    await service.delete_line(line_id)


# Member management endpoints
@router.get("/{line_id}/members", response_model=list[MemberPublic])
async def list_members(
    line_id: str, service: BusinessLineService = Depends(BusinessLineService)
):
    return await service.list_members(line_id)


@router.post("/{line_id}/members", response_model=MemberPublic, status_code=201)
async def create_member(
    line_id: str,
    payload: MemberCreate,
    service: BusinessLineService = Depends(BusinessLineService),
):
    payload.business_line_id = line_id
    return await service.create_member(payload)


@router.get("/members/{member_id}", response_model=MemberPublic)
async def get_member(
    member_id: str, service: BusinessLineService = Depends(BusinessLineService)
):
    return await service.get_member(member_id)


@router.put("/members/{member_id}", response_model=MemberPublic)
async def update_member(
    member_id: str,
    payload: MemberUpdate,
    service: BusinessLineService = Depends(BusinessLineService),
):
    return await service.update_member(member_id, payload)


@router.delete("/members/{member_id}", status_code=204)
async def delete_member(
    member_id: str, service: BusinessLineService = Depends(BusinessLineService)
):
    await service.delete_member(member_id)


@router.post("/members/{member_id}/update-count", response_model=MemberPublic)
async def update_member_tweet_count(
    member_id: str,
    service: BusinessLineService = Depends(BusinessLineService),
    twitter_service: TwitterDataService = Depends(TwitterDataService),
):
    """Update tweet count for a specific member."""
    return await service.update_member_tweet_count(member_id, twitter_service)


@router.post("/{line_id}/members/update-all-counts")
async def update_all_members_tweet_count(
    line_id: str,
    service: BusinessLineService = Depends(BusinessLineService),
    twitter_service: TwitterDataService = Depends(TwitterDataService),
):
    """Update tweet counts for all members in a business line."""
    updated = await service.update_all_members_tweet_count(line_id, twitter_service)
    return {"updated": updated}

