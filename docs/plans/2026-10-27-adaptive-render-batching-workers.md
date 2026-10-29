# Adaptive Industrial Render Batching Worker Implementation Plan

> Document ID: ICE3-DOC-PLAN-002
>
> Status: Implemented
>
> Owner: ICE3 architecture maintainers

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an optional idle-time Worker pipeline that creates better runtime batch generations without blocking camera interaction or risking partial GPU state.

**Architecture:** A main-thread planner selects a useful batch-building job only after the camera has settled. A bounded Worker pool produces transferable batch buffers, and a byte-budgeted uploader builds a candidate GPU generation. The generation is activated atomically; stale, failed, or over-budget work is discarded while the prior generation remains active.

**Tech Stack:** Node.js 24 LTS, TypeScript 7, Web Workers, Transferable ArrayBuffer, WebGL2, Node.js built-in test runner, `expect`, `tsx`, Playwright

**Spec:** `../specs/2026-10-27-industrial-render-batching-design.md`

## Global Constraints

- Complete static batching first; this plan consumes that batch model.
- Work on feature branches and merge to `main` only after full verification.
- Use Node 24 from `.nvmrc`.
- Do not add runtime dependencies.
- Runtime adaptive batching is optional and defaults to idle-only operation.
- No large geometry preparation or upload may run during active camera motion.
- Use Transferable ArrayBuffers; SharedArrayBuffer is optional and never required.
- A failed or stale generation must leave the active generation unchanged.
- Never expose GPU objects through public APIs.
- Never commit controlled customer assets, derived files, screenshots, logs, or paths.
- Avoid competitor names and the prohibited generic 3D-library brand term in all artifacts.

## Review Focus

- Camera motion begins while a Worker is producing a candidate; the result must be rejected rather than applied to the new view.
- Worker transfer moves ownership away from the sender; no later code may read or mutate the transferred buffer.
- One upload chunk succeeds and the next fails; the old GPU generation must remain active with no partial swap or leaked buffers.
- Selection changes while a generation loads; picking and highlights must continue using the active generation until the atomic swap.
- `hardwareConcurrency` is unavailable or Worker startup fails; static batching and ordinary rendering must remain functional.

---

### Task 1: Define the Batch Plan and Cost Model

**Files:**
- Create: `ice3-engine/packages/runtime/src/batching/ICERenderBatchPlanner.ts`
- Create: `ice3-engine/packages/runtime/src/batching/ICERenderBatchPlan.ts`
- Test: `ice3-engine/packages/runtime/tests/RenderBatchPlanner.test.ts`

**Interfaces:**

```ts
export interface ICERenderBatchPlanInput {
  readonly generation: number;
  readonly visibleBatchIds: readonly string[];
  readonly batches: readonly {
    readonly id: string;
    readonly materialKey: string;
    readonly triangleCount: number;
    readonly byteLength: number;
    readonly bounds: ICEGeometryBounds;
  }[];
  readonly maxExtraGpuBytes: number;
}

export interface ICERenderBatchPlan {
  readonly generation: number;
  readonly sourceBatchIds: readonly string[];
  readonly estimatedDrawCallsSaved: number;
  readonly estimatedBytes: number;
  readonly estimatedGainMs: number;
  readonly estimatedCostMs: number;
  readonly accepted: boolean;
}

export class ICERenderBatchPlanner {
  plan(input: ICERenderBatchPlanInput): ICERenderBatchPlan;
}
```

- Consumes: active asset batch metadata and visibility set.
- Produces: a deterministic accepted or rejected merge plan; no arrays are copied.

- [ ] **Step 1: Write failing cost-model tests**

```ts
const planInput = (count: number, byteLength: number) => ({
  generation: 2,
  visibleBatchIds: Array.from(
    { length: count },
    (_, index) => `batch:${index}`,
  ),
  batches: Array.from({ length: count }, (_, index) => ({
    id: `batch:${index}`,
    materialKey: 'material:0',
    triangleCount: 500,
    byteLength,
    bounds: { min: [0, 0, 0] as const, max: [1, 1, 1] as const },
  })),
  maxExtraGpuBytes: 16 * 1024 * 1024,
});

expect(planner.plan(planInput(100, 16 * 1024)).accepted).toBe(true);
expect(planner.plan(planInput(2, 64 * 1024 * 1024)).accepted).toBe(false);
```

Cover zero draw savings, exact byte budget, negative values, and deterministic tie ordering.

- [ ] **Step 2: Verify RED**

```bash
cd ../ice3-engine
source ~/.nvm/nvm.sh && nvm use 24
npm test -- packages/runtime/tests/RenderBatchPlanner.test.ts
```

Expected: FAIL because planner types do not exist.

- [ ] **Step 3: Implement the deterministic planner**

Estimate gain and cost with the formulas in the spec. Sort candidates by material key, visible order, byte size, then ID. Reject plans that exceed memory or minimum-gain thresholds.

- [ ] **Step 4: Run focused tests**

```bash
npm test -- packages/runtime/tests/RenderBatchPlanner.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/runtime/src/batching/ICERenderBatchPlan.ts \
  packages/runtime/src/batching/ICERenderBatchPlanner.ts \
  packages/runtime/tests/RenderBatchPlanner.test.ts
git commit -m "feat(runtime): plan adaptive render batches"
```

---

### Task 2: Define the Worker Protocol and Bounded Pool

**Files:**
- Create: `ice3-engine/packages/runtime/src/batching/ICEBatchWorkerProtocol.ts`
- Create: `ice3-engine/packages/runtime/src/batching/ICEBatchWorkerPool.ts`
- Create: `ice3-engine/packages/runtime/src/batching/createBatchWorker.ts`
- Test: `ice3-engine/packages/runtime/tests/BatchWorkerPool.test.ts`

**Interfaces:**

```ts
export interface ICEBatchWorkerSource {
  readonly id: string;
  readonly materialKey: string;
  readonly positions: ArrayBuffer;
  readonly indices: ArrayBuffer;
  readonly semanticIndices: ArrayBuffer;
}

export interface ICEBatchWorkerOutput {
  readonly id: string;
  readonly materialKey: string;
  readonly positions: ArrayBuffer;
  readonly indices: ArrayBuffer;
  readonly semanticIndices: ArrayBuffer;
  readonly bounds: ICEGeometryBounds;
  readonly triangleCount: number;
}

type ICEBatchWorkerRequest = {
  readonly type: 'build';
  readonly generation: number;
  readonly maxTrianglesPerBatch: number;
  readonly maxBytesPerBatch: number;
  readonly sources: readonly ICEBatchWorkerSource[];
};

type ICEBatchWorkerResponse =
  | {
    readonly type: 'built';
    readonly generation: number;
    readonly batches: readonly ICEBatchWorkerOutput[];
  }
  | { readonly type: 'failed'; readonly generation: number; readonly message: string };

export class ICEBatchWorkerPool {
  run(request: ICEBatchWorkerRequest, signal: AbortSignal): Promise<ICEBatchWorkerResponse>;
  dispose(): void;
}
```

- Consumes: planner-accepted source batch IDs.
- Produces: bounded asynchronous jobs and transferable worker responses.

- [ ] **Step 1: Write a failing worker-pool test with a fake Worker**

Assert:

- The pool does not exceed its configured concurrency.
- Transfer list contains every transferred ArrayBuffer once.
- Aborting a job removes its pending promise and ignores a late response.
- A worker construction failure returns the documented fallback error.

- [ ] **Step 2: Verify RED**

```bash
npm test -- packages/runtime/tests/BatchWorkerPool.test.ts
```

Expected: FAIL because the pool does not exist.

- [ ] **Step 3: Implement the pool**

Default concurrency:

```ts
Math.min(
  4,
  Math.max(
    1,
    (globalThis.navigator?.hardwareConcurrency ?? 2) - 1,
  ),
)
```

Use module workers when supported and fall back to classic workers. Keep one job per Worker and reject every pending request on `dispose()`.

- [ ] **Step 4: Run tests**

```bash
npm test -- packages/runtime/tests/BatchWorkerPool.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/runtime/src/batching/ICEBatchWorkerProtocol.ts \
  packages/runtime/src/batching/ICEBatchWorkerPool.ts \
  packages/runtime/src/batching/createBatchWorker.ts \
  packages/runtime/tests/BatchWorkerPool.test.ts
git commit -m "feat(runtime): add bounded batch worker pool"
```

---

### Task 3: Merge Geometry Inside the Worker

**Files:**
- Create: `ice3-engine/packages/runtime/src/workers/renderBatchWorker.ts`
- Create: `ice3-engine/packages/runtime/src/batching/mergeBatchBuffers.ts`
- Test: `ice3-engine/packages/runtime/tests/MergeBatchBuffers.test.ts`

**Interfaces:**

```ts
export interface ICEMergedBatchBuffer {
  readonly id: string;
  readonly materialKey: string;
  readonly positions: Float32Array;
  readonly indices: Uint32Array;
  readonly semanticIndices: Uint32Array;
  readonly bounds: ICEGeometryBounds;
  readonly triangleCount: number;
}

export function mergeBatchBuffers(
  inputs: readonly ICEBatchWorkerSource[],
): readonly ICEMergedBatchBuffer[];
```

- Consumes: transferred source buffers.
- Produces: deterministic merged typed arrays split by the configured limits.

- [ ] **Step 1: Write a failing merge test**

```ts
const merged = mergeBatchBuffers([
  sourceA,
  sourceB,
]);
expect(merged).toHaveLength(1);
expect(merged[0]!.indices).toEqual(
  new Uint32Array([0, 1, 2, 3, 4, 5]),
);
expect(merged[0]!.semanticIndices).toEqual(
  new Uint32Array([0, 0, 0, 1, 1, 1]),
);
```

Also cover batch splitting, material mismatch rejection, index overflow, and empty inputs.

- [ ] **Step 2: Verify RED**

```bash
npm test -- packages/runtime/tests/MergeBatchBuffers.test.ts
```

Expected: FAIL because the merge function does not exist.

- [ ] **Step 3: Implement zero-copy-friendly output allocation**

Compute exact output lengths first, allocate once, copy typed ranges, apply vertex offsets, and transfer result buffers from the Worker.

- [ ] **Step 4: Run tests**

```bash
npm test -- packages/runtime/tests/MergeBatchBuffers.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/runtime/src/workers/renderBatchWorker.ts \
  packages/runtime/src/batching/mergeBatchBuffers.ts \
  packages/runtime/tests/MergeBatchBuffers.test.ts
git commit -m "feat(runtime): merge render buffers in workers"
```

---

### Task 4: Upload Candidate Generations Within Frame Budget

**Files:**
- Create: `ice3-engine/packages/renderer/src/ICEWebGL2BatchGenerationUploader.ts`
- Modify: `ice3-engine/packages/renderer/src/WebGL2GeometryCache.ts`
- Modify: `ice3-engine/packages/renderer/src/WebGL2RendererBackend.ts`
- Test: `ice3-engine/packages/renderer/tests/BatchGenerationUploader.test.ts`

**Interfaces:**

```ts
interface ICEBatchUploadOptions {
  readonly generation: number;
  readonly bytesPerFrame: number;
  readonly onUploaded: (generation: number) => void;
  readonly onFailed: (generation: number, error: unknown) => void;
}

function queueBatchGeneration(
  buffers: readonly ICEMergedBatchBuffer[],
  options: ICEBatchUploadOptions,
): void;
```

- Consumes: Worker-merged buffers.
- Produces: a complete non-active GPU generation, then one atomic activation callback.

- [ ] **Step 1: Write failing uploader tests**

Cover:

- Chunk byte cap is never exceeded.
- No activation occurs before the final chunk.
- Failure releases all candidate GPU resources.
- Superseded generation is not activated.

- [ ] **Step 2: Verify RED**

```bash
npm test -- packages/renderer/tests/BatchGenerationUploader.test.ts
```

Expected: FAIL because the uploader does not exist.

- [ ] **Step 3: Implement chunked upload**

Upload only during idle frames. Keep active and candidate generations separate. Activation swaps generation IDs in one callback; old resources are deleted after the swap.

- [ ] **Step 4: Run tests and typecheck**

```bash
npm test -- packages/renderer/tests/BatchGenerationUploader.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/renderer/src/ICEWebGL2BatchGenerationUploader.ts \
  packages/renderer/src/WebGL2GeometryCache.ts \
  packages/renderer/src/WebGL2RendererBackend.ts \
  packages/renderer/tests/BatchGenerationUploader.test.ts
git commit -m "feat(renderer): swap uploaded batch generations"
```

---

### Task 5: Integrate Idle Planning, Cancellation, and Metrics

**Files:**
- Create: `ice3-engine/packages/runtime/src/batching/ICEAdaptiveRenderBatchController.ts`
- Modify: `ice3-engine/packages/runtime/src/ICE3.ts`
- Modify: `ice3-engine/packages/runtime/src/asset/ICETilesetLoader.ts`
- Modify: `ice3-engine/packages/runtime/src/index.ts`
- Test: `ice3-engine/packages/runtime/tests/AdaptiveRenderBatch.test.ts`
- Test: `ice3-engine/tests/e2e/m1.spec.ts`

**Interfaces:**

```ts
type ICERenderBatchingMode = 'asset' | 'adaptive' | 'off';

interface ICERenderBatchingOptions {
  readonly mode: ICERenderBatchingMode;
  readonly maxWorkers?: number;
  readonly idleTaskBudgetMs?: number;
  readonly uploadBytesPerFrame?: number;
  readonly maxExtraGpuBytes?: number;
}
```

- Consumes: planner, pool, merger, uploader, and active visible work set.
- Produces: optional idle adaptive batching with stable fallback and diagnostics.

- [ ] **Step 1: Write failing controller tests**

```ts
expect(controller.request({
  cameraMoving: true,
  generation: 2,
  plan: acceptedPlan,
})).toEqual({ kind: 'deferred' });

expect(controller.request({
  cameraMoving: false,
  generation: 2,
  plan: acceptedPlan,
})).toEqual({ kind: 'started', generation: 2 });

controller.cancel(2);
expect(controller.activeGeneration).toBe(1);
```

Cover Worker failure, upload failure, memory rejection, and `adaptive` disabled.

- [ ] **Step 2: Verify RED**

```bash
npm test -- packages/runtime/tests/AdaptiveRenderBatch.test.ts
```

Expected: FAIL because the controller does not exist.

- [ ] **Step 3: Implement idle gating**

Start only when:

- camera and visible set are stable;
- the planner accepts the job;
- no candidate generation is active;
- the memory budget permits it.

Cancel on camera motion, target change, asset disposal, or newer generation.

- [ ] **Step 4: Add diagnostics**

Add:

- `ICE3_RENDER_BATCH_ADAPTIVE_STARTED`
- `ICE3_RENDER_BATCH_ADAPTIVE_COMPLETED`
- `ICE3_RENDER_BATCH_ADAPTIVE_CANCELLED`
- `ICE3_RENDER_BATCH_ADAPTIVE_FAILED`
- `ICE3_RENDER_BATCH_MEMORY_REJECTED`

Each diagnostic is deduplicated per generation.

- [ ] **Step 5: Add browser interaction regression**

In both Chromium and WebKit:

1. Load a batch-capable file.
2. Move the camera continuously.
3. Verify no candidate generation completes during motion.
4. Stop and wait for idle.
5. Verify at most one generation becomes active.
6. Verify selection and LOD remain correct.

- [ ] **Step 6: Run complete verification**

```bash
npm run verify
npm pack --workspaces --dry-run --json
```

Expected: all green and no model-like files in packages.

- [ ] **Step 7: Commit**

```bash
git add packages/runtime/src/batching/ICEAdaptiveRenderBatchController.ts \
  packages/runtime/src/ICE3.ts \
  packages/runtime/src/asset/ICETilesetLoader.ts \
  packages/runtime/src/index.ts \
  packages/runtime/tests/AdaptiveRenderBatch.test.ts \
  tests/e2e/m1.spec.ts
git commit -m "feat(runtime): add adaptive worker batching"
```

## Related Documents

- `ICE3-DOC-IDX-001` — [Documentation index](../README.md)
- `ICE3-DOC-SPEC-004` — [Industrial render batching specification](../specs/2026-10-27-industrial-render-batching-design.md)
