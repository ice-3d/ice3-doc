# 自适应工业 LOD 实施计划

> Document ID: ICE3-DOC-PLAN-001
>
> Status: Implemented
>
> Owner: ICE3 架构维护者

> **面向智能体执行者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 按任务逐步实施本计划。步骤使用复选框（`- [ ]`）语法跟踪。

**目标：** 在保留现有标准 Tileset、Prepared GLB 和运行时契约的前提下，增加确定性的逐单元自适应粗模预算分配。

**架构：** 工具链为每个语义单元生成有界简化曲线，将采样几何存储在现有临时工作区中，并贪心地将 Tile 的三角形预算分配给边际误差降低最大的单元。本阶段的自适应模式为可选启用；现有的 proportional 分配器保持逐字节兼容。

**技术栈：** Node.js 24.22.1 LTS、TypeScript 7、ESM、npm workspaces、Node.js 内置测试运行器、`expect`、`tsx`、Prepared GLB、OGC 3D Tiles 1.1、`meshoptimizer` 简化器

**规范：** `../specs/2026-10-27-adaptive-industrial-lod-design.md`

## 全局约束

- 使用 `.nvmrc` 指定的 Node.js 24.22.1 LTS；不要使用 Node 25 进行验证。
- 在功能分支上开发，仅在完整验证通过后合入 `main`。
- 不要添加运行时依赖。
- 不要添加私有 Asset 或 Tileset 格式；输出仍为 Prepared GLB 和 OGC 3D Tiles 1.1。
- 本阶段不要更改引擎运行时 API。
- 现有 `proportional` 模式必须保留当前输出和测试。
- 自适应生成仅在离线环境中执行。
- Selection ID 和语义设备边界必须在所有采样与重建步骤中保持不变。
- 在工作区溢出和粗模重建过程中保留顶点颜色。
- 切勿将受控客户 Asset 或派生文件写入 Git、包、日志、测试或文档。
- 避免在代码、注释、测试、提交和文档中出现竞品名称以及被禁止的通用 3D 库品牌术语。
- 对于相同输入、选项和工具版本，所有采样和分配必须具有确定性。

## 审查重点

- 设备最低三角形数可能超过自适应 Tile 预算；构建必须明确失败，而不是返回超出预算的粗模 Tile。
- 溢出的采样几何可能静默丢失顶点颜色；测试必须通过内存和磁盘两条路径往返验证颜色。
- 简化可能进入平台期或保留源几何，从而产生相同的实际三角形数；边际收益除法必须安全跳过零成本步骤。
- 同一语义单元会出现在多个祖先 Tile 中；其曲线必须只计算一次，并以相同的 selection 标识复用。
- 从采样的工作区几何重建粗模 GLB 可能丢失 Selection ID；测试必须断言每个自适应粗模 Node 仍暴露其源设备标识。

## 文件结构

- `packages/toolchain-core/src/partition/types.ts` 负责公共 LOD 配置。
- `packages/toolchain-core/src/lod/types.ts` 负责曲线、样本、primitive 和分配类型。
- `packages/toolchain-core/src/lod/createLodSampleSchedule.ts` 负责确定性的目标三角形采样。
- `packages/toolchain-core/src/lod/allocateAdaptiveLod.ts` 负责纯预算分配。
- `packages/toolchain-core/src/lod/createLodUnitCurve.ts` 负责单元级采样几何生成。
- `packages/toolchain-core/src/lod/createGeometryWorkspace.ts` 负责临时采样几何存储。
- `packages/toolchain-core/src/partition/partitionAsset.ts` 将曲线集成到粗模 Node 构建中，同时保留 proportional 模式。
- `packages/cli/src/commands.ts` 负责 CLI 解析和验证。
- `packages/toolchain-core/src/index.ts` 导出新的公共类型和函数。

---

### 任务 1：添加 LOD 配置和确定性采样目标

**文件：**
- 修改：`ice3-toolchain/packages/toolchain-core/src/partition/types.ts`
- 新建：`ice3-toolchain/packages/toolchain-core/src/lod/createLodSampleSchedule.ts`
- 新建：`ice3-toolchain/tests/lod/createLodSampleSchedule.test.ts`
- 修改：`ice3-toolchain/packages/toolchain-core/src/index.ts`

**接口：**
- 使用：现有 `ICELodBuildOptions`。
- 产出：

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

- [ ] **步骤 1：编写失败的采样计划测试**

```ts
import { test } from 'node:test';
import { expect } from 'expect';
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

- [ ] **步骤 2：运行测试以验证其失败**

运行：

```bash
cd ../ice3-toolchain
source "$HOME/.nvm/nvm.sh"
nvm use 24
npm test -- tests/lod/createLodSampleSchedule.test.ts
```

预期：失败，因为模块和导出的函数尚不存在。

- [ ] **步骤 3：添加配置类型**

在 `packages/toolchain-core/src/partition/types.ts` 中：

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

- [ ] **步骤 4：实现确定性对数目标**

在 `packages/toolchain-core/src/lod/createLodSampleSchedule.ts` 中：

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

- [ ] **步骤 5：导出新类型和函数**

在 `packages/toolchain-core/src/index.ts` 中：

```ts
export {
  createLodSampleSchedule,
  type ICELodSampleScheduleOptions,
} from './lod/createLodSampleSchedule.js';

export type {
  ICELodAllocationMode,
} from './partition/types.js';
```

- [ ] **步骤 6：运行聚焦测试和类型检查**

运行：

```bash
npm test -- tests/lod/createLodSampleSchedule.test.ts
npm run typecheck
```

预期：两条命令均通过。

- [ ] **步骤 7：提交**

```bash
git add packages/toolchain-core/src/partition/types.ts \
  packages/toolchain-core/src/lod/createLodSampleSchedule.ts \
  packages/toolchain-core/src/index.ts \
  tests/lod/createLodSampleSchedule.test.ts
git commit -m "feat(toolchain): define deterministic lod samples"
```

---

### 任务 2：实现自适应预算分配器

**文件：**
- 新建：`ice3-toolchain/packages/toolchain-core/src/lod/types.ts`
- 新建：`ice3-toolchain/packages/toolchain-core/src/lod/allocateAdaptiveLod.ts`
- 新建：`ice3-toolchain/tests/lod/allocateAdaptiveLod.test.ts`
- 修改：`ice3-toolchain/packages/toolchain-core/src/index.ts`

**接口：**
- 使用：采样曲线产生的实际三角形数和误差值。
- 产出：

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

- [ ] **步骤 1：编写失败的分配器测试**

```ts
import { test } from 'node:test';
import { expect } from 'expect';
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

- [ ] **步骤 2：运行测试以验证其失败**

运行：

```bash
npm test -- tests/lod/allocateAdaptiveLod.test.ts
```

预期：失败，因为分配器模块尚不存在。

- [ ] **步骤 3：定义曲线和分配类型**

使用 **接口** 块中的接口创建 `packages/toolchain-core/src/lod/types.ts`，并从 `allocateAdaptiveLod.ts` 导出这些接口。

- [ ] **步骤 4：实现受约束的贪心分配**

在 `packages/toolchain-core/src/lod/allocateAdaptiveLod.ts` 中：

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

- [ ] **步骤 5：导出分配器**

在 `packages/toolchain-core/src/index.ts` 中：

```ts
export {
  allocateAdaptiveLod,
  type ICELodAllocation,
  type ICELodAllocationInput,
  type ICELodCurveSample,
  type ICELodUnitCurve,
} from './lod/allocateAdaptiveLod.js';
```

- [ ] **步骤 6：运行聚焦测试和类型检查**

运行：

```bash
npm test -- tests/lod/allocateAdaptiveLod.test.ts \
  tests/lod/allocateLodTargets.test.ts
npm run typecheck
```

预期：全部通过。

- [ ] **步骤 7：提交**

```bash
git add packages/toolchain-core/src/lod/types.ts \
  packages/toolchain-core/src/lod/allocateAdaptiveLod.ts \
  packages/toolchain-core/src/index.ts \
  tests/lod/allocateAdaptiveLod.test.ts
git commit -m "feat(toolchain): allocate lod by marginal error"
```

---

### 任务 3：在几何工作区中保留顶点颜色

**文件：**
- 修改：`ice3-toolchain/packages/toolchain-core/src/lod/createGeometryWorkspace.ts`
- 修改：`ice3-toolchain/tests/lod/createGeometryWorkspace.test.ts`

**接口：**
- 使用：采样的位置、索引和可选顶点颜色。
- 产出：

```ts
interface ICEWorkspaceGeometry {
  readonly positions: Float32Array;
  readonly indices: Uint32Array;
  readonly colors?: Float32Array;
}
```

- [ ] **步骤 1：编写失败的内存和溢出颜色测试**

追加到 `tests/lod/createGeometryWorkspace.test.ts`：

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

- [ ] **步骤 2：运行测试以验证其失败**

运行：

```bash
npm test -- tests/lod/createGeometryWorkspace.test.ts
```

预期：失败，因为颜色没有被存储或返回。

- [ ] **步骤 3：扩展溢出编码**

在 `createGeometryWorkspace.ts` 中：

- 向 `ICEWorkspaceGeometry` 和 `IGEStoredGeometry` 添加可选 `colors`。
- 将编码头从 8 字节增加到 12 字节：位置字节数、索引字节数、颜色字节数。
- 将颜色字节计入工作区内存限制。
- 溢出时在索引之后复制颜色。
- 存在颜色时，解码并验证每个顶点的颜色长度为 3 或 4 个浮点数。
- 对于内存路径返回防御性副本。

- [ ] **步骤 4：运行聚焦测试**

运行：

```bash
npm test -- tests/lod/createGeometryWorkspace.test.ts \
  tests/lod/simplifyGeometry.test.ts
npm run typecheck
```

预期：溢出和内存中的颜色用例均通过。

- [ ] **步骤 5：提交**

```bash
git add packages/toolchain-core/src/lod/createGeometryWorkspace.ts \
  tests/lod/createGeometryWorkspace.test.ts
git commit -m "feat(toolchain): retain colors in lod workspace"
```

---

### 任务 4：构建逐单元简化曲线

**文件：**
- 新建：`ice3-toolchain/packages/toolchain-core/src/lod/createLodUnitCurve.ts`
- 新建：`ice3-toolchain/tests/lod/createLodUnitCurve.test.ts`
- 修改：`ice3-toolchain/packages/toolchain-core/src/lod/types.ts`
- 修改：`ice3-toolchain/packages/toolchain-core/src/index.ts`

**接口：**
- 使用：`simplifyGeometry`、`createLodSampleSchedule`，以及已经以可选颜色存储在 Workspace 中的 Prepared primitive 几何。
- 产出：

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

- [ ] **步骤 1：编写失败的曲线测试**

使用双三角形带颜色的 Workspace 几何创建 `tests/lod/createLodUnitCurve.test.ts`：

```ts
import { test } from 'node:test';
import { expect } from 'expect';
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

- [ ] **步骤 2：运行测试以验证其失败**

运行：

```bash
npm test -- tests/lod/createLodUnitCurve.test.ts
```

预期：失败，因为曲线模块尚不存在。

- [ ] **步骤 3：实现单元采样生成**

在 `createLodUnitCurve.ts` 中：

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

- [ ] **步骤 4：添加颜色保留测试**

扩展曲线测试，使其读取每个采样几何，并断言任何带颜色的几何在每个顶点上恰好有 3 或 4 个颜色分量且值均为有限值。

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

- [ ] **步骤 5：运行聚焦测试**

运行：

```bash
npm test -- tests/lod/createLodUnitCurve.test.ts \
  tests/lod/createGeometryWorkspace.test.ts \
  tests/lod/simplifyGeometry.test.ts
npm run typecheck
```

预期：全部通过。

- [ ] **步骤 6：提交**

```bash
git add packages/toolchain-core/src/lod/types.ts \
  packages/toolchain-core/src/lod/createLodUnitCurve.ts \
  packages/toolchain-core/src/index.ts \
  tests/lod/createLodUnitCurve.test.ts
git commit -m "feat(toolchain): build per-unit lod curves"
```

---

### 任务 5：将自适应分配集成到粗模构建

**文件：**
- 修改：`ice3-toolchain/packages/toolchain-core/src/partition/partitionAsset.ts`
- 修改：`ice3-toolchain/tests/partition/lodGeneration.test.ts`
- 新建：`ice3-toolchain/tests/partition/createAdaptiveLodSource.ts`

**接口：**
- 使用：

```ts
allocateAdaptiveLod(input): ICELodAllocation
createLodUnitCurve(options): Promise<ICELodUnitCurve>
```

- 产出：`ICEPartitionResult` 文件和 Tileset 保持不变；当 `lod.allocation === 'adaptive'` 时使用自适应粗模几何。

- [ ] **步骤 1：创建异构源 fixture**

创建两个 Node 数相同但几何复杂度不同的语义单元：

- 单元 `simple-box`：一个 8 三角形的盒体。
- 单元 `complex-grid`：一个多段曲面或网格表面，其三角形数量显著更多，简化误差也更高。

创建 `tests/partition/createAdaptiveLodSource.ts`：

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

不要复制受控客户几何。

- [ ] **步骤 2：编写失败的集成测试**

追加到 `tests/partition/lodGeneration.test.ts`：

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

- [ ] **步骤 3：运行测试以验证其失败**

运行：

```bash
npm test -- tests/partition/lodGeneration.test.ts -t heterogeneous
```

预期：失败，因为 `allocation`、`curveSamples` 和自适应统计尚未集成。

- [ ] **步骤 4：添加曲线缓存**

扩展 `ICBuildState`：

```ts
readonly lodCurveCache: Map<string, Promise<ICELodUnitCurve>>;
readonly adaptiveUnitIds: Set<string>;
readonly adaptiveRatios: number[];
maximumAdaptiveErrorMeters: number;
```

在 `partitionAsset.ts` 中添加辅助函数：

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

- [ ] **步骤 5：将源顶点颜色存储到规范化 Workspace 几何中**

在 `normalizeLodGeometry` 中，写入 primitive 之前读取 `COLOR_0`：

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

这样，规范化 Workspace 就成为 proportional 和自适应路径共用的唯一几何源。

- [ ] **步骤 6：按分配模式分支构建粗模**

在 `buildSingleCoarseNode` 中，保持当前 proportional 路径不变。添加一条自适应路径，使其：

1. 通过 `loadUnitCurve` 加载所有单元曲线。
2. 根据 `node.bounds` 计算 Node 对角线。
3. 使用 `maxTrianglesPerProxy` 调用 `allocateAdaptiveLod`。
4. 从 `workspace` 加载每个选定的采样 primitive。
5. 按 `sourceKey` 将这些几何放入现有 `overrides` 映射。
6. 使用 `allocation.maximumErrorMeters` 作为 `coarseError`。
7. 设置 `overBudget = allocation.allocatedTriangles > maxTrianglesPerProxy`。

使用以下结构：

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

- [ ] **步骤 7：更新自适应构建统计**

当自适应粗模 Node 最终确定时：

- 将采样比例与 Node 主导比例相差超过 `0.01` 的每个单元 ID 添加到 `adaptiveUnitIds`。
- 记录每个选定单元的比例 `actualTriangles / sourceTriangles`。
- 更新 `maximumAdaptiveErrorMeters`。

在 `ICEPartitionResult['stats']` 中暴露：

```ts
readonly allocationMode: 'proportional' | 'adaptive';
readonly adaptiveUnitCount: number;
readonly minimumUnitTriangleRatio: number;
readonly maximumUnitTriangleRatio: number;
readonly maximumErrorMeters: number;
readonly curveSampleCount: number;
```

对于 proportional 模式返回：

```ts
allocationMode: 'proportional',
adaptiveUnitCount: 0,
minimumUnitTriangleRatio: 0,
maximumUnitTriangleRatio: 0,
maximumErrorMeters: 0,
curveSampleCount: 0,
```

- [ ] **步骤 8：逐字节保留 proportional 输出**

从 `node:crypto` 向 `tests/partition/lodGeneration.test.ts` 添加 `createHash`，并断言现有合成输出的哈希值：

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

- [ ] **步骤 9：运行集成测试**

运行：

```bash
npm test -- tests/partition/lodGeneration.test.ts \
  tests/partition/partitionAsset.test.ts \
  tests/partition/tileset.test.ts
npm run typecheck
```

预期：全部通过。

- [ ] **步骤 10：提交**

```bash
git add packages/toolchain-core/src/partition/partitionAsset.ts \
  tests/partition/lodGeneration.test.ts \
  tests/partition/createAdaptiveLodSource.ts
git commit -m "feat(toolchain): integrate adaptive coarse allocation"
```

---

### 任务 6：添加 CLI 控制项并验证报告

**文件：**
- 修改：`ice3-toolchain/packages/cli/src/commands.ts`
- 修改：`ice3-toolchain/tests/cli/commands.test.ts`
- 修改：`ice3-toolchain/README.md`

**接口：**
- 使用：`ICELodAllocationMode` 和 `curveSamples`。
- 产出 CLI 选项：

```text
--lod-allocation <proportional|adaptive>
--lod-curve-samples <count>
```

- [ ] **步骤 1：编写失败的 CLI 解析测试**

添加：

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

- [ ] **步骤 2：运行 CLI 测试以验证失败**

运行：

```bash
npm test -- tests/cli/commands.test.ts -t "allocation|adaptive"
```

预期：失败，因为这些选项未知。

- [ ] **步骤 3：解析并验证选项**

在 `partitionCommand` 中：

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

在 `lod` 对象中返回这两个值，并将这两个名称加入带值选项集合。

- [ ] **步骤 4：记录 CLI 用法**

添加到 `README.md`：

```text
--lod-allocation proportional|adaptive
  Select proportional or error-curve-based coarse-model allocation.
  Default: proportional.

--lod-curve-samples 4..32
  Number of logarithmic samples per semantic unit in adaptive mode.
  Default: 8.
```

- [ ] **步骤 5：运行 CLI 和打印验证**

运行：

```bash
npm test -- tests/cli/commands.test.ts
npm run typecheck
```

预期：全部通过。

- [ ] **步骤 6：提交**

```bash
git add packages/cli/src/commands.ts \
  tests/cli/commands.test.ts \
  README.md
git commit -m "feat(cli): expose adaptive lod allocation"
```

---

### 任务 7：运行真实 Asset 比较并完成集成

**文件：**
- 修改：`ice3-doc/docs/contracts/asset-preparation-contract-v1.md`
- 修改：`ice3-toolchain/README.md`
- 仅当新的公共导出需要时，修改 `ice3-toolchain/tests/architecture/layout.test.ts`

- [ ] **步骤 1：在受控比较之前运行两套完整测试**

运行：

```bash
cd ../ice3-toolchain
source "$HOME/.nvm/nvm.sh"
nvm use 24
npm run verify

cd ../ice3-engine
npm run verify
```

预期：零失败。引擎代码不应发生变化，因此引擎门禁可证明兼容性。

- [ ] **步骤 2：在 Git 之外生成两种模式**

使用环境变量指定受控源：

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

仅记录两个 JSON 报告中的汇总统计。

- [ ] **步骤 3：评估验收门禁**

要求：

- `oversizedCoarseChunks === 0`。
- 每个粗模 Tile 均保持在 `maxTrianglesPerProxy` 以内。
- 自适应 `maximumErrorMeters` 或高百分位单元误差低于 proportional。
- 自适应粗模三角形总数不超过配置预算。
- 生成的粗模 GLB 通过 `validate`，且引擎能够加载 Tileset。
- Chromium 或 WebKit 中均无页面错误或失败请求。

如果自适应结果没有提高保真度，则保留 `proportional` 作为默认模式，并记录实测原因。

- [ ] **步骤 4：更新共享契约**

在 `ice3-doc/docs/contracts/asset-preparation-contract-v1.md` 中记录：

- `allocationMode`。
- `curveSamples`。
- 自适应分配统计。
- `proportional` 兼容性保证。
- 自适应分配绝不更改 Tileset schema 的规则。

在 `ice3-toolchain/README.md` 中记录自适应曲线的生成、缓存、溢出和清理方式。

- [ ] **步骤 5：审查敏感信息和命名约束**

运行：

```bash
git status --porcelain=v1
git grep -I -n 'CONTROLLED_ASSET_NAME' -- . ':!package-lock.json' || true
git ls-files '*.glb' '*.gltf' '*.bin' | wc -l
```

预期：

- 不出现受控源或派生输出。
- 不出现客户标识符。
- 跟踪的模型 fixture 仅为已审查的合成 Asset。

- [ ] **步骤 6：移除临时输出**

记录汇总结果后，删除步骤 2 中创建的确切 `mktemp` 目录。不要使用宽泛的目录目标。

- [ ] **步骤 7：运行最终验证**

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

预期：

- 所有测试均通过。
- 包列表中不出现类似模型的文件。
- 提交文档更改后 Git 工作树干净。

- [ ] **步骤 8：提交最终文档**

```bash
cd ../ice3-doc
git add docs/contracts/asset-preparation-contract-v1.md
git commit -m "docs: define adaptive lod allocation contract"

cd ../ice3-toolchain
git add README.md
git commit -m "docs: describe adaptive lod generation"
```

## 相关文档

- `ICE3-DOC-IDX-001` — [文档索引](../README.md)
- `ICE3-DOC-SPEC-001` — [自适应工业 LOD 规范](../specs/2026-10-27-adaptive-industrial-lod-design.md)
