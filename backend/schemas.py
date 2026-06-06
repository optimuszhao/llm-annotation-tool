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
    model_key: str = "configured"
    method_name: str
    prompt_init_type: Literal["auto", "custom"] = "auto"
    prompt_init_method_name: str = ""
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


class FieldMappingSave(BaseModel):
    scene_id: str
    human_answer_column: str = ""
    model_answer_column: str = ""
    visible_columns: List[str] = []
    annotation_columns: List[str] = []


class AnnotationTaskCreate(BaseModel):
    dataset_id: str
    scheme_id: str
    row_ids: List[str] = []
    mode: Literal["all", "selected"] = "all"


class EvaluationTaskCreate(BaseModel):
    scene_id: str
    dataset_id: str
    scheme_ids: List[str] = Field(min_length=1, max_length=4)
    name: str = ""


class EvaluationTaskItemCreate(BaseModel):
    annotation_task_id: str


class AnalysisCreate(BaseModel):
    task_row_id: Optional[str] = None


class ModelDistillationRun(BaseModel):
    dataset_id: str
    scene_id: str = ""
    scheme_id: str = ""
    method_name: str
    row_ids: List[str] = []


class ModelMarketConfigCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    url: str = Field(min_length=1)
    api_key: str = ""
    model_name: str = ""
