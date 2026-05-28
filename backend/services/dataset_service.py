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


def get_dataset_rows(
    dataset_id: str,
    page: int = 1,
    page_size: int = 50,
    search: str = "",
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

        total = conn.execute(
            f"SELECT COUNT(*) AS total FROM {table_name} WHERE {where}",
            params,
        ).fetchone()["total"]
        rows = conn.execute(
            f"""
            SELECT id, row_index, raw_data
            FROM {table_name}
            WHERE {where}
            ORDER BY row_index ASC
            LIMIT ? OFFSET ?
            """,
            [*params, page_size, offset],
        ).fetchall()

    data = []
    for row in rows:
        raw_data = decode_json(row["raw_data"], {})
        item = {
            "row_id": row["id"],
            "row_index": row["row_index"],
            "状态": raw_data.get("状态") or raw_data.get("status") or "未标注",
        }
        for column in columns:
            value = raw_data.get(column, "")
            item[column] = _preview(value) if column in PREVIEW_FIELDS else value
        data.append(item)

    return {
        "data": data,
        "total": total,
        "page": page,
        "page_size": page_size,
        "last_page": max(math.ceil(total / page_size), 1),
        "columns": columns,
    }
