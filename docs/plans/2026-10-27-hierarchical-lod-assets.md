# ICE3 层级 LOD 资产生成实施计划

> Document ID: ICE3-DOC-PLAN-005
>
> Status: Implemented
>
> Owner: ICE3 architecture maintainers

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在工具链中从一次源模型构建同时生成细模、层级粗模、真实 `geometricError`、稳定设备选择身份和可审计报告。

**Architecture:** 扩展 Prepared GLB 的节点身份，使视觉节点可以按 LOD 命名而选择身份保持稳定。工具链先规范化设备几何到受控工作区，再在同一空间树构建任务中生成细模叶子和粗模内部节点，最后原子发布标准 Tileset。

**技术栈：** TypeScript 7、Node.js 24.22.1 LTS、Node.js test runner、`meshoptimizer@1.3.0`、OGC 3D Tiles 1.1、ICE3 Prepared GLB。

**规格：** `../specs/2026-10-27-hierarchical-lod-design.md`

## 全局约束

- 各仓库使用 `.nvmrc` 指定的 Node.js 24.22.1 LTS。
- 在 `feature/hierarchical-lod` 开发，完整门禁通过后才合入 `main`。
- 每项行为变化遵循 RED-GREEN-REFACTOR。
- Artifact 中不得使用竞品或厂商产品名称。
- Git、fixture、screenshot、log 或 package 中不得暴露真实客户模型及派生数据。
- Runtime conversion、Mesh simplification 和 format conversion 只在 Toolchain 中执行。
- Browser Runtime 不为 LOD 增加 dependency。
- 默认值：`lodRatio=0.15`、`lodMaxTriangles=250000`、`lodMinUnitTriangles=8`。
- 每个 coarse ancestor 都必须包含每个 device Selection ID。
- Source Geometry 只规范化一次并复用；coarse parent 不得简化 child coarse proxy。
- 最终 Asset 目录原子发布。
- 不向普通 GLB 或应用层增加 LOD 支持。

## 审查重点

- Triangle 数量很少的 device 必须保留在 coarse generation 中，不能变得不可选。
- Per-device minimum 总和可能超过 `lodMaxTriangles`；所有 device 仍须保留。
- Coarse parent 必须保留 source color，且不得把其他 coarse Node 作为 simplification input。
- Build 失败或取消时必须移除 output 和 temporary Geometry workspace。
- Browser package 不得增加 `meshoptimizer` runtime dependency。

---

### Task 1：跨 LOD Content 保持稳定 Selection Identity

**文件：**
- 修改：`ice3-toolchain/packages/toolchain-core/src/output/buildPreparedGLB.ts`
- 修改：`ice3-toolchain/packages/toolchain-core/src/output/validatePreparedGLB.ts`
- 修改：`ice3-toolchain/tests/output/buildPreparedGLB.test.ts`
- 修改：`ice3-engine/packages/assets/src/ICEPreparedGLB.ts`
- 修改：`ice3-engine/packages/assets/src/ICEGLBReader.ts`
- 修改：`ice3-engine/packages/assets/src/ICEProfileValidator.ts`
- 修改：`ice3-engine/packages/assets/tests/GLBReader.test.ts`
- 修改：`ice3-engine/packages/assets/tests/createFixture.ts`
- 修改：`ice3-engine/packages/runtime/src/asset/ICEAssetSceneBuilder.ts`
- 修改：`ice3-engine/packages/runtime/tests/AssetSceneBuilder.test.ts`

**接口：**
- 消费：现有 `node.extras.ice3.id`。
- 产出：

```ts
interface ICEBuildOptions {
  readonly selectionIdAssetId?: string;
}

interface ICEPreparedNode {
  readonly id: string;
  readonly selectionId: string;
}
```

- `selectionId` 在磁盘上可选，默认使用 `id`。
- 提供 `selectionIdAssetId` 时，Node extras 同时包含
  `id: "${assetId}/node/${index}"` 和 `selectionId: "${selectionIdAssetId}/node/${index}"`。

- [ ] **步骤 1：编写失败的 Identity test**

在 Toolchain `tests/output/buildPreparedGLB.test.ts` 中添加：

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

在 Engine `packages/assets/tests/GLBReader.test.ts` 中添加：

```ts
it('reads an explicit selection identity for LOD content', () => {
  const snapshot = readPreparedGLB(createMinimalPreparedGLB({
    selectionId: 'semantic/device/7',
  }));

  expect(snapshot.nodes[0]!.id).toBe('fixture/node/0');
  expect(snapshot.nodes[0]!.selectionId).toBe('semantic/device/7');
});
```

修改 `createMinimalPreparedGLB` option 和 Node extras：

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

在 Runtime `packages/runtime/tests/AssetSceneBuilder.test.ts` 中添加：

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

- [ ] **步骤 2：运行 RED**

```bash
cd ../ice3-toolchain
npm test -- tests/output/buildPreparedGLB.test.ts

cd ../ice3-engine
npm test -- packages/assets/tests/GLBReader.test.ts \
  packages/runtime/tests/AssetSceneBuilder.test.ts
```

预期：因为 `selectionId` 尚未生成、解析或消费而失败。

- [ ] **步骤 3：实现可选 Selection identity**

Toolchain output：

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

Validation 只在 `selectionId` 为非空 string 时接受。

Engine reader：

```ts
const selectionId = record(record(node.extras)?.ice3)?.selectionId;
selectionId: typeof selectionId === 'string' && selectionId.trim()
  ? selectionId
  : id,
```

Scene builder 对 primary 和 secondary Mesh 都使用 `source.selectionId`。

- [ ] **步骤 4：验证 GREEN**

```bash
cd ../ice3-toolchain
npm test -- tests/output/buildPreparedGLB.test.ts tests/output/validatePreparedGLB.test.ts

cd ../ice3-engine
npm run typecheck
npm test -- packages/assets/tests/GLBReader.test.ts \
  packages/runtime/tests/AssetSceneBuilder.test.ts
npm test
```

预期：全部通过，既有 fixture 仍可从 `id` 解析 Selection identity。

- [ ] **步骤 5：提交两个仓库**

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

### Task 2：Primitive Geometry 简化

**文件：**
- 修改：`ice3-toolchain/packages/toolchain-core/package.json`
- 修改：`ice3-toolchain/package-lock.json`
- 新建：`ice3-toolchain/packages/toolchain-core/src/lod/simplifyGeometry.ts`
- 新建：`ice3-toolchain/tests/lod/simplifyGeometry.test.ts`
- 修改：`ice3-toolchain/packages/toolchain-core/src/index.ts`

**接口：**

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

- [ ] **步骤 1：添加准确的 Tool dependency**

```bash
cd ../ice3-toolchain
source "$HOME/.nvm/nvm.sh"
nvm use 24
npm install --workspace @ice3/toolchain-core --save-exact meshoptimizer@1.3.0
```

Expected: `meshoptimizer` appears only in `@ice3/toolchain-core` dependencies.

- [ ] **步骤 2：编写失败的 simplification test**

Create `tests/lod/simplifyGeometry.test.ts`:

```ts
import { test } from 'node:test';
import { expect } from 'expect';
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

- [ ] **步骤 3：运行 RED**

```bash
npm test -- tests/lod/simplifyGeometry.test.ts
```

Expected: FAIL because `simplifyGeometry` does not exist.

- [ ] **步骤 4：实现 simplifier adapter**

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

- 调用 library 前校验 input length 和 index range。
- `targetTriangles` 被限制在 `minimumTriangles` 与 source triangles 之间。
- `errorMeters = relativeError * scale`。
- Simplification 返回少于一个 triangle 或抛出异常时，返回 source Geometry，并设置
  `preservedSource: true`。
- Do not mutate caller arrays.
- Remove unreferenced vertices before returning to keep coarse bytes bounded.
- Export the API from `packages/toolchain-core/src/index.ts`.

- [ ] **步骤 5：验证 GREEN**

```bash
npm test -- tests/lod/simplifyGeometry.test.ts
npm run typecheck
npm test
```

预期：全部通过，simplifier 只由 Toolchain workspace package 加载。

- [ ] **步骤 6：提交**

```bash
git add package-lock.json \
  packages/toolchain-core/package.json \
  packages/toolchain-core/src/lod/simplifyGeometry.ts \
  packages/toolchain-core/src/index.ts \
  tests/lod/simplifyGeometry.test.ts
git commit -m "feat(toolchain): simplify partition geometry"
```

---

### Task 3：有界 Geometry Workspace

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

- [ ] **步骤 1：编写失败的 workspace test**

```ts
import { existsSync } from 'node:fs';
import { test } from 'node:test';
import { expect } from 'expect';
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

第二个测试写入 Geometry、调用 `dispose()`，并验证 workspace temporary root 不再存在。

- [ ] **步骤 2：运行 RED**

```bash
npm test -- tests/lod/createGeometryWorkspace.test.ts
```

预期：因为 workspace 不存在而失败。

- [ ] **步骤 3：实现 workspace**

- 使用 `mkdtemp(join(tmpdir(), 'ice3-lod-'))`。
- 总 bytes 不超过 cap 时将 typed array 保留在内存。
- 超出的 entry 写入确定性 binary file。
- 每个 workspace 使用独立 key map，并拒绝 duplicate key。
- Return copies from `read()` so callers cannot mutate stored data.
- `dispose()` is idempotent and recursively removes only the workspace root.
- Cleanup errors are surfaced with `ICE3_TOOL_LOD_CLEANUP_FAILED`.

- [ ] **步骤 4：验证 GREEN**

```bash
npm test -- tests/lod/createGeometryWorkspace.test.ts
npm run typecheck
```

预期：测试通过，disposal 后 `/tmp` 中没有 workspace。

- [ ] **步骤 5：提交**

```bash
git add packages/toolchain-core/src/lod/createGeometryWorkspace.ts \
  packages/toolchain-core/src/index.ts \
  tests/lod/createGeometryWorkspace.test.ts
git commit -m "feat(toolchain): bound lod geometry workspace"
```

---

### Task 4：集成 Fine 与 Coarse Build

**文件：**
- 修改：`ice3-toolchain/packages/toolchain-core/src/partition/types.ts`
- 修改：`ice3-toolchain/packages/toolchain-core/src/partition/partitionAsset.ts`
- 新建：`ice3-toolchain/packages/toolchain-core/src/lod/allocateLodTargets.ts`
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

这些 aggregate field 属于 partition result 和 report，不得加入每个 Prepared GLB 的
内嵌 contract stat。

- [ ] **步骤 1：编写失败的 target-allocation test**

```ts
import { test } from 'node:test';
import { expect } from 'expect';
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

- [ ] **步骤 2：编写失败的 integrated partition test**

创建包含两个 spatial group 和多个 triangle primitive 的 test source，并断言：

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

再从同一 source 生成第二个 coarse Node，并断言：

- 每个 coarse GLB 都通过 validation。
- Coarse content 中的 Selection ID 与 source unit 一致。
- 不使用 source `readAccessor` path 再次解析独立的 source document。
- workspace `dispose()` is called after success and after forced failure.

- [ ] **步骤 3：运行 RED**

```bash
npm test -- tests/lod/allocateLodTargets.test.ts \
  tests/partition/lodGeneration.test.ts
```

预期：因为 LOD option 和 coarse file 不存在而失败。

- [ ] **步骤 4：实现 allocation 和 integrated generation**

Integrate into the existing recursive `partitionAsset` task:

1. 将每个 source semantic unit 规范化一次并写入 workspace。
2. 使用 unit Geometry 构建 leaf。
3. 为每个 internal plan Node 分配 per-unit target。
4. 从 workspace 读取原始 unit Geometry。
5. Simplify each primitive independently and build one coarse GLB for the node.
6. Assign the coarse GLB an asset ID of
   `${assetId}:lod:${partitionId}` and
   `selectionIdAssetId: assetId`.
7. Keep all outputs in the same in-memory result consumed by the CLI.
8. Dispose the workspace in a `finally` block.

不得递归调用 `partitionAsset`，也不得简化 child coarse GLB。

- [ ] **步骤 5：验证 GREEN**

```bash
npm test -- tests/lod/allocateLodTargets.test.ts \
  tests/partition/lodGeneration.test.ts
npm run typecheck
npm test
```

预期：全部通过，既有 non-LOD partition output 保持不变。

- [ ] **步骤 6：提交**

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

### Task 5：Geometric Error 与 Hierarchical Tileset

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

- [ ] **步骤 1：编写失败的 error-hierarchy test**

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

- [ ] **步骤 2：运行 RED**

```bash
npm test -- tests/partition/tileset.test.ts \
  tests/partition/lodGeneration.test.ts
```

预期：当前 Tileset error 由 Bounds diagonal 推导且省略 parent content，因此失败。

- [ ] **步骤 3：实现 error propagation**

- Leaf 使用 `geometricError: 0`。
- Internal Tile error 为 `max(measuredCoarseError, ...childErrors)`。
- Coarse GLB 存在时写入 parent `content.uri`。
- Reject non-finite, negative, or child-exceeding errors.
- Keep child sorting stable by `partitionId`.
- Validate with the existing OGC schema bundle.

- [ ] **步骤 4：验证 GREEN**

```bash
npm test -- tests/partition/tileset.test.ts \
  tests/partition/lodGeneration.test.ts
npm test
```

预期：全部通过，官方 Tileset schema 接受 parent content。

- [ ] **步骤 5：提交**

```bash
git add packages/toolchain-core/src/partition/tileset.ts \
  packages/toolchain-core/src/partition/partitionAsset.ts \
  tests/partition/tileset.test.ts \
  tests/partition/lodGeneration.test.ts
git commit -m "feat(toolchain): write hierarchical geometric error"
```

---

### Task 6：CLI Option、Report 和 Atomic Publication

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

- JSON result stat 包含 Task 4 引入的 coarse field。
- Atomic failure 移除 `.tmp` output directory 和 workspace file。

- [ ] **步骤 1：编写失败的 CLI test**

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

增加强制 coarse-build failure test，并断言 output directory 和 temporary workspace
都不存在。

- [ ] **步骤 2：运行 RED**

```bash
npm test -- tests/cli/commands.test.ts
```

预期：因为 CLI 拒绝 LOD flag 而失败。

- [ ] **步骤 3：实现 CLI 和 report 变更**

- 准确解析四个 flag。
- 只有出现 `--lod` 时才传入已校验 `ICELodBuildOptions` object。
- JSON output 包含 `coarseTriangleCount`、`coarseBytes`、`maxCoarseBytes`、
  `preservedCoarseUnits` 和 `overBudgetCoarseNodes`。
- Validate every fine and coarse GLB before publishing.
- Keep the entire directory write and rename sequence atomic.
- On catch, remove both the temporary output and any workspace owned by the
  command.

- [ ] **步骤 4：验证 GREEN**

```bash
npm test -- tests/cli/commands.test.ts
npm run typecheck
npm test
```

预期：全部通过；没有 `--lod` 时，既有 output 保持 byte-identical。

- [ ] **步骤 5：提交**

```bash
git add packages/cli/src/commands.ts tests/cli/commands.test.ts README.md
git commit -m "feat(cli): expose hierarchical lod generation"

cd ../ice3-doc
git add docs/contracts/asset-preparation-contract-v1.md
git commit -m "docs: define hierarchical lod asset contract"
```

---

### Task 7：Asset Pipeline 验证

**Files:**
- Modify: `ice3-toolchain/README.md`
- Modify: `ice3-engine/docs/api/m1.md`

- [ ] **步骤 1：运行完整 Toolchain 门禁**

```bash
cd ../ice3-toolchain
source "$HOME/.nvm/nvm.sh"
nvm use 24
npm run verify
npm pack --workspaces --dry-run
```

预期：全部测试通过；package 中没有客户或 generated LOD Asset。

- [ ] **步骤 2：审计 dependency 和 artifact**

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

- Simplification 只存在于 Toolchain。
- Tracked model file 都是已审查的 synthetic fixture。
- 不跟踪真实客户派生 coarse file。

- [ ] **步骤 3：记录 pipeline 并提交**

Document:

- CLI default。
- Coarse file layout。
- 稳定 Selection identity。
- 真实 `geometricError`。
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

## 执行建议

使用 Native execution。Identity extension、simplification adapter、workspace、
partition pipeline 和 Tileset error 共享准确的 ID 和 Geometry contract；连续实施可减少
interface drift。完成本 Plan 后再开始 Runtime Plan。

## 关联文档

- `ICE3-DOC-IDX-001` — [Documentation index](../README.md)
- `ICE3-DOC-SPEC-003` — [Hierarchical LOD specification](../specs/2026-10-27-hierarchical-lod-design.md)
