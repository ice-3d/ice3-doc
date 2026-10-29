# Universal Engine And Vertical Applications

> Document ID: ICE3-DOC-ADR-001
>
> Status: Active
>
> Owner: ICE3 architecture maintainers

## Context

ICE3 must serve multiple industrial domains without building a separate
rendering and asset foundation for each application. The water demonstration is
one application of the platform, not the definition of the platform.

## Decision

The reusable engine, toolchain, and industrial semantic core remain
domain-neutral. Industry-specific entities, workflows, terminology, data
connections, and presentation live in vertical applications.

Vertical applications compose public ICE3 APIs. They must not add
industry-specific behavior to the engine's core scene, renderer, input,
selection, or asset contracts.

## Considered Alternatives

- Build a dedicated rendering stack inside the first industry application.
- Add water-specific concepts to the generic engine.
- Use one application repository for all reusable and vertical code.

These alternatives shorten an initial demonstration but duplicate foundational
work and make later industries depend on one application's assumptions.

## Consequences

- Shared improvements benefit every vertical application.
- Integration requires an explicit application boundary.
- Cross-repository contracts must be versioned and documented.
- Domain-specific behavior is easier to test without GPU infrastructure.

## Compatibility

The public engine API remains the stable integration surface. Moving a
domain-specific concern out of an application and into the generic platform
requires a separate architecture decision and compatibility review.

## Verification

- Architecture tests reject dependencies from generic packages to application
  packages.
- The water demonstration consumes only public APIs.
- Shared contracts contain no industry-only fields required by unrelated
  domains.

## Related Documents

- `ICE3-DOC-ARC-001` — [ICE3 family architecture](../architecture.md)
- `ICE3-DOC-ADR-004` — [Generic semantic interfaces](0004-generic-semantic-interfaces.md)
