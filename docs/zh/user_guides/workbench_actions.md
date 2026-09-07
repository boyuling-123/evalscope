# 评测工作台 Action 契约

评测工作台的 Web、外部 API、后续 MCP 与评测助手必须共用同一个 Action Registry。HTTP 只是适配层，不在路由中重复实现项目、数据集、评估器或任务逻辑。

## 当前可用 Action

| Action | 权限 | 作用 |
| --- | --- | --- |
| `capabilities.discover` | 只读 | 返回真实注册能力及输入 Schema |
| `project.list` | 只读 | 查询本地项目 |
| `project.get` | 只读 | 按稳定 ID 读取项目 |
| `project.create` | 写入 | 创建可迁移的 `project.json`；必须先 `dry_run` 确认 |

尚未实现的数据集、评估器、Run 与 MCP Action 不会出现在发现结果中。

## HTTP 入口

```text
POST /api/v1/workbench/actions/execute
```

```json
{
  "action": "project.create",
  "action_version": "1.0",
  "request_id": "req_demo_001",
  "idempotency_key": "create-demo-project-v1",
  "actor": {"type": "user", "id": "local-user"},
  "dry_run": true,
  "payload": {"name": "白底图评测"}
}
```

`dry_run` 会返回只与当前 Action、调用者和参数绑定、30 分钟有效的 `confirmation.token`。正式写入时必须原样提交该 token，并提供稳定幂等键。重复提交相同参数会返回原业务结果；复用同一幂等键但修改参数会返回 `IDEMPOTENCY_CONFLICT`。审计日志只保存 payload 哈希与 actor ID 哈希，不保存完整 payload、密钥或确认凭据。

## 本地文件

默认工作区位于 `<outputs>/.evalscope-workbench`，也可以在启动服务时通过现有目录显式指定：

```bash
evalscope service --outputs ./outputs --workspace ./my-workbench
```

项目清单保存在 `projects/<project_id>/project.json`。Action 审计保存在 `audit/events.jsonl`，幂等结果保存在 `.action-state/idempotency/`。这些文件使用开放 JSON／JSONL 格式；浏览器不保存大规模业务真值。
