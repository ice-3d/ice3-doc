# ICE3 Spatial Tileset Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a standards-based toolchain pipeline that partitions a large industrial model into independently loadable GLBs and a 3D Tiles 1.1 tileset, then load those partitions incrementally in the public ICE3 runtime and verify the result in the existing browser example.

**Architecture:** The toolchain analyzes mesh nodes as atomic semantic units, recursively partitions them by world-space bounds, emits a Prepared GLB per leaf, and writes an explicit 3D Tiles 1.1 tree. A minimal public Tileset runtime loader validates the supported standard subset, schedules partition downloads with bounded concurrency, and commits each completed scene fragment atomically.

**Tech Stack:** TypeScript 7, Node.js 24 LTS, npm workspaces, Node.js test runner, Playwright, Webpack, glTF 2.0, OGC 3D Tiles 1.1, Ajv with the official 3D Tiles JSON Schema bundle.

**Spec:** `ice3-doc/docs/superpowers/specs/2026-10-27-spatial-tileset-pipeline-design.md`

## Global Constraints

- Use Node.js 24 LTS from each repository's `.nvmrc`.
- Develop on a feature branch; merge to `main` only after the full repository verification passes.
- Every behavioral change follows RED-GREEN-REFACTOR and commits after a green focused test.
- Do not use competitor, vendor, or third-party product names in code, identifiers, comments, documentation, tests, screenshots, fixtures, diagnostics, or commit messages.
- Do not use the general-purpose rendering library brand word or its case, truncation, and concatenation variants in product artifacts.
- Do not stage, commit, package, log, screenshot, or otherwise expose a real customer model or any derived GLB, report, thumbnail, or preview.
- Tests and committed demo assets must be synthetic or explicitly distributable.
- The distribution index is OGC 3D Tiles 1.1; tile content is glTF 2.0 inside ICE3 Prepared GLB Profile v1.
- Default partition limits are 500,000 triangles and 33,554,432 bytes per leaf.
- Version 1 supports explicit children, local Cartesian `box` or `sphere`, external Prepared GLB content, finite 4x4 transforms, and `REPLACE` refinement only.
- Version 1 does not split one mesh, generate LOD, support `region`, external tilesets, implicit tiling, textures, animation, or dynamic unload.
- `--output` must not exist before a partition command starts.
- Partition outputs are published by one atomic directory rename; a failed build leaves no final directory.
- Runtime dependencies may not be added without a separate design decision; test-only dependencies must be declared and justified in the commit.
- Unless a command starts with `git -C`, run it from the repository root named by the task's file paths.

## Review Focus

- A mesh referenced by several nodes must remain in one atomic group, or its geometry may be duplicated or its equipment identity may become ambiguous.
- Bounds with identical centers or zero extent on the chosen split axis must terminate deterministically instead of recursing forever.
- A failed partition build or report write must leave the requested output path absent and must not expose a partially useful Tileset.
- `content.uri` values that are absolute, traverse outside the Tileset directory, or point to unsupported content must be rejected before any fetch occurs.
- When one tile fails after other tiles have loaded, completed partitions must remain interactive, the failure count must be visible, and disposal must clean up every completed fragment.

---

### Execution Setup

- [ ] Create `feature/spatial-tileset-pipeline` in `ice3-toolchain` and
  `ice3-engine`; this plan document already lives on that branch in `ice3-doc`.

```bash
git -C ../ice3-toolchain \
  switch -c feature/spatial-tileset-pipeline
git -C ../ice3-engine \
  switch -c feature/spatial-tileset-pipeline
```

- [ ] Confirm all repositories start clean:

```bash
git -C ../ice3-doc status --short
git -C ../ice3-toolchain status --short
git -C ../ice3-engine status --short
```

Expected: no tracked or untracked non-ignored files after this plan is committed.

### Task 1: Contract and Deterministic Partition Analyzer

**Files:**
- Modify: `ice3-doc/docs/contracts/asset-preparation-contract-v1.md`
- Create: `ice3-toolchain/packages/toolchain-core/src/partition/types.ts`
- Create: `ice3-toolchain/packages/toolchain-core/src/partition/analyzePartitionUnits.ts`
- Create: `ice3-toolchain/tests/partition/createPartitionSource.ts`
- Create: `ice3-toolchain/tests/fixtures/writePartitionGLTF.mjs`
- Create: `ice3-toolchain/tests/partition/analyzePartitionUnits.test.ts`
- Modify: `ice3-toolchain/packages/toolchain-core/src/index.ts`

**Interfaces:**
- Consumes: `ICESourceDocument`, `readAccessor`, `bakeLocalMatrix`, `ICEMatrix4Tuple`.
- Produces:

```ts
export interface ICEBounds {
  readonly min: readonly [number, number, number];
  readonly max: readonly [number, number, number];
}

export interface ICEPartitionUnit {
  readonly nodeIndices: readonly number[];
  readonly meshIndices: readonly number[];
  readonly bounds: ICEBounds;
  readonly triangleCount: number;
}

export interface ICEPartitionAnalysis {
  readonly bounds: ICEBounds;
  readonly triangleCount: number;
  readonly units: readonly ICEPartitionUnit[];
}

export function analyzePartitionUnits(
  source: ICESourceDocument,
): ICEPartitionAnalysis;
```

- [ ] **Step 1: Add the cross-repository contract text**

Append a section to the canonical asset contract defining:

```markdown
## 18. Tileset distribution and partition diagnostics

- Distribution index: OGC 3D Tiles 1.1 `tileset.json`.
- Contents: ICE3 Prepared GLB Profile v1 files.
- Supported v1 subset: explicit `children`, local Cartesian `box` or `sphere`,
  relative `content.uri`, finite 4x4 `transform`, and `REPLACE` refinement.
- Unsupported v1 features: `region`, external tilesets, `implicitTiling`,
  non-Prepared GLB contents, and undeclared required extensions.
- Partition output is published atomically as a directory.
- ICE3-owned tile metadata lives under standard `extras.ice3`.
- Tool diagnostics are `ICE3_TOOL_PARTITION_OPTIONS_INVALID`,
  `ICE3_TOOL_PARTITION_EMPTY`, `ICE3_TOOL_PARTITION_UNSPLITTABLE`,
  `ICE3_TOOL_PARTITION_OUTPUT_EXISTS`,
  `ICE3_TOOL_TILESET_INVALID`, and `ICE3_TOOL_TILESET_WRITE_FAILED`.
- Runtime diagnostics are `ICE3_TILESET_INVALID`, `ICE3_TILESET_UNSUPPORTED`,
  `ICE3_TILESET_TILE_FAILED`, `ICE3_TILESET_DUPLICATE_ID`, and
  `ICE3_TILESET_ABORTED`.
```

Commit only this canonical contract update:

```bash
git -C ../ice3-doc \
  add docs/contracts/asset-preparation-contract-v1.md
git -C ../ice3-doc \
  commit -m "docs: define tileset distribution contract"
```

- [ ] **Step 2: Create the synthetic source helper**

The helper must return a 3D document with four separate triangle
meshes and nodes translated along x:

```ts
import type { ICESourceDocument } from '../../packages/toolchain-core/src/index.js';

export function createPartitionSource(
  sharedMesh = false,
): ICESourceDocument {
  const positions = new Float32Array([
    0, 0, 0,
    1, 0, 0,
    0, 1, 0,
  ]);
  const indices = new Uint16Array([0, 1, 2]);
  const binary = new Uint8Array(42);
  binary.set(new Uint8Array(positions.buffer), 0);
  binary.set(new Uint8Array(indices.buffer), 36);
  const nodeCount = 4;

  return {
    baseDirectory: '.',
    buffers: [binary],
    json: {
      asset: { version: '2.0' },
      scene: 0,
      scenes: [{ nodes: [0, 1, 2, 3] }],
      nodes: Array.from({ length: nodeCount }, (_, index) => ({
        name: `equipment-${index}`,
        mesh: sharedMesh ? 0 : index,
        translation: [index * 10, 0, 0],
      })),
      meshes: Array.from(
        { length: sharedMesh ? 1 : nodeCount },
        () => ({
          primitives: [{
            attributes: { POSITION: 0 },
            indices: 1,
            material: 0,
            mode: 4,
          }],
        }),
      ),
      materials: [{
        name: 'steel',
        pbrMetallicRoughness: {
          baseColorFactor: [0.2, 0.5, 0.9, 1],
        },
      }],
      buffers: [{ byteLength: 42 }],
      bufferViews: [
        { buffer: 0, byteOffset: 0, byteLength: 36 },
        { buffer: 0, byteOffset: 36, byteLength: 6 },
      ],
      accessors: [
        {
          bufferView: 0,
          componentType: 5126,
          count: 3,
          type: 'VEC3',
          min: [0, 0, 0],
          max: [1, 1, 0],
        },
        {
          bufferView: 1,
          componentType: 5123,
          count: 3,
          type: 'SCALAR',
        },
      ],
    },
  };
}
```

Create the standalone fixture writer with:

```js
import { writeFileSync } from 'node:fs';

const positions = new Float32Array([
  0, 0, 0,
  1, 0, 0,
  0, 1, 0,
]);
const indices = new Uint16Array([0, 1, 2]);
const binary = Buffer.alloc(42);
Buffer.from(positions.buffer).copy(binary, 0);
Buffer.from(indices.buffer).copy(binary, 36);
const document = {
  asset: { version: '2.0' },
  scene: 0,
  scenes: [{ nodes: [0, 1, 2, 3] }],
  nodes: [0, 1, 2, 3].map((index) => ({
    name: `equipment-${index}`,
    mesh: index,
    translation: [index * 10, 0, 0],
  })),
  meshes: [0, 1, 2, 3].map(() => ({
    primitives: [{
      attributes: { POSITION: 0 },
      indices: 1,
      material: 0,
      mode: 4,
    }],
  })),
  materials: [{
    name: 'steel',
    pbrMetallicRoughness: { baseColorFactor: [0.2, 0.5, 0.9, 1] },
  }],
  buffers: [{
    byteLength: 42,
    uri: `data:application/octet-stream;base64,${
      binary.toString('base64')
    }`,
  }],
  bufferViews: [
    { buffer: 0, byteOffset: 0, byteLength: 36 },
    { buffer: 0, byteOffset: 36, byteLength: 6 },
  ],
  accessors: [
    {
      bufferView: 0,
      componentType: 5126,
      count: 3,
      type: 'VEC3',
      min: [0, 0, 0],
      max: [1, 1, 0],
    },
    {
      bufferView: 1,
      componentType: 5123,
      count: 3,
      type: 'SCALAR',
    },
  ],
};
if (!process.argv[2]) throw new Error('output path is required');
writeFileSync(process.argv[2], JSON.stringify(document, null, 2));
```

- [ ] **Step 3: Write the failing analyzer tests**

Create `analyzePartitionUnits.test.ts`:

```ts
import { test } from 'node:test';
import { expect } from 'expect';
import { analyzePartitionUnits } from '../../packages/toolchain-core/src/partition/analyzePartitionUnits.js';
import { createPartitionSource } from './createPartitionSource.js';

test('creates one spatial unit per mesh node and computes world bounds', () => {
  const analysis = analyzePartitionUnits(createPartitionSource());

  expect(analysis.units).toHaveLength(4);
  expect(analysis.triangleCount).toBe(4);
  expect(analysis.units.map((unit) => unit.nodeIndices)).toEqual([
    [0], [1], [2], [3],
  ]);
  expect(analysis.units[2]!.bounds.min).toEqual([20, 0, 0]);
  expect(analysis.units[2]!.bounds.max).toEqual([21, 1, 0]);
  expect(analysis.bounds).toEqual({
    min: [0, 0, 0],
    max: [31, 1, 0],
  });
});

test('keeps all nodes sharing one mesh in one atomic unit', () => {
  const analysis = analyzePartitionUnits(createPartitionSource(true));

  expect(analysis.units).toHaveLength(1);
  expect(analysis.units[0]!.nodeIndices).toEqual([0, 1, 2, 3]);
  expect(analysis.units[0]!.meshIndices).toEqual([0]);
  expect(analysis.units[0]!.bounds).toEqual({
    min: [0, 0, 0],
    max: [31, 1, 0],
  });
});
```

- [ ] **Step 4: Run the analyzer tests and confirm RED**

Run:

```bash
nvm use
npm test -- tests/partition/analyzePartitionUnits.test.ts
```

Expected: FAIL because `analyzePartitionUnits.ts` does not exist.

- [ ] **Step 5: Implement world matrices, bounds, and atomic grouping**

In `analyzePartitionUnits.ts`:

1. Traverse the active scene roots and build a `worldMatrices: ICEMatrix4Tuple[]`.
2. Use `bakeLocalMatrix` for each local node matrix.
3. Multiply parent and local matrices in glTF column-major order.
4. Build `meshToNodes: Map<number, number[]>`.
5. For each referenced source mesh, read triangle primitive accessors and calculate triangle count from `accessor.count`.
6. Transform all eight corners of each `POSITION` accessor bounds.
7. Union the transformed bounds of every node that references that mesh.
8. Sort unit node and mesh index arrays numerically.
9. Sort units by first node index.
10. Throw `ICE3_TOOL_PARTITION_EMPTY` when the active scene has no mesh nodes.

Export the module from `packages/toolchain-core/src/index.ts`.

- [ ] **Step 6: Run the focused test and the toolchain unit suite**

```bash
npm test -- tests/partition/analyzePartitionUnits.test.ts
npm test
```

Expected: focused test passes and the existing 107 tests remain green.

- [ ] **Step 7: Commit**

```bash
git add packages/toolchain-core/src/partition \
  packages/toolchain-core/src/index.ts \
  tests/partition tests/fixtures/writePartitionGLTF.mjs
git commit -m "feat(toolchain): analyze spatial partition units"
```

---

### Task 2: Deterministic Longest-Axis Partition Planner

**Files:**
- Create: `ice3-toolchain/packages/toolchain-core/src/partition/createPartitionPlan.ts`
- Create: `ice3-toolchain/tests/partition/createPartitionPlan.test.ts`
- Modify: `ice3-toolchain/packages/toolchain-core/src/partition/types.ts`
- Modify: `ice3-toolchain/packages/toolchain-core/src/index.ts`

**Interfaces:**
- Consumes: `ICEPartitionUnit[]` and the positive `maxTriangles` budget.
- Produces:

```ts
export interface ICEPartitionPlanNode {
  readonly bounds: ICEBounds;
  readonly triangleCount: number;
  readonly units: readonly ICEPartitionUnit[];
  readonly children: readonly ICEPartitionPlanNode[];
}

export function createPartitionPlan(
  units: readonly ICEPartitionUnit[],
  maxTriangles: number,
): ICEPartitionPlanNode;
```

- [ ] **Step 1: Write failing planner tests**

```ts
import { test } from 'node:test';
import { expect } from 'expect';
import { analyzePartitionUnits } from '../../packages/toolchain-core/src/partition/analyzePartitionUnits.js';
import { createPartitionPlan } from '../../packages/toolchain-core/src/partition/createPartitionPlan.js';
import { createPartitionSource } from './createPartitionSource.js';

const leaves = (node: ReturnType<typeof createPartitionPlan>) =>
  node.children.length === 0
    ? [node]
    : node.children.flatMap(leaves);

test('splits along the longest axis without exceeding the triangle budget', () => {
  const analysis = analyzePartitionUnits(createPartitionSource());
  const plan = createPartitionPlan(analysis.units, 3);

  expect(plan.triangleCount).toBe(4);
  expect(leaves(plan).map((leaf) => leaf.units.length)).toEqual([2, 2]);
  expect(leaves(plan).map((leaf) => leaf.triangleCount)).toEqual([2, 2]);
});

test('produces the same tree when input order changes', () => {
  const analysis = analyzePartitionUnits(createPartitionSource());
  const first = createPartitionPlan(analysis.units, 2);
  const second = createPartitionPlan([...analysis.units].reverse(), 2);

  expect(JSON.stringify(second)).toBe(JSON.stringify(first));
});

test('stops at one indivisible unit when centers coincide', () => {
  const source = createPartitionSource();
  const analysis = analyzePartitionUnits(source);
  const coincident = analysis.units.map((unit) => ({
    ...unit,
    bounds: { min: [0, 0, 0] as const, max: [0, 0, 0] as const },
  }));
  const plan = createPartitionPlan(coincident, 1);

  expect(leaves(plan)).toHaveLength(4);
  expect(leaves(plan).every((leaf) => leaf.units.length === 1)).toBe(true);
});
```

- [ ] **Step 2: Run the tests and confirm RED**

```bash
npm test -- tests/partition/createPartitionPlan.test.ts
```

Expected: FAIL because `createPartitionPlan.ts` does not exist.

- [ ] **Step 3: Implement the recursive planner**

Implement:

1. Reject non-positive or non-finite `maxTriangles` with `ICE3_TOOL_PARTITION_OPTIONS_INVALID`.
2. Throw `ICE3_TOOL_PARTITION_EMPTY` for an empty unit list.
3. Compute union bounds and total triangles.
4. Return a leaf when triangle count is within budget or only one unit remains.
5. Choose the longest center extent axis; tie-break x, then y, then z.
6. Sort by center on that axis, then first node index.
7. Choose the first split where cumulative triangle count is at least half the total, clamped to `1..length - 1`.
8. Recurse on both groups.
9. Store empty `children` on leaves and the full input units on groups.

- [ ] **Step 4: Verify GREEN**

```bash
npm test -- tests/partition/createPartitionPlan.test.ts
npm test
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add packages/toolchain-core/src/partition \
  packages/toolchain-core/src/index.ts \
  tests/partition/createPartitionPlan.test.ts
git commit -m "feat(toolchain): plan deterministic spatial partitions"
```

---

### Task 3: Build Independent Prepared GLB Fragments

**Files:**
- Create: `ice3-toolchain/packages/toolchain-core/src/scene/nodeMatrices.ts`
- Modify: `ice3-toolchain/packages/toolchain-core/src/output/buildPreparedGLB.ts`
- Create: `ice3-toolchain/tests/output/buildPreparedGLBFragment.test.ts`
- Modify: `ice3-toolchain/packages/toolchain-core/src/index.ts`

**Interfaces:**
- Consumes:

```ts
export interface ICEBuildSelection {
  readonly nodeIndices: readonly number[];
  readonly flattenWorldTransforms: boolean;
}
```

- Adds `readonly selection?: ICEBuildSelection` to `ICEBuildOptions`.
- Produces one valid `ICEPreparedGLB` whose node IDs still use the source node index:
  `${assetId}/node/${sourceNodeIndex}`.

- [ ] **Step 1: Write the failing fragment test**

```ts
import { test } from 'node:test';
import { expect } from 'expect';
import { buildPreparedGLB } from '../../packages/toolchain-core/src/output/buildPreparedGLB.js';
import { validatePreparedGLB } from '../../packages/toolchain-core/src/output/validatePreparedGLB.js';
import { createPartitionSource } from '../partition/createPartitionSource.js';

const readJson = (bytes: Uint8Array): Record<string, unknown> => {
  const buffer = Buffer.from(bytes);
  const jsonLength = buffer.readUInt32LE(12);
  return JSON.parse(
    buffer.subarray(20, 20 + jsonLength).toString('utf8').replace(/ +$/g, ''),
  ) as Record<string, unknown>;
};

test('builds one selected node with a baked world transform and stable ID', () => {
  const built = buildPreparedGLB(createPartitionSource(), {
    assetId: 'partition-demo',
    selection: {
      nodeIndices: [2],
      flattenWorldTransforms: true,
    },
  });
  const json = readJson(built.bytes);
  const nodes = json.nodes as Array<Record<string, unknown>>;
  const extras = nodes[0]!.extras as { ice3: { id: string } };

  expect(validatePreparedGLB(built.bytes).errors).toEqual([]);
  expect(built.stats.nodeCount).toBe(1);
  expect(built.stats.triangleCount).toBe(1);
  expect(extras.ice3.id).toBe('partition-demo/node/2');
  expect(nodes[0]!.matrix).toEqual([
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    20, 0, 0, 1,
  ]);
  expect(json.scenes).toEqual([{ nodes: [0] }]);
});
```

- [ ] **Step 2: Run RED**

```bash
npm test -- tests/output/buildPreparedGLBFragment.test.ts
```

Expected: TypeScript/test failure because `ICEBuildOptions.selection` does not
exist and all source nodes are still emitted.

- [ ] **Step 3: Extract shared node-matrix helpers**

Create `nodeMatrices.ts` with:

```ts
export function multiplyMatrices(
  parent: ICEMatrix4Tuple,
  local: ICEMatrix4Tuple,
): ICEMatrix4Tuple;

export function collectNodeWorldMatrices(
  source: ICESourceDocument,
): readonly ICEMatrix4Tuple[];

export function transformBounds(
  bounds: ICEBounds,
  matrix: ICEMatrix4Tuple,
): ICEBounds;
```

Implement column-major multiplication matching the engine math convention and
transform all eight AABB corners. Move equivalent private helpers out of
`buildPreparedGLB.ts`.

- [ ] **Step 4: Implement filtered fragment packing**

In `buildPreparedGLB.ts`:

1. Validate and deduplicate selected node indices.
2. If no selection is supplied, preserve all current behavior.
3. When selection is supplied, include exactly those nodes.
4. When `flattenWorldTransforms` is true, emit each selected node as a scene root
   with its collected world matrix and no `children`.
5. Skip meshes that have no selected owner.
6. Remap source mesh indices to packed mesh indices before writing nodes.
7. Keep `extras.ice3.id` based on the original source node index.
8. Compute bounds from the selected mesh instances.
9. Compute `maxNodeDepth` as `0` for flattened selections.
10. Preserve all existing unselected build behavior and snapshots.

- [ ] **Step 5: Verify GREEN**

```bash
npm test -- tests/output/buildPreparedGLBFragment.test.ts
npm test
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add packages/toolchain-core/src/scene/nodeMatrices.ts \
  packages/toolchain-core/src/output/buildPreparedGLB.ts \
  packages/toolchain-core/src/index.ts \
  tests/output/buildPreparedGLBFragment.test.ts
git commit -m "feat(toolchain): build prepared GLB fragments"
```

---

### Task 4: Write and Validate the 3D Tiles 1.1 Tree

**Files:**
- Create: `ice3-toolchain/packages/toolchain-core/src/partition/tileset.ts`
- Create: `ice3-toolchain/tests/partition/tileset.test.ts`
- Create: `ice3-toolchain/tests/fixtures/3d-tiles-1.1-schema/` using the official
  OGC 3D Tiles 1.1 JSON Schema bundle
- Modify: `ice3-toolchain/package.json`
- Modify: `ice3-toolchain/packages/toolchain-core/src/index.ts`

**Interfaces:**
- Consumes: partition bounds and finished part descriptors.
- Produces:

```ts
export interface ICEFinishedTile {
  readonly bounds: ICEBounds;
  readonly contentUri: string;
  readonly partitionId: string;
  readonly children: readonly ICEFinishedTile[];
}

export interface ICETilesetDocument {
  readonly asset: {
    readonly version: '1.1';
    readonly extras: {
      readonly ice3: {
        readonly assetId: string;
        readonly contractVersion: '1.0';
      };
    };
  };
  readonly geometricError: number;
  readonly root: Readonly<Record<string, unknown>>;
}

export function createTilesetDocument(
  assetId: string,
  root: ICEFinishedTile,
): ICETilesetDocument;
```

- [ ] **Step 1: Add test-only schema validation dependencies**

Run:

```bash
npm install --save-dev ajv@8.20.0 ajv-formats@3.0.1
```

Extract the complete JSON Schema Annex B from the official specification at
`https://docs.ogc.org/cs/22-025r4/22-025r4.html` into
`tests/fixtures/3d-tiles-1.1-schema/`. Preserve the OGC source notice and
specification revision in `SOURCE.md`. Do not add a vendor-branded validator
package.

- [ ] **Step 2: Write failing tree tests**

```ts
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { test } from 'node:test';
import { expect } from 'expect';
import {
  createTilesetDocument,
  type ICEFinishedTile,
} from '../../packages/toolchain-core/src/partition/tileset.js';

const leaf: ICEFinishedTile = {
  bounds: { min: [0, 0, 0], max: [2, 1, 4] },
  contentUri: 'parts/part-000.glb',
  partitionId: 'part-000',
  children: [],
};

const schemaDirectory = 'tests/fixtures/3d-tiles-1.1-schema';

test('writes standard local Cartesian tile boxes and 0 leaf error', () => {
  const document = createTilesetDocument('factory', leaf);

  expect(document.asset.version).toBe('1.1');
  expect(document.root).toMatchObject({
    geometricError: 0,
    refine: 'REPLACE',
    boundingVolume: {
      box: [1, -2, 0.5, 1, 0, 0, 0, 2, 0, 0, 0, 0.5],
    },
    content: { uri: 'parts/part-000.glb' },
  });
});

test('writes a parent culling box that contains both child boxes', () => {
  const group: ICEFinishedTile = {
    bounds: { min: [0, 0, 0], max: [4, 2, 2] },
    contentUri: '',
    partitionId: 'group-root',
    children: [
      leaf,
      {
        bounds: { min: [2, 0, 0], max: [4, 2, 2] },
        contentUri: 'parts/part-001.glb',
        partitionId: 'part-001',
        children: [],
      },
    ],
  };
  const document = createTilesetDocument('factory', group);
  const root = document.root as {
    boundingVolume: { box: number[] };
    geometricError: number;
    children: Array<{ content: { uri: string } }>;
  };

  expect(root.boundingVolume.box).toEqual([
    2, -1, 1,
    2, 0, 0,
    0, 1, 0,
    0, 0, 1,
  ]);
  expect(root.geometricError).toBeCloseTo(Math.hypot(4, 2, 2));
  expect(root.children.map((child) => child.content.uri)).toEqual([
    'parts/part-000.glb',
    'parts/part-001.glb',
  ]);
});

test('validates against the official OGC schema bundle', () => {
  const ajv = new Ajv2020({ strict: false, allErrors: true });
  addFormats(ajv);
  for (const file of readdirSync(schemaDirectory, { recursive: true })) {
    if (String(file).endsWith('.json')) {
      ajv.addSchema(JSON.parse(
        readFileSync(join(schemaDirectory, String(file)), 'utf8'),
      ));
    }
  }
  const tilesetSchema = JSON.parse(
    readFileSync(join(schemaDirectory, 'tileset.schema.json'), 'utf8'),
  );
  const validate = ajv.compile(tilesetSchema);
  const document = createTilesetDocument('factory', leaf);

  expect(validate(document), JSON.stringify(validate.errors)).toBe(true);
});
```

- [ ] **Step 3: Run RED**

```bash
npm test -- tests/partition/tileset.test.ts
```

Expected: FAIL because the writer does not exist.

- [ ] **Step 4: Implement the standard serializer**

Implement:

1. Convert each y-up AABB to a 3D Tiles z-up oriented box:
   center `[cx, -cz, cy]`, axes `[hx,0,0, 0,0,hy, 0,hz,0]`.
2. Group bounds use the union of child bounds.
3. Internal `geometricError` is the box diagonal in meters.
4. Leaf `geometricError` is `0`.
5. Every tile has `refine: "REPLACE"`.
6. Content uses the exact relative URI supplied by the orchestrator.
7. Add `extras.ice3` with logical asset ID and partition ID.
8. Use deterministic object property insertion order.
9. Reject non-finite bounds with `ICE3_TOOL_TILESET_INVALID`.

- [ ] **Step 5: Verify GREEN and commit**

```bash
npm test -- tests/partition/tileset.test.ts
npm test
git add package.json package-lock.json \
  packages/toolchain-core/src/partition/tileset.ts \
  packages/toolchain-core/src/index.ts \
  tests/partition/tileset.test.ts \
  tests/fixtures/3d-tiles-1.1-schema
git commit -m "feat(toolchain): emit standard 3D Tiles trees"
```

---

### Task 5: Orchestrate Partition Builds and Byte Limits

**Files:**
- Create: `ice3-toolchain/packages/toolchain-core/src/partition/partitionAsset.ts`
- Create: `ice3-toolchain/tests/partition/partitionAsset.test.ts`
- Modify: `ice3-toolchain/packages/toolchain-core/src/partition/types.ts`
- Modify: `ice3-toolchain/packages/toolchain-core/src/index.ts`

**Interfaces:**
- Consumes: `readSource`, `analyzePartitionUnits`, `createPartitionPlan`,
  `buildPreparedGLB`, `createTilesetDocument`.
- Produces:

```ts
export interface ICEPartitionOptions {
  readonly assetId: string;
  readonly maxTriangles?: number;
  readonly maxBytes?: number;
  readonly creaseAngleDegrees?: number;
  readonly edges?: boolean;
  readonly budget?: ICEBudgetProfile;
}

export interface ICEPartitionFile {
  readonly path: string;
  readonly bytes: Uint8Array;
}

export interface ICEPartitionResult {
  readonly files: readonly ICEPartitionFile[];
  readonly tileset: ICETilesetDocument;
  readonly partitionCount: number;
  readonly stats: {
    readonly triangleCount: number;
    readonly nodeCount: number;
    readonly maxPartBytes: number;
  };
}

export function partitionAsset(
  source: ICESourceDocument,
  options: ICEPartitionOptions,
): ICEPartitionResult;
```

- [ ] **Step 1: Write failing orchestration tests**

```ts
import { test } from 'node:test';
import { expect } from 'expect';
import { partitionAsset } from '../../packages/toolchain-core/src/partition/partitionAsset.js';
import { validatePreparedGLB } from '../../packages/toolchain-core/src/output/validatePreparedGLB.js';
import { createPartitionSource } from './createPartitionSource.js';

test('writes independent GLBs and a tileset that conserve source triangles', () => {
  const result = partitionAsset(createPartitionSource(), {
    assetId: 'partition-demo',
    maxTriangles: 1,
  });
  const glbs = result.files.filter((file) => file.path.endsWith('.glb'));

  expect(result.partitionCount).toBe(4);
  expect(glbs).toHaveLength(4);
  expect(result.stats.triangleCount).toBe(4);
  expect(glbs.every((file) => validatePreparedGLB(file.bytes).errors.length === 0))
    .toBe(true);
});

test('reports an indivisible node that exceeds the byte limit', () => {
  expect(() => partitionAsset(createPartitionSource(), {
    assetId: 'partition-demo',
    maxBytes: 1,
  })).toThrow(/ICE3_TOOL_PARTITION_UNSPLITTABLE/);
});

test('does not split nodes that share one mesh', () => {
  const result = partitionAsset(createPartitionSource(true), {
    assetId: 'partition-demo',
    maxTriangles: 1,
  });

  expect(result.partitionCount).toBe(1);
  expect(result.stats.triangleCount).toBe(1);
});

test('produces byte-identical files and Tileset for identical inputs', () => {
  const source = createPartitionSource();
  const first = partitionAsset(source, {
    assetId: 'partition-demo',
    maxTriangles: 2,
  });
  const second = partitionAsset(source, {
    assetId: 'partition-demo',
    maxTriangles: 2,
  });

  expect(second.files.map((file) => [file.path, [...file.bytes]])).toEqual(
    first.files.map((file) => [file.path, [...file.bytes]]),
  );
  expect(second.tileset).toEqual(first.tileset);
});
```

- [ ] **Step 2: Run RED**

```bash
npm test -- tests/partition/partitionAsset.test.ts
```

Expected: FAIL because `partitionAsset.ts` does not exist.

- [ ] **Step 3: Implement deterministic recursive assembly**

Implement:

1. Validate positive finite defaults: `500_000` triangles and `33_554_432` bytes.
2. Read the active-scene analysis and create the triangle plan.
3. Recursively build every plan node.
4. For a leaf, call `buildPreparedGLB` with the unit's node indices and flattened
   world transforms.
5. If actual GLB bytes exceed `maxBytes` and the leaf has multiple atomic units,
   split that leaf once at its longest axis and build both children recursively.
6. If a one-unit leaf exceeds `maxBytes`, throw
   `ICE3_TOOL_PARTITION_UNSPLITTABLE`.
7. Reject any shard whose existing ICE3 budget status is `error`.
8. Assign leaf paths in depth-first order as `parts/part-000.glb`.
9. Build the standard Tileset tree from the same leaf order and bounds.
10. Verify triangle counts, original mesh node IDs, path uniqueness, and
    maximum bytes before returning.
11. Ensure result ordering and bytes are identical across repeated calls.

- [ ] **Step 4: Verify GREEN**

```bash
npm test -- tests/partition/partitionAsset.test.ts
npm test
```

Expected: all pass, including existing single-GLB tests.

- [ ] **Step 5: Commit**

```bash
git add packages/toolchain-core/src/partition \
  packages/toolchain-core/src/index.ts \
  tests/partition/partitionAsset.test.ts
git commit -m "feat(toolchain): partition assets into tiled GLBs"
```

---

### Task 6: Add the Atomic Partition CLI

**Files:**
- Modify: `ice3-toolchain/packages/cli/src/commands.ts`
- Modify: `ice3-toolchain/tests/cli/commands.test.ts`
- Modify: `ice3-toolchain/README.md`

**Interfaces:**
- Consumes: `partitionAsset(source, options)`.
- Produces CLI command:

```text
ice3-tool partition <source> --output <directory> --asset-id <id>
  [--max-triangles <n>] [--max-bytes <n>]
  [--skip-edges] [--budget <profile-or-file>]
  [--warnings-as-errors] [--json]
```

- [ ] **Step 1: Write failing CLI tests**

Append tests:

```ts
test('partition writes tileset and numbered GLBs without partial output', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'ice3-partition-'));
  directories.push(directory);
  const source = join(directory, 'source.gltf');
  writePartitionGLTF(source);
  const output = join(directory, 'dist');

  const code = await runCli([
    'partition',
    source,
    '--output',
    output,
    '--asset-id',
    'demo',
    '--max-triangles',
    '1',
  ]);

  expect(code).toBe(0);
  expect(existsSync(join(output, 'tileset.json'))).toBe(true);
  expect(readdirSync(join(output, 'parts'))).toHaveLength(4);
});

test('partition rejects an existing output directory', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const directory = mkdtempSync(join(tmpdir(), 'ice3-partition-'));
  directories.push(directory);
  const source = join(directory, 'source.gltf');
  writePartitionGLTF(source);
  const output = join(directory, 'dist');
  mkdirSync(output);

  expect(await runCli([
    'partition',
    source,
    '--output',
    output,
    '--asset-id',
    'demo',
  ])).toBe(1);
  expect(readdirSync(output)).toEqual([]);
});
```

Add `writePartitionGLTF` to the test file by serializing
`createPartitionSource().json` with a base64 data URI for its buffer:

```ts
const writePartitionGLTF = (path: string): void => {
  const document = createPartitionSource();
  writeFileSync(path, JSON.stringify({
    ...document.json,
    buffers: [{
      byteLength: 42,
      uri: `data:application/octet-stream;base64,${
        Buffer.from(document.buffers[0]!).toString('base64')
      }`,
    }],
  }));
};
```

- [ ] **Step 2: Run RED**

```bash
npm test -- tests/cli/commands.test.ts -t partition
```

Expected: FAIL because `partition` is an unknown command and its options are not
parsed.

- [ ] **Step 3: Implement CLI parsing and atomic publication**

Implement:

1. Add `partition` to the command dispatcher.
2. Add `--max-triangles` and `--max-bytes` to valued options.
3. Require `--output`, `--asset-id`, and one source positional.
4. Reject unknown flags.
5. Validate positive finite budgets before reading the source.
6. Resolve the output and sibling temporary path from the same parent.
7. Refuse existing output paths before building.
8. Create the temporary `parts/` directory.
9. Write part files and `tileset.json`.
10. Validate all generated GLBs and the Tileset before rename.
11. Rename the temporary directory to the requested output only on success.
12. On any failure, recursively remove only the generated temporary directory.
13. Print deterministic JSON containing output path, partition count, and stats.
14. Keep existing `build`, `inspect`, and `validate` behavior unchanged.

Fix the command format above to exactly:

```bash
ice3-tool partition <source> --output <directory> --asset-id <id>
```

- [ ] **Step 4: Exercise success and failure**

```bash
npm test -- tests/cli/commands.test.ts
npm run verify
```

Expected: all tests pass and no temporary directory remains after the rejection
test.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/commands.ts tests/cli/commands.test.ts README.md
git commit -m "feat(cli): add atomic partition command"
```

---

### Task 7: Parse the Supported 3D Tiles Subset

**Files:**
- Create: `ice3-engine/packages/assets/src/ICETileset.ts`
- Create: `ice3-engine/packages/assets/src/ICETilesetReader.ts`
- Create: `ice3-engine/packages/assets/tests/TilesetReader.test.ts`
- Modify: `ice3-engine/packages/assets/src/index.ts`

**Interfaces:**
- Consumes: a fetched `tileset.json` text and its base URL.
- Produces:

```ts
export interface ICETilesetTile {
  readonly id: string;
  readonly bounds: ICEGeometryBounds;
  readonly contentUri?: string;
  readonly children: readonly ICETilesetTile[];
  readonly geometricError: number;
  readonly transform?: readonly number[];
}

export interface ICETilesetSnapshot {
  readonly assetId: string;
  readonly bounds: ICEGeometryBounds;
  readonly tiles: readonly ICETilesetTile[];
}

export function readTileset(
  text: string,
  baseUrl: string,
): ICETilesetSnapshot;
```

`bounds` in `ICETilesetSnapshot` are converted from standard z-up boxes or
spheres into the engine's y-up bounds.

- [ ] **Step 1: Write failing parser tests**

```ts
import { test } from 'node:test';
import { expect } from 'expect';
import { readTileset } from '../src/ICETilesetReader';

const tileset = (contentUri = 'parts/part-000.glb') => JSON.stringify({
  asset: {
    version: '1.1',
    extras: { ice3: { assetId: 'factory', contractVersion: '1.0' } },
  },
  geometricError: 10,
  root: {
    boundingVolume: { box: [1, -2, 0.5, 1, 0, 0, 0, 2, 0, 0, 0, 0.5] },
    geometricError: 0,
    refine: 'REPLACE',
    content: { uri: contentUri },
    extras: { ice3: { assetId: 'factory' } },
  },
});

test('parses a local Cartesian leaf and resolves a relative content URL', () => {
  const snapshot = readTileset(tileset(), 'https://example.test/scene/tileset.json');

  expect(snapshot.assetId).toBe('factory');
  expect(snapshot.bounds).toEqual({
    min: [0, 0, 0],
    max: [2, 4, 1],
  });
  expect(snapshot.tiles[0]!.contentUri).toBe(
    'https://example.test/scene/parts/part-000.glb',
  );
});

test('rejects unsupported and escaping content references', () => {
  expect(() => readTileset(tileset('../part.glb'), 'https://x.test/a/tileset.json'))
    .toThrow(/ICE3_TILESET_UNSUPPORTED/);
  expect(() => readTileset(tileset('part.json'), 'https://x.test/a/tileset.json'))
    .toThrow(/ICE3_TILESET_UNSUPPORTED/);
});

test('rejects region and implicit tiling before fetching tile content', () => {
  const withRegion = JSON.parse(tileset());
  withRegion.root.boundingVolume = { region: [0, 0, 0, 0, 0, 0] };
  expect(() => readTileset(JSON.stringify(withRegion), 'https://x.test/'))
    .toThrow(/ICE3_TILESET_UNSUPPORTED/);

  const withImplicit = JSON.parse(tileset());
  withImplicit.root.implicitTiling = { subdivisionScheme: 'QUADTREE' };
  expect(() => readTileset(JSON.stringify(withImplicit), 'https://x.test/'))
    .toThrow(/ICE3_TILESET_UNSUPPORTED/);
});
```

- [ ] **Step 2: Run RED**

```bash
nvm use
npm test -- packages/assets/tests/TilesetReader.test.ts
```

Expected: FAIL because `ICETilesetReader.ts` does not exist.

- [ ] **Step 3: Implement parser and subset validation**

Implement:

1. Parse JSON and require an object root.
2. Require `asset.version === '1.1'`.
3. Recursively validate explicit `children`.
4. Require exactly one supported bounding volume per tile: `box` length 12 or
   `sphere` length 4.
5. Require non-negative finite `geometricError`.
6. Require root `refine` or an inherited explicit parent value; only `REPLACE`
   is supported.
7. Accept finite `transform` arrays of length 16.
8. Resolve `content.uri` with `new URL(uri, baseUrl)`.
9. Reject failed URL resolution, path traversal, absolute-path tricks, non-GLB
   suffixes, `.json` external tilesets, `region`, `implicitTiling`, unsupported
   required extensions, and missing ICE3 asset ID.
10. Convert z-up AABBs to y-up bounds:
    `(x, y, z)` → `(x, -z, y)`.
11. For spheres, convert center but retain radius.
12. Deduplicate tile IDs formed from deterministic DFS paths.

- [ ] **Step 4: Verify GREEN and commit**

```bash
npm test -- packages/assets/tests/TilesetReader.test.ts
npm test
git add packages/assets/src packages/assets/tests/TilesetReader.test.ts
git commit -m "feat(assets): parse supported 3D Tiles"
```

---

### Task 8: Load Tiles Incrementally with the Public Runtime API

**Files:**
- Create: `ice3-engine/packages/runtime/src/asset/ICETilesetLoader.ts`
- Create: `ice3-engine/packages/runtime/tests/TilesetLoader.test.ts`
- Modify: `ice3-engine/packages/runtime/src/index.ts`
- Modify: `ice3-engine/packages/ice3/src/index.ts`
- Modify: `ice3-engine/examples/m1/global.d.ts`

**Interfaces:**
- Consumes: `readTileset`, `ICEAssetLoader`, `ICE3`, `ICEPerspectiveCamera`.
- Produces:

```ts
export type ICETilesetTileState =
  | 'pending'
  | 'loading'
  | 'loaded'
  | 'failed';

export interface ICETilesetStats {
  readonly total: number;
  readonly pending: number;
  readonly loading: number;
  readonly loaded: number;
  readonly failed: number;
}

export class ICETilesetHandle extends ICEEventDispatcher {
  readonly scene: ICEScene;
  readonly bounds: ICEGeometryBounds;
  get stats(): ICETilesetStats;
  tileState(tileId: string): ICETilesetTileState | undefined;
  whenReady(): Promise<void>;
  whenComplete(): Promise<void>;
  dispose(): void;
}

export class ICETilesetLoader {
  constructor(
    engine: ICE3,
    options?: {
      readonly fetch?: typeof globalThis.fetch;
      readonly camera?: ICEPerspectiveCamera;
      readonly maxConcurrentTiles?: number;
    },
  );
  open(
    url: string,
    options?: { readonly signal?: AbortSignal },
  ): Promise<ICETilesetHandle>;
}
```

The handle emits `TILESET_TILE_LOADING`, `TILESET_TILE_LOADED`,
`TILESET_TILE_FAILED`, `TILESET_READY`, and `TILESET_COMPLETE`. Every event
parameter includes an immutable `ICETilesetStats` snapshot and, where relevant,
the tile ID.

- [ ] **Step 1: Create a frozen synthetic Tileset fixture**

After Task 6 is green, generate the synthetic source file and Tileset with:

```bash
node tests/fixtures/writePartitionGLTF.mjs \
  ../ice3-engine/tests/fixtures/partition-source.gltf
node packages/cli/dist/main.js partition ../ice3-engine/tests/fixtures/partition-source.gltf \
  --output ../ice3-engine/tests/fixtures/spatial-demo \
  --asset-id spatial-demo \
  --max-triangles 1
```

Do not copy any local or customer asset. Commit the source and four-part
synthetic Tileset in the engine repository.

- [ ] **Step 2: Write failing runtime tests**

```ts
import { it } from 'node:test';
import { expect } from 'expect';
import * as mockApi from 'jest-mock';
import {
  ICE3,
  ICEPerspectiveCamera,
} from '../src/index';
import { ICETilesetLoader } from '../src/asset/ICETilesetLoader';
import { FakeRendererBackend } from '@ice3/renderer';
import { readFileSync } from 'node:fs';

const fixture = (path: string) => readFileSync(
  `tests/fixtures/spatial-demo/${path}`,
);

it('opens before all tiles finish and commits completed tiles progressively', async () => {
  const engine = new ICE3({ backend: new FakeRendererBackend() });
  const camera = new ICEPerspectiveCamera({
    id: 'camera',
    position: [0, 2, 8],
    target: [0, 0, 0],
  });
  const fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith('tileset.json')) {
      return new Response(fixture('tileset.json'));
    }
    const name = url.split('/').at(-1)!;
    if (name !== 'part-000.glb') {
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    return new Response(fixture(name));
  });
  const loader = new ICETilesetLoader(engine, { fetch, camera });
  const tileset = await loader.open('https://example.test/spatial-demo/tileset.json');

  expect(tileset.stats.loaded).toBe(0);
  await tileset.whenReady();
  expect(tileset.stats.loaded).toBe(1);
  expect(tileset.stats.loaded).toBeLessThan(tileset.stats.total);
  await tileset.whenComplete();
  expect(tileset.stats.loaded).toBe(tileset.stats.total);
  expect(tileset.scene.children.length).toBeGreaterThan(0);
  tileset.dispose();
  expect(tileset.scene.children).toHaveLength(0);
});

it('keeps successful tiles after one tile fails', async () => {
  const engine = new ICE3({ backend: new FakeRendererBackend() });
  const fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith('tileset.json')) {
      return new Response(fixture('tileset.json'));
    }
    if (url.endsWith('part-001.glb')) {
      return new Response('broken', { status: 500 });
    }
    return new Response(fixture(url.split('/').at(-1)!));
  });
  const tileset = await new ICETilesetLoader(engine, { fetch })
    .open('https://example.test/spatial-demo/tileset.json');

  await tileset.whenComplete();
  expect(tileset.stats.loaded).toBe(3);
  expect(tileset.stats.failed).toBe(1);
  expect(tileset.scene.children.length).toBeGreaterThan(0);
});

it('rejects duplicate node IDs from a later tile without removing earlier tiles', async () => {
  const engine = new ICE3({ backend: new FakeRendererBackend() });
  const fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith('tileset.json')) {
      return new Response(fixture('tileset.json'));
    }
    const name = url.endsWith('part-001.glb')
      ? 'part-000.glb'
      : url.split('/').at(-1)!;
    return new Response(fixture(name));
  });
  const tileset = await new ICETilesetLoader(engine, { fetch })
    .open('https://example.test/spatial-demo/tileset.json');

  await tileset.whenComplete();
  expect(tileset.stats.loaded).toBe(3);
  expect(tileset.stats.failed).toBe(1);
  expect(tileset.scene.children.length).toBeGreaterThan(0);
});

it('starts no more than two tile requests before a response settles', async () => {
  const engine = new ICE3({ backend: new FakeRendererBackend() });
  let inFlight = 0;
  let maximumInFlight = 0;
  const fetch = vi.fn((
    input: RequestInfo | URL,
    init?: RequestInit,
  ) => new Promise<Response>((resolve, reject) => {
    const url = String(input);
    if (url.endsWith('tileset.json')) {
      resolve(new Response(fixture('tileset.json')));
      return;
    }
    inFlight += 1;
    maximumInFlight = Math.max(maximumInFlight, inFlight);
    init?.signal?.addEventListener('abort', () => {
      inFlight -= 1;
      reject(new DOMException('Aborted', 'AbortError'));
    });
  }));
  const tileset = await new ICETilesetLoader(engine, { fetch })
    .open('https://example.test/spatial-demo/tileset.json');

  await Promise.resolve();
  expect(inFlight).toBe(2);
  expect(maximumInFlight).toBe(2);
  tileset.dispose();
  await Promise.resolve();
  expect(inFlight).toBe(0);
});

it('aborts pending work and disposes its scene idempotently', async () => {
  const engine = new ICE3({ backend: new FakeRendererBackend() });
  const fetch = vi.fn((
    input: RequestInfo | URL,
    init?: RequestInit,
  ) => new Promise<Response>((resolve, reject) => {
    const url = String(input);
    if (url.endsWith('tileset.json')) {
      resolve(new Response(fixture('tileset.json')));
      return;
    }
    init?.signal?.addEventListener('abort', () => {
      reject(new DOMException('Aborted', 'AbortError'));
    });
  }));
  const tileset = await new ICETilesetLoader(engine, { fetch })
    .open('https://example.test/spatial-demo/tileset.json');

  tileset.dispose();
  tileset.dispose();
  expect(tileset.scene.children).toHaveLength(0);
  expect(tileset.stats.loading).toBe(0);
});
```

- [ ] **Step 3: Run RED**

```bash
npm test -- packages/runtime/tests/TilesetLoader.test.ts
```

Expected: FAIL because `ICETilesetLoader` does not exist.

- [ ] **Step 4: Implement handle, scheduler, and scene merging**

Implement:

1. Fetch and parse the Tileset before returning the handle.
2. Create the unified `ICEScene` with ID `${assetId}:scene`.
3. Sort content tiles by bounds center distance to camera target; if no camera,
   preserve Tileset DFS order.
4. Start at most two tile loads by default.
5. Use one `AbortController` owned by the handle plus the caller signal.
6. Load each tile with `ICEAssetLoader`.
7. Before merging, validate all child IDs against the unified scene through the
   existing `addChild` duplicate check.
8. Compose inherited standard z-up tile transforms and conjugate the result into
   the engine's y-up frame; the generated pipeline normally uses identity.
9. Wrap each loaded partition under one tile root with the converted matrix,
   then move that root into the unified scene.
10. Dispose the now-empty partition scene after moving children.
11. Request a render and emit `TILESET_TILE_LOADED` after each successful merge.
12. On per-tile error, emit `TILESET_TILE_FAILED` and report
    `ICE3_TILESET_TILE_FAILED`; do not remove successful tiles.
13. Resolve `whenReady` on the first successful merge.
14. Resolve `whenComplete` after all queued tiles settle.
15. Clear event listeners, abort in-flight requests, and dispose the unified
    scene exactly once in `dispose`; reject an unresolved `whenReady` with
    `ICE3_TILESET_ABORTED` and settle `whenComplete` after active loads stop.
16. Expose state counts through a fresh immutable snapshot getter.

- [ ] **Step 5: Verify GREEN**

```bash
npm test -- packages/runtime/tests/TilesetLoader.test.ts
npm test
```

Expected: all pass.

- [ ] **Step 6: Export through the public entry point**

Add exports in `packages/runtime/src/index.ts` and re-export from
`packages/ice3/src/index.ts`:

```ts
export {
  ICETilesetLoader,
  ICETilesetHandle,
  type ICETilesetStats,
  type ICETilesetTileState,
} from './asset/ICETilesetLoader.js';
```

Update `examples/m1/global.d.ts` with `tilesetStats()` returning
`ICETilesetStats`.

- [ ] **Step 7: Commit**

```bash
git add packages/assets/src packages/runtime/src packages/ice3/src \
  packages/runtime/tests/TilesetLoader.test.ts \
  tests/fixtures/spatial-demo tests/fixtures/partition-source.gltf \
  examples/m1/global.d.ts
git commit -m "feat(runtime): load tiled assets incrementally"
```

---

### Task 9: Switch the Existing Example to Incremental Tileset Loading

**Files:**
- Modify: `ice3-engine/examples/m1/main.ts`
- Modify: `ice3-engine/examples/m1/index.html`
- Modify: `ice3-engine/examples/m1/styles.css`
- Modify: `ice3-engine/tests/e2e/m1.spec.ts`
- Create: `ice3-engine/examples/m1/assets/partitioned/tileset.json`
- Create: `ice3-engine/examples/m1/assets/partitioned/parts/*.glb`

**Interfaces:**
- Consumes: `ICETilesetLoader.open`, `ICETilesetHandle.stats`,
  `whenReady`, `whenComplete`.
- Produces an example using the public package import from `ice3`.

- [ ] **Step 1: Generate and commit the synthetic demo Tileset**

Run the partition CLI over the synthetic source and copy the validated output
into `examples/m1/assets/partitioned/`. The command must use:

```bash
--asset-id partition-demo --max-triangles 1
```

The example Tileset must contain at least four part files. Do not use a customer
asset.

- [ ] **Step 2: Write the failing E2E incremental test**

```ts
test('shows completed partitions before all tile requests finish', async ({ page }) => {
  await page.route('**/assets/partitioned/parts/part-*.glb', async (route) => {
    const name = route.request().url().split('/').at(-1)!;
    await new Promise((resolve) => setTimeout(
      resolve,
      name === 'part-000.glb' ? 0 : 500,
    ));
    await route.continue();
  });
  await page.goto('http://127.0.0.1:8104/');

  const progress = page.locator('[data-role="tileset-progress"]');
  await expect(progress).toContainText(/分区 [1-3]\/4/);
  await expect(page.locator('[data-role="stage"]')).toHaveAttribute(
    'aria-busy',
    'false',
  );
  await expect(progress).toHaveText('分区 4/4');
  await expect(page.locator('[data-role="status"]')).toHaveText('资产已加载');
});
```

- [ ] **Step 3: Run RED**

```bash
source "$HOME/.nvm/nvm.sh"
nvm use
npm run test:e2e -- --project=chromium -g "shows completed partitions"
```

Expected: FAIL because the example still loads one GLB and has no
`tileset-progress` element.

- [ ] **Step 4: Update the example**

Implement:

1. Replace `ICEAssetLoader` with `ICETilesetLoader`.
2. Open `/assets/partitioned/tileset.json`.
3. Obtain `handle.bounds` for camera fitting before tile completion.
4. Set the empty unified scene immediately.
5. Add a compact toolbar indicator with `data-role="tileset-progress"`.
6. Show `分区 loaded/total` while loading.
7. Hide the full-stage loading overlay after the first tile is committed.
8. Update the status to `资产已加载` only after all tiles settle successfully.
9. On partial failure, keep the scene and show
   `部分分区加载失败（failed/total）`.
10. Rebind selection lookup to `tileset.scene`.
11. Dispose the Tileset handle idempotently.
12. Keep black background, flat lighting, original colors, edge lines, camera
    keys, mouse controls, selection highlight, and info panel.
13. Expose `window.__ice3M1.tilesetStats()` for tests.

- [ ] **Step 5: Run focused Chromium tests**

```bash
npm run test:e2e -- --project=chromium -g "partitions|selects one equipment"
```

Expected: incremental and selection tests pass.

- [ ] **Step 6: Commit**

```bash
git add examples/m1 tests/e2e/m1.spec.ts packages/ice3/src packages/runtime/src \
  packages/runtime/tests packages/assets/src packages/assets/tests
git commit -m "feat(example): demonstrate incremental tiled loading"
```

---

### Task 10: Finish Documentation, Full Verification, and Controlled Asset Smoke Test

**Files:**
- Modify: `ice3-toolchain/README.md`
- Modify: `ice3-engine/README.md`
- Modify: `ice3-engine/docs/api/m1.md`
- Modify: `ice3-doc/docs/contracts/asset-preparation-contract-v1.md`
- Modify if implementation required extra tests or exports:
  `ice3-toolchain/packages/toolchain-core/src/index.ts`,
  `ice3-engine/packages/runtime/src/index.ts`,
  `ice3-engine/packages/ice3/src/index.ts`

**Interfaces:**
- Consumes all prior tasks.
- Produces user-facing command/API documentation and evidence that the complete
  cross-repository pipeline works.

- [ ] **Step 1: Document exact usage**

Add this toolchain example:

```bash
node packages/cli/dist/main.js partition \
  tests/fixtures/partition-source.gltf \
  --output /tmp/partition-result \
  --asset-id partition-demo \
  --max-triangles 500000 \
  --max-bytes 33554432
```

Add this runtime example:

```ts
const tileset = await new ICETilesetLoader(engine, { camera }).open(
  '/assets/partitioned/tileset.json',
);
engine.setScene(tileset.scene).setCamera(camera).start();
await tileset.whenReady();
```

Document the supported 3D Tiles subset, non-goals, progress events, and the fact
that first release does not unload or synthesize LOD.

- [ ] **Step 2: Run all repository verification gates**

```bash
cd ../ice3-toolchain
nvm use
npm run verify

cd ../ice3-engine
nvm use
npm run verify
npm pack --workspaces --dry-run
```

Expected:

- toolchain architecture, typecheck, unit tests, schema tests pass;
- engine architecture, typecheck, unit tests, Chromium and WebKit E2E pass;
- package dry-runs contain no customer assets.

If either command fails, fix the failing test or implementation and rerun the
entire failing repository gate.

- [ ] **Step 3: Run one controlled large-asset smoke test outside Git**

```bash
mkdir -p /tmp/ice3-controlled-smoke
test -n "$ICE3_CONTROLLED_ASSET"
node packages/cli/dist/main.js partition \
  "$ICE3_CONTROLLED_ASSET" \
  --output /tmp/ice3-controlled-smoke/output \
  --asset-id controlled-smoke \
  --max-triangles 500000 \
  --max-bytes 33554432 \
  --json \
  > /tmp/ice3-controlled-smoke/result.json
```

Limit displayed evidence to aggregate values only:

```bash
node -e '
const r = require("/tmp/ice3-controlled-smoke/result.json");
console.log(JSON.stringify({
  command: r.command,
  partitionCount: r.partitionCount,
  triangleCount: r.stats?.triangleCount,
  maxPartBytes: r.stats?.maxPartBytes,
  errors: r.errors,
}));
'
```

Do not print node names, source names, directory listings, screenshots, or
geometry.

- [ ] **Step 4: Audit and remove controlled outputs**

```bash
rm -rf /tmp/ice3-controlled-smoke
git status --short --ignored
git ls-files | rg -i '\.(glb|gltf|bin)$'
```

Expected: the last command lists only reviewed synthetic fixtures and explicitly
distributable test assets. No tracked or staged customer asset or derivative may
remain. `rm -rf` is scoped only to `/tmp/ice3-controlled-smoke`.

- [ ] **Step 5: Run the final full gates after cleanup**

```bash
cd ../ice3-toolchain
npm run verify

cd ../ice3-engine
npm run verify
npm pack --workspaces --dry-run
```

Expected: both exit `0`.

- [ ] **Step 6: Commit documentation and final adjustments**

```bash
git -C ../ice3-doc add \
  docs/contracts/asset-preparation-contract-v1.md
git -C ../ice3-doc commit \
  -m "docs: finalize tiled asset contract"

git -C ../ice3-toolchain add README.md
git -C ../ice3-toolchain commit \
  -m "docs: document tiled asset tooling"

git -C ../ice3-engine add \
  README.md docs/api/m1.md
git -C ../ice3-engine commit \
  -m "docs: document incremental tileset loading"
```

- [ ] **Step 7: Merge each verified feature branch**

From each repository, after confirming `git status --short --branch` is clean:

```bash
git switch main
git merge --no-ff feature/spatial-tileset-pipeline \
  -m "merge: spatial tileset pipeline"
git branch -d feature/spatial-tileset-pipeline
```

Run the repository's `npm run verify` once more on the merged branch. Do not
delete a branch or claim completion if verification is not green.

## Execution Recommendation

Native execution is the better default for this plan. The toolchain output
schema, engine parser, runtime fixture, and browser demonstration share exact
field names and dependency ordering; keeping those interface decisions in one
continuous session reduces cross-repository mismatch. The full verification
gate still provides an independent final check.
