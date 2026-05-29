# 代码审查 — 待修复 Bug 清单

> 说明：本文档由代码审查得出，记录的是**会导致实际误动作**的潜在 bug，非风格问题。
> 项目当前可正常运行，以下问题多在并发、状态同步、边界场景下触发。
> 已忽略 `outputs/` 目录（pptx 等产物）。
> 每条包含：位置、现象、建议修复方向。供后续修复参考。

---

## 并发与数据库（高优先级）

### B1. SQLite 并发写冲突，易报 "database is locked"
- **位置**：`backend/services/annotation_service.py`（`_run_task` / `_run_task_row`，约 638-639 行）、`backend/database.py`（`get_db`，约 24-34 行）
- **现象**：`_run_task` 用 `ThreadPoolExecutor(max_workers=concurrency)` 并发执行 `_run_task_row`，每个线程通过 `get_db()` 打开独立连接，对同一批表（`scene_data_*`、`annotation_task_rows`、`annotation_tasks`）做写入。`get_db` 只设了 `timeout=30` 和 `foreign_keys`，**未开启 WAL**。SQLite 默认 rollback journal 模式下并发写会抛 `database is locked`。`_refresh_task_counts` 在每行处理中被频繁调用，进一步放大锁竞争。
- **建议修复**：在 `get_db()` 中执行 `PRAGMA journal_mode=WAL` 并设置 `PRAGMA busy_timeout`；或将标注写入串行化。

### B2. 任务启动早期的 SSE 事件丢失（竞态条件）
- **位置**：`backend/services/annotation_service.py`（`create_annotation_task`，约 104-105 行）
- **现象**：`create_annotation_task` 先 `_broadcast(task_created)`，再 `threading.Thread(_run_task).start()`，然后才返回 HTTP 响应。前端拿到响应后才通过 EventSource 订阅 `/events`。在订阅建立之前，`_run_task` 已发出的 `row_started` / `row_updated` 事件被广播给 0 个订阅者而永久丢失（`_broadcast` 不缓冲），导致该窗口内的表格行状态不更新，只能靠 metrics 轮询补偿。
- **建议修复**：在订阅建立后再启动任务线程；或对任务早期事件做缓冲/重放。

### B3. `get_db()` 异常路径语义不清，缺少显式回滚
- **位置**：`backend/database.py`（`get_db`，约 24-34 行）
- **现象**：`get_db` 的 `try` 块在 `yield` 之后无条件 `conn.commit()`，`finally` 只 `close()`，没有 `except: rollback()`。许多函数在抛错前已执行了部分 `INSERT`/`UPDATE`（如批量导入中前一个文件已插入），目前依赖"异常跳过 commit"来隐式回滚，语义不明确；且 `commit()` 自身抛错时无任何处理。
- **建议修复**：改为标准模式 `try: yield; conn.commit() / except: conn.rollback(); raise / finally: conn.close()`。

### B4. 多 worker 启动会误杀其它进程进行中的任务
- **位置**：`backend/database.py`（`recover_interrupted_annotation_state`，约 243、246-322 行）、`backend/app.py`（`init_db` 调用，约 18 行）
- **现象**：`init_db()` 在 `create_app()` 时调用，会把所有状态为 `排队中/标注中/queued/running` 的行和任务一律改成"取消/中断"。若以多 worker（uvicorn `--workers N` 或 gunicorn）启动，每个 worker 进程都会执行一次 `init_db`，后启动的 worker 会把前一个 worker 正在运行的任务误标为中断。
- **建议修复**：将恢复逻辑从 `init_db` 中分离，仅在确定的单进程主启动时执行一次。

---

## 状态一致性

### B5. 编辑行后丢失已写入的模型标注列
- **位置**：`backend/services/dataset_service.py`（`update_dataset_row`，约 247-251 行；`_annotate_row` 写入处，约 540-552、747 行）
- **现象**：`update_dataset_row` 用前端传来的 `raw_data` 整体覆盖该行（`SET raw_data=?`），未与库中现有数据合并。`_annotate_row` 之前通过 `raw_data.update(model_result)` 写入的模型标注答案列会被整体替换掉，导致编辑一行后这些标注列从 `raw_data` 中消失。
- **建议修复**：编辑时先读取库中现有 `raw_data` 再做 merge，而非整体替换。

### B6. 删除方案后场景行的 `annotation_status` 不一致
- **位置**：`backend/services/resource_service.py`（`delete_scheme`，约 229-255 行）
- **现象**：`delete_scheme` 只把 `scene_data_*.annotation_task_id` 置空，但未重置 `annotation_status`。行仍保留由已删除方案产生的 `TP/FP/失败` 等状态，而该字段是非 scheme 视图下指标统计与状态过滤的依据，导致指标与实际不符。
- **建议修复**：删除方案及关联任务时，同步把相关行的 `annotation_status` 复位为"未标注"。

### B7. 导入 Excel 时空表头导致列与数据错位
- **位置**：`backend/services/dataset_service.py`（`import_excel_files`，约 117、124-128 行）
- **现象**：表头解析 `columns = [str(v).strip() for v in header_row if v not in (None, "")]` 会跳过空表头单元格，使 `columns` 被压缩；但读取数据行时用 `enumerate(columns)` 的索引直接取 `row[index]`，当表头中间存在空列时，列名与单元格值整体错位。此外重复表头名会在 `row_data` 字典里互相覆盖。
- **建议修复**：按原始列位置（保留空列占位）对齐 header 与 row 索引，并对重复列名做去重/重命名处理。

### B8. `analyze_dataset_row` 二次查询未判空
- **位置**：`backend/services/annotation_service.py`（约 237-241 行）
- **现象**：第二个 `with get_db()` 块重新查询行 `SELECT raw_data ...`。若两次事务之间该行被并发删除（`delete_dataset_row`），`row` 为 `None`，随后 `decode_json(row["raw_data"], {})` 会抛 `TypeError`，作为未捕获异常返回 500。
- **建议修复**：二次查询后判空，行不存在则返回 404。

---

## 较低确信度（建议核查）

### B9. SSE 流在部分终态路径下可能不退出，泄漏订阅队列
- **位置**：`backend/routers/annotation_tasks.py`（约 53-60 行）
- **现象**：SSE 循环只在收到 `task_finished` 时 `break`。`stop_unfinished` 只发 `task_stopped` 不发 `task_finished`。在某些竞争窗口下（任务已进入终态但该连接在之后才建立、snapshot 仍为 running），连接可能长期只收 heartbeat 不退出，泄漏一个订阅队列。
- **建议修复**：snapshot 时即检测终态并返回；对 `task_stopped` 及其它终态事件也执行 `break`。

### B10. 批量分析异常被静默吞掉，前端拿不到失败信息
- **位置**：`backend/services/annotation_service.py`（`_run_batch_analysis`，约 348-353 行）
- **现象**：`_run_batch_analysis` 捕获所有异常仅 `print`，无完成/失败状态回写或事件通知，前端拿不到批量分析的最终结果或失败计数（接口只返回启动信息）。若 `row_ids` 在分析期间被删除，每行都会触发 B8 的异常并被静默吞掉。
- **建议修复**：为批量分析记录进度/失败状态，并通过事件或查询接口暴露。

---

## 优先级建议
1. **B1**（并发写未开 WAL，高并发下会锁库报错）
2. **B2**（SSE 早期事件丢失）
3. **B4**（仅多 worker 部署下触发，但后果严重）
4. **B5 / B7**（数据一致性 / 导入错位）
5. 其余按场景排期修复。
