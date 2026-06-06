from __future__ import annotations

import tempfile
import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from backend import database
from backend.database import create_scene_data_table, encode_json, get_db, init_db, now_iso
from backend.services.model_distillation_service import list_distillation_methods, run_model_distillation
from backend.services.resource_service import create_knowledge, list_knowledge


def setup_temp_db() -> None:
    temp_dir = Path(tempfile.mkdtemp(prefix="llm_distill_test_"))
    database.DATA_DIR = temp_dir
    database.DB_PATH = temp_dir / "annotation.db"
    init_db()


def seed_dataset() -> dict:
    scene_id = "scene_distill_test"
    dataset_id = "dataset_distill_test"
    table_name = "scene_data_distill_test"
    timestamp = now_iso()
    with get_db() as conn:
        conn.execute(
            "INSERT INTO scenes(id, name, description, data_table_name, created_at, updated_at) VALUES(?,?,?,?,?,?)",
            (scene_id, "蒸馏测试场景", "测试模型蒸馏", table_name, timestamp, timestamp),
        )
        create_scene_data_table(conn, table_name)
        conn.execute(
            "INSERT INTO datasets(id, scene_id, name, file_name, row_count, column_schema, created_at) VALUES(?,?,?,?,?,?,?)",
            (dataset_id, scene_id, "distill.xlsx", "distill.xlsx", 2, encode_json(["ID", "人工答案", "answer", "Summary"]), timestamp),
        )
        conn.execute(
            """
            INSERT INTO field_mappings(scene_id, human_answer_column, model_answer_column, visible_columns, annotation_columns, updated_at)
            VALUES(?,?,?,?,?,?)
            """,
            (scene_id, "人工答案", "answer", encode_json(["ID", "人工答案", "answer"]), encode_json(["Summary"]), timestamp),
        )
        rows = [
            ("row_1", 1, {"ID": "A001", "人工答案": "是", "Summary": "链路正常"}),
            ("row_2", 2, {"ID": "A002", "人工答案": "否", "Summary": "端口异常"}),
        ]
        for row_id, row_index, raw_data in rows:
            conn.execute(
                f"""
                INSERT INTO {table_name}(id, dataset_id, row_index, raw_data, preview_data, large_fields, annotation_status, model_result, created_at)
                VALUES(?,?,?,?,?,?,?,?,?)
                """,
                (
                    row_id,
                    dataset_id,
                    row_index,
                    encode_json(raw_data),
                    encode_json(raw_data),
                    "[]",
                    "TP",
                    encode_json({"answer": raw_data["人工答案"], "模型说明": "test"}),
                    timestamp,
                ),
            )
    return {
        "scene_id": scene_id,
        "dataset_id": dataset_id,
        "row_ids": ["row_1", "row_2"],
    }


def test_model_distillation_flow() -> None:
    setup_temp_db()
    seeded = seed_dataset()
    methods = list_distillation_methods()
    assert "mock_distill" in methods

    result = run_model_distillation({
        "scene_id": seeded["scene_id"],
        "dataset_id": seeded["dataset_id"],
        "scheme_id": "",
        "method_name": "mock_distill",
        "row_ids": seeded["row_ids"],
    })
    assert result["ok"] is True
    assert result["row_count"] == 2
    assert len(result["items"]) >= 1
    assert result["items"][0]["name"]
    assert result["items"][0]["content"]

    first = result["items"][0]
    created = create_knowledge({
        "scene_id": seeded["scene_id"],
        "name": first["name"],
        "content": first["content"],
        "source_file": "model_distillation",
    })
    assert created["name"] == first["name"]
    knowledge = list_knowledge(seeded["scene_id"])
    assert any(item["name"] == first["name"] for item in knowledge)


if __name__ == "__main__":
    test_model_distillation_flow()
    print("model distillation test passed")
