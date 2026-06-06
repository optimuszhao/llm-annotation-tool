from __future__ import annotations

from fastapi import HTTPException

from backend.database import decode_json, get_db
from user_hooks import hooks


def list_distillation_methods() -> dict:
    return hooks.list_distillation_methods()


def run_model_distillation(payload: dict) -> dict:
    dataset_id = str(payload.get("dataset_id") or "").strip()
    scene_id = str(payload.get("scene_id") or "").strip()
    scheme_id = str(payload.get("scheme_id") or "").strip()
    method_name = str(payload.get("method_name") or "").strip()
    row_ids = [str(row_id) for row_id in payload.get("row_ids") or [] if str(row_id).strip()]
    if not dataset_id:
        raise HTTPException(status_code=400, detail="缺少数据集 ID")
    if not row_ids:
        raise HTTPException(status_code=400, detail="请先选择需要蒸馏的数据行")

    with get_db() as conn:
        dataset = conn.execute("SELECT * FROM datasets WHERE id=?", (dataset_id,)).fetchone()
        if not dataset:
            raise HTTPException(status_code=404, detail="数据集不存在")
        scene = conn.execute("SELECT * FROM scenes WHERE id=?", (dataset["scene_id"],)).fetchone()
        if not scene:
            raise HTTPException(status_code=404, detail="场景不存在")
        if scene_id and scene_id != scene["id"]:
            raise HTTPException(status_code=400, detail="数据集与当前场景不匹配")
        scheme = None
        if scheme_id:
            scheme = conn.execute("SELECT * FROM schemes WHERE id=? AND scene_id=?", (scheme_id, scene["id"])).fetchone()
            if not scheme:
                raise HTTPException(status_code=404, detail="标注方案不存在")
        field_mapping = conn.execute(
            "SELECT * FROM field_mappings WHERE scene_id=?",
            (scene["id"],),
        ).fetchone()
        rows = _load_distillation_rows(conn, scene["data_table_name"], dataset_id, row_ids, scheme_id)

    context = {
        "dataset_id": dataset_id,
        "scene_id": scene["id"],
        "scheme_id": scheme_id,
        "dataset": {
            "id": dataset["id"],
            "name": dataset["name"],
            "row_count": dataset["row_count"],
        },
        "scene": {
            "id": scene["id"],
            "name": scene["name"],
            "description": scene.get("description", ""),
        },
        "scheme": {
            "id": scheme["id"],
            "name": scheme["name"],
            "method_name": scheme["method_name"],
        } if scheme else {},
        "field_mapping": _format_field_mapping(field_mapping),
        "selected_count": len(rows),
    }
    candidates = hooks.run_distillation_method(method_name, rows, context)
    normalized = _normalize_candidates(candidates)
    return {
        "ok": True,
        "method_name": method_name or "mock_distill",
        "row_count": len(rows),
        "items": normalized,
    }


def _load_distillation_rows(conn, table_name: str, dataset_id: str, row_ids: list[str], scheme_id: str) -> list[dict]:
    placeholders = ", ".join(["?"] * len(row_ids))
    order_by_ids = {row_id: index for index, row_id in enumerate(row_ids)}
    if scheme_id:
        rows = conn.execute(
            f"""
            WITH latest_scheme_rows AS (
              SELECT row_id, status, model_result, analysis_data, rendered_prompt
              FROM (
                SELECT
                  task_row.row_id,
                  task_row.status,
                  task_row.model_result,
                  task_row.analysis_data,
                  task_row.rendered_prompt,
                  ROW_NUMBER() OVER (
                    PARTITION BY task_row.row_id
                    ORDER BY COALESCE(task_row.finished_at, task_row.updated_at, task_row.created_at) DESC
                  ) AS rn
                FROM annotation_task_rows task_row
                JOIN annotation_tasks task ON task.id=task_row.task_id
                WHERE task.dataset_id=? AND task.scheme_id=?
              )
              WHERE rn=1
            )
            SELECT
              d.id,
              d.row_index,
              d.raw_data,
              d.annotation_status,
              d.model_result,
              d.analysis_data,
              d.rendered_prompt,
              latest.status AS scheme_status,
              latest.model_result AS scheme_model_result,
              latest.analysis_data AS scheme_analysis_data,
              latest.rendered_prompt AS scheme_rendered_prompt
            FROM {table_name} d
            LEFT JOIN latest_scheme_rows latest ON latest.row_id=d.id
            WHERE d.dataset_id=? AND d.id IN ({placeholders})
            """,
            [dataset_id, scheme_id, dataset_id, *row_ids],
        ).fetchall()
    else:
        rows = conn.execute(
            f"""
            SELECT id, row_index, raw_data, annotation_status, model_result, analysis_data, rendered_prompt
            FROM {table_name}
            WHERE dataset_id=? AND id IN ({placeholders})
            """,
            [dataset_id, *row_ids],
        ).fetchall()
    if len(rows) != len(set(row_ids)):
        raise HTTPException(status_code=404, detail="部分选中行不存在")
    formatted = [_format_distillation_row(row, bool(scheme_id)) for row in rows]
    formatted.sort(key=lambda item: order_by_ids.get(item["row_id"], 10**9))
    return formatted


def _format_distillation_row(row: dict, scheme_view: bool) -> dict:
    raw_data = decode_json(row.get("raw_data"), {})
    model_result = decode_json(row.get("scheme_model_result") if scheme_view else row.get("model_result"), {})
    analysis_data = decode_json(row.get("scheme_analysis_data") if scheme_view else row.get("analysis_data"), {})
    rendered_prompt = row.get("scheme_rendered_prompt") if scheme_view else row.get("rendered_prompt")
    status = row.get("scheme_status") if scheme_view else row.get("annotation_status")
    return {
        "row_id": row["id"],
        "row_index": row["row_index"],
        "status": status or "未标注",
        "raw_data": raw_data,
        "model_result": model_result,
        "analysis_data": analysis_data,
        "rendered_prompt": _safe_decode_json(rendered_prompt, {}),
    }


def _format_field_mapping(row: dict | None) -> dict:
    if not row:
        return {
            "human_answer_column": "",
            "model_answer_column": "",
            "visible_columns": [],
            "annotation_columns": [],
        }
    return {
        "human_answer_column": row.get("human_answer_column", ""),
        "model_answer_column": row.get("model_answer_column", ""),
        "visible_columns": decode_json(row.get("visible_columns"), []),
        "annotation_columns": decode_json(row.get("annotation_columns"), []),
    }


def _safe_decode_json(value, default):
    if value in (None, ""):
        return default
    try:
        return decode_json(value, default)
    except Exception:
        return value


def _normalize_candidates(candidates: list[dict]) -> list[dict]:
    normalized: list[dict] = []
    for item in candidates:
        for name, content in item.items():
            text_name = str(name or "").strip()
            text_content = str(content or "").strip()
            if not text_name or not text_content:
                continue
            normalized.append({
                "name": text_name,
                "content": text_content,
            })
    return normalized
