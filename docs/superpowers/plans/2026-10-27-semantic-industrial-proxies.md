# Semantic Industrial Proxies Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add conservative offline OBB and cylinder proxies as optional adaptive-LOD samples while preserving the standard Tileset, Prepared GLB, selection identity, and runtime API.

**Architecture:** The toolchain fits a proxy from source mesh geometry, accepts it only when surface deviation, volume inflation, and triangle reduction all pass fixed thresholds, and stores the candidate in the bounded workspace. Adaptive LOD compares that mesh replacement with primitive QEM samples; the Prepared GLB builder swaps mesh geometry without changing nodes or selection IDs.

**Tech Stack:** Node.js 24 LTS, TypeScript 7, ESM, npm workspaces, node-test 5, Prepared GLB, OGC 3D Tiles 1.1

**Spec:** `../ice3-doc/docs/superpowers/specs/2026-10-27-semantic-industrial-proxy-design.md`

## Global Constraints

- Use Node 24 from `.nvmrc`; do not verify with Node 25.
- Work on a feature branch and merge to `main` only after full verification.
- Do not add runtime dependencies.
- Proxy generation is offline toolchain work only.
- `--semantic-proxy` defaults to `off`.
- Semantic proxies require `--lod --lod-allocation adaptive`.
- Do not add a private asset format, Tileset field, or proxy-specific runtime API.
- Do not change node IDs, node matrices, or `selectionId`.
- Do not merge or delete semantic devices.
- Fixed acceptance thresholds are normalized surface deviation `<= 0.05`, volume inflation `<= 2.0`, and triangle reduction `>= 8`.
- Devices below `64` source triangles do not receive proxies.
- OBB and cylinder candidates only; no convex hull, part segmentation, voxelization, or manual override.
- Mixed vertex-color rules are conservative: use averaged vertex color only when every contributing primitive has colors; otherwise use the dominant material.
- Preserve deterministic candidate ordering, eigenvector signs, material choice, and output bytes.
- Never write controlled customer assets or derived files into Git, tests, screenshots, logs, packages, or documentation.
- Avoid competitor names and the prohibited generic 3D-library brand term in all artifacts.

## Review Focus

- Thin, flat, or zero-volume source bounds can make volume and deviation ratios divide by zero; they must produce a deterministic rejection rather than `NaN` or a huge proxy.
- A mesh can be instanced by multiple nodes; proxy geometry must remain in mesh-local coordinates while world error uses the maximum node scale.
- A device can contain mixed materials or partially missing vertex colors; the proxy must use the deterministic dominant material rather than inventing blended material semantics.
- A selected proxy and QEM samples can coexist in one Tile; mesh replacement must take precedence only for its source mesh and must not duplicate remaining primitive geometry.
- Candidate fitting or proxy GLB reconstruction can fail on degenerate triangles; single-device proxy failures must fall back to QEM unless a selected proxy later becomes invalid during output construction.

## File Structure

- `packages/toolchain-core/src/lod/semanticProxy/types.ts` owns proxy candidates, fit samples, quality metrics, and rejection reasons.
- `packages/toolchain-core/src/lod/semanticProxy/collectFitSamples.ts` owns deterministic vertex, centroid, area, and bounds collection.
- `packages/toolchain-core/src/lod/semanticProxy/fitProxyGeometry.ts` owns principal axes, OBB geometry, and cylinder geometry.
- `packages/toolchain-core/src/lod/semanticProxy/evaluateProxy.ts` owns surface deviation, volume, and acceptance rules.
- `packages/toolchain-core/src/lod/semanticProxy/createSemanticProxy.ts` owns material/color selection and workspace storage.
- `packages/toolchain-core/src/output/buildPreparedGLB.ts` owns source-mesh geometry replacement.
- `packages/toolchain-core/src/lod/createLodUnitCurve.ts` owns adding an accepted proxy as a curve sample.
- `packages/toolchain-core/src/partition/partitionAsset.ts` owns candidate caching, adaptive integration, and proxy report stats.
- `packages/cli/src/commands.ts` owns `--semantic-proxy`.

---

### Task 1: Collect Deterministic Fit Samples

**Files:**
- Create: `ice3-toolchain/packages/toolchain-core/src/lod/semanticProxy/types.ts`
- Create: `ice3-toolchain/packages/toolchain-core/src/lod/semanticProxy/collectFitSamples.ts`
- Create: `ice3-toolchain/tests/lod/semanticProxy/collectFitSamples.test.ts`
- Modify: `ice3-toolchain/packages/toolchain-core/src/partition/types.ts`
- Modify: `ice3-toolchain/packages/toolchain-core/src/index.ts`

**Interfaces:**
- Consumes: `ICEWorkspaceGeometry[]`.
- Produces:

```ts
interface ICESemanticProxyFitSamples {
  readonly vertices: Float32Array;
  readonly centroids: Float32Array;
  readonly areas: Float32Array;
  readonly bounds: ICEBounds;
}

type ICESemanticProxyMode = 'off' | 'auto';

function collectFitSamples(
  geometries: readonly ICEWorkspaceGeometry[],
): ICESemanticProxyFitSamples;
```

- [ ] **Step 1: Write the failing sample test**

```ts
import { expect, test } from 'node-test';
import { collectFitSamples } from '../../../packages/toolchain-core/src/lod/semanticProxy/collectFitSamples.js';

test('collects unique vertices, triangle centroids, areas, and bounds', () => {
  const samples = collectFitSamples([{
    positions: new Float32Array([
      0, 0, 0,
      2, 0, 0,
      0, 2, 0,
      2, 2, 0,
    ]),
    indices: new Uint32Array([0, 1, 2, 1, 3, 2]),
  }]);

  expect(samples.vertices.length / 3).toBe(4);
  expect(samples.centroids.length / 3).toBe(2);
  expect(samples.areas).toHaveLength(2);
  expect([...samples.areas]).toEqual([2, 2]);
  expect(samples.bounds).toEqual({
    min: [0, 0, 0],
    max: [2, 2, 0],
  });
});

test('deduplicates coincident vertices and centroids deterministically', () => {
  const geometry = {
    positions: new Float32Array([
      0, 0, 0,
      1, 0, 0,
      0, 1, 0,
    ]),
    indices: new Uint32Array([0, 1, 2]),
  };
  const first = collectFitSamples([geometry, geometry]);
  const second = collectFitSamples([geometry, geometry]);

  expect(first.vertices.length / 3).toBe(3);
  expect(first.centroids.length / 3).toBe(1);
  expect([...first.vertices]).toEqual([...second.vertices]);
  expect([...first.centroids]).toEqual([...second.centroids]);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
cd ../ice3-toolchain
source "$HOME/.nvm/nvm.sh"
nvm use 24
npx node-test run tests/lod/semanticProxy/collectFitSamples.test.ts
```

Expected: FAIL because the proxy modules do not exist.

- [ ] **Step 3: Define proxy sample types**

In `semanticProxy/types.ts`, add the fit sample interface and the proxy type from the spec:

```ts
export type ICESemanticProxyKind = 'obb' | 'cylinder';

export interface ICESemanticProxy {
  readonly id: string;
  readonly kind: ICESemanticProxyKind;
  readonly meshIndex: number;
  readonly triangleCount: number;
  readonly normalizedMaximumDeviation: number;
  readonly volumeInflation: number;
  readonly errorMeters: number;
  readonly materialIndex?: number;
  readonly geometryKey: string;
  readonly colors?: Float32Array;
}

export interface ICESemanticProxyFitSamples {
  readonly vertices: Float32Array;
  readonly centroids: Float32Array;
  readonly areas: Float32Array;
  readonly bounds: ICEBounds;
}
```

- [ ] **Step 4: Implement deterministic collection**

In `collectFitSamples.ts`, process every triangle:

```ts
for (let offset = 0; offset < input.indices.length; offset += 3) {
  const a = vertex(input, input.indices[offset]!);
  const b = vertex(input, input.indices[offset + 1]!);
  const c = vertex(input, input.indices[offset + 2]!);
  const area = triangleArea(a, b, c);
  if (area <= 1e-12) continue;
  insertUnique(vertices, a);
  insertUnique(vertices, b);
  insertUnique(vertices, c);
  insertUnique(centroids, [
    (a[0] + b[0] + c[0]) / 3,
    (a[1] + b[1] + c[1]) / 3,
    (a[2] + b[2] + c[2]) / 3,
  ]);
  areas.push(area);
}
```

Use `Math.round(value * 100_000)` for duplicate keys. Compute bounds from every original vertex before triangle filtering. If no positive-area triangle exists, throw `ICE3_TOOL_PROXY_FIT_INVALID`.

- [ ] **Step 5: Export public types**

In `packages/toolchain-core/src/index.ts`:

```ts
export {
  collectFitSamples,
  type ICESemanticProxyFitSamples,
} from './lod/semanticProxy/collectFitSamples.js';
export type {
  ICESemanticProxy,
  ICESemanticProxyKind,
} from './lod/semanticProxy/types.js';
```

In `packages/toolchain-core/src/partition/types.ts`, add `semanticProxy` to
`ICELodBuildOptions`:

```ts
export type ICESemanticProxyMode = 'off' | 'auto';

export interface ICELodBuildOptions {
  readonly semanticProxy?: ICESemanticProxyMode;
  // existing fields remain unchanged
}
```

Add `ICESemanticProxyMode` to the partition-type export list in the core
index.

- [ ] **Step 6: Run the focused test and typecheck**

Run:

```bash
npx node-test run tests/lod/semanticProxy/collectFitSamples.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/toolchain-core/src/lod/semanticProxy/types.ts \
  packages/toolchain-core/src/lod/semanticProxy/collectFitSamples.ts \
  packages/toolchain-core/src/partition/types.ts \
  packages/toolchain-core/src/index.ts \
  tests/lod/semanticProxy/collectFitSamples.test.ts
git commit -m "feat(toolchain): collect semantic proxy samples"
```

---

### Task 2: Fit Deterministic OBB and Cylinder Geometry

**Files:**
- Create: `ice3-toolchain/packages/toolchain-core/src/lod/semanticProxy/fitProxyGeometry.ts`
- Create: `ice3-toolchain/tests/lod/semanticProxy/fitProxyGeometry.test.ts`
- Modify: `ice3-toolchain/packages/toolchain-core/src/lod/semanticProxy/types.ts`
- Modify: `ice3-toolchain/packages/toolchain-core/src/index.ts`

**Interfaces:**
- Consumes: `ICESemanticProxyFitSamples`.
- Produces:

```ts
interface ICESemanticProxyGeometryCandidate {
  readonly id: string;
  readonly kind: ICESemanticProxyKind;
  readonly positions: Float32Array;
  readonly indices: Uint32Array;
  readonly triangleCount: number;
  readonly volume: number;
  readonly axisStable: boolean;
}

interface ICESemanticProxyFitResult {
  readonly candidates: readonly ICESemanticProxyGeometryCandidate[];
  readonly rejectionReasons: readonly string[];
}

function fitProxyGeometry(
  samples: ICESemanticProxyFitSamples,
): ICESemanticProxyFitResult;
```

- [ ] **Step 1: Write failing OBB and cylinder tests**

```ts
import { expect, test } from 'node-test';
import { fitProxyGeometry } from '../../../packages/toolchain-core/src/lod/semanticProxy/fitProxyGeometry.js';

test('fits an oriented box with twelve triangles', () => {
  const result = fitProxyGeometry({
    vertices: new Float32Array([
      -2, -1, -1,
      2, -1, -1,
      -2, 1, -1,
      2, 1, -1,
      -2, -1, 1,
      2, -1, 1,
      -2, 1, 1,
      2, 1, 1,
    ]),
    centroids: new Float32Array([-2, 0, 0, 2, 0, 0]),
    areas: new Float32Array([1, 1]),
    bounds: { min: [-2, -1, -1], max: [2, 1, 1] },
  });
  const obb = result.candidates.find((candidate) => candidate.kind === 'obb')!;

  expect(obb.triangleCount).toBe(12);
  expect(obb.axisStable).toBe(true);
  expect(obb.positions.length).toBe(24);
  expect(obb.indices.length).toBe(36);
});

test('fits a cylinder for an elongated radial shape', () => {
  const values: number[] = [];
  for (let segment = 0; segment < 16; segment += 1) {
    const angle = segment / 16 * Math.PI * 2;
    values.push(
      Math.cos(angle),
      -3,
      Math.sin(angle),
      Math.cos(angle),
      3,
      Math.sin(angle),
    );
  }
  const result = fitProxyGeometry({
    vertices: new Float32Array(values),
    centroids: new Float32Array([0, -3, 0, 0, 3, 0]),
    areas: new Float32Array([1, 1]),
    bounds: { min: [-1, -3, -1], max: [1, 3, 1] },
  });
  const cylinder = result.candidates.find(
    (candidate) => candidate.kind === 'cylinder',
  )!;

  expect(cylinder.triangleCount).toBe(64);
  expect(cylinder.axisStable).toBe(true);
});

test('rejects an isotropic or zero covariance fit', () => {
  const result = fitProxyGeometry({
    vertices: new Float32Array([1, 1, 1]),
    centroids: new Float32Array([1, 1, 1]),
    areas: new Float32Array([1]),
    bounds: { min: [1, 1, 1], max: [1, 1, 1] },
  });

  expect(result.candidates).toEqual([]);
  expect(result.rejectionReasons).toContain('degenerate_covariance');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
npx node-test run tests/lod/semanticProxy/fitProxyGeometry.test.ts
```

Expected: FAIL because the fitting module does not exist.

- [ ] **Step 3: Implement area-weighted covariance and principal axes**

Use a deterministic Jacobi eigensolver for the symmetric 3x3 matrix:

```ts
function symmetricEigen(
  matrix: readonly [
    number, number, number,
    number, number, number,
    number, number, number,
  ],
): { readonly values: readonly number[]; readonly vectors: readonly number[][] } {
  let a = matrix.map((row) => [...row]);
  let v = identity3();
  for (let iteration = 0; iteration < 32; iteration += 1) {
    const [p, q] = largestOffDiagonal(a);
    if (Math.abs(a[p]![q]!) <= 1e-12) break;
    const angle = 0.5 * Math.atan2(
      2 * a[p]![q]!,
      a[q]![q]! - a[p]![p]!,
    );
    rotateSymmetric(a, p, q, angle);
    rotateVectors(v, p, q, angle);
  }
  return sortEigen(a, v);
}
```

Normalize every eigenvector. For each vector, make the component with largest absolute value positive; ties use `x`, then `y`, then `z`.

Reject covariance when:

```ts
lambda1 <= 1e-12
|| (lambda2 / lambda1 > 0.9 && lambda3 / lambda1 > 0.8)
```

- [ ] **Step 4: Generate OBB geometry**

Project every source vertex and centroid onto the 3 principal axes. Compute min/max per axis and add a safety margin of `max(1e-6, diagonal * 1e-6)`. Emit exactly 8 vertices and 12 triangles.

Set:

```ts
id: 'obb'
kind: 'obb'
triangleCount: 12
volume: extentA * extentB * extentC
```

- [ ] **Step 5: Generate cylinder geometry**

Use the first principal axis. Project all fit points onto that axis and its orthogonal plane.

```ts
const halfHeight = (maxAlongAxis - minAlongAxis) / 2;
const centerAlongAxis = (maxAlongAxis + minAlongAxis) / 2;
const radius = Math.max(
  ...points.map((point) => distanceToAxis(point, center, axis)),
);
```

Generate 16 segments with deterministic winding and two cap centers. Emit 64 triangles.

Reject when:

```ts
halfHeight <= 0
|| radius <= 0
|| (2 * halfHeight) / (2 * radius) < 1.25
```

- [ ] **Step 6: Export fitting interfaces**

In `packages/toolchain-core/src/index.ts`:

```ts
export {
  fitProxyGeometry,
  type ICESemanticProxyFitResult,
  type ICESemanticProxyGeometryCandidate,
} from './lod/semanticProxy/fitProxyGeometry.js';
```

- [ ] **Step 7: Run fitting tests and typecheck**

Run:

```bash
npx node-test run tests/lod/semanticProxy/fitProxyGeometry.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add packages/toolchain-core/src/lod/semanticProxy/types.ts \
  packages/toolchain-core/src/lod/semanticProxy/fitProxyGeometry.ts \
  packages/toolchain-core/src/index.ts \
  tests/lod/semanticProxy/fitProxyGeometry.test.ts
git commit -m "feat(toolchain): fit obb and cylinder proxies"
```

---

### Task 3: Evaluate Proxy Quality, Material, and Color

**Files:**
- Create: `ice3-toolchain/packages/toolchain-core/src/lod/semanticProxy/evaluateProxy.ts`
- Create: `ice3-toolchain/packages/toolchain-core/src/lod/semanticProxy/createSemanticProxy.ts`
- Create: `ice3-toolchain/tests/lod/semanticProxy/createSemanticProxy.test.ts`
- Modify: `ice3-toolchain/packages/toolchain-core/src/lod/types.ts`
- Modify: `ice3-toolchain/packages/toolchain-core/src/index.ts`

**Interfaces:**
- Consumes:

```ts
interface ICESemanticProxyCreateOptions {
  readonly meshIndex: number;
  readonly sourceTriangles: number;
  readonly primitives: readonly ICELodUnitPrimitive[];
  readonly workspace: ICEGeometryWorkspace;
  readonly worldScale: number;
}
```

- Produces:

```ts
interface ICESemanticProxyCreateResult {
  readonly proxy?: ICESemanticProxy;
  readonly rejectionReason?: string;
}

function createSemanticProxy(
  options: ICESemanticProxyCreateOptions,
): Promise<ICESemanticProxyCreateResult>;
```

Extend `ICELodUnitPrimitive`:

```ts
readonly materialIndex?: number;
```

- [ ] **Step 1: Write failing acceptance and fallback tests**

```ts
import { expect, test } from 'node-test';
import { createGeometryWorkspace } from '../../../packages/toolchain-core/src/lod/createGeometryWorkspace.js';
import { createSemanticProxy } from '../../../packages/toolchain-core/src/lod/semanticProxy/createSemanticProxy.js';

const box = (scale = 2, triangles = 128) => {
  const half = scale / 2;
  const positions = new Float32Array([
    -half, -half, -half,
    half, -half, -half,
    -half, half, -half,
    half, half, -half,
    -half, -half, half,
    half, -half, half,
    -half, half, half,
    half, half, half,
  ]);
  const boxTriangles = new Uint32Array([
    0, 2, 1, 1, 2, 3,
    4, 5, 6, 5, 7, 6,
    0, 1, 4, 1, 5, 4,
    2, 6, 3, 3, 6, 7,
    0, 4, 2, 2, 4, 6,
    1, 3, 5, 3, 7, 5,
  ]);
  const indices = new Uint32Array(triangles * 3);
  for (let index = 0; index < triangles; index += 1) {
    indices.set(
      boxTriangles.subarray(index % 12 * 3, index % 12 * 3 + 3),
      index * 3,
    );
  }
  return {
    positions,
    indices,
  };
};

test('accepts a compact high-reduction proxy', async () => {
  const workspace = await createGeometryWorkspace({ maxMemoryBytes: 1 });
  await workspace.write('0:0', box());
  const result = await createSemanticProxy({
    meshIndex: 0,
    sourceTriangles: 128,
    primitives: [{
      sourceKey: '0:0',
      workspaceKey: '0:0',
      triangleCount: 128,
      materialIndex: 3,
    }],
    workspace,
    worldScale: 2,
  });

  expect(result.proxy).toMatchObject({
    kind: expect.stringMatching(/obb|cylinder/),
    materialIndex: 3,
    errorMeters: expect.any(Number),
  });
  expect(result.proxy!.triangleCount).toBeLessThanOrEqual(16);
  await workspace.dispose();
});

test('falls back when triangle savings are insufficient', async () => {
  const workspace = await createGeometryWorkspace({ maxMemoryBytes: 1 });
  await workspace.write('0:0', box());
  const result = await createSemanticProxy({
    meshIndex: 0,
    sourceTriangles: 64,
    primitives: [{
      sourceKey: '0:0',
      workspaceKey: '0:0',
      triangleCount: 64,
    }],
    workspace,
    worldScale: 1,
  });

  expect(result.proxy).toBeUndefined();
  expect(result.rejectionReason).toBeDefined();
  await workspace.dispose();
});

test('scales proxy error by the maximum node world scale', async () => {
  const create = async (worldScale: number) => {
    const workspace = await createGeometryWorkspace({ maxMemoryBytes: 1 });
    await workspace.write('0:0', box());
    const result = await createSemanticProxy({
      meshIndex: 0,
      sourceTriangles: 128,
      primitives: [{
        sourceKey: '0:0',
        workspaceKey: '0:0',
        triangleCount: 128,
      }],
      workspace,
      worldScale,
    });
    await workspace.dispose();
    return result.proxy!;
  };
  const single = await create(1);
  const scaled = await create(4);

  expect(scaled.errorMeters).toBeCloseTo(single.errorMeters * 4, 8);
});

test('falls back to the smallest material when colors are incomplete', async () => {
  const workspace = await createGeometryWorkspace({ maxMemoryBytes: 1 });
  const colored = {
    ...box(),
    colors: new Float32Array(Array.from({ length: 32 }, (_value, index) => (
      index % 4 === 3 ? 1 : 0.5
    ))),
  };
  await workspace.write('0:0', colored);
  await workspace.write('0:1', box());
  const result = await createSemanticProxy({
    meshIndex: 0,
    sourceTriangles: 128,
    primitives: [
      {
        sourceKey: '0:0',
        workspaceKey: '0:0',
        triangleCount: 64,
        materialIndex: 2,
      },
      {
        sourceKey: '0:1',
        workspaceKey: '0:1',
        triangleCount: 64,
        materialIndex: 1,
      },
    ],
    workspace,
    worldScale: 1,
  });

  expect(result.proxy?.colors).toBeUndefined();
  expect(result.proxy?.materialIndex).toBe(1);
  await workspace.dispose();
});

test('rejects zero-volume fit bounds without producing NaN', async () => {
  const workspace = await createGeometryWorkspace({ maxMemoryBytes: 1024 });
  const indices = new Uint32Array(96 * 3);
  for (let triangle = 0; triangle < 96; triangle += 1) {
    indices.set([0, 1, 2], triangle * 3);
  }
  await workspace.write('0:0', {
    positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
    indices,
  });
  const result = await createSemanticProxy({
    meshIndex: 0,
    sourceTriangles: 96,
    primitives: [{
      sourceKey: '0:0',
      workspaceKey: '0:0',
      triangleCount: 96,
    }],
    workspace,
    worldScale: 1,
  });

  expect(result.proxy).toBeUndefined();
  expect(result.rejectionReason).toMatch(/volume|degenerate|covariance|shape/);
  await workspace.dispose();
});

test('rejects devices below the proxy triangle floor', async () => {
  const workspace = await createGeometryWorkspace({ maxMemoryBytes: 1024 });
  await workspace.write('0:0', box(2, 63));
  const result = await createSemanticProxy({
    meshIndex: 0,
    sourceTriangles: 63,
    primitives: [{
      sourceKey: '0:0',
      workspaceKey: '0:0',
      triangleCount: 63,
    }],
    workspace,
    worldScale: 1,
  });

  expect(result).toEqual({ rejectionReason: 'too_few_triangles' });
  await workspace.dispose();
});

test('retains an averaged color when every primitive has vertex colors', async () => {
  const workspace = await createGeometryWorkspace({ maxMemoryBytes: 1024 });
  await workspace.write('0:0', {
    ...box(2, 128),
    colors: new Float32Array(Array.from({ length: 32 }, (_value, index) => (
      index % 4 === 0 ? 0.25 : index % 4 === 3 ? 1 : 0.5
    ))),
  });
  const result = await createSemanticProxy({
    meshIndex: 0,
    sourceTriangles: 128,
    primitives: [{
      sourceKey: '0:0',
      workspaceKey: '0:0',
      triangleCount: 128,
      materialIndex: 0,
    }],
    workspace,
    worldScale: 1,
  });

  expect(result.proxy?.colors?.length).toBe(
    result.proxy!.positions.length,
  );
  expect(result.proxy?.colors?.slice(0, 3)).toEqual([0.25, 0.5, 0.5]);
  await workspace.dispose();
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:

```bash
npx node-test run tests/lod/semanticProxy/createSemanticProxy.test.ts
```

Expected: FAIL because the proxy evaluation modules do not exist.

- [ ] **Step 3: Implement surface and volume metrics**

In `evaluateProxy.ts`, implement point-to-triangle distance and evaluate each candidate:

```ts
const localDiagonal = diagonal(samples.bounds);
const aabbVolume = Math.max(
  Number.EPSILON,
  extent(samples.bounds, 0)
    * extent(samples.bounds, 1)
    * extent(samples.bounds, 2),
);
const maximumDeviation = Math.max(
  ...allFitPoints(samples).map((point) => (
    distanceToMeshSurface(point, candidate.positions, candidate.indices)
  )),
);
const normalizedMaximumDeviation = maximumDeviation / localDiagonal;
const volumeInflation = candidate.volume / aabbVolume;
```

Accept only when all conditions hold:

```ts
sourceTriangles >= 64
&& normalizedMaximumDeviation <= 0.05
&& volumeInflation <= 2.0
&& sourceTriangles / candidate.triangleCount >= 8
```

- [ ] **Step 4: Select deterministic material and color**

In `createSemanticProxy.ts`:

```ts
const materialIndex = [...primitives]
  .sort((left, right) => (
    right.triangleCount - left.triangleCount
      || (left.materialIndex ?? -1) - (right.materialIndex ?? -1)
  ))[0]!.materialIndex;
```

Read every primitive geometry. If any lacks colors, omit proxy colors. Otherwise:

```ts
const averaged = averagePrimitiveColors(primitives, geometries);
const colors = new Float32Array(candidate.positions.length);
for (let vertex = 0; vertex < colors.length / 3; vertex += 1) {
  colors.set(averaged, vertex * 3);
}
```

Use triangle count as primitive weight.

- [ ] **Step 5: Select between candidates**

Sort accepted candidates by:

1. `normalizedMaximumDeviation`
2. `volumeInflation`
3. `triangleCount`
4. OBB before cylinder
5. stable candidate ID

Store the selected geometry under:

```ts
`proxy:${meshIndex}:${candidate.kind}`
```

Set `errorMeters = normalizedMaximumDeviation * localDiagonal * worldScale`.

Wrap only sample fitting and quality evaluation in a try/catch for
`ICE3_TOOL_PROXY_FIT_INVALID`; convert that into
`{ rejectionReason }`. Workspace read, write, spill, and cleanup failures
must propagate as build errors.

- [ ] **Step 6: Run focused tests and typecheck**

Before running tests, export the public creation interfaces:

```ts
export {
  createSemanticProxy,
  type ICESemanticProxyCreateOptions,
  type ICESemanticProxyCreateResult,
} from './lod/semanticProxy/createSemanticProxy.js';
```

Also export the quality result type from `evaluateProxy.ts`.

Run:

```bash
npx node-test run tests/lod/semanticProxy/createSemanticProxy.test.ts \
  tests/lod/semanticProxy/fitProxyGeometry.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/toolchain-core/src/lod/semanticProxy/evaluateProxy.ts \
  packages/toolchain-core/src/lod/semanticProxy/createSemanticProxy.ts \
  packages/toolchain-core/src/lod/types.ts \
  packages/toolchain-core/src/index.ts \
  tests/lod/semanticProxy/createSemanticProxy.test.ts
git commit -m "feat(toolchain): qualify semantic proxies"
```

---

### Task 4: Replace Source Mesh Geometry in Prepared GLB

**Files:**
- Modify: `ice3-toolchain/packages/toolchain-core/src/output/buildPreparedGLB.ts`
- Modify: `ice3-toolchain/packages/toolchain-core/src/index.ts`
- Modify: `ice3-toolchain/tests/output/buildPreparedGLB.test.ts`

**Interfaces:**
- Consumes:

```ts
interface ICEPreparedMeshOverride {
  readonly positions: Float32Array;
  readonly indices: Uint32Array;
  readonly materialIndex?: number;
  readonly colors?: Float32Array;
}
```

- Extends:

```ts
interface ICEBuildOptions {
  readonly meshOverrides?: ReadonlyMap<number, ICEPreparedMeshOverride>;
}
```

- [ ] **Step 1: Write the failing mesh replacement test**

Build the existing prepared-cube fixture with:

```ts
const triangle = {
  positions: new Float32Array([
    -1, -1, -1,
    1, -1, -1,
    -1, 1, 1,
  ]),
  indices: new Uint32Array([0, 1, 2]),
  materialIndex: 0,
};
const built = buildPreparedGLB(source, {
  assetId: 'proxy-test',
  meshOverrides: new Map([[0, triangle]]),
});
```

Assert:

- The output mesh has one triangle and no original cube triangles.
- The output node still has its original `selectionId`.
- The material is the chosen source material.
- Edges match the replacement geometry.
- Output JSON still has one mesh and no new extension.

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
npx node-test run tests/output/buildPreparedGLB.test.ts -t "mesh override"
```

Expected: FAIL because the option is unknown.

- [ ] **Step 3: Apply mesh overrides before source primitives**

Inside the source-mesh loop:

```ts
const meshOverride = options.meshOverrides?.get(meshIndex);
if (meshOverride) {
  appendPreparedPrimitive({
    positions: meshOverride.positions,
    indices: meshOverride.indices,
    materialIndex: meshOverride.materialIndex,
    colors: meshOverride.colors,
  });
} else {
  // existing source primitive loop unchanged
}
```

Extract the existing prepare/append block into `appendPreparedPrimitive` so QEM overrides and mesh replacements share the same GLB encoding path.

- [ ] **Step 4: Preserve node and selection identity**

Do not change the node construction, `worldMatrices`, `sourceMeshToOutputMesh`, or `selectionId` path. Mesh replacement only changes the output mesh linked from those nodes.

- [ ] **Step 5: Validate mixed Tile behavior**

Add an integration-level assertion in `tests/output/buildPreparedGLB.test.ts` with two source meshes:

- Mesh `0` uses `meshOverrides`.
- Mesh `1` uses the normal primitive path.
- Both output nodes keep source IDs.

- [ ] **Step 6: Export the mesh override type**

In `packages/toolchain-core/src/index.ts`, add `ICEPreparedMeshOverride`
to the existing `buildPreparedGLB` export list.

- [ ] **Step 7: Reject invalid selected mesh geometry**

Add a test where `meshOverrides` refers to vertex index `9` in a proxy
with 3 vertices. Assert `buildPreparedGLB` throws
`ICE3_TOOL_INVALID_GEOMETRY` so an invalid selected proxy fails the build
instead of publishing a partial GLB.

- [ ] **Step 8: Run focused tests and typecheck**

Run:

```bash
npx node-test run tests/output/buildPreparedGLB.test.ts \
  tests/output/validatePreparedGLB.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add packages/toolchain-core/src/output/buildPreparedGLB.ts \
  packages/toolchain-core/src/index.ts \
  tests/output/buildPreparedGLB.test.ts
git commit -m "feat(toolchain): replace prepared mesh geometry"
```

---

### Task 5: Add Proxy Samples to Adaptive LOD

**Files:**
- Modify: `ice3-toolchain/packages/toolchain-core/src/lod/types.ts`
- Modify: `ice3-toolchain/packages/toolchain-core/src/lod/allocateAdaptiveLod.ts`
- Modify: `ice3-toolchain/packages/toolchain-core/src/lod/createLodUnitCurve.ts`
- Modify: `ice3-toolchain/packages/toolchain-core/src/partition/partitionAsset.ts`
- Modify: `ice3-toolchain/tests/lod/allocateAdaptiveLod.test.ts`
- Modify: `ice3-toolchain/tests/partition/lodGeneration.test.ts`

**Interfaces:**
- Consumes: `createSemanticProxy`, mesh overrides, and existing adaptive allocator.
- Produces sample replacement union:

```ts
interface ICELodPrimitiveReplacement {
  readonly kind: 'primitives';
  readonly primitives: readonly ICELodCurvePrimitive[];
}

interface ICELodMeshReplacement {
  readonly kind: 'mesh';
  readonly proxy: ICESemanticProxy;
}

type ICELodSampleReplacement =
  | ICELodPrimitiveReplacement
  | ICELodMeshReplacement;
```

- [ ] **Step 1: Write the failing proxy-selection test**

Use the existing synthetic adaptive source and replace its simple flat mesh
with a closed box; the second wavy grid remains the QEM device:

```ts
const source = createAdaptiveLodPartitionSource();
const binary = source.buffers[0]!;
const bufferViews = source.json.bufferViews as Array<Record<string, unknown>>;
const accessors = source.json.accessors as Array<Record<string, unknown>>;
const positions = new Float32Array(
  binary.buffer,
  binary.byteOffset,
  Number(accessors[0]!.count) * 3,
);
const corners = [
  [-1, -1, -1],
  [1, -1, -1],
  [-1, 1, -1],
  [1, 1, -1],
  [-1, -1, 1],
  [1, -1, 1],
  [-1, 1, 1],
  [1, 1, 1],
] as const;
for (let index = 0; index < positions.length / 3; index += 1) {
  positions.set(corners[index % 8]!, index * 3);
}
const indexOffset = Number(bufferViews[2]!.byteOffset);
const indices = new Uint16Array(
  binary.buffer,
  binary.byteOffset + indexOffset,
  Number(accessors[2]!.count),
);
const boxIndices = new Uint16Array([
  0, 2, 1, 1, 2, 3,
  4, 5, 6, 5, 7, 6,
  0, 1, 4, 1, 5, 4,
  2, 6, 3, 3, 6, 7,
  0, 4, 2, 2, 4, 6,
  1, 3, 5, 3, 7, 5,
]);
for (let triangle = 0; triangle < indices.length / 3; triangle += 1) {
  indices.set(
    boxIndices.subarray(triangle % 12 * 3, triangle % 12 * 3 + 3),
    triangle * 3,
  );
}
accessors[0]!.min = [-1, -1, -1];
accessors[0]!.max = [1, 1, 1];

const result = await partitionAsset(source, {
  assetId: 'semantic-proxy-demo',
  maxTriangles: 64,
  lod: {
    allocation: 'adaptive',
    semanticProxy: 'auto',
    curveSamples: 6,
    ratio: 0.15,
    maxTrianglesPerProxy: 1024,
    minTrianglesPerUnit: 4,
  },
});
expect(result.stats.semanticProxyAcceptedUnits).toBeGreaterThan(0);
expect(result.stats.semanticProxySelectedContents).toBeGreaterThan(0);
expect(result.stats.semanticProxyObbUnits).toBeGreaterThan(0);
expect(result.stats.overBudgetCoarseNodes).toBe(0);
const root = result.files.find(
  (file) => file.path === 'coarse/group-root.glb',
)!;
const nodes = readDocument(root.bytes).nodes;
expect(nodes.every((node) => (
  node.extras.ice3.selectionId?.startsWith('semantic-proxy-demo/node/')
))).toBe(true);
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
npx node-test run tests/partition/lodGeneration.test.ts -t "semantic proxy"
```

Expected: FAIL because proxy integration is absent.

- [ ] **Step 3: Replace primitive-only sample payload**

Change `ICELodCurveSample` and allocation selections from:

```ts
readonly primitives: readonly ICELodCurvePrimitive[];
```

to:

```ts
readonly replacement: ICELodSampleReplacement;
```

Update existing QEM samples to:

```ts
replacement: {
  kind: 'primitives',
  primitives,
}
```

Update all tests and allocator references by name.

- [ ] **Step 4: Insert the accepted proxy into the curve**

Before QEM samples, create:

```ts
if (options.proxy) {
  pushParetoSample(samples, {
    targetTriangles: options.proxy.triangleCount,
    actualTriangles: options.proxy.triangleCount,
    errorMeters: options.proxy.errorMeters,
    preservedSource: false,
    replacement: {
      kind: 'mesh',
      proxy: options.proxy,
    },
  });
}
```

Add optional `proxy` to `ICELodUnitCurveOptions`.

- [ ] **Step 5: Add proxy cache and stats**

Extend `ICBuildState`:

```ts
readonly semanticProxyCache: Map<string, Promise<ICESemanticProxyCreateResult>>;
readonly semanticProxyAcceptedIds: Set<string>;
readonly semanticProxyRejectedIds: Set<string>;
readonly semanticProxyKinds: Map<ICESemanticProxyKind, number>;
semanticProxySelectedContents: number;
semanticProxyTriangles: number;
semanticProxySavedTriangles: number;
semanticProxyMaximumErrorMeters: number;
```

`loadUnitCurve` resolves the proxy once via `createSemanticProxy` and passes it into `createLodUnitCurve`.

- [ ] **Step 6: Build mixed mesh and primitive overrides**

In `selectAdaptiveCoarseGeometry`, split selections:

```ts
const meshOverrides = new Map<number, ICEPreparedMeshOverride>();
const geometryOverrides = new Map<string, ICEGeometryOverride>();
```

For `replacement.kind === 'mesh'`:

```ts
const geometry = await workspace.read(replacement.proxy.geometryKey);
meshOverrides.set(unit.meshIndices[0]!, {
  positions: geometry.positions,
  indices: geometry.indices,
  ...(replacement.proxy.materialIndex === undefined
    ? {}
    : { materialIndex: replacement.proxy.materialIndex }),
  ...(replacement.proxy.colors
    ? { colors: replacement.proxy.colors }
    : {}),
});
```

For primitive replacements, populate `geometryOverrides` as today.

Pass both sets to `buildPreparedGLB`.

- [ ] **Step 7: Record only final proxy placements**

Include proxy placements in `adaptiveMetrics` and apply proxy statistics only when the coarse node is final, not when an oversized parent candidate is discarded.

- [ ] **Step 8: Run LOD tests and typecheck**

Run:

```bash
npx node-test run tests/lod/allocateAdaptiveLod.test.ts \
  tests/lod/createLodUnitCurve.test.ts \
  tests/partition/lodGeneration.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add packages/toolchain-core/src/lod/types.ts \
  packages/toolchain-core/src/lod/allocateAdaptiveLod.ts \
  packages/toolchain-core/src/lod/createLodUnitCurve.ts \
  packages/toolchain-core/src/partition/partitionAsset.ts \
  tests/lod/allocateAdaptiveLod.test.ts \
  tests/partition/lodGeneration.test.ts
git commit -m "feat(toolchain): allocate semantic proxies in lod"
```

---

### Task 6: Add CLI Controls and Proxy Reporting

**Files:**
- Modify: `ice3-toolchain/packages/toolchain-core/src/partition/partitionAsset.ts`
- Modify: `ice3-toolchain/packages/cli/src/commands.ts`
- Modify: `ice3-toolchain/tests/cli/commands.test.ts`
- Modify: `ice3-toolchain/README.md`

**Interfaces:**
- Consumes `ICESemanticProxyMode` and proxy statistics produced by Task 5.

- [ ] **Step 1: Write failing CLI tests**

Accept:

```ts
['--lod', '--lod-allocation', 'adaptive', '--semantic-proxy', 'auto']
['--lod', '--lod-allocation', 'adaptive', '--semantic-proxy', 'off']
```

Reject before output creation:

```ts
['--semantic-proxy', 'auto'] // without --lod
['--lod', '--lod-allocation', 'proportional', '--semantic-proxy', 'auto']
['--lod', '--lod-allocation', 'adaptive', '--semantic-proxy', 'unknown']
```

Invalid combinations must exit `1`, print the relevant option name, and leave no output directory.

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
npx node-test run tests/cli/commands.test.ts -t "semantic-proxy"
```

Expected: FAIL because the option is unknown.

- [ ] **Step 3: Parse and validate the mode**

In `partitionCommand`:

```ts
const semanticProxy = args.values.get('--semantic-proxy') ?? 'off';
if (semanticProxy !== 'off' && semanticProxy !== 'auto') {
  throw new Error(
    'ICE3_TOOL_PARTITION_OPTIONS_INVALID: --semantic-proxy must be auto or off',
  );
}
if (semanticProxy === 'auto' && allocation !== 'adaptive') {
  throw new Error(
    'ICE3_TOOL_PARTITION_OPTIONS_INVALID: --semantic-proxy auto requires --lod-allocation adaptive',
  );
}
```

For `--semantic-proxy` with no `--lod`, reject with:

```text
ICE3_TOOL_PARTITION_OPTIONS_INVALID: --semantic-proxy requires --lod
```

Add the option to the valued-option set and include it in the LOD object.

- [ ] **Step 4: Expose proxy stats**

Add all `ICESemanticProxyStats` fields to `ICEPartitionResult['stats']`.

```ts
interface ICESemanticProxyStats {
  readonly semanticProxyAcceptedUnits: number;
  readonly semanticProxyObbUnits: number;
  readonly semanticProxyCylinderUnits: number;
  readonly semanticProxyRejectedUnits: number;
  readonly semanticProxySelectedContents: number;
  readonly semanticProxyTriangles: number;
  readonly semanticProxySavedTriangles: number;
  readonly semanticProxyMaximumErrorMeters: number;
}
```

For `off`:

```ts
semanticProxyAcceptedUnits: 0
semanticProxyObbUnits: 0
semanticProxyCylinderUnits: 0
semanticProxyRejectedUnits: 0
semanticProxySelectedContents: 0
semanticProxyTriangles: 0
semanticProxySavedTriangles: 0
semanticProxyMaximumErrorMeters: 0
```

- [ ] **Step 5: Document usage**

In `README.md`:

```text
--semantic-proxy off|auto
  Generate conservative OBB and cylinder candidates for adaptive LOD.
  Default: off. auto requires adaptive allocation.
```

Describe the fixed quality thresholds and QEM fallback.

- [ ] **Step 6: Run CLI and typecheck**

Run:

```bash
npx node-test run tests/cli/commands.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/toolchain-core/src/partition/partitionAsset.ts \
  packages/cli/src/commands.ts \
  tests/cli/commands.test.ts \
  README.md
git commit -m "feat(cli): expose semantic proxy generation"
```

---

### Task 7: Real-Asset Validation and Final Integration

**Files:**
- Modify: `ice3-doc/docs/contracts/asset-preparation-contract-v1.md`
- Modify: `ice3-doc/docs/superpowers/specs/2026-10-27-semantic-industrial-proxy-design.md`
- Modify: `ice3-toolchain/README.md`

- [ ] **Step 1: Run both full suites before the controlled comparison**

```bash
cd ../ice3-toolchain
source "$HOME/.nvm/nvm.sh"
nvm use 24
npm run verify

cd ../ice3-engine
npm run verify
```

Expected: zero failures.

- [ ] **Step 2: Generate off and auto outputs outside Git**

Use:

```bash
test -n "$ICE3_CONTROLLED_GLB"
output_root=$(mktemp -d /tmp/ice3-semantic-proxy.XXXXXX)
```

Use identical parameters for both:

```text
--max-triangles 500000
--max-bytes 33554432
--lod
--lod-allocation adaptive
--lod-curve-samples 8
--lod-ratio 0.15
--lod-max-triangles 1048576
--lod-min-unit-triangles 8
--coarse-chunk-max-bytes 33554432
--skip-edges
```

First run uses `--semantic-proxy off`, second uses `--semantic-proxy auto`.

- [ ] **Step 3: Evaluate the acceptance gate**

Record aggregate values:

```text
acceptedUnits
obbUnits
cylinderUnits
rejectedUnits
coarseTriangles
coarseBytes
maximumErrorMeters
overBudgetNodes
buildWallClockMs
```

Require:

- Every accepted proxy passed the fixed quality thresholds.
- Coarse triangle and byte budgets do not exceed configured limits beyond existing soft rules.
- `overBudgetCoarseNodes` does not increase with proxies.
- If accepted units are zero, document that the asset has no conservative proxy candidates and keep default `off`.
- Any selected proxy preserves semantic IDs.

- [ ] **Step 4: Validate generated content**

- Run Prepared GLB validation over every generated GLB.
- Load both outputs in Chromium and WebKit through the existing example harness.
- Record resident nodes/bytes and page failures.
- Require no page errors and no failed requests.

- [ ] **Step 5: Update shared contracts**

Add to `asset-preparation-contract-v1.md`:

- `semanticProxy` CLI mode.
- Fixed proxy thresholds.
- Proxy/QEM competition.
- Mesh replacement identity guarantees.
- Proxy report fields.
- Default-off compatibility guarantee.

Add the measured aggregate results to the proxy spec. Do not include asset names or paths.

- [ ] **Step 6: Audit and clean**

Run:

```bash
git status --porcelain=v1
git grep -I -n 'CONTROLLED_ASSET_NAME' -- . ':!package-lock.json' || true
git ls-files '*.glb' '*.gltf' '*.bin' | wc -l
```

Delete the exact temporary output directory after recording results.

- [ ] **Step 7: Final verification**

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

Expected: all green, zero model-like files in packages.

- [ ] **Step 8: Commit final documentation**

```bash
cd ../ice3-doc
git add docs/contracts/asset-preparation-contract-v1.md \
  docs/superpowers/specs/2026-10-27-semantic-industrial-proxy-design.md
git commit -m "docs: record semantic proxy contract"

cd ../ice3-toolchain
git add README.md
git commit -m "docs: finalize semantic proxy guidance"
```
