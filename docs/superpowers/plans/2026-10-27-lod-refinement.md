# ICE3 LOD 精炼实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 使用标准 Tileset 多内容把粗模控制在分片和总体预算内，并恢复非阻塞预取与经过实测的 SSE 默认值。

**Architecture:** 工具链继续从单一规范化几何流水线生成粗模，但把内部 Tile 的粗模拆成稳定设备分片；运行时把所有分片组合成一个逻辑 Tile。预取使用独立低优先级集合，不参与当前切面的 ready/idle 判定。

**Tech Stack:** TypeScript 7, Node.js 24 LTS, Node.js test runner, Playwright, OGC 3D Tiles 1.1, ICE3 core/assets/runtime/toolchain

**Spec:** `../specs/2026-10-27-lod-refinement-and-scene-api-design.md`

## Global Constraints

- Use Node.js 24 LTS from `.nvmrc`.
- Develop on `feature/lod-refinement`; merge to `main` only after the full gate passes.
- Follow RED-GREEN-REFACTOR for every behavior change.
- Add no browser runtime dependency.
- Coarse total bytes must be lower than fine total bytes.
- Calibration target is coarse triangles no more than 25% of fine triangles; report misses.
- Default coarse chunk limit is 32 MiB.
- Never split an individual equipment unit.
- Use standard OGC 3D Tiles 1.1 `contents`, never a private manifest.
- Prefetch must not block current visible-cut `whenIdle()`.
- Do not place customer assets or derivatives in Git, tests, screenshots, logs, or packages.

## Review Focus

- A logical Tile with many chunks must commit only after all required chunks succeed.
- One oversized individual device must remain intact and be reported instead of silently dropped.
- Chunk order and output bytes must be deterministic.
- Prefetch failure must not change current visible readiness or global failure state.
- A changed camera during chunk loading must release stale staged chunks and caches.

---

### Task 1: Parse Single and Multi-Content Tiles

**Files:**
- Modify: `ice3-engine/packages/assets/src/ICETileset.ts`
- Modify: `ice3-engine/packages/assets/src/ICETilesetReader.ts`
- Modify: `ice3-engine/packages/assets/tests/TilesetReader.test.ts`
- Modify: `ice3-toolchain/packages/toolchain-core/src/partition/tileset.ts`
- Modify: `ice3-toolchain/tests/partition/tileset.test.ts`

**Interfaces:**

```ts
interface ICETilesetTile {
  readonly contentUris: readonly string[];
  readonly contentUri?: string;
}

interface ICEFinishedTile {
  readonly contentUris: readonly string[];
  readonly contentUri?: string;
}
```

- Single `content.uri` normalizes to one `contentUris` entry and keeps
  `contentUri`.
- Multi `contents` produces ordered `contentUris` and omits `contentUri`.
- Empty arrays, duplicate URIs, both fields together, absolute or escaping URIs,
  and non-relative resources are rejected.

- [ ] **Step 1: Write failing reader and writer tests**

```ts
test('normalizes multiple tile contents in stable order', () => {
  const value = JSON.parse(tileset());
  delete value.root.content;
  value.root.contents = [
    { uri: 'coarse/root/part-001.glb' },
    { uri: 'coarse/root/part-000.glb' },
  ];

  const snapshot = readTileset(
    JSON.stringify(value),
    'https://example.test/scene/tileset.json',
  );

  expect(snapshot.root.contentUris).toEqual([
    'https://example.test/scene/coarse/root/part-001.glb',
    'https://example.test/scene/coarse/root/part-000.glb',
  ]);
  expect(snapshot.root.contentUri).toBeUndefined();
});

test('rejects content and contents on the same tile', () => {
  const value = JSON.parse(tileset());
  value.root.contents = [{ uri: 'coarse/root/part-000.glb' }];

  expect(() => readTileset(
    JSON.stringify(value),
    'https://example.test/scene/tileset.json',
  )).toThrow(/ICE3_TILESET_CONTENTS_INVALID/);
});
```

Toolchain test:

```ts
test('writes standard contents for a chunked tile', () => {
  const document = createTilesetDocument('factory', {
    bounds: { min: [0, 0, 0], max: [4, 2, 2] },
    contentUris: [
      'coarse/group-root/part-000.glb',
      'coarse/group-root/part-001.glb',
    ],
    partitionId: 'group-root',
    geometricError: 3,
    children: [],
  });

  expect(document.root).toMatchObject({
    contents: [
      { uri: 'coarse/group-root/part-000.glb' },
      { uri: 'coarse/group-root/part-001.glb' },
    ],
  });
});
```

- [ ] **Step 2: Run RED**

```bash
cd ../ice3-engine
npm test -- packages/assets/tests/TilesetReader.test.ts

cd ../ice3-toolchain
npm test -- tests/partition/tileset.test.ts
```

Expected: FAIL because multi-content is rejected and the writer only emits one
content.

- [ ] **Step 3: Implement normalization and writing**

- Create one shared normalization helper in the assets reader.
- Preserve input content order.
- Keep existing single-content consumers working through `contentUri`.
- Toolchain chooses `content` for one URI and `contents` for multiple URIs.
- Validate OGC schema after the writer change.

- [ ] **Step 4: Verify GREEN**

```bash
npm test -- packages/assets/tests/TilesetReader.test.ts

cd ../ice3-toolchain
npm test -- tests/partition/tileset.test.ts
```

Expected: both suites pass.

- [ ] **Step 5: Commit both repositories**

```bash
cd ../ice3-engine
git add packages/assets/src/ICETileset.ts \
  packages/assets/src/ICETilesetReader.ts \
  packages/assets/tests/TilesetReader.test.ts
git commit -m "feat(assets): read multi-content tiles"

cd ../ice3-toolchain
git add packages/toolchain-core/src/partition/tileset.ts \
  tests/partition/tileset.test.ts
git commit -m "feat(toolchain): write multi-content tiles"
```

---

### Task 2: Deterministic Coarse Chunk Planning

**Files:**
- Create: `ice3-toolchain/packages/toolchain-core/src/lod/createCoarseChunkPlan.ts`
- Create: `ice3-toolchain/tests/lod/createCoarseChunkPlan.test.ts`
- Modify: `ice3-toolchain/packages/toolchain-core/src/partition/types.ts`
- Modify: `ice3-toolchain/packages/toolchain-core/src/index.ts`

**Interfaces:**

```ts
interface ICECoarseChunkOptions {
  readonly maxBytes: number;
}

interface ICECoarseChunkUnit {
  readonly unitId: string;
  readonly bytes: number;
}

interface ICECoarseChunk {
  readonly unitIds: readonly string[];
  readonly bytes: number;
  readonly oversized: boolean;
}

function createCoarseChunkPlan(
  units: readonly ICECoarseChunkUnit[],
  options: ICECoarseChunkOptions,
): readonly ICECoarseChunk[];
```

- `unitId` is the stable semantic device key, not a display name.
- Units are sorted by `unitId`.
- Greedy grouping preserves order.
- Oversized single units create one oversized chunk rather than being cut.

- [ ] **Step 1: Write failing chunk planning tests**

```ts
test('groups stable units without splitting a device', () => {
  const chunks = createCoarseChunkPlan([
    { unitId: 'device-c', bytes: 10 },
    { unitId: 'device-a', bytes: 8 },
    { unitId: 'device-b', bytes: 8 },
  ], { maxBytes: 16 });

  expect(chunks).toEqual([
    { unitIds: ['device-a', 'device-b'], bytes: 16, oversized: false },
    { unitIds: ['device-c'], bytes: 10, oversized: false },
  ]);
});

test('keeps an oversized unit intact', () => {
  expect(createCoarseChunkPlan([
    { unitId: 'large', bytes: 40 },
    { unitId: 'small', bytes: 4 },
  ], { maxBytes: 16 })).toEqual([
    { unitIds: ['large'], bytes: 40, oversized: true },
    { unitIds: ['small'], bytes: 4, oversized: false },
  ]);
});
```

- [ ] **Step 2: Run RED**

```bash
npm test -- tests/lod/createCoarseChunkPlan.test.ts
```

Expected: FAIL because chunk planning does not exist.

- [ ] **Step 3: Implement deterministic grouping**

- Reject nonpositive/nonfinite byte limits.
- Reject duplicate or empty unit IDs.
- Sort by lexical stable ID.
- Use the provided byte estimate for planning; exact generated sizes are checked
  again in Task 4.

- [ ] **Step 4: Verify GREEN**

```bash
npm test -- tests/lod/createCoarseChunkPlan.test.ts
npm run typecheck
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add packages/toolchain-core/src/lod/createCoarseChunkPlan.ts \
  packages/toolchain-core/src/partition/types.ts \
  packages/toolchain-core/src/index.ts \
  tests/lod/createCoarseChunkPlan.test.ts
git commit -m "feat(toolchain): plan stable coarse chunks"
```

---

### Task 3: Generate and Measure Coarse Chunks

**Files:**
- Modify: `ice3-toolchain/packages/toolchain-core/src/partition/partitionAsset.ts`
- Modify: `ice3-toolchain/packages/toolchain-core/src/lod/simplifyGeometry.ts`
- Modify: `ice3-toolchain/packages/toolchain-core/src/partition/types.ts`
- Modify: `ice3-toolchain/packages/toolchain-core/src/partition/tileset.ts`
- Modify: `ice3-toolchain/packages/cli/src/commands.ts`
- Modify: `ice3-toolchain/tests/partition/lodGeneration.test.ts`
- Modify: `ice3-toolchain/tests/cli/commands.test.ts`
- Modify: `ice3-toolchain/tests/lod/simplifyGeometry.test.ts`

**Interfaces:**

- `ICELodBuildOptions` gains:

```ts
readonly coarseChunkMaxBytes?: number;
```

- `ICEPartitionResult.stats` gains:

```ts
readonly coarseContentCount: number;
readonly maxCoarseChunkBytes: number;
readonly oversizedCoarseChunks: number;
readonly coarseTriangleRatio: number;
readonly coarseByteRatio: number;
```

- Tile coarse content uses `contentUris`.

- [ ] **Step 1: Write failing integrated split test**

Extend `lodGeneration.test.ts` with a source containing at least four devices
and a chunk limit forcing two or more coarse chunks:

```ts
const result = await partitionAsset(createLodPartitionSource(), {
  assetId: 'lod-demo',
  maxTriangles: 8,
  lod: {
    ratio: 0.15,
    maxTrianglesPerProxy: 64,
    minTrianglesPerUnit: 1,
    coarseChunkMaxBytes: 5000,
  },
});

const root = result.tileset.root as {
  contents: Array<{ uri: string }>;
  content?: unknown;
  geometricError: number;
};

expect(root.content).toBeUndefined();
expect(root.contents.length).toBeGreaterThan(1);
expect(result.stats.coarseContentCount).toBeGreaterThan(1);
expect(result.stats.maxCoarseChunkBytes).toBeLessThanOrEqual(5000);
```

Add a simplification test where topology-preserving reduction cannot meet the
target but the second-stage collapse can; assert the actual result is lower and
reported error remains finite.

- [ ] **Step 2: Run RED**

```bash
npm test -- tests/partition/lodGeneration.test.ts \
  tests/lod/simplifyGeometry.test.ts
```

Expected: FAIL because coarse content is still one file and the fallback
simplification is absent.

- [ ] **Step 3: Implement chunk generation**

- Allocate one coarse triangle budget for the logical Tile before chunking.
- Build candidate coarse chunk bytes from semantic units.
- Group units with `createCoarseChunkPlan`.
- Generate one Prepared GLB per group.
- If actual chunk bytes exceed the configured limit and multiple units exist,
  split that group further.
- Emit `coarse/<tile-id>/part-NNN.glb`.
- Write multiple `contentUris` to the finished Tile.
- Run topology-preserving simplification first and count-based conservative
  collapse only when the target is materially missed.
- Report actual ratios and oversized devices.
- Parse `--coarse-chunk-max-bytes`, defaulting to `--max-bytes`.
- Expose all coarse chunk statistics in JSON CLI output.

- [ ] **Step 4: Verify GREEN**

```bash
npm test -- tests/partition/lodGeneration.test.ts \
  tests/lod/simplifyGeometry.test.ts \
  tests/cli/commands.test.ts
npm run typecheck
npm test
```

Expected: all pass and existing non-LOD output remains unchanged.

- [ ] **Step 5: Commit**

```bash
git add packages/toolchain-core/src/partition/partitionAsset.ts \
  packages/toolchain-core/src/lod/simplifyGeometry.ts \
  packages/toolchain-core/src/partition/types.ts \
  packages/toolchain-core/src/partition/tileset.ts \
  packages/cli/src/commands.ts \
  tests/partition/lodGeneration.test.ts \
  tests/cli/commands.test.ts \
  tests/lod/simplifyGeometry.test.ts
git commit -m "feat(toolchain): split coarse lod content"
```

---

### Task 4: Logical Multi-Content Tile Lifecycle

**Files:**
- Modify: `ice3-engine/packages/runtime/src/asset/ICETilesetLoader.ts`
- Modify: `ice3-engine/packages/runtime/tests/TilesetLoader.test.ts`
- Create: `ice3-engine/packages/runtime/tests/MultiContentTile.test.ts`
- Modify: `ice3-engine/examples/m1/global.d.ts`

**Interfaces:**

```ts
interface ICETilesetStats {
  readonly residentContents: number;
  readonly loadingContents: number;
}
```

- A logical tile owns staged chunk containers.
- The Tile is loaded only after every required chunk succeeds.
- Tile cache cleanup clears every content URI.

- [ ] **Step 1: Write failing multi-content tests**

```ts
it('commits one logical container after all chunks finish', async () => {
  const tileset = await openMultiContentFixture();

  await tileset.whenReady();
  expect(tileset.scene.children).toHaveLength(1);
  expect(tileset.stats.resident).toBe(1);
  expect(tileset.stats.residentContents).toBe(2);
  expect(tileset.scene.children[0]!.children).toHaveLength(2);
});

it('does not commit a partial logical tile when one chunk fails', async () => {
  const tileset = await openMultiContentFixture({ fail: 1 });
  await tileset.whenIdle();

  expect(tileset.stats.resident).toBe(0);
  expect(tileset.stats.failed).toBe(1);
  expect(tileset.scene.children).toHaveLength(0);
});
```

- [ ] **Step 2: Run RED**

```bash
npm test -- packages/runtime/tests/MultiContentTile.test.ts
```

Expected: FAIL because the loader assumes one `contentUri`.

- [ ] **Step 3: Implement logical Tile loading**

- Replace single-URI cache fields with per-chunk records.
- Load chunk URIs sequentially inside one concurrency slot.
- Stage all chunk containers.
- On complete success, create one logical container and submit it once.
- On failure or eviction, dispose all staged chunks and clear every URL.
- Update all event/stat calculations to logical Tile counts plus chunk counts.
- `TILESET_TILE_LOADED` emits once for the logical Tile.

- [ ] **Step 4: Verify GREEN**

```bash
npm test -- packages/runtime/tests/MultiContentTile.test.ts \
  packages/runtime/tests/TilesetLoader.test.ts \
  packages/runtime/tests/LodLoader.test.ts
npm run typecheck
npm test
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add packages/runtime/src/asset/ICETilesetLoader.ts \
  packages/runtime/tests/MultiContentTile.test.ts \
  packages/runtime/tests/TilesetLoader.test.ts \
  examples/m1/global.d.ts
git commit -m "feat(runtime): load multi-content tiles atomically"
```

---

### Task 5: Non-Blocking Prefetch

**Files:**
- Modify: `ice3-engine/packages/runtime/src/asset/ICETilesetLoader.ts`
- Modify: `ice3-engine/packages/runtime/src/asset/ICELodSelector.ts`
- Modify: `ice3-engine/packages/runtime/tests/LodLoader.test.ts`
- Modify: `ice3-engine/packages/runtime/tests/LodSelector.test.ts`

**Interfaces:**

- Selector returns an optional prefetch target list for one level beyond the
  visible cut.
- Prefetch state is tracked separately from required current-cut work.

- [ ] **Step 1: Write failing prefetch tests**

```ts
it('keeps visible whenIdle independent from background prefetch', async () => {
  const tileset = await openHierarchicalWithDelayedPrefetch();
  await tileset.whenReady();

  await expect(tileset.whenIdle()).resolves.toBeUndefined();
  expect(tileset.stats.loadingContents).toBeGreaterThan(0);
});

it('does not treat prefetch failure as a visible failure', async () => {
  const tileset = await openHierarchicalWithFailedPrefetch();
  await tileset.whenIdle();

  expect(tileset.stats.resident).toBeGreaterThan(0);
  expect(tileset.stats.failed).toBe(0);
  expect(engine.getDiagnostics().lastDiagnostic?.code)
    .not.toBe('ICE3_TILESET_TILE_FAILED');
});
```

- [ ] **Step 2: Run RED**

```bash
npm test -- packages/runtime/tests/LodLoader.test.ts
```

Expected: FAIL because prefetch is currently absent.

- [ ] **Step 3: Implement prefetch**

- Derive one-level neighboring content from the visible target cut.
- Suppress prefetch when the resident limit is reached.
- Queue prefetch below current visible/fallback work.
- Track prefetch candidates separately from required idle work.
- On camera change, discard prefetched content outside retention.
- On prefetch failure, evict locally without failing visible coverage.

- [ ] **Step 4: Verify GREEN**

```bash
npm test -- packages/runtime/tests/LodLoader.test.ts \
  packages/runtime/tests/LodSelector.test.ts
npm run typecheck
npm test
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add packages/runtime/src/asset/ICETilesetLoader.ts \
  packages/runtime/src/asset/ICELodSelector.ts \
  packages/runtime/tests/LodLoader.test.ts \
  packages/runtime/tests/LodSelector.test.ts
git commit -m "feat(runtime): prefetch adjacent lod content"
```

---

### Task 6: Measure and Select SSE Default

**Files:**
- Modify: `ice3-engine/packages/runtime/src/asset/ICETilesetLoader.ts`
- Modify: `ice3-engine/README.md`
- Modify: `ice3-engine/docs/api/m1.md`
- Modify controlled work-set measurement script outside Git during validation

**Interfaces:**

- Evaluate thresholds `16`, `32`, and `48` in a controlled browser.
- Choose one default only after comparing target differences, visible quality,
  resident bytes, first-content time, and idle time.

- [ ] **Step 1: Add deterministic threshold test**

```ts
it('produces distinct target cuts at calibrated thresholds', () => {
  const overview16 = selector.select(input(1000, 800, {
    maxScreenSpaceErrorPixels: 16,
  }));
  const overview48 = selector.select(input(1000, 800, {
    maxScreenSpaceErrorPixels: 48,
  }));

  expect(overview16.target.length)
    .toBeGreaterThanOrEqual(overview48.target.length);
});
```

- [ ] **Step 2: Run RED**

```bash
npm test -- packages/runtime/tests/LodSelector.test.ts -t calibrated
```

Expected: FAIL only if current behavior violates monotonic refinement.

- [ ] **Step 3: Measure the controlled asset**

Generate temporary hierarchical output outside Git. Use a temporary browser page
and public API. For each threshold record only aggregate metrics.

- [ ] **Step 4: Set the calibrated default**

Change:

```ts
this.maxScreenSpaceErrorPixels = options.maxScreenSpaceErrorPixels ?? <chosen>;
```

and update all default-value assertions and docs to the measured value.

- [ ] **Step 5: Verify GREEN and commit**

```bash
npm test -- packages/runtime/tests/LodSelector.test.ts
npm run verify
git add packages/runtime/src/asset/ICETilesetLoader.ts README.md docs/api/m1.md
git commit -m "feat(runtime): calibrate lod screen-space error"
```

---

### Task 7: LOD Refinement Verification

**Files:**
- Modify: `ice3-toolchain/README.md`
- Modify: `ice3-doc/docs/contracts/asset-preparation-contract-v1.md`
- Modify: `ice3-engine/docs/diagnostics.md`

- [ ] **Step 1: Run both full gates**

```bash
cd ../ice3-toolchain
source "$HOME/.nvm/nvm.sh"
nvm use 24
npm run verify

cd ../ice3-engine
npm run verify
npm pack --workspaces --dry-run
```

Expected: all tests pass and no model files are packaged.

- [ ] **Step 2: Run controlled real-asset verification**

Record only:

```text
totalFineTriangles
totalFineBytes
totalCoarseTriangles
totalCoarseBytes
coarseTriangleRatio
coarseByteRatio
coarseContentCount
maxCoarseChunkBytes
oversizedCoarseChunks
overviewTargetNodes
focusedTargetNodes
focusedResidentBytes
afterMoveResidentNodes
firstCoarseContentMs
targetCutReadyMs
prefetchFailures
selectedSseThreshold
pageErrors
```

Acceptance:

- coarse bytes < fine bytes;
- each non-oversized coarse chunk <= configured limit;
- triangle ratio is at or below 25%, or explicitly reported as above target;
- prefetch failure count is isolated from visible failure;
- moving away releases resident content;
- no page errors.

- [ ] **Step 3: Clean and audit**

Delete temporary controlled assets, then run Git/package/naming audits.

- [ ] **Step 4: Commit docs and merge**

```bash
cd ../ice3-toolchain
git add README.md
git commit -m "docs: document coarse lod chunking"

cd ../ice3-engine
git add docs/diagnostics.md docs/api/m1.md README.md
git commit -m "docs: document multi-content lod runtime"

cd ../ice3-doc
git add docs/contracts/asset-preparation-contract-v1.md
git commit -m "docs: define chunked coarse lod contract"
```

Merge all repository branches to `main` after clean full verification.

## Execution Recommendation

Use Native execution. Multi-content parsing, chunk planning, logical Tile
loading, prefetch, and SSE behavior share exact Tile IDs and readiness
semantics; one continuous implementation session reduces lifecycle drift.
