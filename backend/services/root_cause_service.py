from __future__ import annotations

from typing import Any

from fastapi import HTTPException

from backend.database import decode_json, get_db
from backend.services.dataset_service import flatten_model_result_for_display


def get_root_cause_summary(scene_id: str, dataset_id: str = "", scheme_id: str = "") -> dict:
    with get_db() as conn:
        scene = conn.execute("SELECT * FROM scenes WHERE id=?", (scene_id,)).fetchone()
        if not scene:
            raise HTTPException(status_code=404, detail="场景不存在")
        mapping = conn.execute("SELECT * FROM field_mappings WHERE scene_id=?", (scene_id,)).fetchone()
        root_column = mapping["root_cause_column"] if mapping else ""
        root_column = root_column.strip()
        if not root_column:
            return {
                "scene_id": scene_id,
                "dataset_id": dataset_id,
                "scheme_id": scheme_id,
                "root_cause_column": "",
                "items": [],
                "total": 0,
            }
        if dataset_id:
            dataset = conn.execute(
                "SELECT id FROM datasets WHERE id=? AND scene_id=?",
                (dataset_id, scene_id),
            ).fetchone()
            if not dataset:
                raise HTTPException(status_code=404, detail="数据集不存在")
        rows = _load_model_result_rows(conn, scene["data_table_name"], dataset_id, scheme_id)

    counts: dict[str, int] = {}
    for row in rows:
        value = _root_cause_value(decode_json(row.get("model_result"), {}), root_column)
        if value == "":
            continue
        counts[value] = counts.get(value, 0) + 1
    items = [
        {"name": name, "count": count}
        for name, count in sorted(counts.items(), key=lambda item: (-item[1], item[0]))
    ]
    return {
        "scene_id": scene_id,
        "dataset_id": dataset_id,
        "scheme_id": scheme_id,
        "root_cause_column": root_column,
        "items": items,
        "total": sum(counts.values()),
    }


def _load_model_result_rows(conn, table_name: str, dataset_id: str, scheme_id: str) -> list[dict]:
    if dataset_id and scheme_id:
        return conn.execute(
            """
            WITH latest_scheme_rows AS (
              SELECT row_id, model_result
              FROM (
                SELECT
                  task_row.row_id,
                  task_row.model_result,
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
            SELECT latest.model_result
            FROM latest_scheme_rows latest
            WHERE json_valid(latest.model_result)
              AND TRIM(COALESCE(latest.model_result, '')) NOT IN ('', '{}')
            """,
            (dataset_id, scheme_id),
        ).fetchall()
    where = "json_valid(model_result) AND TRIM(COALESCE(model_result, '')) NOT IN ('', '{}')"
    params: list[Any] = []
    if dataset_id:
        where = f"dataset_id=? AND {where}"
        params.append(dataset_id)
    return conn.execute(
        f"""
        SELECT model_result
        FROM {table_name}
        WHERE {where}
        """,
        params,
    ).fetchall()


def _root_cause_value(model_result: dict, root_column: str) -> str:
    if not isinstance(model_result, dict) or not root_column:
        return ""
    flattened = flatten_model_result_for_display(model_result)
    value = flattened.get(root_column, model_result.get(root_column, ""))
    if isinstance(value, (list, dict)):
        return ""
    return str(value or "").strip()
