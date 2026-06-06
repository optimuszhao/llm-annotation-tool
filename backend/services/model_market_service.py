from __future__ import annotations

from uuid import uuid4

from fastapi import HTTPException

from backend.database import decode_json, encode_json, get_db, now_iso


def _serialize_config(row: dict) -> dict:
    config = decode_json(row.get("config_json"), {}) if row.get("config_json") else {}
    return {
        "id": row["id"],
        "name": row["name"],
        "url": row["url"],
        "api_key": row.get("api_key", ""),
        "model_name": row.get("model_name") or row["name"],
        "config": config,
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }


def list_model_market_configs() -> list[dict]:
    with get_db() as conn:
        rows = conn.execute(
            "SELECT * FROM model_market_configs ORDER BY created_at DESC"
        ).fetchall()
    return [_serialize_config(row) for row in rows]


def get_model_market_config(config_id: str) -> dict | None:
    if not config_id:
        return None
    with get_db() as conn:
        row = conn.execute(
            "SELECT * FROM model_market_configs WHERE id=?",
            (config_id,),
        ).fetchone()
    return _serialize_config(row) if row else None


def create_model_market_config(payload: dict) -> dict:
    timestamp = now_iso()
    config_id = f"model_market_{uuid4().hex[:12]}"
    name = (payload.get("name") or "").strip()
    url = (payload.get("url") or "").strip()
    api_key = payload.get("api_key") or ""
    model_name = (payload.get("model_name") or name).strip()
    if not name:
        raise HTTPException(status_code=400, detail="请填写模型名称")
    if not url:
        raise HTTPException(status_code=400, detail="请填写模型 URL")
    config = {
        "URL": url,
        "API Key": api_key,
        "Model Name": model_name or name,
    }
    with get_db() as conn:
        exists = conn.execute(
            "SELECT id FROM model_market_configs WHERE name=?",
            (name,),
        ).fetchone()
        if exists:
            raise HTTPException(status_code=400, detail="模型名称已存在")
        conn.execute(
            """
            INSERT INTO model_market_configs(
                id, name, url, api_key, model_name, config_json, created_at, updated_at
            )
            VALUES(?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (config_id, name, url, api_key, model_name or name, encode_json(config), timestamp, timestamp),
        )
        row = conn.execute("SELECT * FROM model_market_configs WHERE id=?", (config_id,)).fetchone()
    return _serialize_config(row)


def delete_model_market_config(config_id: str) -> dict:
    with get_db() as conn:
        existing = conn.execute(
            "SELECT * FROM model_market_configs WHERE id=?",
            (config_id,),
        ).fetchone()
        if not existing:
            raise HTTPException(status_code=404, detail="模型配置不存在")
        used = conn.execute(
            "SELECT COUNT(*) AS count FROM schemes WHERE model_key=?",
            (config_id,),
        ).fetchone()
        if used and used["count"]:
            raise HTTPException(status_code=400, detail="该模型已被标注方案使用，请先调整或删除相关方案")
        conn.execute("DELETE FROM model_market_configs WHERE id=?", (config_id,))
    return {"ok": True, "id": config_id}
