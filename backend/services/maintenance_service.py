from __future__ import annotations

from typing import Any

from backend.database import create_scene_data_table, decode_json, encode_json, get_db, now_iso
from backend.services.dataset_service import build_row_preview_payload, flatten_model_result_for_display


SCENE_ROW_INTERNAL_COLUMNS = {
    "row_id",
    "row_index",
    "状态",
    "model_result",
    "analysis_data",
    "rendered_prompt",
    "is_favorite",
    "收藏",
}


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


def prune_unused_model_result_columns() -> dict[str, Any]:
    """清理没有被最新标注结果引用的标注返回列。"""
    timestamp = now_iso()
    checked_datasets = 0
    changed_datasets = 0
    removed_columns_count = 0
    updated_rows = 0
    dataset_results: list[dict[str, Any]] = []

    with get_db() as conn:
        datasets = conn.execute(
            """
            SELECT dataset.*, scene.data_table_name
            FROM datasets dataset
            JOIN scenes scene ON scene.id = dataset.scene_id
            ORDER BY dataset.created_at ASC
            """
        ).fetchall()
        for dataset in datasets:
            checked_datasets += 1
            table_name = dataset["data_table_name"]
            rows = conn.execute(
                f"""
                SELECT id, raw_data, model_result
                FROM {table_name}
                WHERE dataset_id=?
                ORDER BY row_index ASC
                """,
                (dataset["id"],),
            ).fetchall()
            history_rows = conn.execute(
                """
                SELECT task_row.model_result
                FROM annotation_task_rows task_row
                JOIN annotation_tasks task ON task.id=task_row.task_id
                WHERE task.dataset_id=?
                  AND json_valid(task_row.model_result)
                  AND TRIM(COALESCE(task_row.model_result, '')) NOT IN ('', '{}')
                """,
                (dataset["id"],),
            ).fetchall()
            latest_history_rows = conn.execute(
                """
                SELECT model_result
                FROM (
                  SELECT
                    task_row.model_result,
                    ROW_NUMBER() OVER (
                      PARTITION BY task.dataset_id, task.scheme_id, task_row.row_id
                      ORDER BY
                        COALESCE(task_row.finished_at, task_row.updated_at, task_row.created_at) DESC,
                        task_row.rowid DESC
                    ) AS rn
                  FROM annotation_task_rows task_row
                  JOIN annotation_tasks task ON task.id=task_row.task_id
                  WHERE task.dataset_id=?
                    AND json_valid(task_row.model_result)
                    AND TRIM(COALESCE(task_row.model_result, '')) NOT IN ('', '{}')
                )
                WHERE rn=1
                """,
                (dataset["id"],),
            ).fetchall()

            current_columns = decode_json(dataset.get("column_schema"), [])
            if not isinstance(current_columns, list):
                current_columns = []

            latest_result_columns: list[str] = []
            candidate_result_columns: list[str] = []
            row_payloads: list[tuple[str, dict[str, Any], set[str]]] = []

            for row in rows:
                raw_data = decode_json(row.get("raw_data"), {})
                if not isinstance(raw_data, dict):
                    raw_data = {}
                model_result = decode_json(row.get("model_result"), {})
                if not isinstance(model_result, dict):
                    model_result = {}
                display_result = flatten_model_result_for_display(model_result)
                result_keys = {key for key in display_result if key}
                candidate_result_columns.extend(key for key in display_result if key and key not in candidate_result_columns)
                latest_result_columns.extend(key for key in display_result if key and key not in latest_result_columns)
                row_payloads.append((row["id"], raw_data, result_keys))

            for row in history_rows:
                candidate_result_columns.extend(
                    key
                    for key in flatten_model_result_for_display(decode_json(row.get("model_result"), {}))
                    if key and key not in candidate_result_columns
                )
            for row in latest_history_rows:
                latest_result_columns.extend(
                    key
                    for key in flatten_model_result_for_display(decode_json(row.get("model_result"), {}))
                    if key and key not in latest_result_columns
                )

            candidate_result_columns = _dedupe(candidate_result_columns)
            latest_result_columns = _dedupe(latest_result_columns)
            candidate_result_set = set(candidate_result_columns)
            latest_result_set = set(latest_result_columns)
            keep_columns = _dedupe([
                column
                for column in current_columns
                if column not in candidate_result_set or column in latest_result_set or column in SCENE_ROW_INTERNAL_COLUMNS
            ])
            for column in latest_result_columns:
                if column not in keep_columns:
                    keep_columns.append(column)
            removed_columns = [
                column
                for column in current_columns
                if column and column in candidate_result_set and column not in latest_result_set and column not in SCENE_ROW_INTERNAL_COLUMNS
            ]
            if not removed_columns:
                continue

            removed_set = set(removed_columns)
            for row_id, raw_data, _result_keys in row_payloads:
                cleaned = {key: value for key, value in raw_data.items() if key not in removed_set}
                if cleaned == raw_data:
                    continue
                preview_data, large_fields = build_row_preview_payload(cleaned)
                conn.execute(
                    f"""
                    UPDATE {table_name}
                    SET raw_data=?, preview_data=?, large_fields=?, updated_at=?
                    WHERE id=?
                    """,
                    (encode_json(cleaned), preview_data, large_fields, timestamp, row_id),
                )
                updated_rows += 1

            conn.execute(
                "UPDATE datasets SET column_schema=? WHERE id=?",
                (encode_json(keep_columns), dataset["id"]),
            )
            changed_datasets += 1
            removed_columns_count += len(removed_columns)
            dataset_results.append(
                {
                    "dataset_id": dataset["id"],
                    "dataset_name": dataset["name"],
                    "removed_columns": removed_columns,
                    "removed_count": len(removed_columns),
                }
            )

    return {
        "ok": True,
        "type": "unused_model_result_columns",
        "checked_datasets": checked_datasets,
        "changed_datasets": changed_datasets,
        "removed_columns_count": removed_columns_count,
        "updated_rows": updated_rows,
        "datasets": dataset_results[:20],
        "keep_rule": "保留 Excel 原始列和当前最新标注结果仍在使用的返回列",
    }


def _dedupe(values: list[str]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for value in values:
        if not value or value in seen:
            continue
        seen.add(value)
        result.append(value)
    return result
