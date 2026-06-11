from __future__ import annotations

import sqlite3
from pathlib import Path
from typing import Any

from backend.database import DB_PATH, create_scene_data_table, decode_json, encode_json, get_db, now_iso
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
        scenes = conn.execute("SELECT id, name, data_table_name FROM scenes WHERE is_group=0 ORDER BY created_at ASC").fetchall()
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


def database_storage_diagnostics() -> dict[str, Any]:
    """统计数据库文件、空闲页和主要大字段占用，辅助定位卡顿来源。"""
    with get_db() as conn:
        page_count = _pragma_int(conn, "page_count")
        page_size = _pragma_int(conn, "page_size")
        freelist_count = _pragma_int(conn, "freelist_count")
        scene_tables = _scene_table_storage(conn)
        history_tables = _history_table_storage(conn)
        dbstat_tables = _dbstat_table_storage(conn)

    files = _database_files(DB_PATH)
    free_bytes = freelist_count * page_size
    return {
        "ok": True,
        "files": files,
        "pages": {
            "page_count": page_count,
            "page_size": page_size,
            "freelist_count": freelist_count,
            "free_bytes": free_bytes,
            "used_estimate_bytes": max(page_count * page_size - free_bytes, 0),
        },
        "scene_tables": scene_tables,
        "history_tables": history_tables,
        "dbstat_tables": dbstat_tables,
        "advice": [
            "清理历史记录后执行压缩数据库，可以释放 SQLite 空闲页并缩小 annotation.db 文件。",
            "列表页会优先读取 preview_data，完整 raw_data、rendered_prompt 和 analysis_data 保留在查看详情时读取。",
        ],
    }


def compact_database() -> dict[str, Any]:
    """执行 WAL 截断、VACUUM 和 PRAGMA optimize，让清理后的空间真正归还给文件系统。"""
    before = database_storage_diagnostics()
    before_free_bytes = before.get("pages", {}).get("free_bytes", 0) or 0
    before_wal_bytes = before.get("files", {}).get("wal_bytes", 0) or 0
    with sqlite3.connect(DB_PATH, timeout=120, isolation_level=None) as conn:
        active_count = conn.execute(
            """
            SELECT COUNT(*)
            FROM annotation_tasks
            WHERE status IN ('queued', 'running')
            """
        ).fetchone()[0]
        if active_count:
            return {
                "ok": False,
                "active_tasks": active_count,
                "detail": "当前存在运行中或排队中的标注任务，等待任务结束后再压缩数据库。",
                "before": before,
            }
        if before_free_bytes <= 0 and before_wal_bytes <= 0:
            return {
                "ok": True,
                "skipped": True,
                "detail": "当前数据库没有可释放的空闲页，已跳过压缩。",
                "before": before,
                "after": before,
                "saved_bytes": 0,
            }
        conn.execute("PRAGMA wal_checkpoint(TRUNCATE)")
        conn.execute("VACUUM")
        conn.execute("PRAGMA wal_checkpoint(TRUNCATE)")

    after = database_storage_diagnostics()
    return {
        "ok": True,
        "before": before,
        "after": after,
        "saved_bytes": max(before["files"]["total_bytes"] - after["files"]["total_bytes"], 0),
    }


def _pragma_int(conn, name: str) -> int:
    row = conn.execute(f"PRAGMA {name}").fetchone()
    if isinstance(row, dict):
        return int(next(iter(row.values())) or 0)
    return int(row[0] or 0)


def _database_files(db_path: Path) -> dict[str, Any]:
    db = Path(db_path)
    wal = Path(f"{db_path}-wal")
    shm = Path(f"{db_path}-shm")
    sizes = {
        "database_bytes": _file_size(db),
        "wal_bytes": _file_size(wal),
        "shm_bytes": _file_size(shm),
    }
    sizes["total_bytes"] = sum(sizes.values())
    return sizes


def _file_size(path: Path) -> int:
    return path.stat().st_size if path.exists() else 0


def _scene_table_storage(conn) -> list[dict[str, Any]]:
    rows = conn.execute(
        "SELECT id, name, data_table_name FROM scenes WHERE is_group=0 ORDER BY created_at ASC"
    ).fetchall()
    results: list[dict[str, Any]] = []
    for scene in rows:
        table_name = scene["data_table_name"]
        create_scene_data_table(conn, table_name)
        stat = conn.execute(
            f"""
            SELECT
              COUNT(*) AS row_count,
              COALESCE(SUM(LENGTH(raw_data)), 0) AS raw_data_bytes,
              COALESCE(SUM(LENGTH(preview_data)), 0) AS preview_data_bytes,
              COALESCE(SUM(LENGTH(model_result)), 0) AS model_result_bytes,
              COALESCE(SUM(LENGTH(rendered_prompt)), 0) AS rendered_prompt_bytes,
              COALESCE(SUM(LENGTH(analysis_data)), 0) AS analysis_data_bytes
            FROM {table_name}
            """
        ).fetchone()
        total = sum(
            int(stat[key] or 0)
            for key in (
                "raw_data_bytes",
                "preview_data_bytes",
                "model_result_bytes",
                "rendered_prompt_bytes",
                "analysis_data_bytes",
            )
        )
        results.append(
            {
                "scene_id": scene["id"],
                "scene_name": scene["name"],
                "table_name": table_name,
                "row_count": stat["row_count"],
                "raw_data_bytes": stat["raw_data_bytes"],
                "preview_data_bytes": stat["preview_data_bytes"],
                "model_result_bytes": stat["model_result_bytes"],
                "rendered_prompt_bytes": stat["rendered_prompt_bytes"],
                "analysis_data_bytes": stat["analysis_data_bytes"],
                "tracked_text_bytes": total,
            }
        )
    return sorted(results, key=lambda item: item["tracked_text_bytes"], reverse=True)


def _history_table_storage(conn) -> list[dict[str, Any]]:
    results: list[dict[str, Any]] = []
    for table_name, columns in (
        ("annotation_task_rows", ("model_result", "rendered_prompt", "analysis_data")),
        ("row_analysis_history", ("analysis_data",)),
    ):
        if not _table_exists(conn, table_name):
            continue
        expressions = ", ".join(
            f"COALESCE(SUM(LENGTH({column})), 0) AS {column}_bytes"
            for column in columns
        )
        stat = conn.execute(f"SELECT COUNT(*) AS row_count, {expressions} FROM {table_name}").fetchone()
        total = sum(int(stat[f"{column}_bytes"] or 0) for column in columns)
        results.append(
            {
                "table_name": table_name,
                "row_count": stat["row_count"],
                "tracked_text_bytes": total,
                **{f"{column}_bytes": stat[f"{column}_bytes"] for column in columns},
            }
        )
    return sorted(results, key=lambda item: item["tracked_text_bytes"], reverse=True)


def _dbstat_table_storage(conn) -> list[dict[str, Any]]:
    try:
        rows = conn.execute(
            """
            SELECT name AS table_name, COALESCE(SUM(pgsize), 0) AS bytes
            FROM dbstat
            GROUP BY name
            ORDER BY bytes DESC
            LIMIT 30
            """
        ).fetchall()
    except Exception:
        return []
    return [{"table_name": row["table_name"], "bytes": row["bytes"]} for row in rows]


def _table_exists(conn, table_name: str) -> bool:
    row = conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
        (table_name,),
    ).fetchone()
    return bool(row)


def _dedupe(values: list[str]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for value in values:
        if not value or value in seen:
            continue
        seen.add(value)
        result.append(value)
    return result
