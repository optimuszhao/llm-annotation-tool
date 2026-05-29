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


def list_schemes(scene_id: Optional[str]) -> list[dict]:
    schemes = _list_resource("schemes", scene_id)
    with get_db() as conn:
        for scheme in schemes:
            scheme["resources"] = conn.execute(
                """
                SELECT resource_type, resource_id, sort_order
                FROM scheme_resources
                WHERE scheme_id=?
                ORDER BY sort_order ASC
                """,
                (scheme["id"],),
            ).fetchall()
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
        scheme = conn.execute("SELECT * FROM schemes WHERE id=?", (scheme_id,)).fetchone()
        scheme["resources"] = conn.execute(
            "SELECT resource_type, resource_id, sort_order FROM scheme_resources WHERE scheme_id=?",
            (scheme_id,),
        ).fetchall()
        return scheme
