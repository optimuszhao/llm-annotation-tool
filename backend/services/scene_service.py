from __future__ import annotations

from uuid import uuid4

from fastapi import HTTPException

from backend.database import create_scene_data_table, get_db, now_iso


def list_scenes(include_groups: bool = False) -> list[dict]:
    with get_db() as conn:
        if include_groups:
            return conn.execute(
                """
                SELECT * FROM scenes
                ORDER BY is_group DESC, created_at ASC
                """
            ).fetchall()
        return conn.execute(
            "SELECT * FROM scenes WHERE is_group=0 ORDER BY created_at ASC"
        ).fetchall()


def create_scene(name: str, description: str = "", parent_id: str = "", is_group: bool = False) -> dict:
    scene_id = f"scene_{uuid4().hex[:12]}"
    timestamp = now_iso()
    clean_name = name.strip()
    clean_description = description.strip()
    clean_parent_id = parent_id.strip()

    with get_db() as conn:
        try:
            if is_group:
                table_name = f"scene_group_{scene_id.replace('-', '_')}"
                conn.execute(
                    """
                    INSERT INTO scenes(id, name, description, data_table_name, parent_id, is_group, created_at, updated_at)
                    VALUES(?, ?, ?, ?, '', 1, ?, ?)
                    """,
                    (scene_id, clean_name, clean_description, table_name, timestamp, timestamp),
                )
            else:
                if clean_parent_id:
                    parent = conn.execute(
                        "SELECT id FROM scenes WHERE id=? AND is_group=1",
                        (clean_parent_id,),
                    ).fetchone()
                    if not parent:
                        raise HTTPException(status_code=400, detail="一级场景不存在")
                table_name = f"scene_data_{scene_id.replace('-', '_')}"
                conn.execute(
                    """
                    INSERT INTO scenes(id, name, description, data_table_name, parent_id, is_group, created_at, updated_at)
                    VALUES(?, ?, ?, ?, ?, 0, ?, ?)
                    """,
                    (scene_id, clean_name, clean_description, table_name, clean_parent_id, timestamp, timestamp),
                )
                create_scene_data_table(conn, table_name)
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(status_code=400, detail=f"场景创建失败：{exc}") from exc
        return conn.execute("SELECT * FROM scenes WHERE id=?", (scene_id,)).fetchone()


def get_scene(scene_id: str) -> dict:
    with get_db() as conn:
        scene = conn.execute("SELECT * FROM scenes WHERE id=?", (scene_id,)).fetchone()
    if not scene:
        raise HTTPException(status_code=404, detail="场景不存在")
    return scene


def delete_scene(scene_id: str) -> dict:
    with get_db() as conn:
        scene = conn.execute("SELECT * FROM scenes WHERE id=?", (scene_id,)).fetchone()
        if not scene:
            raise HTTPException(status_code=404, detail="场景不存在")

        deleted_ids = []
        if scene.get("is_group"):
            children = conn.execute(
                "SELECT id FROM scenes WHERE parent_id=? AND is_group=0 ORDER BY created_at ASC",
                (scene_id,),
            ).fetchall()
            for child in children:
                _delete_leaf_scene(conn, child["id"])
                deleted_ids.append(child["id"])
            conn.execute("DELETE FROM scenes WHERE id=?", (scene_id,))
            deleted_ids.append(scene_id)
        else:
            _delete_leaf_scene(conn, scene_id)
            deleted_ids.append(scene_id)
    return {"ok": True, "id": scene_id, "deleted_ids": deleted_ids}


def _delete_leaf_scene(conn, scene_id: str) -> None:
    scene = conn.execute("SELECT * FROM scenes WHERE id=? AND is_group=0", (scene_id,)).fetchone()
    if not scene:
        raise HTTPException(status_code=404, detail="二级场景不存在")

    table_name = scene["data_table_name"]
    if not table_name.startswith("scene_data_"):
        raise HTTPException(status_code=400, detail="场景数据表名异常")

    task_ids = [
        row["id"]
        for row in conn.execute(
            "SELECT id FROM annotation_tasks WHERE scene_id=?",
            (scene_id,),
        ).fetchall()
    ]
    if task_ids:
        placeholders = ", ".join(["?"] * len(task_ids))
        conn.execute(f"DELETE FROM annotation_task_rows WHERE task_id IN ({placeholders})", task_ids)
    conn.execute("DELETE FROM annotation_tasks WHERE scene_id=?", (scene_id,))
    conn.execute(
        """
        DELETE FROM row_analysis_history
        WHERE dataset_id IN (SELECT id FROM datasets WHERE scene_id=?)
        """,
        (scene_id,),
    )
    conn.execute(
        """
        DELETE FROM scheme_resources
        WHERE scheme_id IN (SELECT id FROM schemes WHERE scene_id=?)
        """,
        (scene_id,),
    )
    conn.execute("DELETE FROM field_mappings WHERE scene_id=?", (scene_id,))
    conn.execute("DELETE FROM prompts WHERE scene_id=?", (scene_id,))
    conn.execute("DELETE FROM knowledge_items WHERE scene_id=?", (scene_id,))
    conn.execute("DELETE FROM error_sets WHERE scene_id=?", (scene_id,))
    conn.execute("DELETE FROM schemes WHERE scene_id=?", (scene_id,))
    conn.execute("DELETE FROM datasets WHERE scene_id=?", (scene_id,))
    conn.execute(f"DROP TABLE IF EXISTS {table_name}")
    conn.execute("DELETE FROM scenes WHERE id=?", (scene_id,))
