# Adaptive Industrial Render Batching Worker 实施计划

> Document ID: ICE3-DOC-PLAN-002
>
> Status: Implemented
>
> Owner: ICE3 architecture maintainers

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**目标：** 增加可选 idle-time Worker pipeline，在不阻塞 camera interaction、不产生部分
GPU state 的前提下生成更优 Runtime batch generation。

**架构：** Main-thread planner 只在 camera 稳定后选择有价值的 batch-building job。有界
Worker pool 生成 transferable batch buffer，byte-budgeted uploader 构建 candidate GPU
generation。Generation 原子激活；stale、failed 或 over-budget work 被丢弃，之前
generation 保持 active。

**技术栈：** Node.js 24.22.1 LTS、TypeScript 7、Web Worker、Transferable
ArrayBuffer、WebGL2、Node.js built-in test runner、`expect`、`tsx`、Playwright。

**规格：** `../specs/2026-10-27-industrial-render-batching-design.md`

## 全局约束

- 先完成 static batching；本计划消费该 batch model。
- 在功能分支工作，完整验证后才合入 `main`。
- 使用 `.nvmrc` 指定的 Node.js 24.22.1 LTS。
- 不增加 Runtime dependency。
- Runtime adaptive batching 可选，默认只在 idle 时运行。
- Camera active motion 期间不得执行大型 Geometry preparation 或 upload。
- 使用 Transferable ArrayBuffer；SharedArrayBuffer 可选且永非必需。
- Generation 失败或 stale 时，active generation 必须保持不变。
- 永不通过 public API 暴露 GPU object。
- 永不提交受控客户 Asset、派生文件、screenshot、log 或 path。
- 所有 artifact 中避免竞品名称和禁止的通用 3D library 品牌词。

## 审查重点

- Worker 生成 candidate 时 camera 开始移动；结果必须拒绝，不能应用到新 view。
- Worker transfer 将 ownership 从发送方移走；后续 code 不得读取或修改已转移 buffer。
- 一个 upload chunk 成功而下一个失败；旧 GPU generation 必须保持 active，不出现部分 swap 或 buffer leak。
- Generation 加载期间 Selection 变化；atomic swap 前，picking 和 highlight 继续使用 active generation。
- `hardwareConcurrency` 不可用或 Worker startup 失败；static batching 和普通 rendering 必须继续可用。

---

### Task 1：定义 Batch Plan 和 Cost Model

**文件：**
- 新建：`ice3-engine/packages/runtime/src/batching/ICERenderBatchPlanner.ts`
- 新建：`ice3-engine/packages/runtime/src/batching/ICERenderBatchPlan.ts`
- 测试：`ice3-engine/packages/runtime/tests/RenderBatchPlanner.test.ts`

**接口：**

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

- 消费：active Asset batch metadata 和 visibility set。
- 产出：确定性 accepted 或 rejected merge plan，不复制 array。

- [ ] **步骤 1：编写失败的 cost-model test**

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

覆盖零 draw saving、准确 byte budget、负数和确定性的 tie ordering。

- [ ] **步骤 2：验证 RED**

```bash
cd ../ice3-engine
source ~/.nvm/nvm.sh && nvm use 24
npm test -- packages/runtime/tests/RenderBatchPlanner.test.ts
```

预期：因为 planner type 不存在而失败。

- [ ] **步骤 3：实现确定性 planner**

按 Spec 中的公式估算 gain 和 cost。Candidate 依次按 material key、visible order、byte
size 和 ID 排序。超过 memory 或 minimum-gain threshold 的 plan 被拒绝。

- [ ] **步骤 4：运行聚焦测试**

```bash
npm test -- packages/runtime/tests/RenderBatchPlanner.test.ts
npm run typecheck
```

预期：通过。

- [ ] **步骤 5：提交**

```bash
git add packages/runtime/src/batching/ICERenderBatchPlan.ts \
  packages/runtime/src/batching/ICERenderBatchPlanner.ts \
  packages/runtime/tests/RenderBatchPlanner.test.ts
git commit -m "feat(runtime): plan adaptive render batches"
```

---

### Task 2：定义 Worker Protocol 和有界 Pool

**文件：**
- Create: `ice3-engine/packages/runtime/src/batching/ICEBatchWorkerProtocol.ts`
- Create: `ice3-engine/packages/runtime/src/batching/ICEBatchWorkerPool.ts`
- Create: `ice3-engine/packages/runtime/src/batching/createBatchWorker.ts`
- Test: `ice3-engine/packages/runtime/tests/BatchWorkerPool.test.ts`

**接口：**

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

- 消费：planner 接受的 source batch ID。
- 产出：有界异步 job 和 transferable Worker response。

- [ ] **步骤 1：使用 fake Worker 编写失败的 Worker pool test**

断言：

- Pool 不超过配置 concurrency。
- Transfer list 中每个 transferred ArrayBuffer 只出现一次。
- 中止 job 会移除 pending promise 并忽略 late response。
- Worker 构造失败返回文档化 fallback error。

- [ ] **步骤 2：验证 RED**

```bash
npm test -- packages/runtime/tests/BatchWorkerPool.test.ts
```

预期：因为 pool 不存在而失败。

- [ ] **步骤 3：实现 pool**

默认 concurrency：

```ts
Math.min(
  4,
  Math.max(
    1,
    (globalThis.navigator?.hardwareConcurrency ?? 2) - 1,
  ),
)
```

支持时使用 module Worker，否则回退到 classic Worker。每个 Worker 保持一个 job，并在
`dispose()` 时拒绝所有 pending request。

- [ ] **步骤 4：运行测试**

```bash
npm test -- packages/runtime/tests/BatchWorkerPool.test.ts
npm run typecheck
```

预期：通过。

- [ ] **步骤 5：提交**

```bash
git add packages/runtime/src/batching/ICEBatchWorkerProtocol.ts \
  packages/runtime/src/batching/ICEBatchWorkerPool.ts \
  packages/runtime/src/batching/createBatchWorker.ts \
  packages/runtime/tests/BatchWorkerPool.test.ts
git commit -m "feat(runtime): add bounded batch worker pool"
```

---

### Task 3：在 Worker 内合并 Geometry

**文件：**
- 新建：`ice3-engine/packages/runtime/src/workers/renderBatchWorker.ts`
- 新建：`ice3-engine/packages/runtime/src/batching/mergeBatchBuffers.ts`
- 测试：`ice3-engine/packages/runtime/tests/MergeBatchBuffers.test.ts`

**接口：**

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

- 消费：transfer 后的 source buffer。
- 产出：按配置 limit 拆分的确定性 merged typed array。

- [ ] **步骤 1：编写失败的 merge test**

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

同时覆盖 batch splitting、Material mismatch rejection、index overflow 和 empty input。

- [ ] **步骤 2：验证 RED**

```bash
npm test -- packages/runtime/tests/MergeBatchBuffers.test.ts
```

预期：因为 merge function 不存在而失败。

- [ ] **步骤 3：实现 zero-copy-friendly output allocation**

先计算准确 output length，一次分配，复制 typed range，应用 vertex offset，并从 Worker
transfer result buffer。

- [ ] **步骤 4：运行测试**

```bash
npm test -- packages/runtime/tests/MergeBatchBuffers.test.ts
npm run typecheck
```

预期：通过。

- [ ] **步骤 5：提交**

```bash
git add packages/runtime/src/workers/renderBatchWorker.ts \
  packages/runtime/src/batching/mergeBatchBuffers.ts \
  packages/runtime/tests/MergeBatchBuffers.test.ts
git commit -m "feat(runtime): merge render buffers in workers"
```

---

### Task 4：在 Frame Budget 内上传 Candidate Generation

**文件：**
- 新建：`ice3-engine/packages/renderer/src/ICEWebGL2BatchGenerationUploader.ts`
- 修改：`ice3-engine/packages/renderer/src/WebGL2GeometryCache.ts`
- 修改：`ice3-engine/packages/renderer/src/WebGL2RendererBackend.ts`
- 测试：`ice3-engine/packages/renderer/tests/BatchGenerationUploader.test.ts`

**接口：**

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

- 消费：Worker merged buffer。
- 产出：完整但非 active 的 GPU generation，随后执行一次 atomic activation callback。

- [ ] **步骤 1：编写失败的 uploader test**

覆盖：

- 永不超出 chunk byte cap。
- 最后一个 chunk 前不激活。
- Failure 释放全部 candidate GPU resource。
- Superseded generation 不激活。

- [ ] **步骤 2：验证 RED**

```bash
npm test -- packages/renderer/tests/BatchGenerationUploader.test.ts
```

预期：因为 uploader 不存在而失败。

- [ ] **步骤 3：实现 chunked upload**

只在 idle frame 上传。Active 和 candidate generation 分开保存。Activation 在单个
callback 中交换 generation ID；swap 完成后删除旧 resource。

- [ ] **步骤 4：运行 test 和 typecheck**

```bash
npm test -- packages/renderer/tests/BatchGenerationUploader.test.ts
npm run typecheck
```

预期：通过。

- [ ] **步骤 5：提交**

```bash
git add packages/renderer/src/ICEWebGL2BatchGenerationUploader.ts \
  packages/renderer/src/WebGL2GeometryCache.ts \
  packages/renderer/src/WebGL2RendererBackend.ts \
  packages/renderer/tests/BatchGenerationUploader.test.ts
git commit -m "feat(renderer): swap uploaded batch generations"
```

---

### Task 5：接入 Idle Planning、Cancellation 和 Metric

**文件：**
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

- 消费：planner、pool、merger、uploader 和 active visible work set。
- 产出：可选 idle adaptive batching，具有稳定 fallback 和 Diagnostic。

- [ ] **步骤 1：编写失败的 controller test**

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

覆盖 Worker failure、upload failure、memory rejection 和 `adaptive` disabled。

- [ ] **步骤 2：验证 RED**

```bash
npm test -- packages/runtime/tests/AdaptiveRenderBatch.test.ts
```

预期：因为 controller 不存在而失败。

- [ ] **步骤 3：实现 idle gating**

只有满足以下条件才启动：

- Camera 和 visible set 稳定。
- Planner 接受 job。
- 没有 active candidate generation。
- Memory budget 允许。

Camera motion、target change、Asset disposal 或 newer generation 时取消。

- [ ] **步骤 4：增加 Diagnostic**

增加：

- `ICE3_RENDER_BATCH_ADAPTIVE_STARTED`
- `ICE3_RENDER_BATCH_ADAPTIVE_COMPLETED`
- `ICE3_RENDER_BATCH_ADAPTIVE_CANCELLED`
- `ICE3_RENDER_BATCH_ADAPTIVE_FAILED`
- `ICE3_RENDER_BATCH_MEMORY_REJECTED`

每个 generation 的 Diagnostic 都去重。

- [ ] **步骤 5：增加 browser interaction regression**

在 Chromium 和 WebKit 中：

1. 加载支持 batch 的文件。
2. 持续移动 camera。
3. 验证 motion 期间没有 candidate generation 完成。
4. 停止并等待 idle。
5. 验证最多一个 generation 变为 active。
6. 验证 Selection 和 LOD 保持正确。

- [ ] **步骤 6：运行完整验证**

```bash
npm run verify
npm pack --workspaces --dry-run --json
```

预期：全部通过，package 中没有 model-like 文件。

- [ ] **步骤 7：提交**

```bash
git add packages/runtime/src/batching/ICEAdaptiveRenderBatchController.ts \
  packages/runtime/src/ICE3.ts \
  packages/runtime/src/asset/ICETilesetLoader.ts \
  packages/runtime/src/index.ts \
  packages/runtime/tests/AdaptiveRenderBatch.test.ts \
  tests/e2e/m1.spec.ts
git commit -m "feat(runtime): add adaptive worker batching"
```

## 关联文档

- `ICE3-DOC-IDX-001` — [文档索引](../README.md)
- `ICE3-DOC-SPEC-004` — [工业渲染 Batch Spec](../specs/2026-10-27-industrial-render-batching-design.md)
