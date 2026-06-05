from __future__ import annotations

from typing import Any

from backend.database import create_scene_data_table, decode_json, get_db, now_iso
from backend.services.dataset_service import build_row_preview_payload


def backfill_preview_cache(force: bool = False) -> dict[str, Any]:
    timestamp = now_iso()
    total_rows = 0
    updated_rows = 0
    skipped_rows = 0
    failed_rows = 0
    scene_results: list[dict[str, Any]] = []

    with get_db() as conn:
        scenes = conn.execute("SELECT id, name, data_table_name FROM scenes ORDER BY created_at ASC").fetchall()
        for scene in scenes:
            table_name = scene["data_table_name"]
            create_scene_data_table(conn, table_name)

            where = "1=1" if force else "(preview_data IS NULL OR preview_data='' OR preview_data='{}')"
            ready_before = conn.execute(
                f"""
                SELECT COUNT(*) AS total
                FROM {table_name}
                WHERE preview_data IS NOT NULL AND preview_data!='' AND preview_data!='{{}}'
                """
            ).fetchone()["total"]
            rows = conn.execute(
                f"SELECT id, raw_data FROM {table_name} WHERE {where} ORDER BY row_index ASC"
            ).fetchall()

            scene_total = len(rows)
            scene_updated = 0
            scene_failed = 0
            total_rows += scene_total

            for row in rows:
                raw_data = decode_json(row.get("raw_data"), {})
                if not isinstance(raw_data, dict):
                    failed_rows += 1
                    scene_failed += 1
                    continue

                preview_data, large_fields = build_row_preview_payload(raw_data)
                conn.execute(
                    f"""
                    UPDATE {table_name}
                    SET preview_data=?, large_fields=?, updated_at=?
                    WHERE id=?
                    """,
                    (preview_data, large_fields, timestamp, row["id"]),
                )
                updated_rows += 1
                scene_updated += 1

            skipped_rows += ready_before
            scene_results.append(
                {
                    "scene_id": scene["id"],
                    "scene_name": scene["name"],
                    "checked_rows": scene_total,
                    "updated_rows": scene_updated,
                    "failed_rows": scene_failed,
                    "ready_rows": ready_before + scene_updated,
                }
            )

    return {
        "ok": True,
        "force": force,
        "checked_rows": total_rows,
        "updated_rows": updated_rows,
        "skipped_rows": skipped_rows,
        "failed_rows": failed_rows,
        "scenes": scene_results,
    }


def prune_annotation_history() -> dict[str, Any]:
    """删除旧标注历史，每行每方案保留最近一条记录。"""
    with get_db() as conn:
        before = conn.execute("SELECT COUNT(*) AS count FROM annotation_task_rows").fetchone()["count"]
        deleted = conn.execute(
            """
            DELETE FROM annotation_task_rows
            WHERE id IN (
              SELECT id
              FROM (
                SELECT
                  task_row.id,
                  ROW_NUMBER() OVER (
                    PARTITION BY task.dataset_id, task.scheme_id, task_row.row_id
                    ORDER BY
                      COALESCE(task_row.finished_at, task_row.updated_at, task_row.created_at) DESC,
                      task_row.rowid DESC
                  ) AS rn
                FROM annotation_task_rows task_row
                JOIN annotation_tasks task ON task.id = task_row.task_id
              )
              WHERE rn > 1
            )
            """
        ).rowcount
        conn.execute(
            """
            DELETE FROM annotation_tasks
            WHERE id NOT IN (
              SELECT DISTINCT task_id
              FROM annotation_task_rows
            )
            """
        )
        after = conn.execute("SELECT COUNT(*) AS count FROM annotation_task_rows").fetchone()["count"]
    return {
        "ok": True,
        "type": "annotation_history",
        "before_count": before,
        "deleted_count": max(deleted, 0),
        "remaining_count": after,
        "keep_rule": "每行每方案保留最近一条标注历史",
    }


def prune_analysis_history() -> dict[str, Any]:
    """删除旧分析历史，每行每分析方法保留最近一条记录。"""
    with get_db() as conn:
        before = conn.execute("SELECT COUNT(*) AS count FROM row_analysis_history").fetchone()["count"]
        deleted = conn.execute(
            """
            DELETE FROM row_analysis_history
            WHERE id IN (
              SELECT id
              FROM (
                SELECT
                  id,
                  ROW_NUMBER() OVER (
                    PARTITION BY dataset_id, row_id, method_name
                    ORDER BY created_at DESC, rowid DESC
                  ) AS rn
                FROM row_analysis_history
              )
              WHERE rn > 1
            )
            """
        ).rowcount
        after = conn.execute("SELECT COUNT(*) AS count FROM row_analysis_history").fetchone()["count"]
    return {
        "ok": True,
        "type": "analysis_history",
        "before_count": before,
        "deleted_count": max(deleted, 0),
        "remaining_count": after,
        "keep_rule": "每行每分析方法保留最近一条分析历史",
    }
