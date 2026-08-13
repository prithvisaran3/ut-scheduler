from fastapi import APIRouter

from app.api.v1.routers import auth, bookings, pathways, schedule

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(auth.router)
api_router.include_router(schedule.router)
api_router.include_router(pathways.router)
api_router.include_router(bookings.router)
