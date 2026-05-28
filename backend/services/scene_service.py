from __future__ import annotations

from uuid import uuid4

from fastapi import HTTPException

from backend.database import create_scene_data_table, get_db, now_iso


def list_scenes() -> list[dict]:
    with get_db() as conn:
        return conn.execute("SELECT * FROM scenes ORDER BY created_at ASC").fetchall()


def create_scene(name: str, description: str = "") -> dict:
    scene_id = f"scene_{uuid4().hex[:12]}"
    table_name = f"scene_data_{scene_id.replace('-', '_')}"
    timestamp = now_iso()
    with get_db() as conn:
        try:
            conn.execute(
                """
                INSERT INTO scenes(id, name, description, data_table_name, created_at, updated_at)
                VALUES(?, ?, ?, ?, ?, ?)
                """,
                (scene_id, name.strip(), description.strip(), table_name, timestamp, timestamp),
            )
        except Exception as exc:
            raise HTTPException(status_code=400, detail=f"场景创建失败：{exc}") from exc
        create_scene_data_table(conn, table_name)
        return conn.execute("SELECT * FROM scenes WHERE id=?", (scene_id,)).fetchone()


def get_scene(scene_id: str) -> dict:
    with get_db() as conn:
        scene = conn.execute("SELECT * FROM scenes WHERE id=?", (scene_id,)).fetchone()
    if not scene:
        raise HTTPException(status_code=404, detail="场景不存在")
    return scene
