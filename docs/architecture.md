# ICE3 家族架构

> Document ID: ICE3-DOC-ARC-001
>
> Status: Active
>
> Owner: ICE3 architecture maintainers

## 目标

ICE3 是用于构建工业空间应用的一组仓库。它将可复用 3D Engine、离线 Asset 处理、
industrial semantic、应用接口和行业专用演示分开。

架构优先采用明确 package 边界和标准文件格式，不采用单一大型应用或私有 Asset
交换格式。

## 仓库职责

| 仓库 | 职责 | 主要输出 |
|---|---|---|
| `ice3-engine` | Runtime rendering、Scene ownership、2D/3D composition、input、Asset 加载、Tileset scheduling 和 Selection | 公开 `ice3` package 与内部 Engine package |
| `ice3-toolchain` | Source validation、normalization、Prepared GLB 生成、partitioning、LOD、semantic proxy、batching 和 artifact validation | 离线 CLI 与 processing core |
| `ice3-industrial` | 浏览器独立的 industrial entity、type、relation、state、query、context、operation 和 native JSON adapter | `@ice3/industrial-core` |
| `ice3-agent-console` | Agent event stream、Scene orchestration、引导场景，以及静态或服务端演示 | Console 应用 |
| `ice3-doc` | 跨仓库架构、contract、compatibility rule、shared metric、Diagnostic、Spec 和决策 | 权威文档 |
| `ice3-studio` | 预留 authoring workspace | 尚无公开实现 |
| `ice3-water-demo` | 预留水务行业演示 workspace | 尚无公开实现 |

## 依赖方向

```text
source model
    ↓
ice3-toolchain
    ↓
Prepared GLB + OGC 3D Tiles 1.1
    ↓
ice3-engine public API
    ↑
ice3-industrial semantic integration
    ↑
business application
    ↑
Agent or human-facing interface
```

`ice3-doc` 定义跨仓库 contract，但不是 Runtime dependency。应用只导入负责该能力的
package 的公开 API，不导入其他仓库的私有源码路径。

Agent Console 是应用，可以消费 engine、semantic 和 protocol API；Engine 和
industrial core 都不得依赖 Console 或其 Agent 实现。

## Asset 生命周期

1. 受支持的 source model 进入 `ice3-toolchain`；浏览器 Runtime 不解析通用 source format。
2. Toolchain 校验 source，并生成带 ICE3 Prepared GLB Profile metadata 的标准 GLB。
3. 大型 Scene 被拆分为可独立加载的 GLB 和 OGC 3D Tiles 1.1 hierarchy。
4. 可选离线阶段生成 coarse LOD content、semantic proxy 和 static render batch，同时
   不改变设备 semantic identity。
5. 每个 artifact 都通过 validation 后才执行原子目录发布。
6. Engine 只读取 Prepared GLB，并根据 camera、Bounds、error threshold 和 residency
   budget 请求 tiled content。

## Runtime 组合

Engine 拥有一个 Scene graph 和一套 input-routing model。Renderer backends 消费 Scene；
2D layer 与 3D content 共享 pointer、wheel、focus 和 lifecycle routing。公开
Selection 与 query result 使用稳定 semantic ID，不使用 GPU handle 或后端对象。

Runtime 可以展示和查询 industrial meaning，但业务规则、审批 workflow、alarm policy
和 Agent reasoning 留在 Engine 之外。

## 失败边界

- 无效 source Asset 在 preprocessing 阶段失败。
- Runtime profile violation 在 Scene publication 前失败。
- Tile 加载失败不得移除已经提交的 coverage。
- LOD replacement 失败时继续显示当前稳定 representation。
- semantic update 失败时原子拒绝整批更新。
- 已配置 Agent 失败时必须报告，不得静默切换为确定性脚本运行。

## 关联文档

- `ICE3-DOC-IDX-001` — [文档索引](README.md)
- `ICE3-DOC-CTR-001` — [Asset Preparation Contract v1](contracts/asset-preparation-contract-v1.md)
- `ICE3-DOC-ADR-001` — [通用 Engine 与垂直应用](decisions/0001-universal-engine-and-vertical-applications.md)
- `ICE3-DOC-ADR-002` — [离线开放 Asset pipeline](decisions/0002-offline-open-asset-pipeline.md)
- `ICE3-DOC-ADR-003` — [共享 2D/3D composition](decisions/0003-shared-2d-3d-composition.md)
- `ICE3-DOC-ADR-004` — [通用 semantic interface](decisions/0004-generic-semantic-interfaces.md)
