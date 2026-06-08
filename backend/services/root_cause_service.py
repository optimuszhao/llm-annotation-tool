from __future__ import annotations

from typing import Any, Iterable
from uuid import uuid4

from fastapi import HTTPException

from backend.database import decode_json, get_db, now_iso
from backend.services.dataset_service import ROLE_RESULT_KEY, flatten_model_result_for_display

POSITIVE = "positive"
NEGATIVE = "negative"
POLARITY_LABELS = {
    POSITIVE: "正例",
    NEGATIVE: "反例",
}
INVALID_ROOT_CAUSE_NAMES = {
    "",
    "-",
    "--",
    "/",
    "\\",
    "n",
    "no",
    "na",
    "n/a",
    "none",
    "null",
    "nil",
    "nan",
    "空",
    "空字",
    "无",
    "暂无",
    "未知",
    "未填写",
    "未提供",
    "不适用",
}


def list_root_cause_baselines(scene_id: str) -> dict:
    with get_db() as conn:
        _ensure_scene(conn, scene_id)
        rows = conn.execute(
            """
            SELECT *
            FROM root_cause_baselines
            WHERE scene_id=?
            ORDER BY polarity ASC, name ASC
            """,
            (scene_id,),
        ).fetchall()
    return _group_baselines(rows)


def create_root_cause_baseline(scene_id: str, polarity: str, name: str) -> dict:
    polarity = _normalize_polarity(polarity)
    name = _clean_name(name)
    if not name:
        raise HTTPException(status_code=400, detail="根因名称不能为空")
    timestamp = now_iso()
    with get_db() as conn:
        _ensure_scene(conn, scene_id)
        try:
            conn.execute(
                """
                INSERT INTO root_cause_baselines(id, scene_id, polarity, name, created_at, updated_at)
                VALUES(?, ?, ?, ?, ?, ?)
                """,
                (f"root_base_{uuid4().hex[:12]}", scene_id, polarity, name, timestamp, timestamp),
            )
        except Exception as error:
            if "UNIQUE" in str(error).upper():
                raise HTTPException(status_code=409, detail="该根因基线已存在") from error
            raise
    return list_root_cause_baselines(scene_id)


def update_root_cause_baseline(baseline_id: str, polarity: str, name: str) -> dict:
    polarity = _normalize_polarity(polarity)
    name = _clean_name(name)
    if not name:
        raise HTTPException(status_code=400, detail="根因名称不能为空")
    timestamp = now_iso()
    with get_db() as conn:
        row = conn.execute("SELECT * FROM root_cause_baselines WHERE id=?", (baseline_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="根因基线不存在")
        try:
            conn.execute(
                """
                UPDATE root_cause_baselines
                SET polarity=?, name=?, updated_at=?
                WHERE id=?
                """,
                (polarity, name, timestamp, baseline_id),
            )
        except Exception as error:
            if "UNIQUE" in str(error).upper():
                raise HTTPException(status_code=409, detail="该根因基线已存在") from error
            raise
        scene_id = row["scene_id"]
    return list_root_cause_baselines(scene_id)


def delete_root_cause_baseline(baseline_id: str) -> dict:
    with get_db() as conn:
        row = conn.execute("SELECT * FROM root_cause_baselines WHERE id=?", (baseline_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="根因基线不存在")
        scene_id = row["scene_id"]
        conn.execute("DELETE FROM root_cause_baselines WHERE id=?", (baseline_id,))
    return list_root_cause_baselines(scene_id)


def bulk_add_root_cause_baselines(scene_id: str, items: list[dict]) -> dict:
    timestamp = now_iso()
    with get_db() as conn:
        _ensure_scene(conn, scene_id)
        for item in items:
            polarity = _normalize_polarity(item.get("polarity", ""))
            name = _clean_name(item.get("name", ""))
            if not name:
                continue
            conn.execute(
                """
                INSERT INTO root_cause_baselines(id, scene_id, polarity, name, created_at, updated_at)
                VALUES(?, ?, ?, ?, ?, ?)
                ON CONFLICT(scene_id, polarity, name) DO UPDATE SET updated_at=excluded.updated_at
                """,
                (f"root_base_{uuid4().hex[:12]}", scene_id, polarity, name, timestamp, timestamp),
            )
    return list_root_cause_baselines(scene_id)


def get_root_cause_summary(scene_id: str, dataset_id: str = "", scheme_id: str = "") -> dict:
    with get_db() as conn:
        scene = conn.execute("SELECT * FROM scenes WHERE id=?", (scene_id,)).fetchone()
        if not scene:
            raise HTTPException(status_code=404, detail="场景不存在")
        mapping = conn.execute("SELECT * FROM field_mappings WHERE scene_id=?", (scene_id,)).fetchone()
        root_column = (mapping["root_cause_column"] if mapping else "").strip()
        answer_column = (mapping["model_answer_column"] if mapping else "").strip()
        if not root_column or not answer_column:
            return _empty_summary(scene_id, dataset_id, scheme_id, root_column, answer_column)
        if dataset_id:
            dataset = conn.execute(
                "SELECT id FROM datasets WHERE id=? AND scene_id=?",
                (dataset_id, scene_id),
            ).fetchone()
            if not dataset:
                raise HTTPException(status_code=404, detail="数据集不存在")
        rows = _load_model_result_rows(conn, scene["data_table_name"], dataset_id, scheme_id)
        links = []
        for row in rows:
            links.extend(_extract_root_cause_links(
                scene_id=scene_id,
                dataset_id=row["dataset_id"],
                scheme_id=scheme_id,
                row_id=row["row_id"],
                model_result=decode_json(row.get("model_result"), {}),
                answer_column=answer_column,
                root_column=root_column,
            ))
        _save_links(conn, scene_id, dataset_id, scheme_id, links)
    return _summary_from_links(scene_id, dataset_id, scheme_id, root_column, answer_column, links)


def _ensure_scene(conn, scene_id: str) -> None:
    if not conn.execute("SELECT id FROM scenes WHERE id=?", (scene_id,)).fetchone():
        raise HTTPException(status_code=404, detail="场景不存在")


def _group_baselines(rows: Iterable[dict]) -> dict:
    groups = {POSITIVE: [], NEGATIVE: []}
    for row in rows:
        groups.setdefault(row["polarity"], []).append(row)
    return {
        "positive": groups.get(POSITIVE, []),
        "negative": groups.get(NEGATIVE, []),
    }


def _empty_summary(scene_id: str, dataset_id: str, scheme_id: str, root_column: str, answer_column: str) -> dict:
    return {
        "scene_id": scene_id,
        "dataset_id": dataset_id,
        "scheme_id": scheme_id,
        "root_cause_column": root_column,
        "answer_column": answer_column,
        "positive": [],
        "negative": [],
        "total": 0,
    }


def _load_model_result_rows(conn, table_name: str, dataset_id: str, scheme_id: str) -> list[dict]:
    if dataset_id and scheme_id:
        return conn.execute(
            """
            WITH latest_scheme_rows AS (
              SELECT row_id, dataset_id, model_result
              FROM (
                SELECT
                  task_row.row_id,
                  task.dataset_id,
                  task_row.model_result,
                  ROW_NUMBER() OVER (
                    PARTITION BY task_row.row_id
                    ORDER BY COALESCE(task_row.finished_at, task_row.updated_at, task_row.created_at) DESC
                  ) AS rn
                FROM annotation_task_rows task_row
                JOIN annotation_tasks task ON task.id=task_row.task_id
                WHERE task.dataset_id=? AND task.scheme_id=?
                  AND json_valid(task_row.model_result)
                  AND TRIM(COALESCE(task_row.model_result, '')) NOT IN ('', '{}')
              )
              WHERE rn=1
            )
            SELECT row_id, dataset_id, model_result
            FROM latest_scheme_rows
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
        SELECT id AS row_id, dataset_id, model_result
        FROM {table_name}
        WHERE {where}
        """,
        params,
    ).fetchall()


def _extract_root_cause_links(
    scene_id: str,
    dataset_id: str,
    scheme_id: str,
    row_id: str,
    model_result: dict,
    answer_column: str,
    root_column: str,
) -> list[dict]:
    if not isinstance(model_result, dict):
        return []
    links = []
    role_results = model_result.get(ROLE_RESULT_KEY)
    if isinstance(role_results, dict):
        for role_name, role_result in role_results.items():
            if not isinstance(role_result, dict):
                continue
            link = _link_from_result(scene_id, dataset_id, scheme_id, row_id, str(role_name), role_result, answer_column, root_column)
            if link:
                links.append(link)
    if links:
        return links
    link = _link_from_result(scene_id, dataset_id, scheme_id, row_id, "", model_result, answer_column, root_column)
    return [link] if link else []


def _link_from_result(
    scene_id: str,
    dataset_id: str,
    scheme_id: str,
    row_id: str,
    role_name: str,
    result: dict,
    answer_column: str,
    root_column: str,
) -> dict | None:
    flattened = flatten_model_result_for_display(result)
    answer = _first_text_value(result, flattened, [answer_column, answer_column.split(".")[-1], "answer", "答案"])
    root_name = _clean_root_cause_name(
        _first_text_value(result, flattened, [root_column, root_column.split(".")[-1], "根因分析", "根因分类", "root_cause"])
    )
    polarity = _polarity_from_answer(answer)
    if not polarity or not root_name:
        return None
    return {
        "scene_id": scene_id,
        "dataset_id": dataset_id,
        "scheme_id": scheme_id or "",
        "row_id": row_id,
        "role_name": role_name,
        "polarity": polarity,
        "name": root_name,
        "answer_value": answer,
    }


def _first_text_value(raw: dict, flattened: dict, keys: list[str]) -> str:
    for key in keys:
        if not key:
            continue
        value = raw.get(key)
        if value in (None, ""):
            value = flattened.get(key)
        if isinstance(value, (dict, list)):
            continue
        text = str(value or "").strip()
        if text:
            return text
    return ""


def _clean_root_cause_name(value: str) -> str:
    text = str(value or "").strip()
    normalized = text.strip(" \t\r\n'\"`，。；;:：[]【】()（）{}｛｝").strip().lower()
    compact = "".join(normalized.split())
    if compact in INVALID_ROOT_CAUSE_NAMES:
        return ""
    return text


def _polarity_from_answer(value: str) -> str:
    text = str(value or "").strip().lower()
    if text in {"是", "yes", "true", "1", "正确", "通过"}:
        return POSITIVE
    if text in {"否", "no", "false", "0", "错误", "不通过"}:
        return NEGATIVE
    return ""


def _save_links(conn, scene_id: str, dataset_id: str, scheme_id: str, links: list[dict]) -> None:
    timestamp = now_iso()
    if dataset_id:
        conn.execute(
            "DELETE FROM root_cause_row_links WHERE scene_id=? AND dataset_id=? AND scheme_id=?",
            (scene_id, dataset_id, scheme_id or ""),
        )
    else:
        conn.execute(
            "DELETE FROM root_cause_row_links WHERE scene_id=? AND scheme_id=?",
            (scene_id, scheme_id or ""),
        )
    for link in links:
        conn.execute(
            """
            INSERT INTO root_cause_row_links(
                id, scene_id, dataset_id, scheme_id, row_id, role_name, polarity, name,
                answer_value, created_at, updated_at
            )
            VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(scene_id, dataset_id, scheme_id, row_id, role_name, polarity, name)
            DO UPDATE SET answer_value=excluded.answer_value, updated_at=excluded.updated_at
            """,
            (
                f"root_link_{uuid4().hex[:12]}",
                link["scene_id"],
                link["dataset_id"],
                link["scheme_id"],
                link["row_id"],
                link["role_name"],
                link["polarity"],
                link["name"],
                link["answer_value"],
                timestamp,
                timestamp,
            ),
        )


def _summary_from_links(scene_id: str, dataset_id: str, scheme_id: str, root_column: str, answer_column: str, links: list[dict]) -> dict:
    grouped: dict[str, dict[str, dict[str, Any]]] = {POSITIVE: {}, NEGATIVE: {}}
    for link in links:
        bucket = grouped.setdefault(link["polarity"], {})
        item = bucket.setdefault(link["name"], {
            "name": link["name"],
            "count": 0,
            "rows": 0,
            "roles": [],
        })
        item["count"] += 1
        item.setdefault("_row_ids", set()).add(link["row_id"])
        if link["role_name"] and link["role_name"] not in item["roles"]:
            item["roles"].append(link["role_name"])
    result = {}
    for polarity in (POSITIVE, NEGATIVE):
        items = []
        for item in grouped.get(polarity, {}).values():
            row_ids = item.pop("_row_ids", set())
            item["rows"] = len(row_ids)
            items.append(item)
        result[polarity] = sorted(items, key=lambda value: (-value["count"], value["name"]))
    return {
        "scene_id": scene_id,
        "dataset_id": dataset_id,
        "scheme_id": scheme_id,
        "root_cause_column": root_column,
        "answer_column": answer_column,
        "positive": result[POSITIVE],
        "negative": result[NEGATIVE],
        "total": len(links),
    }


def _normalize_polarity(value: str) -> str:
    text = str(value or "").strip().lower()
    if text in {POSITIVE, "正例", "positive"}:
        return POSITIVE
    if text in {NEGATIVE, "反例", "negative"}:
        return NEGATIVE
    raise HTTPException(status_code=400, detail="根因类型只能是正例或反例")


def _clean_name(value: str) -> str:
    return str(value or "").strip()
