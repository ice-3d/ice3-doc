# ICE3 Documentation Index

> Document ID: ICE3-DOC-IDX-001
>
> Status: Active
>
> Owner: ICE3 documentation maintainers

## Start Here

| ID | Title | Status | Purpose |
|---|---|---|---|
| `ICE3-DOC-RM-001` | [ICE3 Documentation](../README.md) | Active | Family entry point and repository map |
| `ICE3-DOC-ARC-001` | [ICE3 Family Architecture](architecture.md) | Active | Cross-repository responsibilities and data flow |
| `ICE3-DOC-IDX-002` | [Architecture Decisions](decisions/README.md) | Active | Index of shared decisions |
| `ICE3-DOC-CTR-001` | [Asset Preparation Contract v1](contracts/asset-preparation-contract-v1.md) | Active | Canonical shared asset contract |

## Shared Decisions

| ID | Title | Status | Purpose |
|---|---|---|---|
| `ICE3-DOC-ADR-001` | [Universal engine and vertical applications](decisions/0001-universal-engine-and-vertical-applications.md) | Active | Separate reusable platform capabilities from industry solutions |
| `ICE3-DOC-ADR-002` | [Offline open asset pipeline](decisions/0002-offline-open-asset-pipeline.md) | Active | Keep conversion offline and runtime formats standard |
| `ICE3-DOC-ADR-003` | [Shared 2D/3D composition](decisions/0003-shared-2d-3d-composition.md) | Active | Use one engine-owned layer and input model |
| `ICE3-DOC-ADR-004` | [Generic semantic interfaces](decisions/0004-generic-semantic-interfaces.md) | Active | Keep Agent integrations outside core semantic APIs |

## Specifications

| ID | Title | Status | Purpose |
|---|---|---|---|
| `ICE3-DOC-SPEC-001` | [Adaptive Industrial LOD](specs/2026-10-27-adaptive-industrial-lod-design.md) | Implemented | Allocate coarse-model budgets by measured device error |
| `ICE3-DOC-SPEC-002` | [Adaptive Tileset Scheduler](specs/2026-10-27-adaptive-tileset-scheduler-design.md) | Implemented | Schedule camera-driven Tileset work |
| `ICE3-DOC-SPEC-003` | [Hierarchical LOD](specs/2026-10-27-hierarchical-lod-design.md) | Implemented | Preserve coverage and selection across LOD levels |
| `ICE3-DOC-SPEC-004` | [Industrial Render Batching](specs/2026-10-27-industrial-render-batching-design.md) | Implemented | Reduce draw overhead without losing semantic identity |
| `ICE3-DOC-SPEC-005` | [LOD Refinement and Scene API](specs/2026-10-27-lod-refinement-and-scene-api-design.md) | Implemented | Refine LOD cuts and expose general scene queries |
| `ICE3-DOC-SPEC-006` | [Semantic Industrial Proxies](specs/2026-10-27-semantic-industrial-proxy-design.md) | Implemented | Add conservative OBB and cylinder LOD candidates |
| `ICE3-DOC-SPEC-007` | [Spatial Tileset Pipeline](specs/2026-10-27-spatial-tileset-pipeline-design.md) | Implemented | Partition large models into open Tileset content |
| `ICE3-DOC-SPEC-008` | [Credible Wastewater Blender Pipeline](specs/2026-10-28-credible-wastewater-blender-pipeline-design.md) | Implemented | Generate a credible synthetic industrial scene |
| `ICE3-DOC-SPEC-009` | [Industrial Semantic Layer](specs/2026-10-28-industrial-semantic-layer-design.md) | Implemented | Define the industrial workspace core |
| `ICE3-DOC-SPEC-010` | [Synthetic Wastewater Plant Asset](specs/2026-10-28-synthetic-wastewater-plant-asset-design.md) | Implemented | Define deterministic synthetic asset generation |
| `ICE3-DOC-SPEC-011` | [Documentation System](specs/2026-10-29-documentation-system-design.md) | Implemented | Define the public documentation contract |
| `ICE3-DOC-SPEC-012` | [全中文文档改版](specs/2026-10-29-chinese-documentation-policy-design.md) | Draft | 定义中文叙述边界、迁移顺序与自动校验 |

## Implementation Plans

| ID | Title | Status | Purpose |
|---|---|---|---|
| `ICE3-DOC-PLAN-001` | [Adaptive Industrial LOD](plans/2026-10-27-adaptive-industrial-lod.md) | Implemented | Implement adaptive device budgets |
| `ICE3-DOC-PLAN-002` | [Adaptive Render Batching Workers](plans/2026-10-27-adaptive-render-batching-workers.md) | Implemented | Implement idle-time Worker batching |
| `ICE3-DOC-PLAN-003` | [Adaptive Tileset Scheduler](plans/2026-10-27-adaptive-tileset-scheduler.md) | Implemented | Implement the camera-driven work set |
| `ICE3-DOC-PLAN-004` | [Asset Preparation Contract](plans/2026-10-27-asset-preparation-contract.md) | Implemented | Implement the shared asset contract |
| `ICE3-DOC-PLAN-005` | [Hierarchical LOD Assets](plans/2026-10-27-hierarchical-lod-assets.md) | Implemented | Implement hierarchical asset generation |
| `ICE3-DOC-PLAN-006` | [Hierarchical LOD Runtime](plans/2026-10-27-hierarchical-lod-runtime.md) | Implemented | Implement hierarchical LOD consumption |
| `ICE3-DOC-PLAN-007` | [LOD Refinement](plans/2026-10-27-lod-refinement.md) | Implemented | Refine coarse chunking and prefetch |
| `ICE3-DOC-PLAN-008` | [Scene Query API](plans/2026-10-27-scene-query-api.md) | Implemented | Implement querying, picking, and focus |
| `ICE3-DOC-PLAN-009` | [Semantic Industrial Proxies](plans/2026-10-27-semantic-industrial-proxies.md) | Implemented | Implement proxy candidates |
| `ICE3-DOC-PLAN-010` | [Spatial Tileset Pipeline](plans/2026-10-27-spatial-tileset-pipeline.md) | Implemented | Implement spatial partitioning |
| `ICE3-DOC-PLAN-011` | [Static Render Batching](plans/2026-10-27-static-render-batching.md) | Implemented | Implement deterministic render batches |
| `ICE3-DOC-PLAN-012` | [Credible Wastewater Blender Pipeline](plans/2026-10-28-credible-wastewater-blender-pipeline.md) | Implemented | Implement authored synthetic asset generation |
| `ICE3-DOC-PLAN-013` | [Industrial Semantic Core](plans/2026-10-28-industrial-semantic-core.md) | Implemented | Implement the semantic core |
| `ICE3-DOC-PLAN-014` | [Synthetic Wastewater Plant Asset](plans/2026-10-28-synthetic-wastewater-plant-asset.md) | Implemented | Implement synthetic asset outputs |
| `ICE3-DOC-PLAN-015` | [Documentation System](plans/2026-10-29-documentation-system.md) | Implemented | Implement this documentation system |
