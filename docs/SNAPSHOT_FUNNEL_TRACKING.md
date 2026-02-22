# Snapshot Funnel Tracking 规范

本规范用于 Snapshot 双路径问卷的漏斗分析，目标是定位用户在**哪个问题/步骤退出**，并对比最终提交转化。

## 事件清单

- `question_view`：题目被展示（或切换到该题）
- `question_answer`：用户完成该题作答
- `snapshot_abandon`：用户离开页面且未完成提交

保留原有事件名不变（如 `snapshot_start`、`snapshot_complete`、`conversion_action`、`lead_submit` 等）。

## 公共参数（所有新事件）

- `session_id`：会话 ID（本地缓存 7 天）
- `step_id`：步骤标识
- `question_id`：题目标识
- `profileDeclared`：`investor | owner | unsure`
- `primaryGoal`：`risk | energy | balanced`
- `elapsed_ms`：页面打开到当前事件的毫秒数

## abandon 事件参数

`snapshot_abandon` 额外包含：

- `last_step_id`
- `last_question_id`
- `last_action`（`view`/`answer`/`submit`）
- `time_on_page_ms`
- `reason`（`pagehide`/`visibility_hidden`/`beforeunload`）

## 隐私约束

- 禁止上报任何 PII（如 `name`、`phone`、`email`、`address`、自由文本 `note` 内容）
- 对于自由输入仅允许长度类指标（如 `note_length`），不上传正文
- `question_answer` 仅上报枚举值/档位/多选列表

## 与提交事件对齐

- `lead_submit` 与 `send-booking` payload 均包含 `session_id`
- 便于在分析端做 `abandon` vs `submit` 会话级对照

## 题目 ID（示例）

- 路径题：`path_profile`
- Investor：`inv_uncertainDecision`、`inv_conflictingAdvice`、`inv_unclearOverall`、`inv_avoidDispute`、`inv_tenantChangeSoon`、`inv_managerMode`、`inv_portfolioSizeBand`
- Owner：`own_billBand`、`own_allElectricNoGas`、`own_devices`、`own_symptoms`、`own_billUploadWilling`
