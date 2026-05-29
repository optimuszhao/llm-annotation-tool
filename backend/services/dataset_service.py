from __future__ import annotations

import math
from io import BytesIO
from typing import Any, Optional
from uuid import uuid4

from fastapi import HTTPException, UploadFile
from openpyxl import load_workbook

from backend.database import decode_json, encode_json, get_db, insert_many, now_iso

PREVIEW_FIELDS = {
    "API Order",
    "API Part 1",
    "API Part 2",
    "API Part 3",
    "API Part 4",
    "API Part 5",
    "API Part 6",
    "API Part 7",
    "Summary",
    "标注数据",
    "分析数据",
    "模型说明",
    "raw_output",
}


def _cell_value(value: Any) -> Any:
    if value is None:
        return ""
    return value


def _preview(value: Any, limit: int = 120) -> Any:
    if value is None:
        return ""
    text = str(value)
    return text if len(text) <= limit else f"{text[:limit]}..."


async def import_excel_files(scene_id: str, files: list[UploadFile]) -> list[dict]:
    if not files:
        raise HTTPException(status_code=400, detail="请选择 Excel 文件")

    imported: list[dict] = []
    with get_db() as conn:
        scene = conn.execute("SELECT * FROM scenes WHERE id=?", (scene_id,)).fetchone()
        if not scene:
            raise HTTPException(status_code=404, detail="场景不存在")

        for file in files:
            content = await file.read()
            try:
                workbook = load_workbook(BytesIO(content), read_only=True, data_only=True)
            except Exception as exc:
                raise HTTPException(status_code=400, detail=f"{file.filename} 解析失败：{exc}") from exc

            sheet = workbook.active
            rows = sheet.iter_rows(values_only=True)
            header_row = next(rows, None)
            if not header_row:
                raise HTTPException(status_code=400, detail=f"{file.filename} 没有表头")

            columns = [str(value).strip() for value in header_row if value not in (None, "")]
            if not columns:
                raise HTTPException(status_code=400, detail=f"{file.filename} 表头为空")

            dataset_id = f"dataset_{uuid4().hex[:12]}"
            timestamp = now_iso()
            data_rows: list[tuple[str, str, int, str, str]] = []
            for row_index, row in enumerate(rows, start=2):
                row_data = {
                    column: _cell_value(row[index] if index < len(row) else "")
                    for index, column in enumerate(columns)
                }
                if all(value == "" for value in row_data.values()):
                    continue
                data_rows.append(
                    (
                        f"row_{uuid4().hex[:16]}",
                        dataset_id,
                        row_index,
                        encode_json(row_data),
                        timestamp,
                    )
                )

            conn.execute(
                """
                INSERT INTO datasets(id, scene_id, name, file_name, row_count, column_schema, created_at)
                VALUES(?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    dataset_id,
                    scene_id,
                    file.filename or dataset_id,
                    file.filename,
                    len(data_rows),
                    encode_json(columns),
                    timestamp,
                ),
            )
            insert_many(
                conn,
                f"""
                INSERT INTO {scene['data_table_name']}(id, dataset_id, row_index, raw_data, created_at)
                VALUES(?, ?, ?, ?, ?)
                """,
                data_rows,
            )
            imported.append(
                {
                    "id": dataset_id,
                    "scene_id": scene_id,
                    "name": file.filename or dataset_id,
                    "file_name": file.filename,
                    "row_count": len(data_rows),
                    "column_schema": columns,
                    "created_at": timestamp,
                }
            )
    return imported


def list_datasets(scene_id: Optional[str] = None) -> list[dict]:
    with get_db() as conn:
        if scene_id:
            rows = conn.execute(
                "SELECT * FROM datasets WHERE scene_id=? ORDER BY created_at DESC",
                (scene_id,),
            ).fetchall()
        else:
            rows = conn.execute("SELECT * FROM datasets ORDER BY created_at DESC").fetchall()
    for row in rows:
        row["column_schema"] = decode_json(row["column_schema"], [])
    return rows


def delete_dataset(dataset_id: str) -> dict:
    with get_db() as conn:
        dataset = conn.execute("SELECT * FROM datasets WHERE id=?", (dataset_id,)).fetchone()
        if not dataset:
            raise HTTPException(status_code=404, detail="数据集不存在")
        scene = conn.execute("SELECT * FROM scenes WHERE id=?", (dataset["scene_id"],)).fetchone()
        if not scene:
            raise HTTPException(status_code=404, detail="场景不存在")
        table_name = scene["data_table_name"]
        conn.execute(f"DELETE FROM {table_name} WHERE dataset_id=?", (dataset_id,))
        conn.execute("DELETE FROM datasets WHERE id=?", (dataset_id,))
    return {"ok": True, "id": dataset_id}


def get_dataset_row(dataset_id: str, row_id: str) -> dict:
    with get_db() as conn:
        dataset, _scene, row = _load_dataset_row(conn, dataset_id, row_id)
        columns = decode_json(dataset["column_schema"], [])
    return _format_row(row, columns, preview=False)


def update_dataset_row(dataset_id: str, row_id: str, payload: dict) -> dict:
    raw_data = payload.get("raw_data") if isinstance(payload, dict) else None
    if raw_data is None:
        raw_data = payload
    if not isinstance(raw_data, dict):
        raise HTTPException(status_code=400, detail="行数据必须是 JSON 对象")

    raw_data = {
        str(key): value
        for key, value in raw_data.items()
        if key not in {"row_id", "row_index", "状态", "model_result", "analysis_data", "rendered_prompt"}
    }
    timestamp = now_iso()
    with get_db() as conn:
        dataset, scene, _row = _load_dataset_row(conn, dataset_id, row_id)
        table_name = scene["data_table_name"]
        columns = decode_json(dataset["column_schema"], [])
        for key in raw_data:
            if key not in columns:
                columns.append(key)
        conn.execute(
            "UPDATE datasets SET column_schema=? WHERE id=?",
            (encode_json(columns), dataset_id),
        )
        conn.execute(
            f"""
            UPDATE {table_name}
            SET raw_data=?, updated_at=?
            WHERE id=? AND dataset_id=?
            """,
            (encode_json(raw_data), timestamp, row_id, dataset_id),
        )
        row = conn.execute(
            f"SELECT id, row_index, raw_data, annotation_status FROM {table_name} WHERE id=? AND dataset_id=?",
            (row_id, dataset_id),
        ).fetchone()
    return _format_row(row, columns, preview=False)


def delete_dataset_row(dataset_id: str, row_id: str) -> dict:
    with get_db() as conn:
        _dataset, scene, _row = _load_dataset_row(conn, dataset_id, row_id)
        table_name = scene["data_table_name"]
        conn.execute(f"DELETE FROM {table_name} WHERE id=? AND dataset_id=?", (row_id, dataset_id))
        conn.execute("DELETE FROM annotation_task_rows WHERE row_id=?", (row_id,))
        total = conn.execute(
            f"SELECT COUNT(*) AS total FROM {table_name} WHERE dataset_id=?",
            (dataset_id,),
        ).fetchone()["total"]
        conn.execute("UPDATE datasets SET row_count=? WHERE id=?", (total, dataset_id))
    return {"ok": True, "id": row_id, "dataset_id": dataset_id, "row_count": total}


def delete_dataset_rows(dataset_id: str, row_ids: list[str]) -> dict:
    ids = [row_id for row_id in row_ids if row_id]
    if not ids:
        raise HTTPException(status_code=400, detail="请选择要删除的行")
    with get_db() as conn:
        dataset = conn.execute("SELECT * FROM datasets WHERE id=?", (dataset_id,)).fetchone()
        if not dataset:
            raise HTTPException(status_code=404, detail="数据集不存在")
        scene = conn.execute("SELECT * FROM scenes WHERE id=?", (dataset["scene_id"],)).fetchone()
        if not scene:
            raise HTTPException(status_code=404, detail="场景不存在")
        table_name = scene["data_table_name"]
        placeholders = ", ".join(["?"] * len(ids))
        existing = conn.execute(
            f"SELECT id FROM {table_name} WHERE dataset_id=? AND id IN ({placeholders})",
            [dataset_id, *ids],
        ).fetchall()
        existing_ids = [row["id"] for row in existing]
        if existing_ids:
            existing_placeholders = ", ".join(["?"] * len(existing_ids))
            conn.execute(
                f"DELETE FROM {table_name} WHERE dataset_id=? AND id IN ({existing_placeholders})",
                [dataset_id, *existing_ids],
            )
            conn.execute(
                f"DELETE FROM annotation_task_rows WHERE row_id IN ({existing_placeholders})",
                existing_ids,
            )
        total = conn.execute(
            f"SELECT COUNT(*) AS total FROM {table_name} WHERE dataset_id=?",
            (dataset_id,),
        ).fetchone()["total"]
        conn.execute("UPDATE datasets SET row_count=? WHERE id=?", (total, dataset_id))
    return {
        "ok": True,
        "dataset_id": dataset_id,
        "deleted_count": len(existing_ids),
        "row_ids": existing_ids,
        "row_count": total,
    }


def get_dataset_rows(
    dataset_id: str,
    page: int = 1,
    page_size: int = 50,
    search: str = "",
    statuses: Optional[list[str]] = None,
) -> dict:
    page = max(page, 1)
    page_size = min(max(page_size, 1), 200)
    offset = (page - 1) * page_size

    with get_db() as conn:
        dataset = conn.execute("SELECT * FROM datasets WHERE id=?", (dataset_id,)).fetchone()
        if not dataset:
            raise HTTPException(status_code=404, detail="数据集不存在")
        scene = conn.execute("SELECT * FROM scenes WHERE id=?", (dataset["scene_id"],)).fetchone()
        table_name = scene["data_table_name"]
        columns = decode_json(dataset["column_schema"], [])
        where = "dataset_id=?"
        params: list[Any] = [dataset_id]
        if search.strip():
            where += " AND raw_data LIKE ?"
            params.append(f"%{search.strip()}%")
        status_values = _normalize_status_filters(statuses)
        if status_values:
            concrete_statuses = [status for status in status_values if status != "未标注"]
            clauses: list[str] = []
            if "未标注" in status_values:
                clauses.append("(annotation_status IS NULL OR annotation_status='' OR annotation_status='未标注')")
            if concrete_statuses:
                placeholders = ", ".join(["?"] * len(concrete_statuses))
                clauses.append(f"annotation_status IN ({placeholders})")
                params.extend(concrete_statuses)
            where += f" AND ({' OR '.join(clauses)})"

        total = conn.execute(
            f"SELECT COUNT(*) AS total FROM {table_name} WHERE {where}",
            params,
        ).fetchone()["total"]
        rows = conn.execute(
            f"""
            SELECT id, row_index, raw_data, annotation_status
            FROM {table_name}
            WHERE {where}
            ORDER BY row_index ASC
            LIMIT ? OFFSET ?
            """,
            [*params, page_size, offset],
        ).fetchall()

    data = [_format_row(row, columns, preview=True) for row in rows]

    return {
        "data": data,
        "total": total,
        "page": page,
        "page_size": page_size,
        "last_page": max(math.ceil(total / page_size), 1),
        "columns": columns,
    }


def export_dataset_rows(dataset_id: str) -> dict:
    with get_db() as conn:
        dataset = conn.execute("SELECT * FROM datasets WHERE id=?", (dataset_id,)).fetchone()
        if not dataset:
            raise HTTPException(status_code=404, detail="数据集不存在")
        scene = conn.execute("SELECT * FROM scenes WHERE id=?", (dataset["scene_id"],)).fetchone()
        if not scene:
            raise HTTPException(status_code=404, detail="场景不存在")
        table_name = scene["data_table_name"]
        columns = decode_json(dataset["column_schema"], [])
        rows = conn.execute(
            f"""
            SELECT id, row_index, raw_data, annotation_status, model_result, analysis_data, rendered_prompt
            FROM {table_name}
            WHERE dataset_id=?
            ORDER BY row_index ASC
            """,
            (dataset_id,),
        ).fetchall()
    return {
        "dataset": {
            "id": dataset["id"],
            "name": dataset["name"],
            "row_count": dataset["row_count"],
            "columns": columns,
        },
        "rows": [_format_row(row, columns, preview=False) for row in rows],
    }


def _load_dataset_row(conn, dataset_id: str, row_id: str) -> tuple[dict, dict, dict]:
    dataset = conn.execute("SELECT * FROM datasets WHERE id=?", (dataset_id,)).fetchone()
    if not dataset:
        raise HTTPException(status_code=404, detail="数据集不存在")
    scene = conn.execute("SELECT * FROM scenes WHERE id=?", (dataset["scene_id"],)).fetchone()
    if not scene:
        raise HTTPException(status_code=404, detail="场景不存在")
    row = conn.execute(
        f"""
        SELECT id, row_index, raw_data, annotation_status, model_result, analysis_data, rendered_prompt
        FROM {scene['data_table_name']}
        WHERE id=? AND dataset_id=?
        """,
        (row_id, dataset_id),
    ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="数据行不存在")
    return dataset, scene, row


def _normalize_status_filters(statuses: Optional[list[str]]) -> list[str]:
    values: list[str] = []
    for status in statuses or []:
        values.extend(part.strip() for part in str(status).split(",") if part.strip())
    return list(dict.fromkeys(values))


def _format_row(row: dict, columns: list[str], preview: bool) -> dict:
    raw_data = decode_json(row["raw_data"], {})
    item = {
        "row_id": row["id"],
        "row_index": row["row_index"],
        "状态": row.get("annotation_status") or raw_data.get("状态") or raw_data.get("status") or "未标注",
    }
    for column in columns:
        value = raw_data.get(column, "")
        item[column] = _preview(value) if preview and column in PREVIEW_FIELDS else value
    if not preview:
        model_result = decode_json(row.get("model_result"), {})
        analysis_data = decode_json(row.get("analysis_data"), {})
        item["model_result"] = model_result
        item["analysis_data"] = analysis_data
        item["rendered_prompt"] = row.get("rendered_prompt") or ""
        if analysis_data and "分析数据" not in item:
            item["分析数据"] = analysis_data
    return item
