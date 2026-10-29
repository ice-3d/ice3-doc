# Shared 2D And 3D Composition

> Document ID: ICE3-DOC-ADR-003
>
> Status: Active
>
> Owner: ICE3 architecture maintainers

## Context

Industrial interfaces need labels, panels, overlays, diagrams, and controls
alongside spatial geometry. Treating 2D and 3D as unrelated rendering products
creates duplicate input routing, lifecycle management, coordinate handling, and
selection behavior.

## Decision

The engine owns a shared composition model for 2D layers and 3D content.
Applications register visual layers in explicit order. Pointer, wheel, focus,
resize, and disposal flow through the same engine lifecycle.

2D content may cover, annotate, or interact with 3D content. A 2D layer can
consume hit-test regions and block or pass events according to an explicit
policy.

## Considered Alternatives

- Embed a separate 2D canvas with independent DOM event handling.
- Require every application to coordinate multiple rendering lifecycles.
- Project all 2D interfaces into textured 3D geometry.

These alternatives increase synchronization bugs and make consistent selection
and accessibility difficult.

## Consequences

- Applications learn one layer and input model.
- 2D and 3D can be tested together.
- Renderer backends must preserve the shared event and lifecycle semantics.
- Large application-specific 2D UI may still remain outside the engine when it
  does not belong to the spatial composition.

## Compatibility

The shared composition API is a public engine boundary. Backend-specific canvas
objects and GPU state remain private.

## Verification

- Tests cover ordered hit testing, event blocking and passthrough, pointer
  capture, resize, and disposal.
- Headless interfaces can verify 2D/3D routing without a specific GPU.

## Related Documents

- `ICE3-DOC-ARC-001` — [ICE3 family architecture](../architecture.md)
- `ICE3-ENG-ARC-001` — ICE3 Engine architecture, published in `ice3-engine`.
