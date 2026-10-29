# ICE3 Family Architecture

> Document ID: ICE3-DOC-ARC-001
>
> Status: Active
>
> Owner: ICE3 architecture maintainers

## Purpose

ICE3 is a family of repositories for building industrial spatial applications.
It separates the reusable 3D engine, offline asset processing, industrial
semantics, application interfaces, and domain-specific demonstrations.

The architecture favors explicit package boundaries and standard file formats
over a single large application or a proprietary asset exchange format.

## Repository Responsibilities

| Repository | Responsibility | Primary output |
|---|---|---|
| `ice3-engine` | Runtime rendering, scene ownership, 2D/3D composition, input, asset loading, Tileset scheduling, and selection | Public `ice3` package and internal engine packages |
| `ice3-toolchain` | Source validation, normalization, Prepared GLB generation, partitioning, LOD, semantic proxies, batching, and artifact verification | Offline CLI and processing core |
| `ice3-industrial` | Browser-independent industrial entities, types, relations, state, queries, context, operations, and native JSON adapters | `@ice3/industrial-core` |
| `ice3-agent-console` | Agent event stream, scene orchestration, guided scenarios, and static or server-backed demonstration | Console application |
| `ice3-doc` | Cross-repository architecture, contracts, compatibility rules, shared metrics, diagnostics, specifications, and decisions | Canonical documentation |
| `ice3-studio` | Reserved authoring workspace | No public implementation yet |
| `ice3-water-demo` | Reserved water-industry demonstration workspace | No public implementation yet |

## Dependency Direction

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

`ice3-doc` defines cross-repository contracts but is not a runtime dependency.
Applications import only the public API of an owning package and do not import
another repository's private source path.

The Agent Console is an application. It may consume engine, semantic, and
protocol APIs, but neither the engine nor the industrial core may depend on the
console or its Agent implementation.

## Asset Lifecycle

1. A supported source model enters `ice3-toolchain`; the browser runtime never
   parses general-purpose source formats.
2. The toolchain validates the source and produces a standard GLB carrying the
   ICE3 Prepared GLB Profile metadata.
3. Large scenes are partitioned into independently loadable GLBs and an OGC
   3D Tiles 1.1 hierarchy.
4. Optional offline stages generate coarse LOD content, semantic proxies, and
   static render batches without changing semantic device identity.
5. Every artifact is validated before an atomic directory publication.
6. The engine reads only Prepared GLB content and requests tiled content based
   on camera, bounds, error thresholds, and residency budgets.

## Runtime Composition

The engine owns one scene graph and one input-routing model. Renderer backends
consume the scene; 2D layers and 3D content share pointer, wheel, focus, and
lifecycle routing. Public selection and query results use stable semantic IDs,
not GPU handles or backend-specific objects.

The runtime may visualize and query industrial meaning, but business rules,
approval workflows, alarm policy, and Agent reasoning remain outside the
engine.

## Failure Boundaries

- Invalid source assets fail during preprocessing.
- Runtime profile violations fail before scene publication.
- A failed tile cannot remove already committed coverage.
- A failed LOD replacement keeps the current stable representation visible.
- A failed semantic update is rejected atomically.
- A configured Agent failure is reported; it does not silently become a
  deterministic scripted run.

## Related Documents

- `ICE3-DOC-IDX-001` — [Documentation index](README.md)
- `ICE3-DOC-CTR-001` — [Asset Preparation Contract v1](contracts/asset-preparation-contract-v1.md)
- `ICE3-DOC-ADR-001` — [Universal engine and vertical applications](decisions/0001-universal-engine-and-vertical-applications.md)
- `ICE3-DOC-ADR-002` — [Offline open asset pipeline](decisions/0002-offline-open-asset-pipeline.md)
- `ICE3-DOC-ADR-003` — [Shared 2D/3D composition](decisions/0003-shared-2d-3d-composition.md)
- `ICE3-DOC-ADR-004` — [Generic semantic interfaces](decisions/0004-generic-semantic-interfaces.md)
