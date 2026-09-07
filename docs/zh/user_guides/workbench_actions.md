# 评测工作台 Action 契约

评测工作台的 Web、外部 API、后续 MCP 与评测助手必须共用同一个 Action Registry。HTTP 只是适配层，不在路由中重复实现项目、数据集、评估器或任务逻辑。

## 当前可用 Action

| Action | 权限 | 作用 |
| --- | --- | --- |
| `capabilities.discover` | 只读 | 返回真实注册能力及输入 Schema |
| `project.list` | 只读 | 查询本地项目 |
| `project.get` | 只读 | 按稳定 ID 读取项目 |
| `project.create` | 写入 | 创建可迁移的 `project.json`；必须先 `dry_run` 确认 |
| `target.list` | 只读 | 查询指定项目的评测对象，可按类型和状态过滤 |
| `target.get` | 只读 | 读取指定对象及版本，不返回凭据引用内容 |
| `target.create` | 写入 | 创建 Target 与不可变首版本；必须先 `dry_run` 确认，不自动试调 |
| `target.version.create` | 写入 | 基于当前最新版创建不可变后续版本；保留旧版本且不自动试调 |
| `target.connection.check` | 写入／外部请求 | 预览后向指定版本发送一次真实试调，只保存脱敏结果 |

尚未实现的数据集、评估器、Run 与 MCP Action 不会出现在发现结果中。新建 Target 固定保存为 `draft / untested`，只有 `target.connection.check` 的真实试调成功后才能进入正式候选池。

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

项目清单保存在 `projects/<project_id>/project.json`，项目运行产物保存在 `projects/<project_id>/runs/`。Action 审计保存在 `audit/events.jsonl`，幂等结果保存在 `.action-state/idempotency/`。这些文件使用开放 JSON／JSONL 格式；浏览器不保存大规模业务真值。

评测对象清单和版本分别保存在：

```text
projects/<project_id>/targets/<target_id>/target.json
projects/<project_id>/targets/<target_id>/versions/<version_id>.json
projects/<project_id>/targets/<target_id>/connection_checks/<check_id>.json
```

对象版本冻结 Provider、输入输出模态、接口适配器、字段映射和超时时间。Skill 还必须冻结宿主运行时、模型参数引用、Tool 契约、加载方式与输入预处理。鉴权只接受 `env:VARIABLE` 或 `keychain:service/item` 引用；Action 返回值不会把引用名称写入前端状态。后续版本记录 `based_on_version_id`，并要求基线仍是当前最新版；并发页面使用过期基线提交时返回 `TARGET_VERSION_CONFLICT`，不会覆盖其他版本。

Web 工作台的“评测对象”页面直接使用以上五个 Target Action。接入流程会先调用 `target.create` 的 `dry_run`，用户在确认页检查写入范围后才提交正式写入；版本页以当前最新版预填配置并通过 `target.version.create` 生成后续版本。两种流程都只保存未试调草稿，不会触发模型调用。对象详情只展示凭据是否已配置，不展示引用名称或原始值；新版本可显式沿用服务端凭据引用而无需把引用名发送回浏览器。

## 真实连接试调

`target.connection.check` 是有外部副作用的写 Action。调用方必须先使用同一份 `project_id`、`target_id`、`version_id` 和 `sample_input` 执行 `dry_run`，然后将预览返回的确认 token 和稳定幂等键用于正式调用。预览阶段不解析凭据、不联网，也不写入试调记录。

正式调用只向已保存的精确 Endpoint 发送一次 POST，不跟随重定向、不使用系统代理。远程响应上限为 1 MiB，输入上限为 64 KiB JSON。记录只包含状态、耗时、HTTP 状态码、输出类型、输出哈希或错误代码；不包含样例正文、完整输出、凭据引用名或凭据值。相同幂等键和相同参数的重放会返回已有结果，不会再次发送请求。

## 项目级运行隔离

项目页面发起质量评测或性能压测时，会在任务生命周期请求中携带稳定的 `project_id`。服务端从项目清单解析真实 `runs_path`，不会信任调用方传入的项目目录；进度、日志、报告和历史列表因此始终落在同一个项目边界内。运行中进程采用项目限定键登记，即使不同项目使用同一个任务 ID，停止和删除保护也不会串线。

不携带 `project_id` 的原 EvalScope 请求仍使用服务启动时配置的输出目录，以保持现有 CLI 和旧页面兼容。外部 API、MCP 或评测助手接入项目工作台时，应优先传递 `project_id`，而不是自行拼接 `root_path`。
