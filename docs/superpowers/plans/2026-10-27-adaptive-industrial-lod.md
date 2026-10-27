# Adaptive Industrial LOD Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add deterministic per-unit adaptive coarse-model budget allocation while preserving the existing standard Tileset, Prepared GLB, and runtime contracts.

**Architecture:** The toolchain generates a bounded simplification curve for each semantic unit, stores sampled geometry in the existing temporary workspace, and greedily allocates a Tile's triangle budget to the highest marginal error reduction. Adaptive mode is opt-in in this phase; the existing proportional allocator remains byte-for-byte compatible.

**Tech Stack:** Node.js 24 LTS, TypeScript 7, ESM, npm workspaces, node-test 5, Prepared GLB, OGC 3D Tiles 1.1, `meshoptimizer` simplifier

**Spec:** `../ice3-doc/docs/superpowers/specs/2026-10-27-adaptive-industrial-lod-design.md`

## Global Constraints

- Use Node 24 from `.nvmrc`; do not verify with Node 25.
- Work on a feature branch and merge to `main` only after full verification.
- Do not add runtime dependencies.
- Do not add a private asset or Tileset format; output remains Prepared GLB and OGC 3D Tiles 1.1.
- Do not change engine runtime APIs in this phase.
- The existing `proportional` mode must retain its current output and tests.
- Adaptive generation is offline only.
- Selection IDs and semantic device boundaries must survive all sample and rebuild steps.
- Preserve vertex colors through workspace spilling and coarse reconstruction.
- Never write controlled customer assets or derived files into Git, packages, logs, tests, or documentation.
- Avoid competitor names and the prohibited generic 3D-library brand term in code, comments, tests, commits, and docs.
- All sampling and allocation must be deterministic for identical input, options, and tool version.

## Review Focus

- Device minimum triangle counts can exceed the adaptive Tile budget; the build must fail clearly instead of returning an over-budget coarse Tile.
- Spilled sampled geometry can silently lose vertex colors; tests must round-trip colors through both memory and disk paths.
- Simplification can plateau or retain source geometry, producing equal actual triangle counts; marginal-benefit division must skip zero-cost steps safely.
- The same semantic unit appears in multiple ancestor Tiles; its curve must be computed once and reused with the same selection identity.
- Rebuilding coarse GLBs from sampled workspace geometry can lose selection IDs; tests must assert every adaptive coarse node still exposes its source device identity.

## File Structure

- `packages/toolchain-core/src/partition/types.ts` owns public LOD configuration.
- `packages/toolchain-core/src/lod/types.ts` owns curve, sample, primitive, and allocation types.
- `packages/toolchain-core/src/lod/createLodSampleSchedule.ts` owns deterministic target-triangle sampling.
- `packages/toolchain-core/src/lod/allocateAdaptiveLod.ts` owns pure budget allocation.
- `packages/toolchain-core/src/lod/createLodUnitCurve.ts` owns unit-level sampled geometry generation.
- `packages/toolchain-core/src/lod/createGeometryWorkspace.ts` owns temporary sampled geometry storage.
- `packages/toolchain-core/src/partition/partitionAsset.ts` integrates curves into coarse-node construction while preserving proportional mode.
- `packages/cli/src/commands.ts` owns CLI parsing and validation.
- `packages/toolchain-core/src/index.ts` exports the new public types and functions.

---

### Task 1: Add LOD Configuration and Deterministic Sample Targets

**Files:**
- Modify: `ice3-toolchain/packages/toolchain-core/src/partition/types.ts`
- Create: `ice3-toolchain/packages/toolchain-core/src/lod/createLodSampleSchedule.ts`
- Create: `ice3-toolchain/tests/lod/createLodSampleSchedule.test.ts`
- Modify: `ice3-toolchain/packages/toolchain-core/src/index.ts`

**Interfaces:**
- Consumes: existing `ICELodBuildOptions`.
- Produces:

```ts
type ICELodAllocationMode = 'proportional' | 'adaptive';

interface ICELodBuildOptions {
  readonly allocation?: ICELodAllocationMode;
  readonly curveSamples?: number;
  // existing fields remain unchanged
}

function createLodSampleSchedule(options: {
  readonly sourceTriangles: number;
  readonly minimumTriangles: number;
  readonly sampleCount: number;
}): readonly number[];
```

- [ ] **Step 1: Write the failing schedule tests**

```ts
import { expect, test } from 'node-test';
import { createLodSampleSchedule } from '../../packages/toolchain-core/src/lod/createLodSampleSchedule.js';

test('builds deterministic logarithmic samples including both endpoints', () => {
  const first = createLodSampleSchedule({
    sourceTriangles: 1000,
    minimumTriangles: 10,
    sampleCount: 4,
  });
  const second = createLodSampleSchedule({
    sourceTriangles: 1000,
    minimumTriangles: 10,
    sampleCount: 4,
  });

  expect(first).toEqual([10, 46, 215, 1000]);
  expect(second).toEqual(first);
});

test('deduplicates tiny ranges and rejects invalid sample counts', () => {
  expect(createLodSampleSchedule({
    sourceTriangles: 4,
    minimumTriangles: 3,
    sampleCount: 8,
  })).toEqual([3, 4]);

  expect(() => createLodSampleSchedule({
    sourceTriangles: 8,
    minimumTriangles: 1,
    sampleCount: 3,
  })).toThrow(/ICE3_TOOL_LOD_INVALID/);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
cd ../ice3-toolchain
source "$HOME/.nvm/nvm.sh"
nvm use 24
npx node-test run tests/lod/createLodSampleSchedule.test.ts
```

Expected: FAIL because the module and exported function do not exist.

- [ ] **Step 3: Add the configuration types**

In `packages/toolchain-core/src/partition/types.ts`:

```ts
export type ICELodAllocationMode = 'proportional' | 'adaptive';

export interface ICELodBuildOptions {
  readonly allocation?: ICELodAllocationMode;
  readonly curveSamples?: number;
  readonly ratio: number;
  readonly maxTrianglesPerProxy: number;
  readonly minTrianglesPerUnit: number;
  readonly maxMemoryBytes?: number;
  readonly coarseChunkMaxBytes?: number;
}
```

- [ ] **Step 4: Implement deterministic logarithmic targets**

In `packages/toolchain-core/src/lod/createLodSampleSchedule.ts`:

```ts
export interface ICELodSampleScheduleOptions {
  readonly sourceTriangles: number;
  readonly minimumTriangles: number;
  readonly sampleCount: number;
}

export function createLodSampleSchedule(
  options: ICELodSampleScheduleOptions,
): readonly number[] {
  const { sourceTriangles, minimumTriangles, sampleCount } = options;
  if (
    !Number.isInteger(sourceTriangles)
    || sourceTriangles < 1
    || !Number.isInteger(minimumTriangles)
    || minimumTriangles < 1
    || minimumTriangles > sourceTriangles
    || !Number.isInteger(sampleCount)
    || sampleCount < 4
    || sampleCount > 32
  ) {
    throw new Error('ICE3_TOOL_LOD_INVALID: LOD sample schedule is invalid');
  }
  if (sourceTriangles === minimumTriangles) return [sourceTriangles];
  const logMinimum = Math.log(minimumTriangles);
  const logRange = Math.log(sourceTriangles) - logMinimum;
  const values = Array.from({ length: sampleCount }, (_value, index) => (
    Math.round(Math.exp(
      logMinimum + logRange * index / (sampleCount - 1),
    ))
  ));
  values[0] = minimumTriangles;
  values[values.length - 1] = sourceTriangles;
  return [...new Set(values)];
}
```

- [ ] **Step 5: Export the new type and function**

In `packages/toolchain-core/src/index.ts`:

```ts
export {
  createLodSampleSchedule,
  type ICELodSampleScheduleOptions,
} from './lod/createLodSampleSchedule.js';

export type {
  ICELodAllocationMode,
} from './partition/types.js';
```

- [ ] **Step 6: Run the focused tests and typecheck**

Run:

```bash
npx node-test run tests/lod/createLodSampleSchedule.test.ts
npm run typecheck
```

Expected: both commands PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/toolchain-core/src/partition/types.ts \
  packages/toolchain-core/src/lod/createLodSampleSchedule.ts \
  packages/toolchain-core/src/index.ts \
  tests/lod/createLodSampleSchedule.test.ts
git commit -m "feat(toolchain): define deterministic lod samples"
```

---

### Task 2: Implement the Adaptive Budget Allocator

**Files:**
- Create: `ice3-toolchain/packages/toolchain-core/src/lod/types.ts`
- Create: `ice3-toolchain/packages/toolchain-core/src/lod/allocateAdaptiveLod.ts`
- Create: `ice3-toolchain/tests/lod/allocateAdaptiveLod.test.ts`
- Modify: `ice3-toolchain/packages/toolchain-core/src/index.ts`

**Interfaces:**
- Consumes: actual triangle and error values produced by sampled curves.
- Produces:

```ts
interface ICELodCurveSample {
  readonly targetTriangles: number;
  readonly actualTriangles: number;
  readonly errorMeters: number;
  readonly preservedSource: boolean;
  readonly primitives: readonly {
    readonly sourceKey: string;
    readonly geometryKey: string;
  }[];
}

interface ICELodUnitCurve {
  readonly unitId: string;
  readonly sourceTriangles: number;
  readonly samples: readonly ICELodCurveSample[];
}

interface ICELodAllocationInput {
  readonly curves: readonly ICELodUnitCurve[];
  readonly maxTriangles: number;
  readonly nodeDiagonalMeters: number;
}

interface ICELodAllocation {
  readonly selections: readonly {
    readonly unitId: string;
    readonly sampleIndex: number;
    readonly actualTriangles: number;
    readonly errorMeters: number;
    readonly preservedSource: boolean;
    readonly primitives: ICELodCurveSample['primitives'];
  }[];
  readonly allocatedTriangles: number;
  readonly maximumErrorMeters: number;
}

function allocateAdaptiveLod(
  input: ICELodAllocationInput,
): ICELodAllocation;
```

- [ ] **Step 1: Write failing allocator tests**

```ts
import { expect, test } from 'node-test';
import {
  allocateAdaptiveLod,
  type ICELodUnitCurve,
} from '../../packages/toolchain-core/src/lod/allocateAdaptiveLod.js';

const curve = (
  unitId: string,
  samples: readonly [number, number][],
): ICELodUnitCurve => ({
  unitId,
  sourceTriangles: samples.at(-1)![0],
  samples: samples.map(([actualTriangles, errorMeters]) => ({
    targetTriangles: actualTriangles,
    actualTriangles,
    errorMeters,
    preservedSource: false,
    primitives: [],
  })),
});

test('spends the next triangle where normalized error reduction is highest', () => {
  const result = allocateAdaptiveLod({
    maxTriangles: 70,
    nodeDiagonalMeters: 10,
    curves: [
      curve('simple', [[10, 1], [20, 0.9], [100, 0.8]]),
      curve('complex', [[10, 2], [40, 0.5], [100, 0.1]]),
    ],
  });

  expect(result.allocatedTriangles).toBeLessThanOrEqual(70);
  expect(result.selections.find((entry) => entry.unitId === 'complex'))
    .toMatchObject({ sampleIndex: 1, actualTriangles: 40 });
  expect(result.selections.find((entry) => entry.unitId === 'simple'))
    .toMatchObject({ sampleIndex: 1, actualTriangles: 20 });
});

test('rejects an adaptive node when device minimums exceed its budget', () => {
  expect(() => allocateAdaptiveLod({
    maxTriangles: 15,
    nodeDiagonalMeters: 10,
    curves: [
      curve('a', [[8, 1], [100, 0]]),
      curve('b', [[8, 1], [100, 0]]),
    ],
  })).toThrow(/ICE3_TOOL_LOD_BUDGET_INVALID/);
});

test('uses stable unit IDs when marginal benefits are equal', () => {
  const result = allocateAdaptiveLod({
    maxTriangles: 40,
    nodeDiagonalMeters: 10,
    curves: [
      curve('b', [[10, 1], [20, 0]]),
      curve('a', [[10, 1], [20, 0]]),
    ],
  });

  expect(result.selections.map((entry) => entry.unitId)).toEqual(['a', 'b']);
  expect(result.selections.map((entry) => entry.actualTriangles)).toEqual([
    20, 20,
  ]);
});

test('skips zero-cost plateau steps without dividing by zero', () => {
  const result = allocateAdaptiveLod({
    maxTriangles: 20,
    nodeDiagonalMeters: 10,
    curves: [curve('plateau', [[10, 0], [10, 0], [20, 0]])],
  });

  expect(result.allocatedTriangles).toBe(10);
  expect(result.selections[0]!.sampleIndex).toBe(0);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
npx node-test run tests/lod/allocateAdaptiveLod.test.ts
```

Expected: FAIL because the allocator module does not exist.

- [ ] **Step 3: Define curve and allocation types**

Create `packages/toolchain-core/src/lod/types.ts` with the interfaces from the **Interfaces** block and export them from `allocateAdaptiveLod.ts`.

- [ ] **Step 4: Implement constrained greedy allocation**

In `packages/toolchain-core/src/lod/allocateAdaptiveLod.ts`:

```ts
import type {
  ICELodAllocation,
  ICELodAllocationInput,
  ICELodCurveSample,
  ICELodUnitCurve,
} from './types.js';

export function allocateAdaptiveLod(
  input: ICELodAllocationInput,
): ICELodAllocation {
  validateInput(input);
  const curves = [...input.curves].sort((left, right) => (
    left.unitId.localeCompare(right.unitId, 'en')
  ));
  const selected = curves.map(() => 0);
  let allocatedTriangles = curves.reduce(
    (total, curve) => total + curve.samples[0]!.actualTriangles,
    0,
  );
  if (allocatedTriangles > input.maxTriangles) {
    throw new Error(
      'ICE3_TOOL_LOD_BUDGET_INVALID: device minimums exceed proxy budget',
    );
  }

  while (allocatedTriangles < input.maxTriangles) {
    const candidates = curves.flatMap((curve, curveIndex) => {
      const sampleIndex = selected[curveIndex]! + 1;
      const previous = curve.samples[selected[curveIndex]!]!;
      const next = curve.samples[sampleIndex];
      if (!next) return [];
      const added = next.actualTriangles - previous.actualTriangles;
      const reduced = previous.errorMeters - next.errorMeters;
      if (added <= 0 || reduced <= 0) return [];
      if (allocatedTriangles + added > input.maxTriangles) return [];
      return [{
        curve,
        curveIndex,
        sampleIndex,
        added,
        benefit: (reduced / input.nodeDiagonalMeters) / added,
      }];
    }).sort((left, right) => (
      right.benefit - left.benefit
      || left.curve.unitId.localeCompare(right.curve.unitId, 'en')
      || left.sampleIndex - right.sampleIndex
    ));
    const winner = candidates[0];
    if (!winner) break;
    selected[winner.curveIndex] = winner.sampleIndex;
    allocatedTriangles += winner.added;
  }

  const selections = curves.map((curve, index) => {
    const sample = curve.samples[selected[index]!]!;
    return {
      unitId: curve.unitId,
      sampleIndex: selected[index]!,
      actualTriangles: sample.actualTriangles,
      errorMeters: sample.errorMeters,
      preservedSource: sample.preservedSource,
      primitives: sample.primitives,
    };
  });
  return {
    selections: Object.freeze(selections),
    allocatedTriangles,
    maximumErrorMeters: Math.max(
      0,
      ...selections.map((entry) => entry.errorMeters),
    ),
  };
}

function validateInput(input: ICELodAllocationInput): void {
  const ids = new Set<string>();
  if (
    !Number.isInteger(input.maxTriangles)
    || input.maxTriangles < 1
    || !Number.isFinite(input.nodeDiagonalMeters)
    || input.nodeDiagonalMeters <= 0
    || input.curves.length === 0
  ) {
    throw new Error('ICE3_TOOL_LOD_INVALID: adaptive allocation input is invalid');
  }
  for (const curve of input.curves) {
    if (!curve.unitId || ids.has(curve.unitId) || curve.samples.length < 1) {
      throw new Error('ICE3_TOOL_LOD_INVALID: adaptive curve is invalid');
    }
    ids.add(curve.unitId);
    let previousTriangles = -1;
    for (const sample of curve.samples) {
      if (
        !Number.isInteger(sample.actualTriangles)
        || sample.actualTriangles < 1
        || !Number.isFinite(sample.errorMeters)
        || sample.errorMeters < 0
        || sample.actualTriangles < previousTriangles
      ) {
        throw new Error('ICE3_TOOL_LOD_INVALID: adaptive sample is invalid');
      }
      previousTriangles = sample.actualTriangles;
    }
  }
}

export type {
  ICELodAllocation,
  ICELodAllocationInput,
  ICELodCurveSample,
  ICELodUnitCurve,
} from './types.js';
```

- [ ] **Step 5: Export the allocator**

In `packages/toolchain-core/src/index.ts`:

```ts
export {
  allocateAdaptiveLod,
  type ICELodAllocation,
  type ICELodAllocationInput,
  type ICELodCurveSample,
  type ICELodUnitCurve,
} from './lod/allocateAdaptiveLod.js';
```

- [ ] **Step 6: Run focused tests and typecheck**

Run:

```bash
npx node-test run tests/lod/allocateAdaptiveLod.test.ts \
  tests/lod/allocateLodTargets.test.ts
npm run typecheck
```

Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/toolchain-core/src/lod/types.ts \
  packages/toolchain-core/src/lod/allocateAdaptiveLod.ts \
  packages/toolchain-core/src/index.ts \
  tests/lod/allocateAdaptiveLod.test.ts
git commit -m "feat(toolchain): allocate lod by marginal error"
```

---

### Task 3: Preserve Vertex Colors in the Geometry Workspace

**Files:**
- Modify: `ice3-toolchain/packages/toolchain-core/src/lod/createGeometryWorkspace.ts`
- Modify: `ice3-toolchain/tests/lod/createGeometryWorkspace.test.ts`

**Interfaces:**
- Consumes: sampled positions, indices, and optional vertex colors.
- Produces:

```ts
interface ICEWorkspaceGeometry {
  readonly positions: Float32Array;
  readonly indices: Uint32Array;
  readonly colors?: Float32Array;
}
```

- [ ] **Step 1: Write failing memory and spill color tests**

Append to `tests/lod/createGeometryWorkspace.test.ts`:

```ts
test.each([1024, 1])(
  'round-trips vertex colors with maxMemoryBytes=%i',
  async (maxMemoryBytes) => {
    const workspace = await createGeometryWorkspace({ maxMemoryBytes });
    const colors = new Float32Array([
      1, 0, 0,
      0, 1, 0,
      0, 0, 1,
    ]);
    await workspace.write('color-unit', {
      positions: new Float32Array([
        0, 0, 0,
        1, 0, 0,
        0, 1, 0,
      ]),
      indices: new Uint32Array([0, 1, 2]),
      colors,
    });

    const loaded = await workspace.read('color-unit');

    expect([...loaded.colors!]).toEqual([...colors]);
    await workspace.dispose();
  },
);
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
npx node-test run tests/lod/createGeometryWorkspace.test.ts
```

Expected: FAIL because colors are not stored or returned.

- [ ] **Step 3: Extend the spill encoding**

In `createGeometryWorkspace.ts`:

- Add optional `colors` to `ICEWorkspaceGeometry` and `IGEStoredGeometry`.
- Increase the encoded header from 8 bytes to 12 bytes: position bytes, index bytes, color bytes.
- Include color bytes in the workspace memory limit.
- Copy colors after indices when spilling.
- Decode and validate color length as either three or four floats per vertex when present.
- Return a defensive copy for the in-memory path.

- [ ] **Step 4: Run focused tests**

Run:

```bash
npx node-test run tests/lod/createGeometryWorkspace.test.ts \
  tests/lod/simplifyGeometry.test.ts
npm run typecheck
```

Expected: both the spilled and in-memory color cases PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/toolchain-core/src/lod/createGeometryWorkspace.ts \
  tests/lod/createGeometryWorkspace.test.ts
git commit -m "feat(toolchain): retain colors in lod workspace"
```

---

### Task 4: Build Per-Unit Simplification Curves

**Files:**
- Create: `ice3-toolchain/packages/toolchain-core/src/lod/createLodUnitCurve.ts`
- Create: `ice3-toolchain/tests/lod/createLodUnitCurve.test.ts`
- Modify: `ice3-toolchain/packages/toolchain-core/src/lod/types.ts`
- Modify: `ice3-toolchain/packages/toolchain-core/src/index.ts`

**Interfaces:**
- Consumes: `simplifyGeometry`, `createLodSampleSchedule`, and prepared primitive geometry already stored with optional colors in the workspace.
- Produces:

```ts
interface ICELodCurvePrimitive {
  readonly sourceKey: string;
  readonly workspaceKey: string;
  readonly triangleCount: number;
}

function createLodUnitCurve(options: {
  readonly unitId: string;
  readonly sourceTriangles: number;
  readonly primitives: readonly ICELodCurvePrimitive[];
  readonly workspace: ICEGeometryWorkspace;
  readonly minimumTriangles: number;
  readonly sampleCount: number;
  readonly worldScale: number;
}): Promise<ICELodUnitCurve>;
```

- [ ] **Step 1: Write a failing curve test**

Create `tests/lod/createLodUnitCurve.test.ts` using a two-triangle colored workspace geometry:

```ts
import { expect, test } from 'node-test';
import { createGeometryWorkspace } from '../../packages/toolchain-core/src/lod/createGeometryWorkspace.js';
import { createLodUnitCurve } from '../../packages/toolchain-core/src/lod/createLodUnitCurve.js';

test('creates monotonic samples and retains sampled vertex colors', async () => {
  const workspace = await createGeometryWorkspace({ maxMemoryBytes: 1 });
  await workspace.write('0:0', {
    positions: new Float32Array([
      0, 0, 0,
      1, 0, 0,
      0, 1, 0,
      1, 1, 0,
    ]),
    indices: new Uint32Array([0, 1, 2, 1, 3, 2]),
    colors: new Float32Array([
      1, 0, 0, 1,
      0, 1, 0, 1,
      0, 0, 1, 1,
      1, 1, 1, 1,
    ]),
  });

  const curve = await createLodUnitCurve({
    unitId: 'unit-0',
    sourceTriangles: 2,
    primitives: [{
      sourceKey: '0:0',
      workspaceKey: '0:0',
      triangleCount: 2,
    }],
    workspace,
    minimumTriangles: 1,
    sampleCount: 4,
    worldScale: 1,
  });

  expect(curve.samples.map((sample) => sample.actualTriangles))
    .toEqual([...curve.samples]
      .map((sample) => sample.actualTriangles)
      .sort((left, right) => left - right));
  expect(curve.samples.at(-1)!.actualTriangles).toBe(2);
  const geometry = await workspace.read(
    curve.samples.at(-1)!.primitives[0]!.geometryKey,
  );
  expect(geometry.colors?.length).toBe(16);
  await workspace.dispose();
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
npx node-test run tests/lod/createLodUnitCurve.test.ts
```

Expected: FAIL because the curve module does not exist.

- [ ] **Step 3: Implement unit sample generation**

In `createLodUnitCurve.ts`:

```ts
export async function createLodUnitCurve(
  options: ICELodUnitCurveOptions,
): Promise<ICELodUnitCurve> {
  const schedule = createLodSampleSchedule({
    sourceTriangles: options.sourceTriangles,
    minimumTriangles: Math.min(
      options.minimumTriangles,
      options.sourceTriangles,
    ),
    sampleCount: options.sampleCount,
  });
  const samples: ICELodCurveSample[] = [];

  for (const [sampleIndex, targetTriangles] of schedule.entries()) {
    const primitives = [];
    let actualTriangles = 0;
    let errorMeters = 0;
    let preservedSource = false;

    for (const primitive of options.primitives) {
      const input = await options.workspace.read(primitive.workspaceKey);
      const target = Math.max(
        1,
        Math.floor(
          targetTriangles
            * primitive.triangleCount
            / Math.max(1, options.sourceTriangles),
        ),
      );
      const simplified = await simplifyGeometry(
        input.positions,
        input.indices,
        {
          targetTriangles: target,
          minimumTriangles: 1,
          ...(input.colors ? { vertexColors: input.colors } : {}),
        },
      );
      const geometryKey = [
        'curve',
        options.unitId,
        String(sampleIndex),
        primitive.sourceKey,
      ].join(':');
      await options.workspace.write(geometryKey, {
        positions: simplified.positions,
        indices: simplified.indices,
        ...(simplified.colors ? { colors: simplified.colors } : {}),
      });
      primitives.push({
        sourceKey: primitive.sourceKey,
        geometryKey,
      });
      actualTriangles += simplified.triangleCount;
      errorMeters = Math.max(
        errorMeters,
        simplified.errorMeters * options.worldScale,
      );
      preservedSource ||= simplified.preservedSource;
    }

    samples.push({
      targetTriangles,
      actualTriangles,
      errorMeters,
      preservedSource,
      primitives,
    });
  }

  return {
    unitId: options.unitId,
    sourceTriangles: options.sourceTriangles,
    samples,
  };
}
```

- [ ] **Step 4: Add a color-preserving test**

Extend the curve test to read every sampled geometry and assert that any geometry with colors has exactly three or four color components per vertex and finite values.

```ts
for (const sample of curve.samples) {
  for (const primitive of sample.primitives) {
    const geometry = await workspace.read(primitive.geometryKey);
    if (!geometry.colors) continue;
    expect([3, 4]).toContain(
      geometry.colors.length / (geometry.positions.length / 3),
    );
    expect(geometry.colors.every(Number.isFinite)).toBe(true);
  }
}
```

- [ ] **Step 5: Run focused tests**

Run:

```bash
npx node-test run tests/lod/createLodUnitCurve.test.ts \
  tests/lod/createGeometryWorkspace.test.ts \
  tests/lod/simplifyGeometry.test.ts
npm run typecheck
```

Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/toolchain-core/src/lod/types.ts \
  packages/toolchain-core/src/lod/createLodUnitCurve.ts \
  packages/toolchain-core/src/index.ts \
  tests/lod/createLodUnitCurve.test.ts
git commit -m "feat(toolchain): build per-unit lod curves"
```

---

### Task 5: Integrate Adaptive Allocation into Coarse Builds

**Files:**
- Modify: `ice3-toolchain/packages/toolchain-core/src/partition/partitionAsset.ts`
- Modify: `ice3-toolchain/tests/partition/lodGeneration.test.ts`
- Create: `ice3-toolchain/tests/partition/createAdaptiveLodSource.ts`

**Interfaces:**
- Consumes:

```ts
allocateAdaptiveLod(input): ICELodAllocation
createLodUnitCurve(options): Promise<ICELodUnitCurve>
```

- Produces: unchanged `ICEPartitionResult` files and Tileset, with adaptive coarse geometry when `lod.allocation === 'adaptive'`.

- [ ] **Step 1: Create a heterogeneous source fixture**

Create two semantic units with the same node count but different geometry complexity:

- Unit `simple-box`: an eight-triangle box.
- Unit `complex-grid`: a multi-segment curved or grid surface with substantially more triangles and a higher simplification error.

Create `tests/partition/createAdaptiveLodSource.ts`:

```ts
import type { ICESourceDocument } from '../../packages/toolchain-core/src/index.js';

const grid = (wave: boolean) => {
  const cells = 8;
  const positions: number[] = [];
  const indices: number[] = [];
  for (let y = 0; y <= cells; y += 1) {
    for (let x = 0; x <= cells; x += 1) {
      positions.push(
        x / cells,
        y / cells,
        wave ? Math.sin(x * Math.PI / 2) * Math.cos(y * Math.PI / 2) : 0,
      );
    }
  }
  for (let y = 0; y < cells; y += 1) {
    for (let x = 0; x < cells; x += 1) {
      const a = y * (cells + 1) + x;
      const b = a + 1;
      const c = a + cells + 1;
      const d = c + 1;
      indices.push(a, b, c, b, d, c);
    }
  }
  return {
    positions: new Float32Array(positions),
    indices: new Uint16Array(indices),
  };
};

export function createAdaptiveLodPartitionSource(): ICESourceDocument {
  const simple = grid(false);
  const complex = grid(true);
  const positionBytes = simple.positions.byteLength + complex.positions.byteLength;
  const indexBytes = simple.indices.byteLength + complex.indices.byteLength;
  const bytes = new Uint8Array(positionBytes + indexBytes);
  bytes.set(new Uint8Array(simple.positions.buffer), 0);
  bytes.set(
    new Uint8Array(complex.positions.buffer),
    simple.positions.byteLength,
  );
  bytes.set(
    new Uint8Array(simple.indices.buffer),
    positionBytes,
  );
  bytes.set(
    new Uint8Array(complex.indices.buffer),
    positionBytes + simple.indices.byteLength,
  );
  const view = (
    byteOffset: number,
    byteLength: number,
  ) => ({ buffer: 0, byteOffset, byteLength });
  return {
    baseDirectory: '.',
    buffers: [bytes],
    json: {
      asset: { version: '2.0' },
      scene: 0,
      scenes: [{ nodes: [0, 1] }],
      nodes: [
        { name: 'simple-grid', mesh: 0, translation: [0, 0, 0] },
        { name: 'complex-grid', mesh: 1, translation: [10, 0, 0] },
      ],
      meshes: [0, 1].map((index) => ({
        primitives: [{
          attributes: { POSITION: index * 2 },
          indices: index * 2 + 1,
          material: 0,
          mode: 4,
          extras: { ice3: { id: `source/mesh/${index}/primitive/0` } },
        }],
      })),
      materials: [{ name: 'steel' }],
      buffers: [{ byteLength: bytes.byteLength }],
      bufferViews: [
        view(0, simple.positions.byteLength),
        view(
          simple.positions.byteLength,
          complex.positions.byteLength,
        ),
        view(positionBytes, simple.indices.byteLength),
        view(
          positionBytes + simple.indices.byteLength,
          complex.indices.byteLength,
        ),
      ],
      accessors: [
        {
          bufferView: 0,
          componentType: 5126,
          count: simple.positions.length / 3,
          type: 'VEC3',
          min: [0, 0, 0],
          max: [1, 1, 0],
        },
        {
          bufferView: 1,
          componentType: 5126,
          count: complex.positions.length / 3,
          type: 'VEC3',
          min: [0, 0, -1],
          max: [1, 1, 1],
        },
        {
          bufferView: 2,
          componentType: 5123,
          count: simple.indices.length,
          type: 'SCALAR',
        },
        {
          bufferView: 3,
          componentType: 5123,
          count: complex.indices.length,
          type: 'SCALAR',
        },
      ],
    },
  };
}
```

Do not copy controlled customer geometry.

- [ ] **Step 2: Write the failing integration test**

Append to `tests/partition/lodGeneration.test.ts`:

```ts
test('uses different simplification rates for heterogeneous units', async () => {
  const result = await partitionAsset(createAdaptiveLodPartitionSource(), {
    assetId: 'adaptive-demo',
    maxTriangles: 64,
    lod: {
      allocation: 'adaptive',
      curveSamples: 6,
      ratio: 0.15,
      maxTrianglesPerProxy: 48,
      minTrianglesPerUnit: 4,
    },
  });

  expect(result.stats.allocationMode).toBe('adaptive');
  expect(result.stats.adaptiveUnitCount).toBeGreaterThan(0);
  expect(result.stats.maximumErrorMeters).toBeGreaterThan(0);
  expect(result.stats.overBudgetCoarseNodes).toBe(0);
  expect(result.files
    .filter((file) => file.path.startsWith('coarse/'))
    .every((file) => validatePreparedGLB(file.bytes).errors.length === 0))
    .toBe(true);
  const root = result.files.find(
    (file) => file.path === 'coarse/group-root.glb',
  )!;
  const nodes = readDocument(root.bytes).nodes;
  expect(nodes.every((node) => (
    node.extras.ice3.selectionId?.startsWith('adaptive-demo/node/')
  ))).toBe(true);
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run:

```bash
npx node-test run tests/partition/lodGeneration.test.ts -t heterogeneous
```

Expected: FAIL because `allocation`, `curveSamples`, and adaptive stats are not integrated.

- [ ] **Step 4: Add the curve cache**

Extend `ICBuildState`:

```ts
readonly lodCurveCache: Map<string, Promise<ICELodUnitCurve>>;
readonly adaptiveUnitIds: Set<string>;
readonly adaptiveRatios: number[];
maximumAdaptiveErrorMeters: number;
```

Add a helper in `partitionAsset.ts`:

```ts
function loadUnitCurve(
  source: ICESourceDocument,
  unit: ICEPartitionUnit,
  options: ICEPartitionOptions,
  state: ICBuildState,
  workspace: ICEGeometryWorkspace,
  normalized: ReadonlyMap<string, ICELodNormalizedPrimitive>,
): Promise<ICELodUnitCurve> {
  const unitId = unit.nodeIndices.join(',');
  const cached = state.lodCurveCache.get(unitId);
  if (cached) return cached;
  const worldScale = maximumWorldScale(state.worldMatrices, unit.nodeIndices);
  const primitives = unit.meshIndices.flatMap((meshIndex) => (
    meshPrimitives(source, meshIndex).flatMap((primitive) => {
      const normalizedPrimitive = normalized.get(
        `${meshIndex}:${primitive.index}`,
      );
      return normalizedPrimitive
        ? [{
            sourceKey: normalizedPrimitive.key,
            workspaceKey: normalizedPrimitive.key,
            triangleCount: normalizedPrimitive.triangleCount,
          }]
        : [];
    })
  ));
  const pending = createLodUnitCurve({
    unitId,
    sourceTriangles: unit.triangleCount,
    primitives,
    workspace,
    minimumTriangles: options.lod!.minTrianglesPerUnit,
    sampleCount: options.lod!.curveSamples ?? 8,
    worldScale,
  });
  state.lodCurveCache.set(unitId, pending);
  pending.catch(() => {
    if (state.lodCurveCache.get(unitId) === pending) {
      state.lodCurveCache.delete(unitId);
    }
  });
  return pending;
}
```

- [ ] **Step 5: Store source vertex colors in normalized workspace geometry**

In `normalizeLodGeometry`, read `COLOR_0` before writing the primitive:

```ts
const colorData = attributes?.COLOR_0 === undefined
  ? undefined
  : readAccessor(source, Number(attributes.COLOR_0));
if (
  colorData
  && (
    colorData.kind !== 'float32'
    || (colorData.components !== 3 && colorData.components !== 4)
  )
) {
  throw new Error(
    'ICE3_TOOL_LOD_INVALID: vertex colors must be float VEC3 or VEC4',
  );
}
await workspace.write(key, {
  positions: prepared.positions,
  indices: new Uint32Array(prepared.indices),
  ...(colorData ? { colors: colorData.values } : {}),
});
```

This makes the normalized workspace the single geometry source for both proportional and adaptive paths.

- [ ] **Step 6: Branch coarse construction by allocation mode**

In `buildSingleCoarseNode`, keep the current proportional path untouched. Add an adaptive path that:

1. Loads all unit curves through `loadUnitCurve`.
2. Computes the node diagonal from `node.bounds`.
3. Calls `allocateAdaptiveLod` with `maxTrianglesPerProxy`.
4. Loads each selected sample primitive from `workspace`.
5. Places those geometries in the existing `overrides` map by `sourceKey`.
6. Uses `allocation.maximumErrorMeters` for `coarseError`.
7. Sets `overBudget = allocation.allocatedTriangles > maxTrianglesPerProxy`.

Use this structure:

```ts
const selection = allocationByUnit.get(unitId)!;
for (const primitive of selection.primitives) {
  const geometry = await workspace.read(primitive.geometryKey);
  overrides.set(primitive.sourceKey, {
    positions: geometry.positions,
    indices: geometry.indices,
    ...(geometry.colors ? { colors: geometry.colors } : {}),
  });
}
```

- [ ] **Step 7: Update adaptive build stats**

When an adaptive coarse node becomes final:

- Add each unit ID with a sample ratio outside the node dominant ratio by more than `0.01` to `adaptiveUnitIds`.
- Record each selected unit ratio `actualTriangles / sourceTriangles`.
- Update `maximumAdaptiveErrorMeters`.

Expose in `ICEPartitionResult['stats']`:

```ts
readonly allocationMode: 'proportional' | 'adaptive';
readonly adaptiveUnitCount: number;
readonly minimumUnitTriangleRatio: number;
readonly maximumUnitTriangleRatio: number;
readonly maximumErrorMeters: number;
readonly curveSampleCount: number;
```

For proportional mode return:

```ts
allocationMode: 'proportional',
adaptiveUnitCount: 0,
minimumUnitTriangleRatio: 0,
maximumUnitTriangleRatio: 0,
maximumErrorMeters: 0,
curveSampleCount: 0,
```

- [ ] **Step 8: Preserve proportional byte-for-byte**

Add `createHash` from `node:crypto` to `tests/partition/lodGeneration.test.ts` and assert the existing synthetic output hashes:

```ts
const proportional = await partitionAsset(createLodPartitionSource(), {
  assetId: 'lod-demo',
  maxTriangles: 16,
  lod: {
    allocation: 'proportional',
    ratio: 0.15,
    maxTrianglesPerProxy: 64,
    minTrianglesPerUnit: 8,
  },
});
expect(proportional.files.map((file) => [
  file.path,
  file.bytes.byteLength,
  createHash('sha256').update(file.bytes).digest('hex'),
])).toEqual([
  ['coarse/group-root.glb', 6104,
    '44e6ecdd495068d90fdf2fb2deac6c029f1a2dc8c3d192431840375285df04dc'],
  ['coarse/group-root-0.glb', 4176,
    '645a87d54d4337f74dd1ea0b102962b9cb30fbd17802809e2c257000e3daa578'],
  ['parts/part-000.glb', 3396,
    '617a8d835d4e343649357842bd23a5ef24ac812947785a832ec55f572ea892fb'],
  ['parts/part-001.glb', 3400,
    'e8287b5683d161e023ea21a79b914fe91d2ba59a439a02e92a20ed5ac4ece7b5'],
  ['coarse/group-root-1.glb', 4180,
    'bc08f9361c72f8fbadb25bed9d9c2c40e7abb139404503cdb78f975aedb676e5'],
  ['parts/part-002.glb', 3400,
    '40bc30309ff6e07522e0731b50e2a4151bf99e0d132f1de8bdae00c4f1c5450b'],
  ['parts/part-003.glb', 3400,
    '1e7bd06bb7e9796e2a0ecb39c93bb19f0d8c14f2df66075f011fbfe0028f4f9a'],
]);
```

- [ ] **Step 9: Run integration tests**

Run:

```bash
npx node-test run tests/partition/lodGeneration.test.ts \
  tests/partition/partitionAsset.test.ts \
  tests/partition/tileset.test.ts
npm run typecheck
```

Expected: all PASS.

- [ ] **Step 10: Commit**

```bash
git add packages/toolchain-core/src/partition/partitionAsset.ts \
  tests/partition/lodGeneration.test.ts \
  tests/partition/createAdaptiveLodSource.ts
git commit -m "feat(toolchain): integrate adaptive coarse allocation"
```

---

### Task 6: Add CLI Controls and Validate Reports

**Files:**
- Modify: `ice3-toolchain/packages/cli/src/commands.ts`
- Modify: `ice3-toolchain/tests/cli/commands.test.ts`
- Modify: `ice3-toolchain/README.md`

**Interfaces:**
- Consumes: `ICELodAllocationMode` and `curveSamples`.
- Produces CLI options:

```text
--lod-allocation <proportional|adaptive>
--lod-curve-samples <count>
```

- [ ] **Step 1: Write failing CLI parsing tests**

Add:

```ts
test.each([
  [['--lod-allocation', 'adaptive'], 'adaptive'],
  [['--lod-allocation', 'proportional'], 'proportional'],
])('partition accepts allocation mode %j', async (arguments_, expected) => {
  const directory = mkdtempSync(join(tmpdir(), 'ice3-partition-'));
  directories.push(directory);
  const source = join(directory, 'source.gltf');
  writePartitionGLTF(source);
  const output = join(directory, 'dist');
  const printed: string[] = [];
  vi.spyOn(console, 'log').mockImplementation((value) => {
    printed.push(String(value));
  });

  expect(await runCli([
    'partition',
    source,
    '--output',
    output,
    '--asset-id',
    'adaptive-demo',
    '--lod',
    ...arguments_,
    '--json',
  ])).toBe(0);

  const result = JSON.parse(printed.at(-1)!) as {
    stats: { allocationMode: string };
  };
  expect(result.stats.allocationMode).toBe(expected);
});

test.each([
  [['--lod-allocation', 'unknown']],
  [['--lod-curve-samples', '3']],
  [['--lod-curve-samples', '33']],
  [['--lod-curve-samples', '4.5']],
])('partition rejects invalid adaptive options %j', async (arguments_) => {
  const directory = mkdtempSync(join(tmpdir(), 'ice3-partition-'));
  directories.push(directory);
  const source = join(directory, 'source.gltf');
  writePartitionGLTF(source);
  vi.spyOn(console, 'error').mockImplementation(() => {});

  expect(await runCli([
    'partition',
    source,
    '--output',
    join(directory, 'dist'),
    '--asset-id',
    'adaptive-demo',
    '--lod',
    ...arguments_,
  ])).toBe(1);
});
```

- [ ] **Step 2: Run CLI tests to verify failure**

Run:

```bash
npx node-test run tests/cli/commands.test.ts -t "allocation|adaptive"
```

Expected: FAIL because the options are unknown.

- [ ] **Step 3: Parse and validate options**

In `partitionCommand`:

```ts
const allocationValue = args.values.get('--lod-allocation') ?? 'proportional';
if (allocationValue !== 'proportional' && allocationValue !== 'adaptive') {
  throw new Error(
    'ICE3_TOOL_PARTITION_OPTIONS_INVALID: --lod-allocation must be proportional or adaptive',
  );
}
const curveSamples = positiveInteger(
  args.values.get('--lod-curve-samples') ?? '8',
  '--lod-curve-samples',
);
if (curveSamples < 4 || curveSamples > 32) {
  throw new Error(
    'ICE3_TOOL_PARTITION_OPTIONS_INVALID: --lod-curve-samples must be between 4 and 32',
  );
}
```

Return both values in the `lod` object and add both names to the valued-option set.

- [ ] **Step 4: Document CLI usage**

Add to `README.md`:

```text
--lod-allocation proportional|adaptive
  Select proportional or error-curve-based coarse-model allocation.
  Default: proportional.

--lod-curve-samples 4..32
  Number of logarithmic samples per semantic unit in adaptive mode.
  Default: 8.
```

- [ ] **Step 5: Run CLI and print validation**

Run:

```bash
npx node-test run tests/cli/commands.test.ts
npm run typecheck
```

Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/cli/src/commands.ts \
  tests/cli/commands.test.ts \
  README.md
git commit -m "feat(cli): expose adaptive lod allocation"
```

---

### Task 7: Run Real-Asset Comparison and Complete Integration

**Files:**
- Modify: `ice3-doc/docs/contracts/asset-preparation-contract-v1.md`
- Modify: `ice3-toolchain/README.md`
- Modify: `ice3-toolchain/tests/architecture/layout.test.ts` only if new public exports require it

- [ ] **Step 1: Run both full suites before the controlled comparison**

Run:

```bash
cd ../ice3-toolchain
source "$HOME/.nvm/nvm.sh"
nvm use 24
npm run verify

cd ../ice3-engine
npm run verify
```

Expected: zero failures. Engine code should not have changed, so the engine gate proves compatibility.

- [ ] **Step 2: Generate both modes outside Git**

Use an environment variable for the controlled source:

```bash
test -n "$ICE3_CONTROLLED_GLB"
output_root=$(mktemp -d /tmp/ice3-adaptive-lod.XXXXXX)

node packages/cli/dist/main.js partition "$ICE3_CONTROLLED_GLB" \
  --output "$output_root/proportional" \
  --asset-id controlled-adaptive-compare \
  --max-triangles 500000 \
  --max-bytes 33554432 \
  --lod \
  --lod-allocation proportional \
  --lod-ratio 0.15 \
  --lod-max-triangles 250000 \
  --lod-min-unit-triangles 8 \
  --coarse-chunk-max-bytes 33554432 \
  --skip-edges \
  --json

node packages/cli/dist/main.js partition "$ICE3_CONTROLLED_GLB" \
  --output "$output_root/adaptive" \
  --asset-id controlled-adaptive-compare \
  --max-triangles 500000 \
  --max-bytes 33554432 \
  --lod \
  --lod-allocation adaptive \
  --lod-curve-samples 8 \
  --lod-ratio 0.15 \
  --lod-max-triangles 250000 \
  --lod-min-unit-triangles 8 \
  --coarse-chunk-max-bytes 33554432 \
  --skip-edges \
  --json
```

Record only aggregate statistics from both JSON reports.

- [ ] **Step 3: Evaluate the acceptance gate**

Require:

- `oversizedCoarseChunks === 0`.
- Every coarse Tile stays within `maxTrianglesPerProxy`.
- Adaptive `maximumErrorMeters` or the high-percentile unit error is below proportional.
- Adaptive total coarse triangles do not exceed the configured budget.
- Generated coarse GLBs pass `validate` and the engine can load the Tileset.
- No page error or failed request occurs in Chromium or WebKit.

If the adaptive result does not improve fidelity, keep `proportional` as the default and document the measured reason.

- [ ] **Step 4: Update the shared contract**

In `ice3-doc/docs/contracts/asset-preparation-contract-v1.md`, document:

- `allocationMode`.
- `curveSamples`.
- Adaptive allocation statistics.
- `proportional` compatibility guarantee.
- The rule that adaptive allocation never changes the Tileset schema.

In `ice3-toolchain/README.md`, document how adaptive curves are generated, cached, spilled, and cleaned.

- [ ] **Step 5: Audit sensitive and naming constraints**

Run:

```bash
git status --porcelain=v1
git grep -I -n 'CONTROLLED_ASSET_NAME' -- . ':!package-lock.json' || true
git ls-files '*.glb' '*.gltf' '*.bin' | wc -l
```

Expected:

- No controlled source or derived output appears.
- No customer identifier appears.
- Tracked model fixtures are only reviewed synthetic assets.

- [ ] **Step 6: Remove temporary output**

After recording aggregate results, delete the exact `mktemp` directory created in Step 2. Do not use a broad directory target.

- [ ] **Step 7: Run final verification**

```bash
cd ../ice3-toolchain
source "$HOME/.nvm/nvm.sh"
nvm use 24
npm run verify
npm pack --workspaces --dry-run --json

cd ../ice3-engine
npm run verify
npm pack --workspaces --dry-run --json
```

Expected:

- All tests pass.
- No model-like files appear in package listings.
- Git worktrees are clean after committing documentation changes.

- [ ] **Step 8: Commit the final documentation**

```bash
cd ../ice3-doc
git add docs/contracts/asset-preparation-contract-v1.md
git commit -m "docs: define adaptive lod allocation contract"

cd ../ice3-toolchain
git add README.md
git commit -m "docs: describe adaptive lod generation"
```
