# ICE3 Toolchain Sidecar 协同契约 v1

> Document ID: ICE3-DOC-CTR-002
>
> Status: Active
>
> Owner: ICE3 architecture maintainers

| 项目 | 内容 |
| --- | --- |
| 状态 | 生效 |
| 契约版本 | 1.0.0 |
| 日期 | 2026-10-30 |
| 适用范围 | Studio Server、Toolchain Sidecar、测试与发布构建 |
| 契约形式 | stdio 上的 JSON-RPC 2.0 NDJSON |

## 1. 目标

定义 Studio 与 Toolchain 之间稳定、可验证且本地运行的进程契约。Studio 负责 Document、
Operation、ChangeSet、审批和 revision；Toolchain 负责由这些输入派生的 Asset 准备结果。

本契约解决以下问题：

- Studio 不需要把 Node.js 引入 Rust 建模内核。
- Toolchain 不通过命令行文本或 stderr 猜测成功状态。
- 双方可以独立发布，并通过 contract major 与 capability 协商兼容性。
- 请求、输出路径、取消和失败清理具有统一语义。
- 生产安装使用固定的 Sidecar 包，不在请求时下载或选择任意命令。

## 2. 兼容窗口

- 本契约为 `1.x`。Studio 接受相同 major，并根据 capability 启用功能。
- `contractVersion` 使用语义版本；当前固定为 `1.0.0`。
- Toolchain 自身 package version 独立报告，不参与 major 兼容判断。
- 新增可选字段只能出现在相同 major 的次版本中；消费方必须忽略未知响应字段，但请求中的
  未知字段必须被拒绝。
- major 不兼容时，Studio 保留文档编辑能力，只关闭 Toolchain-backed 功能，并报告
  `ICE3_STUDIO_TOOLCHAIN_CONTRACT_INCOMPATIBLE`。

## 3. 传输

- Sidecar 通过 stdin/stdout 读写 JSON-RPC 2.0。
- 每条消息是一行 UTF-8 JSON，以 `\n` 结束。
- stdout 只能包含协议消息；日志、warning 和调试信息只能写 stderr。
- 单条消息最大 8 MiB。
- 一个请求 ID 只能对应一个最终 response；`job.progress` 使用 notification。
- 客户端终止 stdin 或关闭进程后，Sidecar 必须退出并清理进行中临时文件。

## 4. Capability 协商

首个请求固定为 `toolchain.capabilities`。成功结果示例：

```json
{
  "contractVersion": "1.0.0",
  "packageVersion": "0.2.0",
  "operations": [
    "toolchain.capabilities",
    "asset.validate",
    "asset.prepare",
    "asset.preview",
    "asset.partition",
    "$/cancel"
  ],
  "inputFormats": ["glb", "gltf"],
  "features": {
    "lod": true,
    "partition": true,
    "tileset": true,
    "renderBatching": true,
    "cancellation": true
  },
  "limits": {
    "maxMessageBytes": 8388608,
    "maxConcurrentJobs": 2,
    "maxSourceBytes": 2147483648
  }
}
```

冻结样例：
[capabilities-v1.json](../../scripts/fixtures/toolchain-sidecar/capabilities-v1.json)。

## 5. 请求

初始支持：

| 方法 | 用途 |
| --- | --- |
| `toolchain.capabilities` | 返回版本、方法和限制 |
| `asset.validate` | 验证 Prepared GLB |
| `asset.prepare` | 生成规范化 Prepared GLB |
| `asset.preview` | 生成 Runtime preview |
| `asset.partition` | 生成 LOD、partition 和 Tileset |
| `$/cancel` | 取消指定 request ID |

`asset.preview` 请求示例：

```json
{
  "jsonrpc": "2.0",
  "id": 42,
  "method": "asset.preview",
  "params": {
    "sourcePath": "cache/preview/00000002-source.glb",
    "outputPath": "cache/toolchain/prepared-preview/asset.glb",
    "assetId": "prepared-preview",
    "budget": "unrestricted"
  }
}
```

冻结样例：
[preview-request-v1.json](../../scripts/fixtures/toolchain-sidecar/preview-request-v1.json)。

所有路径必须相对于 Sidecar 启动时指定的项目工作区。绝对路径、盘符路径和包含 `..` 的路径
均无效。请求不能包含 executable、shell、environment 或任意脚本字段。

## 6. 成功结果

Asset 生成、准备和预览成功结果：

```json
{
  "assetId": "prepared-preview",
  "contentHash": "sha256:<64 lowercase hex>",
  "profileVersion": "ice3-prepared-glb-v1",
  "manifestPath": "cache/toolchain/prepared-preview/manifest.json",
  "primaryPath": "cache/toolchain/prepared-preview/asset.glb",
  "byteLength": 123456,
  "diagnostics": [],
  "warnings": []
}
```

冻结样例：
[preview-result-v1.json](../../scripts/fixtures/toolchain-sidecar/preview-result-v1.json)。

结果中的所有路径必须位于当前项目 `cache/toolchain/`。最终文件发布必须使用临时文件、
内容校验和原子 rename。失败或取消时不得留下可被 Studio 引用的新文件。

`asset.validate` 返回 status、diagnostics 和 warnings。`asset.partition` 返回 tileset path、
文件清单、每文件 content hash、diagnostics 和 warnings。

## 7. 进度与取消

长任务可以发送：

```json
{
  "jsonrpc": "2.0",
  "method": "job.progress",
  "params": {
    "requestId": 42,
    "phase": "build-leaf",
    "completed": 3,
    "total": 10
  }
}
```

取消请求：

```json
{
  "jsonrpc": "2.0",
  "id": "cancel-1",
  "method": "$/cancel",
  "params": { "requestId": 42 }
}
```

被取消请求的最终 response 使用 `ICE3_TOOL_SIDECAR_CANCELLED`。取消是合作式的；协议读取循环
在任务执行期间必须保持响应。

## 8. 错误

JSON-RPC error 的 `data` 包含：

```json
{
  "code": "ICE3_TOOL_SIDECAR_PATH_INVALID",
  "message": "path escapes the workspace",
  "retryable": false
}
```

- `code` 必须稳定并以 `ICE3_TOOL_` 开头。
- `message` 不得包含凭据、工作区外路径或进程环境。
- `retryable` 表示同一请求是否可能在状态恢复后成功。
- 解析错误、无效路径、超限、不支持的方法和输出校验失败必须使用不同 code。

## 9. 安全与生命周期

- Sidecar 启动参数固定为 `sidecar --workspace <absolute-root>`。
- Studio 在启动前 canonicalize workspace；Sidecar 再次 canonicalize 每次读写路径。
- Sidecar 接收最小环境，不接收审批 token 或 Agent 凭据。
- 客户端限制并发、请求大小、响应大小和超时。
- 进程崩溃时客户端最多重启两次；连续失败后进入 unavailable 状态。
- 空闲退出、重启和缓存命中不得改变 Studio Document 或 revision。

## 10. Schema 与验证

机器可读 Schema：
[toolchain-sidecar-v1.schema.json](toolchain-sidecar-v1.schema.json)。

消费方必须在发布测试中验证：

- capability version 和 method inventory；
- preview request/result;
- progress notification；
- error envelope；
- relative-path 限制；
- 8 MiB message limit；
- stdout 不得混入日志。

## 11. 变更流程

1. 在 `ice3-doc` 修改本契约、Schema 和冻结样例。
2. 运行 `npm test` 与 `npm run docs:check`。
3. 更新 Toolchain Sidecar 和 Studio client 的跨仓库测试。
4. 两个消费仓库验证通过后，方可发布新 contract minor 或 major。
