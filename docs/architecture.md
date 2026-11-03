# ICE3 家族架构

> Document ID: ICE3-DOC-ARC-001
>
> Status: Active
>
> Owner: ICE3 architecture maintainers

## 1. 目标

ICE3 是用于构建工业空间应用的一组仓库。它将可复用 3D Engine、Studio 内的离线 Asset 处理、
industrial semantic、应用接口和行业专用演示分开。

架构优先采用明确 package 边界和标准文件格式，不采用单一大型应用或私有 Asset
交换格式。

## 2. 仓库职责

| 仓库 | 职责 | 主要输出 |
|---|---|---|
| `ice3-engine` | Runtime rendering、Scene ownership、2D/3D composition、input、Asset 加载、Tileset scheduling 和 Selection | 公开 `ice3` package 与内部 Engine package |
| `ice3-industrial` | 浏览器独立的 industrial entity、type、relation、state、query、context、operation 和 native JSON adapter | `@ice3/industrial-core` |
| `ice3-agent-console` | Agent event stream、Scene orchestration、引导场景，以及静态或服务端演示 | Console 应用 |
| `ice3-doc` | 跨仓库架构、contract、compatibility rule、shared metric、Diagnostic、Spec 和决策 | 权威文档 |
| `ice3-studio` | Document 建模、ChangeSet 审批、Source import、prepare、partition、LOD、Tileset 导出和 Agent 主导的 Web 工作台 | Rust Studio Core/Server/CLI、本地 JSON-RPC API 与 React Viewer |
| `ice3-water-demo` | 预留水务行业演示 workspace | 尚无公开实现 |

## 3. 依赖方向

```text
外部 Agent / 用户
    ↓ typed intent 或审阅操作
ice3-studio API
    ├─ Document + Operation history
    ├─ ChangeSet + approval
    └─ Rust Geometry / Prepare / Partition / LOD / Tileset
          ↓
Prepared GLB + OGC 3D Tiles 1.1
    ↓
ice3-engine public API
    ↑
ice3-industrial semantic integration
    ↑
business application
```

`ice3-doc` 定义跨仓库 contract，但不是 Runtime dependency。应用只导入负责该能力的
package 的公开 API，不导入其他仓库的私有源码路径。

Agent Console 是应用，可以消费 engine、semantic 和 protocol API；Engine 和
industrial core 都不得依赖 Console 或其 Agent 实现。

Studio 是独立的 authoring application。Studio Core 不依赖 Engine、Viewer 或模型
供应商 SDK，并原生完成 Source import、Prepared GLB 生成、partition、LOD、semantic
proxy、render batch、Tileset 导出和 artifact validation。Studio Server 负责认证、
原子 revision、ChangeSet 和预览。独立 `ice3-toolchain` 仓库和 Toolchain Sidecar 已
退役，不是当前生产依赖。

## 4. Authoring 与审阅

Studio 的主要入口是 Agent intent。外部 Agent 通过公开 JSON-RPC 查询有界上下文、
搜索 source/derived object、评估局部变更影响并提交受类型约束的 Operation 提案。
Document 与 operation history 是唯一真源；Geometry、bounds、GLB、预览和诊断都由
Document 重算。

Web Viewer 默认打开 Agent Mission Control，并同时显示项目、revision 和当前焦点
object。3D Scene 用于验证 Agent 工作和空间关系；Object、Inspect 和 Changes 保留为
人类定位、纠偏和审批的辅助入口。模型 Selection 是完整业务实体或 source object，
不得把派生面片当作独立业务对象。

AI 提案和人工表单修改都必须经过 ChangeSet。候选 digest、验证、预览和审批共同组成
人类决定权的技术边界；未批准候选不得改变当前 revision。

详见 [Agent 主导的 Studio 工作台](decisions/0006-agent-led-studio-workbench.md)。

## 5. Asset 生命周期

1. 受支持的 source model 进入 `ice3-studio`；浏览器 Runtime 不解析通用 source format。
2. Studio 校验 source，并生成带 ICE3 Prepared GLB Profile metadata 的标准 GLB。
3. 大型 Scene 被拆分为可独立加载的 GLB 和 OGC 3D Tiles 1.1 hierarchy。
4. 可选离线阶段生成 coarse LOD content、semantic proxy 和 static render batch，同时
   不改变设备 semantic identity。
5. 每个 artifact 都通过 validation 后才执行原子目录发布。
6. Engine 只读取 Prepared GLB，并根据 camera、Bounds、error threshold 和 residency
   budget 请求 tiled content。

## 6. Runtime 组合

Engine 拥有一个 Scene graph 和一套 input-routing model。Renderer backends 消费 Scene；
2D layer 与 3D content 共享 pointer、wheel、focus 和 lifecycle routing。公开
Selection 与 query result 使用稳定 semantic ID，不使用 GPU handle 或后端对象。

Runtime 可以展示和查询 industrial meaning，但业务规则、审批 workflow、alarm policy
和 Agent reasoning 留在 Engine 之外。

## 7. 失败边界

- 无效 source Asset 在 preprocessing 阶段失败。
- Runtime profile violation 在 Scene publication 前失败。
- Tile 加载失败不得移除已经提交的 coverage。
- LOD replacement 失败时继续显示当前稳定 representation。
- semantic update 失败时原子拒绝整批更新。
- 已配置 Agent 失败时必须报告，不得静默切换为确定性脚本运行。

## 8. 关联文档

- `ICE3-DOC-IDX-001` — [文档索引](README.md)
- `ICE3-DOC-CTR-001` — [Asset Preparation Contract v1](contracts/asset-preparation-contract-v1.md)
- `ICE3-DOC-ADR-001` — [通用 Engine 与垂直应用](decisions/0001-universal-engine-and-vertical-applications.md)
- `ICE3-DOC-ADR-002` — [离线开放 Asset pipeline](decisions/0002-offline-open-asset-pipeline.md)
- `ICE3-DOC-ADR-003` — [共享 2D/3D composition](decisions/0003-shared-2d-3d-composition.md)
- `ICE3-DOC-ADR-004` — [通用 semantic interface](decisions/0004-generic-semantic-interfaces.md)
- `ICE3-DOC-ADR-006` — [Agent 主导的 Studio 工作台](decisions/0006-agent-led-studio-workbench.md)
- `ICE3-STUDIO-REF-005` — [Studio 资产流水线](https://github.com/ice-3d/ice3-studio/blob/main/docs/reference/asset-pipeline.md)
- `ICE3-AGENT-REF-002` — [Agent Console Runtime Asset 交付](https://github.com/ice-3d/ice3-agent-console/blob/main/docs/reference/asset-delivery.md)
- `ICE3-DOC-CTR-002` — [Toolchain Sidecar Contract v1](contracts/toolchain-sidecar-contract-v1.md)（Deprecated；仅供历史追溯）
