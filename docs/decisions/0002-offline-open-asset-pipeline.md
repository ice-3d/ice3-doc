# 离线开放 Asset pipeline

> Document ID: ICE3-DOC-ADR-002
>
> Status: Active
>
> Owner: ICE3 architecture maintainers

## 背景

工业 source model 可能很大，并使用复杂的 authoring format。在浏览器中 parsing、
normalizing、simplifying 和 repartitioning 会导致长启动延迟，并让 Runtime 行为依赖
conversion code。

发布的 Runtime 还需要与现有 Asset tooling 和 Web infrastructure 互操作。

## 决策

所有 source format parsing、Geometry preparation、simplification、partitioning 和
LOD generation 都在 `ice3-toolchain` 中完成。Runtime content 是带文档化 ICE3
Prepared GLB Profile 的标准 GLB；需要空间流式加载时，通过 OGC 3D Tiles 1.1 分发。

公开 GLB 和 Tileset format 足以表达 Runtime artifact 时，ICE3 不引入私有单体容器。

## 备选方案

- 在浏览器中转换任意 source Asset。
- 定义重复 GLB 结构的私有 binary format。
- 每个 Scene 都要求一个完整单体 prepared file。

这些方案会增加 Runtime 成本、削弱生态兼容性，或阻止增量加载。

## 影响

- Runtime failure 与 source-conversion failure 分离。
- 现有 GLB 和 Tileset tooling 可以检查或托管兼容 artifact。
- Toolchain 负责 format evolution 和 migration。
- 浏览器只下载当前视图所需数据。

## 兼容性

权威 compatibility rule 由 `ICE3-DOC-CTR-001` 定义。Runtime conversion 和未声明
required feature 会被拒绝，系统不会猜测处理。

## 验证

- Engine test 拒绝要求 Runtime conversion 的 profile。
- Toolchain test 验证生成的 GLB 和 Tileset artifact。
- Example build 只有在全部输出通过 validation 后才原子发布。

## 关联文档

- `ICE3-DOC-ARC-001` — [ICE3 家族架构](../architecture.md)
- `ICE3-DOC-CTR-001` — [Asset Preparation Contract v1](../contracts/asset-preparation-contract-v1.md)
- `ICE3-DOC-SPEC-007` — [空间 Tileset pipeline](../specs/2026-10-27-spatial-tileset-pipeline-design.md)
