# Offline Open Asset Pipeline

> Document ID: ICE3-DOC-ADR-002
>
> Status: Active
>
> Owner: ICE3 architecture maintainers

## Context

Industrial source models can be large and use complex authoring formats. Parsing,
normalizing, simplifying, and repartitioning them in the browser causes long
startup delays and makes runtime behavior depend on conversion code.

The published runtime also needs to interoperate with existing asset tooling and
web infrastructure.

## Decision

All source-format parsing, geometry preparation, simplification, partitioning,
and LOD generation occur in `ice3-toolchain`. Runtime content is standard GLB
with the documented ICE3 Prepared GLB Profile, distributed through OGC 3D Tiles
1.1 where spatial streaming is required.

ICE3 does not introduce a private monolithic container when the public GLB and
Tileset formats can represent the runtime artifact.

## Considered Alternatives

- Convert arbitrary source assets in the browser.
- Define a proprietary binary format that duplicates GLB structure.
- Require one complete monolithic prepared file for every scene.

These alternatives increase runtime cost, weaken ecosystem compatibility, or
prevent incremental loading.

## Consequences

- Runtime failures are separated from source-conversion failures.
- Existing GLB and Tileset tooling can inspect or host compatible artifacts.
- The toolchain owns format evolution and migration.
- The browser only downloads the data required by the current view.

## Compatibility

The canonical compatibility rules are defined by `ICE3-DOC-CTR-001`. Runtime
conversion and undeclared required features are rejected rather than guessed.

## Verification

- Engine tests reject conversion-required profiles.
- Toolchain tests validate generated GLB and Tileset artifacts.
- Example builds publish atomically only after all outputs validate.

## Related Documents

- `ICE3-DOC-ARC-001` — [ICE3 family architecture](../architecture.md)
- `ICE3-DOC-CTR-001` — [Asset Preparation Contract v1](../contracts/asset-preparation-contract-v1.md)
- `ICE3-DOC-SPEC-007` — [Spatial Tileset pipeline](../specs/2026-10-27-spatial-tileset-pipeline-design.md)
