# ICE3 层级 LOD 资产生成实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在工具链中从一次源模型构建同时生成细模、层级粗模、真实 `geometricError`、稳定设备选择身份和可审计报告。

**Architecture:** 扩展 Prepared GLB 的节点身份，使视觉节点可以按 LOD 命名而选择身份保持稳定。工具链先规范化设备几何到受控工作区，再在同一空间树构建任务中生成细模叶子和粗模内部节点，最后原子发布标准 Tileset。

**Tech Stack:** TypeScript 7, Node.js 24 LTS, node-test, `meshoptimizer@1.3.0`, OGC 3D Tiles 1.1, ICE3 Prepared GLB

**Spec:** `ice3-doc/docs/superpowers/specs/2026-10-27-hierarchical-lod-design.md`

## Global Constraints

- Use Node.js 24 LTS from each repository's `.nvmrc`.
- Develop on `feature/hierarchical-lod`; merge to `main` only after the complete gate passes.
- Follow RED-GREEN-REFACTOR for every behavior change.
- Do not use competitor or vendor product names in artifacts.
- Do not expose a real customer model or any derived data in Git, fixtures, screenshots, logs, or packages.
- Runtime conversion, mesh simplification, and format conversion remain toolchain-only.
- The browser runtime adds no dependency for LOD.
- Defaults: `lodRatio=0.15`, `lodMaxTriangles=250000`, `lodMinUnitTriangles=8`.
- Every device selection ID must exist in each coarse ancestor.
- Source geometry is normalized once and reused; a coarse parent must not simplify a child coarse proxy.
- Publish the final asset directory atomically.
- Do not add LOD support to ordinary GLB or to the application layer.

## Review Focus

- A device with very few triangles must survive coarse generation instead of becoming unselectable.
- The sum of per-device minimums can exceed `lodMaxTriangles`; all devices must remain.
- A coarse parent must preserve source colors and must not use another coarse node as simplification input.
- Failed or cancelled builds must remove both output and temporary geometry workspace.
- Browser packages must not gain a `meshoptimizer` runtime dependency.

---

### Task 1: Stable Selection Identity Across LOD Content

**Files:**
- Modify: `ice3-toolchain/packages/toolchain-core/src/output/buildPreparedGLB.ts`
- Modify: `ice3-toolchain/packages/toolchain-core/src/output/validatePreparedGLB.ts`
- Modify: `ice3-toolchain/tests/output/buildPreparedGLB.test.ts`
- Modify: `ice3-engine/packages/assets/src/ICEPreparedGLB.ts`
- Modify: `ice3-engine/packages/assets/src/ICEGLBReader.ts`
- Modify: `ice3-engine/packages/assets/src/ICEProfileValidator.ts`
- Modify: `ice3-engine/packages/assets/tests/GLBReader.test.ts`
- Modify: `ice3-engine/packages/assets/tests/createFixture.ts`
- Modify: `ice3-engine/packages/runtime/src/asset/ICEAssetSceneBuilder.ts`
- Modify: `ice3-engine/packages/runtime/tests/AssetSceneBuilder.test.ts`

**Interfaces:**
- Consumes: current `node.extras.ice3.id`.
- Produces:

```ts
interface ICEBuildOptions {
  readonly selectionIdAssetId?: string;
}

interface ICEPreparedNode {
  readonly id: string;
  readonly selectionId: string;
}
```

- `selectionId` is optional on disk and defaults to `id`.
- When `selectionIdAssetId` is supplied, node extras contain both:
  `id: "${assetId}/node/${index}"` and
  `selectionId: "${selectionIdAssetId}/node/${index}"`.

- [ ] **Step 1: Write failing identity tests**

Add to toolchain `tests/output/buildPreparedGLB.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { buildPreparedGLB } from '../../packages/toolchain-core/src/output/buildPreparedGLB.js';
import { createPartitionSource } from '../partition/createPartitionSource.js';

test('writes a LOD namespace while preserving selection identity', () => {
  const built = buildPreparedGLB(createPartitionSource(), {
    assetId: 'overview',
    selectionIdAssetId: 'source-asset',
    selection: {
      nodeIndices: [0],
      flattenWorldTransforms: true,
    },
  });
  const buffer = Buffer.from(built.bytes);
  const jsonLength = buffer.readUInt32LE(12);
  const document = JSON.parse(
    buffer.subarray(20, 20 + jsonLength).toString('utf8').replace(/ +$/g, ''),
  );

  expect(document.nodes[0].extras.ice3).toEqual({
    id: 'overview/node/0',
    selectionId: 'source-asset/node/0',
  });
});
```

Add to engine `packages/assets/tests/GLBReader.test.ts`:

```ts
it('reads an explicit selection identity for LOD content', () => {
  const snapshot = readPreparedGLB(createMinimalPreparedGLB({
    selectionId: 'semantic/device/7',
  }));

  expect(snapshot.nodes[0]!.id).toBe('fixture/node/0');
  expect(snapshot.nodes[0]!.selectionId).toBe('semantic/device/7');
});
```

Modify `createMinimalPreparedGLB` options and node extras:

```ts
readonly selectionId?: string;

extras: {
  ice3: {
    id: 'fixture/node/0',
    ...(options.selectionId
      ? { selectionId: options.selectionId }
      : {}),
  },
},
```

Add to runtime `packages/runtime/tests/AssetSceneBuilder.test.ts`:

```ts
it('uses selection identity independently from the LOD node ID', () => {
  const mesh = buildAssetScene({
    ...snapshotWithEdges,
    nodes: [
      snapshotWithEdges.nodes[0]!,
      {
        ...snapshotWithEdges.nodes[1]!,
        id: 'overview/node/1',
        selectionId: 'source/node/1',
      },
    ],
  }).scene.findByID('overview/node/1') as ICEMesh;

  expect(mesh.selectionId).toBe('source/node/1');
});
```

- [ ] **Step 2: Run RED**

```bash
cd ../ice3-toolchain
npm test -- tests/output/buildPreparedGLB.test.ts

cd ../ice3-engine
npx node-test run packages/assets/tests/GLBReader.test.ts \
  packages/runtime/tests/AssetSceneBuilder.test.ts
```

Expected: FAIL because `selectionId` is not emitted, parsed, or consumed.

- [ ] **Step 3: Implement optional selection identity**

Toolchain output:

```ts
const semanticAssetId = options.selectionIdAssetId ?? assetId;
extras: {
  ice3: {
    id: `${assetId}/node/${sourceIndex}`,
    ...(options.selectionIdAssetId
      ? { selectionId: `${semanticAssetId}/node/${sourceIndex}` }
      : {}),
  },
},
```

Validation accepts `selectionId` only when it is a non-empty string.

Engine reader:

```ts
const selectionId = record(record(node.extras)?.ice3)?.selectionId;
selectionId: typeof selectionId === 'string' && selectionId.trim()
  ? selectionId
  : id,
```

Scene builder uses `source.selectionId` for both primary and secondary meshes.

- [ ] **Step 4: Verify GREEN**

```bash
cd ../ice3-toolchain
npm test -- tests/output/buildPreparedGLB.test.ts tests/output/validatePreparedGLB.test.ts

cd ../ice3-engine
npm run typecheck
npx node-test run packages/assets/tests/GLBReader.test.ts \
  packages/runtime/tests/AssetSceneBuilder.test.ts
npm test
```

Expected: all pass, and existing fixtures still resolve selection identity from `id`.

- [ ] **Step 5: Commit both repositories**

```bash
cd ../ice3-toolchain
git add packages/toolchain-core/src/output/buildPreparedGLB.ts \
  packages/toolchain-core/src/output/validatePreparedGLB.ts \
  tests/output/buildPreparedGLB.test.ts
git commit -m "feat(toolchain): preserve semantic identity for lod content"

cd ../ice3-engine
git add packages/assets/src/ICEPreparedGLB.ts \
  packages/assets/src/ICEGLBReader.ts \
  packages/assets/src/ICEProfileValidator.ts \
  packages/assets/tests/GLBReader.test.ts \
  packages/assets/tests/createFixture.ts \
  packages/runtime/src/asset/ICEAssetSceneBuilder.ts \
  packages/runtime/tests/AssetSceneBuilder.test.ts
git commit -m "feat(assets): carry lod selection identity"
```

---

### Task 2: Primitive Geometry Simplification

**Files:**
- Modify: `ice3-toolchain/packages/toolchain-core/package.json`
- Modify: `ice3-toolchain/package-lock.json`
- Create: `ice3-toolchain/packages/toolchain-core/src/lod/simplifyGeometry.ts`
- Create: `ice3-toolchain/tests/lod/simplifyGeometry.test.ts`
- Modify: `ice3-toolchain/packages/toolchain-core/src/index.ts`

**Interfaces:**

```ts
export interface ICESimplifyGeometryOptions {
  readonly targetTriangles: number;
  readonly minimumTriangles: number;
}

export interface ICESimplifiedGeometry {
  readonly positions: Float32Array;
  readonly indices: Uint32Array;
  readonly errorMeters: number;
  readonly sourceTriangles: number;
  readonly triangleCount: number;
  readonly preservedSource: boolean;
}

export async function simplifyGeometry(
  positions: Float32Array,
  indices: Uint32Array,
  options: ICESimplifyGeometryOptions,
): Promise<ICESimplifiedGeometry>;
```

- [ ] **Step 1: Add the exact tool dependency**

```bash
cd ../ice3-toolchain
source "$HOME/.nvm/nvm.sh"
nvm use 24
npm install --workspace @ice3/toolchain-core --save-exact meshoptimizer@1.3.0
```

Expected: `meshoptimizer` appears only in `@ice3/toolchain-core` dependencies.

- [ ] **Step 2: Write failing simplification tests**

Create `tests/lod/simplifyGeometry.test.ts`:

```ts
import { expect, test } from 'node-test';
import { simplifyGeometry } from '../../packages/toolchain-core/src/lod/simplifyGeometry.js';

const grid = (cells = 8) => {
  const positions: number[] = [];
  const indices: number[] = [];
  for (let y = 0; y <= cells; y += 1) {
    for (let x = 0; x <= cells; x += 1) {
      positions.push(x / cells, y / cells, 0);
    }
  }
  const stride = cells + 1;
  for (let y = 0; y < cells; y += 1) {
    for (let x = 0; x < cells; x += 1) {
      const a = y * stride + x;
      const b = a + 1;
      const c = a + stride;
      const d = c + 1;
      indices.push(a, b, c, b, d, c);
    }
  }
  return {
    positions: new Float32Array(positions),
    indices: new Uint32Array(indices),
  };
};

test('reduces triangles and returns a deterministic finite error', async () => {
  const input = grid();
  const first = await simplifyGeometry(
    input.positions,
    input.indices,
    { targetTriangles: 32, minimumTriangles: 8 },
  );
  const second = await simplifyGeometry(
    input.positions,
    input.indices,
    { targetTriangles: 32, minimumTriangles: 8 },
  );

  expect(first.triangleCount).toBeLessThan(first.sourceTriangles);
  expect(first.triangleCount).toBeGreaterThanOrEqual(8);
  expect(first.indices.length % 3).toBe(0);
  expect(Number.isFinite(first.errorMeters)).toBe(true);
  expect(first.errorMeters).toBeGreaterThanOrEqual(0);
  expect([...second.indices]).toEqual([...first.indices]);
  expect(second.errorMeters).toBe(first.errorMeters);
});

test('preserves already-minimal geometry', async () => {
  const result = await simplifyGeometry(
    new Float32Array([
      0, 0, 0,
      1, 0, 0,
      0, 1, 0,
    ]),
    new Uint32Array([0, 1, 2]),
    { targetTriangles: 8, minimumTriangles: 8 },
  );

  expect(result.preservedSource).toBe(true);
  expect(result.triangleCount).toBe(1);
});
```

- [ ] **Step 3: Run RED**

```bash
npx node-test run tests/lod/simplifyGeometry.test.ts
```

Expected: FAIL because `simplifyGeometry` does not exist.

- [ ] **Step 4: Implement the simplifier adapter**

Implementation requirements:

```ts
import { MeshoptSimplifier } from 'meshoptimizer/simplifier';

await MeshoptSimplifier.ready;
if (!MeshoptSimplifier.supported) {
  throw new Error('ICE3_TOOL_LOD_UNSUPPORTED: simplifier is not supported');
}
const [indices, relativeError] = MeshoptSimplifier.simplify(
  sourceIndices,
  positions,
  3,
  targetTriangles * 3,
  1,
  ['LockBorder', 'ErrorClamped'],
);
const scale = MeshoptSimplifier.getScale(positions, 3);
```

- Validate input lengths and index ranges before calling the library.
- `targetTriangles` is clamped between `minimumTriangles` and source triangles.
- `errorMeters = relativeError * scale`.
- If simplification returns fewer than one triangle or throws, return the source geometry with `preservedSource: true`.
- Do not mutate caller arrays.
- Remove unreferenced vertices before returning to keep coarse bytes bounded.
- Export the API from `packages/toolchain-core/src/index.ts`.

- [ ] **Step 5: Verify GREEN**

```bash
npx node-test run tests/lod/simplifyGeometry.test.ts
npm run typecheck
npm test
```

Expected: all pass and the simplifier is loaded only by the toolchain workspace package.

- [ ] **Step 6: Commit**

```bash
git add package-lock.json \
  packages/toolchain-core/package.json \
  packages/toolchain-core/src/lod/simplifyGeometry.ts \
  packages/toolchain-core/src/index.ts \
  tests/lod/simplifyGeometry.test.ts
git commit -m "feat(toolchain): simplify partition geometry"
```

---

### Task 3: Bounded Geometry Workspace

**Files:**
- Create: `ice3-toolchain/packages/toolchain-core/src/lod/createGeometryWorkspace.ts`
- Create: `ice3-toolchain/tests/lod/createGeometryWorkspace.test.ts`
- Modify: `ice3-toolchain/packages/toolchain-core/src/index.ts`

**Interfaces:**

```ts
export interface ICEGeometryWorkspaceOptions {
  readonly maxMemoryBytes: number;
  readonly temporaryRoot?: string;
}

export interface ICEWorkspaceGeometry {
  readonly positions: Float32Array;
  readonly indices: Uint32Array;
}

export interface ICEGeometryWorkspace {
  write(key: string, geometry: ICEWorkspaceGeometry): Promise<void>;
  read(key: string): Promise<ICEWorkspaceGeometry>;
  readonly spilledBytes: number;
  dispose(): Promise<void>;
}

export function createGeometryWorkspace(
  options: ICEGeometryWorkspaceOptions,
): Promise<ICEGeometryWorkspace>;
```

- [ ] **Step 1: Write failing workspace tests**

```ts
import { existsSync } from 'node:fs';
import { expect, test } from 'node-test';
import { createGeometryWorkspace } from '../../packages/toolchain-core/src/lod/createGeometryWorkspace.js';

test('reads a unit after spilling it outside the output directory', async () => {
  const workspace = await createGeometryWorkspace({
    maxMemoryBytes: 1,
  });
  const geometry = {
    positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
    indices: new Uint32Array([0, 1, 2]),
  };

  await workspace.write('unit-0', geometry);
  const loaded = await workspace.read('unit-0');

  expect([...loaded.positions]).toEqual([...geometry.positions]);
  expect([...loaded.indices]).toEqual([...geometry.indices]);
  expect(workspace.spilledBytes).toBeGreaterThan(0);
  await workspace.dispose();
});
```

Add a second test that writes geometry, calls `dispose()`, and verifies the
workspace temporary root no longer exists.

- [ ] **Step 2: Run RED**

```bash
npx node-test run tests/lod/createGeometryWorkspace.test.ts
```

Expected: FAIL because the workspace does not exist.

- [ ] **Step 3: Implement the workspace**

- Use `mkdtemp(join(tmpdir(), 'ice3-lod-'))`.
- Keep typed arrays in memory while total bytes are at or below the cap.
- Spill excess entries as deterministic binary files.
- Use a per-workspace key map; reject duplicate keys.
- Return copies from `read()` so callers cannot mutate stored data.
- `dispose()` is idempotent and recursively removes only the workspace root.
- Cleanup errors are surfaced with `ICE3_TOOL_LOD_CLEANUP_FAILED`.

- [ ] **Step 4: Verify GREEN**

```bash
npx node-test run tests/lod/createGeometryWorkspace.test.ts
npm run typecheck
```

Expected: tests pass and `/tmp` contains no workspace after disposal.

- [ ] **Step 5: Commit**

```bash
git add packages/toolchain-core/src/lod/createGeometryWorkspace.ts \
  packages/toolchain-core/src/index.ts \
  tests/lod/createGeometryWorkspace.test.ts
git commit -m "feat(toolchain): bound lod geometry workspace"
```

---

### Task 4: Integrated Fine and Coarse Build

**Files:**
- Modify: `ice3-toolchain/packages/toolchain-core/src/partition/types.ts`
- Modify: `ice3-toolchain/packages/toolchain-core/src/partition/partitionAsset.ts`
- Create: `ice3-toolchain/packages/toolchain-core/src/lod/allocateLodTargets.ts`
- Create: `ice3-toolchain/tests/lod/allocateLodTargets.test.ts`
- Create: `ice3-toolchain/tests/partition/lodGeneration.test.ts`
- Modify: `ice3-toolchain/packages/toolchain-core/src/output/buildPreparedGLB.ts`
- Modify: `ice3-toolchain/packages/toolchain-core/src/index.ts`

**Interfaces:**

```ts
export interface ICELodBuildOptions {
  readonly ratio: number;
  readonly maxTrianglesPerProxy: number;
  readonly minTrianglesPerUnit: number;
  readonly maxMemoryBytes?: number;
}

export interface ICELodUnitTarget {
  readonly nodeIndices: readonly number[];
  readonly targetTriangles: number;
  readonly minimumTriangles: number;
}

export function allocateLodTargets(
  units: readonly ICEPartitionUnit[],
  options: ICELodBuildOptions,
): readonly ICELodUnitTarget[];
```

`ICEPartitionOptions` gains `readonly lod?: ICELodBuildOptions`.

`ICEPartitionResult.stats` gains:

```ts
readonly coarseTriangleCount: number;
readonly coarseBytes: number;
readonly maxCoarseBytes: number;
readonly preservedCoarseUnits: number;
readonly overBudgetCoarseNodes: number;
```

These aggregate fields belong to the partition result and report. Do not add
them to each Prepared GLB's embedded contract stats.

- [ ] **Step 1: Write failing target-allocation tests**

```ts
import { expect, test } from 'node-test';
import { allocateLodTargets } from '../../packages/toolchain-core/src/lod/allocateLodTargets.js';

const unit = (index: number, triangleCount: number) => ({
  nodeIndices: [index],
  meshIndices: [index],
  bounds: { min: [index, 0, 0], max: [index + 1, 1, 1] },
  triangleCount,
});

test('keeps every unit at or above the minimum', () => {
  const targets = allocateLodTargets(
    [unit(0, 1000), unit(1, 8), unit(2, 1)],
    {
      ratio: 0.15,
      maxTrianglesPerProxy: 500,
      minTrianglesPerUnit: 8,
    },
  );

  expect(targets[0]!.targetTriangles).toBe(150);
  expect(targets[1]!.targetTriangles).toBe(8);
  expect(targets[2]!.targetTriangles).toBe(1);
});

test('lets device minimums exceed the node soft cap', () => {
  const targets = allocateLodTargets(
    Array.from({ length: 4 }, (_, index) => unit(index, 100)),
    {
      ratio: 0.15,
      maxTrianglesPerProxy: 16,
      minTrianglesPerUnit: 8,
    },
  );

  expect(targets.map((entry) => entry.targetTriangles)).toEqual([
    8, 8, 8, 8,
  ]);
});
```

- [ ] **Step 2: Write failing integrated partition tests**

Create a test source with two spatial groups and multiple triangle primitives.
Assert:

```ts
const result = partitionAsset(createLodPartitionSource(), {
  assetId: 'lod-demo',
  maxTriangles: 16,
  lod: {
    ratio: 0.15,
    maxTrianglesPerProxy: 64,
    minTrianglesPerUnit: 8,
  },
});

expect(result.files.some((file) => file.path.startsWith('coarse/'))).toBe(true);
expect(result.stats.coarseTriangleCount).toBeGreaterThan(0);
expect(result.tileset.root).toMatchObject({
  content: { uri: expect.stringMatching(/^coarse\//) },
  children: expect.any(Array),
});
```

Also generate a second coarse node from the same source and assert:

- every coarse GLB validates;
- selection IDs in coarse content match the source units;
- the source `readAccessor` path is not used to reparse a second independent
  source document;
- workspace `dispose()` is called after success and after forced failure.

- [ ] **Step 3: Run RED**

```bash
npx node-test run tests/lod/allocateLodTargets.test.ts \
  tests/partition/lodGeneration.test.ts
```

Expected: FAIL because LOD options and coarse files do not exist.

- [ ] **Step 4: Implement allocation and integrated generation**

Integrate into the existing recursive `partitionAsset` task:

1. Normalize each source semantic unit once into the workspace.
2. Build leaves from their unit geometry.
3. For each internal plan node, allocate per-unit targets.
4. Read the original unit geometry from the workspace.
5. Simplify each primitive independently and build one coarse GLB for the node.
6. Assign the coarse GLB an asset ID of
   `${assetId}:lod:${partitionId}` and
   `selectionIdAssetId: assetId`.
7. Keep all outputs in the same in-memory result consumed by the CLI.
8. Dispose the workspace in a `finally` block.

Do not call `partitionAsset` recursively and do not simplify a child coarse GLB.

- [ ] **Step 5: Verify GREEN**

```bash
npx node-test run tests/lod/allocateLodTargets.test.ts \
  tests/partition/lodGeneration.test.ts
npm run typecheck
npm test
```

Expected: all pass and existing non-LOD partition output is unchanged.

- [ ] **Step 6: Commit**

```bash
git add packages/toolchain-core/src/partition/types.ts \
  packages/toolchain-core/src/partition/partitionAsset.ts \
  packages/toolchain-core/src/lod/allocateLodTargets.ts \
  packages/toolchain-core/src/output/buildPreparedGLB.ts \
  packages/toolchain-core/src/index.ts \
  tests/lod/allocateLodTargets.test.ts \
  tests/partition/lodGeneration.test.ts
git commit -m "feat(toolchain): generate hierarchical lod partitions"
```

---

### Task 5: Geometric Error and Hierarchical Tileset

**Files:**
- Modify: `ice3-toolchain/packages/toolchain-core/src/partition/tileset.ts`
- Modify: `ice3-toolchain/packages/toolchain-core/src/partition/partitionAsset.ts`
- Modify: `ice3-toolchain/tests/partition/tileset.test.ts`
- Modify: `ice3-toolchain/tests/partition/lodGeneration.test.ts`

**Interfaces:**

```ts
export interface ICEFinishedTile {
  readonly bounds: ICEBounds;
  readonly contentUri: string;
  readonly partitionId: string;
  readonly geometricError: number;
  readonly children: readonly ICEFinishedTile[];
}
```

- [ ] **Step 1: Write failing error-hierarchy tests**

```ts
test('uses explicit errors and parent content without inventing defaults', () => {
  const child = {
    ...leaf,
    geometricError: 0,
  };
  const parent = {
    bounds: { min: [0, 0, 0], max: [4, 2, 2] },
    contentUri: 'coarse/group-root.glb',
    partitionId: 'group-root',
    geometricError: 3.5,
    children: [child],
  };
  const document = createTilesetDocument('factory', parent) as {
    root: {
      geometricError: number;
      content: { uri: string };
      children: Array<{ geometricError: number }>;
    };
  };

  expect(document.root.geometricError).toBe(3.5);
  expect(document.root.content.uri).toBe('coarse/group-root.glb');
  expect(document.root.children[0]!.geometricError).toBe(0);
});

test('rejects a parent error lower than a child error', () => {
  expect(() => createTilesetDocument('factory', {
    bounds: { min: [0, 0, 0], max: [4, 2, 2] },
    contentUri: 'coarse/group-root.glb',
    partitionId: 'group-root',
    geometricError: 1,
    children: [{ ...leaf, geometricError: 2 }],
  })).toThrow(/ICE3_TOOL_TILESET_INVALID/);
});
```

- [ ] **Step 2: Run RED**

```bash
npx node-test run tests/partition/tileset.test.ts \
  tests/partition/lodGeneration.test.ts
```

Expected: FAIL because Tileset errors are currently derived from bounds diagonal
and parent content is omitted.

- [ ] **Step 3: Implement error propagation**

- Leaves receive `geometricError: 0`.
- Internal tile error is
  `max(measuredCoarseError, ...childErrors)`.
- Write parent `content.uri` when a coarse GLB exists.
- Reject non-finite, negative, or child-exceeding errors.
- Keep child sorting stable by `partitionId`.
- Validate with the existing OGC schema bundle.

- [ ] **Step 4: Verify GREEN**

```bash
npx node-test run tests/partition/tileset.test.ts \
  tests/partition/lodGeneration.test.ts
npm test
```

Expected: all pass and the official Tileset schema accepts parent content.

- [ ] **Step 5: Commit**

```bash
git add packages/toolchain-core/src/partition/tileset.ts \
  packages/toolchain-core/src/partition/partitionAsset.ts \
  tests/partition/tileset.test.ts \
  tests/partition/lodGeneration.test.ts
git commit -m "feat(toolchain): write hierarchical geometric error"
```

---

### Task 6: CLI Options, Reports, and Atomic Publication

**Files:**
- Modify: `ice3-toolchain/packages/cli/src/commands.ts`
- Modify: `ice3-toolchain/tests/cli/commands.test.ts`
- Modify: `ice3-toolchain/README.md`
- Modify: `ice3-doc/docs/contracts/asset-preparation-contract-v1.md`

**Interfaces:**

- CLI flags:

```text
--lod
--lod-ratio <ratio>
--lod-max-triangles <count>
--lod-min-unit-triangles <count>
```

- JSON result stats include the coarse fields introduced in Task 4.
- Atomic failure removes the `.tmp` output directory and workspace files.

- [ ] **Step 1: Write failing CLI tests**

Add a happy-path test equivalent to:

```ts
await runCli([
  'partition',
  sourcePath,
  '--output', output,
  '--asset-id', 'lod-demo',
  '--lod',
  '--lod-ratio', '0.15',
  '--json',
]);

expect(existsSync(join(output, 'tileset.json'))).toBe(true);
expect(existsSync(join(output, 'coarse'))).toBe(true);
```

Add invalid-option tests for:

```ts
['--lod-ratio', '0']
['--lod-ratio', '1']
['--lod-max-triangles', '0']
['--lod-min-unit-triangles', '9', '--lod-max-triangles', '8']
```

Add a forced coarse-build failure test and assert that the output directory and
temporary workspace are absent.

- [ ] **Step 2: Run RED**

```bash
npx node-test run tests/cli/commands.test.ts
```

Expected: FAIL because the CLI rejects the LOD flags.

- [ ] **Step 3: Implement CLI and report changes**

- Parse the four flags exactly.
- Pass a validated `ICELodBuildOptions` object only when `--lod` is present.
- Include `coarseTriangleCount`, `coarseBytes`, `maxCoarseBytes`,
  `preservedCoarseUnits`, and `overBudgetCoarseNodes` in JSON output.
- Validate every fine and coarse GLB before publishing.
- Keep the entire directory write and rename sequence atomic.
- On catch, remove both the temporary output and any workspace owned by the
  command.

- [ ] **Step 4: Verify GREEN**

```bash
npx node-test run tests/cli/commands.test.ts
npm run typecheck
npm test
```

Expected: all pass; without `--lod`, existing output remains byte-identical.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/commands.ts tests/cli/commands.test.ts README.md
git commit -m "feat(cli): expose hierarchical lod generation"

cd ../ice3-doc
git add docs/contracts/asset-preparation-contract-v1.md
git commit -m "docs: define hierarchical lod asset contract"
```

---

### Task 7: Asset Pipeline Verification

**Files:**
- Modify: `ice3-toolchain/README.md`
- Modify: `ice3-engine/docs/api/m1.md`

- [ ] **Step 1: Run the full toolchain gate**

```bash
cd ../ice3-toolchain
source "$HOME/.nvm/nvm.sh"
nvm use 24
npm run verify
npm pack --workspaces --dry-run
```

Expected: all tests pass; no customer or generated LOD asset appears in a
package.

- [ ] **Step 2: Audit dependencies and artifacts**

```bash
npm ls meshoptimizer --workspace @ice3/toolchain-core
rg -n 'meshoptimizer' \
  ../ice3-engine/package.json \
  ../ice3-engine/packages \
  || true
git status --short --ignored
git ls-files | rg -i '\.(glb|gltf|bin)$'
```

Expected:

- Simplification exists only in the toolchain.
- Tracked model files are reviewed synthetic fixtures.
- No real customer-derived coarse file is tracked.

- [ ] **Step 3: Document the pipeline and commit**

Document:

- CLI defaults.
- Coarse file layout.
- Stable selection identity.
- Real `geometricError`.
- Atomic publication and temporary workspace cleanup.
- Browser compatibility and non-LOD behavior.

```bash
cd ../ice3-toolchain
git add README.md
git commit -m "docs: explain hierarchical lod generation"

cd ../ice3-engine
git add docs/api/m1.md
git commit -m "docs: describe hierarchical lod assets"
```

## Execution Recommendation

Use Native execution. The identity extension, simplification adapter, workspace,
partition pipeline, and Tileset errors share exact IDs and geometry contracts;
one continuous implementation session reduces interface drift. Complete this
plan before starting the runtime plan.
