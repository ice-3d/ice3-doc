# ICE3 文档索引

> Document ID: ICE3-DOC-IDX-001
>
> Status: Active
>
> Owner: ICE3 documentation maintainers

## 从这里开始

| ID | Title | Status | Purpose |
|---|---|---|---|
| `ICE3-DOC-RM-001` | [ICE3 Documentation](../README.md) | Active | 家族入口和仓库地图 |
| `ICE3-DOC-ARC-001` | [ICE3 家族架构](architecture.md) | Active | 跨仓库职责和数据流 |
| `ICE3-DOC-IDX-002` | [架构决策](decisions/README.md) | Active | 共享决策索引 |
| `ICE3-DOC-CTR-001` | [Asset Preparation Contract v1](contracts/asset-preparation-contract-v1.md) | Active | 权威共享 Asset contract |

## 参考资料

| ID | Title | Status | Purpose |
|---|---|---|---|
| `ICE3-DOC-REF-001` | [ICE3 技术词表](reference/terminology.md) | Active | 固定技术词汇写法并提供中文解释 |

## 共享决策

| ID | Title | Status | Purpose |
|---|---|---|---|
| `ICE3-DOC-ADR-001` | [通用 Engine 与垂直应用](decisions/0001-universal-engine-and-vertical-applications.md) | Active | 分离可复用平台能力与行业解决方案 |
| `ICE3-DOC-ADR-002` | [离线开放 Asset 流水线](decisions/0002-offline-open-asset-pipeline.md) | Active | conversion 留在离线阶段，runtime format 保持标准 |
| `ICE3-DOC-ADR-003` | [共享 2D/3D 组合](decisions/0003-shared-2d-3d-composition.md) | Active | 使用统一的 engine layer 和 input model |
| `ICE3-DOC-ADR-004` | [通用 Semantic 接口](decisions/0004-generic-semantic-interfaces.md) | Active | Agent integration 留在 core semantic API 之外 |

## Spec

| ID | Title | Status | Purpose |
|---|---|---|---|
| `ICE3-DOC-SPEC-001` | [Adaptive Industrial LOD](specs/2026-10-27-adaptive-industrial-lod-design.md) | Implemented | 按实测设备误差分配粗模 budget |
| `ICE3-DOC-SPEC-002` | [Adaptive Tileset Scheduler](specs/2026-10-27-adaptive-tileset-scheduler-design.md) | Implemented | 调度相机驱动的 Tileset 工作 |
| `ICE3-DOC-SPEC-003` | [Hierarchical LOD](specs/2026-10-27-hierarchical-lod-design.md) | Implemented | 跨 LOD 层级保持覆盖和 Selection |
| `ICE3-DOC-SPEC-004` | [Industrial Render Batching](specs/2026-10-27-industrial-render-batching-design.md) | Implemented | 在不丢失 semantic identity 的前提下减少 draw overhead |
| `ICE3-DOC-SPEC-005` | [LOD Refinement 与 Scene API](specs/2026-10-27-lod-refinement-and-scene-api-design.md) | Implemented | 细化 LOD cut 并提供通用 Scene query |
| `ICE3-DOC-SPEC-006` | [Semantic Industrial Proxy](specs/2026-10-27-semantic-industrial-proxy-design.md) | Implemented | 增加保守的 OBB 和 cylinder LOD candidate |
| `ICE3-DOC-SPEC-007` | [Spatial Tileset Pipeline](specs/2026-10-27-spatial-tileset-pipeline-design.md) | Implemented | 将大型模型拆分为开放 Tileset content |
| `ICE3-DOC-SPEC-008` | [可信污水处理厂 Blender Pipeline](specs/2026-10-28-credible-wastewater-blender-pipeline-design.md) | Implemented | 生成可信的虚构工业 Scene |
| `ICE3-DOC-SPEC-009` | [Industrial Semantic Layer](specs/2026-10-28-industrial-semantic-layer-design.md) | Implemented | 定义 industrial workspace core |
| `ICE3-DOC-SPEC-010` | [Synthetic Wastewater Plant Asset](specs/2026-10-28-synthetic-wastewater-plant-asset-design.md) | Implemented | 定义确定性的合成 Asset 生成 |
| `ICE3-DOC-SPEC-011` | [文档系统](specs/2026-10-29-documentation-system-design.md) | Implemented | 定义公开文档 contract |
| `ICE3-DOC-SPEC-012` | [全中文文档改版](specs/2026-10-29-chinese-documentation-policy-design.md) | Draft | 定义中文叙述边界、迁移顺序与自动校验 |

## 实施计划

| ID | Title | Status | Purpose |
|---|---|---|---|
| `ICE3-DOC-PLAN-001` | [Adaptive Industrial LOD](plans/2026-10-27-adaptive-industrial-lod.md) | Implemented | 实现 adaptive device budget |
| `ICE3-DOC-PLAN-002` | [Adaptive Render Batching Worker](plans/2026-10-27-adaptive-render-batching-workers.md) | Implemented | 实现空闲时 Worker batching |
| `ICE3-DOC-PLAN-003` | [Adaptive Tileset Scheduler](plans/2026-10-27-adaptive-tileset-scheduler.md) | Implemented | 实现 camera-driven work set |
| `ICE3-DOC-PLAN-004` | [Asset Preparation Contract](plans/2026-10-27-asset-preparation-contract.md) | Implemented | 实现共享 Asset contract |
| `ICE3-DOC-PLAN-005` | [Hierarchical LOD Asset](plans/2026-10-27-hierarchical-lod-assets.md) | Implemented | 实现 hierarchical Asset 生成 |
| `ICE3-DOC-PLAN-006` | [Hierarchical LOD Runtime](plans/2026-10-27-hierarchical-lod-runtime.md) | Implemented | 实现 hierarchical LOD 消费 |
| `ICE3-DOC-PLAN-007` | [LOD Refinement](plans/2026-10-27-lod-refinement.md) | Implemented | 细化 coarse chunk 和 prefetch |
| `ICE3-DOC-PLAN-008` | [Scene Query API](plans/2026-10-27-scene-query-api.md) | Implemented | 实现 query、picking 和 focus |
| `ICE3-DOC-PLAN-009` | [Semantic Industrial Proxy](plans/2026-10-27-semantic-industrial-proxies.md) | Implemented | 实现 proxy candidate |
| `ICE3-DOC-PLAN-010` | [Spatial Tileset Pipeline](plans/2026-10-27-spatial-tileset-pipeline.md) | Implemented | 实现空间 partitioning |
| `ICE3-DOC-PLAN-011` | [静态 Render Batching](plans/2026-10-27-static-render-batching.md) | Implemented | 实现确定性 render batch |
| `ICE3-DOC-PLAN-012` | [可信污水处理厂 Blender Pipeline](plans/2026-10-28-credible-wastewater-blender-pipeline.md) | Implemented | 实现人工设计的合成 Asset 生成 |
| `ICE3-DOC-PLAN-013` | [Industrial Semantic Core](plans/2026-10-28-industrial-semantic-core.md) | Implemented | 实现 semantic core |
| `ICE3-DOC-PLAN-014` | [Synthetic Wastewater Plant Asset](plans/2026-10-28-synthetic-wastewater-plant-asset.md) | Implemented | 实现合成 Asset 输出 |
| `ICE3-DOC-PLAN-015` | [文档系统](plans/2026-10-29-documentation-system.md) | Implemented | 实现本文档系统 |
| `ICE3-DOC-PLAN-016` | [全中文文档改版](plans/2026-10-29-chinese-documentation-policy.md) | Draft | 迁移全部产品文档并启用中文叙述门禁 |
