from __future__ import annotations

import queue
import re
import threading
from collections import deque
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Any, Iterable, Optional
from uuid import uuid4

from fastapi import HTTPException

from backend.database import decode_json, encode_json, get_db, now_iso
from backend.services.dataset_service import build_row_preview_payload
from user_hooks import hooks


GLOBAL_CONCURRENCY_LIMIT = 20
ROW_STATUS_QUEUED = "排队中"
ROW_STATUS_RUNNING = "标注中"
ROW_STATUS_CANCELLED = "取消"
ROW_STATUS_FAILED = "失败"
ROW_STATUS_TP = "TP"
ROW_STATUS_TN = "TN"
ROW_STATUS_FP = "FP"
ROW_STATUS_FN = "FN"

_global_semaphore = threading.Semaphore(GLOBAL_CONCURRENCY_LIMIT)
_subscriber_lock = threading.Lock()
_subscribers: dict[str, list[queue.Queue]] = {}
_event_history: dict[str, deque[dict]] = {}
_EVENT_HISTORY_LIMIT = 2000


def create_annotation_task(payload: dict) -> dict:
    dataset_id = payload["dataset_id"]
    scheme_id = payload["scheme_id"]
    row_ids = payload.get("row_ids") or []
    mode = payload.get("mode", "all")
    if mode == "selected" and not row_ids:
        raise HTTPException(status_code=400, detail="请选择需要标注的数据行")
    task_id = f"task_{uuid4().hex[:12]}"
    timestamp = now_iso()

    with get_db() as conn:
        dataset, scene, scheme = _load_dataset_scene_scheme(conn, dataset_id, scheme_id)
        table_name = scene["data_table_name"]
        requested_row_ids = row_ids if mode == "selected" else []
        skipped_counts = _count_active_rows(conn, table_name, dataset_id, requested_row_ids, scheme_id)
        rows = _select_task_rows(conn, table_name, dataset_id, requested_row_ids, scheme_id)
        if not rows:
            raise HTTPException(status_code=400, detail="没有可创建任务的数据行，排队中和标注中的数据会被跳过")

        concurrency = min(max(int(scheme.get("concurrency") or 1), 1), GLOBAL_CONCURRENCY_LIMIT)
        conn.execute(
            """
            INSERT INTO annotation_tasks(
                id, scene_id, dataset_id, scheme_id, status, total_count, queued_count,
                running_count, done_count, failed_count, cancelled_count, concurrency,
                created_at, updated_at
            )
            VALUES(?, ?, ?, ?, ?, ?, ?, 0, 0, 0, 0, ?, ?, ?)
            """,
            (
                task_id,
                scene["id"],
                dataset_id,
                scheme_id,
                "queued",
                len(rows),
                len(rows),
                concurrency,
                timestamp,
                timestamp,
            ),
        )
        conn.executemany(
            """
            INSERT INTO annotation_task_rows(
                id, task_id, row_id, row_index, status, created_at, updated_at
            )
            VALUES(?, ?, ?, ?, ?, ?, ?)
            """,
            [
                (
                    f"task_row_{uuid4().hex[:12]}",
                    task_id,
                    row["id"],
                    row["row_index"],
                    ROW_STATUS_QUEUED,
                    timestamp,
                    timestamp,
                )
                for row in rows
            ],
        )
        _update_scene_rows_status(
            conn,
            table_name,
            [row["id"] for row in rows],
            ROW_STATUS_QUEUED,
            task_id,
            timestamp,
        )

    task = get_annotation_task(task_id)
    task["skipped_queued_count"] = skipped_counts.get(ROW_STATUS_QUEUED, 0)
    task["skipped_running_count"] = skipped_counts.get(ROW_STATUS_RUNNING, 0)
    task["skipped_count"] = task["skipped_queued_count"] + task["skipped_running_count"]
    _broadcast(task_id, {"type": "task_created", "task": task})
    threading.Thread(target=_run_task, args=(task_id,), daemon=True).start()
    return task


def list_annotation_tasks(dataset_id: Optional[str] = None, scheme_id: Optional[str] = None) -> list[dict]:
    with get_db() as conn:
        if dataset_id and scheme_id:
            rows = conn.execute(
                """
                SELECT * FROM annotation_tasks
                WHERE dataset_id=? AND scheme_id=?
                ORDER BY created_at DESC
                """,
                (dataset_id, scheme_id),
            ).fetchall()
        elif dataset_id:
            rows = conn.execute(
                "SELECT * FROM annotation_tasks WHERE dataset_id=? ORDER BY created_at DESC",
                (dataset_id,),
            ).fetchall()
        else:
            rows = conn.execute("SELECT * FROM annotation_tasks ORDER BY created_at DESC").fetchall()
    return rows


def get_annotation_task(task_id: str) -> dict:
    with get_db() as conn:
        task = conn.execute("SELECT * FROM annotation_tasks WHERE id=?", (task_id,)).fetchone()
        if not task:
            raise HTTPException(status_code=404, detail="标注任务不存在")
    return task


def stop_unfinished(task_id: str) -> dict:
    timestamp = now_iso()
    with get_db() as conn:
        task = conn.execute("SELECT * FROM annotation_tasks WHERE id=?", (task_id,)).fetchone()
        if not task:
            raise HTTPException(status_code=404, detail="标注任务不存在")
        scene = conn.execute("SELECT * FROM scenes WHERE id=?", (task["scene_id"],)).fetchone()
        table_name = scene["data_table_name"]
        queued_rows = conn.execute(
            """
            SELECT row_id FROM annotation_task_rows
            WHERE task_id=? AND status=?
            """,
            (task_id, ROW_STATUS_QUEUED),
        ).fetchall()
        queued_row_ids = [row["row_id"] for row in queued_rows]
        conn.execute(
            """
            UPDATE annotation_task_rows
            SET status=?, updated_at=?, finished_at=?
            WHERE task_id=? AND status=?
            """,
            (ROW_STATUS_CANCELLED, timestamp, timestamp, task_id, ROW_STATUS_QUEUED),
        )
        if queued_row_ids:
            _update_scene_rows_status(conn, table_name, queued_row_ids, ROW_STATUS_CANCELLED, task_id, timestamp)
        _refresh_task_counts(conn, task_id, timestamp)

    task = get_annotation_task(task_id)
    event = {
        "type": "task_stopped",
        "task": task,
        "cancelled_count": len(queued_row_ids),
        "cancelled_row_ids": queued_row_ids,
    }
    _broadcast(task_id, event)
    return event


def stop_unfinished_by_row(dataset_id: str, row_id: str, scheme_id: str = "") -> dict:
    with get_db() as conn:
        params: list[Any] = [dataset_id, row_id, ROW_STATUS_QUEUED, ROW_STATUS_RUNNING]
        scheme_filter = ""
        if scheme_id:
            scheme_filter = "AND task.scheme_id=?"
            params.append(scheme_id)
        row = conn.execute(
            f"""
            SELECT task.id AS task_id, task_row.status AS row_status
            FROM annotation_task_rows task_row
            JOIN annotation_tasks task ON task.id=task_row.task_id
            WHERE task.dataset_id=?
              AND task_row.row_id=?
              AND task_row.status IN (?, ?)
              {scheme_filter}
            ORDER BY COALESCE(task_row.started_at, task_row.updated_at, task_row.created_at) DESC, task_row.rowid DESC
            LIMIT 1
            """,
            params,
        ).fetchone()
    if not row:
        raise HTTPException(status_code=400, detail="当前行没有排队中或标注中的任务")
    result = stop_unfinished(row["task_id"])
    result["row_id"] = row_id
    result["row_status"] = row["row_status"]
    return result


def analyze_dataset_row(dataset_id: str, row_id: str, scheme_id: str = "", method_name: str = "") -> dict:
    timestamp = now_iso()
    with get_db() as conn:
        dataset = conn.execute("SELECT * FROM datasets WHERE id=?", (dataset_id,)).fetchone()
        if not dataset:
            raise HTTPException(status_code=404, detail="数据集不存在")
        scene = conn.execute("SELECT * FROM scenes WHERE id=?", (dataset["scene_id"],)).fetchone()
        table_name = scene["data_table_name"]
        row = conn.execute(
            f"SELECT * FROM {table_name} WHERE id=? AND dataset_id=?",
            (row_id, dataset_id),
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="数据行不存在")
        raw_data = decode_json(row["raw_data"], {})
        if scheme_id:
            latest = _latest_task_row_for_scheme(conn, dataset_id, row_id, scheme_id)
            model_result = decode_json(latest.get("model_result") if latest else "{}", {})
            rendered_prompt = decode_json((latest.get("rendered_prompt") if latest else "") or "{}", {})
        else:
            model_result = decode_json(row["model_result"], {})
            rendered_prompt = decode_json(row.get("rendered_prompt") or "{}", {})
        field_mapping = _get_field_mapping(conn, dataset["scene_id"])
        analysis_row_data = {
            **raw_data,
            "row_id": row_id,
            "row_index": row.get("row_index"),
            "状态": row.get("annotation_status"),
            "model_result": model_result,
            "rendered_prompt": rendered_prompt,
        }

    method_config = _resolve_analysis_method(method_name)
    selected_method_name = method_config["method_name"]
    context = {
        "dataset_id": dataset_id,
        "scene_id": dataset["scene_id"],
        "scheme_id": scheme_id,
        "row_id": row_id,
        "row_data": analysis_row_data,
        "raw_data": raw_data,
        "model_result": model_result,
        "rendered_prompt": rendered_prompt,
        "field_mapping": field_mapping,
        "analysis_method": method_config,
    }
    try:
        if hasattr(hooks, "run_analysis_method"):
            analysis_result = hooks.run_analysis_method(selected_method_name, analysis_row_data, model_result, context)
        else:
            analysis_result = hooks.analyze_row(analysis_row_data, model_result)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if not isinstance(analysis_result, dict):
        raise HTTPException(status_code=500, detail="分析方法必须返回 dict")

    with get_db() as conn:
        dataset = conn.execute("SELECT * FROM datasets WHERE id=?", (dataset_id,)).fetchone()
        if not dataset:
            raise HTTPException(status_code=404, detail="数据集不存在")
        scene = conn.execute("SELECT * FROM scenes WHERE id=?", (dataset["scene_id"],)).fetchone()
        if not scene:
            raise HTTPException(status_code=404, detail="场景不存在")
        table_name = scene["data_table_name"]
        row = conn.execute(
            f"SELECT raw_data FROM {table_name} WHERE id=? AND dataset_id=?",
            (row_id, dataset_id),
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="数据行不存在")
        raw_data = decode_json(row["raw_data"], {})
        raw_data["分析数据"] = analysis_result
        preview_data, large_fields = build_row_preview_payload(raw_data)
        _ensure_dataset_columns(conn, dataset, ["分析数据"])
        conn.execute(
            f"""
            UPDATE {table_name}
            SET raw_data=?, preview_data=?, large_fields=?, analysis_data=?, updated_at=?
            WHERE id=? AND dataset_id=?
            """,
            (encode_json(raw_data), preview_data, large_fields, encode_json(analysis_result), timestamp, row_id, dataset_id),
        )
        latest = _latest_task_row_for_scheme(conn, dataset_id, row_id, scheme_id) if scheme_id else conn.execute(
            """
            SELECT * FROM annotation_task_rows
            WHERE row_id=?
            ORDER BY updated_at DESC
            LIMIT 1
            """,
            (row_id,),
        ).fetchone()
        if latest:
            conn.execute(
                """
                UPDATE annotation_task_rows
                SET analysis_data=?, updated_at=?
                WHERE id=?
                """,
                (encode_json(analysis_result), timestamp, latest["id"]),
            )
            task_id = latest["task_id"]
            task_row_id = latest["id"]
        else:
            task_id = ""
            task_row_id = ""
        conn.execute(
            """
            INSERT INTO row_analysis_history(id, dataset_id, row_id, task_row_id, method_name, method_label, analysis_data, created_at)
            VALUES(?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                f"analysis_{uuid4().hex[:12]}",
                dataset_id,
                row_id,
                task_row_id,
                selected_method_name,
                method_config.get("name", selected_method_name),
                encode_json(analysis_result),
                timestamp,
            ),
        )

    if task_id:
        _broadcast(
            task_id,
            {
                "type": "row_analyzed",
                "row_id": row_id,
                "analysis_data": analysis_result,
                "method_name": selected_method_name,
                "method_label": method_config.get("name", selected_method_name),
            },
        )
    return {
        "row_id": row_id,
        "analysis_data": analysis_result,
        "method_name": selected_method_name,
        "method_label": method_config.get("name", selected_method_name),
    }


def start_batch_analysis(payload: dict) -> dict:
    dataset_id = payload.get("dataset_id") or ""
    scheme_id = payload.get("scheme_id") or ""
    method_name = payload.get("method_name") or ""
    scope = payload.get("scope") or "all"
    statuses = _normalize_status_values(payload.get("statuses") or [])
    if not dataset_id:
        raise HTTPException(status_code=400, detail="请选择数据集")
    if scope == "statuses" and not statuses:
        raise HTTPException(status_code=400, detail="请选择要分析的状态")

    method_config = _resolve_analysis_method(method_name)
    with get_db() as conn:
        row_ids = _select_batch_analysis_row_ids(conn, dataset_id, scheme_id, scope, statuses)
    if not row_ids:
        raise HTTPException(status_code=400, detail="没有符合条件的数据行")

    batch_id = f"analysis_batch_{uuid4().hex[:12]}"
    worker = threading.Thread(
        target=_run_batch_analysis,
        args=(batch_id, dataset_id, scheme_id, method_config["method_name"], row_ids),
        daemon=True,
    )
    worker.start()
    return {
        "batch_id": batch_id,
        "dataset_id": dataset_id,
        "scheme_id": scheme_id,
        "method_name": method_config["method_name"],
        "method_label": method_config.get("name", method_config["method_name"]),
        "scope": scope,
        "statuses": statuses,
        "total_count": len(row_ids),
        "message": "批量分析已在后台按单线程顺序执行",
    }


def clear_batch_analysis_data(payload: dict) -> dict:
    dataset_id = payload.get("dataset_id") or ""
    scheme_id = payload.get("scheme_id") or ""
    scope = payload.get("scope") or "all"
    statuses = _normalize_status_values(payload.get("statuses") or [])
    if not dataset_id:
        raise HTTPException(status_code=400, detail="请选择数据集")
    if scope == "statuses" and not statuses:
        raise HTTPException(status_code=400, detail="请选择要删除分析数据的状态")

    timestamp = now_iso()
    with get_db() as conn:
        dataset = conn.execute("SELECT * FROM datasets WHERE id=?", (dataset_id,)).fetchone()
        if not dataset:
            raise HTTPException(status_code=404, detail="数据集不存在")
        scene = conn.execute("SELECT * FROM scenes WHERE id=?", (dataset["scene_id"],)).fetchone()
        if not scene:
            raise HTTPException(status_code=404, detail="场景不存在")
        table_name = scene["data_table_name"]
        row_ids = _select_batch_analysis_row_ids(conn, dataset_id, scheme_id, scope, statuses)
        if not row_ids:
            raise HTTPException(status_code=400, detail="没有符合条件的数据行")

        placeholders = ", ".join(["?"] * len(row_ids))
        rows = conn.execute(
            f"SELECT id, raw_data FROM {table_name} WHERE dataset_id=? AND id IN ({placeholders})",
            (dataset_id, *row_ids),
        ).fetchall()
        for row in rows:
            raw_data = decode_json(row["raw_data"], {})
            raw_data.pop("分析数据", None)
            preview_data, large_fields = build_row_preview_payload(raw_data)
            conn.execute(
                f"""
                UPDATE {table_name}
                SET raw_data=?, preview_data=?, large_fields=?, analysis_data='{{}}', updated_at=?
                WHERE id=? AND dataset_id=?
                """,
                (encode_json(raw_data), preview_data, large_fields, timestamp, row["id"], dataset_id),
            )

        conn.execute(
            f"DELETE FROM row_analysis_history WHERE dataset_id=? AND row_id IN ({placeholders})",
            (dataset_id, *row_ids),
        )
        if scheme_id:
            task_rows = conn.execute(
                f"""
                SELECT task_row.id
                FROM annotation_task_rows task_row
                JOIN annotation_tasks task ON task.id=task_row.task_id
                WHERE task.dataset_id=? AND task.scheme_id=? AND task_row.row_id IN ({placeholders})
                """,
                (dataset_id, scheme_id, *row_ids),
            ).fetchall()
            task_row_ids = [row["id"] for row in task_rows]
            if task_row_ids:
                task_placeholders = ", ".join(["?"] * len(task_row_ids))
                conn.execute(
                    f"UPDATE annotation_task_rows SET analysis_data='{{}}', updated_at=? WHERE id IN ({task_placeholders})",
                    (timestamp, *task_row_ids),
                )
        else:
            conn.execute(
                f"UPDATE annotation_task_rows SET analysis_data='{{}}', updated_at=? WHERE row_id IN ({placeholders})",
                (timestamp, *row_ids),
            )

    return {
        "dataset_id": dataset_id,
        "scheme_id": scheme_id,
        "scope": scope,
        "statuses": statuses,
        "row_ids": row_ids,
        "deleted_count": len(row_ids),
    }


def _run_batch_analysis(batch_id: str, dataset_id: str, scheme_id: str, method_name: str, row_ids: list[str]) -> None:
    for row_id in row_ids:
        try:
            analyze_dataset_row(dataset_id, row_id, scheme_id, method_name)
        except Exception as exc:
            _record_analysis_failure(dataset_id, row_id, method_name, str(exc))
            print(f"[{batch_id}] row {row_id} analysis failed: {exc}")


def _record_analysis_failure(dataset_id: str, row_id: str, method_name: str, error: str) -> None:
    timestamp = now_iso()
    method_config = _resolve_analysis_method(method_name)
    try:
        with get_db() as conn:
            if not conn.execute("SELECT id FROM datasets WHERE id=?", (dataset_id,)).fetchone():
                return
            conn.execute(
                """
                INSERT INTO row_analysis_history(id, dataset_id, row_id, task_row_id, method_name, method_label, analysis_data, created_at)
                VALUES(?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    f"analysis_{uuid4().hex[:12]}",
                    dataset_id,
                    row_id,
                    "",
                    method_config["method_name"],
                    method_config.get("name", method_config["method_name"]),
                    encode_json({"分析失败": error}),
                    timestamp,
                ),
            )
    except Exception as exc:
        print(f"[analysis_failure_record] row {row_id} failed: {exc}")


def _select_batch_analysis_row_ids(
    conn,
    dataset_id: str,
    scheme_id: str,
    scope: str,
    statuses: list[str],
) -> list[str]:
    dataset = conn.execute("SELECT * FROM datasets WHERE id=?", (dataset_id,)).fetchone()
    if not dataset:
        raise HTTPException(status_code=404, detail="数据集不存在")
    scene = conn.execute("SELECT * FROM scenes WHERE id=?", (dataset["scene_id"],)).fetchone()
    if not scene:
        raise HTTPException(status_code=404, detail="场景不存在")
    table_name = scene["data_table_name"]
    where = "d.dataset_id=?"
    params: list = [dataset_id]
    if scope == "statuses":
        status_expr = "COALESCE(latest.scheme_status, '未标注')" if scheme_id else "COALESCE(d.annotation_status, '未标注')"
        where += _status_filter_sql(status_expr, statuses, params)

    if scheme_id:
        rows = conn.execute(
            f"""
            {_latest_scheme_rows_cte()}
            SELECT d.id
            FROM {table_name} d
            LEFT JOIN latest_scheme_rows latest ON latest.row_id=d.id
            WHERE {where}
            ORDER BY d.row_index ASC
            """,
            [dataset_id, scheme_id, *params],
        ).fetchall()
    else:
        rows = conn.execute(
            f"""
            SELECT d.id
            FROM {table_name} d
            WHERE {where}
            ORDER BY d.row_index ASC
            """,
            params,
        ).fetchall()
    return [row["id"] for row in rows]


def _status_filter_sql(status_expr: str, statuses: list[str], params: list) -> str:
    if not statuses:
        return ""
    concrete_statuses = [status for status in statuses if status != "未标注"]
    clauses: list[str] = []
    if "未标注" in statuses:
        clauses.append(f"({status_expr} IS NULL OR {status_expr}='' OR {status_expr}='未标注')")
    if concrete_statuses:
        placeholders = ", ".join(["?"] * len(concrete_statuses))
        clauses.append(f"{status_expr} IN ({placeholders})")
        params.extend(concrete_statuses)
    return f" AND ({' OR '.join(clauses)})" if clauses else ""


def _normalize_status_values(statuses: list) -> list[str]:
    values: list[str] = []
    for status in statuses or []:
        values.extend(part.strip() for part in str(status).split(",") if part.strip())
    return list(dict.fromkeys(values))


def _latest_scheme_rows_cte() -> str:
    return """
    WITH latest_scheme_rows AS (
      SELECT row_id, scheme_status
      FROM (
        SELECT
          task_row.row_id,
          task_row.status AS scheme_status,
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
    """


def _resolve_analysis_method(method_name: str = "") -> dict:
    methods = hooks.list_analysis_methods() if hasattr(hooks, "list_analysis_methods") else {}
    flat = []
    for key, item in methods.items():
        method = dict(item)
        method.setdefault("key", key)
        method.setdefault("method_name", key)
        method.setdefault("name", key)
        flat.append(method)
    if not flat:
        return {"key": "default", "name": "默认分析", "method_name": "default_analysis", "description": ""}
    if method_name:
        for item in flat:
            if method_name in {item.get("method_name"), item.get("key")}:
                return item
        return {"key": method_name, "name": method_name, "method_name": method_name, "description": ""}
    return flat[0]


def list_row_analysis_history(dataset_id: str, row_id: str) -> list[dict]:
    with get_db() as conn:
        dataset = conn.execute("SELECT id FROM datasets WHERE id=?", (dataset_id,)).fetchone()
        if not dataset:
            raise HTTPException(status_code=404, detail="数据集不存在")
        rows = conn.execute(
            """
            SELECT id, dataset_id, row_id, task_row_id, method_name, method_label, analysis_data, created_at
            FROM row_analysis_history
            WHERE dataset_id=? AND row_id=?
            ORDER BY created_at DESC, rowid DESC
            """,
            (dataset_id, row_id),
        ).fetchall()
    for row in rows:
        row["analysis_data"] = decode_json(row.get("analysis_data"), {})
    return rows


def list_row_annotation_history(dataset_id: str, row_id: str, scheme_id: str = "") -> list[dict]:
    with get_db() as conn:
        dataset = conn.execute("SELECT id FROM datasets WHERE id=?", (dataset_id,)).fetchone()
        if not dataset:
            raise HTTPException(status_code=404, detail="数据集不存在")
        scheme_filter = "AND task.scheme_id=?" if scheme_id else ""
        params = [dataset_id, row_id]
        if scheme_id:
            params.append(scheme_id)
        rows = conn.execute(
            f"""
            SELECT
                task_row.id,
                task_row.task_id,
                task_row.row_id,
                task_row.row_index,
                task_row.status,
                task_row.model_result,
                task_row.analysis_data,
                task_row.rendered_prompt,
                task_row.error,
                task_row.created_at,
                task_row.updated_at,
                task_row.started_at,
                task_row.finished_at,
                task.scheme_id,
                task.status AS task_status
            FROM annotation_task_rows task_row
            JOIN annotation_tasks task ON task.id = task_row.task_id
            WHERE task.dataset_id=? AND task_row.row_id=?
              {scheme_filter}
            ORDER BY COALESCE(task_row.finished_at, task_row.updated_at, task_row.created_at) DESC
            """,
            params,
        ).fetchall()
    for row in rows:
        row["model_result"] = decode_json(row.get("model_result"), {})
        row["analysis_data"] = decode_json(row.get("analysis_data"), {})
    return rows


def get_dataset_metrics(dataset_id: str, scheme_id: str = "") -> dict:
    with get_db() as conn:
        dataset = conn.execute("SELECT * FROM datasets WHERE id=?", (dataset_id,)).fetchone()
        if not dataset:
            raise HTTPException(status_code=404, detail="数据集不存在")
        scene = conn.execute("SELECT * FROM scenes WHERE id=?", (dataset["scene_id"],)).fetchone()
        table_name = scene["data_table_name"]
        total = conn.execute(
            f"SELECT COUNT(*) AS total FROM {table_name} WHERE dataset_id=?",
            (dataset_id,),
        ).fetchone()["total"]
        if scheme_id:
            rows = conn.execute(
                f"""
                WITH latest_scheme_rows AS (
                  SELECT row_id, annotation_status
                  FROM (
                    SELECT
                      task_row.row_id,
                      task_row.status AS annotation_status,
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
                SELECT COALESCE(latest.annotation_status, '未标注') AS annotation_status, COUNT(*) AS count
                FROM {table_name} data_row
                LEFT JOIN latest_scheme_rows latest ON latest.row_id=data_row.id
                WHERE data_row.dataset_id=?
                GROUP BY COALESCE(latest.annotation_status, '未标注')
                """,
                (dataset_id, scheme_id, dataset_id),
            ).fetchall()
        else:
            rows = conn.execute(
                f"""
                SELECT annotation_status, COUNT(*) AS count
                FROM {table_name}
                WHERE dataset_id=?
                GROUP BY annotation_status
                """,
                (dataset_id,),
            ).fetchall()
    counts = {row["annotation_status"] or "未标注": row["count"] for row in rows}
    tp = counts.get(ROW_STATUS_TP, 0)
    tn = counts.get(ROW_STATUS_TN, 0)
    fp = counts.get(ROW_STATUS_FP, 0)
    fn = counts.get(ROW_STATUS_FN, 0)
    evaluated = tp + tn + fp + fn
    algorithm_accuracy = round((tp + tn) / evaluated, 4) if evaluated else None
    correct_recall = round(tp / (tp + fn), 4) if tp + fn else None
    correct_precision = round(tp / (tp + fp), 4) if tp + fp else None
    error_precision = round(tn / (tn + fn), 4) if tn + fn else None
    f1 = round((2 * tp) / ((2 * tp) + fp + fn), 4) if (2 * tp) + fp + fn else None
    business_accuracy = round((tp + fp) / evaluated, 4) if evaluated else None
    return {
        "total": total,
        "unannotated": counts.get("未标注", 0),
        "queued": counts.get(ROW_STATUS_QUEUED, 0),
        "running": counts.get(ROW_STATUS_RUNNING, 0),
        "tp": tp,
        "tn": tn,
        "fp": fp,
        "fn": fn,
        "failed": counts.get(ROW_STATUS_FAILED, 0),
        "cancelled": counts.get(ROW_STATUS_CANCELLED, 0),
        "algorithm_accuracy": algorithm_accuracy,
        "correct_recall": correct_recall,
        "correct_precision": correct_precision,
        "error_precision": error_precision,
        "f1": f1,
        "business_accuracy": business_accuracy,
        "accuracy": algorithm_accuracy,
        "precision": correct_precision,
        "recall": correct_recall,
        "specificity": error_precision,
        "false_positive_rate": business_accuracy,
    }


def subscribe_task_events(task_id: str) -> queue.Queue:
    event_queue: queue.Queue = queue.Queue()
    with _subscriber_lock:
        history = list(_event_history.get(task_id, ()))
        _subscribers.setdefault(task_id, []).append(event_queue)
    for event in history:
        event_queue.put(event)
    return event_queue


def unsubscribe_task_events(task_id: str, event_queue: queue.Queue) -> None:
    with _subscriber_lock:
        queues = _subscribers.get(task_id, [])
        if event_queue in queues:
            queues.remove(event_queue)
        if not queues and task_id in _subscribers:
            del _subscribers[task_id]


def _run_task(task_id: str) -> None:
    timestamp = now_iso()
    with get_db() as conn:
        conn.execute(
            "UPDATE annotation_tasks SET status='running', started_at=?, updated_at=? WHERE id=?",
            (timestamp, timestamp, task_id),
        )
        task = conn.execute("SELECT * FROM annotation_tasks WHERE id=?", (task_id,)).fetchone()
        rows = conn.execute(
            "SELECT * FROM annotation_task_rows WHERE task_id=? ORDER BY row_index ASC",
            (task_id,),
        ).fetchall()
    _broadcast(task_id, {"type": "task_started", "task": get_annotation_task(task_id)})

    max_workers = min(max(int(task["concurrency"] or 1), 1), GLOBAL_CONCURRENCY_LIMIT)
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = [executor.submit(_run_task_row, task_id, row["id"]) for row in rows]
        for future in as_completed(futures):
            try:
                future.result()
            except Exception as exc:
                _broadcast(task_id, {"type": "task_error", "error": str(exc)})

    timestamp = now_iso()
    with get_db() as conn:
        task = _refresh_task_counts(conn, task_id, timestamp)
    _broadcast(task_id, {"type": "task_finished", "task": task})


def _run_task_row(task_id: str, task_row_id: str) -> None:
    with get_db() as conn:
        task_row = conn.execute("SELECT * FROM annotation_task_rows WHERE id=?", (task_row_id,)).fetchone()
        if not task_row or task_row["status"] != ROW_STATUS_QUEUED:
            return

    with _global_semaphore:
        with get_db() as conn:
            task_row = conn.execute("SELECT * FROM annotation_task_rows WHERE id=?", (task_row_id,)).fetchone()
            if not task_row or task_row["status"] != ROW_STATUS_QUEUED:
                return
            task = conn.execute("SELECT * FROM annotation_tasks WHERE id=?", (task_id,)).fetchone()
            scene = conn.execute("SELECT * FROM scenes WHERE id=?", (task["scene_id"],)).fetchone()
            table_name = scene["data_table_name"]
            timestamp = now_iso()
            conn.execute(
                """
                UPDATE annotation_task_rows
                SET status=?, started_at=?, updated_at=?
                WHERE id=?
                """,
                (ROW_STATUS_RUNNING, timestamp, timestamp, task_row_id),
            )
            _update_scene_rows_status(conn, table_name, [task_row["row_id"]], ROW_STATUS_RUNNING, task_id, timestamp)
            _refresh_task_counts(conn, task_id, timestamp)
        _broadcast(
            task_id,
            {
                "type": "row_started",
                "row_id": task_row["row_id"],
                "status": ROW_STATUS_RUNNING,
                "task": get_annotation_task(task_id),
                "metrics": get_dataset_metrics(task["dataset_id"], task["scheme_id"]),
            },
        )

        try:
            result = _annotate_row(task_id, task_row_id)
        except Exception as exc:
            result = _mark_row_failed(task_id, task_row_id, str(exc))
        _broadcast(task_id, {"type": "row_updated", **result})


def _annotate_row(task_id: str, task_row_id: str) -> dict:
    with get_db() as conn:
        task = conn.execute("SELECT * FROM annotation_tasks WHERE id=?", (task_id,)).fetchone()
        dataset, scene, scheme = _load_dataset_scene_scheme(conn, task["dataset_id"], task["scheme_id"])
        table_name = scene["data_table_name"]
        task_row = conn.execute("SELECT * FROM annotation_task_rows WHERE id=?", (task_row_id,)).fetchone()
        row = conn.execute(
            f"SELECT * FROM {table_name} WHERE id=? AND dataset_id=?",
            (task_row["row_id"], task["dataset_id"]),
        ).fetchone()
        field_mapping = _get_field_mapping(conn, scene["id"])
        resources = _get_scheme_resources(conn, scheme["id"])
        row_data = decode_json(row["raw_data"], {})
        context = {
            "task_id": task_id,
            "task_row_id": task_row_id,
            "dataset_id": task["dataset_id"],
            "scheme_id": task["scheme_id"],
            "row_id": row["id"],
            "row_index": row["row_index"],
            "field_mapping": field_mapping,
            "row_data": row_data,
        }

    rendered_prompts = _render_prompt(scheme, resources, field_mapping, row_data, context)
    rendered_prompt = encode_json(rendered_prompts)
    model_result = _call_scheme_method(scheme, rendered_prompts, context)
    if not isinstance(model_result, dict):
        raise ValueError("标注方法必须返回 dict")

    model_answer_column = field_mapping.get("model_answer_column") or ""
    human_answer_column = field_mapping.get("human_answer_column") or ""
    if not model_answer_column or model_answer_column not in model_result:
        raise ValueError(f"标注结果缺少标注答案列：{model_answer_column or '未配置'}")
    if not human_answer_column or _is_blank(row_data.get(human_answer_column)):
        raise ValueError(f"人工答案列为空或未配置：{human_answer_column or '未配置'}")

    status = _judge_confusion_status(row_data.get(human_answer_column), model_result.get(model_answer_column))
    timestamp = now_iso()

    with get_db() as conn:
        task = conn.execute("SELECT * FROM annotation_tasks WHERE id=?", (task_id,)).fetchone()
        dataset = conn.execute("SELECT * FROM datasets WHERE id=?", (task["dataset_id"],)).fetchone()
        scene = conn.execute("SELECT * FROM scenes WHERE id=?", (task["scene_id"],)).fetchone()
        table_name = scene["data_table_name"]
        row = conn.execute(
            f"SELECT raw_data FROM {table_name} WHERE id=?",
            (context["row_id"],),
        ).fetchone()
        raw_data = decode_json(row["raw_data"], {})
        raw_data.update(model_result)
        preview_data, large_fields = build_row_preview_payload(raw_data)
        _ensure_dataset_columns(conn, dataset, model_result.keys())
        conn.execute(
            f"""
            UPDATE {table_name}
            SET raw_data=?,
                preview_data=?,
                large_fields=?,
                annotation_status=?,
                annotation_task_id=?,
                model_result=?,
                rendered_prompt=?,
                updated_at=?
            WHERE id=?
            """,
            (
                encode_json(raw_data),
                preview_data,
                large_fields,
                status,
                task_id,
                encode_json(model_result),
                rendered_prompt,
                timestamp,
                context["row_id"],
            ),
        )
        conn.execute(
            """
            UPDATE annotation_task_rows
            SET status=?, model_result=?, rendered_prompt=?, updated_at=?, finished_at=?
            WHERE id=?
            """,
            (status, encode_json(model_result), rendered_prompt, timestamp, timestamp, task_row_id),
        )
        _refresh_task_counts(conn, task_id, timestamp)

    return {
        "row_id": context["row_id"],
        "status": status,
        "model_result": model_result,
        "rendered_prompt": rendered_prompt,
        "rendered_prompts": rendered_prompts,
        "metrics": get_dataset_metrics(context["dataset_id"], task["scheme_id"]),
        "task": get_annotation_task(task_id),
    }


def _mark_row_failed(task_id: str, task_row_id: str, error: str) -> dict:
    timestamp = now_iso()
    with get_db() as conn:
        task = conn.execute("SELECT * FROM annotation_tasks WHERE id=?", (task_id,)).fetchone()
        scene = conn.execute("SELECT * FROM scenes WHERE id=?", (task["scene_id"],)).fetchone()
        task_row = conn.execute("SELECT * FROM annotation_task_rows WHERE id=?", (task_row_id,)).fetchone()
        table_name = scene["data_table_name"]
        conn.execute(
            """
            UPDATE annotation_task_rows
            SET status=?, error=?, updated_at=?, finished_at=?
            WHERE id=?
            """,
            (ROW_STATUS_FAILED, error, timestamp, timestamp, task_row_id),
        )
        conn.execute(
            f"""
            UPDATE {table_name}
            SET annotation_status=?, annotation_task_id=?, updated_at=?
            WHERE id=?
            """,
            (ROW_STATUS_FAILED, task_id, timestamp, task_row["row_id"]),
        )
        _refresh_task_counts(conn, task_id, timestamp)
        dataset_id = task["dataset_id"]

    return {
        "row_id": task_row["row_id"],
        "status": ROW_STATUS_FAILED,
        "error": error,
        "metrics": get_dataset_metrics(dataset_id, task["scheme_id"]),
        "task": get_annotation_task(task_id),
    }


def _load_dataset_scene_scheme(conn, dataset_id: str, scheme_id: str) -> tuple[dict, dict, dict]:
    dataset = conn.execute("SELECT * FROM datasets WHERE id=?", (dataset_id,)).fetchone()
    if not dataset:
        raise HTTPException(status_code=404, detail="数据集不存在")
    scene = conn.execute("SELECT * FROM scenes WHERE id=?", (dataset["scene_id"],)).fetchone()
    if not scene:
        raise HTTPException(status_code=404, detail="场景不存在")
    scheme = conn.execute("SELECT * FROM schemes WHERE id=?", (scheme_id,)).fetchone()
    if not scheme:
        raise HTTPException(status_code=404, detail="标注方案不存在")
    if scheme["scene_id"] != scene["id"]:
        raise HTTPException(status_code=400, detail="数据集和标注方案不属于同一场景")
    return dataset, scene, scheme


def _latest_task_row_for_scheme(conn, dataset_id: str, row_id: str, scheme_id: str) -> Optional[dict]:
    return conn.execute(
        """
        SELECT task_row.*
        FROM annotation_task_rows task_row
        JOIN annotation_tasks task ON task.id=task_row.task_id
        WHERE task.dataset_id=? AND task.scheme_id=? AND task_row.row_id=?
        ORDER BY COALESCE(task_row.finished_at, task_row.updated_at, task_row.created_at) DESC
        LIMIT 1
        """,
        (dataset_id, scheme_id, row_id),
    ).fetchone()


def _select_task_rows(conn, table_name: str, dataset_id: str, row_ids: list[str], scheme_id: str) -> list[dict]:
    row_filter = ""
    params: list[Any] = [dataset_id, scheme_id, dataset_id, ROW_STATUS_QUEUED, ROW_STATUS_RUNNING]
    if row_ids:
        placeholders = ", ".join(["?"] * len(row_ids))
        row_filter = f"AND data_row.id IN ({placeholders})"
        params.extend(row_ids)
    return conn.execute(
        f"""
        WITH latest_scheme_rows AS (
          SELECT row_id, status
          FROM (
            SELECT
              task_row.row_id,
              task_row.status,
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
        SELECT data_row.id, data_row.row_index
        FROM {table_name} data_row
        LEFT JOIN latest_scheme_rows latest ON latest.row_id=data_row.id
        WHERE data_row.dataset_id=?
          AND (latest.status IS NULL OR latest.status NOT IN (?, ?))
          {row_filter}
        ORDER BY data_row.row_index ASC
        """,
        params,
    ).fetchall()


def _count_active_rows(conn, table_name: str, dataset_id: str, row_ids: list[str], scheme_id: str) -> dict[str, int]:
    params: list[Any] = [dataset_id, scheme_id, dataset_id, ROW_STATUS_QUEUED, ROW_STATUS_RUNNING]
    row_filter = ""
    if row_ids:
        placeholders = ", ".join(["?"] * len(row_ids))
        row_filter = f" AND data_row.id IN ({placeholders})"
        params.extend(row_ids)
    rows = conn.execute(
        f"""
        WITH latest_scheme_rows AS (
          SELECT row_id, status
          FROM (
            SELECT
              task_row.row_id,
              task_row.status,
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
        SELECT latest.status AS annotation_status, COUNT(*) AS count
        FROM {table_name} data_row
        JOIN latest_scheme_rows latest ON latest.row_id=data_row.id
        WHERE data_row.dataset_id=?
          AND latest.status IN (?, ?)
          {row_filter}
        GROUP BY latest.status
        """,
        params,
    ).fetchall()
    return {row["annotation_status"]: row["count"] for row in rows}


def _update_scene_rows_status(
    conn,
    table_name: str,
    row_ids: Iterable[str],
    status: str,
    task_id: str,
    timestamp: str,
) -> None:
    ids = list(row_ids)
    if not ids:
        return
    placeholders = ", ".join(["?"] * len(ids))
    conn.execute(
        f"""
        UPDATE {table_name}
        SET annotation_status=?, annotation_task_id=?, updated_at=?
        WHERE id IN ({placeholders})
        """,
        [status, task_id, timestamp, *ids],
    )


def _get_field_mapping(conn, scene_id: str) -> dict:
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


def _get_scheme_resources(conn, scheme_id: str) -> dict[str, list[dict]]:
    resources = {"prompts": [], "knowledge": [], "error_sets": []}
    rows = conn.execute(
        """
        SELECT resource_type, resource_id
        FROM scheme_resources
        WHERE scheme_id=?
        ORDER BY sort_order ASC
        """,
        (scheme_id,),
    ).fetchall()
    for row in rows:
        if row["resource_type"] == "prompt":
            item = conn.execute("SELECT * FROM prompts WHERE id=?", (row["resource_id"],)).fetchone()
            if item:
                resources["prompts"].append(item)
        elif row["resource_type"] == "knowledge":
            item = conn.execute("SELECT * FROM knowledge_items WHERE id=?", (row["resource_id"],)).fetchone()
            if item:
                resources["knowledge"].append(item)
        elif row["resource_type"] == "error_set":
            item = conn.execute("SELECT * FROM error_sets WHERE id=?", (row["resource_id"],)).fetchone()
            if item:
                resources["error_sets"].append(item)
    return resources


def _render_prompt(scheme: dict, resources: dict, field_mapping: dict, row_data: dict, context: dict) -> dict:
    if scheme.get("prompt_init_type") == "custom":
        method_name = scheme.get("prompt_init_method_name") or "build_prompts_custom"
        method = getattr(hooks, method_name, None)
        if not method:
            raise ValueError(f"Prompt 初始化方法不存在：{method_name}")
        custom_inputs = _build_custom_prompt_inputs(resources)
        custom_context = {
            **context,
            "resource_lists": {
                "prompts": resources["prompts"],
                "knowledge": resources["knowledge"],
                "error_sets": resources["error_sets"],
            },
        }
        custom_prompts = method(
            custom_inputs["prompts"],
            custom_inputs["knowledge"],
            custom_inputs["error_sets"],
            field_mapping,
            row_data,
            custom_context,
        )
        return _normalize_rendered_prompts(custom_prompts, resources["prompts"])

    rendered_prompts = {}
    for prompt in resources["prompts"]:
        content = _render_prompt_template(prompt, resources["knowledge"], resources["error_sets"], row_data)
        _set_rendered_prompt(rendered_prompts, prompt, content)
    return rendered_prompts


def _build_custom_prompt_inputs(resources: dict) -> dict:
    prompt_map: dict[str, dict] = {}
    knowledge_map: dict[str, str] = {}
    error_set_map: dict[str, str] = {}

    for prompt in resources.get("prompts", []):
        key = _unique_resource_key(
            prompt_map,
            prompt.get("role_name") or prompt.get("name"),
            prompt.get("id"),
        )
        prompt_map[key] = dict(prompt)

    for item in resources.get("knowledge", []):
        key = _unique_resource_key(knowledge_map, item.get("name"), item.get("id"))
        knowledge_map[key] = str(item.get("content", ""))

    for item in resources.get("error_sets", []):
        key = _unique_resource_key(error_set_map, item.get("name"), item.get("id"))
        error_set_map[key] = str(item.get("description", ""))

    return {
        "prompts": prompt_map,
        "knowledge": knowledge_map,
        "error_sets": error_set_map,
    }


def _unique_resource_key(target: dict, base: Any, fallback: Any = "") -> str:
    key = str(base or fallback or "default").strip() or "default"
    if key not in target:
        return key
    fallback_key = str(fallback or "").strip()
    if fallback_key and fallback_key not in target:
        return fallback_key
    index = 2
    while f"{key}#{index}" in target:
        index += 1
    return f"{key}#{index}"


def _render_prompt_template(prompt: dict, knowledge: list[dict], error_sets: list[dict], row_data: dict) -> str:
    text = prompt.get("content", "")
    knowledge_text = "\n\n".join(item.get("content", "") for item in knowledge)
    error_text = "\n\n".join(
        f"{item.get('name', '')}\n{item.get('description', '')}".strip()
        for item in error_sets
    )

    def replace(match: re.Match) -> str:
        key = match.group(1).strip()
        if key in {"knowledge", "知识库"}:
            return knowledge_text
        if key in {"error_sets", "error_set", "错题集"}:
            return error_text
        knowledge_match = _named_resource_placeholder(key, {"knowledge", "知识库"})
        if knowledge_match:
            return _lookup_named_resource_text(knowledge, knowledge_match, "content")
        error_match = _named_resource_placeholder(key, {"error_sets", "error_set", "错题集"})
        if error_match:
            return _lookup_named_resource_text(error_sets, error_match, "description")
        if key.startswith("row."):
            return str(row_data.get(key[4:].strip(), ""))
        return match.group(0)

    return re.sub(r"｛\s*([^｛｝]+?)\s*｝", replace, text)


def _named_resource_placeholder(key: str, prefixes: set[str]) -> str:
    for prefix in prefixes:
        for separator in (".", ":", "："):
            token = f"{prefix}{separator}"
            if key.startswith(token):
                return key[len(token):].strip()
    return ""


def _lookup_named_resource_text(items: list[dict], name: str, field: str) -> str:
    for item in items:
        if name in {str(item.get("name", "")), str(item.get("id", ""))}:
            if field == "description":
                return f"{item.get('name', '')}\n{item.get('description', '')}".strip()
            return str(item.get(field, ""))
    return ""


def _normalize_rendered_prompts(value, source_prompts: list[dict]) -> dict:
    if isinstance(value, dict):
        normalized = {}
        for role_name, prompt in value.items():
            if isinstance(prompt, dict):
                normalized[str(role_name)] = {
                    "prompt_id": prompt.get("prompt_id") or prompt.get("id") or "",
                    "name": prompt.get("name") or str(role_name),
                    "role_name": prompt.get("role_name") or str(role_name),
                    "content": str(prompt.get("content", "")),
                }
            else:
                normalized[str(role_name)] = {
                    "prompt_id": "",
                    "name": str(role_name),
                    "role_name": str(role_name),
                    "content": str(prompt),
                }
        return normalized
    if isinstance(value, list):
        normalized = {}
        for prompt in value:
            if isinstance(prompt, dict):
                _set_rendered_prompt(normalized, prompt, str(prompt.get("content", "")))
        return normalized
    if isinstance(value, str):
        role_name = source_prompts[0].get("role_name") if source_prompts else "default"
        return {
            role_name or "default": {
                "prompt_id": source_prompts[0].get("id", "") if source_prompts else "",
                "name": source_prompts[0].get("name", role_name or "default") if source_prompts else "default",
                "role_name": role_name or "default",
                "content": value,
            }
        }
    return {}


def _set_rendered_prompt(target: dict, prompt: dict, content: str) -> None:
    role_name = str(prompt.get("role_name") or prompt.get("name") or prompt.get("id") or "default")
    key = role_name
    index = 2
    while key in target:
        key = f"{role_name}#{index}"
        index += 1
    target[key] = {
        "prompt_id": prompt.get("id") or prompt.get("prompt_id") or "",
        "name": prompt.get("name") or key,
        "role_name": role_name,
        "content": content,
    }


def _call_scheme_method(scheme: dict, rendered_prompts: dict, context: dict) -> dict:
    method_name = scheme.get("method_name") or "call_model"
    method = getattr(hooks, method_name, None)
    if not method:
        raise ValueError(f"标注方法不存在：{method_name}")
    return method(scheme.get("model_key", "configured"), rendered_prompts, context)


def _ensure_dataset_columns(conn, dataset: dict, columns: Iterable[str]) -> None:
    current = decode_json(dataset["column_schema"], [])
    changed = False
    for column in columns:
        if column and column not in current:
            current.append(column)
            changed = True
    if changed:
        conn.execute(
            "UPDATE datasets SET column_schema=? WHERE id=?",
            (encode_json(current), dataset["id"]),
        )


def _refresh_task_counts(conn, task_id: str, timestamp: str) -> dict:
    rows = conn.execute(
        """
        SELECT status, COUNT(*) AS count
        FROM annotation_task_rows
        WHERE task_id=?
        GROUP BY status
        """,
        (task_id,),
    ).fetchall()
    counts = {row["status"]: row["count"] for row in rows}
    queued = counts.get(ROW_STATUS_QUEUED, 0)
    running = counts.get(ROW_STATUS_RUNNING, 0)
    failed = counts.get(ROW_STATUS_FAILED, 0)
    cancelled = counts.get(ROW_STATUS_CANCELLED, 0)
    done = (
        counts.get(ROW_STATUS_TP, 0)
        + counts.get(ROW_STATUS_TN, 0)
        + counts.get(ROW_STATUS_FP, 0)
        + counts.get(ROW_STATUS_FN, 0)
    )
    status = "running" if queued or running else "done"
    if not queued and not running and cancelled:
        status = "stopped"
    if not queued and not running and failed and not done and not cancelled:
        status = "failed"
    finished_at = timestamp if status in {"done", "stopped", "failed"} else None
    conn.execute(
        """
        UPDATE annotation_tasks
        SET status=?,
            queued_count=?,
            running_count=?,
            done_count=?,
            failed_count=?,
            cancelled_count=?,
            updated_at=?,
            finished_at=COALESCE(?, finished_at)
        WHERE id=?
        """,
        (status, queued, running, done, failed, cancelled, timestamp, finished_at, task_id),
    )
    return conn.execute("SELECT * FROM annotation_tasks WHERE id=?", (task_id,)).fetchone()


def _broadcast(task_id: str, event: dict) -> None:
    with _subscriber_lock:
        _event_history.setdefault(task_id, deque(maxlen=_EVENT_HISTORY_LIMIT)).append(event)
        queues = list(_subscribers.get(task_id, []))
    for event_queue in queues:
        event_queue.put(event)


def _is_blank(value: Any) -> bool:
    return value is None or str(value).strip() == ""


def _normalize_answer(value: Any) -> str:
    text = str(value or "").strip().lower()
    if text.startswith("mock_"):
        text = text[5:]
    return "".join(text.split())


def _answer_polarity(value: Any) -> Optional[bool]:
    normalized = _normalize_answer(value)
    positive_values = {"1", "true", "yes", "y", "positive", "pos", "是", "有", "正", "正例", "阳性", "命中"}
    negative_values = {"0", "false", "no", "n", "negative", "neg", "否", "无", "负", "负例", "阴性", "未命中"}
    if normalized in positive_values:
        return True
    if normalized in negative_values:
        return False
    return None


def _judge_confusion_status(human_value: Any, model_value: Any) -> str:
    human_positive = _answer_polarity(human_value)
    model_positive = _answer_polarity(model_value)
    if human_positive is not None and model_positive is not None:
        if human_positive and model_positive:
            return ROW_STATUS_TP
        if not human_positive and not model_positive:
            return ROW_STATUS_TN
        if not human_positive and model_positive:
            return ROW_STATUS_FP
        return ROW_STATUS_FN

    return ROW_STATUS_TP if _normalize_answer(human_value) == _normalize_answer(model_value) else ROW_STATUS_FP
