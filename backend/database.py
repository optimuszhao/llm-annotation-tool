from __future__ import annotations

import json
import sqlite3
from contextlib import contextmanager
from datetime import date, datetime, time
from pathlib import Path
from typing import Any, Iterable, Optional


BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
DB_PATH = DATA_DIR / "annotation.db"


def now_iso() -> str:
    return datetime.now().isoformat(timespec="seconds")


def dict_factory(cursor: sqlite3.Cursor, row: sqlite3.Row) -> dict[str, Any]:
    return {column[0]: row[index] for index, column in enumerate(cursor.description)}


@contextmanager
def get_db():
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH, timeout=30)
    conn.row_factory = dict_factory
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA synchronous=NORMAL")
    conn.execute("PRAGMA busy_timeout=30000")
    conn.execute("PRAGMA foreign_keys = ON")
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def table_exists(conn: sqlite3.Connection, table_name: str) -> bool:
    row = conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
        (table_name,),
    ).fetchone()
    return bool(row)


def column_exists(conn: sqlite3.Connection, table_name: str, column_name: str) -> bool:
    return any(column["name"] == column_name for column in conn.execute(f"PRAGMA table_info({table_name})"))


def ensure_column(conn: sqlite3.Connection, table_name: str, column_name: str, definition: str) -> None:
    if not column_exists(conn, table_name, column_name):
        conn.execute(f"ALTER TABLE {table_name} ADD COLUMN {column_name} {definition}")


def create_scene_data_table(conn: sqlite3.Connection, table_name: str) -> None:
    if not table_name.startswith("scene_data_"):
        raise ValueError("Invalid scene data table name")
    conn.execute(
        f"""
        CREATE TABLE IF NOT EXISTS {table_name} (
            id TEXT PRIMARY KEY,
            dataset_id TEXT NOT NULL,
            row_index INTEGER NOT NULL,
            raw_data TEXT NOT NULL,
            preview_data TEXT NOT NULL DEFAULT '{{}}',
            large_fields TEXT NOT NULL DEFAULT '[]',
            created_at TEXT NOT NULL,
            annotation_status TEXT NOT NULL DEFAULT '未标注',
            annotation_task_id TEXT,
            model_result TEXT NOT NULL DEFAULT '{{}}',
            analysis_data TEXT NOT NULL DEFAULT '{{}}',
            rendered_prompt TEXT NOT NULL DEFAULT '',
            is_favorite INTEGER NOT NULL DEFAULT 0,
            updated_at TEXT
        )
        """
    )
    ensure_column(conn, table_name, "preview_data", "TEXT NOT NULL DEFAULT '{}'")
    ensure_column(conn, table_name, "large_fields", "TEXT NOT NULL DEFAULT '[]'")
    ensure_column(conn, table_name, "annotation_status", "TEXT NOT NULL DEFAULT '未标注'")
    ensure_column(conn, table_name, "annotation_task_id", "TEXT")
    ensure_column(conn, table_name, "model_result", "TEXT NOT NULL DEFAULT '{}'")
    ensure_column(conn, table_name, "analysis_data", "TEXT NOT NULL DEFAULT '{}'")
    ensure_column(conn, table_name, "rendered_prompt", "TEXT NOT NULL DEFAULT ''")
    ensure_column(conn, table_name, "is_favorite", "INTEGER NOT NULL DEFAULT 0")
    ensure_column(conn, table_name, "updated_at", "TEXT")
    conn.execute(
        f"CREATE INDEX IF NOT EXISTS idx_{table_name}_dataset ON {table_name}(dataset_id)"
    )
    conn.execute(
        f"CREATE INDEX IF NOT EXISTS idx_{table_name}_annotation_status ON {table_name}(annotation_status)"
    )
    conn.execute(
        f"CREATE INDEX IF NOT EXISTS idx_{table_name}_favorite ON {table_name}(is_favorite)"
    )


def init_db(recover_interrupted: bool = False) -> None:
    with get_db() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS scenes (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL UNIQUE,
                description TEXT,
                data_table_name TEXT NOT NULL UNIQUE,
                parent_id TEXT NOT NULL DEFAULT '',
                is_group INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS datasets (
                id TEXT PRIMARY KEY,
                scene_id TEXT NOT NULL,
                name TEXT NOT NULL,
                file_name TEXT,
                row_count INTEGER NOT NULL DEFAULT 0,
                column_schema TEXT NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY(scene_id) REFERENCES scenes(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS prompts (
                id TEXT PRIMARY KEY,
                scene_id TEXT NOT NULL,
                name TEXT NOT NULL,
                role_name TEXT NOT NULL,
                content TEXT NOT NULL,
                source_file TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY(scene_id) REFERENCES scenes(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS knowledge_items (
                id TEXT PRIMARY KEY,
                scene_id TEXT NOT NULL,
                name TEXT NOT NULL,
                content TEXT NOT NULL,
                source_file TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY(scene_id) REFERENCES scenes(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS error_sets (
                id TEXT PRIMARY KEY,
                scene_id TEXT NOT NULL,
                name TEXT NOT NULL,
                description TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY(scene_id) REFERENCES scenes(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS schemes (
                id TEXT PRIMARY KEY,
                scene_id TEXT NOT NULL,
                name TEXT NOT NULL,
                model_key TEXT NOT NULL,
                method_name TEXT NOT NULL,
                prompt_init_type TEXT NOT NULL DEFAULT 'auto',
                prompt_init_method_name TEXT NOT NULL DEFAULT '',
                concurrency INTEGER NOT NULL DEFAULT 1,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY(scene_id) REFERENCES scenes(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS scheme_resources (
                id TEXT PRIMARY KEY,
                scheme_id TEXT NOT NULL,
                resource_type TEXT NOT NULL,
                resource_id TEXT NOT NULL,
                sort_order INTEGER NOT NULL DEFAULT 0,
                FOREIGN KEY(scheme_id) REFERENCES schemes(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS field_mappings (
                scene_id TEXT PRIMARY KEY,
                human_answer_column TEXT NOT NULL DEFAULT '',
                model_answer_column TEXT NOT NULL DEFAULT '',
                root_cause_column TEXT NOT NULL DEFAULT '',
                visible_columns TEXT NOT NULL DEFAULT '[]',
                annotation_columns TEXT NOT NULL DEFAULT '[]',
                updated_at TEXT NOT NULL,
                FOREIGN KEY(scene_id) REFERENCES scenes(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS root_cause_baselines (
                id TEXT PRIMARY KEY,
                scene_id TEXT NOT NULL,
                polarity TEXT NOT NULL,
                name TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                UNIQUE(scene_id, polarity, name),
                FOREIGN KEY(scene_id) REFERENCES scenes(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS root_cause_row_links (
                id TEXT PRIMARY KEY,
                scene_id TEXT NOT NULL,
                dataset_id TEXT NOT NULL,
                scheme_id TEXT NOT NULL DEFAULT '',
                row_id TEXT NOT NULL,
                role_name TEXT NOT NULL DEFAULT '',
                polarity TEXT NOT NULL,
                name TEXT NOT NULL,
                answer_value TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                UNIQUE(scene_id, dataset_id, scheme_id, row_id, role_name, polarity, name),
                FOREIGN KEY(scene_id) REFERENCES scenes(id) ON DELETE CASCADE,
                FOREIGN KEY(dataset_id) REFERENCES datasets(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS model_market_configs (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL UNIQUE,
                url TEXT NOT NULL,
                api_key TEXT NOT NULL DEFAULT '',
                model_name TEXT NOT NULL,
                config_json TEXT NOT NULL DEFAULT '{}',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS annotation_tasks (
                id TEXT PRIMARY KEY,
                scene_id TEXT NOT NULL,
                dataset_id TEXT NOT NULL,
                scheme_id TEXT NOT NULL,
                status TEXT NOT NULL,
                total_count INTEGER NOT NULL DEFAULT 0,
                queued_count INTEGER NOT NULL DEFAULT 0,
                running_count INTEGER NOT NULL DEFAULT 0,
                done_count INTEGER NOT NULL DEFAULT 0,
                failed_count INTEGER NOT NULL DEFAULT 0,
                cancelled_count INTEGER NOT NULL DEFAULT 0,
                concurrency INTEGER NOT NULL DEFAULT 1,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                started_at TEXT,
                finished_at TEXT,
                error TEXT NOT NULL DEFAULT '',
                FOREIGN KEY(scene_id) REFERENCES scenes(id) ON DELETE CASCADE,
                FOREIGN KEY(dataset_id) REFERENCES datasets(id) ON DELETE CASCADE,
                FOREIGN KEY(scheme_id) REFERENCES schemes(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS annotation_task_rows (
                id TEXT PRIMARY KEY,
                task_id TEXT NOT NULL,
                row_id TEXT NOT NULL,
                row_index INTEGER NOT NULL,
                status TEXT NOT NULL,
                model_result TEXT NOT NULL DEFAULT '{}',
                analysis_data TEXT NOT NULL DEFAULT '{}',
                rendered_prompt TEXT NOT NULL DEFAULT '',
                error TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                started_at TEXT,
                finished_at TEXT,
                FOREIGN KEY(task_id) REFERENCES annotation_tasks(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS evaluation_tasks (
                id TEXT PRIMARY KEY,
                scene_id TEXT NOT NULL,
                dataset_id TEXT NOT NULL,
                name TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'queued',
                summary_json TEXT NOT NULL DEFAULT '{}',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                started_at TEXT,
                finished_at TEXT,
                error TEXT NOT NULL DEFAULT '',
                FOREIGN KEY(scene_id) REFERENCES scenes(id) ON DELETE CASCADE,
                FOREIGN KEY(dataset_id) REFERENCES datasets(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS evaluation_task_items (
                id TEXT PRIMARY KEY,
                evaluation_task_id TEXT NOT NULL,
                scheme_id TEXT NOT NULL,
                annotation_task_id TEXT NOT NULL,
                sort_order INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL,
                FOREIGN KEY(evaluation_task_id) REFERENCES evaluation_tasks(id) ON DELETE CASCADE,
                FOREIGN KEY(scheme_id) REFERENCES schemes(id) ON DELETE CASCADE,
                FOREIGN KEY(annotation_task_id) REFERENCES annotation_tasks(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS row_analysis_history (
                id TEXT PRIMARY KEY,
                dataset_id TEXT NOT NULL,
                row_id TEXT NOT NULL,
                task_row_id TEXT,
                method_name TEXT NOT NULL DEFAULT '',
                method_label TEXT NOT NULL DEFAULT '',
                analysis_data TEXT NOT NULL DEFAULT '{}',
                created_at TEXT NOT NULL,
                FOREIGN KEY(dataset_id) REFERENCES datasets(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS app_preferences (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL DEFAULT '{}',
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS data_transform_configs (
                scene_id TEXT PRIMARY KEY,
                config_json TEXT NOT NULL DEFAULT '{}',
                updated_at TEXT NOT NULL,
                FOREIGN KEY(scene_id) REFERENCES scenes(id) ON DELETE CASCADE
            );

            CREATE INDEX IF NOT EXISTS idx_annotation_tasks_dataset ON annotation_tasks(dataset_id);
            CREATE INDEX IF NOT EXISTS idx_annotation_tasks_status ON annotation_tasks(status);
            CREATE INDEX IF NOT EXISTS idx_annotation_task_rows_task ON annotation_task_rows(task_id);
            CREATE INDEX IF NOT EXISTS idx_annotation_task_rows_row ON annotation_task_rows(row_id);
            CREATE INDEX IF NOT EXISTS idx_evaluation_tasks_dataset ON evaluation_tasks(dataset_id);
            CREATE INDEX IF NOT EXISTS idx_evaluation_tasks_scene ON evaluation_tasks(scene_id);
            CREATE INDEX IF NOT EXISTS idx_evaluation_task_items_eval ON evaluation_task_items(evaluation_task_id);
            CREATE INDEX IF NOT EXISTS idx_evaluation_task_items_annotation ON evaluation_task_items(annotation_task_id);
            CREATE INDEX IF NOT EXISTS idx_row_analysis_history_row ON row_analysis_history(dataset_id, row_id);
            CREATE INDEX IF NOT EXISTS idx_model_market_configs_name ON model_market_configs(name);
            CREATE INDEX IF NOT EXISTS idx_root_cause_baselines_scene ON root_cause_baselines(scene_id, polarity);
            CREATE INDEX IF NOT EXISTS idx_root_cause_links_filter ON root_cause_row_links(dataset_id, scheme_id, polarity, name);
            """
        )
        ensure_column(conn, "schemes", "prompt_init_type", "TEXT NOT NULL DEFAULT 'auto'")
        ensure_column(conn, "schemes", "prompt_init_method_name", "TEXT NOT NULL DEFAULT ''")
        ensure_column(conn, "field_mappings", "root_cause_column", "TEXT NOT NULL DEFAULT ''")
        ensure_column(conn, "row_analysis_history", "method_name", "TEXT NOT NULL DEFAULT ''")
        ensure_column(conn, "row_analysis_history", "method_label", "TEXT NOT NULL DEFAULT ''")
        ensure_column(conn, "scenes", "parent_id", "TEXT NOT NULL DEFAULT ''")
        ensure_column(conn, "scenes", "is_group", "INTEGER NOT NULL DEFAULT 0")
        migrate_scene_hierarchy(conn)
        for scene in conn.execute("SELECT data_table_name FROM scenes WHERE is_group=0").fetchall():
            create_scene_data_table(conn, scene["data_table_name"])
        if recover_interrupted:
            recover_interrupted_annotation_state(conn)


def migrate_scene_hierarchy(conn: sqlite3.Connection) -> None:
    old_leaf_count = conn.execute(
        "SELECT COUNT(*) AS count FROM scenes WHERE is_group=0 AND COALESCE(parent_id, '')=''"
    ).fetchone()["count"]
    if not old_leaf_count:
        return

    timestamp = now_iso()
    group_id = "scene_group_default"
    group = conn.execute("SELECT id FROM scenes WHERE id=?", (group_id,)).fetchone()
    if not group:
        base_name = "默认场景组"
        name = base_name
        suffix = 2
        while conn.execute("SELECT id FROM scenes WHERE name=?", (name,)).fetchone():
            name = f"{base_name}{suffix}"
            suffix += 1
        table_name = group_id
        conn.execute(
            """
            INSERT INTO scenes(id, name, description, data_table_name, parent_id, is_group, created_at, updated_at)
            VALUES(?, ?, ?, ?, '', 1, ?, ?)
            """,
            (group_id, name, "系统自动创建，用于兼容已有场景。", table_name, timestamp, timestamp),
        )

    conn.execute(
        "UPDATE scenes SET parent_id=?, updated_at=? WHERE is_group=0 AND COALESCE(parent_id, '')=''",
        (group_id, timestamp),
    )


def recover_interrupted_annotation_state(conn: sqlite3.Connection) -> None:
    timestamp = now_iso()
    active_row_statuses = ("排队中", "标注中", "queued", "running")
    affected_task_ids = {
        row["task_id"]
        for row in conn.execute(
            f"""
            SELECT DISTINCT task_id
            FROM annotation_task_rows
            WHERE status IN ({','.join(['?'] * len(active_row_statuses))})
            """,
            active_row_statuses,
        ).fetchall()
    }
    affected_task_ids.update(
        row["id"]
        for row in conn.execute(
            "SELECT id FROM annotation_tasks WHERE status IN ('queued', 'running')"
        ).fetchall()
    )

    for scene in conn.execute("SELECT data_table_name FROM scenes WHERE is_group=0").fetchall():
        conn.execute(
            f"""
            UPDATE {scene['data_table_name']}
            SET annotation_status='排队中', updated_at=?
            WHERE annotation_status IN ('排队中', '标注中')
            """,
            (timestamp,),
        )

    conn.execute(
        f"""
        UPDATE annotation_task_rows
        SET status='排队中',
            updated_at=?,
            finished_at=NULL,
            error=''
        WHERE status IN ({','.join(['?'] * len(active_row_statuses))})
        """,
        (timestamp, *active_row_statuses),
    )

    for task_id in affected_task_ids:
        counts = {
            row["status"]: row["count"]
            for row in conn.execute(
                """
                SELECT status, COUNT(*) AS count
                FROM annotation_task_rows
                WHERE task_id=?
                GROUP BY status
                """,
                (task_id,),
            ).fetchall()
        }
        done_count = counts.get("TP", 0) + counts.get("FP", 0) + counts.get("TN", 0) + counts.get("FN", 0)
        queued_count = counts.get("排队中", 0)
        running_count = counts.get("标注中", 0)
        failed_count = counts.get("失败", 0)
        cancelled_count = counts.get("取消", 0)
        status = "queued" if queued_count or running_count else "done"
        if not queued_count and not running_count and cancelled_count:
            status = "stopped"
        if not queued_count and not running_count and failed_count and not done_count and not cancelled_count:
            status = "failed"
        finished_at = timestamp if status in {"done", "stopped", "failed"} else None
        conn.execute(
            """
            UPDATE annotation_tasks
            SET status=?,
                queued_count=?,
                running_count=0,
                done_count=?,
                failed_count=?,
                cancelled_count=?,
                updated_at=?,
                finished_at=?,
                error=''
            WHERE id=?
            """,
            (
                status,
                queued_count,
                done_count,
                failed_count,
                cancelled_count,
                timestamp,
                finished_at,
                task_id,
            ),
        )


def _json_default(value: Any) -> str:
    if isinstance(value, (datetime, date, time)):
        return value.isoformat()
    return str(value)


def encode_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, default=_json_default)


def decode_json(value: Optional[str], default: Any = None) -> Any:
    if value is None:
        return default
    return json.loads(value)


def insert_many(
    conn: sqlite3.Connection,
    sql: str,
    rows: Iterable[tuple[Any, ...]],
) -> None:
    conn.executemany(sql, rows)
