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
    conn.execute("PRAGMA foreign_keys = ON")
    try:
        yield conn
        conn.commit()
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
            created_at TEXT NOT NULL,
            annotation_status TEXT NOT NULL DEFAULT '未标注',
            annotation_task_id TEXT,
            model_result TEXT NOT NULL DEFAULT '{{}}',
            analysis_data TEXT NOT NULL DEFAULT '{{}}',
            rendered_prompt TEXT NOT NULL DEFAULT '',
            updated_at TEXT
        )
        """
    )
    ensure_column(conn, table_name, "annotation_status", "TEXT NOT NULL DEFAULT '未标注'")
    ensure_column(conn, table_name, "annotation_task_id", "TEXT")
    ensure_column(conn, table_name, "model_result", "TEXT NOT NULL DEFAULT '{}'")
    ensure_column(conn, table_name, "analysis_data", "TEXT NOT NULL DEFAULT '{}'")
    ensure_column(conn, table_name, "rendered_prompt", "TEXT NOT NULL DEFAULT ''")
    ensure_column(conn, table_name, "updated_at", "TEXT")
    conn.execute(
        f"CREATE INDEX IF NOT EXISTS idx_{table_name}_dataset ON {table_name}(dataset_id)"
    )
    conn.execute(
        f"CREATE INDEX IF NOT EXISTS idx_{table_name}_annotation_status ON {table_name}(annotation_status)"
    )


def init_db() -> None:
    with get_db() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS scenes (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL UNIQUE,
                description TEXT,
                data_table_name TEXT NOT NULL UNIQUE,
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
                visible_columns TEXT NOT NULL DEFAULT '[]',
                annotation_columns TEXT NOT NULL DEFAULT '[]',
                updated_at TEXT NOT NULL,
                FOREIGN KEY(scene_id) REFERENCES scenes(id) ON DELETE CASCADE
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

            CREATE INDEX IF NOT EXISTS idx_annotation_tasks_dataset ON annotation_tasks(dataset_id);
            CREATE INDEX IF NOT EXISTS idx_annotation_tasks_status ON annotation_tasks(status);
            CREATE INDEX IF NOT EXISTS idx_annotation_task_rows_task ON annotation_task_rows(task_id);
            CREATE INDEX IF NOT EXISTS idx_annotation_task_rows_row ON annotation_task_rows(row_id);
            """
        )
        ensure_column(conn, "schemes", "prompt_init_type", "TEXT NOT NULL DEFAULT 'auto'")
        ensure_column(conn, "schemes", "prompt_init_method_name", "TEXT NOT NULL DEFAULT ''")
        timestamp = now_iso()
        for scene in conn.execute("SELECT data_table_name FROM scenes").fetchall():
            create_scene_data_table(conn, scene["data_table_name"])
            conn.execute(
                f"""
                UPDATE {scene['data_table_name']}
                SET annotation_status='取消', updated_at=?
                WHERE annotation_status IN ('排队中', '标注中')
                """,
                (timestamp,),
            )
        conn.execute(
            """
            UPDATE annotation_tasks
            SET status='interrupted', updated_at=?, finished_at=?, error='服务重启后未完成任务已中断'
            WHERE status IN ('queued', 'running')
            """,
            (timestamp, timestamp),
        )
        conn.execute(
            """
            UPDATE annotation_task_rows
            SET status='cancelled', updated_at=?, finished_at=?, error='服务重启后未完成任务已中断'
            WHERE status IN ('queued', 'running')
            """,
            (timestamp, timestamp),
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
