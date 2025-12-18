from fastapi import FastAPI, APIRouter
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional
import uuid
from datetime import datetime, timezone


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

app = FastAPI()
api_router = APIRouter(prefix="/api")


class Route(BaseModel):
    model_config = ConfigDict(extra="ignore")
    
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    destinations: List[dict]
    transport_mode: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class RouteCreate(BaseModel):
    destinations: List[dict]
    transport_mode: str


@api_router.get("/")
async def root():
    return {"message": "Journey Mapper API"}


@api_router.post("/routes", response_model=Route)
async def create_route(route_input: RouteCreate):
    route_dict = route_input.model_dump()
    route_obj = Route(**route_dict)
    
    doc = route_obj.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    
    _ = await db.routes.insert_one(doc)
    return route_obj


@api_router.get("/routes", response_model=List[Route])
async def get_routes():
    routes = await db.routes.find({}, {"_id": 0}).to_list(100)
    
    for route in routes:
        if isinstance(route['created_at'], str):
            route['created_at'] = datetime.fromisoformat(route['created_at'])
    
    return routes


app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()