from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from backend.database import decode_json, encode_json, get_db, now_iso
from backend.schemas import FieldMappingSave

router = APIRouter(prefix="/api/field-mapping", tags=["field_mapping"])


def _ensure_scene(conn, scene_id: str) -> None:
    if not conn.execute("SELECT id FROM scenes WHERE id=?", (scene_id,)).fetchone():
        raise HTTPException(status_code=404, detail="场景不存在")


@router.get("")
def get_field_mapping(scene_id: str = Query(...)):
    with get_db() as conn:
        _ensure_scene(conn, scene_id)
        row = conn.execute("SELECT * FROM field_mappings WHERE scene_id=?", (scene_id,)).fetchone()
    if not row:
        return {
            "scene_id": scene_id,
            "human_answer_column": "",
            "model_answer_column": "",
            "visible_columns": [],
            "annotation_columns": [],
        }
    row["visible_columns"] = decode_json(row["visible_columns"], [])
    row["annotation_columns"] = decode_json(row["annotation_columns"], [])
    return row


@router.put("")
def save_field_mapping(payload: FieldMappingSave):
    timestamp = now_iso()
    with get_db() as conn:
        _ensure_scene(conn, payload.scene_id)
        conn.execute(
            """
            INSERT INTO field_mappings(
                scene_id,
                human_answer_column,
                model_answer_column,
                visible_columns,
                annotation_columns,
                updated_at
            )
            VALUES(?, ?, ?, ?, ?, ?)
            ON CONFLICT(scene_id) DO UPDATE SET
                human_answer_column=excluded.human_answer_column,
                model_answer_column=excluded.model_answer_column,
                visible_columns=excluded.visible_columns,
                annotation_columns=excluded.annotation_columns,
                updated_at=excluded.updated_at
            """,
            (
                payload.scene_id,
                payload.human_answer_column,
                payload.model_answer_column,
                encode_json(payload.visible_columns),
                encode_json(payload.annotation_columns),
                timestamp,
            ),
        )
    return get_field_mapping(payload.scene_id)
