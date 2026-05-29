from __future__ import annotations

from typing import Optional
from uuid import uuid4

from fastapi import HTTPException

from backend.database import get_db, now_iso


def _ensure_scene(conn, scene_id: str) -> None:
    if not conn.execute("SELECT id FROM scenes WHERE id=?", (scene_id,)).fetchone():
        raise HTTPException(status_code=404, detail="场景不存在")


def _insert_resource(table: str, payload: dict, fields: list[str]) -> dict:
    resource_id = f"{table.rstrip('s')}_{uuid4().hex[:12]}"
    timestamp = now_iso()
    with get_db() as conn:
        _ensure_scene(conn, payload["scene_id"])
        columns = ["id", *fields, "created_at", "updated_at"]
        values = [resource_id, *[payload.get(field, "") for field in fields], timestamp, timestamp]
        placeholders = ", ".join(["?"] * len(columns))
        conn.execute(
            f"INSERT INTO {table}({', '.join(columns)}) VALUES({placeholders})",
            values,
        )
        return conn.execute(f"SELECT * FROM {table} WHERE id=?", (resource_id,)).fetchone()


def _list_resource(table: str, scene_id: Optional[str]) -> list[dict]:
    with get_db() as conn:
        if scene_id:
            return conn.execute(
                f"SELECT * FROM {table} WHERE scene_id=? ORDER BY created_at DESC",
                (scene_id,),
            ).fetchall()
        return conn.execute(f"SELECT * FROM {table} ORDER BY created_at DESC").fetchall()


def _update_resource(table: str, resource_id: str, payload: dict, fields: list[str]) -> dict:
    timestamp = now_iso()
    with get_db() as conn:
        existing = conn.execute(f"SELECT * FROM {table} WHERE id=?", (resource_id,)).fetchone()
        if not existing:
            raise HTTPException(status_code=404, detail="资源不存在")
        if payload.get("scene_id"):
            _ensure_scene(conn, payload["scene_id"])
        assignments = ", ".join([f"{field}=?" for field in fields] + ["updated_at=?"])
        values = [payload.get(field, existing.get(field, "")) for field in fields]
        conn.execute(
            f"UPDATE {table} SET {assignments} WHERE id=?",
            [*values, timestamp, resource_id],
        )
        return conn.execute(f"SELECT * FROM {table} WHERE id=?", (resource_id,)).fetchone()


def _delete_resource(table: str, resource_id: str, resource_type: str, detail: str) -> dict:
    with get_db() as conn:
        existing = conn.execute(f"SELECT * FROM {table} WHERE id=?", (resource_id,)).fetchone()
        if not existing:
            raise HTTPException(status_code=404, detail=f"{detail}不存在")
        conn.execute(
            "DELETE FROM scheme_resources WHERE resource_type=? AND resource_id=?",
            (resource_type, resource_id),
        )
        conn.execute(f"DELETE FROM {table} WHERE id=?", (resource_id,))
    return {"ok": True, "id": resource_id}


def list_prompts(scene_id: Optional[str]) -> list[dict]:
    return _list_resource("prompts", scene_id)


def create_prompt(payload: dict) -> dict:
    return _insert_resource(
        "prompts",
        payload,
        ["scene_id", "name", "role_name", "content", "source_file"],
    )


def update_prompt(prompt_id: str, payload: dict) -> dict:
    return _update_resource(
        "prompts",
        prompt_id,
        payload,
        ["scene_id", "name", "role_name", "content", "source_file"],
    )


def delete_prompt(prompt_id: str) -> dict:
    return _delete_resource("prompts", prompt_id, "prompt", "Prompt")


def list_knowledge(scene_id: Optional[str]) -> list[dict]:
    return _list_resource("knowledge_items", scene_id)


def create_knowledge(payload: dict) -> dict:
    return _insert_resource(
        "knowledge_items",
        payload,
        ["scene_id", "name", "content", "source_file"],
    )


def update_knowledge(knowledge_id: str, payload: dict) -> dict:
    return _update_resource(
        "knowledge_items",
        knowledge_id,
        payload,
        ["scene_id", "name", "content", "source_file"],
    )


def delete_knowledge(knowledge_id: str) -> dict:
    return _delete_resource("knowledge_items", knowledge_id, "knowledge", "知识")


def list_error_sets(scene_id: Optional[str]) -> list[dict]:
    return _list_resource("error_sets", scene_id)


def create_error_set(payload: dict) -> dict:
    return _insert_resource("error_sets", payload, ["scene_id", "name", "description"])


def update_error_set(error_set_id: str, payload: dict) -> dict:
    return _update_resource(
        "error_sets",
        error_set_id,
        payload,
        ["scene_id", "name", "description"],
    )


def delete_error_set(error_set_id: str) -> dict:
    return _delete_resource("error_sets", error_set_id, "error_set", "错题集")


def list_schemes(scene_id: Optional[str]) -> list[dict]:
    schemes = _list_resource("schemes", scene_id)
    with get_db() as conn:
        for scheme in schemes:
            scheme["resources"] = _scheme_resources(conn, scheme["id"])
    return schemes


def create_scheme(payload: dict) -> dict:
    scheme_id = f"scheme_{uuid4().hex[:12]}"
    timestamp = now_iso()
    with get_db() as conn:
        _ensure_scene(conn, payload["scene_id"])
        conn.execute(
            """
            INSERT INTO schemes(
                id,
                scene_id,
                name,
                model_key,
                method_name,
                prompt_init_type,
                prompt_init_method_name,
                concurrency,
                created_at,
                updated_at
            )
            VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                scheme_id,
                payload["scene_id"],
                payload["name"],
                payload["model_key"],
                payload["method_name"],
                payload.get("prompt_init_type", "auto"),
                payload.get("prompt_init_method_name", ""),
                payload.get("concurrency", 1),
                timestamp,
                timestamp,
            ),
        )
        _replace_scheme_resources(conn, scheme_id, payload)
        scheme = conn.execute("SELECT * FROM schemes WHERE id=?", (scheme_id,)).fetchone()
        scheme["resources"] = _scheme_resources(conn, scheme_id)
        return scheme


def update_scheme(scheme_id: str, payload: dict) -> dict:
    timestamp = now_iso()
    with get_db() as conn:
        existing = conn.execute("SELECT * FROM schemes WHERE id=?", (scheme_id,)).fetchone()
        if not existing:
            raise HTTPException(status_code=404, detail="标注方案不存在")
        scene_id = payload.get("scene_id") or existing["scene_id"]
        _ensure_scene(conn, scene_id)
        conn.execute(
            """
            UPDATE schemes
            SET scene_id=?,
                name=?,
                model_key=?,
                method_name=?,
                prompt_init_type=?,
                prompt_init_method_name=?,
                concurrency=?,
                updated_at=?
            WHERE id=?
            """,
            (
                scene_id,
                payload.get("name", existing["name"]),
                payload.get("model_key", existing["model_key"]),
                payload.get("method_name", existing["method_name"]),
                payload.get("prompt_init_type", existing["prompt_init_type"]),
                payload.get("prompt_init_method_name", existing["prompt_init_method_name"]),
                payload.get("concurrency", existing["concurrency"]),
                timestamp,
                scheme_id,
            ),
        )
        _replace_scheme_resources(conn, scheme_id, payload)
        scheme = conn.execute("SELECT * FROM schemes WHERE id=?", (scheme_id,)).fetchone()
        scheme["resources"] = _scheme_resources(conn, scheme_id)
        return scheme


def delete_scheme(scheme_id: str) -> dict:
    with get_db() as conn:
        scheme = conn.execute("SELECT * FROM schemes WHERE id=?", (scheme_id,)).fetchone()
        if not scheme:
            raise HTTPException(status_code=404, detail="标注方案不存在")
        task_ids = [
            row["id"]
            for row in conn.execute(
                "SELECT id FROM annotation_tasks WHERE scheme_id=?",
                (scheme_id,),
            ).fetchall()
        ]
        if task_ids:
            placeholders = ", ".join(["?"] * len(task_ids))
            scene = conn.execute("SELECT * FROM scenes WHERE id=?", (scheme["scene_id"],)).fetchone()
            if scene and scene["data_table_name"].startswith("scene_data_"):
                conn.execute(
                    f"""
                    UPDATE {scene['data_table_name']}
                    SET annotation_status='未标注',
                        annotation_task_id=NULL,
                        model_result='{{}}',
                        analysis_data='{{}}',
                        rendered_prompt='',
                        updated_at=?
                    WHERE annotation_task_id IN ({placeholders})
                    """,
                    (now_iso(), *task_ids),
                )
        conn.execute("DELETE FROM scheme_resources WHERE scheme_id=?", (scheme_id,))
        conn.execute("DELETE FROM schemes WHERE id=?", (scheme_id,))
    return {"ok": True, "id": scheme_id}


def _scheme_resources(conn, scheme_id: str) -> list[dict]:
    return conn.execute(
        """
        SELECT resource_type, resource_id, sort_order
        FROM scheme_resources
        WHERE scheme_id=?
        ORDER BY sort_order ASC
        """,
        (scheme_id,),
    ).fetchall()


def _replace_scheme_resources(conn, scheme_id: str, payload: dict) -> None:
    conn.execute("DELETE FROM scheme_resources WHERE scheme_id=?", (scheme_id,))
    resources: list[tuple[str, str, str, str, int]] = []
    order = 0
    for resource_type, ids in (
        ("prompt", payload.get("prompt_ids", [])),
        ("knowledge", payload.get("knowledge_ids", [])),
        ("error_set", payload.get("error_set_ids", [])),
    ):
        for resource_id in ids:
            resources.append(
                (
                    f"scheme_resource_{uuid4().hex[:12]}",
                    scheme_id,
                    resource_type,
                    resource_id,
                    order,
                )
            )
            order += 1
    conn.executemany(
        """
        INSERT INTO scheme_resources(id, scheme_id, resource_type, resource_id, sort_order)
        VALUES(?, ?, ?, ?, ?)
        """,
        resources,
    )
