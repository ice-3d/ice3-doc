# Static Industrial Render Batching Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generate deterministic static render batches in the toolchain and consume them through WebGL2 with unchanged device selection, LOD, and Tileset behavior.

**Architecture:** The toolchain bakes static node transforms into material-specific batches and emits standard GLB geometry with a compact semantic index. The runtime builds query-only semantic nodes plus render batches, submits one draw per compatible batch, and maps per-vertex semantic indices back to stable selection IDs for picking and highlighting.

**Tech Stack:** Node.js 24 LTS, TypeScript 7, ESM, npm workspaces, Node.js built-in test runner, `expect`, `tsx`, WebGL2, OGC 3D Tiles 1.1, Prepared GLB

**Spec:** `../ice3-doc/docs/superpowers/specs/2026-10-27-industrial-render-batching-design.md`

## Global Constraints

- Work on feature branches and merge to `main` only after full verification.
- Use Node 24 from `.nvmrc`; do not verify with another runtime.
- Do not add runtime dependencies.
- Keep the standard single-JSON/single-BIN Prepared GLB and OGC 3D Tiles 1.1 output.
- Existing assets without batch metadata must keep their current render path and bytes.
- Batch construction is deterministic for identical input, options, and tool version.
- Batch only static geometry with identical material, draw mode, color, and edge semantics.
- Preserve node IDs, selection IDs, LOD content boundaries, and `REPLACE` behavior.
- Never move source-model conversion or mesh simplification into the browser.
- Never commit controlled customer assets, derived GLBs, screenshots, reports, or paths.
- Avoid competitor names and the prohibited generic 3D-library brand term in code, docs, tests, logs, and commit messages.
- Acceptance target: visible Draw Call count on the controlled industrial asset must fall by at least 50%.

## Review Focus

- A material uses both indexed and non-indexed primitives; both must produce the same visible surface without being incorrectly mixed.
- One semantic node has multiple primitives with different materials; selection must remain one equipment while batches remain material-correct.
- A shared source mesh appears under multiple node instances; instancing must preserve each node transform and selection ID.
- A selected device spans several batches; every contributing range must highlight and the whole equipment must still resolve to one selection.
- Context loss or upload failure occurs while a replacement generation is being prepared; the previous generation must remain usable and no GPU resource may leak.

---

### Task 1: Define and Validate Batch Metadata

**Files:**
- Modify: `ice3-engine/packages/assets/src/ICEPreparedGLB.ts`
- Modify: `ice3-engine/packages/assets/src/ICEGLBReader.ts`
- Modify: `ice3-engine/packages/assets/src/ICEProfileValidator.ts`
- Test: `ice3-engine/packages/assets/tests/ICEGLBReader.test.ts`
- Test: `ice3-engine/packages/assets/tests/ICEProfileValidator.test.ts`

**Interfaces:**

```ts
export interface ICEPreparedBatch {
  readonly id: string;
  readonly mesh: number;
  readonly primitive: number;
  readonly material: number;
  readonly mode: 4 | 1;
  readonly triangleCount: number;
  readonly bounds: ICEGeometryBounds;
}

export interface ICEPreparedBatching {
  readonly version: '1.0';
  readonly semanticIds: readonly string[];
  readonly semanticNodeIds: readonly string[];
  readonly semanticSelectionIds: readonly string[];
  readonly batches: readonly ICEPreparedBatch[];
}

export interface ICEPreparedAssetSnapshot {
  readonly batching?: ICEPreparedBatching;
  // existing fields remain unchanged
}
```

- Consumes: existing Prepared GLB JSON/BIN reader.
- Produces: validated immutable `snapshot.batching`; invalid metadata throws `ICE3_ASSET_BATCH_INVALID`.

- [ ] **Step 1: Add a failing reader test**

Create a prepared fixture whose `asset.extras.ice3.batching` has one semantic ID and one batch primitive using `_ICE3_SEMANTIC_INDEX`.

```ts
expect(readPreparedGLB(fixture).batching).toEqual({
  version: '1.0',
  semanticIds: ['semantic:0'],
  semanticNodeIds: ['node:0'],
  semanticSelectionIds: ['asset/node/0'],
  batches: [{
    id: 'batch:0',
    mesh: 0,
    primitive: 0,
    material: 0,
    mode: 4,
    triangleCount: 1,
    bounds: { min: [0, 0, 0], max: [1, 1, 0] },
  }],
});
```

- [ ] **Step 2: Run the reader test and verify RED**

Run:

```bash
cd ../ice3-engine
source ~/.nvm/nvm.sh && nvm use 24
npm test -- packages/assets/tests/ICEGLBReader.test.ts
```

Expected: FAIL because `batching` is unsupported.

- [ ] **Step 3: Implement strict metadata parsing**

Accept only:

- `version === '1.0'`.
- Three semantic arrays with equal finite lengths.
- Unique non-empty semantic, node, and selection IDs.
- Unique non-negative mesh and primitive indices within bounds.
- Unique material indices within bounds.
- Draw mode `4` or `1`.
- Non-negative integer triangle counts.
- Finite ordered bounds.
- A declared `_ICE3_SEMANTIC_INDEX` UNSIGNED_INT SCALAR attribute for every batch primitive.

- [ ] **Step 4: Add negative validation tests**

Cover an out-of-range semantic index, duplicate batch ID, mismatched semantic array lengths, unsupported version, and a batch primitive missing the semantic attribute.

Expected error code for all cases: `ICE3_ASSET_BATCH_INVALID`.

- [ ] **Step 5: Run focused tests and typecheck**

```bash
npm test -- packages/assets/tests/ICEGLBReader.test.ts packages/assets/tests/ICEProfileValidator.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/assets/src/ICEPreparedGLB.ts \
  packages/assets/src/ICEGLBReader.ts \
  packages/assets/src/ICEProfileValidator.ts \
  packages/assets/tests/ICEGLBReader.test.ts \
  packages/assets/tests/ICEProfileValidator.test.ts
git commit -m "feat(assets): define prepared render batches"
```

---

### Task 2: Build Deterministic Toolchain Batches

**Files:**
- Create: `ice3-toolchain/packages/toolchain-core/src/output/buildRenderBatches.ts`
- Modify: `ice3-toolchain/packages/toolchain-core/src/output/buildPreparedGLB.ts`
- Modify: `ice3-toolchain/packages/toolchain-core/src/index.ts`
- Test: `ice3-toolchain/tests/output/buildPreparedGLB.test.ts`
- Test: `ice3-toolchain/tests/output/buildRenderBatches.test.ts`

**Interfaces:**

```ts
export interface ICEBuildRenderBatchesOptions {
  readonly mode: 'static' | 'off';
  readonly maxTrianglesPerBatch: number;
  readonly maxBytesPerBatch: number;
}

export interface ICEBuildRenderBatchesResult {
  readonly meshes: readonly {
    readonly id: string;
    readonly positions: Float32Array;
    readonly indices: Uint32Array;
    readonly semanticIndices: Uint32Array;
    readonly materialIndex: number;
    readonly mode: 1 | 4;
    readonly triangleCount: number;
    readonly bounds: ICEBounds;
  }[];
  readonly batching: ICEToolRenderBatchMetadata;
  readonly inputPrimitiveCount: number;
  readonly outputBatchCount: number;
}

export interface ICEToolRenderBatchMetadata {
  readonly version: '1.0';
  readonly semanticIds: readonly string[];
  readonly semanticNodeIds: readonly string[];
  readonly semanticSelectionIds: readonly string[];
  readonly batches: readonly {
    readonly id: string;
    readonly mesh: number;
    readonly primitive: number;
    readonly material: number;
    readonly mode: 4 | 1;
    readonly triangleCount: number;
    readonly bounds: ICEBounds;
  }[];
}

export function buildRenderBatches(
  source: ICESourceDocument,
  selection: readonly number[],
  options: ICEBuildRenderBatchesOptions,
): ICEBuildRenderBatchesResult;
```

- Consumes: normalized source nodes, materials, transforms, and primitives.
- Produces: immutable world-space batch meshes, semantic-index arrays, and report counts used by GLB packing.

- [ ] **Step 1: Write the failing material grouping test**

Use two translated cube nodes with one shared material and more than eight source triangles per device.

```ts
const result = buildRenderBatches(source, [0, 1], {
  mode: 'static',
  maxTrianglesPerBatch: 1_000_000,
  maxBytesPerBatch: 64 * 1024 * 1024,
});

expect(result.inputPrimitiveCount).toBe(2);
expect(result.outputBatchCount).toBe(1);
expect(result.batching.semanticIds).toHaveLength(2);
expect(result.meshes[0]!.semanticIndices.length)
  .toBe(result.meshes[0]!.positions.length / 3);
```

- [ ] **Step 2: Run the grouping test and verify RED**

```bash
cd ../ice3-toolchain
source ~/.nvm/nvm.sh && nvm use 24
npm test -- tests/output/buildRenderBatches.test.ts
```

Expected: FAIL because the builder does not exist.

- [ ] **Step 3: Implement stable batch keys and transform baking**

Group by `mode`, `materialIndex`, presence of vertex colors, and edge material/width. Sort nodes and primitive indices ascending. Transform each vertex with its collected world matrix. Append triangles with `Uint32` index offsets and one semantic index per transformed vertex.

- [ ] **Step 4: Add split and determinism tests**

Verify:

- A batch above either limit is split deterministically.
- Different materials never share a batch.
- Triangle and line batches never mix.
- Repeated builds produce identical typed-array contents and metadata.

- [ ] **Step 5: Integrate the builder behind `batchingMode: 'static' | 'off'`**

With `off`, existing output bytes remain unchanged. With `static`, replace drawable node meshes with batch meshes, retain semantic nodes in the node table without drawable mesh references, and emit `asset.extras.ice3.batching`.

- [ ] **Step 6: Run focused tests and typecheck**

```bash
npm test -- tests/output/buildRenderBatches.test.ts tests/output/buildPreparedGLB.test.ts
npm run typecheck
```

Expected: PASS; the existing frozen byte test remains unchanged for `off`.

- [ ] **Step 7: Commit**

```bash
git add packages/toolchain-core/src/output/buildRenderBatches.ts \
  packages/toolchain-core/src/output/buildPreparedGLB.ts \
  packages/toolchain-core/src/index.ts \
  tests/output/buildRenderBatches.test.ts \
  tests/output/buildPreparedGLB.test.ts
git commit -m "feat(toolchain): generate static render batches"
```

---

### Task 3: Expose Batch Generation and Reporting

**Files:**
- Modify: `ice3-toolchain/packages/toolchain-core/src/partition/types.ts`
- Modify: `ice3-toolchain/packages/toolchain-core/src/partition/partitionAsset.ts`
- Modify: `ice3-toolchain/packages/cli/src/commands.ts`
- Modify: `ice3-toolchain/tests/cli/commands.test.ts`
- Modify: `ice3-toolchain/README.md`

**Interfaces:**

```ts
type ICERenderBatchMode = 'static' | 'off';

interface ICEBatchReportStats {
  readonly renderBatchMode: ICERenderBatchMode;
  readonly renderBatchInputPrimitives: number;
  readonly renderBatchCount: number;
  readonly renderBatchTriangles: number;
  readonly renderBatchBytes: number;
  readonly renderBatchFallbackPrimitives: number;
  readonly renderBatchDrawReduction: number;
}
```

- Consumes: Task 2 batch builder.
- Produces: `--render-batch off|static`, default `off`, plus report statistics on every partition result.

- [ ] **Step 1: Write a failing CLI test**

```ts
expect(await runCli([
  'partition', source,
  '--output', output,
  '--asset-id', 'batch-demo',
  '--render-batch', 'static',
  '--json',
])).toBe(0);

expect(result.stats).toMatchObject({
  renderBatchMode: 'static',
  renderBatchCount: expect.any(Number),
  renderBatchInputPrimitives: expect.any(Number),
  renderBatchDrawReduction: expect.any(Number),
});
```

- [ ] **Step 2: Verify RED**

```bash
npm test -- tests/cli/commands.test.ts
```

Expected: FAIL because the option is unknown.

- [ ] **Step 3: Add CLI validation and partition propagation**

Accept only `off|static`. The option applies to every emitted partition and coarse
GLB independently, whether or not `--lod` is enabled. Do not read the source asset
before option validation.

- [ ] **Step 4: Add report assertions**

Verify deterministic batch counts and that `renderBatchDrawReduction` equals:

```text
(inputPrimitives - batchCount) / max(1, inputPrimitives)
```

- [ ] **Step 5: Run tests and typecheck**

```bash
npm test -- tests/cli/commands.test.ts tests/partition/lodGeneration.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/toolchain-core/src/partition/types.ts \
  packages/toolchain-core/src/partition/partitionAsset.ts \
  packages/cli/src/commands.ts \
  tests/cli/commands.test.ts \
  README.md
git commit -m "feat(cli): expose static render batching"
```

---

### Task 4: Build Query-Only Semantics and Runtime Batch Objects

**Files:**
- Create: `ice3-engine/packages/runtime/src/asset/ICERenderBatch.ts`
- Modify: `ice3-engine/packages/core/src/scene/ICENode.ts`
- Modify: `ice3-engine/packages/core/src/scene/ICEMesh.ts`
- Modify: `ice3-engine/packages/runtime/src/asset/ICEAssetSceneBuilder.ts`
- Modify: `ice3-engine/packages/runtime/src/query/ICESceneQuery.ts`
- Modify: `ice3-engine/packages/runtime/src/ICE3.ts`
- Test: `ice3-engine/packages/core/tests/NodeIdentity.test.ts`
- Test: `ice3-engine/packages/runtime/tests/AssetSceneBuilder.test.ts`

**Interfaces:**

```ts
export interface ICERenderBatchOptions extends ICENodeOptions {
  readonly geometry: ICEIndexedGeometry;
  readonly material: ICEBasicMaterial;
  readonly semanticIds: readonly string[];
  readonly semanticNodeIds: readonly string[];
  readonly semanticSelectionIds: readonly string[];
  readonly materialKey: string;
}

export class ICERenderBatch extends ICENode {
  readonly geometry: ICEIndexedGeometry;
  readonly material: ICEBasicMaterial;
  readonly semanticIds: readonly string[];
  readonly semanticNodeIds: readonly string[];
  readonly semanticSelectionIds: readonly string[];
}
```

- Consumes: Task 1 snapshot metadata.
- Produces: hidden query-only semantic nodes and visible `ICERenderBatch` nodes; no duplicate geometry nodes.

- [ ] **Step 1: Write failing scene tests**

```ts
const built = buildAssetScene(batchedSnapshot);
const semantic = built.scene.findByID('node:0');
const batch = built.scene.findByID('batch:0');

expect(semantic?.typeId).toBe('ice3:Node');
expect(semantic?.selectionId).toBe('asset/node/0');
expect(batch?.typeId).toBe('ice3:RenderBatch');
expect(built.scene.findByID('semantic-render:node:0')).toBeUndefined();
```

- [ ] **Step 2: Verify RED**

```bash
npm test -- packages/runtime/tests/AssetSceneBuilder.test.ts
```

Expected: FAIL because semantic nodes have no selection identity and batches do not exist.

- [ ] **Step 3: Add generic node selection identity**

Move optional `selectionId` from `ICEMeshOptions` to `ICENodeOptions`. `ICENode.selectionId` remains optional; `ICEMesh.selectionId` remains its non-optional fallback to `id`. Update serialization and queries without changing existing output.

- [ ] **Step 4: Build batched scenes**

For batched snapshots:

- Build semantic nodes from `snapshot.nodes`.
- Leave semantic device nodes without renderable meshes.
- Build one `ICERenderBatch` per declared batch mesh.
- Add render batches at scene root with their baked world-space geometry.
- Validate semantic arrays and indices before scene construction.

- [ ] **Step 5: Run focused tests**

```bash
npm test -- packages/core/tests/NodeIdentity.test.ts packages/runtime/tests/AssetSceneBuilder.test.ts packages/runtime/tests/SceneQuery.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/runtime/src/asset/ICERenderBatch.ts \
  packages/core/src/scene/ICENode.ts \
  packages/core/src/scene/ICEMesh.ts \
  packages/runtime/src/asset/ICEAssetSceneBuilder.ts \
  packages/runtime/src/query/ICESceneQuery.ts \
  packages/runtime/src/ICE3.ts \
  packages/core/tests/NodeIdentity.test.ts \
  packages/runtime/tests/AssetSceneBuilder.test.ts
git commit -m "feat(runtime): represent render batches and semantic nodes"
```

---

### Task 5: Submit Static Batches Through WebGL2

**Files:**
- Create: `ice3-engine/packages/renderer/src/WebGL2RenderBatch.ts`
- Modify: `ice3-engine/packages/renderer/src/WebGL2GeometryBatch.ts`
- Modify: `ice3-engine/packages/renderer/src/WebGL2RendererBackend.ts`
- Modify: `ice3-engine/packages/renderer/src/WebGL2GeometryCache.ts`
- Test: `ice3-engine/packages/renderer/tests/WebGL2GeometryBatch.test.ts`
- Test: `ice3-engine/packages/renderer/tests/BackendContract.test.ts`
- Test: `ice3-engine/tests/e2e/m1.spec.ts`

**Interfaces:**

```ts
interface ICERenderBatchDraw {
  readonly batch: ICERenderBatch;
  readonly worldMatrix: Float32Array;
}

function collectRenderBatches(scene: ICEScene): readonly ICERenderBatchDraw[];
```

- Consumes: `ICERenderBatch` from Task 4.
- Produces: one `drawElements` call per triangle batch and one per line batch; ordinary meshes continue through the existing path.

- [ ] **Step 1: Write a failing renderer-batch test**

Create a scene with 100 ordinary meshes represented by one batch and assert one collected batch draw.

```ts
const draws = collectRenderBatches(batchScene);
expect(draws).toHaveLength(1);
expect(draws[0]!.batch.selectionIds).toHaveLength(100);
```

- [ ] **Step 2: Verify RED**

```bash
npm test -- packages/renderer/tests/WebGL2GeometryBatch.test.ts
```

Expected: FAIL because batch collection is absent.

- [ ] **Step 3: Implement the batch collection path**

Traverse visible `ICERenderBatch` nodes once, reuse the frame renderable buffer, and keep ordinary `ICEMesh` traversal as a fallback. Sort triangle batches by material key and bounded GPU state.

- [ ] **Step 4: Add draw-submission counters**

Add `renderedBatches` to internal renderer statistics without exposing GPU objects. `renderedMeshes` must continue to mean ordinary meshes. Draw Call counts include both.

- [ ] **Step 5: Run renderer tests and browser tests**

```bash
npm test -- packages/renderer/tests/WebGL2GeometryBatch.test.ts packages/renderer/tests/BackendContract.test.ts
npx playwright test tests/e2e/m1.spec.ts --project=chromium --project=webkit
npm run typecheck
```

Expected: PASS and the batched example draws correctly in both browsers.

- [ ] **Step 6: Commit**

```bash
git add packages/renderer/src/WebGL2RenderBatch.ts \
  packages/renderer/src/WebGL2GeometryBatch.ts \
  packages/renderer/src/WebGL2RendererBackend.ts \
  packages/renderer/src/WebGL2GeometryCache.ts \
  packages/renderer/tests/WebGL2GeometryBatch.test.ts \
  packages/renderer/tests/BackendContract.test.ts \
  tests/e2e/m1.spec.ts
git commit -m "feat(renderer): submit static render batches"
```

---

### Task 6: Preserve Picking and Selection Highlight

**Files:**
- Modify: `ice3-engine/packages/renderer/src/WebGL2Program.ts`
- Modify: `ice3-engine/packages/renderer/src/WebGL2Picker.ts`
- Modify: `ice3-engine/packages/renderer/src/WebGL2GeometryCache.ts`
- Modify: `ice3-engine/packages/renderer/src/WebGL2RendererBackend.ts`
- Modify: `ice3-engine/packages/runtime/src/ICE3.ts`
- Test: `ice3-engine/packages/runtime/tests/Projection.test.ts`
- Test: `ice3-engine/tests/e2e/m1.spec.ts`

**Interfaces:**

```ts
function semanticSelectionId(
  batch: ICERenderBatch,
  semanticIndex: number,
): string | undefined;
```

- Consumes: per-vertex semantic indices and batch semantic tables.
- Produces: picking results in the existing `selectionId` namespace and per-batch selected-vertex tint.

- [ ] **Step 1: Write a failing semantic mapping test**

```ts
expect(semanticSelectionId(batch, 0)).toBe('asset/node/0');
expect(semanticSelectionId(batch, 1)).toBe('asset/node/1');
expect(semanticSelectionId(batch, 2)).toBeUndefined();
```

- [ ] **Step 2: Verify RED**

```bash
npm test -- packages/runtime/tests/Projection.test.ts
```

Expected: FAIL because batched picking mapping is unavailable.

- [ ] **Step 3: Implement GPU picking**

Render `uint` semantic indices into the existing picking attachment. Read the integer result and map it through the active batch generation. No business names or selection strings enter GPU buffers.

- [ ] **Step 4: Implement selection highlighting**

Upload a small per-batch selection-mask texture when selection changes. The fragment shader uses the current vertex semantic index to decide whether to tint. A selection spanning multiple batches highlights all contributing ranges.

- [ ] **Step 5: Test selection across LOD**

Use the existing coarse-to-fine browser flow:

1. Select a batched device.
2. Confirm one selection ID and visible yellow pixels.
3. Trigger a complete LOD replacement.
4. Confirm the same selection ID and highlighted equipment remain.

- [ ] **Step 6: Run tests**

```bash
npm test -- packages/runtime/tests/Projection.test.ts
npx playwright test tests/e2e/m1.spec.ts --project=chromium --project=webkit
npm run verify
```

Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add packages/renderer/src/WebGL2Program.ts \
  packages/renderer/src/WebGL2Picker.ts \
  packages/renderer/src/WebGL2GeometryCache.ts \
  packages/renderer/src/WebGL2RendererBackend.ts \
  packages/runtime/src/ICE3.ts \
  packages/runtime/tests/Projection.test.ts \
  tests/e2e/m1.spec.ts
git commit -m "feat(renderer): pick and highlight batched devices"
```

---

### Task 7: Add Batch Picking and Instancing Compatibility

**Files:**
- Create: `ice3-engine/packages/renderer/src/WebGL2InstanceBatch.ts`
- Modify: `ice3-engine/packages/renderer/src/WebGL2RendererBackend.ts`
- Modify: `ice3-engine/packages/runtime/src/asset/ICEAssetSceneBuilder.ts`
- Test: `ice3-engine/packages/renderer/tests/WebGL2InstanceBatch.test.ts`
- Test: `ice3-engine/packages/runtime/tests/AssetSceneBuilder.test.ts`

**Interfaces:**

```ts
interface ICEInstanceBatch {
  readonly geometry: ICEIndexedGeometry;
  readonly material: ICEBasicMaterial;
  readonly instanceMatrices: Float32Array;
  readonly semanticIds: readonly string[];
}
```

- Consumes: shared `ICEPreparedGeometry` identities and node transforms.
- Produces: one `drawElementsInstanced` for repeated geometry while every instance maps to its own device selection.

- [ ] **Step 1: Write a failing shared-geometry test**

Build four nodes using one geometry and four distinct matrices. Assert one instance batch with four matrices and four semantic IDs.

- [ ] **Step 2: Verify RED**

```bash
npm test -- packages/renderer/tests/WebGL2InstanceBatch.test.ts
```

Expected: FAIL because instance batches are absent.

- [ ] **Step 3: Implement instance buffers**

Store geometry once. Add an instance VAO attribute for a 4x4 matrix and a semantic index. Use `vertexAttribDivisor(1)` and one indexed instanced draw.

- [ ] **Step 4: Add fallback**

If a geometry has only one instance, use the ordinary batch path. If instance-buffer creation fails, emit one batch draw per instance and report `ICE3_RENDER_INSTANCING_FALLBACK`.

- [ ] **Step 5: Run tests and typecheck**

```bash
npm test -- packages/renderer/tests/WebGL2InstanceBatch.test.ts packages/runtime/tests/AssetSceneBuilder.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/renderer/src/WebGL2InstanceBatch.ts \
  packages/renderer/src/WebGL2RendererBackend.ts \
  packages/runtime/src/asset/ICEAssetSceneBuilder.ts \
  packages/renderer/tests/WebGL2InstanceBatch.test.ts \
  packages/runtime/tests/AssetSceneBuilder.test.ts
git commit -m "feat(renderer): instance repeated industrial geometry"
```

---

### Task 8: Validate Real-Asset Draw Reduction and Finalize Static Batching

**Files:**
- Modify: `ice3-doc/docs/contracts/asset-preparation-contract-v1.md`
- Modify: `ice3-doc/docs/superpowers/specs/2026-10-27-industrial-render-batching-design.md`
- Modify: `ice3-engine/README.md`
- Modify: `ice3-toolchain/README.md`

**Interfaces:**

- Consumes: Tasks 1-7.
- Produces: measured static-batching results, compatibility contract, and an explicit default-mode ruling.

- [ ] **Step 1: Run all pre-comparison suites**

```bash
cd ../ice3-toolchain
source ~/.nvm/nvm.sh && nvm use 24
npm run verify

cd ../ice3-engine
npm run verify
```

Expected: zero failures.

- [ ] **Step 2: Generate `off` and `static` outputs outside Git**

Use the same controlled asset, `asset-id`, partition, LOD, triangle, byte, and batching parameters. Never record the asset filename or path.

- [ ] **Step 3: Compare measurable gates**

Record:

```text
drawCalls
renderedBatches
renderedMeshes
gpuBytes
renderBatchCount
renderBatchInputPrimitives
renderBatchDrawReduction
coarseTriangles
coarseBytes
buildWallClockMs
pageErrors
failedRequests
```

Require at least 50% visible Draw Call reduction, unchanged selection IDs, and zero page errors or failed requests.

- [ ] **Step 4: Validate all GLBs and privacy**

```bash
git status --porcelain=v1
git ls-files '*.glb' '*.gltf' '*.bin'
git grep -I -n 'CONTROLLED_ASSET_NAME' -- . ':!package-lock.json' || true
```

Expected: generated assets remain outside Git and no controlled name appears in tracked content.

- [ ] **Step 5: Update the shared contract and measured spec**

Document:

- Optional batch metadata.
- Static-only batching boundary.
- Semantic picking guarantees.
- Instancing and fallback behavior.
- Report fields.
- Compatibility and default mode.
- Real-asset before/after measurements without customer names or paths.

- [ ] **Step 6: Final verification and commit**

```bash
npm run verify
npm pack --workspaces --dry-run --json
git add docs
git commit -m "docs: record static render batching"
```
