# ICE3 Documentation System Design Specification

> Document ID: ICE3-DOC-SPEC-011
>
> Status: Approved
>
> Owner: ICE3 documentation maintainers

## Purpose

This specification defines the documentation system for all ICE3 repositories. Its
purpose is to make every repository understandable, navigable, and verifiable by
a developer who has no prior project context.

The documentation system must answer four questions without requiring tribal
knowledge:

1. What is this repository and what is it not?
2. How does it fit with the other ICE3 repositories?
3. What are the important technical decisions behind it?
4. How can a developer install, run, use, debug, and verify it?

This specification defines document identity, document taxonomy, repository
coverage, reference rules, lifecycle, migration, and automated validation. It
does not define the runtime architecture or asset format itself; those remain
owned by their canonical design and contract documents.

## Audience

- New contributors who need a reliable onboarding path.
- Application developers who consume public ICE3 packages.
- Tool authors who prepare, validate, partition, and publish assets.
- Maintainers who need to locate authoritative contracts and decisions.
- Reviewers who need to verify that documentation and implementation agree.

## Scope

This specification applies to all Markdown documentation in:

- `ice3-agent-console`
- `ice3-doc`
- `ice3-engine`
- `ice3-industrial`
- `ice3-studio`
- `ice3-toolchain`
- `ice3-water-demo`

It includes repository READMEs, indexes, architecture documents, architecture
decision records, guides, API references, contracts, specifications,
implementation plans, repository policies, source notices, and third-party
references.

The `LICENSE` files use the unmodified MIT license text and are not subject to
the Markdown document metadata rule.

## Goals

- Give every Markdown document a clear title and permanent internal identifier.
- Provide a complete navigation path from every repository README.
- Separate entry points, architecture, decisions, usage, reference material,
  specifications, plans, and policies.
- Establish one canonical authority for every shared contract.
- Make cross-repository references valid on GitHub after publication.
- Preserve historical design and implementation context without presenting it
  as current usage guidance.
- Prevent local paths, temporary links, and undocumented placeholders from
  entering the public documentation set.
- Make documentation completeness and link integrity mechanically verifiable.

## Non-Goals

- Generating a documentation website in this phase.
- Publishing every internal implementation detail.
- Duplicating the canonical asset contract in each repository.
- Rewriting the technical conclusions of historical design or implementation
  documents.
- Adding product claims or usage instructions for unimplemented repository
  capabilities.
- Maintaining multiple translations of every document.

## Documentation Principles

### Entry before detail

Each repository starts with a concise README that explains purpose, boundaries,
quick start, verification, and document navigation. Detailed material lives in
focused documents linked from the README.

### Decision before implementation detail

Architecture decisions record the problem, selected approach, alternatives,
consequences, and affected documents. Implementation guides then explain how to
apply the decision.

### One canonical definition

Shared formats, diagnostics, compatibility rules, and metrics are defined once
in `ice3-doc`. Other repositories link to that definition and describe only
their implementation.

### Current versus historical

Current API and operational guidance must be clearly separated from approved
designs and plans that have already been implemented. Historical documents
remain available for traceability.

### Stable identity

Document identifiers survive file moves and title edits. A future document may
reuse a path, but it must never reuse an existing document identifier.

### Verification by default

Every documented command must have a verification path. A command that cannot be
run from a fresh clone must state its prerequisites and expected result.

## Document Identity

Every Markdown document starts with exactly one level-one heading followed by a
metadata block:

```md
# Human-readable title

> Document ID: ICE3-ENG-RM-001
>
> Status: Active
>
> Owner: ICE3 Engine maintainers

```

The document identifier format is:

```text
ICE3-<AREA>-<TYPE>-<NNN>
```

Requirements:

- `AREA` identifies the owning project.
- `TYPE` identifies the document class.
- `NNN` is a zero-padded, three-digit sequence within one `AREA` and `TYPE`.
- Identifiers are globally unique across the ICE3 documentation set.
- Identifiers are immutable after commit.
- Numbers are never reused after a document is removed.
- New numbers use the next unused value in their `AREA` and `TYPE` namespace.
- The identifier is stored in the document body, not inferred from the filename.

## Area Codes

| Area | Code | Repository |
|---|---|---|
| Agent Console | `AGENT` | `ice3-agent-console` |
| Shared documentation | `DOC` | `ice3-doc` |
| Engine | `ENG` | `ice3-engine` |
| Industrial semantics | `IND` | `ice3-industrial` |
| Studio | `STUDIO` | `ice3-studio` |
| Toolchain | `TOOL` | `ice3-toolchain` |
| Water demo | `WATER` | `ice3-water-demo` |

## Document Types

| Type | Code | Purpose |
|---|---|---|
| README | `RM` | Repository entry point and navigation |
| Index | `IDX` | Catalog of related documents |
| Architecture | `ARC` | Components, boundaries, dependencies, and data flow |
| Decision | `ADR` | Accepted architectural or engineering decision |
| Guide | `GUIDE` | Installation, development, usage, deployment, or troubleshooting |
| API | `API` | Public programming interface and behavioral contract |
| Specification | `SPEC` | Approved functional or system design |
| Plan | `PLAN` | Ordered implementation and verification record |
| Policy | `POL` | Repository engineering and collaboration rules |
| Contract | `CTR` | Cross-repository format, metric, compatibility, or diagnostic agreement |
| Reference | `REF` | Lookup material such as formats, diagnostics, CLI syntax, or sources |
| Notice | `NOTICE` | Third-party copyright, attribution, or license notice |

## Status Lifecycle

The permitted lifecycle states are:

| Status | Meaning |
|---|---|
| `Draft` | Under review and not yet authoritative |
| `Approved` | Accepted design that is not yet fully implemented |
| `Active` | Current authoritative guidance or reference |
| `Implemented` | Completed plan or design retained for traceability |
| `Historical` | Superseded material retained for project history |
| `Deprecated` | Must no longer be used for new work |
| `Placeholder` | Reserved repository with no implemented capability yet |

Transition rules:

- A specification starts as `Draft`.
- Maintainer approval changes it to `Approved`.
- Completion of the accepted scope changes a plan or specification to
  `Implemented`.
- Superseded material changes to `Historical` or `Deprecated`.
- An empty repository uses `Placeholder` until implementation begins.

## Required Heading Structure

### Repository README

Every implemented repository README contains:

1. Purpose.
2. Current capabilities and explicit boundaries.
3. Repository relationships.
4. Prerequisites.
5. Quick start.
6. Primary workflows.
7. Verification.
8. Documentation map.
9. AI-assisted development disclosure.
10. License.

Commands must show the working directory only when it is not the repository
root. Cross-repository commands must begin from this repository root and use the
published cross-repository URL guidance for links.

### Architecture Document

Every architecture document contains:

1. System context.
2. Component responsibilities.
3. Dependency direction.
4. Primary data flow.
5. Public and private boundaries.
6. Failure behavior.
7. Related decisions.
8. Related specifications and references.

### Architecture Decision Record

Every decision record contains:

1. Context and problem.
2. Decision.
3. Considered alternatives.
4. Consequences and trade-offs.
5. Compatibility impact.
6. Verification approach.
7. Supersession links.

### Usage Guide

Every usage guide contains:

1. Intended outcome.
2. Prerequisites.
3. Inputs and assumptions.
4. Ordered procedure.
5. Expected result.
6. Failure diagnosis.
7. Related API and reference documents.

### API or Reference Document

Every API or reference document contains:

1. Supported scope.
2. Unsupported scope.
3. Stable public names.
4. Input and output shapes.
5. Lifecycle and error behavior.
6. Complete executable examples.
7. Versioning or compatibility policy.
8. Related contract identifiers.

### Specification and Implementation Plan

Existing technical content is preserved. Each document receives the standard
metadata block and a related-document section. Plans identify the specification
they implement. Specifications identify their governing decisions and contracts.

### Placeholder README

An empty repository contains only:

1. Title and metadata.
2. Repository purpose.
3. `Placeholder` status.
4. A statement that no public API, commands, or architecture exist yet.
5. AI-assisted development disclosure.
6. License.

Placeholders must not imply that functionality exists.

## Canonical Source-of-Truth Model

The following material is canonical in `ice3-doc`:

- Cross-repository architecture.
- Prepared asset and format contracts.
- Shared compatibility rules.
- Shared budgets and metrics.
- Shared diagnostic identifiers.
- Cross-repository decisions.

The following material is canonical in its owning repository:

- Public package APIs.
- CLI behavior.
- Runtime architecture.
- Application protocols.
- Installation and operational procedures.
- Repository-specific engineering policies.

An owning repository may summarize a canonical contract to explain local usage,
but it must link to the canonical document and must not establish a competing
definition.

## Repository Documentation Matrix

### `ice3-doc`

| ID | Document | Status target |
|---|---|---|
| `ICE3-DOC-RM-001` | README | Active |
| `ICE3-DOC-IDX-001` | Documentation index | Active |
| `ICE3-DOC-IDX-002` | Decisions index | Active |
| `ICE3-DOC-ARC-001` | ICE3 family architecture | Active |
| `ICE3-DOC-ADR-001` | Universal engine and vertical applications | Active |
| `ICE3-DOC-ADR-002` | Offline preprocessing and open asset formats | Active |
| `ICE3-DOC-ADR-003` | Shared 2D/3D composition | Active |
| `ICE3-DOC-ADR-004` | Generic semantic interfaces and Agent boundary | Active |
| `ICE3-DOC-CTR-001` | Asset Preparation Contract v1 | Active |
| `ICE3-DOC-SPEC-001..011` | Existing and current design specifications | Approved or Implemented |
| `ICE3-DOC-PLAN-001..014` | Existing implementation plans | Implemented or Historical |
| `ICE3-DOC-PLAN-015` | Documentation system implementation | Active |

### `ice3-engine`

| ID | Document | Status target |
|---|---|---|
| `ICE3-ENG-RM-001` | README | Active |
| `ICE3-ENG-IDX-001` | Documentation index | Active |
| `ICE3-ENG-IDX-002` | Decisions index | Active |
| `ICE3-ENG-ARC-001` | Runtime and package architecture | Active |
| `ICE3-ENG-GUIDE-001` | Getting started | Active |
| `ICE3-ENG-GUIDE-002` | Asset loading and Tileset usage | Active |
| `ICE3-ENG-GUIDE-003` | Development and troubleshooting | Active |
| `ICE3-ENG-ADR-001` | Public facade and package boundaries | Active |
| `ICE3-ENG-ADR-002` | Geometry-first industrial rendering | Active |
| `ICE3-ENG-ADR-003` | Camera-driven Tileset and LOD runtime | Active |
| `ICE3-ENG-API-001` | M0 public API | Active |
| `ICE3-ENG-API-002` | M1 asset API | Active |
| `ICE3-ENG-REF-001` | Diagnostics reference | Active |
| `ICE3-ENG-POL-001` | Repository policy | Active |
| Existing specifications and plans | M0, M1, and equipment selection | Implemented or Historical |

### `ice3-toolchain`

| ID | Document | Status target |
|---|---|---|
| `ICE3-TOOL-RM-001` | README | Active |
| `ICE3-TOOL-IDX-001` | Documentation index | Active |
| `ICE3-TOOL-IDX-002` | Decisions index | Active |
| `ICE3-TOOL-ARC-001` | Preparation and partition architecture | Active |
| `ICE3-TOOL-GUIDE-001` | Build, validate, partition, and publish | Active |
| `ICE3-TOOL-GUIDE-002` | Large-model troubleshooting and performance | Active |
| `ICE3-TOOL-REF-001` | CLI reference | Active |
| `ICE3-TOOL-ADR-001` | Offline conversion and standard output | Active |
| `ICE3-TOOL-ADR-002` | Deterministic atomic publication | Active |
| `ICE3-TOOL-ADR-003` | Content-addressed generation cache | Active |
| `ICE3-TOOL-POL-001` | Repository policy | Active |
| `ICE3-TOOL-NOTICE-001` | Third-party notices | Active |
| `ICE3-TOOL-REF-002` | OGC fixture source | Active |
| Existing specifications and plans | GLB pipeline | Implemented or Historical |

### `ice3-agent-console`

| ID | Document | Status target |
|---|---|---|
| `ICE3-AGENT-RM-001` | README | Active |
| `ICE3-AGENT-IDX-001` | Documentation index | Active |
| `ICE3-AGENT-IDX-002` | Decisions index | Active |
| `ICE3-AGENT-ARC-001` | Console and event-stream architecture | Active |
| `ICE3-AGENT-GUIDE-001` | Local development | Active |
| `ICE3-AGENT-GUIDE-002` | Static deployment | Active |
| `ICE3-AGENT-GUIDE-003` | Real-model server configuration | Active |
| `ICE3-AGENT-REF-001` | Agent event and tool protocol | Active |
| `ICE3-AGENT-ADR-001` | Agent and scene responsibility boundary | Active |
| `ICE3-AGENT-ADR-002` | Scripted and real-model transport policy | Active |
| `ICE3-AGENT-POL-001` | Repository policy | Active |
| Existing specification and plan | Console design and delivery | Implemented or Historical |

### `ice3-industrial`

| ID | Document | Status target |
|---|---|---|
| `ICE3-IND-RM-001` | README | Active |
| `ICE3-IND-IDX-001` | Documentation index | Active |
| `ICE3-IND-IDX-002` | Decisions index | Active |
| `ICE3-IND-ARC-001` | Industrial semantic architecture | Active |
| `ICE3-IND-GUIDE-001` | Getting started and common workflows | Active |
| `ICE3-IND-API-001` | Public package reference | Active |
| `ICE3-IND-ADR-001` | Zero-runtime-dependency core | Active |
| `ICE3-IND-ADR-002` | Static manifest and runtime state separation | Active |
| `ICE3-IND-ADR-003` | Stable identity model | Active |

### `ice3-studio`

| ID | Document | Status target |
|---|---|---|
| `ICE3-STUDIO-RM-001` | Placeholder README | Placeholder |

### `ice3-water-demo`

| ID | Document | Status target |
|---|---|---|
| `ICE3-WATER-RM-001` | Placeholder README | Placeholder |

## Document Reference Model

Each substantive document ends with a related-document section. At minimum it
lists the stable identifiers and titles of:

- Its parent overview or index.
- The governing decision.
- The affected specification or contract.
- The implementation plan when one exists.
- The API, guide, or reference a reader should use next.

### Same-repository links

Use a relative Markdown link from the current document:

```md
[M1 Asset API](../api/m1.md)
```

Links must target tracked files. Anchors must match generated GitHub heading
slugs.

### Cross-repository links

Use the published GitHub URL:

```text
https://github.com/ice-3d/ice3-<repository>/blob/main/<path>
```

Examples:

```text
https://github.com/ice-3d/ice3-doc/blob/main/docs/contracts/asset-preparation-contract-v1.md
https://github.com/ice-3d/ice3-engine/blob/main/docs/api/m1.md
```

Do not use sibling-directory links such as `../ice3-engine` in public
documentation because GitHub repositories are independent.

### Identity references

When a link target is not public yet, use the document identifier as text and
explicitly state that the link is established after publication. Do not emit a
known-broken URL.

### Reference integrity

- A document may link to several related documents.
- A document must not claim authority delegated to another canonical document.
- A decision that changes shared behavior must link to its replacement or
  affected contract.
- A superseded document must link to its replacement.
- Indexes must include every Markdown document owned by their repository, except
  `LICENSE` and generated temporary files.

## File Layout

Public documentation uses the following layout:

```text
README.md
docs/
  README.md
  architecture.md
  decisions/
    README.md
    0001-topic.md
  guides/
    getting-started.md
  reference/
    api.md
    cli.md
    diagnostics.md
  specs/
    YYYY-MM-DD-topic-design.md
  plans/
    YYYY-MM-DD-topic.md
```

Repository-specific files such as `AGENTS.md` and third-party notices remain at
their conventional locations.

The former internal workflow directories move to `docs/specs` and `docs/plans`. Internal links
are updated in the same change. The previous directory is removed after every
reference is migrated.

## Language Policy

- Public API names, command names, identifiers, and code remain in their
  implementation language and casing.
- New shared architecture, decision, guide, and reference documents use English
  as the canonical technical language.
- Existing Chinese specifications and plans remain Chinese; their titles may
  include English technical terms where those terms are normative.
- Each Chinese technical specification receives an English short summary in its
  metadata section so readers can identify its scope.
- Bilingual duplication is not allowed because it creates competing sources of
  truth.

## Writing Rules

- Use concrete verbs and short paragraphs.
- Define a term before using it as a requirement.
- State unsupported behavior explicitly.
- Keep current instructions in guides and historical rationale in specifications
  or plans.
- Every code block includes a language where Markdown supports it.
- Every command block states whether it runs from the repository root.
- Every command block includes expected output or a verification condition.
- Use stable document identifiers in cross-document prose.
- Do not include local user paths, credentials, real customer data, or
  unapproved vendor names.
- Do not refer to repository-specific implementation as the definition of a
  shared contract.

## Automated Validation

The documentation gate checks all tracked Markdown files:

1. Exactly one level-one heading exists.
2. The title is non-empty and unique within the repository.
3. A valid `Document ID` appears immediately after the title.
4. IDs match the `ICE3-<AREA>-<TYPE>-<NNN>` format.
5. IDs are unique across the local documentation set.
6. The status value is supported.
7. Repository indexes include every owned Markdown document.
8. Relative file links resolve to tracked files.
9. Heading anchors resolve to headings in the target document.
10. Cross-repository links use `https://github.com/ice-3d/...` and map to a known
    repository and tracked path when sibling repositories are available.
11. No `/Users/<name>`, `/home/<name>`, Windows user path, `file://` URL, or
    temporary output path appears.
12. Placeholder repositories contain no executable commands or API claims.

The validation command must be runnable from every repository and included in
its verification workflow after the migration.

## Migration Plan

1. Add this specification and approve its status.
2. Add the family and repository documentation indexes.
3. Assign identifiers and metadata to existing documents without changing their
   technical conclusions.
4. Move specifications and plans out of the internal workflow directory and
   rewrite affected links.
5. Add architecture, decision, guide, API, reference, and policy documents in
   dependency order: shared documentation, engine, toolchain, industrial core,
   Agent Console, then placeholders.
6. Rewrite repository READMEs as navigation and quick-start entry points.
7. Run documentation validation, content checks, and each repository's existing
   verification commands.
8. Review the resulting navigation from every README through an index to each
   detailed document and back through related-document links.

## Acceptance Criteria

The documentation system is complete when:

- Every Markdown document has a title, unique internal ID, status, and owner.
- Every implemented repository has a README and a complete documentation index.
- Every documented command runs from a fresh clone after its stated prerequisites
  are installed.
- Every technical decision has an ADR or is explicitly recorded in an existing
  canonical specification.
- Every shared-format reference points to the `ice3-doc` canonical contract.
- Cross-repository links use the `ice-3d` GitHub organization and contain no
  local sibling paths.
- All repository indexes contain no missing or extra owned documents.
- All relative links and anchors pass automated validation.
- Empty repositories contain only honest placeholder documentation.
- Existing repository test and build verification remains green.

## Related Documents

- `ICE3-DOC-RM-001` — ICE3 documentation README.
- `ICE3-DOC-IDX-001` — ICE3 documentation index.
- `ICE3-DOC-ARC-001` — ICE3 family architecture.
- `ICE3-DOC-CTR-001` — Asset Preparation Contract v1.

The related identifiers above become links as those documents are migrated.
