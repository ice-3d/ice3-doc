# Generic Semantic Interfaces

> Document ID: ICE3-DOC-ADR-004
>
> Status: Active
>
> Owner: ICE3 architecture maintainers

## Context

Agents, automation tools, editors, dashboards, and human users need to inspect
and control industrial entities. Adding Agent-specific names or workflows to
the engine would make a general scene API depend on one consumer.

## Decision

ICE3 exposes explicit, deterministic interfaces for domain objects, queries,
selection, focus, context, operations, and events. These interfaces describe
industrial semantics without mentioning an AI model, prompt, conversation, or
Agent protocol.

Agent implementations live in applications and call the same public interfaces
available to other clients. They do not enter the rendering engine or mutate
GPU and private runtime state directly.

## Considered Alternatives

- Add Agent-only methods to renderer or scene classes.
- Let an Agent issue arbitrary internal commands.
- Keep semantic identity in application-specific display names.

These alternatives couple the platform to one integration, weaken validation,
and make non-Agent clients second-class.

## Consequences

- Human interfaces, scripts, tests, and Agents share one capability model.
- Semantic operations require explicit validation and stable errors.
- Agent policy, prompt construction, and conversation state remain in the
  application.
- New consumers can be added without changing engine concepts.

## Compatibility

Semantic identifiers and public operation names are versioned API surfaces.
Adding an Agent-specific requirement to the engine requires superseding this
decision.

## Verification

- Public APIs contain no Agent-only terminology.
- Application tools operate through public engine and industrial APIs.
- Unknown operations and invalid payloads fail without partial state changes.

## Related Documents

- `ICE3-DOC-ARC-001` — [ICE3 family architecture](../architecture.md)
- `ICE3-DOC-ADR-001` — [Universal engine and vertical applications](0001-universal-engine-and-vertical-applications.md)
- `ICE3-IND-ARC-001` — Industrial semantic architecture, published in `ice3-industrial`.
