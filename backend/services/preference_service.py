from __future__ import annotations

from typing import Any

from backend.database import decode_json, encode_json, get_db, now_iso


WORKBENCH_SOURCE_KEY = "workbench_source"


def _first_id(items: list[dict[str, Any]]) -> str:
    return items[0]["id"] if items else ""


def _valid_id(items: list[dict[str, Any]], preferred_id: str) -> str:
    return preferred_id if preferred_id and any(item["id"] == preferred_id for item in items) else _first_id(items)


def _read_preference(conn, key: str) -> dict[str, Any]:
    row = conn.execute("SELECT value FROM app_preferences WHERE key=?", (key,)).fetchone()
    payload = decode_json(row["value"], {}) if row else {}
    return payload if isinstance(payload, dict) else {}


def get_workbench_source() -> dict[str, str]:
    with get_db() as conn:
        payload = _read_preference(conn, WORKBENCH_SOURCE_KEY)
        scenes = conn.execute("SELECT id FROM scenes ORDER BY created_at ASC").fetchall()
        scene_id = _valid_id(scenes, str(payload.get("scene_id") or ""))

        datasets: list[dict[str, Any]] = []
        schemes: list[dict[str, Any]] = []
        if scene_id:
            datasets = conn.execute(
                "SELECT id FROM datasets WHERE scene_id=? ORDER BY created_at ASC",
                (scene_id,),
            ).fetchall()
            schemes = conn.execute(
                "SELECT id FROM schemes WHERE scene_id=? ORDER BY created_at ASC",
                (scene_id,),
            ).fetchall()

        return {
            "scene_id": scene_id,
            "dataset_id": _valid_id(datasets, str(payload.get("dataset_id") or "")),
            "scheme_id": _valid_id(schemes, str(payload.get("scheme_id") or "")),
        }


def save_workbench_source(payload: dict[str, Any]) -> dict[str, str]:
    timestamp = now_iso()
    with get_db() as conn:
        scenes = conn.execute("SELECT id FROM scenes ORDER BY created_at ASC").fetchall()
        scene_id = _valid_id(scenes, str(payload.get("scene_id") or ""))

        datasets: list[dict[str, Any]] = []
        schemes: list[dict[str, Any]] = []
        if scene_id:
            datasets = conn.execute(
                "SELECT id FROM datasets WHERE scene_id=? ORDER BY created_at ASC",
                (scene_id,),
            ).fetchall()
            schemes = conn.execute(
                "SELECT id FROM schemes WHERE scene_id=? ORDER BY created_at ASC",
                (scene_id,),
            ).fetchall()

        value = {
            "scene_id": scene_id,
            "dataset_id": _valid_id(datasets, str(payload.get("dataset_id") or "")),
            "scheme_id": _valid_id(schemes, str(payload.get("scheme_id") or "")),
        }
        conn.execute(
            """
            INSERT INTO app_preferences(key, value, updated_at)
            VALUES(?, ?, ?)
            ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at
            """,
            (WORKBENCH_SOURCE_KEY, encode_json(value), timestamp),
        )
    return value
