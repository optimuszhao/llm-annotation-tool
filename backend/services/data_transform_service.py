from __future__ import annotations

import json
import re
import shutil
import zipfile
from collections import deque
from pathlib import Path
from typing import Any
from uuid import uuid4

from fastapi import HTTPException, UploadFile
from openpyxl import Workbook

from backend.database import decode_json, encode_json, get_db, now_iso


ROOT_DIR = Path(__file__).resolve().parents[2]
SESSION_DIR = ROOT_DIR / "exports" / "data_transform_sessions"
PACKAGE_DIR = ROOT_DIR / "exports" / "data_transform_packages"
PREVIEW_LIMIT = 20
SUPPORTED_AGGREGATES = {"direct", "join", "unique_join", "count", "sum", "avg", "max", "min", "first"}


def _safe_name(value: str, fallback: str = "table") -> str:
    text = Path(value or "").stem or value or fallback
    text = re.sub(r"[^\w\u4e00-\u9fff]+", "_", text, flags=re.UNICODE).strip("_")
    return text or fallback


def _normalize_key(value: str) -> str:
    return re.sub(r"[^a-z0-9]", "", str(value or "").lower())


def _flatten_record(record: dict[str, Any], prefix: str = "") -> dict[str, Any]:
    flattened: dict[str, Any] = {}
    for key, value in record.items():
        field = f"{prefix}.{key}" if prefix else str(key)
        if isinstance(value, dict):
            flattened.update(_flatten_record(value, field))
        elif isinstance(value, list):
            flattened[field] = json.dumps(value, ensure_ascii=False)
        else:
            flattened[field] = value
    return flattened


def _read_jsonl(path: Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    with path.open("r", encoding="utf-8") as handle:
        for line_number, line in enumerate(handle, start=1):
            text = line.strip()
            if not text:
                continue
            try:
                value = json.loads(text)
            except json.JSONDecodeError as exc:
                raise HTTPException(status_code=400, detail=f"{path.name} 第 {line_number} 行不是合法 JSON") from exc
            if not isinstance(value, dict):
                raise HTTPException(status_code=400, detail=f"{path.name} 第 {line_number} 行必须是 JSON 对象")
            rows.append(_flatten_record(value))
    return rows


def _field_type(values: list[Any]) -> str:
    sample = [value for value in values if value not in (None, "")]
    if not sample:
        return "empty"
    if all(isinstance(value, bool) for value in sample):
        return "boolean"
    if all(isinstance(value, (int, float)) and not isinstance(value, bool) for value in sample):
        return "number"
    return "text"


def _primary_key_for(table_name: str, fields: list[str]) -> str:
    aliases = [
        "id",
        f"{table_name}_id",
        f"{table_name}Id",
        f"{table_name}ID",
    ]
    normalized = {_normalize_key(field): field for field in fields}
    for alias in aliases:
        field = normalized.get(_normalize_key(alias))
        if field:
            return field
    return fields[0] if fields else "id"


def _infer_relations(tables: list[dict[str, Any]]) -> list[dict[str, str]]:
    relations: list[dict[str, str]] = []
    table_by_name = {table["name"]: table for table in tables}
    for parent in tables:
        parent_name = parent["name"]
        parent_key = parent.get("primary_key") or "id"
        aliases = {
            _normalize_key(f"{parent_name}_id"),
            _normalize_key(f"{parent_name}Id"),
            _normalize_key(f"{parent_name}ID"),
        }
        for child in tables:
            if child["name"] == parent_name:
                continue
            for field in child.get("fields", []):
                if _normalize_key(field["name"]) in aliases:
                    relation = {
                        "parent_table": parent_name,
                        "parent_field": parent_key,
                        "child_table": child["name"],
                        "child_field": field["name"],
                    }
                    if relation not in relations and parent_name in table_by_name:
                        relations.append(relation)
    return relations


def _session_path(session_id: str) -> Path:
    path = SESSION_DIR / session_id
    if not path.exists():
        raise HTTPException(status_code=404, detail="转换会话不存在，请重新上传 JSONL")
    return path


def _load_session(session_id: str) -> dict[str, Any]:
    meta_path = _session_path(session_id) / "session.json"
    if not meta_path.exists():
        raise HTTPException(status_code=404, detail="转换会话元数据不存在")
    return json.loads(meta_path.read_text(encoding="utf-8"))


def _load_session_rows(session: dict[str, Any]) -> dict[str, list[dict[str, Any]]]:
    rows: dict[str, list[dict[str, Any]]] = {}
    for table in session.get("tables", []):
        path = Path(table["path"])
        rows[table["name"]] = _read_jsonl(path)
    return rows


async def upload_jsonl_files(files: list[UploadFile]) -> dict[str, Any]:
    if not files:
        raise HTTPException(status_code=400, detail="请选择 JSONL 文件")
    session_id = f"dt_{uuid4().hex[:12]}"
    session_dir = SESSION_DIR / session_id
    session_dir.mkdir(parents=True, exist_ok=True)
    tables: list[dict[str, Any]] = []
    used_names: set[str] = set()

    for index, file in enumerate(files, start=1):
        if not (file.filename or "").lower().endswith(".jsonl"):
            raise HTTPException(status_code=400, detail=f"{file.filename} 不是 jsonl 文件")
        base_name = _safe_name(file.filename or f"table_{index}", f"table_{index}")
        table_name = base_name
        suffix = 2
        while table_name in used_names:
            table_name = f"{base_name}_{suffix}"
            suffix += 1
        used_names.add(table_name)
        path = session_dir / f"{table_name}.jsonl"
        content = await file.read()
        path.write_bytes(content)
        rows = _read_jsonl(path)
        if not rows:
            raise HTTPException(status_code=400, detail=f"{file.filename} 没有有效数据")
        field_names = sorted({field for row in rows for field in row.keys()})
        fields = [
            {
                "name": field,
                "type": _field_type([row.get(field) for row in rows[:50]]),
                "sample": next((row.get(field) for row in rows if row.get(field) not in (None, "")), ""),
            }
            for field in field_names
        ]
        tables.append(
            {
                "name": table_name,
                "file_name": file.filename,
                "path": str(path),
                "row_count": len(rows),
                "primary_key": _primary_key_for(table_name, field_names),
                "fields": fields,
                "sample_rows": rows[:3],
            }
        )

    relations = _infer_relations(tables)
    config = default_config(tables, relations)
    session = {
        "session_id": session_id,
        "created_at": now_iso(),
        "tables": tables,
        "relations": relations,
        "default_config": config,
    }
    (session_dir / "session.json").write_text(encode_json(session), encoding="utf-8")
    return session


def default_config(tables: list[dict[str, Any]], relations: list[dict[str, str]]) -> dict[str, Any]:
    granularity_table = tables[0]["name"] if tables else ""
    output_fields: list[dict[str, str]] = []
    for table in tables:
        for field in table.get("fields", [])[:3]:
            output_fields.append(
                {
                    "name": f"{table['name']}.{field['name']}",
                    "source_table": table["name"],
                    "source_field": field["name"],
                    "aggregate": "direct" if table["name"] == granularity_table else "first",
                }
            )
            if len(output_fields) >= 6:
                break
        if len(output_fields) >= 6:
            break
    return {
        "version": 1,
        "granularity_table": granularity_table,
        "relations": relations,
        "output_fields": output_fields,
    }


def get_transform_config(scene_id: str) -> dict[str, Any]:
    with get_db() as conn:
        row = conn.execute("SELECT config_json, updated_at FROM data_transform_configs WHERE scene_id=?", (scene_id,)).fetchone()
    if not row:
        return {"scene_id": scene_id, "config": {}, "updated_at": ""}
    return {"scene_id": scene_id, "config": decode_json(row["config_json"], {}), "updated_at": row["updated_at"]}


def save_transform_config(scene_id: str, config: dict[str, Any]) -> dict[str, Any]:
    timestamp = now_iso()
    with get_db() as conn:
        if scene_id and not conn.execute("SELECT id FROM scenes WHERE id=?", (scene_id,)).fetchone():
            raise HTTPException(status_code=404, detail="场景不存在")
        conn.execute(
            """
            INSERT INTO data_transform_configs(scene_id, config_json, updated_at)
            VALUES(?, ?, ?)
            ON CONFLICT(scene_id) DO UPDATE SET config_json=excluded.config_json, updated_at=excluded.updated_at
            """,
            (scene_id, encode_json(config or {}), timestamp),
        )
    return {"scene_id": scene_id, "config": config or {}, "updated_at": timestamp}


def _relation_edges(relations: list[dict[str, str]]) -> dict[str, list[dict[str, Any]]]:
    edges: dict[str, list[dict[str, Any]]] = {}
    for relation in relations:
        parent = relation.get("parent_table")
        child = relation.get("child_table")
        if not parent or not child:
            continue
        edges.setdefault(parent, []).append({**relation, "direction": "down", "to": child})
        edges.setdefault(child, []).append({**relation, "direction": "up", "to": parent})
    return edges


def _path_between(start: str, target: str, relations: list[dict[str, str]]) -> list[dict[str, Any]]:
    if start == target:
        return []
    edges = _relation_edges(relations)
    queue: deque[tuple[str, list[dict[str, Any]]]] = deque([(start, [])])
    seen = {start}
    while queue:
        table, path = queue.popleft()
        for edge in edges.get(table, []):
            next_table = edge["to"]
            if next_table in seen:
                continue
            next_path = [*path, edge]
            if next_table == target:
                return next_path
            seen.add(next_table)
            queue.append((next_table, next_path))
    return []


def _match_rows(current_rows: list[dict[str, Any]], edge: dict[str, Any], rows_by_table: dict[str, list[dict[str, Any]]]) -> list[dict[str, Any]]:
    target_rows = rows_by_table.get(edge["to"], [])
    if edge["direction"] == "down":
        parent_values = {str(row.get(edge["parent_field"], "")) for row in current_rows}
        return [row for row in target_rows if str(row.get(edge["child_field"], "")) in parent_values]
    child_values = {str(row.get(edge["child_field"], "")) for row in current_rows}
    return [row for row in target_rows if str(row.get(edge["parent_field"], "")) in child_values]


def _related_rows(base_row: dict[str, Any], base_table: str, source_table: str, config: dict[str, Any], rows_by_table: dict[str, list[dict[str, Any]]]) -> list[dict[str, Any]]:
    if base_table == source_table:
        return [base_row]
    path = _path_between(base_table, source_table, config.get("relations", []))
    if not path:
        return []
    current = [base_row]
    for edge in path:
        current = _match_rows(current, edge, rows_by_table)
        if not current:
            return []
    return current


def _to_number(value: Any) -> float | None:
    try:
        if value in (None, ""):
            return None
        return float(value)
    except (TypeError, ValueError):
        return None


def _aggregate(values: list[Any], aggregate: str) -> Any:
    aggregate = aggregate if aggregate in SUPPORTED_AGGREGATES else "first"
    cleaned = [value for value in values if value not in (None, "")]
    if aggregate == "count":
        return len(cleaned)
    if aggregate in {"sum", "avg", "max", "min"}:
        numbers = [_to_number(value) for value in cleaned]
        numbers = [value for value in numbers if value is not None]
        if not numbers:
            return ""
        if aggregate == "sum":
            return sum(numbers)
        if aggregate == "avg":
            return sum(numbers) / len(numbers)
        if aggregate == "max":
            return max(numbers)
        return min(numbers)
    if aggregate == "join":
        return "、".join(str(value) for value in cleaned)
    if aggregate == "unique_join":
        unique = list(dict.fromkeys(str(value) for value in cleaned))
        return "、".join(unique)
    return cleaned[0] if cleaned else ""


def transform_rows(config: dict[str, Any], rows_by_table: dict[str, list[dict[str, Any]]], limit: int | None = None) -> list[dict[str, Any]]:
    granularity_table = config.get("granularity_table") or next(iter(rows_by_table.keys()), "")
    base_rows = rows_by_table.get(granularity_table, [])
    result: list[dict[str, Any]] = []
    for base_row in base_rows:
        output_row: dict[str, Any] = {}
        for field in config.get("output_fields", []):
            name = field.get("name") or field.get("source_field") or "未命名字段"
            source_table = field.get("source_table") or granularity_table
            source_field = field.get("source_field") or ""
            aggregate = field.get("aggregate") or ("direct" if source_table == granularity_table else "first")
            related = _related_rows(base_row, granularity_table, source_table, config, rows_by_table)
            output_row[name] = _aggregate([row.get(source_field) for row in related], aggregate)
        result.append(output_row)
        if limit and len(result) >= limit:
            break
    return result


def preview_transform(session_id: str, config: dict[str, Any], limit: int = PREVIEW_LIMIT) -> dict[str, Any]:
    session = _load_session(session_id)
    rows_by_table = _load_session_rows(session)
    rows = transform_rows(config or session.get("default_config") or {}, rows_by_table, limit=min(limit or PREVIEW_LIMIT, PREVIEW_LIMIT))
    return {
        "columns": [field.get("name") for field in (config or {}).get("output_fields", []) if field.get("name")],
        "rows": rows,
        "limit": PREVIEW_LIMIT,
        "row_count": len(rows),
    }


def _write_excel(rows: list[dict[str, Any]], output_path: str) -> None:
    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "转换结果"
    columns = list(rows[0].keys()) if rows else []
    sheet.append(columns)
    for row in rows:
        sheet.append([row.get(column, "") for column in columns])
    workbook.save(output_path)


def build_transform_package(config: dict[str, Any]) -> dict[str, Any]:
    if not config or not config.get("granularity_table"):
        raise HTTPException(status_code=400, detail="请先完成转换配置")
    package_id = f"data_transform_package_{uuid4().hex[:10]}"
    build_dir = PACKAGE_DIR / package_id / "data_transform_package"
    if build_dir.exists():
        shutil.rmtree(build_dir)
    build_dir.mkdir(parents=True, exist_ok=True)
    (build_dir / "transform_config.json").write_text(json.dumps(config, ensure_ascii=False, indent=2), encoding="utf-8")
    (build_dir / "transform_utils.py").write_text(_transform_utils_source(), encoding="utf-8")
    (build_dir / "main.py").write_text(_main_source(config), encoding="utf-8")
    (build_dir / "requirements.txt").write_text("openpyxl>=3.1\n", encoding="utf-8")
    (build_dir / "README.md").write_text(_readme_source(), encoding="utf-8")
    zip_path = PACKAGE_DIR / f"{package_id}.zip"
    zip_path.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for file_path in build_dir.rglob("*"):
            archive.write(file_path, file_path.relative_to(build_dir.parent))
    return {"filename": zip_path.name, "zip_path": zip_path}


def _main_source(config: dict[str, Any]) -> str:
    table_names = sorted({field.get("source_table", "") for field in config.get("output_fields", []) if field.get("source_table")})
    table_names.append(config.get("granularity_table", ""))
    table_names = sorted(set(filter(None, table_names)))
    paths = "\n".join([f'    "{name}": "/absolute/path/{name}.jsonl",' for name in table_names])
    return f'''from transform_utils import run_transform


jsonl_paths = {{
{paths}
}}

output_excel_path = "/absolute/path/output.xlsx"


if __name__ == "__main__":
    run_transform(jsonl_paths, output_excel_path)
'''


def _readme_source() -> str:
    return """# 数据转换算法包

1. 安装依赖：`pip install -r requirements.txt`
2. 修改 `main.py` 中每张表对应的 JSONL 绝对路径，以及 `output_excel_path`。
3. 运行：`python main.py`

`transform_utils.py` 对外暴露 `run_transform(jsonl_paths: dict[str, str], output_excel_path: str) -> None`。
"""


def _transform_utils_source() -> str:
    return r'''from __future__ import annotations

import json
from collections import deque
from pathlib import Path
from typing import Any

from openpyxl import Workbook


SUPPORTED_AGGREGATES = {"direct", "join", "unique_join", "count", "sum", "avg", "max", "min", "first"}


def _flatten_record(record: dict[str, Any], prefix: str = "") -> dict[str, Any]:
    flattened: dict[str, Any] = {}
    for key, value in record.items():
        field = f"{prefix}.{key}" if prefix else str(key)
        if isinstance(value, dict):
            flattened.update(_flatten_record(value, field))
        elif isinstance(value, list):
            flattened[field] = json.dumps(value, ensure_ascii=False)
        else:
            flattened[field] = value
    return flattened


def _read_jsonl(path: str) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    with Path(path).open("r", encoding="utf-8") as handle:
        for line_number, line in enumerate(handle, start=1):
            text = line.strip()
            if not text:
                continue
            value = json.loads(text)
            if not isinstance(value, dict):
                raise ValueError(f"{path} 第 {line_number} 行必须是 JSON 对象")
            rows.append(_flatten_record(value))
    return rows


def _relation_edges(relations: list[dict[str, str]]) -> dict[str, list[dict[str, Any]]]:
    edges: dict[str, list[dict[str, Any]]] = {}
    for relation in relations:
        parent = relation.get("parent_table")
        child = relation.get("child_table")
        if not parent or not child:
            continue
        edges.setdefault(parent, []).append({**relation, "direction": "down", "to": child})
        edges.setdefault(child, []).append({**relation, "direction": "up", "to": parent})
    return edges


def _path_between(start: str, target: str, relations: list[dict[str, str]]) -> list[dict[str, Any]]:
    if start == target:
        return []
    edges = _relation_edges(relations)
    queue: deque[tuple[str, list[dict[str, Any]]]] = deque([(start, [])])
    seen = {start}
    while queue:
        table, path = queue.popleft()
        for edge in edges.get(table, []):
            next_table = edge["to"]
            if next_table in seen:
                continue
            next_path = [*path, edge]
            if next_table == target:
                return next_path
            seen.add(next_table)
            queue.append((next_table, next_path))
    return []


def _match_rows(current_rows: list[dict[str, Any]], edge: dict[str, Any], rows_by_table: dict[str, list[dict[str, Any]]]) -> list[dict[str, Any]]:
    target_rows = rows_by_table.get(edge["to"], [])
    if edge["direction"] == "down":
        parent_values = {str(row.get(edge["parent_field"], "")) for row in current_rows}
        return [row for row in target_rows if str(row.get(edge["child_field"], "")) in parent_values]
    child_values = {str(row.get(edge["child_field"], "")) for row in current_rows}
    return [row for row in target_rows if str(row.get(edge["parent_field"], "")) in child_values]


def _related_rows(base_row: dict[str, Any], base_table: str, source_table: str, config: dict[str, Any], rows_by_table: dict[str, list[dict[str, Any]]]) -> list[dict[str, Any]]:
    if base_table == source_table:
        return [base_row]
    path = _path_between(base_table, source_table, config.get("relations", []))
    if not path:
        return []
    current = [base_row]
    for edge in path:
        current = _match_rows(current, edge, rows_by_table)
        if not current:
            return []
    return current


def _to_number(value: Any) -> float | None:
    try:
        if value in (None, ""):
            return None
        return float(value)
    except (TypeError, ValueError):
        return None


def _aggregate(values: list[Any], aggregate: str) -> Any:
    aggregate = aggregate if aggregate in SUPPORTED_AGGREGATES else "first"
    cleaned = [value for value in values if value not in (None, "")]
    if aggregate == "count":
        return len(cleaned)
    if aggregate in {"sum", "avg", "max", "min"}:
        numbers = [_to_number(value) for value in cleaned]
        numbers = [value for value in numbers if value is not None]
        if not numbers:
            return ""
        if aggregate == "sum":
            return sum(numbers)
        if aggregate == "avg":
            return sum(numbers) / len(numbers)
        if aggregate == "max":
            return max(numbers)
        return min(numbers)
    if aggregate == "join":
        return "、".join(str(value) for value in cleaned)
    if aggregate == "unique_join":
        unique = list(dict.fromkeys(str(value) for value in cleaned))
        return "、".join(unique)
    return cleaned[0] if cleaned else ""


def _transform_rows(config: dict[str, Any], rows_by_table: dict[str, list[dict[str, Any]]]) -> list[dict[str, Any]]:
    granularity_table = config.get("granularity_table") or next(iter(rows_by_table.keys()), "")
    base_rows = rows_by_table.get(granularity_table, [])
    result: list[dict[str, Any]] = []
    for base_row in base_rows:
        output_row: dict[str, Any] = {}
        for field in config.get("output_fields", []):
            name = field.get("name") or field.get("source_field") or "未命名字段"
            source_table = field.get("source_table") or granularity_table
            source_field = field.get("source_field") or ""
            aggregate = field.get("aggregate") or ("direct" if source_table == granularity_table else "first")
            related = _related_rows(base_row, granularity_table, source_table, config, rows_by_table)
            output_row[name] = _aggregate([row.get(source_field) for row in related], aggregate)
        result.append(output_row)
    return result


def _write_excel(rows: list[dict[str, Any]], output_excel_path: str) -> None:
    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "转换结果"
    columns = list(rows[0].keys()) if rows else []
    sheet.append(columns)
    for row in rows:
        sheet.append([row.get(column, "") for column in columns])
    workbook.save(output_excel_path)


def run_transform(jsonl_paths: dict[str, str], output_excel_path: str) -> None:
    config_path = Path(__file__).with_name("transform_config.json")
    config = json.loads(config_path.read_text(encoding="utf-8"))
    rows_by_table = {table_name: _read_jsonl(path) for table_name, path in jsonl_paths.items()}
    rows = _transform_rows(config, rows_by_table)
    _write_excel(rows, output_excel_path)
'''
