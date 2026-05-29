from __future__ import annotations

import queue
import re
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Any, Iterable, Optional
from uuid import uuid4

from fastapi import HTTPException

from backend.database import decode_json, encode_json, get_db, now_iso
from user_hooks import hooks


GLOBAL_CONCURRENCY_LIMIT = 20
ROW_STATUS_QUEUED = "排队中"
ROW_STATUS_RUNNING = "标注中"
ROW_STATUS_CANCELLED = "取消"
ROW_STATUS_FAILED = "失败"
ROW_STATUS_TP = "TP"
ROW_STATUS_FP = "FP"

_global_semaphore = threading.Semaphore(GLOBAL_CONCURRENCY_LIMIT)
_subscriber_lock = threading.Lock()
_subscribers: dict[str, list[queue.Queue]] = {}


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
        skipped_counts = _count_active_rows(conn, table_name, dataset_id, requested_row_ids)
        rows = _select_task_rows(conn, table_name, dataset_id, requested_row_ids)
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


def list_annotation_tasks(dataset_id: Optional[str] = None) -> list[dict]:
    with get_db() as conn:
        if dataset_id:
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


def analyze_dataset_row(dataset_id: str, row_id: str) -> dict:
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
        model_result = decode_json(row["model_result"], {})

    analysis_result = hooks.analyze_row(raw_data, model_result)
    if not isinstance(analysis_result, dict):
        raise HTTPException(status_code=500, detail="分析方法必须返回 dict")

    with get_db() as conn:
        dataset = conn.execute("SELECT * FROM datasets WHERE id=?", (dataset_id,)).fetchone()
        scene = conn.execute("SELECT * FROM scenes WHERE id=?", (dataset["scene_id"],)).fetchone()
        table_name = scene["data_table_name"]
        row = conn.execute(
            f"SELECT raw_data FROM {table_name} WHERE id=? AND dataset_id=?",
            (row_id, dataset_id),
        ).fetchone()
        raw_data = decode_json(row["raw_data"], {})
        raw_data["分析数据"] = analysis_result
        _ensure_dataset_columns(conn, dataset, ["分析数据"])
        conn.execute(
            f"""
            UPDATE {table_name}
            SET raw_data=?, analysis_data=?, updated_at=?
            WHERE id=? AND dataset_id=?
            """,
            (encode_json(raw_data), encode_json(analysis_result), timestamp, row_id, dataset_id),
        )
        latest = conn.execute(
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
            INSERT INTO row_analysis_history(id, dataset_id, row_id, task_row_id, analysis_data, created_at)
            VALUES(?, ?, ?, ?, ?, ?)
            """,
            (f"analysis_{uuid4().hex[:12]}", dataset_id, row_id, task_row_id, encode_json(analysis_result), timestamp),
        )

    if task_id:
        _broadcast(task_id, {"type": "row_analyzed", "row_id": row_id, "analysis_data": analysis_result})
    return {"row_id": row_id, "analysis_data": analysis_result}


def list_row_analysis_history(dataset_id: str, row_id: str) -> list[dict]:
    with get_db() as conn:
        dataset = conn.execute("SELECT id FROM datasets WHERE id=?", (dataset_id,)).fetchone()
        if not dataset:
            raise HTTPException(status_code=404, detail="数据集不存在")
        rows = conn.execute(
            """
            SELECT id, dataset_id, row_id, task_row_id, analysis_data, created_at
            FROM row_analysis_history
            WHERE dataset_id=? AND row_id=?
            ORDER BY created_at DESC
            """,
            (dataset_id, row_id),
        ).fetchall()
    for row in rows:
        row["analysis_data"] = decode_json(row.get("analysis_data"), {})
    return rows


def list_row_annotation_history(dataset_id: str, row_id: str) -> list[dict]:
    with get_db() as conn:
        dataset = conn.execute("SELECT id FROM datasets WHERE id=?", (dataset_id,)).fetchone()
        if not dataset:
            raise HTTPException(status_code=404, detail="数据集不存在")
        rows = conn.execute(
            """
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
            ORDER BY COALESCE(task_row.finished_at, task_row.updated_at, task_row.created_at) DESC
            """,
            (dataset_id, row_id),
        ).fetchall()
    for row in rows:
        row["model_result"] = decode_json(row.get("model_result"), {})
        row["analysis_data"] = decode_json(row.get("analysis_data"), {})
    return rows


def get_dataset_metrics(dataset_id: str) -> dict:
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
    tn = counts.get("TN", 0)
    fp = counts.get(ROW_STATUS_FP, 0)
    fn = counts.get("FN", 0)
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
        _subscribers.setdefault(task_id, []).append(event_queue)
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
                "metrics": get_dataset_metrics(task["dataset_id"]),
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

    rendered_prompt = _render_prompt(scheme, resources, field_mapping, row_data, context)
    model_result = _call_scheme_method(scheme, rendered_prompt, context)
    if not isinstance(model_result, dict):
        raise ValueError("标注方法必须返回 dict")

    model_answer_column = field_mapping.get("model_answer_column") or ""
    human_answer_column = field_mapping.get("human_answer_column") or ""
    if not model_answer_column or model_answer_column not in model_result:
        raise ValueError(f"标注结果缺少标注答案列：{model_answer_column or '未配置'}")
    if not human_answer_column or _is_blank(row_data.get(human_answer_column)):
        raise ValueError(f"人工答案列为空或未配置：{human_answer_column or '未配置'}")

    human_value = _normalize_answer(row_data.get(human_answer_column))
    model_value = _normalize_answer(model_result.get(model_answer_column))
    status = ROW_STATUS_TP if human_value == model_value else ROW_STATUS_FP
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
        _ensure_dataset_columns(conn, dataset, model_result.keys())
        conn.execute(
            f"""
            UPDATE {table_name}
            SET raw_data=?,
                annotation_status=?,
                annotation_task_id=?,
                model_result=?,
                rendered_prompt=?,
                updated_at=?
            WHERE id=?
            """,
            (
                encode_json(raw_data),
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
        "metrics": get_dataset_metrics(context["dataset_id"]),
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
        "metrics": get_dataset_metrics(dataset_id),
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


def _select_task_rows(conn, table_name: str, dataset_id: str, row_ids: list[str]) -> list[dict]:
    if row_ids:
        placeholders = ", ".join(["?"] * len(row_ids))
        return conn.execute(
            f"""
            SELECT id, row_index
            FROM {table_name}
            WHERE dataset_id=? AND id IN ({placeholders})
              AND annotation_status NOT IN (?, ?)
            ORDER BY row_index ASC
            """,
            [dataset_id, *row_ids, ROW_STATUS_QUEUED, ROW_STATUS_RUNNING],
        ).fetchall()
    return conn.execute(
        f"""
        SELECT id, row_index
        FROM {table_name}
        WHERE dataset_id=?
          AND annotation_status NOT IN (?, ?)
        ORDER BY row_index ASC
        """,
        (dataset_id, ROW_STATUS_QUEUED, ROW_STATUS_RUNNING),
    ).fetchall()


def _count_active_rows(conn, table_name: str, dataset_id: str, row_ids: list[str]) -> dict[str, int]:
    params: list[Any] = [dataset_id, ROW_STATUS_QUEUED, ROW_STATUS_RUNNING]
    row_filter = ""
    if row_ids:
        placeholders = ", ".join(["?"] * len(row_ids))
        row_filter = f" AND id IN ({placeholders})"
        params.extend(row_ids)
    rows = conn.execute(
        f"""
        SELECT annotation_status, COUNT(*) AS count
        FROM {table_name}
        WHERE dataset_id=?
          AND annotation_status IN (?, ?)
          {row_filter}
        GROUP BY annotation_status
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


def _render_prompt(scheme: dict, resources: dict, field_mapping: dict, row_data: dict, context: dict) -> str:
    if scheme.get("prompt_init_type") == "custom":
        method_name = scheme.get("prompt_init_method_name") or "build_prompt_custom"
        method = getattr(hooks, method_name, None)
        if not method:
            raise ValueError(f"Prompt 初始化方法不存在：{method_name}")
        return method(resources["prompts"], resources["knowledge"], resources["error_sets"], field_mapping, row_data, context)
    return "\n\n".join(
        _render_prompt_template(prompt, resources["knowledge"], resources["error_sets"], row_data)
        for prompt in resources["prompts"]
    )


def _render_prompt_template(prompt: dict, knowledge: list[dict], error_sets: list[dict], row_data: dict) -> str:
    text = prompt.get("content", "")
    knowledge_text = "\n\n".join(item.get("content", "") for item in knowledge)
    error_text = "\n\n".join(
        f"{item.get('name', '')}\n{item.get('description', '')}".strip()
        for item in error_sets
    )

    def replace(match: re.Match) -> str:
        key = match.group(1).strip()
        if key == "knowledge":
            return knowledge_text
        if key == "error_sets":
            return error_text
        if key.startswith("row."):
            return str(row_data.get(key[4:].strip(), ""))
        return ""

    rendered = re.sub(r"\{\{\s*([^{}]+?)\s*\}\}", replace, text)
    return f"[{prompt.get('role_name', '')}] {prompt.get('name', '')}\n{rendered}"


def _call_scheme_method(scheme: dict, rendered_prompt: str, context: dict) -> dict:
    method_name = scheme.get("method_name") or "call_model"
    method = getattr(hooks, method_name, None)
    if not method:
        raise ValueError(f"标注方法不存在：{method_name}")
    return method(scheme.get("model_key", "configured"), rendered_prompt, context)


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
    done = counts.get(ROW_STATUS_TP, 0) + counts.get(ROW_STATUS_FP, 0)
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
        queues = list(_subscribers.get(task_id, []))
    for event_queue in queues:
        event_queue.put(event)


def _is_blank(value: Any) -> bool:
    return value is None or str(value).strip() == ""


def _normalize_answer(value: Any) -> str:
    return str(value).strip()
