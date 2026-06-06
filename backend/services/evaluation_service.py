from __future__ import annotations

import re
from datetime import datetime
from typing import Any, Optional
from uuid import uuid4

from fastapi import HTTPException

from backend.database import decode_json, encode_json, get_db, now_iso
from backend.services.annotation_service import (
    ROW_STATUS_CANCELLED,
    ROW_STATUS_FAILED,
    ROW_STATUS_FN,
    ROW_STATUS_FP,
    ROW_STATUS_QUEUED,
    ROW_STATUS_RUNNING,
    ROW_STATUS_TN,
    ROW_STATUS_TP,
    create_annotation_task,
)

MAX_EVALUATION_ITEMS = 4


def create_evaluation_task(payload: dict) -> dict:
    scene_id = payload["scene_id"]
    dataset_id = payload["dataset_id"]
    scheme_ids = list(dict.fromkeys(payload.get("scheme_ids") or []))[:MAX_EVALUATION_ITEMS]
    if not scheme_ids:
        raise HTTPException(status_code=400, detail="请选择至少一个标注方案")

    timestamp = now_iso()
    eval_id = f"eval_{uuid4().hex[:12]}"
    with get_db() as conn:
        scene = conn.execute("SELECT * FROM scenes WHERE id=?", (scene_id,)).fetchone()
        dataset = conn.execute("SELECT * FROM datasets WHERE id=? AND scene_id=?", (dataset_id, scene_id)).fetchone()
        if not scene:
            raise HTTPException(status_code=404, detail="场景不存在")
        if not dataset:
            raise HTTPException(status_code=404, detail="数据集不存在或不属于当前场景")
        schemes = conn.execute(
            f"""
            SELECT * FROM schemes
            WHERE scene_id=? AND id IN ({",".join(["?"] * len(scheme_ids))})
            """,
            (scene_id, *scheme_ids),
        ).fetchall()
        if len(schemes) != len(scheme_ids):
            raise HTTPException(status_code=400, detail="存在不属于当前场景的标注方案")
        active_count = conn.execute(
            """
            SELECT COUNT(*) AS count
            FROM annotation_tasks
            WHERE dataset_id=? AND status IN ('queued', 'running')
            """,
            (dataset_id,),
        ).fetchone()["count"]
        if active_count:
            raise HTTPException(status_code=400, detail=f"当前数据集还有 {active_count} 个未完成标注任务，完成或停止后再启动评估")
        scheme_by_id = {scheme["id"]: scheme for scheme in schemes}
        default_name = " / ".join([scheme_by_id[scheme_id]["name"] for scheme_id in scheme_ids[:3]])
        task_name = (payload.get("name") or default_name or "评估任务")[:120]
        conn.execute(
            """
            INSERT INTO evaluation_tasks(id, scene_id, dataset_id, name, status, created_at, updated_at)
            VALUES(?, ?, ?, ?, ?, ?, ?)
            """,
            (eval_id, scene_id, dataset_id, task_name, "queued", timestamp, timestamp),
        )

    item_rows = []
    created_annotation_tasks = []
    try:
        for sort_order, scheme_id in enumerate(scheme_ids):
            annotation_task = create_annotation_task(
                {
                    "dataset_id": dataset_id,
                    "scheme_id": scheme_id,
                    "row_ids": [],
                    "mode": "all",
                }
            )
            created_annotation_tasks.append(annotation_task)
            item_rows.append(
                (
                    f"eval_item_{uuid4().hex[:12]}",
                    eval_id,
                    scheme_id,
                    annotation_task["id"],
                    sort_order,
                    now_iso(),
                )
            )
    except Exception as exc:
        with get_db() as conn:
            conn.execute(
                "UPDATE evaluation_tasks SET status='failed', error=?, updated_at=? WHERE id=?",
                (str(exc), now_iso(), eval_id),
            )
        raise

    with get_db() as conn:
        conn.executemany(
            """
            INSERT INTO evaluation_task_items(
                id, evaluation_task_id, scheme_id, annotation_task_id, sort_order, created_at
            )
            VALUES(?, ?, ?, ?, ?, ?)
            """,
            item_rows,
        )
        conn.execute(
            """
            UPDATE evaluation_tasks
            SET status=?, started_at=?, updated_at=?
            WHERE id=?
            """,
            ("running", timestamp, now_iso(), eval_id),
        )

    return get_evaluation_task(eval_id)


def list_evaluation_tasks(scene_id: Optional[str] = None, dataset_id: Optional[str] = None) -> list[dict]:
    with get_db() as conn:
        where = []
        params: list[Any] = []
        if scene_id:
            where.append("eval.scene_id=?")
            params.append(scene_id)
        if dataset_id:
            where.append("eval.dataset_id=?")
            params.append(dataset_id)
        where_sql = f"WHERE {' AND '.join(where)}" if where else ""
        rows = conn.execute(
            f"""
            SELECT
              eval.*,
              scene.name AS scene_name,
              dataset.name AS dataset_name,
              COUNT(item.id) AS item_count
            FROM evaluation_tasks eval
            JOIN scenes scene ON scene.id=eval.scene_id
            JOIN datasets dataset ON dataset.id=eval.dataset_id
            LEFT JOIN evaluation_task_items item ON item.evaluation_task_id=eval.id
            {where_sql}
            GROUP BY eval.id
            ORDER BY eval.created_at DESC
            """,
            params,
        ).fetchall()
    return [_format_evaluation_task_summary(row) for row in rows]


def get_evaluation_task(evaluation_task_id: str) -> dict:
    with get_db() as conn:
        task = conn.execute(
            """
            SELECT
              eval.*,
              scene.name AS scene_name,
              dataset.name AS dataset_name
            FROM evaluation_tasks eval
            JOIN scenes scene ON scene.id=eval.scene_id
            JOIN datasets dataset ON dataset.id=eval.dataset_id
            WHERE eval.id=?
            """,
            (evaluation_task_id,),
        ).fetchone()
        if not task:
            raise HTTPException(status_code=404, detail="评估任务不存在")
        item_rows = conn.execute(
            """
            SELECT
              item.*,
              scheme.name AS scheme_name,
              task.status AS annotation_task_status,
              task.total_count,
              task.queued_count,
              task.running_count,
              task.done_count,
              task.failed_count,
              task.cancelled_count,
              task.created_at AS annotation_created_at,
              task.started_at AS annotation_started_at,
              task.finished_at AS annotation_finished_at,
              task.error AS annotation_error
            FROM evaluation_task_items item
            JOIN schemes scheme ON scheme.id=item.scheme_id
            JOIN annotation_tasks task ON task.id=item.annotation_task_id
            WHERE item.evaluation_task_id=?
            ORDER BY item.sort_order ASC, item.created_at ASC
            """,
            (evaluation_task_id,),
        ).fetchall()

    items = [_format_evaluation_item(row) for row in item_rows]
    status = _derive_evaluation_status(items)
    summary = _build_summary(items)
    timestamp = now_iso()
    with get_db() as conn:
        conn.execute(
            """
            UPDATE evaluation_tasks
            SET status=?, summary_json=?, updated_at=?, finished_at=COALESCE(?, finished_at)
            WHERE id=?
            """,
            (
                status,
                encode_json(summary),
                timestamp,
                timestamp if status in {"done", "failed", "stopped"} else None,
                evaluation_task_id,
            ),
        )

    task["status"] = status
    task["summary"] = summary
    task["items"] = items
    task["item_count"] = len(items)
    task["summary_json"] = decode_json(task.get("summary_json"), {})
    return task


def list_evaluation_candidates(evaluation_task_id: str) -> list[dict]:
    task = get_evaluation_task(evaluation_task_id)
    existing_ids = {item["annotation_task_id"] for item in task["items"]}
    with get_db() as conn:
        rows = conn.execute(
            """
            SELECT
              task.*,
              scheme.name AS scheme_name
            FROM annotation_tasks task
            JOIN schemes scheme ON scheme.id=task.scheme_id
            WHERE task.scene_id=?
              AND task.dataset_id=?
              AND task.status IN ('done', 'stopped', 'failed', 'interrupted')
            ORDER BY task.created_at DESC
            """,
            (task["scene_id"], task["dataset_id"]),
        ).fetchall()
    return [
        _format_annotation_candidate(row)
        for row in rows
        if row["id"] not in existing_ids
    ]


def add_evaluation_item(evaluation_task_id: str, payload: dict) -> dict:
    annotation_task_id = payload.get("annotation_task_id") or ""
    if not annotation_task_id:
        raise HTTPException(status_code=400, detail="请选择标注历史任务")
    task = get_evaluation_task(evaluation_task_id)
    if len(task["items"]) >= MAX_EVALUATION_ITEMS:
        raise HTTPException(status_code=400, detail=f"最多支持 {MAX_EVALUATION_ITEMS} 个对比项")
    if annotation_task_id in {item["annotation_task_id"] for item in task["items"]}:
        return get_evaluation_task(evaluation_task_id)

    with get_db() as conn:
        annotation_task = conn.execute(
            "SELECT * FROM annotation_tasks WHERE id=?",
            (annotation_task_id,),
        ).fetchone()
        if not annotation_task:
            raise HTTPException(status_code=404, detail="标注历史任务不存在")
        if annotation_task["scene_id"] != task["scene_id"] or annotation_task["dataset_id"] != task["dataset_id"]:
            raise HTTPException(status_code=400, detail="只能添加同一场景、同一数据集下的标注历史")
        max_order = conn.execute(
            """
            SELECT COALESCE(MAX(sort_order), -1) AS max_order
            FROM evaluation_task_items
            WHERE evaluation_task_id=?
            """,
            (evaluation_task_id,),
        ).fetchone()["max_order"]
        conn.execute(
            """
            INSERT INTO evaluation_task_items(
                id, evaluation_task_id, scheme_id, annotation_task_id, sort_order, created_at
            )
            VALUES(?, ?, ?, ?, ?, ?)
            """,
            (
                f"eval_item_{uuid4().hex[:12]}",
                evaluation_task_id,
                annotation_task["scheme_id"],
                annotation_task_id,
                int(max_order or 0) + 1,
                now_iso(),
            ),
        )
    return get_evaluation_task(evaluation_task_id)


def delete_evaluation_item(evaluation_task_id: str, item_id: str) -> dict:
    with get_db() as conn:
        existing = conn.execute(
            "SELECT id FROM evaluation_task_items WHERE id=? AND evaluation_task_id=?",
            (item_id, evaluation_task_id),
        ).fetchone()
        if not existing:
            raise HTTPException(status_code=404, detail="对比项不存在")
        conn.execute("DELETE FROM evaluation_task_items WHERE id=?", (item_id,))
    return get_evaluation_task(evaluation_task_id)


def _format_evaluation_task_summary(row: dict) -> dict:
    row = dict(row)
    row["summary_json"] = decode_json(row.get("summary_json"), {})
    return row


def _format_evaluation_item(row: dict) -> dict:
    metrics = _metrics_for_annotation_task(row["annotation_task_id"])
    return {
        "id": row["id"],
        "evaluation_task_id": row["evaluation_task_id"],
        "scheme_id": row["scheme_id"],
        "scheme_name": row["scheme_name"],
        "annotation_task_id": row["annotation_task_id"],
        "status": row["annotation_task_status"],
        "sort_order": row["sort_order"],
        "created_at": row["created_at"],
        "annotation_created_at": row["annotation_created_at"],
        "annotation_started_at": row["annotation_started_at"],
        "annotation_finished_at": row["annotation_finished_at"],
        "error": row.get("annotation_error") or "",
        "metrics": metrics,
    }


def _format_annotation_candidate(row: dict) -> dict:
    metrics = _metrics_for_annotation_task(row["id"])
    return {
        "annotation_task_id": row["id"],
        "scheme_id": row["scheme_id"],
        "scheme_name": row["scheme_name"],
        "status": row["status"],
        "created_at": row["created_at"],
        "started_at": row.get("started_at"),
        "finished_at": row.get("finished_at"),
        "metrics": metrics,
    }


def _metrics_for_annotation_task(annotation_task_id: str) -> dict:
    with get_db() as conn:
        task = conn.execute("SELECT * FROM annotation_tasks WHERE id=?", (annotation_task_id,)).fetchone()
        if not task:
            raise HTTPException(status_code=404, detail="标注任务不存在")
        rows = conn.execute(
            """
            SELECT status, COUNT(*) AS count
            FROM annotation_task_rows
            WHERE task_id=?
            GROUP BY status
            """,
            (annotation_task_id,),
        ).fetchall()
        duration_rows = conn.execute(
            """
            SELECT model_result, started_at, finished_at
            FROM annotation_task_rows
            WHERE task_id=?
            """,
            (annotation_task_id,),
        ).fetchall()

    counts = {row["status"]: row["count"] for row in rows}
    tp = counts.get(ROW_STATUS_TP, 0)
    tn = counts.get(ROW_STATUS_TN, 0)
    fp = counts.get(ROW_STATUS_FP, 0)
    fn = counts.get(ROW_STATUS_FN, 0)
    evaluated = tp + tn + fp + fn
    durations = [_row_duration_seconds(row) for row in duration_rows]
    durations = [value for value in durations if value is not None]
    total_duration = _task_duration_seconds(task) or sum(durations)
    avg_duration = (sum(durations) / len(durations)) if durations else None
    return {
        "total": task["total_count"],
        "queued": counts.get(ROW_STATUS_QUEUED, 0),
        "running": counts.get(ROW_STATUS_RUNNING, 0),
        "failed": counts.get(ROW_STATUS_FAILED, 0),
        "cancelled": counts.get(ROW_STATUS_CANCELLED, 0),
        "done": evaluated,
        "tp": tp,
        "tn": tn,
        "fp": fp,
        "fn": fn,
        "algorithm_accuracy": round((tp + tn) / evaluated, 4) if evaluated else None,
        "correct_precision": round(tp / (tp + fp), 4) if tp + fp else None,
        "correct_recall": round(tp / (tp + fn), 4) if tp + fn else None,
        "error_recall": round(tn / (tn + fp), 4) if tn + fp else None,
        "error_precision": round(tn / (tn + fn), 4) if tn + fn else None,
        "f1": round((2 * tp) / ((2 * tp) + fp + fn), 4) if (2 * tp) + fp + fn else None,
        "business_accuracy": round((tp + fp) / evaluated, 4) if evaluated else None,
        "avg_duration_seconds": round(avg_duration, 3) if avg_duration is not None else None,
        "total_duration_seconds": round(total_duration, 3) if total_duration is not None else None,
    }


def _derive_evaluation_status(items: list[dict]) -> str:
    statuses = {item["status"] for item in items}
    if not items:
        return "queued"
    if statuses & {"queued", "running"}:
        return "running"
    if statuses and statuses <= {"done"}:
        return "done"
    if "failed" in statuses and not (statuses & {"done", "stopped", "interrupted"}):
        return "failed"
    if statuses & {"stopped", "interrupted"}:
        return "stopped"
    return "done"


def _build_summary(items: list[dict]) -> dict:
    scored = [
        item
        for item in items
        if item["metrics"].get("algorithm_accuracy") is not None
    ]
    if not scored:
        return {"conclusion": "暂无可比较结果"}
    best = max(scored, key=lambda item: item["metrics"]["algorithm_accuracy"])
    return {
        "conclusion": f"{best['scheme_name']} 当前准确率最高",
        "best_item_id": best["id"],
        "best_scheme_id": best["scheme_id"],
        "best_accuracy": best["metrics"]["algorithm_accuracy"],
    }


def _row_duration_seconds(row: dict) -> Optional[float]:
    model_result = decode_json(row.get("model_result") or "{}", {})
    duration = _parse_duration_text(model_result.get("标注耗时") if isinstance(model_result, dict) else "")
    if duration is not None:
        return duration
    return _seconds_between(row.get("started_at"), row.get("finished_at"))


def _task_duration_seconds(task: dict) -> Optional[float]:
    return _seconds_between(task.get("started_at"), task.get("finished_at"))


def _seconds_between(started_at: str | None, finished_at: str | None) -> Optional[float]:
    if not started_at or not finished_at:
        return None
    try:
        return max((datetime.fromisoformat(finished_at) - datetime.fromisoformat(started_at)).total_seconds(), 0)
    except ValueError:
        return None


def _parse_duration_text(value: Any) -> Optional[float]:
    text = str(value or "").strip()
    if not text:
        return None
    match = re.fullmatch(r"(\d+(?:\.\d+)?)s", text)
    if match:
        return float(match.group(1))
    match = re.fullmatch(r"(\d+)m\s+(\d+(?:\.\d+)?)s", text)
    if match:
        return int(match.group(1)) * 60 + float(match.group(2))
    match = re.fullmatch(r"(\d+)h\s+(\d+)m", text)
    if match:
        return int(match.group(1)) * 3600 + int(match.group(2)) * 60
    return None
