# ICE3 Documentation System Implementation Plan

> Document ID: ICE3-DOC-PLAN-015
>
> Status: Implemented
>
> Owner: ICE3 documentation maintainers

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give all seven ICE3 repositories a complete, numbered, cross-linked, externally understandable documentation set.

**Architecture:** Add one zero-dependency Markdown validator and copy it unchanged into every repository. Migrate existing design records into public documentation directories, assign permanent IDs, then add a README, index, architecture document, decisions, and usage documentation according to each repository's maturity.

**Tech Stack:** Markdown, Node.js 24.22.1 LTS, Node.js built-in test runner, Git

**Spec:** [ICE3-DOC-SPEC-011](../specs/2026-10-29-documentation-system-design.md)

## Global Constraints

- Run the commands in this plan from the workspace directory containing all seven
  `ice3-*` repositories as siblings.
- Public API names, command names, identifiers, and code remain in their implementation language and casing.
- New shared architecture, decision, guide, and reference documents use English as the canonical technical language.
- Existing Chinese specifications and plans remain Chinese; their titles may include English technical terms where those terms are normative.
- Each Chinese technical specification receives an English short summary in its metadata section so readers can identify its scope.
- Use `ICE3-<AREA>-<TYPE>-<NNN>` document IDs and never reuse an identifier.
- Use relative links inside one repository.
- Use `https://github.com/ice-3d/ice3-<repository>/blob/main/<path>` for cross-repository links.
- Do not include local user paths, credentials, real customer data, or unapproved vendor names.
- Do not add product claims or usage instructions for unimplemented repositories.
- The `LICENSE` files remain unmodified MIT text.

## Review Focus

- Moving `docs/superpowers/*` must not leave broken relative links or stale indexes.
- Cross-repository links must use `ice-3d` and must not use local sibling paths.
- Every Markdown file must appear exactly once in its repository index.
- Placeholder repositories must not imply APIs, commands, or architecture that do not exist.
- Rewritten READMEs must preserve exact commands, ports, prerequisites, and verification behavior.

## Starting State

After this plan is approved, merge the reviewed specification and plan into
`ice3-doc/main` before starting Task 1:

```bash
cd ice3-doc
git switch main
git merge --no-ff --no-edit design/documentation-system
git switch -c docs/foundation
```

---

## File Structure Map

### Shared validator

- `ice3-doc/scripts/check-docs.mjs`: parse tracked Markdown, validate metadata,
  indexes, links, anchors, local paths, and cross-repository URLs.
- `ice3-doc/scripts/check-docs.test.mjs`: exercise valid and invalid fixtures.
- `ice3-doc/scripts/fixtures/docs-valid/`: passing Markdown fixtures.
- `ice3-doc/scripts/fixtures/docs-invalid/`: one fixture per failure class.
- `ice3-doc/package.json`: expose `docs:check` and `test` scripts for the
  documentation repository.
- Each implemented repository receives an identical
  `scripts/check-docs.mjs` copy and a `docs:check` package script.

### `ice3-doc`

- `README.md`
- `docs/README.md`
- `docs/architecture.md`
- `docs/decisions/README.md`
- `docs/decisions/0001-universal-engine-and-vertical-applications.md`
- `docs/decisions/0002-offline-open-asset-pipeline.md`
- `docs/decisions/0003-shared-2d-3d-composition.md`
- `docs/decisions/0004-generic-semantic-interfaces.md`
- `docs/contracts/asset-preparation-contract-v1.md`
- `docs/specs/*.md`
- `docs/plans/*.md`

### `ice3-engine`

- `README.md`
- `docs/README.md`
- `docs/architecture.md`
- `docs/guides/getting-started.md`
- `docs/guides/asset-loading.md`
- `docs/guides/development-and-troubleshooting.md`
- `docs/decisions/README.md`
- `docs/decisions/0001-public-facade-and-package-boundaries.md`
- `docs/decisions/0002-geometry-first-industrial-rendering.md`
- `docs/decisions/0003-camera-driven-tileset-and-lod.md`
- `docs/reference/diagnostics.md`
- `docs/api/m0.md`
- `docs/api/m1.md`
- `docs/specs/*.md`
- `docs/plans/*.md`

### `ice3-toolchain`

- `README.md`
- `docs/README.md`
- `docs/architecture.md`
- `docs/guides/build-validate-partition.md`
- `docs/guides/large-model-performance.md`
- `docs/reference/cli.md`
- `docs/decisions/README.md`
- `docs/decisions/0001-offline-standard-output.md`
- `docs/decisions/0002-deterministic-atomic-publication.md`
- `docs/decisions/0003-content-addressed-generation-cache.md`
- `tests/fixtures/3d-tiles-1.1-schema/SOURCE.md`
- `THIRD_PARTY_NOTICES.md`
- `docs/plans/*.md`

### `ice3-industrial`

- `README.md`
- `docs/README.md`
- `docs/architecture.md`
- `docs/guides/getting-started.md`
- `docs/reference/api.md`
- `docs/decisions/README.md`
- `docs/decisions/0001-zero-runtime-dependencies.md`
- `docs/decisions/0002-manifest-state-separation.md`
- `docs/decisions/0003-stable-identity-model.md`

### `ice3-agent-console`

- `README.md`
- `docs/README.md`
- `docs/architecture.md`
- `docs/guides/local-development.md`
- `docs/guides/static-deployment.md`
- `docs/guides/real-model-server.md`
- `docs/reference/protocol.md`
- `docs/decisions/README.md`
- `docs/decisions/0001-agent-scene-boundary.md`
- `docs/decisions/0002-scripted-and-real-model-transport.md`
- `docs/specs/*.md`
- `docs/plans/*.md`

### Placeholder repositories

- `ice3-studio/README.md`
- `ice3-water-demo/README.md`

---

### Task 1: Documentation Validator

**Files:**
- Create: `ice3-doc/package.json`
- Create: `ice3-doc/scripts/check-docs.mjs`
- Create: `ice3-doc/scripts/check-docs.test.mjs`
- Create: `ice3-doc/scripts/fixtures/docs-valid/README.md`
- Create: `ice3-doc/scripts/fixtures/docs-invalid/README.md`

**Interfaces:**
- Consumes: Git-tracked Markdown files and optional sibling repositories.
- Produces: `node scripts/check-docs.mjs [--workspace-root <path>] [--json]`,
  which exits `0` only when all documentation checks pass.

- [x] **Step 1: Write failing metadata tests**

```js
test('accepts one titled document with valid metadata', async () => {
  const report = await checkRepository(validFixtureRoot);
  assert.deepEqual(report.errors, []);
});

test('rejects duplicate IDs and missing metadata', async () => {
  const report = await checkRepository(invalidFixtureRoot);
  assert.match(report.errors.join('\n'), /missing Document ID/);
  assert.match(report.errors.join('\n'), /duplicate Document ID/);
});
```

- [x] **Step 2: Run the tests to verify they fail**

```bash
cd ice3-doc
node --test scripts/check-docs.test.mjs
```

Expected: FAIL because `checkRepository` does not exist.

- [x] **Step 3: Implement the zero-dependency validator**

Use fenced-block-aware Markdown parsing so example headings and links do not
count as document structure. Export `checkRepository(root, options)` and a CLI
entry point. Validate:

```text
^# .+$
^> Document ID: ICE3-(AGENT|DOC|ENG|IND|STUDIO|TOOL|WATER)-
  (RM|IDX|ARC|ADR|GUIDE|API|SPEC|PLAN|POL|CTR|REF|NOTICE)-[0-9]{3}$
^> Status: (Draft|Approved|Active|Implemented|Historical|Deprecated|Placeholder)$
^> Owner: .+$

```

Resolve relative links against the containing document. Compute GitHub heading
anchors by lowercasing, removing punctuation, and replacing spaces with hyphens.
Accept cross-repository links only when they start with
`https://github.com/ice-3d/ice3-`.

- [x] **Step 4: Add one failing fixture for every required rule**

Fixtures cover missing IDs, duplicate IDs, unsupported statuses, missing
indexes, broken relative files, broken anchors, local absolute paths, malformed
cross-repository URLs, and placeholder claims containing shell commands or API
declarations.

- [x] **Step 5: Run the validator tests**

```bash
cd ice3-doc
node --test scripts/check-docs.test.mjs
```

Expected: PASS with one test per failure class.

- [x] **Step 6: Add package scripts**

```json
{
  "private": true,
  "license": "MIT",
  "engines": {
    "node": "^24.0.0 || >=26.0.0"
  },
  "scripts": {
    "docs:check": "node scripts/check-docs.mjs",
    "docs:check:workspace": "node scripts/check-docs.mjs --workspace-root ..",
    "test": "node --test scripts/check-docs.test.mjs"
  }
}
```

- [x] **Step 7: Commit**

```bash
cd ice3-doc
git switch -c docs/foundation
git add package.json scripts
git commit -m "docs: add documentation validator"
```

### Task 2: Migrate Shared Documentation And Assign IDs

**Files:**
- Move: `ice3-doc/docs/superpowers/specs/*.md` to `ice3-doc/docs/specs/*.md`
- Move: `ice3-doc/docs/superpowers/plans/*.md` to `ice3-doc/docs/plans/*.md`
- Modify: all moved Markdown files
- Modify: `ice3-doc/docs/contracts/asset-preparation-contract-v1.md`
- Create: `ice3-doc/docs/README.md`

**Interfaces:**
- Consumes: Task 1 validator.
- Produces: a flat public document layout with stable IDs and no
  `docs/superpowers` directory.

- [x] **Step 1: Move the directories without changing content**

```bash
cd ice3-doc
git mv docs/superpowers/specs docs/specs
git mv docs/superpowers/plans docs/plans
```

- [x] **Step 2: Add the specification metadata**

Use these mappings:

| ID | File |
|---|---|
| `ICE3-DOC-SPEC-001` | `2026-10-27-adaptive-industrial-lod-design.md` |
| `ICE3-DOC-SPEC-002` | `2026-10-27-adaptive-tileset-scheduler-design.md` |
| `ICE3-DOC-SPEC-003` | `2026-10-27-hierarchical-lod-design.md` |
| `ICE3-DOC-SPEC-004` | `2026-10-27-industrial-render-batching-design.md` |
| `ICE3-DOC-SPEC-005` | `2026-10-27-lod-refinement-and-scene-api-design.md` |
| `ICE3-DOC-SPEC-006` | `2026-10-27-semantic-industrial-proxy-design.md` |
| `ICE3-DOC-SPEC-007` | `2026-10-27-spatial-tileset-pipeline-design.md` |
| `ICE3-DOC-SPEC-008` | `2026-10-28-credible-wastewater-blender-pipeline-design.md` |
| `ICE3-DOC-SPEC-009` | `2026-10-28-industrial-semantic-layer-design.md` |
| `ICE3-DOC-SPEC-010` | `2026-10-28-synthetic-wastewater-plant-asset-design.md` |
| `ICE3-DOC-SPEC-011` | `2026-10-29-documentation-system-design.md` |

Set existing implemented specifications to `Implemented`. Keep the documentation
system specification as `Approved` until its implementation plan completes.
Add an `English summary:` line to every Chinese specification immediately below
its metadata block; the summary is one sentence describing the implemented
scope.

- [x] **Step 3: Add the plan metadata**

Use these mappings:

| ID | File |
|---|---|
| `ICE3-DOC-PLAN-001` | `2026-10-27-adaptive-industrial-lod.md` |
| `ICE3-DOC-PLAN-002` | `2026-10-27-adaptive-render-batching-workers.md` |
| `ICE3-DOC-PLAN-003` | `2026-10-27-adaptive-tileset-scheduler.md` |
| `ICE3-DOC-PLAN-004` | `2026-10-27-asset-preparation-contract.md` |
| `ICE3-DOC-PLAN-005` | `2026-10-27-hierarchical-lod-assets.md` |
| `ICE3-DOC-PLAN-006` | `2026-10-27-hierarchical-lod-runtime.md` |
| `ICE3-DOC-PLAN-007` | `2026-10-27-lod-refinement.md` |
| `ICE3-DOC-PLAN-008` | `2026-10-27-scene-query-api.md` |
| `ICE3-DOC-PLAN-009` | `2026-10-27-semantic-industrial-proxies.md` |
| `ICE3-DOC-PLAN-010` | `2026-10-27-spatial-tileset-pipeline.md` |
| `ICE3-DOC-PLAN-011` | `2026-10-27-static-render-batching.md` |
| `ICE3-DOC-PLAN-012` | `2026-10-28-credible-wastewater-blender-pipeline.md` |
| `ICE3-DOC-PLAN-013` | `2026-10-28-industrial-semantic-core.md` |
| `ICE3-DOC-PLAN-014` | `2026-10-28-synthetic-wastewater-plant-asset.md` |
| `ICE3-DOC-PLAN-015` | `2026-10-29-documentation-system.md` |

Set completed plans to `Implemented`. Keep this documentation plan as `Draft`
until all tasks and final verification are complete.

- [x] **Step 4: Add the contract metadata**

Add this immediately after the existing H1:

```md
> Document ID: ICE3-DOC-CTR-001
>
> Status: Active
>
> Owner: ICE3 architecture maintainers
```

- [x] **Step 5: Repair moved-document links**

```bash
cd ice3-doc
rg -n 'docs/superpowers|\.\./\.\./superpowers' docs README.md
```

Expected after repair: no output.

- [x] **Step 6: Create the initial complete index and README metadata**

Add `ICE3-DOC-RM-001` to `README.md` and create `docs/README.md` with
`ICE3-DOC-IDX-001`. The initial index lists every moved document once under its
ownership section. Task 3 expands the navigation prose and adds new documents.

- [x] **Step 7: Run focused validation**

```bash
cd ice3-doc
node scripts/check-docs.mjs
```

Expected: PASS for metadata, index completeness, and file links.

- [x] **Step 8: Commit**

```bash
cd ice3-doc
git add README.md docs
git commit -m "docs: assign shared document identifiers"
```

### Task 3: Shared Navigation, Architecture, And Decisions

**Files:**
- Modify: `ice3-doc/README.md`
- Modify: `ice3-doc/docs/README.md`
- Create: `ice3-doc/docs/architecture.md`
- Create: `ice3-doc/docs/decisions/README.md`
- Create: four `ice3-doc/docs/decisions/NNNN-*.md` files listed above

**Interfaces:**
- Consumes: all IDs from Task 2.
- Produces: `ICE3-DOC-RM-001`, `ICE3-DOC-IDX-001`, `ICE3-DOC-ARC-001`, and
  `ICE3-DOC-IDX-002`, `ICE3-DOC-ADR-001..004`.

- [x] **Step 1: Write the family index**

The index groups links by ID under:

```text
Start Here
Architecture
Decisions
Contracts
Specifications
Implementation Plans
```

Every row uses `ID | Title | Status | Purpose`.

- [x] **Step 2: Write the family architecture**

Document the seven repository responsibilities, allowed dependency direction,
the asset lifecycle from source model to runtime tiles, the 2D/3D composition
boundary, the industrial semantic boundary, and the Agent integration boundary.

- [x] **Step 3: Write the four shared decisions**

Each ADR records the selected decision and rejected alternatives:

- Universal engine and vertical applications: avoid coupling reusable engine
  capabilities to one industry.
- Offline open asset pipeline: preprocess outside the browser and publish
  standard GLB/Tileset representations.
- Shared 2D/3D composition: use one engine-owned input and layer model for both
  dimensions.
- Generic semantic interfaces: expose interfaces usable by people, tools, and
  Agents without AI-specific engine concepts.

- [x] **Step 4: Rewrite the root README**

Link directly to the index, architecture, decisions, canonical contract, and the
other six repository READMEs. Include the AI disclosure and MIT license.

- [x] **Step 5: Run validation**

```bash
cd ice3-doc
node scripts/check-docs.mjs
node scripts/check-docs.mjs --workspace-root ..
```

Expected: both commands PASS.

- [x] **Step 6: Commit**

```bash
cd ice3-doc
git add README.md docs package.json scripts
git commit -m "docs: add ICE3 documentation portal"
```

### Task 4: Migrate Engine Documentation

**Files:**
- Move: `ice3-engine/docs/superpowers/specs/*.md` to `ice3-engine/docs/specs/*.md`
- Move: `ice3-engine/docs/superpowers/plans/*.md` to `ice3-engine/docs/plans/*.md`
- Modify: `ice3-engine/AGENTS.md`
- Modify: `ice3-engine/docs/api/m0.md`
- Modify: `ice3-engine/docs/api/m1.md`
- Modify: `ice3-engine/docs/diagnostics.md`
- Modify: `ice3-engine/README.md`
- Create: `ice3-engine/docs/README.md`

**Interfaces:**
- Consumes: validator from Task 1.
- Produces: engine document IDs and public directory layout.

- [x] **Step 1: Move specification and plan directories**

```bash
cd ice3-engine
git switch -c docs/complete
git mv docs/superpowers/specs docs/specs
git mv docs/superpowers/plans docs/plans
```

- [x] **Step 2: Assign IDs**

| ID | File |
|---|---|
| `ICE3-ENG-POL-001` | `AGENTS.md` |
| `ICE3-ENG-API-001` | `docs/api/m0.md` |
| `ICE3-ENG-API-002` | `docs/api/m1.md` |
| `ICE3-ENG-REF-001` | `docs/diagnostics.md` |
| `ICE3-ENG-SPEC-001` | `docs/specs/2026-10-27-engine-m0-design.md` |
| `ICE3-ENG-SPEC-002` | `docs/specs/2026-10-27-engine-m1-asset-design.md` |
| `ICE3-ENG-SPEC-003` | `docs/specs/2026-10-27-equipment-selection-design.md` |
| `ICE3-ENG-PLAN-001` | `docs/plans/2026-10-27-engine-m0.md` |
| `ICE3-ENG-PLAN-002` | `docs/plans/2026-10-27-engine-m1-asset-runtime.md` |
| `ICE3-ENG-PLAN-003` | `docs/plans/2026-10-27-equipment-selection.md` |

- [x] **Step 3: Add initial README and documentation index metadata**

Add `ICE3-ENG-RM-001` to the existing README and `ICE3-ENG-IDX-001` to a new
index that lists every migrated API, reference, specification, plan, and policy
document. Task 5 expands this material.

- [x] **Step 4: Rewrite moved links and verify**

```bash
cd ice3-engine
rg -n 'docs/superpowers|\.\./\.\./superpowers' README.md docs
```

Expected after repair: no output.

- [x] **Step 5: Run focused validation**

```bash
cd ice3-engine
node scripts/check-docs.mjs
```

Expected: PASS.

- [x] **Step 6: Commit**

```bash
cd ice3-engine
git add AGENTS.md README.md docs
git commit -m "docs: assign engine document identifiers"
```

### Task 5: Engine README, Architecture, Guides, And Decisions

**Files:**
- Modify: `ice3-engine/README.md`
- Modify: `ice3-engine/docs/README.md`
- Create: `ice3-engine/docs/architecture.md`
- Create: three `ice3-engine/docs/guides/*.md` files listed above
- Create: `ice3-engine/docs/decisions/README.md`
- Create: three `ice3-engine/docs/decisions/NNNN-*.md` files listed above
- Modify: `ice3-engine/package.json`

**Interfaces:**
- Consumes: exact export names and behavior documented in `docs/api/m0.md`,
  `docs/api/m1.md`, and `docs/diagnostics.md`.
- Produces: `ICE3-ENG-RM-001`, `ICE3-ENG-IDX-001`, `ICE3-ENG-ARC-001`,
  `ICE3-ENG-IDX-002`, `ICE3-ENG-GUIDE-001..003`, and
  `ICE3-ENG-ADR-001..003`.

- [x] **Step 1: Rewrite the README**

Preserve the current commands and ports. Add a five-minute example using only
the public `ice3` package, a capability table, explicit M0/M1 boundaries, the
asset-policy summary, verification commands, and the complete document map.

- [x] **Step 2: Write the architecture and ADRs**

Architecture must identify `@ice3/core`, `@ice3/assets`, `@ice3/renderer`,
`@ice3/runtime`, and `ice3`, and explain data flow from Prepared GLB to scene,
GPU upload, selection, Tileset scheduling, LOD, and disposal.

The three ADRs must document:

- public facade and dependency boundaries;
- geometry-first industrial rendering with basic material and light support;
- camera-driven Tileset/LOD behavior and stable selection identity.

- [x] **Step 3: Write the three guides**

Each guide includes prerequisites, runnable commands, expected output, common
failures, and links to its exact API/reference IDs.

- [x] **Step 4: Add validator and verification script**

Copy `ice3-doc/scripts/check-docs.mjs` unchanged to
`ice3-engine/scripts/check-docs.mjs`, then add:

```json
"docs:check": "node scripts/check-docs.mjs"
```

Change the existing verification script to begin with the documentation gate:

```json
"verify": "npm run docs:check && npm run test:architecture && npm run typecheck && npm run typecheck:example && npm test && npm run test:e2e"
```

- [x] **Step 5: Run documentation and repository verification**

```bash
cd ice3-engine
npm run docs:check
npm run verify
```

Expected: both commands PASS.

- [x] **Step 6: Commit**

```bash
cd ice3-engine
git add README.md docs package.json scripts/check-docs.mjs
git commit -m "docs: complete engine developer documentation"
```

### Task 6: Toolchain Documentation Migration

**Files:**
- Move: `ice3-toolchain/docs/superpowers/plans/*.md` to
  `ice3-toolchain/docs/plans/*.md`
- Modify: `ice3-toolchain/AGENTS.md`
- Modify: `ice3-toolchain/THIRD_PARTY_NOTICES.md`
- Modify: `ice3-toolchain/tests/fixtures/3d-tiles-1.1-schema/SOURCE.md`
- Modify: `ice3-toolchain/README.md`
- Create: `ice3-toolchain/docs/README.md`

**Interfaces:**
- Consumes: validator from Task 1.
- Produces: `ICE3-TOOL-POL-001`, `ICE3-TOOL-NOTICE-001`,
  `ICE3-TOOL-REF-002`, and `ICE3-TOOL-PLAN-001`.

- [x] **Step 1: Move and assign metadata**

```bash
cd ice3-toolchain
git switch -c docs/complete
git mv docs/superpowers/plans docs/plans
```

Add metadata:

| ID | File |
|---|---|
| `ICE3-TOOL-PLAN-001` | `docs/plans/2026-10-27-toolchain-m1-glb-pipeline.md` |
| `ICE3-TOOL-POL-001` | `AGENTS.md` |
| `ICE3-TOOL-NOTICE-001` | `THIRD_PARTY_NOTICES.md` |
| `ICE3-TOOL-REF-002` | `tests/fixtures/3d-tiles-1.1-schema/SOURCE.md` |

- [x] **Step 2: Add initial README and documentation index metadata**

Add `ICE3-TOOL-RM-001` to the existing README and `ICE3-TOOL-IDX-001` to a new
index that lists the policy, notice, fixture source, and migrated plan. Task 7
expands this material.

- [x] **Step 3: Repair moved links**

```bash
cd ice3-toolchain
rg -n 'docs/superpowers|\.\./\.\./superpowers' README.md docs tests
```

Expected after repair: no output.

- [x] **Step 4: Run focused validation**

```bash
cd ice3-toolchain
node scripts/check-docs.mjs
```

Expected: PASS.

- [x] **Step 5: Commit**

```bash
cd ice3-toolchain
git add AGENTS.md README.md THIRD_PARTY_NOTICES.md docs tests/fixtures
git commit -m "docs: assign toolchain document identifiers"
```

### Task 7: Toolchain README, Architecture, Guides, And Decisions

**Files:**
- Modify: `ice3-toolchain/README.md`
- Modify: `ice3-toolchain/docs/README.md`
- Create: `ice3-toolchain/docs/architecture.md`
- Create: two `ice3-toolchain/docs/guides/*.md` files listed above
- Create: `ice3-toolchain/docs/reference/cli.md`
- Create: `ice3-toolchain/docs/decisions/README.md`
- Create: three `ice3-toolchain/docs/decisions/NNNN-*.md` files listed above
- Modify: `ice3-toolchain/package.json`

**Interfaces:**
- Consumes: current README examples and `packages/cli/src/commands.ts`.
- Produces: `ICE3-TOOL-RM-001`, `ICE3-TOOL-IDX-001`,
  `ICE3-TOOL-IDX-002`, `ICE3-TOOL-ARC-001`, `ICE3-TOOL-GUIDE-001..002`,
  `ICE3-TOOL-REF-001`, and `ICE3-TOOL-ADR-001..003`.

- [x] **Step 1: Rewrite the README**

Keep it below 180 lines. The README contains purpose, requirements, quick start,
the four primary commands, asset-safety rules, verification, documentation map,
AI disclosure, and license. Move exhaustive option and format material to the
reference documents.

- [x] **Step 2: Write architecture and guides**

Architecture describes the source adapter, normalization, prepared profile,
partitioning, LOD, semantic proxies, static batching, atomic publication, and
cache. Guides cover the exact build/validate/partition workflow and the measured
large-model cache/performance behavior.

- [x] **Step 3: Write the CLI reference**

List every supported option from `parseArguments`, including defaults,
constraints, and failure behavior. Include one complete large-model command and
one validation command.

- [x] **Step 4: Write the three ADRs**

Record offline standard output, deterministic atomic publication, and the
content-addressed Blender source cache with its invalidation inputs.

- [x] **Step 5: Run documentation and repository verification**

Copy `ice3-doc/scripts/check-docs.mjs` unchanged to
`ice3-toolchain/scripts/check-docs.mjs`. Add and wire the package scripts:

```json
"docs:check": "node scripts/check-docs.mjs",
"verify": "npm run docs:check && npm run test:architecture && npm run typecheck && npm run typecheck:tools && npm test"
```

```bash
cd ice3-toolchain
npm run docs:check
npm run verify
```

Expected: both commands PASS.

- [x] **Step 6: Commit**

```bash
cd ice3-toolchain
git add README.md docs tests/fixtures/3d-tiles-1.1-schema/SOURCE.md
git add package.json scripts/check-docs.mjs
git commit -m "docs: complete toolchain developer documentation"
```

### Task 8: Industrial Semantic Documentation

**Files:**
- Modify: `ice3-industrial/README.md`
- Create: `ice3-industrial/docs/README.md`
- Create: `ice3-industrial/docs/architecture.md`
- Create: `ice3-industrial/docs/guides/getting-started.md`
- Create: `ice3-industrial/docs/reference/api.md`
- Create: `ice3-industrial/docs/decisions/README.md`
- Create: three `ice3-industrial/docs/decisions/NNNN-*.md` files listed above
- Copy: `ice3-doc/scripts/check-docs.mjs` to
  `ice3-industrial/scripts/check-docs.mjs`
- Modify: `ice3-industrial/package.json`

**Interfaces:**
- Consumes: exported symbols from
  `packages/industrial-core/src/index.ts` and the existing README example.
- Produces: `ICE3-IND-RM-001`, `ICE3-IND-IDX-001`, `ICE3-IND-ARC-001`,
  `ICE3-IND-IDX-002`, `ICE3-IND-GUIDE-001`, `ICE3-IND-API-001`, and
  `ICE3-IND-ADR-001..003`.

- [x] **Step 1: Inspect the public exports**

```bash
cd ice3-industrial
rg -n '^export ' packages/industrial-core/src
```

Use the output to ensure the reference documents every public export and no
private source path.

- [x] **Step 2: Write the architecture and ADRs**

Document the manifest parser, registries, relation graph, state store, query
engine, context, event stream, operation registry, adapters, and workspace
composition. Record zero dependencies, static/runtime separation, and stable
identity decisions.

- [x] **Step 3: Write onboarding and API reference**

Retain the current manifest example, then add state updates, queries, relation
traversal, context changes, serialization, and error behavior as separate
copyable examples.

- [x] **Step 4: Run documentation and repository verification**

Add the validator and wire it into verification:

```json
"docs:check": "node scripts/check-docs.mjs",
"verify": "npm run docs:check && npm run test:architecture && npm run typecheck && npm test"
```

```bash
cd ice3-industrial
npm run docs:check
npm run verify
```

Expected: both commands PASS.

- [x] **Step 5: Commit**

```bash
cd ice3-industrial
git add README.md docs package.json scripts/check-docs.mjs
git commit -m "docs: complete industrial developer documentation"
```

### Task 9: Agent Console Documentation Migration

**Files:**
- Move: `ice3-agent-console/docs/superpowers/specs/*.md` to
  `ice3-agent-console/docs/specs/*.md`
- Move: `ice3-agent-console/docs/superpowers/plans/*.md` to
  `ice3-agent-console/docs/plans/*.md`
- Modify: `ice3-agent-console/AGENTS.md`
- Modify: `ice3-agent-console/README.md`
- Create: `ice3-agent-console/docs/README.md`

**Interfaces:**
- Consumes: validator from Task 1.
- Produces: `ICE3-AGENT-POL-001`, `ICE3-AGENT-SPEC-001`, and
  `ICE3-AGENT-PLAN-001`.

- [x] **Step 1: Move and assign metadata**

```bash
cd ice3-agent-console
git switch -c docs/complete
git mv docs/superpowers/specs docs/specs
git mv docs/superpowers/plans docs/plans
```

| ID | File |
|---|---|
| `ICE3-AGENT-POL-001` | `AGENTS.md` |
| `ICE3-AGENT-SPEC-001` | `docs/specs/2026-10-28-ice3-agent-console-design.md` |
| `ICE3-AGENT-PLAN-001` | `docs/plans/2026-10-28-ice3-agent-console.md` |

- [x] **Step 2: Add initial README and documentation index metadata**

Add `ICE3-AGENT-RM-001` to the existing README and `ICE3-AGENT-IDX-001` to a new
index that lists the policy, specification, and plan. Task 10 expands this
material.

- [x] **Step 3: Repair moved links**

```bash
cd ice3-agent-console
rg -n 'docs/superpowers|\.\./\.\./superpowers' README.md docs
```

Expected after repair: no output.

- [x] **Step 4: Run focused validation**

```bash
cd ice3-agent-console
node scripts/check-docs.mjs
```

Expected: PASS.

- [x] **Step 5: Commit**

```bash
cd ice3-agent-console
git add AGENTS.md README.md docs
git commit -m "docs: assign agent console document identifiers"
```

### Task 10: Agent Console README, Architecture, Guides, And Decisions

**Files:**
- Modify: `ice3-agent-console/README.md`
- Modify: `ice3-agent-console/docs/README.md`
- Create: `ice3-agent-console/docs/architecture.md`
- Create: three `ice3-agent-console/docs/guides/*.md` files listed above
- Create: `ice3-agent-console/docs/reference/protocol.md`
- Create: `ice3-agent-console/docs/decisions/README.md`
- Create: two `ice3-agent-console/docs/decisions/NNNN-*.md` files listed above
- Modify: `ice3-agent-console/package.json`

**Interfaces:**
- Consumes: `shared/`, `server/`, `src/protocol/`, and current README behavior.
- Produces: `ICE3-AGENT-RM-001`, `ICE3-AGENT-IDX-001`,
  `ICE3-AGENT-IDX-002`, `ICE3-AGENT-ARC-001`, `ICE3-AGENT-GUIDE-001..003`,
  `ICE3-AGENT-REF-001`, and `ICE3-AGENT-ADR-001..002`.

- [x] **Step 1: Rewrite the README**

Keep the current ports and build modes. Add a capability/boundary table, a
five-minute scripted mode, static build instructions, real-model configuration,
the six scene tools, verification, and the document map.

- [x] **Step 2: Write the architecture and ADRs**

Explain the event stream, shared protocol, scene controller, click and
selection flow, autoplay cancellation, server/client transport split, and static
demo marker. Record the Agent/scene boundary and the explicit scripted versus
configured-model failure policy.

- [x] **Step 3: Write the guides and protocol reference**

The protocol reference lists every event and every scene tool with payload
shape and failure behavior. Guides cover local development, static deployment,
and real-model configuration without exposing credentials.

- [x] **Step 4: Run documentation and repository verification**

Copy `ice3-doc/scripts/check-docs.mjs` unchanged to
`ice3-agent-console/scripts/check-docs.mjs`. Add and wire the package scripts:

```json
"docs:check": "node scripts/check-docs.mjs",
"verify": "npm run docs:check && npm run typecheck && npm test && npm run build"
```

```bash
cd ice3-agent-console
npm run docs:check
npm run verify
```

Expected: both commands PASS.

- [x] **Step 5: Commit**

```bash
cd ice3-agent-console
git add README.md docs package.json scripts/check-docs.mjs
git commit -m "docs: complete agent console developer documentation"
```

### Task 11: Placeholder Repositories

**Files:**
- Modify: `ice3-studio/README.md`
- Modify: `ice3-water-demo/README.md`

**Interfaces:**
- Consumes: placeholder status rules from `ICE3-DOC-SPEC-011`.
- Produces: `ICE3-STUDIO-RM-001` and `ICE3-WATER-RM-001`.

- [x] **Step 1: Write the Studio placeholder**

The README contains only a title, metadata, a one-sentence repository purpose,
an explicit statement that no public API, commands, or architecture exist yet,
the AI disclosure, and the MIT license.

- [x] **Step 2: Write the Water Demo placeholder**

Use the same structure with the water-industry demonstration purpose. Do not add
installation steps, commands, APIs, or architectural claims.

- [x] **Step 3: Validate standalone placeholder rules**

```bash
for repository in ice3-studio ice3-water-demo; do
  node ice3-doc/scripts/check-docs.mjs --root "$repository"
done
```

Expected: both commands PASS and report only placeholder-compatible documents.

- [x] **Step 4: Commit each repository**

```bash
cd ice3-studio
git switch -c docs/placeholder
git add README.md
git commit -m "docs: add Studio placeholder"

cd ../ice3-water-demo
git switch -c docs/placeholder
git add README.md
git commit -m "docs: add water demo placeholder"
```

### Task 12: Cross-Repository Navigation And Release Gate

**Files:**
- Modify: `ice3-doc/docs/README.md` if cross-repository target IDs changed
- Modify: every repository README document map

**Interfaces:**
- Consumes: all previous tasks.
- Produces: a passing family-wide documentation and code release gate.

- [x] **Step 1: Verify copied validators are identical**

```bash
shasum -a 256 \
  ice3-doc/scripts/check-docs.mjs \
  ice3-engine/scripts/check-docs.mjs \
  ice3-industrial/scripts/check-docs.mjs \
  ice3-toolchain/scripts/check-docs.mjs \
  ice3-agent-console/scripts/check-docs.mjs
```

Expected: all five hashes are identical.

- [x] **Step 2: Verify the complete cross-repository catalog**

```bash
cd ice3-doc
npm run docs:check:workspace
```

Expected: PASS with every owned Markdown file indexed exactly once.

- [x] **Step 3: Verify that no stale internal directory remains**

```bash
find ice3-agent-console ice3-doc ice3-engine ice3-toolchain \
  -type d -name superpowers -print
rg -n '\]\([^)]*docs/superpowers' ice3-agent-console ice3-doc ice3-engine \
  ice3-toolchain -g '*.md' -g '!node_modules/**' -g '!dist/**'
```

Expected: no output.

- [x] **Step 4: Verify absence of local paths**

```bash
rg -n '/Users/[A-Za-z0-9._-]+/|/home/[A-Za-z0-9._-]+/|[A-Za-z]:\\Users\\' \
  ice3-agent-console ice3-doc ice3-engine ice3-industrial ice3-studio \
  ice3-toolchain ice3-water-demo -g '*.md' -g '!node_modules/**' -g '!dist/**'
```

Expected: no output.

- [x] **Step 5: Run all implemented repository verification**

```bash
cd ice3-agent-console && npm run verify
cd ../ice3-engine && npm run verify
cd ../ice3-industrial && npm run verify
cd ../ice3-toolchain && npm run verify
```

Expected: all commands exit `0`.

- [x] **Step 6: Manually walk the navigation graph**

From each README, follow its index to:

1. Architecture.
2. One ADR.
3. One usage guide.
4. The relevant API or reference.
5. The related canonical `ice3-doc` contract.
6. Back to the repository index.

Record every broken or misleading hop and fix it before committing.

- [x] **Step 7: Mark the specification and plan implemented**

Change `ICE3-DOC-SPEC-011` and `ICE3-DOC-PLAN-015` from `Approved`/`Draft` to
`Implemented` only after every prior step passes.

- [x] **Step 8: Commit and merge each repository**

```bash
cd ice3-doc
git add README.md docs package.json scripts
git commit -m "docs: complete ICE3 documentation system"
git switch main
git merge --no-ff --no-edit docs/foundation

cd ../ice3-engine
git add README.md docs package.json scripts/check-docs.mjs
git commit -m "docs: finalize engine documentation system"
git switch main
git merge --no-ff --no-edit docs/complete

cd ../ice3-toolchain
git add README.md docs package.json scripts/check-docs.mjs
git commit -m "docs: finalize toolchain documentation system"
git switch main
git merge --no-ff --no-edit docs/complete

cd ../ice3-industrial
git add README.md docs package.json scripts/check-docs.mjs
git commit -m "docs: finalize industrial documentation system"
git switch main
git merge --no-ff --no-edit docs/complete

cd ../ice3-agent-console
git add README.md docs package.json scripts/check-docs.mjs
git commit -m "docs: finalize agent console documentation system"
git switch main
git merge --no-ff --no-edit docs/complete

cd ../ice3-studio
git switch main
git merge --no-ff --no-edit docs/placeholder

cd ../ice3-water-demo
git switch main
git merge --no-ff --no-edit docs/placeholder
```

## Related Documents

- `ICE3-DOC-IDX-001` — [Documentation index](../README.md)
- `ICE3-DOC-SPEC-011` — [Documentation system specification](../specs/2026-10-29-documentation-system-design.md)
