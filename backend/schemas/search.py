from pydantic import BaseModel
from uuid import UUID
from typing import Optional


class CandidateSearchResult(BaseModel):
    id: UUID
    name: str
    email: str
    phone: str
    match_score: Optional[int] = None
    quick_match_score: Optional[float] = None
    similarity_score: float
    status: str

    model_config = {"from_attributes": True}


class ClusterResult(BaseModel):
    cluster_id: int
    candidate_ids: list[UUID]
    centroid_skills: list[str]
    size: int
