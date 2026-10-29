# 语义工业代理实施计划

> Document ID: ICE3-DOC-PLAN-009
>
> Status: Implemented
>
> Owner: ICE3 架构维护者

> **供代理执行者使用：** 必须使用子技能 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans，按任务逐步实施本计划。使用复选框（`- [ ]`）语法跟踪步骤。

**目标：** 将保守的离线 OBB 和 cylinder 代理添加为可选的 adaptive-LOD 样本，同时保持标准 Tileset、Prepared GLB、选择标识和 runtime API 不变。

**架构：** 工具链根据源 mesh 几何体拟合代理，仅当表面偏差、体积膨胀和三角形缩减量全部通过固定阈值时才接受该代理，并将候选代理存储在受限 workspace 中。Adaptive LOD 将该 mesh 替换与 primitive QEM 样本进行比较；Prepared GLB 构建器替换 mesh 几何体，但不改变 nodes 或 selection IDs。

**技术栈：** Node.js 24.22.1 LTS、TypeScript 7、ESM、npm workspaces、Node.js 内置 test runner、`expect`、`tsx`、Prepared GLB、OGC 3D Tiles 1.1

**规范：** `../specs/2026-10-27-semantic-industrial-proxy-design.md`

## 全局约束

- 使用 `.nvmrc` 指定的 Node.js 24.22.1 LTS；不得使用 Node 25 进行验证。
- 在功能分支上开发，仅在完整验证通过后合入 `main`。
- 不得添加 runtime 依赖。
- 代理生成仅属于离线工具链工作。
- `--semantic-proxy` 默认为 `off`。
- Semantic proxies 需要 `--lod --lod-allocation adaptive`。
- 不得添加私有 asset format、Tileset 字段或代理专用 runtime API。
- 不得更改 node IDs、node matrices 或 `selectionId`。
- 不得合并或删除语义设备。
- 固定接受阈值为：规范化表面偏差 `<= 0.05`、体积膨胀 `<= 2.0`，三角形缩减量 `>= 8`。
- 源三角形少于 `64` 个的设备不会获得代理。
- 仅支持 OBB 和 cylinder 候选；不得使用 convex hull、part segmentation、voxelization 或手动覆盖。
- 混合顶点颜色规则采用保守策略：仅当每个参与计算的 primitive 都有颜色时，才使用平均顶点颜色；否则使用主导 material。
- 保持确定性的候选排序、eigenvector 符号、material 选择和输出字节。
- 严禁将受控客户 asset 或派生文件写入 Git、测试、截图、日志、软件包或文档。
- 在所有 artifacts 中避免出现竞品名称以及被禁止的通用 3D-library 品牌词。

## 审查重点

- 细薄、平坦或体积为零的源边界可能导致体积和偏差比率除以零；这类情况必须产生确定性的拒绝结果，不得产生 `NaN` 或超大代理。
- 一个 mesh 可能被多个 nodes 实例化；代理几何体必须保持 mesh-local 坐标，而 world error 使用最大 node 缩放比例。
- 一个设备可能包含混合 materials 或部分缺失顶点颜色；代理必须使用确定性的主导 material，不得自行引入混合 material 语义。
- 选定的代理和 QEM 样本可以在同一个 Tile 中共存；mesh 替换必须仅对其源 mesh 优先，且不得重复保留剩余的 primitive 几何体。
- 候选拟合或代理 GLB 重建可能因退化三角形而失败；单设备代理失败时必须回退到 QEM，除非选定的代理在后续输出构建期间变为无效。

## 文件结构

- `packages/toolchain-core/src/lod/semanticProxy/types.ts` 负责代理候选、拟合样本、质量指标和拒绝原因。
- `packages/toolchain-core/src/lod/semanticProxy/collectFitSamples.ts` 负责确定性的顶点、质心、面积和边界收集。
- `packages/toolchain-core/src/lod/semanticProxy/fitProxyGeometry.ts` 负责主轴、OBB 几何体和 cylinder 几何体。
- `packages/toolchain-core/src/lod/semanticProxy/evaluateProxy.ts` 负责表面偏差、体积和接受规则。
- `packages/toolchain-core/src/lod/semanticProxy/createSemanticProxy.ts` 负责 material/颜色选择及 workspace 存储。
- `packages/toolchain-core/src/output/buildPreparedGLB.ts` 负责源 mesh 几何体替换。
- `packages/toolchain-core/src/lod/createLodUnitCurve.ts` 负责将已接受的代理添加为 curve 样本。
- `packages/toolchain-core/src/partition/partitionAsset.ts` 负责候选缓存、adaptive 集成和代理报告统计。
- `packages/cli/src/commands.ts` 负责 `--semantic-proxy`。

---

### 任务 1：收集确定性拟合样本

**文件：**
- 创建：`ice3-toolchain/packages/toolchain-core/src/lod/semanticProxy/types.ts`
- 创建：`ice3-toolchain/packages/toolchain-core/src/lod/semanticProxy/collectFitSamples.ts`
- 创建：`ice3-toolchain/tests/lod/semanticProxy/collectFitSamples.test.ts`
- 修改：`ice3-toolchain/packages/toolchain-core/src/partition/types.ts`
- 修改：`ice3-toolchain/packages/toolchain-core/src/index.ts`

**接口：**
- 消费：`ICEWorkspaceGeometry[]`。
- 产生：

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

- [ ] **步骤 1：编写失败的样本测试**

```ts
import { test } from 'node:test';
import { expect } from 'expect';
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

- [ ] **步骤 2：运行测试并验证其失败**

运行：

```bash
cd ../ice3-toolchain
source "$HOME/.nvm/nvm.sh"
nvm use 24
npm test -- tests/lod/semanticProxy/collectFitSamples.test.ts
```

预期：FAIL，因为代理模块尚不存在。

- [ ] **步骤 3：定义代理样本类型**

在 `semanticProxy/types.ts` 中，添加规范定义的拟合样本接口和代理类型：

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

- [ ] **步骤 4：实现确定性收集**

在 `collectFitSamples.ts` 中，处理每个三角形：

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

使用 `Math.round(value * 100_000)` 生成重复项 key。在筛选三角形之前，根据每个原始顶点计算边界。如果不存在正面积三角形，则抛出 `ICE3_TOOL_PROXY_FIT_INVALID`。

- [ ] **步骤 5：导出 public types**

在 `packages/toolchain-core/src/index.ts` 中：

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

在 `packages/toolchain-core/src/partition/types.ts` 中，将 `semanticProxy` 添加到
`ICELodBuildOptions`：

```ts
export type ICESemanticProxyMode = 'off' | 'auto';

export interface ICELodBuildOptions {
  readonly semanticProxy?: ICESemanticProxyMode;
  // existing fields remain unchanged
}
```

将 `ICESemanticProxyMode` 添加到 core index 的 partition-type 导出列表。

- [ ] **步骤 6：运行聚焦测试和 typecheck**

运行：

```bash
npm test -- tests/lod/semanticProxy/collectFitSamples.test.ts
npm run typecheck
```

预期：PASS。

- [ ] **步骤 7：提交**

```bash
git add packages/toolchain-core/src/lod/semanticProxy/types.ts \
  packages/toolchain-core/src/lod/semanticProxy/collectFitSamples.ts \
  packages/toolchain-core/src/partition/types.ts \
  packages/toolchain-core/src/index.ts \
  tests/lod/semanticProxy/collectFitSamples.test.ts
git commit -m "feat(toolchain): collect semantic proxy samples"
```

---

### 任务 2：拟合确定性 OBB 和 Cylinder 几何体

**文件：**
- 创建：`ice3-toolchain/packages/toolchain-core/src/lod/semanticProxy/fitProxyGeometry.ts`
- 创建：`ice3-toolchain/tests/lod/semanticProxy/fitProxyGeometry.test.ts`
- 修改：`ice3-toolchain/packages/toolchain-core/src/lod/semanticProxy/types.ts`
- 修改：`ice3-toolchain/packages/toolchain-core/src/index.ts`

**接口：**
- 消费：`ICESemanticProxyFitSamples`。
- 产生：

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

- [ ] **步骤 1：编写失败的 OBB 和 cylinder 测试**

```ts
import { test } from 'node:test';
import { expect } from 'expect';
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

- [ ] **步骤 2：运行测试并验证其失败**

运行：

```bash
npm test -- tests/lod/semanticProxy/fitProxyGeometry.test.ts
```

预期：FAIL，因为拟合模块尚不存在。

- [ ] **步骤 3：实现面积加权协方差和主轴**

对对称 3x3 矩阵使用确定性的 Jacobi eigensolver：

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

规范化每个 eigenvector。对于每个 vector，使绝对值最大的分量为正；若存在并列，则依次使用 `x`、`y`、`z`。

出现以下情况时拒绝该 covariance：

```ts
lambda1 <= 1e-12
|| (lambda2 / lambda1 > 0.9 && lambda3 / lambda1 > 0.8)
```

- [ ] **步骤 4：生成 OBB 几何体**

将每个源顶点和质心投影到 3 个主轴上。计算每个轴的 min/max，并添加 `max(1e-6, diagonal * 1e-6)` 的安全边距。准确输出 8 个 vertices 和 12 个三角形。

设置：

```ts
id: 'obb'
kind: 'obb'
triangleCount: 12
volume: extentA * extentB * extentC
```

- [ ] **步骤 5：生成 Cylinder 几何体**

使用第一个主轴。将所有拟合点投影到该轴及其正交平面。

```ts
const halfHeight = (maxAlongAxis - minAlongAxis) / 2;
const centerAlongAxis = (maxAlongAxis + minAlongAxis) / 2;
const radius = Math.max(
  ...points.map((point) => distanceToAxis(point, center, axis)),
);
```

生成 16 个 segment，使用确定性的 winding 和两个 cap center。输出 64 个三角形。

出现以下情况时拒绝：

```ts
halfHeight <= 0
|| radius <= 0
|| (2 * halfHeight) / (2 * radius) < 1.25
```

- [ ] **步骤 6：导出拟合接口**

在 `packages/toolchain-core/src/index.ts` 中：

```ts
export {
  fitProxyGeometry,
  type ICESemanticProxyFitResult,
  type ICESemanticProxyGeometryCandidate,
} from './lod/semanticProxy/fitProxyGeometry.js';
```

- [ ] **步骤 7：运行拟合测试和 typecheck**

运行：

```bash
npm test -- tests/lod/semanticProxy/fitProxyGeometry.test.ts
npm run typecheck
```

预期：PASS。

- [ ] **步骤 8：提交**

```bash
git add packages/toolchain-core/src/lod/semanticProxy/types.ts \
  packages/toolchain-core/src/lod/semanticProxy/fitProxyGeometry.ts \
  packages/toolchain-core/src/index.ts \
  tests/lod/semanticProxy/fitProxyGeometry.test.ts
git commit -m "feat(toolchain): fit obb and cylinder proxies"
```

---

### 任务 3：评估代理质量、Material 和颜色

**文件：**
- 创建：`ice3-toolchain/packages/toolchain-core/src/lod/semanticProxy/evaluateProxy.ts`
- 创建：`ice3-toolchain/packages/toolchain-core/src/lod/semanticProxy/createSemanticProxy.ts`
- 创建：`ice3-toolchain/tests/lod/semanticProxy/createSemanticProxy.test.ts`
- 修改：`ice3-toolchain/packages/toolchain-core/src/lod/types.ts`
- 修改：`ice3-toolchain/packages/toolchain-core/src/index.ts`

**接口：**
- 消费：

```ts
interface ICESemanticProxyCreateOptions {
  readonly meshIndex: number;
  readonly sourceTriangles: number;
  readonly primitives: readonly ICELodUnitPrimitive[];
  readonly workspace: ICEGeometryWorkspace;
  readonly worldScale: number;
}
```

- 产生：

```ts
interface ICESemanticProxyCreateResult {
  readonly proxy?: ICESemanticProxy;
  readonly rejectionReason?: string;
}

function createSemanticProxy(
  options: ICESemanticProxyCreateOptions,
): Promise<ICESemanticProxyCreateResult>;
```

扩展 `ICELodUnitPrimitive`：

```ts
readonly materialIndex?: number;
```

- [ ] **步骤 1：编写失败的接受和回退测试**

```ts
import { test } from 'node:test';
import { expect } from 'expect';
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

- [ ] **步骤 2：运行测试并验证其失败**

运行：

```bash
npm test -- tests/lod/semanticProxy/createSemanticProxy.test.ts
```

预期：FAIL，因为代理评估模块尚不存在。

- [ ] **步骤 3：实现表面和体积指标**

在 `evaluateProxy.ts` 中，实现点到三角形距离并评估每个候选：

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

仅当所有条件都满足时才接受：

```ts
sourceTriangles >= 64
&& normalizedMaximumDeviation <= 0.05
&& volumeInflation <= 2.0
&& sourceTriangles / candidate.triangleCount >= 8
```

- [ ] **步骤 4：选择确定性的 Material 和颜色**

在 `createSemanticProxy.ts` 中：

```ts
const materialIndex = [...primitives]
  .sort((left, right) => (
    right.triangleCount - left.triangleCount
      || (left.materialIndex ?? -1) - (right.materialIndex ?? -1)
  ))[0]!.materialIndex;
```

读取每个 primitive 几何体。如果任一 primitive 缺少颜色，则省略代理颜色。否则：

```ts
const averaged = averagePrimitiveColors(primitives, geometries);
const colors = new Float32Array(candidate.positions.length);
for (let vertex = 0; vertex < colors.length / 3; vertex += 1) {
  colors.set(averaged, vertex * 3);
}
```

使用三角形数量作为 primitive 权重。

- [ ] **步骤 5：在候选之间进行选择**

按以下顺序对已接受的候选排序：

1. `normalizedMaximumDeviation`
2. `volumeInflation`
3. `triangleCount`
4. OBB 优先于 cylinder
5. 稳定的 candidate ID

将选定的几何体存储在：

```ts
`proxy:${meshIndex}:${candidate.kind}`
```

设置 `errorMeters = normalizedMaximumDeviation * localDiagonal * worldScale`。

仅将样本拟合和质量评估包装在对
`ICE3_TOOL_PROXY_FIT_INVALID` 的 try/catch 中；将其转换为
`{ rejectionReason }`。Workspace 的读取、写入、spill 和清理失败
必须作为构建错误传播。

- [ ] **步骤 6：运行聚焦测试和 typecheck**

运行测试之前，导出 public creation 接口：

```ts
export {
  createSemanticProxy,
  type ICESemanticProxyCreateOptions,
  type ICESemanticProxyCreateResult,
} from './lod/semanticProxy/createSemanticProxy.js';
```

还要从 `evaluateProxy.ts` 导出 quality result 类型。

运行：

```bash
npm test -- tests/lod/semanticProxy/createSemanticProxy.test.ts \
  tests/lod/semanticProxy/fitProxyGeometry.test.ts
npm run typecheck
```

预期：PASS。

- [ ] **步骤 7：提交**

```bash
git add packages/toolchain-core/src/lod/semanticProxy/evaluateProxy.ts \
  packages/toolchain-core/src/lod/semanticProxy/createSemanticProxy.ts \
  packages/toolchain-core/src/lod/types.ts \
  packages/toolchain-core/src/index.ts \
  tests/lod/semanticProxy/createSemanticProxy.test.ts
git commit -m "feat(toolchain): qualify semantic proxies"
```

---

### 任务 4：在 Prepared GLB 中替换源 Mesh 几何体

**文件：**
- 修改：`ice3-toolchain/packages/toolchain-core/src/output/buildPreparedGLB.ts`
- 修改：`ice3-toolchain/packages/toolchain-core/src/index.ts`
- 修改：`ice3-toolchain/tests/output/buildPreparedGLB.test.ts`

**接口：**
- 消费：

```ts
interface ICEPreparedMeshOverride {
  readonly positions: Float32Array;
  readonly indices: Uint32Array;
  readonly materialIndex?: number;
  readonly colors?: Float32Array;
}
```

- 扩展：

```ts
interface ICEBuildOptions {
  readonly meshOverrides?: ReadonlyMap<number, ICEPreparedMeshOverride>;
}
```

- [ ] **步骤 1：编写失败的 Mesh 替换测试**

使用以下内容构建现有的 prepared-cube fixture：

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

断言：

- 输出 mesh 有一个三角形，且不包含原 cube 的三角形。
- 输出 node 仍具有其原始 `selectionId`。
- Material 是选定的源 material。
- Edges 与替换几何体匹配。
- 输出 JSON 仍只有一个 mesh，且没有新增 extension。

- [ ] **步骤 2：运行测试并验证其失败**

运行：

```bash
npm test -- tests/output/buildPreparedGLB.test.ts -t "mesh override"
```

预期：FAIL，因为该选项未知。

- [ ] **步骤 3：在源 Primitives 之前应用 Mesh 覆盖**

在 source-mesh 循环内部：

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

将现有的 prepare/append 代码块提取到 `appendPreparedPrimitive` 中，使 QEM 覆盖和 mesh 替换共用同一条 GLB 编码路径。

- [ ] **步骤 4：保持 Node 和选择标识**

不得更改 node 构建、`worldMatrices`、`sourceMeshToOutputMesh` 或 `selectionId` 路径。Mesh 替换仅更改这些 nodes 所链接的输出 mesh。

- [ ] **步骤 5：验证混合 Tile 行为**

在 `tests/output/buildPreparedGLB.test.ts` 中添加一个包含两个源 meshes 的集成级断言：

- Mesh `0` 使用 `meshOverrides`。
- Mesh `1` 使用正常的 primitive 路径。
- 两个输出 nodes 都保留源 IDs。

- [ ] **步骤 6：导出 Mesh 覆盖类型**

在 `packages/toolchain-core/src/index.ts` 中，将 `ICEPreparedMeshOverride`
添加到现有的 `buildPreparedGLB` 导出列表。

- [ ] **步骤 7：拒绝无效的选定 Mesh 几何体**

添加一个测试，其中 `meshOverrides` 引用具有 3 个 vertices 的代理中的 vertex index `9`。断言 `buildPreparedGLB` 抛出
`ICE3_TOOL_INVALID_GEOMETRY`，从而使无效的选定代理导致构建失败，
而不是发布不完整的 GLB。

- [ ] **步骤 8：运行聚焦测试和 typecheck**

运行：

```bash
npm test -- tests/output/buildPreparedGLB.test.ts \
  tests/output/validatePreparedGLB.test.ts
npm run typecheck
```

预期：PASS。

- [ ] **步骤 9：提交**

```bash
git add packages/toolchain-core/src/output/buildPreparedGLB.ts \
  packages/toolchain-core/src/index.ts \
  tests/output/buildPreparedGLB.test.ts
git commit -m "feat(toolchain): replace prepared mesh geometry"
```

---

### 任务 5：将代理样本添加到 Adaptive LOD

**文件：**
- 修改：`ice3-toolchain/packages/toolchain-core/src/lod/types.ts`
- 修改：`ice3-toolchain/packages/toolchain-core/src/lod/allocateAdaptiveLod.ts`
- 修改：`ice3-toolchain/packages/toolchain-core/src/lod/createLodUnitCurve.ts`
- 修改：`ice3-toolchain/packages/toolchain-core/src/partition/partitionAsset.ts`
- 修改：`ice3-toolchain/tests/lod/allocateAdaptiveLod.test.ts`
- 修改：`ice3-toolchain/tests/partition/lodGeneration.test.ts`

**接口：**
- 消费：`createSemanticProxy`、mesh overrides 和现有的 adaptive allocator。
- 产生样本替换 union：

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

- [ ] **步骤 1：编写失败的代理选择测试**

使用现有的 synthetic adaptive source，并将其简单的 flat mesh 替换为
封闭 box；第二个 wavy grid 仍作为 QEM 设备：

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

- [ ] **步骤 2：运行测试并验证其失败**

运行：

```bash
npm test -- tests/partition/lodGeneration.test.ts -t "semantic proxy"
```

预期：FAIL，因为尚未集成代理。

- [ ] **步骤 3：替换仅含 Primitive 的样本载荷**

将 `ICELodCurveSample` 和 allocation selections 从：

```ts
readonly primitives: readonly ICELodCurvePrimitive[];
```

改为：

```ts
readonly replacement: ICELodSampleReplacement;
```

将现有 QEM 样本更新为：

```ts
replacement: {
  kind: 'primitives',
  primitives,
}
```

按名称更新所有测试和 allocator 引用。

- [ ] **步骤 4：将已接受的代理插入 Curve**

在 QEM 样本之前，创建：

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

将可选的 `proxy` 添加到 `ICELodUnitCurveOptions`。

- [ ] **步骤 5：添加代理缓存和统计**

扩展 `ICBuildState`：

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

`loadUnitCurve` 通过 `createSemanticProxy` 解析一次代理，并将其传入 `createLodUnitCurve`。

- [ ] **步骤 6：构建混合 Mesh 和 Primitive 覆盖**

在 `selectAdaptiveCoarseGeometry` 中，拆分 selections：

```ts
const meshOverrides = new Map<number, ICEPreparedMeshOverride>();
const geometryOverrides = new Map<string, ICEGeometryOverride>();
```

对于 `replacement.kind === 'mesh'`：

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

对于 primitive replacements，像现在一样填充 `geometryOverrides`。

将两组参数都传给 `buildPreparedGLB`。

- [ ] **步骤 7：仅记录最终代理放置**

将代理放置信息包含在 `adaptiveMetrics` 中，并且仅在 coarse node 为最终结果时应用代理统计；当超大的父级候选被丢弃时不得应用。

- [ ] **步骤 8：运行 LOD 测试和 typecheck**

运行：

```bash
npm test -- tests/lod/allocateAdaptiveLod.test.ts \
  tests/lod/createLodUnitCurve.test.ts \
  tests/partition/lodGeneration.test.ts
npm run typecheck
```

预期：PASS。

- [ ] **步骤 9：提交**

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

### 任务 6：添加 CLI 控制和代理报告

**文件：**
- 修改：`ice3-toolchain/packages/toolchain-core/src/partition/partitionAsset.ts`
- 修改：`ice3-toolchain/packages/cli/src/commands.ts`
- 修改：`ice3-toolchain/tests/cli/commands.test.ts`
- 修改：`ice3-toolchain/README.md`

**接口：**
- 消费任务 5 产生的 `ICESemanticProxyMode` 和代理统计。

- [ ] **步骤 1：编写失败的 CLI 测试**

接受：

```ts
['--lod', '--lod-allocation', 'adaptive', '--semantic-proxy', 'auto']
['--lod', '--lod-allocation', 'adaptive', '--semantic-proxy', 'off']
```

在创建输出之前拒绝：

```ts
['--semantic-proxy', 'auto'] // without --lod
['--lod', '--lod-allocation', 'proportional', '--semantic-proxy', 'auto']
['--lod', '--lod-allocation', 'adaptive', '--semantic-proxy', 'unknown']
```

无效组合必须退出 `1`，打印相关选项名称，并且不留下输出目录。

- [ ] **步骤 2：运行测试并验证失败**

运行：

```bash
npm test -- tests/cli/commands.test.ts -t "semantic-proxy"
```

预期：FAIL，因为该选项未知。

- [ ] **步骤 3：解析并验证模式**

在 `partitionCommand` 中：

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

对于 `--semantic-proxy` 且没有 `--lod` 的情况，按以下方式拒绝：

```text
ICE3_TOOL_PARTITION_OPTIONS_INVALID: --semantic-proxy requires --lod
```

将该选项添加到 valued-option 集合，并将其包含在 LOD object 中。

- [ ] **步骤 4：公开代理统计**

将所有 `ICESemanticProxyStats` 字段添加到 `ICEPartitionResult['stats']`。

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

对于 `off`：

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

- [ ] **步骤 5：记录用法**

在 `README.md` 中：

```text
--semantic-proxy off|auto
  Generate conservative OBB and cylinder candidates for adaptive LOD.
  Default: off. auto requires adaptive allocation.
```

说明固定质量阈值和 QEM 回退机制。

- [ ] **步骤 6：运行 CLI 和 typecheck**

运行：

```bash
npm test -- tests/cli/commands.test.ts
npm run typecheck
```

预期：PASS。

- [ ] **步骤 7：提交**

```bash
git add packages/toolchain-core/src/partition/partitionAsset.ts \
  packages/cli/src/commands.ts \
  tests/cli/commands.test.ts \
  README.md
git commit -m "feat(cli): expose semantic proxy generation"
```

---

### 任务 7：真实 Asset 验证和最终集成

**文件：**
- 修改：`ice3-doc/docs/contracts/asset-preparation-contract-v1.md`
- 修改：`ice3-doc/docs/specs/2026-10-27-semantic-industrial-proxy-design.md`
- 修改：`ice3-toolchain/README.md`

- [ ] **步骤 1：在受控比较之前运行两个完整测试套件**

```bash
cd ../ice3-toolchain
source "$HOME/.nvm/nvm.sh"
nvm use 24
npm run verify

cd ../ice3-engine
npm run verify
```

预期：零失败。

- [ ] **步骤 2：在 Git 之外生成 off 和 auto 输出**

使用：

```bash
test -n "$ICE3_CONTROLLED_GLB"
output_root=$(mktemp -d /tmp/ice3-semantic-proxy.XXXXXX)
```

两者使用相同的参数：

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

第一次运行使用 `--semantic-proxy off`，第二次使用 `--semantic-proxy auto`。

- [ ] **步骤 3：评估接受门禁**

记录聚合值：

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

要求：

- 每个已接受的代理都通过了固定质量阈值。
- Coarse 三角形和字节预算不超过配置限制及现有软规则允许的范围。
- `overBudgetCoarseNodes` 不会因代理而增加。
- 如果已接受单元为零，则记录该 asset 没有保守代理候选，并保留默认值 `off`。
- 任何选定的代理都保持语义 IDs。

- [ ] **步骤 4：验证生成的内容**

- 对每个生成的 GLB 运行 Prepared GLB validation。
- 通过现有 example harness 在 Chromium 和 WebKit 中加载两个输出。
- 记录 resident nodes/bytes 和页面失败。
- 要求没有页面错误和失败请求。

- [ ] **步骤 5：更新共享 Contract**

向 `asset-preparation-contract-v1.md` 添加：

- `semanticProxy` CLI 模式。
- 固定代理阈值。
- 代理/QEM 竞争。
- Mesh 替换的标识保证。
- 代理报告字段。
- 默认关闭的兼容性保证。

将测得的总计结果添加到代理规范。不得包含 asset 名称或路径。

- [ ] **步骤 6：审计并清理**

运行：

```bash
git status --porcelain=v1
git grep -I -n 'CONTROLLED_ASSET_NAME' -- . ':!package-lock.json' || true
git ls-files '*.glb' '*.gltf' '*.bin' | wc -l
```

记录结果后删除确切的临时输出目录。

- [ ] **步骤 7：最终验证**

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

预期：全部通过，packages 中没有类似模型的文件。

- [ ] **步骤 8：提交最终文档**

```bash
cd ../ice3-doc
git add docs/contracts/asset-preparation-contract-v1.md \
  docs/specs/2026-10-27-semantic-industrial-proxy-design.md
git commit -m "docs: record semantic proxy contract"

cd ../ice3-toolchain
git add README.md
git commit -m "docs: finalize semantic proxy guidance"
```

## 相关文档

- `ICE3-DOC-IDX-001` — [文档索引](../README.md)
- `ICE3-DOC-SPEC-006` — [语义工业代理规范](../specs/2026-10-27-semantic-industrial-proxy-design.md)
