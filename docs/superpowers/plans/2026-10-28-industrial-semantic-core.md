# Industrial Semantic Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the browser-independent `@ice3/industrial-core` package with a validated industrial manifest, entity/type registries, relation graph, query engine, batched state updates, events, operations, workspace context, serialization, and native ICE JSON adapters.

**Architecture:** A pure TypeScript workspace core owns immutable domain models and mutable runtime stores. Registries provide indexed lookup, a relation graph handles typed edges, and `ICEIndustrialWorkspace` coordinates context changes, batched state notifications, events, operations, and manifest serialization without DOM, WebGL, HTTP, or AI-specific concepts.

**Tech Stack:** Node.js 24 LTS, TypeScript 7, ESM, npm workspaces, Node.js built-in test runner, `expect`, `tsx`, JSON Schema-compatible TypeScript validation

**Spec:** `../specs/2026-10-28-industrial-semantic-layer-design.md`

## Global Constraints

- Use Node.js 24 from `.nvmrc`; run verification with Node 24.
- Use TypeScript strict mode and ESM.
- `@ice3/industrial-core` has zero runtime dependencies.
- No DOM, browser, WebGL, engine, protocol, file-system, network, or AI dependencies in the core package.
- No customer assets, derived assets, screenshots, logs, full business data, or customer paths in the repository.
- No competitor, vendor, or prohibited third-party product names in code, docs, comments, examples, or commit messages.
- Preserve public ICE-style explicit factories/constructors, immutable snapshots, stable IDs, events, and deterministic behavior.
- Standard mappings remain outside this plan; this plan delivers only the canonical core and native ICE JSON.
- Browser integration, 2D/3D adapters, Studio, protocol connectors, and Agent tooling are separate follow-on plans.
- All behavioral changes follow RED-GREEN-REFACTOR.

## Review Focus

- A manifest with a dangling parent or relation endpoint must fail before any registry becomes usable.
- Duplicate external identities across different entities must be rejected even when their display names differ.
- Relation traversal with cycles must terminate deterministically at the configured depth and direction.
- State patches with equal or older source timestamps must not overwrite a newer valid value.
- High-frequency state writes must coalesce notifications without losing the latest value or event ordering.

---

### Task 1: Scaffold the Industrial Core and Validate Manifests

**Files:**
- Create: `ice3-industrial/.gitignore`
- Create: `ice3-industrial/.nvmrc`
- Create: `ice3-industrial/package.json`
- Create: `ice3-industrial/package-lock.json`
- Create: `ice3-industrial/tsconfig.base.json`
- Create: `ice3-industrial/tsconfig.json`
- Create: `ice3-industrial/scripts/run-tests.mjs`
- Create: `ice3-industrial/scripts/clean.mjs`
- Create: `ice3-industrial/tests/architecture/package-boundaries.test.mjs`
- Create: `ice3-industrial/packages/industrial-core/package.json`
- Create: `ice3-industrial/packages/industrial-core/tsconfig.json`
- Create: `ice3-industrial/packages/industrial-core/src/index.ts`
- Create: `ice3-industrial/packages/industrial-core/src/manifest/ICEIndustrialManifest.ts`
- Create: `ice3-industrial/packages/industrial-core/src/manifest/parseIndustrialManifest.ts`
- Test: `ice3-industrial/tests/core/Manifest.test.ts`
- Create: `ice3-industrial/tests/core/manifestFixture.ts`

**Interfaces:**

```ts
type ICEIndustrialValue =
  | string
  | number
  | boolean
  | null
  | readonly ICEIndustrialValue[]
  | { readonly [key: string]: ICEIndustrialValue };

interface ICEIndustrialExternalId {
  readonly scheme: string;
  readonly value: string;
  readonly scope?: string;
}

interface ICEIndustrialPropertyDefinition {
  readonly id: string;
  readonly label: string;
  readonly dataType: 'string' | 'number' | 'boolean' | 'enum' | 'object';
  readonly unit?: string;
  readonly semanticId?: string;
  readonly readable: boolean;
  readonly writable: boolean;
  readonly enumValues?: readonly string[];
}

interface ICEIndustrialOperationDefinition {
  readonly id: string;
  readonly label: string;
  readonly inputSchema?: Readonly<Record<string, ICEIndustrialValue>>;
  readonly outputSchema?: Readonly<Record<string, ICEIndustrialValue>>;
  readonly requiresConfirmation: boolean;
}

interface ICEIndustrialEntityType {
  readonly id: string;
  readonly label: string;
  readonly parentTypeId?: string;
  readonly propertyDefinitions: readonly ICEIndustrialPropertyDefinition[];
  readonly operationDefinitions: readonly ICEIndustrialOperationDefinition[];
  readonly allowedRelationTypes?: readonly string[];
}

interface ICEIndustrialSpatialBinding {
  readonly selectionIds: readonly string[];
  readonly modelAssetId?: string;
  readonly bounds?: {
    readonly min: readonly [number, number, number];
    readonly max: readonly [number, number, number];
  };
  readonly anchor?: readonly [number, number, number];
  readonly tileIds?: readonly string[];
}

interface ICEIndustrialEntity {
  readonly id: string;
  readonly typeId: string;
  readonly parentId?: string;
  readonly displayName: string;
  readonly description?: string;
  readonly externalIds: readonly ICEIndustrialExternalId[];
  readonly spatial?: ICEIndustrialSpatialBinding;
}

interface ICEIndustrialRelation {
  readonly id: string;
  readonly type: string;
  readonly fromEntityId: string;
  readonly toEntityId: string;
  readonly directed: boolean;
  readonly metadata?: Readonly<Record<string, ICEIndustrialValue>>;
}

interface ICEIndustrialWorkspaceManifest {
  readonly version: '1.0';
  readonly workspaceId: string;
  readonly assetIds: readonly string[];
  readonly entityTypes: readonly ICEIndustrialEntityType[];
  readonly entities: readonly ICEIndustrialEntity[];
  readonly relations: readonly ICEIndustrialRelation[];
}

function parseIndustrialManifest(
  value: unknown,
): Readonly<ICEIndustrialWorkspaceManifest>;
```

- Consumes: an unknown decoded JSON value.
- Produces: a deeply immutable validated manifest or `ICE3_INDUSTRIAL_MANIFEST_INVALID`.

- [ ] **Step 1: Write the failing valid-manifest test**

```ts
import { test } from 'node:test';
import { expect } from 'expect';
import { parseIndustrialManifest } from
  '../../packages/industrial-core/src/index.js';
import { manifestFixture } from './manifestFixture.js';

test('parses and freezes a valid workspace manifest', () => {
  const parsed = parseIndustrialManifest(manifestFixture());

  expect(parsed).toMatchObject({
    version: '1.0',
    workspaceId: 'workspace-1',
  });
  expect(parsed.entities[0]!.id).toBe('pump-01');
  expect(Object.isFrozen(parsed)).toBe(true);
  expect(Object.isFrozen(parsed.entities[0])).toBe(true);
});
```

Create `manifestFixture.ts` with one `pump` type, `pump-01`, `valve-01`, and one `ice:connectedTo` relation.

- [ ] **Step 2: Run test and verify RED**

Run:

```bash
cd ../ice3-industrial
source ~/.nvm/nvm.sh && nvm use 24
npm test -- tests/core/Manifest.test.ts
```

Expected: FAIL because the workspace/package does not exist.

- [ ] **Step 3: Scaffold the workspace**

Create the root workspace and core package using the shared scripts:

```json
{
  "scripts": {
    "clean": "node scripts/clean.mjs",
    "build": "npm run clean && tsc -b",
    "typecheck": "tsc -b --pretty false",
    "test": "node scripts/run-tests.mjs",
    "test:architecture": "node --test tests/architecture/package-boundaries.test.mjs",
    "verify": "npm run test:architecture && npm run typecheck && npm test"
  }
}
```

Root dev dependencies:

```json
{
  "@types/node": "24.19.2",
  "typescript": "7.0.2",
  "expect": "30.5.2",
    "jest-mock": "30.5.2",
    "tsx": "4.23.15"
}
```

Run `npm install` once after creating the package manifests and commit the
generated `package-lock.json`.

`industrial-core` package:

```json
{
  "name": "@ice3/industrial-core",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "files": ["dist/**/*.js", "dist/**/*.d.ts", "dist/**/*.map"],
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  }
}
```

Use the established strict compiler flags with `lib: ["ES2024"]`; do not include DOM.

The architecture test reads both package manifests and asserts that
`@ice3/industrial-core` has no dependencies.

- [ ] **Step 4: Implement strict manifest parsing**

Reject:

- Unsupported or missing `version`.
- Empty workspace/type/entity/relation/property/operation IDs.
- Duplicate entity, type, relation, property-in-type, or operation-in-type IDs.
- Missing entity type.
- Missing entity parent.
- Missing relation endpoint.
- Same external ID (`scheme + scope + value`) on two entities.
- Non-serializable values, `NaN`, and infinities.
- Invalid bounds, anchors, units, enum definitions, and schema records.

All failures throw:

```ts
new Error(`ICE3_INDUSTRIAL_MANIFEST_INVALID: ${detail}`);
```

Deep-freeze arrays, records, entity/type objects, relation metadata, and schemas before return.

- [ ] **Step 5: Add negative manifest tests**

Add table-driven cases:

```ts
it.each([
  ['missing entity type', (m) => { m.entities[0].typeId = 'missing'; }],
  ['missing parent', (m) => { m.entities[0].parentId = 'missing'; }],
  ['dangling relation', (m) => { m.relations[0].toEntityId = 'missing'; }],
  ['duplicate entity', (m) => { m.entities[1].id = m.entities[0].id; }],
  ['identity conflict', (m) => {
    m.entities[1].externalIds = [...m.entities[0].externalIds];
  }],
])('rejects %s', (_name, mutate) => {
  const manifest = manifestFixture();
  mutate(manifest);
  expect(() => parseIndustrialManifest(manifest))
    .toThrow(/ICE3_INDUSTRIAL_MANIFEST_INVALID/);
});
```

- [ ] **Step 6: Run focused tests, typecheck, and full suite**

```bash
npm test -- tests/core/Manifest.test.ts
npm run typecheck
npm test
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add .
git commit -m "feat(core): scaffold industrial semantic manifests"
```

---

### Task 2: Build Entity, Type, and External Identity Registries

**Files:**
- Create: `ice3-industrial/packages/industrial-core/src/registry/ICEIndustrialTypeRegistry.ts`
- Create: `ice3-industrial/packages/industrial-core/src/registry/ICEIndustrialEntityRegistry.ts`
- Modify: `ice3-industrial/packages/industrial-core/src/index.ts`
- Test: `ice3-industrial/tests/core/Registries.test.ts`

**Interfaces:**

```ts
class ICEIndustrialTypeRegistry {
  constructor(types: readonly ICEIndustrialEntityType[]);
  get(id: string): ICEIndustrialEntityType | undefined;
  require(id: string): ICEIndustrialEntityType;
  list(): readonly ICEIndustrialEntityType[];
}

class ICEIndustrialEntityRegistry {
  constructor(
    entities: readonly ICEIndustrialEntity[],
    types: ICEIndustrialTypeRegistry,
  );
  get(id: string): ICEIndustrialEntity | undefined;
  require(id: string): ICEIndustrialEntity;
  findByExternalId(
    scheme: string,
    value: string,
    scope?: string,
  ): ICEIndustrialEntity | undefined;
  byType(typeId: string): readonly ICEIndustrialEntity[];
  children(parentId: string): readonly ICEIndustrialEntity[];
  list(): readonly ICEIndustrialEntity[];
}
```

- Consumes: validated manifest entities and types.
- Produces: O(1) primary/type/external indexes and stable sorted lists.

- [ ] **Step 1: Write failing registry tests**

```ts
const types = new ICEIndustrialTypeRegistry(manifest.entityTypes);
const entities = new ICEIndustrialEntityRegistry(manifest.entities, types);

expect(entities.require('pump-01').displayName).toBe('Pump 01');
expect(entities.findByExternalId('aas', 'urn:asset:pump-01')?.id)
  .toBe('pump-01');
expect(entities.byType('pump').map((entity) => entity.id))
  .toEqual(['pump-01']);
expect(entities.children('plant-01').map((entity) => entity.id))
  .toEqual(['pump-01', 'valve-01']);
expect(() => entities.require('missing'))
  .toThrow(/ICE3_INDUSTRIAL_UNKNOWN_ENTITY/);
```

- [ ] **Step 2: Verify RED**

```bash
npm test -- tests/core/Registries.test.ts
```

Expected: FAIL because classes do not exist.

- [ ] **Step 3: Implement immutable indexes**

Build maps once in constructors; do not rescan arrays for lookups. Return frozen list snapshots sorted by ID. `require()` errors use:

```text
ICE3_INDUSTRIAL_UNKNOWN_TYPE
ICE3_INDUSTRIAL_UNKNOWN_ENTITY
```

- [ ] **Step 4: Add conflict and ordering tests**

Verify duplicate IDs and external identity conflicts throw during construction even if the caller bypassed manifest parsing. Verify insertion order does not affect list ordering.

- [ ] **Step 5: Run focused tests, typecheck, and full suite**

```bash
npm test -- tests/core/Registries.test.ts
npm run typecheck
npm test
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/industrial-core/src/registry packages/industrial-core/src/index.ts tests/core/Registries.test.ts
git commit -m "feat(core): index industrial entities and identities"
```

---

### Task 3: Add Relation Traversal and Entity Queries

**Files:**
- Create: `ice3-industrial/packages/industrial-core/src/relation/ICEIndustrialRelationGraph.ts`
- Create: `ice3-industrial/packages/industrial-core/src/query/ICEIndustrialQuery.ts`
- Modify: `ice3-industrial/packages/industrial-core/src/index.ts`
- Test: `ice3-industrial/tests/core/Relations.test.ts`
- Test: `ice3-industrial/tests/core/Queries.test.ts`

**Interfaces:**

```ts
interface ICEIndustrialRelationQuery {
  readonly direction?: 'outgoing' | 'incoming' | 'both';
  readonly types?: readonly string[];
  readonly maxDepth?: number;
}

interface ICEIndustrialEntityQuery {
  readonly ids?: readonly string[];
  readonly typeIds?: readonly string[];
  readonly parentIds?: readonly string[];
  readonly externalIds?: readonly ICEIndustrialExternalId[];
  readonly propertyFilters?: readonly {
    readonly propertyId: string;
    readonly equals?: ICEIndustrialValue;
    readonly quality?: 'good' | 'uncertain' | 'bad';
  }[];
}

class ICEIndustrialRelationGraph {
  constructor(relations: readonly ICEIndustrialRelation[]);
  related(
    entityId: string,
    query?: ICEIndustrialRelationQuery,
  ): readonly ICEIndustrialRelation[];
  reachable(
    entityId: string,
    query?: ICEIndustrialRelationQuery,
  ): readonly string[];
}

class ICEIndustrialQuery {
  constructor(
    entities: ICEIndustrialEntityRegistry,
    relations: ICEIndustrialRelationGraph,
    getState: (
      entityId: string,
      propertyId: string,
    ) => ICEIndustrialPropertyValue | undefined,
  );
  queryEntities(
    query?: ICEIndustrialEntityQuery,
  ): readonly ICEIndustrialEntity[];
}
```

- Consumes: relation/entity registries and state lookup.
- Produces: deterministic relation traversal and query filtering.

- [ ] **Step 1: Write failing relation tests**

```ts
expect(graph.related('pump-01').map((relation) => relation.id))
  .toEqual(['rel-pump-valve']);
expect(graph.related('valve-01', { direction: 'incoming' })
  .map((relation) => relation.id)).toEqual(['rel-pump-valve']);
expect(graph.reachable('pump-01', {
  direction: 'both',
  maxDepth: 2,
})).toEqual(['pump-01', 'valve-01']);
```

- [ ] **Step 2: Verify RED**

```bash
npm test -- tests/core/Relations.test.ts
```

Expected: FAIL because the graph does not exist.

- [ ] **Step 3: Implement bounded graph traversal**

Maintain outgoing/incoming indexes. Deduplicate relations by ID. Traversal keeps a visited set, rejects negative/non-integer depth, and returns stable ID-sorted results.

- [ ] **Step 4: Write failing query tests**

```ts
expect(query.queryEntities({
  typeIds: ['pump'],
  propertyFilters: [{
    propertyId: 'running',
    equals: true,
    quality: 'good',
  }],
})).toEqual(['pump-01']);
```

Cover no query, ID/type/parent filters, external identity, property quality, unknown properties, and deterministic sorting.

- [ ] **Step 5: Verify query RED**

```bash
npm test -- tests/core/Queries.test.ts
```

Expected: FAIL because query filtering is absent.

- [ ] **Step 6: Implement deterministic query filtering**

The query layer uses registry indexes and only reads state through a supplied lookup callback. Unknown property filters throw `ICE3_INDUSTRIAL_UNKNOWN_PROPERTY`.

- [ ] **Step 7: Run focused tests, typecheck, and full suite**

```bash
npm test -- tests/core/Relations.test.ts tests/core/Queries.test.ts
npm run typecheck
npm test
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add packages/industrial-core/src/relation packages/industrial-core/src/query packages/industrial-core/src/index.ts tests/core/Relations.test.ts tests/core/Queries.test.ts
git commit -m "feat(core): traverse relations and query entities"
```

---

### Task 4: Implement Transactional State Updates and Coalesced Notifications

**Files:**
- Create: `ice3-industrial/packages/industrial-core/src/state/ICEIndustrialStateStore.ts`
- Modify: `ice3-industrial/packages/industrial-core/src/index.ts`
- Test: `ice3-industrial/tests/core/StateStore.test.ts`

**Interfaces:**

```ts
interface ICEIndustrialPropertyValue {
  readonly entityId: string;
  readonly propertyId: string;
  readonly value: ICEIndustrialValue;
  readonly quality: 'good' | 'uncertain' | 'bad';
  readonly sourceTimestamp?: number;
  readonly serverTimestamp?: number;
  readonly source?: string;
}

interface ICEIndustrialStatePatch {
  readonly entityId: string;
  readonly propertyId: string;
  readonly value: ICEIndustrialValue;
  readonly quality: 'good' | 'uncertain' | 'bad';
  readonly sourceTimestamp?: number;
  readonly serverTimestamp?: number;
  readonly source?: string;
}

interface ICEIndustrialStateChange {
  readonly current: ICEIndustrialPropertyValue;
  readonly previous?: ICEIndustrialPropertyValue;
}

class ICEIndustrialStateStore {
  constructor(
    entities: ICEIndustrialEntityRegistry,
    types: ICEIndustrialTypeRegistry,
    schedule?: (callback: () => void) => void,
  );
  get(entityId: string, propertyId: string): ICEIndustrialPropertyValue | undefined;
  snapshot(): ReadonlyMap<string, ICEIndustrialPropertyValue>;
  update(patches: readonly ICEIndustrialStatePatch[]): void;
  subscribe(
    listener: (changes: readonly ICEIndustrialStateChange[]) => void,
  ): () => void;
  flush(): void;
}

class ICEIndustrialEventStore {
  constructor(options?: {
    readonly historyLimit?: number;
  });
  insert(input: ICEIndustrialEventInput): ICEIndustrialEvent;
  list(): readonly ICEIndustrialEvent[];
  subscribe(listener: (event: ICEIndustrialEvent) => void): () => void;
  clear(): void;
  dispose(): void;
}

class ICEIndustrialOperationRegistry {
  register(
    entityId: string,
    operationId: string,
    handler: ICEIndustrialOperationHandler,
  ): () => void;
  execute(
    entityId: string,
    operationId: string,
    input?: Readonly<Record<string, ICEIndustrialValue>>,
    context?: Partial<ICEIndustrialOperationContext>,
  ): Promise<Readonly<Record<string, ICEIndustrialValue>> | void>;
}
```

- Consumes: validated patches from UI, adapters, or tests.
- Produces: latest-wins transactional state and one coalesced notification.

- [ ] **Step 1: Write failing state tests**

```ts
const scheduled: Array<() => void> = [];
const store = new ICEIndustrialStateStore(entities, types, (callback) => {
  scheduled.push(callback);
});
const changes: readonly ICEIndustrialStateChange[][] = [];
store.subscribe((next) => changes.push(next));

store.update([patch({ propertyId: 'running', value: true, sourceTimestamp: 10 })]);
store.update([patch({ propertyId: 'running', value: false, sourceTimestamp: 20 })]);
expect(store.get('pump-01', 'running')?.value).toBe(false);
expect(changes).toHaveLength(0);
scheduled.shift()!();
expect(changes).toHaveLength(1);
expect(changes[0]).toHaveLength(1);
```

- [ ] **Step 2: Verify RED**

```bash
npm test -- tests/core/StateStore.test.ts
```

Expected: FAIL because the state store does not exist.

- [ ] **Step 3: Implement transactional validation**

Before applying, validate:

- Entity and property exist.
- Property is readable.
- Runtime value matches the declared data type and enum list.
- Quality, timestamps, and source are valid.

If any patch is invalid, apply none and throw `ICE3_INDUSTRIAL_STATE_INVALID`.

- [ ] **Step 4: Implement latest-wins ordering**

Track per-property source versions:

- Higher `sourceTimestamp` wins.
- Equal timestamp uses later arrival only if source is equal; otherwise reject as stale.
- Missing timestamps use arrival order.
- Stale patches are ignored and counted by a public diagnostic snapshot.

Notifications are merged by `entityId/propertyId`, scheduled once, and delivered in stable key order.

- [ ] **Step 5: Add stale, quality, unknown, and type tests**

Cover:

- Older timestamp does not overwrite.
- Equal timestamp from another source is stale.
- Invalid type rejects the entire batch.
- Unknown entity/property rejects.
- Bad quality remains queryable.
- Unsubscribe stops delivery.
- `dispose()` clears subscriptions and rejects later update.

- [ ] **Step 6: Run focused tests, typecheck, and full suite**

```bash
npm test -- tests/core/StateStore.test.ts
npm run typecheck
npm test
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/industrial-core/src/state packages/industrial-core/src/index.ts tests/core/StateStore.test.ts
git commit -m "feat(core): batch industrial state updates"
```

---

### Task 5: Add Event Ordering and Operation Registration

**Files:**
- Create: `ice3-industrial/packages/industrial-core/src/event/ICEIndustrialEventStore.ts`
- Create: `ice3-industrial/packages/industrial-core/src/operation/ICEIndustrialOperationRegistry.ts`
- Modify: `ice3-industrial/packages/industrial-core/src/index.ts`
- Test: `ice3-industrial/tests/core/Events.test.ts`
- Test: `ice3-industrial/tests/core/Operations.test.ts`

**Interfaces:**

```ts
interface ICEIndustrialEventInput {
  readonly id?: string;
  readonly type: string;
  readonly entityId?: string;
  readonly severity: 'info' | 'warning' | 'error' | 'critical';
  readonly timestamp: number;
  readonly source?: string;
  readonly correlationId?: string;
  readonly payload?: Readonly<Record<string, ICEIndustrialValue>>;
}

interface ICEIndustrialOperationContext {
  readonly entityId: string;
  readonly actor?: string;
  readonly source: 'ui' | 'api' | 'automation';
  readonly signal?: AbortSignal;
}

type ICEIndustrialOperationHandler = (
  input: Readonly<Record<string, ICEIndustrialValue>>,
  context: ICEIndustrialOperationContext,
) => Promise<Readonly<Record<string, ICEIndustrialValue>> | void>;
```

- Consumes: normalized events and registered handlers.
- Produces: monotonic event sequence and validated operation execution.

- [ ] **Step 1: Write failing event tests**

```ts
const first = store.insert({
  type: 'ice:alarmRaised',
  entityId: 'pump-01',
  severity: 'warning',
  timestamp: 100,
});
const second = store.insert({
  type: 'ice:alarmCleared',
  entityId: 'pump-01',
  severity: 'info',
  timestamp: 101,
});

expect(first.sequence).toBe(1);
expect(second.sequence).toBe(2);
expect(store.list().map((event) => event.type))
  .toEqual(['ice:alarmRaised', 'ice:alarmCleared']);
```

- [ ] **Step 2: Verify event RED**

```bash
npm test -- tests/core/Events.test.ts
```

Expected: FAIL because event storage is absent.

- [ ] **Step 3: Implement event normalization**

Validate entity IDs, severity, timestamp, payload, and non-empty type. Generate an event ID when omitted. Maintain a monotonic sequence and bounded history supplied as a constructor option.

- [ ] **Step 4: Write failing operation tests**

```ts
registry.register('pump-01', 'ice:start', async () => ({ accepted: true }));

await expect(registry.execute('pump-01', 'ice:start', {}, {
  entityId: 'pump-01',
  source: 'api',
})).resolves.toEqual({ accepted: true });
```

- [ ] **Step 5: Verify operation RED**

```bash
npm test -- tests/core/Operations.test.ts
```

Expected: FAIL because operation registration is absent.

- [ ] **Step 6: Implement operation registration**

Require:

- Entity type declares the operation.
- Input satisfies the declared schema.
- Handler exists and is unique per entity/operation.
- `requiresConfirmation` is exposed as capability metadata. Confirmation,
  authorization, and audit happen in the caller before `execute()`.

Wrap handler failure as `ICE3_INDUSTRIAL_OPERATION_FAILED`; preserve `AbortError` as `ICE3_INDUSTRIAL_OPERATION_CANCELLED`.

- [ ] **Step 7: Run focused tests, typecheck, and full suite**

```bash
npm test -- tests/core/Events.test.ts tests/core/Operations.test.ts
npm run typecheck
npm test
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add packages/industrial-core/src/event packages/industrial-core/src/operation packages/industrial-core/src/index.ts tests/core/Events.test.ts tests/core/Operations.test.ts
git commit -m "feat(core): order events and register operations"
```

---

### Task 6: Build Workspace Context, Facade, and Serialization

**Files:**
- Create: `ice3-industrial/packages/industrial-core/src/workspace/ICEIndustrialWorkspaceContext.ts`
- Create: `ice3-industrial/packages/industrial-core/src/workspace/ICEIndustrialWorkspace.ts`
- Create: `ice3-industrial/packages/industrial-core/src/workspace/serializeIndustrialWorkspace.ts`
- Modify: `ice3-industrial/packages/industrial-core/src/index.ts`
- Test: `ice3-industrial/tests/core/Workspace.test.ts`
- Test: `ice3-industrial/tests/core/Serialization.test.ts`

**Interfaces:**

```ts
interface ICEIndustrialFilter {
  readonly id: string;
  readonly entityIds?: readonly string[];
  readonly typeIds?: readonly string[];
  readonly externalIds?: readonly ICEIndustrialExternalId[];
}

interface ICEIndustrialWorkspaceContext {
  readonly selection: readonly string[];
  readonly hiddenEntityIds: readonly string[];
  readonly isolatedEntityIds: readonly string[];
  readonly highlightedEntityIds: readonly string[];
  readonly filters: readonly ICEIndustrialFilter[];
  readonly timeRange?: {
    readonly start?: number;
    readonly end?: number;
  };
}

class ICEIndustrialWorkspace {
  constructor(options: {
    readonly manifest: ICEIndustrialWorkspaceManifest;
    readonly stateScheduler?: (callback: () => void) => void;
    readonly eventHistoryLimit?: number;
  });
  readonly context: ICEIndustrialWorkspaceContext;
  readonly entities: ICEIndustrialEntityRegistry;
  readonly types: ICEIndustrialTypeRegistry;
  readonly relations: ICEIndustrialRelationGraph;
  readonly state: ICEIndustrialStateStore;
  readonly events: ICEIndustrialEventStore;
  readonly operations: ICEIndustrialOperationRegistry;
  queryEntities(
    query?: ICEIndustrialEntityQuery,
  ): readonly ICEIndustrialEntity[];
  updateProperties(patches: readonly ICEIndustrialStatePatch[]): void;
  insertEvent(input: ICEIndustrialEventInput): ICEIndustrialEvent;
  setSelection(ids: readonly string[], options?: {
    readonly source?: string;
  }): void;
  setHidden(ids: readonly string[]): void;
  setIsolated(ids: readonly string[]): void;
  setHighlighted(ids: readonly string[]): void;
  setFilters(filters: readonly ICEIndustrialFilter[]): void;
  resetContext(): void;
  on(type: string, listener: (event: unknown) => void): () => void;
  dispose(): void;
}
```

- Consumes: Tasks 1-5.
- Produces: one public workspace facade with stable context events.

- [ ] **Step 1: Write failing workspace tests**

```ts
const workspace = new ICEIndustrialWorkspace({ manifest });
const contexts: readonly ICEIndustrialWorkspaceContext[] = [];
workspace.on('CONTEXT_CHANGE', (context) => contexts.push(
  context as ICEIndustrialWorkspaceContext,
));

workspace.setSelection(['pump-01'], { source: 'scene' });
expect(workspace.context.selection).toEqual(['pump-01']);
expect(contexts).toHaveLength(1);

workspace.setSelection(['pump-01'], { source: 'scene' });
expect(contexts).toHaveLength(1);
```

- [ ] **Step 2: Verify workspace RED**

```bash
npm test -- tests/core/Workspace.test.ts
```

Expected: FAIL because the facade does not exist.

- [ ] **Step 3: Implement immutable context updates**

Validate entity IDs, deduplicate and sort, emit only when context materially changes, and deep-freeze every emitted context. Exposures for registries, state, events, and operations are read-only.

- [ ] **Step 4: Write failing serialization tests**

```ts
const first = serializeIndustrialWorkspace(manifest);
const second = serializeIndustrialWorkspace(manifest);

expect(first).toBe(second);
expect(parseIndustrialManifest(JSON.parse(first))).toEqual(manifest);
```

Verify object-key insertion order does not affect output and that dynamic state/context are absent.

- [ ] **Step 5: Verify serialization RED**

```bash
npm test -- tests/core/Serialization.test.ts
```

Expected: FAIL because deterministic serialization is absent.

- [ ] **Step 6: Implement deterministic serialization**

Sort object keys recursively while preserving array order unless the manifest defines an order-independent collection; use the contract-defined stable collection order. Serialize with two-space indentation and a trailing newline.

- [ ] **Step 7: Run focused tests, typecheck, and full suite**

```bash
npm test -- tests/core/Workspace.test.ts tests/core/Serialization.test.ts
npm run typecheck
npm test
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add packages/industrial-core/src/workspace packages/industrial-core/src/index.ts tests/core/Workspace.test.ts tests/core/Serialization.test.ts
git commit -m "feat(core): expose industrial workspace context"
```

---

### Task 7: Add Native ICE JSON Adapters and Finalize Core Verification

**Files:**
- Create: `ice3-industrial/packages/industrial-core/src/adapter/ICEIndustrialAssetAdapter.ts`
- Create: `ice3-industrial/packages/industrial-core/src/adapter/ICEIndustrialAdapterRegistry.ts`
- Create: `ice3-industrial/packages/industrial-core/src/adapter/ICEJsonAdapter.ts`
- Create: `ice3-industrial/README.md`
- Modify: `ice3-industrial/packages/industrial-core/src/index.ts`
- Test: `ice3-industrial/tests/core/Adapters.test.ts`
- Test: `ice3-industrial/tests/core/Performance.test.ts`

**Interfaces:**

```ts
interface ICEIndustrialAssetAdapter {
  readonly id: string;
  import(
    source: Uint8Array | string,
    options?: Readonly<Record<string, unknown>>,
  ): Promise<ICEIndustrialWorkspaceManifest>;
  export(
    manifest: ICEIndustrialWorkspaceManifest,
    options?: Readonly<Record<string, unknown>>,
  ): Promise<Uint8Array | string>;
}

class ICEIndustrialAdapterRegistry {
  register(adapter: ICEIndustrialAssetAdapter): void;
  unregister(id: string): void;
  get(id: string): ICEIndustrialAssetAdapter | undefined;
  require(id: string): ICEIndustrialAssetAdapter;
}

const iceJsonAdapter: ICEIndustrialAssetAdapter;
```

- Consumes: Task 1 parser and Task 6 serializer.
- Produces: deterministic native import/export and adapter lifecycle.

- [ ] **Step 1: Write failing adapter tests**

```ts
const imported = await iceJsonAdapter.import(JSON.stringify(manifest));
expect(imported.workspaceId).toBe(manifest.workspaceId);

const exported = await iceJsonAdapter.export(manifest);
expect(await iceJsonAdapter.import(exported)).toEqual(manifest);
```

Verify duplicate adapter IDs, unknown adapter IDs, malformed import, and adapter failure diagnostics.

- [ ] **Step 2: Verify RED**

```bash
npm test -- tests/core/Adapters.test.ts
```

Expected: FAIL because adapters do not exist.

- [ ] **Step 3: Implement adapter registry and native adapter**

Use stable diagnostics:

- `ICE3_INDUSTRIAL_ADAPTER_FAILED`
- duplicate adapter IDs throw the same code with a specific detail.
- import/export never partially mutate a workspace.

- [ ] **Step 4: Add the large synthetic performance fixture**

Generate, entirely in memory:

- 10,000 entities across 20 types.
- 50,000 property definitions.
- 100,000 state patches.
- deterministic relationships with a bounded graph.

Test lookup, query, traversal, state coalescing, and serialization complete without excessive memory growth. Use a generous deterministic timeout suitable for CI; do not assert machine-specific milliseconds.

- [ ] **Step 5: Run complete core verification**

```bash
cd ../ice3-industrial
source ~/.nvm/nvm.sh && nvm use 24
npm run verify
npm pack --workspaces --dry-run --json
```

Expected:

- Architecture test proves zero core dependencies.
- All unit/integration tests pass.
- Package dry-run contains no assets, customer data, or logs.

- [ ] **Step 6: Audit naming and privacy**

Run:

```bash
git status --porcelain=v1
git ls-files '*.glb' '*.gltf' '*.bin' '*.png' '*.jpg'
git grep -I -n -i -E "$ICE3_FORBIDDEN_NAME_PATTERN" -- . || true
```

Set `ICE3_FORBIDDEN_NAME_PATTERN` from the approved local review list.
Expected: no generated assets and no prohibited names.

- [ ] **Step 7: Commit**

```bash
git add README.md packages/industrial-core/src/adapter packages/industrial-core/src/index.ts tests/core/Adapters.test.ts tests/core/Performance.test.ts
git commit -m "feat(core): add native industrial json adapters"
```
