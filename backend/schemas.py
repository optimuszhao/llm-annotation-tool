from __future__ import annotations

from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, Field


class SceneCreate(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    description: str = ""


class PromptCreate(BaseModel):
    scene_id: str
    name: str
    role_name: str
    content: str
    source_file: Optional[str] = None


class KnowledgeCreate(BaseModel):
    scene_id: str
    name: str
    content: str
    source_file: Optional[str] = None


class ErrorSetCreate(BaseModel):
    scene_id: str
    name: str
    description: str = ""


class SchemeCreate(BaseModel):
    scene_id: str
    name: str
    model_key: str
    method_name: str
    concurrency: int = Field(default=1, ge=1, le=50)
    prompt_ids: List[str] = []
    knowledge_ids: List[str] = []
    error_set_ids: List[str] = []


class ResourceTypeCreate(BaseModel):
    resource_type: Literal["prompt", "knowledge", "error_set"]
    resource_id: str
    sort_order: int = 0


class PageResult(BaseModel):
    data: List[Dict[str, Any]]
    total: int
    page: int
    page_size: int
    last_page: int
    columns: List[str]
