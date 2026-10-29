# ICE3 空间 Tileset Pipeline 实施计划

> Document ID: ICE3-DOC-PLAN-010
>
> Status: Implemented
>
> Owner: ICE3 架构维护者

> **供代理执行者使用：** 必须使用子技能 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans，按任务逐步实施本计划。使用复选框（`- [ ]`）语法跟踪步骤。

**目标：** 构建一个基于标准的工具链 pipeline，将大型工业模型划分为可独立加载的 GLBs 和 3D Tiles 1.1 tileset，然后在 public ICE3 runtime 中增量加载这些 partitions，并在现有浏览器示例中验证结果。

**架构：** 工具链将 mesh nodes 作为原子语义单元进行分析，按 world-space bounds 递归划分它们，为每个 leaf 输出一个 Prepared GLB，并写入显式的 3D Tiles 1.1 tree。一个最小的 public Tileset runtime loader 会验证支持的标准子集，以有界并发调度 partition 下载，并原子提交每个已完成的 scene fragment。

**技术栈：** TypeScript 7、Node.js 24.22.1 LTS、npm workspaces、Node.js test runner、Playwright、Webpack、glTF 2.0、OGC 3D Tiles 1.1、Ajv 及官方 3D Tiles JSON Schema bundle。

**规范：** `../specs/2026-10-27-spatial-tileset-pipeline-design.md`

## 全局约束

- 使用各仓库 `.nvmrc` 指定的 Node.js 24.22.1 LTS。
- 在功能分支上开发；仅在完整仓库验证通过后合入 `main`。
- 每项行为变更都遵循 RED-GREEN-REFACTOR，并在聚焦测试通过后提交。
- 不得在代码、标识符、注释、文档、测试、截图、fixtures、diagnostics 或提交消息中使用竞品、厂商或第三方产品名称。
- 不得在产品 artifacts 中使用通用渲染库品牌词，也不得使用其大小写、截断或拼接变体。
- 不得暂存、提交、打包、记录日志、截图或以其他方式暴露真实客户模型或其派生的 GLB、report、thumbnail 或 preview。
- 测试和已提交的 demo assets 必须是 synthetic 或明确可分发的材料。
- 分发索引为 OGC 3D Tiles 1.1；tile content 是 ICE3 Prepared GLB Profile v1 中的 glTF 2.0。
- 默认 partition 限制为每个 leaf 500,000 个三角形和 33,554,432 bytes。
- Version 1 仅支持显式 children、局部 Cartesian `box` 或 `sphere`、外部 Prepared GLB content、有限 4x4 transforms 和 `REPLACE` refinement。
- Version 1 不拆分单个 mesh，不生成 LOD，也不支持 `region`、external tilesets、implicit tiling、textures、animation 或动态卸载。
- partition 命令启动前，`--output` 必须不存在。
- Partition 输出通过一次原子目录 rename 发布；构建失败时不得留下最终目录。
- 未经单独的设计决策，不得添加 runtime 依赖；test-only 依赖必须在提交中声明并说明理由。
- 除非命令以 `git -C` 开头，否则应从任务文件路径所指定的仓库根目录运行。

## 审查重点

- 被多个 nodes 引用的 mesh 必须保留在同一个原子组中，否则其几何体可能重复，或其设备标识可能变得不明确。
- 如果边界在所选分割轴上的中心相同或范围为零，必须以确定性方式终止，不得无限递归。
- partition 构建或 report 写入失败时，必须不留下所请求的输出路径，并且不得暴露仅部分可用的 Tileset。
- `content.uri` 若为绝对路径、穿越 Tileset 目录之外或指向不受支持的内容，必须在任何 fetch 发生之前被拒绝。
- 当某些 tiles 已加载后其中一个 tile 失败时，已完成 partitions 必须保持可交互，失败计数必须可见，并且 disposal 必须清理每个已完成 fragment。

---

### 执行设置

- [ ] 创建 `feature/spatial-tileset-pipeline` 于 `ice3-toolchain` 和
  `ice3-engine` 中；本计划文档已位于 `ice3-doc` 的该分支上。

```bash
git -C ../ice3-toolchain \
  switch -c feature/spatial-tileset-pipeline
git -C ../ice3-engine \
  switch -c feature/spatial-tileset-pipeline
```

- [ ] 确认所有仓库的起始状态干净：

```bash
git -C ../ice3-doc status --short
git -C ../ice3-toolchain status --short
git -C ../ice3-engine status --short
```

预期：提交本计划后，没有已跟踪或未跟踪且未被忽略的文件。

### 任务 1：Contract 和确定性 Partition Analyzer

**文件：**
- 修改：`ice3-doc/docs/contracts/asset-preparation-contract-v1.md`
- 创建：`ice3-toolchain/packages/toolchain-core/src/partition/types.ts`
- 创建：`ice3-toolchain/packages/toolchain-core/src/partition/analyzePartitionUnits.ts`
- 创建：`ice3-toolchain/tests/partition/createPartitionSource.ts`
- 创建：`ice3-toolchain/tests/fixtures/writePartitionGLTF.mjs`
- 创建：`ice3-toolchain/tests/partition/analyzePartitionUnits.test.ts`
- 修改：`ice3-toolchain/packages/toolchain-core/src/index.ts`

**接口：**
- 消费：`ICESourceDocument`、`readAccessor`、`bakeLocalMatrix`、`ICEMatrix4Tuple`。
- 产生：

```ts
export interface ICEBounds {
  readonly min: readonly [number, number, number];
  readonly max: readonly [number, number, number];
}

export interface ICEPartitionUnit {
  readonly nodeIndices: readonly number[];
  readonly meshIndices: readonly number[];
  readonly bounds: ICEBounds;
  readonly triangleCount: number;
}

export interface ICEPartitionAnalysis {
  readonly bounds: ICEBounds;
  readonly triangleCount: number;
  readonly units: readonly ICEPartitionUnit[];
}

export function analyzePartitionUnits(
  source: ICESourceDocument,
): ICEPartitionAnalysis;
```

- [ ] **步骤 1：添加跨仓库 Contract 文本**

向权威 asset contract 追加一节，定义：

```markdown
## 18. Tileset distribution and partition diagnostics

- Distribution index: OGC 3D Tiles 1.1 `tileset.json`.
- Contents: ICE3 Prepared GLB Profile v1 files.
- Supported v1 subset: explicit `children`, local Cartesian `box` or `sphere`,
  relative `content.uri`, finite 4x4 `transform`, and `REPLACE` refinement.
- Unsupported v1 features: `region`, external tilesets, `implicitTiling`,
  non-Prepared GLB contents, and undeclared required extensions.
- Partition output is published atomically as a directory.
- ICE3-owned tile metadata lives under standard `extras.ice3`.
- Tool diagnostics are `ICE3_TOOL_PARTITION_OPTIONS_INVALID`,
  `ICE3_TOOL_PARTITION_EMPTY`, `ICE3_TOOL_PARTITION_UNSPLITTABLE`,
  `ICE3_TOOL_PARTITION_OUTPUT_EXISTS`,
  `ICE3_TOOL_TILESET_INVALID`, and `ICE3_TOOL_TILESET_WRITE_FAILED`.
- Runtime diagnostics are `ICE3_TILESET_INVALID`, `ICE3_TILESET_UNSUPPORTED`,
  `ICE3_TILESET_TILE_FAILED`, `ICE3_TILESET_DUPLICATE_ID`, and
  `ICE3_TILESET_ABORTED`.
```

仅提交这项权威 contract 更新：

```bash
git -C ../ice3-doc \
  add docs/contracts/asset-preparation-contract-v1.md
git -C ../ice3-doc \
  commit -m "docs: define tileset distribution contract"
```

- [ ] **步骤 2：创建 Synthetic 源辅助函数**

该辅助函数必须返回一个 3D 文档，其中包含四个独立的三角形
meshes，以及沿 x 轴平移的 nodes：

```ts
import type { ICESourceDocument } from '../../packages/toolchain-core/src/index.js';

export function createPartitionSource(
  sharedMesh = false,
): ICESourceDocument {
  const positions = new Float32Array([
    0, 0, 0,
    1, 0, 0,
    0, 1, 0,
  ]);
  const indices = new Uint16Array([0, 1, 2]);
  const binary = new Uint8Array(42);
  binary.set(new Uint8Array(positions.buffer), 0);
  binary.set(new Uint8Array(indices.buffer), 36);
  const nodeCount = 4;

  return {
    baseDirectory: '.',
    buffers: [binary],
    json: {
      asset: { version: '2.0' },
      scene: 0,
      scenes: [{ nodes: [0, 1, 2, 3] }],
      nodes: Array.from({ length: nodeCount }, (_, index) => ({
        name: `equipment-${index}`,
        mesh: sharedMesh ? 0 : index,
        translation: [index * 10, 0, 0],
      })),
      meshes: Array.from(
        { length: sharedMesh ? 1 : nodeCount },
        () => ({
          primitives: [{
            attributes: { POSITION: 0 },
            indices: 1,
            material: 0,
            mode: 4,
          }],
        }),
      ),
      materials: [{
        name: 'steel',
        pbrMetallicRoughness: {
          baseColorFactor: [0.2, 0.5, 0.9, 1],
        },
      }],
      buffers: [{ byteLength: 42 }],
      bufferViews: [
        { buffer: 0, byteOffset: 0, byteLength: 36 },
        { buffer: 0, byteOffset: 36, byteLength: 6 },
      ],
      accessors: [
        {
          bufferView: 0,
          componentType: 5126,
          count: 3,
          type: 'VEC3',
          min: [0, 0, 0],
          max: [1, 1, 0],
        },
        {
          bufferView: 1,
          componentType: 5123,
          count: 3,
          type: 'SCALAR',
        },
      ],
    },
  };
}
```

使用以下内容创建独立的 fixture writer：

```js
import { writeFileSync } from 'node:fs';

const positions = new Float32Array([
  0, 0, 0,
  1, 0, 0,
  0, 1, 0,
]);
const indices = new Uint16Array([0, 1, 2]);
const binary = Buffer.alloc(42);
Buffer.from(positions.buffer).copy(binary, 0);
Buffer.from(indices.buffer).copy(binary, 36);
const document = {
  asset: { version: '2.0' },
  scene: 0,
  scenes: [{ nodes: [0, 1, 2, 3] }],
  nodes: [0, 1, 2, 3].map((index) => ({
    name: `equipment-${index}`,
    mesh: index,
    translation: [index * 10, 0, 0],
  })),
  meshes: [0, 1, 2, 3].map(() => ({
    primitives: [{
      attributes: { POSITION: 0 },
      indices: 1,
      material: 0,
      mode: 4,
    }],
  })),
  materials: [{
    name: 'steel',
    pbrMetallicRoughness: { baseColorFactor: [0.2, 0.5, 0.9, 1] },
  }],
  buffers: [{
    byteLength: 42,
    uri: `data:application/octet-stream;base64,${
      binary.toString('base64')
    }`,
  }],
  bufferViews: [
    { buffer: 0, byteOffset: 0, byteLength: 36 },
    { buffer: 0, byteOffset: 36, byteLength: 6 },
  ],
  accessors: [
    {
      bufferView: 0,
      componentType: 5126,
      count: 3,
      type: 'VEC3',
      min: [0, 0, 0],
      max: [1, 1, 0],
    },
    {
      bufferView: 1,
      componentType: 5123,
      count: 3,
      type: 'SCALAR',
    },
  ],
};
if (!process.argv[2]) throw new Error('output path is required');
writeFileSync(process.argv[2], JSON.stringify(document, null, 2));
```

- [ ] **步骤 3：编写失败的 Analyzer 测试**

创建 `analyzePartitionUnits.test.ts`：

```ts
import { test } from 'node:test';
import { expect } from 'expect';
import { analyzePartitionUnits } from '../../packages/toolchain-core/src/partition/analyzePartitionUnits.js';
import { createPartitionSource } from './createPartitionSource.js';

test('creates one spatial unit per mesh node and computes world bounds', () => {
  const analysis = analyzePartitionUnits(createPartitionSource());

  expect(analysis.units).toHaveLength(4);
  expect(analysis.triangleCount).toBe(4);
  expect(analysis.units.map((unit) => unit.nodeIndices)).toEqual([
    [0], [1], [2], [3],
  ]);
  expect(analysis.units[2]!.bounds.min).toEqual([20, 0, 0]);
  expect(analysis.units[2]!.bounds.max).toEqual([21, 1, 0]);
  expect(analysis.bounds).toEqual({
    min: [0, 0, 0],
    max: [31, 1, 0],
  });
});

test('keeps all nodes sharing one mesh in one atomic unit', () => {
  const analysis = analyzePartitionUnits(createPartitionSource(true));

  expect(analysis.units).toHaveLength(1);
  expect(analysis.units[0]!.nodeIndices).toEqual([0, 1, 2, 3]);
  expect(analysis.units[0]!.meshIndices).toEqual([0]);
  expect(analysis.units[0]!.bounds).toEqual({
    min: [0, 0, 0],
    max: [31, 1, 0],
  });
});
```

- [ ] **步骤 4：运行 Analyzer 测试并确认 RED**

运行：

```bash
nvm use
npm test -- tests/partition/analyzePartitionUnits.test.ts
```

预期：FAIL，因为 `analyzePartitionUnits.ts` 尚不存在。

- [ ] **步骤 5：实现 World Matrices、Bounds 和原子分组**

在 `analyzePartitionUnits.ts` 中：

1. 遍历 active scene roots 并构建 `worldMatrices: ICEMatrix4Tuple[]`。
2. 对每个 local node matrix 使用 `bakeLocalMatrix`。
3. 按 glTF column-major 顺序将 parent 和 local matrices 相乘。
4. 构建 `meshToNodes: Map<number, number[]>`。
5. 对每个被引用的源 mesh，读取三角形 primitive accessors，并根据 `accessor.count` 计算三角形数量。
6. 变换每个 `POSITION` accessor bounds 的全部八个角。
7. 对引用该 mesh 的每个 node 的变换后 bounds 求并集。
8. 按数值对 unit 的 node 和 mesh index 数组排序。
9. 按首个 node index 对 units 排序。
10. 当 active scene 没有 mesh nodes 时，抛出 `ICE3_TOOL_PARTITION_EMPTY`。

从 `packages/toolchain-core/src/index.ts` 导出该模块。

- [ ] **步骤 6：运行聚焦测试和工具链单元测试套件**

```bash
npm test -- tests/partition/analyzePartitionUnits.test.ts
npm test
```

预期：聚焦测试通过，现有 107 项测试保持通过。

- [ ] **步骤 7：提交**

```bash
git add packages/toolchain-core/src/partition \
  packages/toolchain-core/src/index.ts \
  tests/partition tests/fixtures/writePartitionGLTF.mjs
git commit -m "feat(toolchain): analyze spatial partition units"
```

---

### 任务 2：确定性最长轴 Partition Planner

**文件：**
- 创建：`ice3-toolchain/packages/toolchain-core/src/partition/createPartitionPlan.ts`
- 创建：`ice3-toolchain/tests/partition/createPartitionPlan.test.ts`
- 修改：`ice3-toolchain/packages/toolchain-core/src/partition/types.ts`
- 修改：`ice3-toolchain/packages/toolchain-core/src/index.ts`

**接口：**
- 消费：`ICEPartitionUnit[]` 和正数 `maxTriangles` 预算。
- 产生：

```ts
export interface ICEPartitionPlanNode {
  readonly bounds: ICEBounds;
  readonly triangleCount: number;
  readonly units: readonly ICEPartitionUnit[];
  readonly children: readonly ICEPartitionPlanNode[];
}

export function createPartitionPlan(
  units: readonly ICEPartitionUnit[],
  maxTriangles: number,
): ICEPartitionPlanNode;
```

- [ ] **步骤 1：编写失败的 Planner 测试**

```ts
import { test } from 'node:test';
import { expect } from 'expect';
import { analyzePartitionUnits } from '../../packages/toolchain-core/src/partition/analyzePartitionUnits.js';
import { createPartitionPlan } from '../../packages/toolchain-core/src/partition/createPartitionPlan.js';
import { createPartitionSource } from './createPartitionSource.js';

const leaves = (node: ReturnType<typeof createPartitionPlan>) =>
  node.children.length === 0
    ? [node]
    : node.children.flatMap(leaves);

test('splits along the longest axis without exceeding the triangle budget', () => {
  const analysis = analyzePartitionUnits(createPartitionSource());
  const plan = createPartitionPlan(analysis.units, 3);

  expect(plan.triangleCount).toBe(4);
  expect(leaves(plan).map((leaf) => leaf.units.length)).toEqual([2, 2]);
  expect(leaves(plan).map((leaf) => leaf.triangleCount)).toEqual([2, 2]);
});

test('produces the same tree when input order changes', () => {
  const analysis = analyzePartitionUnits(createPartitionSource());
  const first = createPartitionPlan(analysis.units, 2);
  const second = createPartitionPlan([...analysis.units].reverse(), 2);

  expect(JSON.stringify(second)).toBe(JSON.stringify(first));
});

test('stops at one indivisible unit when centers coincide', () => {
  const source = createPartitionSource();
  const analysis = analyzePartitionUnits(source);
  const coincident = analysis.units.map((unit) => ({
    ...unit,
    bounds: { min: [0, 0, 0] as const, max: [0, 0, 0] as const },
  }));
  const plan = createPartitionPlan(coincident, 1);

  expect(leaves(plan)).toHaveLength(4);
  expect(leaves(plan).every((leaf) => leaf.units.length === 1)).toBe(true);
});
```

- [ ] **步骤 2：运行测试并确认 RED**

```bash
npm test -- tests/partition/createPartitionPlan.test.ts
```

预期：FAIL，因为 `createPartitionPlan.ts` 尚不存在。

- [ ] **步骤 3：实现递归 Planner**

实现：

1. 拒绝非正数或非有限的 `maxTriangles`，并使用 `ICE3_TOOL_PARTITION_OPTIONS_INVALID`。
2. 对空 unit 列表抛出 `ICE3_TOOL_PARTITION_EMPTY`。
3. 计算并集 bounds 和三角形总数。
4. 当三角形数量在预算内或仅剩一个 unit 时，返回 leaf。
5. 选择中心范围最长的轴；若并列，则依次选择 x、y、z。
6. 按该轴上的中心排序，再按首个 node index 排序。
7. 选择累计三角形数量至少为总数一半的第一个 split，并限制在 `1..length - 1`。
8. 对两个分组递归。
9. 在 leaves 上存储空 `children`，在 groups 上存储完整输入 units。

- [ ] **步骤 4：验证 GREEN**

```bash
npm test -- tests/partition/createPartitionPlan.test.ts
npm test
```

预期：全部通过。

- [ ] **步骤 5：提交**

```bash
git add packages/toolchain-core/src/partition \
  packages/toolchain-core/src/index.ts \
  tests/partition/createPartitionPlan.test.ts
git commit -m "feat(toolchain): plan deterministic spatial partitions"
```

---

### 任务 3：构建独立的 Prepared GLB Fragments

**文件：**
- 创建：`ice3-toolchain/packages/toolchain-core/src/scene/nodeMatrices.ts`
- 修改：`ice3-toolchain/packages/toolchain-core/src/output/buildPreparedGLB.ts`
- 创建：`ice3-toolchain/tests/output/buildPreparedGLBFragment.test.ts`
- 修改：`ice3-toolchain/packages/toolchain-core/src/index.ts`

**接口：**
- 消费：

```ts
export interface ICEBuildSelection {
  readonly nodeIndices: readonly number[];
  readonly flattenWorldTransforms: boolean;
}
```

- 将 `readonly selection?: ICEBuildSelection` 添加到 `ICEBuildOptions`。
- 产生一个有效的 `ICEPreparedGLB`，其 node IDs 仍使用源 node index：
  `${assetId}/node/${sourceNodeIndex}`.

- [ ] **步骤 1：编写失败的 Fragment 测试**

```ts
import { test } from 'node:test';
import { expect } from 'expect';
import { buildPreparedGLB } from '../../packages/toolchain-core/src/output/buildPreparedGLB.js';
import { validatePreparedGLB } from '../../packages/toolchain-core/src/output/validatePreparedGLB.js';
import { createPartitionSource } from '../partition/createPartitionSource.js';

const readJson = (bytes: Uint8Array): Record<string, unknown> => {
  const buffer = Buffer.from(bytes);
  const jsonLength = buffer.readUInt32LE(12);
  return JSON.parse(
    buffer.subarray(20, 20 + jsonLength).toString('utf8').replace(/ +$/g, ''),
  ) as Record<string, unknown>;
};

test('builds one selected node with a baked world transform and stable ID', () => {
  const built = buildPreparedGLB(createPartitionSource(), {
    assetId: 'partition-demo',
    selection: {
      nodeIndices: [2],
      flattenWorldTransforms: true,
    },
  });
  const json = readJson(built.bytes);
  const nodes = json.nodes as Array<Record<string, unknown>>;
  const extras = nodes[0]!.extras as { ice3: { id: string } };

  expect(validatePreparedGLB(built.bytes).errors).toEqual([]);
  expect(built.stats.nodeCount).toBe(1);
  expect(built.stats.triangleCount).toBe(1);
  expect(extras.ice3.id).toBe('partition-demo/node/2');
  expect(nodes[0]!.matrix).toEqual([
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    20, 0, 0, 1,
  ]);
  expect(json.scenes).toEqual([{ nodes: [0] }]);
});
```

- [ ] **步骤 2：运行 RED**

```bash
npm test -- tests/output/buildPreparedGLBFragment.test.ts
```

预期：TypeScript/测试失败，因为 `ICEBuildOptions.selection` 不存在，
且所有源 nodes 仍会被输出。

- [ ] **步骤 3：提取共享 Node-Matrix 辅助函数**

使用以下内容创建 `nodeMatrices.ts`：

```ts
export function multiplyMatrices(
  parent: ICEMatrix4Tuple,
  local: ICEMatrix4Tuple,
): ICEMatrix4Tuple;

export function collectNodeWorldMatrices(
  source: ICESourceDocument,
): readonly ICEMatrix4Tuple[];

export function transformBounds(
  bounds: ICEBounds,
  matrix: ICEMatrix4Tuple,
): ICEBounds;
```

实现与引擎数学约定一致的 column-major 乘法，并
变换全部八个 AABB corners。将等价的私有辅助函数移出
`buildPreparedGLB.ts`。

- [ ] **步骤 4：实现过滤后的 Fragment 打包**

在 `buildPreparedGLB.ts` 中：

1. 验证并去重选定的 node indices。
2. 如果未提供 selection，则保留当前全部行为。
3. 如果提供了 selection，则仅包含这些 nodes。
4. 当 `flattenWorldTransforms` 为 true 时，将每个选定 node 作为 scene root
   输出，并使用其收集的 world matrix，且不包含 `children`。
5. 跳过没有选定 owner 的 meshes。
6. 在写入 nodes 之前，将源 mesh indices 重映射为打包后的 mesh indices。
7. 保留基于原始源 node index 的 `extras.ice3.id`。
8. 根据选定的 mesh instances 计算 bounds。
9. 对于 flattened selections，将 `maxNodeDepth` 计算为 `0`。
10. 保留所有现有的未选定构建行为和 snapshots。

- [ ] **步骤 5：验证 GREEN**

```bash
npm test -- tests/output/buildPreparedGLBFragment.test.ts
npm test
```

预期：所有测试通过。

- [ ] **步骤 6：提交**

```bash
git add packages/toolchain-core/src/scene/nodeMatrices.ts \
  packages/toolchain-core/src/output/buildPreparedGLB.ts \
  packages/toolchain-core/src/index.ts \
  tests/output/buildPreparedGLBFragment.test.ts
git commit -m "feat(toolchain): build prepared GLB fragments"
```

---

### 任务 4：写入并验证 3D Tiles 1.1 Tree

**文件：**
- 创建：`ice3-toolchain/packages/toolchain-core/src/partition/tileset.ts`
- 创建：`ice3-toolchain/tests/partition/tileset.test.ts`
- 使用官方 OGC 3D Tiles 1.1 JSON Schema bundle 创建
  `ice3-toolchain/tests/fixtures/3d-tiles-1.1-schema/`
- 修改：`ice3-toolchain/package.json`
- 修改：`ice3-toolchain/packages/toolchain-core/src/index.ts`

**接口：**
- 消费：partition bounds 和已完成的 part descriptors。
- 产生：

```ts
export interface ICEFinishedTile {
  readonly bounds: ICEBounds;
  readonly contentUri: string;
  readonly partitionId: string;
  readonly children: readonly ICEFinishedTile[];
}

export interface ICETilesetDocument {
  readonly asset: {
    readonly version: '1.1';
    readonly extras: {
      readonly ice3: {
        readonly assetId: string;
        readonly contractVersion: '1.0';
      };
    };
  };
  readonly geometricError: number;
  readonly root: Readonly<Record<string, unknown>>;
}

export function createTilesetDocument(
  assetId: string,
  root: ICEFinishedTile,
): ICETilesetDocument;
```

- [ ] **步骤 1：添加 Test-Only Schema Validation 依赖**

运行：

```bash
npm install --save-dev ajv@8.20.0 ajv-formats@3.0.1
```

将官方规范 `https://docs.ogc.org/cs/22-025r4/22-025r4.html` 中的完整
JSON Schema Annex B 提取到
`tests/fixtures/3d-tiles-1.1-schema/`。在 `SOURCE.md` 中保留 OGC 来源声明和
规范修订版本。不得添加带厂商品牌的 validator
软件包。

- [ ] **步骤 2：编写失败的 Tree 测试**

```ts
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { test } from 'node:test';
import { expect } from 'expect';
import {
  createTilesetDocument,
  type ICEFinishedTile,
} from '../../packages/toolchain-core/src/partition/tileset.js';

const leaf: ICEFinishedTile = {
  bounds: { min: [0, 0, 0], max: [2, 1, 4] },
  contentUri: 'parts/part-000.glb',
  partitionId: 'part-000',
  children: [],
};

const schemaDirectory = 'tests/fixtures/3d-tiles-1.1-schema';

test('writes standard local Cartesian tile boxes and 0 leaf error', () => {
  const document = createTilesetDocument('factory', leaf);

  expect(document.asset.version).toBe('1.1');
  expect(document.root).toMatchObject({
    geometricError: 0,
    refine: 'REPLACE',
    boundingVolume: {
      box: [1, -2, 0.5, 1, 0, 0, 0, 2, 0, 0, 0, 0.5],
    },
    content: { uri: 'parts/part-000.glb' },
  });
});

test('writes a parent culling box that contains both child boxes', () => {
  const group: ICEFinishedTile = {
    bounds: { min: [0, 0, 0], max: [4, 2, 2] },
    contentUri: '',
    partitionId: 'group-root',
    children: [
      leaf,
      {
        bounds: { min: [2, 0, 0], max: [4, 2, 2] },
        contentUri: 'parts/part-001.glb',
        partitionId: 'part-001',
        children: [],
      },
    ],
  };
  const document = createTilesetDocument('factory', group);
  const root = document.root as {
    boundingVolume: { box: number[] };
    geometricError: number;
    children: Array<{ content: { uri: string } }>;
  };

  expect(root.boundingVolume.box).toEqual([
    2, -1, 1,
    2, 0, 0,
    0, 1, 0,
    0, 0, 1,
  ]);
  expect(root.geometricError).toBeCloseTo(Math.hypot(4, 2, 2));
  expect(root.children.map((child) => child.content.uri)).toEqual([
    'parts/part-000.glb',
    'parts/part-001.glb',
  ]);
});

test('validates against the official OGC schema bundle', () => {
  const ajv = new Ajv2020({ strict: false, allErrors: true });
  addFormats(ajv);
  for (const file of readdirSync(schemaDirectory, { recursive: true })) {
    if (String(file).endsWith('.json')) {
      ajv.addSchema(JSON.parse(
        readFileSync(join(schemaDirectory, String(file)), 'utf8'),
      ));
    }
  }
  const tilesetSchema = JSON.parse(
    readFileSync(join(schemaDirectory, 'tileset.schema.json'), 'utf8'),
  );
  const validate = ajv.compile(tilesetSchema);
  const document = createTilesetDocument('factory', leaf);

  expect(validate(document), JSON.stringify(validate.errors)).toBe(true);
});
```

- [ ] **步骤 3：运行 RED**

```bash
npm test -- tests/partition/tileset.test.ts
```

预期：FAIL，因为 writer 尚不存在。

- [ ] **步骤 4：实现标准 Serializer**

实现：

1. 将每个 y-up AABB 转换为 3D Tiles z-up oriented box：
   center `[cx, -cz, cy]`、axes `[hx,0,0, 0,0,hy, 0,hz,0]`。
2. Group bounds 使用 child bounds 的并集。
3. 内部 `geometricError` 为以米为单位的 box diagonal。
4. Leaf `geometricError` 为 `0`。
5. 每个 tile 都有 `refine: "REPLACE"`。
6. Content 使用 orchestrator 提供的精确相对 URI。
7. 添加 `extras.ice3`，包含逻辑 asset ID 和 partition ID。
8. 使用确定性的 object 属性插入顺序。
9. 使用 `ICE3_TOOL_TILESET_INVALID` 拒绝非有限 bounds。

- [ ] **步骤 5：验证 GREEN 并提交**

```bash
npm test -- tests/partition/tileset.test.ts
npm test
git add package.json package-lock.json \
  packages/toolchain-core/src/partition/tileset.ts \
  packages/toolchain-core/src/index.ts \
  tests/partition/tileset.test.ts \
  tests/fixtures/3d-tiles-1.1-schema
git commit -m "feat(toolchain): emit standard 3D Tiles trees"
```

---

### 任务 5：编排 Partition 构建和字节限制

**文件：**
- 创建：`ice3-toolchain/packages/toolchain-core/src/partition/partitionAsset.ts`
- 创建：`ice3-toolchain/tests/partition/partitionAsset.test.ts`
- 修改：`ice3-toolchain/packages/toolchain-core/src/partition/types.ts`
- 修改：`ice3-toolchain/packages/toolchain-core/src/index.ts`

**接口：**
- 消费：`readSource`、`analyzePartitionUnits`、`createPartitionPlan`、
  `buildPreparedGLB`、`createTilesetDocument`。
- 产生：

```ts
export interface ICEPartitionOptions {
  readonly assetId: string;
  readonly maxTriangles?: number;
  readonly maxBytes?: number;
  readonly creaseAngleDegrees?: number;
  readonly edges?: boolean;
  readonly budget?: ICEBudgetProfile;
}

export interface ICEPartitionFile {
  readonly path: string;
  readonly bytes: Uint8Array;
}

export interface ICEPartitionResult {
  readonly files: readonly ICEPartitionFile[];
  readonly tileset: ICETilesetDocument;
  readonly partitionCount: number;
  readonly stats: {
    readonly triangleCount: number;
    readonly nodeCount: number;
    readonly maxPartBytes: number;
  };
}

export function partitionAsset(
  source: ICESourceDocument,
  options: ICEPartitionOptions,
): ICEPartitionResult;
```

- [ ] **步骤 1：编写失败的编排测试**

```ts
import { test } from 'node:test';
import { expect } from 'expect';
import { partitionAsset } from '../../packages/toolchain-core/src/partition/partitionAsset.js';
import { validatePreparedGLB } from '../../packages/toolchain-core/src/output/validatePreparedGLB.js';
import { createPartitionSource } from './createPartitionSource.js';

test('writes independent GLBs and a tileset that conserve source triangles', () => {
  const result = partitionAsset(createPartitionSource(), {
    assetId: 'partition-demo',
    maxTriangles: 1,
  });
  const glbs = result.files.filter((file) => file.path.endsWith('.glb'));

  expect(result.partitionCount).toBe(4);
  expect(glbs).toHaveLength(4);
  expect(result.stats.triangleCount).toBe(4);
  expect(glbs.every((file) => validatePreparedGLB(file.bytes).errors.length === 0))
    .toBe(true);
});

test('reports an indivisible node that exceeds the byte limit', () => {
  expect(() => partitionAsset(createPartitionSource(), {
    assetId: 'partition-demo',
    maxBytes: 1,
  })).toThrow(/ICE3_TOOL_PARTITION_UNSPLITTABLE/);
});

test('does not split nodes that share one mesh', () => {
  const result = partitionAsset(createPartitionSource(true), {
    assetId: 'partition-demo',
    maxTriangles: 1,
  });

  expect(result.partitionCount).toBe(1);
  expect(result.stats.triangleCount).toBe(1);
});

test('produces byte-identical files and Tileset for identical inputs', () => {
  const source = createPartitionSource();
  const first = partitionAsset(source, {
    assetId: 'partition-demo',
    maxTriangles: 2,
  });
  const second = partitionAsset(source, {
    assetId: 'partition-demo',
    maxTriangles: 2,
  });

  expect(second.files.map((file) => [file.path, [...file.bytes]])).toEqual(
    first.files.map((file) => [file.path, [...file.bytes]]),
  );
  expect(second.tileset).toEqual(first.tileset);
});
```

- [ ] **步骤 2：运行 RED**

```bash
npm test -- tests/partition/partitionAsset.test.ts
```

预期：FAIL，因为 `partitionAsset.ts` 尚不存在。

- [ ] **步骤 3：实现确定性递归组装**

实现：

1. 验证正数有限默认值：`500_000` 个三角形和 `33_554_432` bytes。
2. 读取 active-scene analysis 并创建 triangle plan。
3. 递归构建每个 plan node。
4. 对于 leaf，使用该 unit 的 node indices 和 flattened
   world transforms 调用 `buildPreparedGLB`。
5. 如果实际 GLB bytes 超过 `maxBytes`，且该 leaf 有多个原子 units，
   则沿最长轴拆分该 leaf 一次，并递归构建两个 children。
6. 如果单 unit leaf 超过 `maxBytes`，则抛出
   `ICE3_TOOL_PARTITION_UNSPLITTABLE`。
7. 拒绝任何现有 ICE3 budget status 为 `error` 的 shard。
8. 按 depth-first 顺序将 leaf paths 分配为 `parts/part-000.glb`。
9. 使用相同的 leaf 顺序和 bounds 构建标准 Tileset tree。
10. 返回之前验证三角形数量、原始 mesh node IDs、路径唯一性和
    最大 bytes 数量。
11. 确保重复调用时的结果顺序和 bytes 相同。

- [ ] **步骤 4：验证 GREEN**

```bash
npm test -- tests/partition/partitionAsset.test.ts
npm test
```

预期：全部通过，包括现有的 single-GLB 测试。

- [ ] **步骤 5：提交**

```bash
git add packages/toolchain-core/src/partition \
  packages/toolchain-core/src/index.ts \
  tests/partition/partitionAsset.test.ts
git commit -m "feat(toolchain): partition assets into tiled GLBs"
```

---

### 任务 6：添加原子 Partition CLI

**文件：**
- 修改：`ice3-toolchain/packages/cli/src/commands.ts`
- 修改：`ice3-toolchain/tests/cli/commands.test.ts`
- 修改：`ice3-toolchain/README.md`

**接口：**
- 消费：`partitionAsset(source, options)`。
- 产生 CLI 命令：

```text
ice3-tool partition <source> --output <directory> --asset-id <id>
  [--max-triangles <n>] [--max-bytes <n>]
  [--skip-edges] [--budget <profile-or-file>]
  [--warnings-as-errors] [--json]
```

- [ ] **步骤 1：编写失败的 CLI 测试**

追加测试：

```ts
test('partition writes tileset and numbered GLBs without partial output', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'ice3-partition-'));
  directories.push(directory);
  const source = join(directory, 'source.gltf');
  writePartitionGLTF(source);
  const output = join(directory, 'dist');

  const code = await runCli([
    'partition',
    source,
    '--output',
    output,
    '--asset-id',
    'demo',
    '--max-triangles',
    '1',
  ]);

  expect(code).toBe(0);
  expect(existsSync(join(output, 'tileset.json'))).toBe(true);
  expect(readdirSync(join(output, 'parts'))).toHaveLength(4);
});

test('partition rejects an existing output directory', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const directory = mkdtempSync(join(tmpdir(), 'ice3-partition-'));
  directories.push(directory);
  const source = join(directory, 'source.gltf');
  writePartitionGLTF(source);
  const output = join(directory, 'dist');
  mkdirSync(output);

  expect(await runCli([
    'partition',
    source,
    '--output',
    output,
    '--asset-id',
    'demo',
  ])).toBe(1);
  expect(readdirSync(output)).toEqual([]);
});
```

将 `writePartitionGLTF` 添加到测试文件，并通过为
`createPartitionSource().json` 的 buffer 使用 base64 data URI 进行序列化：

```ts
const writePartitionGLTF = (path: string): void => {
  const document = createPartitionSource();
  writeFileSync(path, JSON.stringify({
    ...document.json,
    buffers: [{
      byteLength: 42,
      uri: `data:application/octet-stream;base64,${
        Buffer.from(document.buffers[0]!).toString('base64')
      }`,
    }],
  }));
};
```

- [ ] **步骤 2：运行 RED**

```bash
npm test -- tests/cli/commands.test.ts -t partition
```

预期：FAIL，因为 `partition` 是未知命令，且其选项未被
解析。

- [ ] **步骤 3：实现 CLI 解析和原子发布**

实现：

1. 将 `partition` 添加到 command dispatcher。
2. 将 `--max-triangles` 和 `--max-bytes` 添加到 valued options。
3. 要求提供 `--output`、`--asset-id` 和一个源 positional。
4. 拒绝未知 flags。
5. 在读取源之前验证正数有限预算。
6. 从同一个 parent 解析输出路径和同级临时路径。
7. 在构建之前拒绝已存在的输出路径。
8. 创建临时 `parts/` 目录。
9. 写入 part files 和 `tileset.json`。
10. 在 rename 之前验证所有生成的 GLBs 和 Tileset。
11. 仅在成功时将临时目录 rename 为所请求的输出。
12. 发生任何失败时，仅递归删除生成的临时目录。
13. 打印包含 output path、partition count 和 stats 的确定性 JSON。
14. 保持现有 `build`、`inspect` 和 `validate` 行为不变。

将上述命令格式准确修正为：

```bash
ice3-tool partition <source> --output <directory> --asset-id <id>
```

- [ ] **步骤 4：执行成功和失败场景**

```bash
npm test -- tests/cli/commands.test.ts
npm run verify
```

预期：所有测试通过，并且在 rejection
测试之后没有临时目录残留。

- [ ] **步骤 5：提交**

```bash
git add packages/cli/src/commands.ts tests/cli/commands.test.ts README.md
git commit -m "feat(cli): add atomic partition command"
```

---

### 任务 7：解析支持的 3D Tiles 子集

**文件：**
- 创建：`ice3-engine/packages/assets/src/ICETileset.ts`
- 创建：`ice3-engine/packages/assets/src/ICETilesetReader.ts`
- 创建：`ice3-engine/packages/assets/tests/TilesetReader.test.ts`
- 修改：`ice3-engine/packages/assets/src/index.ts`

**接口：**
- 消费：已获取的 `tileset.json` 文本及其 base URL。
- 产生：

```ts
export interface ICETilesetTile {
  readonly id: string;
  readonly bounds: ICEGeometryBounds;
  readonly contentUri?: string;
  readonly children: readonly ICETilesetTile[];
  readonly geometricError: number;
  readonly transform?: readonly number[];
}

export interface ICETilesetSnapshot {
  readonly assetId: string;
  readonly bounds: ICEGeometryBounds;
  readonly tiles: readonly ICETilesetTile[];
}

export function readTileset(
  text: string,
  baseUrl: string,
): ICETilesetSnapshot;
```

`bounds` 在 `ICETilesetSnapshot` 中由标准 z-up boxes 或
spheres 转换为引擎的 y-up bounds。

- [ ] **步骤 1：编写失败的 Parser 测试**

```ts
import { test } from 'node:test';
import { expect } from 'expect';
import { readTileset } from '../src/ICETilesetReader';

const tileset = (contentUri = 'parts/part-000.glb') => JSON.stringify({
  asset: {
    version: '1.1',
    extras: { ice3: { assetId: 'factory', contractVersion: '1.0' } },
  },
  geometricError: 10,
  root: {
    boundingVolume: { box: [1, -2, 0.5, 1, 0, 0, 0, 2, 0, 0, 0, 0.5] },
    geometricError: 0,
    refine: 'REPLACE',
    content: { uri: contentUri },
    extras: { ice3: { assetId: 'factory' } },
  },
});

test('parses a local Cartesian leaf and resolves a relative content URL', () => {
  const snapshot = readTileset(tileset(), 'https://example.test/scene/tileset.json');

  expect(snapshot.assetId).toBe('factory');
  expect(snapshot.bounds).toEqual({
    min: [0, 0, 0],
    max: [2, 4, 1],
  });
  expect(snapshot.tiles[0]!.contentUri).toBe(
    'https://example.test/scene/parts/part-000.glb',
  );
});

test('rejects unsupported and escaping content references', () => {
  expect(() => readTileset(tileset('../part.glb'), 'https://x.test/a/tileset.json'))
    .toThrow(/ICE3_TILESET_UNSUPPORTED/);
  expect(() => readTileset(tileset('part.json'), 'https://x.test/a/tileset.json'))
    .toThrow(/ICE3_TILESET_UNSUPPORTED/);
});

test('rejects region and implicit tiling before fetching tile content', () => {
  const withRegion = JSON.parse(tileset());
  withRegion.root.boundingVolume = { region: [0, 0, 0, 0, 0, 0] };
  expect(() => readTileset(JSON.stringify(withRegion), 'https://x.test/'))
    .toThrow(/ICE3_TILESET_UNSUPPORTED/);

  const withImplicit = JSON.parse(tileset());
  withImplicit.root.implicitTiling = { subdivisionScheme: 'QUADTREE' };
  expect(() => readTileset(JSON.stringify(withImplicit), 'https://x.test/'))
    .toThrow(/ICE3_TILESET_UNSUPPORTED/);
});
```

- [ ] **步骤 2：运行 RED**

```bash
nvm use
npm test -- packages/assets/tests/TilesetReader.test.ts
```

预期：FAIL，因为 `ICETilesetReader.ts` 尚不存在。

- [ ] **步骤 3：实现 Parser 和子集验证**

实现：

1. 解析 JSON，并要求根节点为 object。
2. 要求 `asset.version === '1.1'`。
3. 递归验证显式 `children`。
4. 要求每个 tile 恰好有一个受支持的 bounding volume：`box` 长度为 12，或
   `sphere` 长度为 4。
5. 要求 `geometricError` 为非负有限值。
6. 要求根 `refine` 或继承的显式 parent 值；仅支持 `REPLACE`。
7. 接受长度为 16 的有限 `transform` arrays。
8. 解析 `content.uri`，使用 `new URL(uri, baseUrl)`。
9. 拒绝 URL 解析失败、path traversal、绝对路径技巧、非 GLB
   suffixes、`.json` external tilesets、`region`、`implicitTiling`、不受支持的
   required extensions，以及缺失 ICE3 asset ID 的情况。
10. 将 z-up AABBs 转换为 y-up bounds：
    `(x, y, z)` → `(x, -z, y)`.
11. 对于 spheres，转换 center 但保留 radius。
12. 对根据确定性 DFS paths 形成的 tile IDs 去重。

- [ ] **步骤 4：验证 GREEN 并提交**

```bash
npm test -- packages/assets/tests/TilesetReader.test.ts
npm test
git add packages/assets/src packages/assets/tests/TilesetReader.test.ts
git commit -m "feat(assets): parse supported 3D Tiles"
```

---

### 任务 8：使用 Public Runtime API 增量加载 Tiles

**文件：**
- 创建：`ice3-engine/packages/runtime/src/asset/ICETilesetLoader.ts`
- 创建：`ice3-engine/packages/runtime/tests/TilesetLoader.test.ts`
- 修改：`ice3-engine/packages/runtime/src/index.ts`
- 修改：`ice3-engine/packages/ice3/src/index.ts`
- 修改：`ice3-engine/examples/m1/global.d.ts`

**接口：**
- 消费：`readTileset`、`ICEAssetLoader`、`ICE3`、`ICEPerspectiveCamera`。
- 产生：

```ts
export type ICETilesetTileState =
  | 'pending'
  | 'loading'
  | 'loaded'
  | 'failed';

export interface ICETilesetStats {
  readonly total: number;
  readonly pending: number;
  readonly loading: number;
  readonly loaded: number;
  readonly failed: number;
}

export class ICETilesetHandle extends ICEEventDispatcher {
  readonly scene: ICEScene;
  readonly bounds: ICEGeometryBounds;
  get stats(): ICETilesetStats;
  tileState(tileId: string): ICETilesetTileState | undefined;
  whenReady(): Promise<void>;
  whenComplete(): Promise<void>;
  dispose(): void;
}

export class ICETilesetLoader {
  constructor(
    engine: ICE3,
    options?: {
      readonly fetch?: typeof globalThis.fetch;
      readonly camera?: ICEPerspectiveCamera;
      readonly maxConcurrentTiles?: number;
    },
  );
  open(
    url: string,
    options?: { readonly signal?: AbortSignal },
  ): Promise<ICETilesetHandle>;
}
```

Handle 会发出 `TILESET_TILE_LOADING`、`TILESET_TILE_LOADED`、
`TILESET_TILE_FAILED`、`TILESET_READY` 和 `TILESET_COMPLETE`。每个 event
parameter 都包含一个不可变的 `ICETilesetStats` snapshot，并在相关时
包含 tile ID。

- [ ] **步骤 1：创建冻结的 Synthetic Tileset Fixture**

任务 6 通过后，使用以下命令生成 synthetic source file 和 Tileset：

```bash
node tests/fixtures/writePartitionGLTF.mjs \
  ../ice3-engine/tests/fixtures/partition-source.gltf
node packages/cli/dist/main.js partition ../ice3-engine/tests/fixtures/partition-source.gltf \
  --output ../ice3-engine/tests/fixtures/spatial-demo \
  --asset-id spatial-demo \
  --max-triangles 1
```

不得复制任何本地或客户 asset。在 engine repository 中提交源文件和
四部分 Synthetic Tileset。

- [ ] **步骤 2：编写失败的 Runtime 测试**

```ts
import { it } from 'node:test';
import { expect } from 'expect';
import * as mockApi from 'jest-mock';
import {
  ICE3,
  ICEPerspectiveCamera,
} from '../src/index';
import { ICETilesetLoader } from '../src/asset/ICETilesetLoader';
import { FakeRendererBackend } from '@ice3/renderer';
import { readFileSync } from 'node:fs';

const fixture = (path: string) => readFileSync(
  `tests/fixtures/spatial-demo/${path}`,
);

it('opens before all tiles finish and commits completed tiles progressively', async () => {
  const engine = new ICE3({ backend: new FakeRendererBackend() });
  const camera = new ICEPerspectiveCamera({
    id: 'camera',
    position: [0, 2, 8],
    target: [0, 0, 0],
  });
  const fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith('tileset.json')) {
      return new Response(fixture('tileset.json'));
    }
    const name = url.split('/').at(-1)!;
    if (name !== 'part-000.glb') {
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    return new Response(fixture(name));
  });
  const loader = new ICETilesetLoader(engine, { fetch, camera });
  const tileset = await loader.open('https://example.test/spatial-demo/tileset.json');

  expect(tileset.stats.loaded).toBe(0);
  await tileset.whenReady();
  expect(tileset.stats.loaded).toBe(1);
  expect(tileset.stats.loaded).toBeLessThan(tileset.stats.total);
  await tileset.whenComplete();
  expect(tileset.stats.loaded).toBe(tileset.stats.total);
  expect(tileset.scene.children.length).toBeGreaterThan(0);
  tileset.dispose();
  expect(tileset.scene.children).toHaveLength(0);
});

it('keeps successful tiles after one tile fails', async () => {
  const engine = new ICE3({ backend: new FakeRendererBackend() });
  const fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith('tileset.json')) {
      return new Response(fixture('tileset.json'));
    }
    if (url.endsWith('part-001.glb')) {
      return new Response('broken', { status: 500 });
    }
    return new Response(fixture(url.split('/').at(-1)!));
  });
  const tileset = await new ICETilesetLoader(engine, { fetch })
    .open('https://example.test/spatial-demo/tileset.json');

  await tileset.whenComplete();
  expect(tileset.stats.loaded).toBe(3);
  expect(tileset.stats.failed).toBe(1);
  expect(tileset.scene.children.length).toBeGreaterThan(0);
});

it('rejects duplicate node IDs from a later tile without removing earlier tiles', async () => {
  const engine = new ICE3({ backend: new FakeRendererBackend() });
  const fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith('tileset.json')) {
      return new Response(fixture('tileset.json'));
    }
    const name = url.endsWith('part-001.glb')
      ? 'part-000.glb'
      : url.split('/').at(-1)!;
    return new Response(fixture(name));
  });
  const tileset = await new ICETilesetLoader(engine, { fetch })
    .open('https://example.test/spatial-demo/tileset.json');

  await tileset.whenComplete();
  expect(tileset.stats.loaded).toBe(3);
  expect(tileset.stats.failed).toBe(1);
  expect(tileset.scene.children.length).toBeGreaterThan(0);
});

it('starts no more than two tile requests before a response settles', async () => {
  const engine = new ICE3({ backend: new FakeRendererBackend() });
  let inFlight = 0;
  let maximumInFlight = 0;
  const fetch = vi.fn((
    input: RequestInfo | URL,
    init?: RequestInit,
  ) => new Promise<Response>((resolve, reject) => {
    const url = String(input);
    if (url.endsWith('tileset.json')) {
      resolve(new Response(fixture('tileset.json')));
      return;
    }
    inFlight += 1;
    maximumInFlight = Math.max(maximumInFlight, inFlight);
    init?.signal?.addEventListener('abort', () => {
      inFlight -= 1;
      reject(new DOMException('Aborted', 'AbortError'));
    });
  }));
  const tileset = await new ICETilesetLoader(engine, { fetch })
    .open('https://example.test/spatial-demo/tileset.json');

  await Promise.resolve();
  expect(inFlight).toBe(2);
  expect(maximumInFlight).toBe(2);
  tileset.dispose();
  await Promise.resolve();
  expect(inFlight).toBe(0);
});

it('aborts pending work and disposes its scene idempotently', async () => {
  const engine = new ICE3({ backend: new FakeRendererBackend() });
  const fetch = vi.fn((
    input: RequestInfo | URL,
    init?: RequestInit,
  ) => new Promise<Response>((resolve, reject) => {
    const url = String(input);
    if (url.endsWith('tileset.json')) {
      resolve(new Response(fixture('tileset.json')));
      return;
    }
    init?.signal?.addEventListener('abort', () => {
      reject(new DOMException('Aborted', 'AbortError'));
    });
  }));
  const tileset = await new ICETilesetLoader(engine, { fetch })
    .open('https://example.test/spatial-demo/tileset.json');

  tileset.dispose();
  tileset.dispose();
  expect(tileset.scene.children).toHaveLength(0);
  expect(tileset.stats.loading).toBe(0);
});
```

- [ ] **步骤 3：运行 RED**

```bash
npm test -- packages/runtime/tests/TilesetLoader.test.ts
```

预期：FAIL，因为 `ICETilesetLoader` 尚不存在。

- [ ] **步骤 4：实现 Handle、Scheduler 和 Scene 合并**

实现：

1. 在返回 handle 之前 fetch 并解析 Tileset。
2. 创建统一 `ICEScene`，其 ID 为 `${assetId}:scene`。
3. 按 bounds center 到 camera target 的距离对 content tiles 排序；如果没有 camera，
   则保持 Tileset DFS 顺序。
4. 默认最多启动两个 tile loads。
5. 使用一个由 handle 拥有、并结合 caller signal 的 `AbortController`。
6. 使用 `ICEAssetLoader` 加载每个 tile。
7. 合并之前，通过现有 `addChild` duplicate check，针对统一 scene
   验证所有 child IDs。
8. 组合继承的标准 z-up tile transforms，并将结果共轭到
   引擎的 y-up frame；生成的 pipeline 通常使用 identity。
9. 使用转换后的 matrix 将每个已加载 partition 包装在一个 tile root 下，
   然后将该 root 移入统一 scene。
10. 移动 children 后，dispose 此时为空的 partition scene。
11. 每次成功合并后请求 render，并发出 `TILESET_TILE_LOADED`。
12. 发生 per-tile error 时，发出 `TILESET_TILE_FAILED` 并报告
    `ICE3_TILESET_TILE_FAILED`；不得移除成功的 tiles。
13. 在首次成功合并时 resolve `whenReady`。
14. 在所有排队 tiles 完成处理后 resolve `whenComplete`。
15. 在 `dispose` 中清除 event listeners、中止 in-flight requests，并仅 dispose 统一
    scene 一次；reject 未完成的 `whenReady`，其错误为
    `ICE3_TILESET_ABORTED`，并在 active loads 停止后 settle `whenComplete`。
16. 通过一个返回新 immutable snapshot 的 getter 公开 state counts。

- [ ] **步骤 5：验证 GREEN**

```bash
npm test -- packages/runtime/tests/TilesetLoader.test.ts
npm test
```

预期：全部通过。

- [ ] **步骤 6：通过 Public Entry Point 导出**

在 `packages/runtime/src/index.ts` 中添加 exports，并从
`packages/ice3/src/index.ts` 重新导出：

```ts
export {
  ICETilesetLoader,
  ICETilesetHandle,
  type ICETilesetStats,
  type ICETilesetTileState,
} from './asset/ICETilesetLoader.js';
```

更新 `examples/m1/global.d.ts`，使 `tilesetStats()` 返回
`ICETilesetStats`。

- [ ] **步骤 7：提交**

```bash
git add packages/assets/src packages/runtime/src packages/ice3/src \
  packages/runtime/tests/TilesetLoader.test.ts \
  tests/fixtures/spatial-demo tests/fixtures/partition-source.gltf \
  examples/m1/global.d.ts
git commit -m "feat(runtime): load tiled assets incrementally"
```

---

### 任务 9：将现有示例切换为增量 Tileset 加载

**文件：**
- 修改：`ice3-engine/examples/m1/main.ts`
- 修改：`ice3-engine/examples/m1/index.html`
- 修改：`ice3-engine/examples/m1/styles.css`
- 修改：`ice3-engine/tests/e2e/m1.spec.ts`
- 创建：`ice3-engine/examples/m1/assets/partitioned/tileset.json`
- 创建：`ice3-engine/examples/m1/assets/partitioned/parts/*.glb`

**接口：**
- 消费：`ICETilesetLoader.open`、`ICETilesetHandle.stats`、
  `whenReady`、`whenComplete`。
- 产生一个使用来自 `ice3` 的 public package import 的示例。

- [ ] **步骤 1：生成并提交 Synthetic Demo Tileset**

对 synthetic source 运行 partition CLI，并将验证通过的输出复制到
`examples/m1/assets/partitioned/`。该命令必须使用：

```bash
--asset-id partition-demo --max-triangles 1
```

示例 Tileset 必须包含至少四个 part files。不得使用客户
asset。

- [ ] **步骤 2：编写失败的 E2E 增量测试**

```ts
test('shows completed partitions before all tile requests finish', async ({ page }) => {
  await page.route('**/assets/partitioned/parts/part-*.glb', async (route) => {
    const name = route.request().url().split('/').at(-1)!;
    await new Promise((resolve) => setTimeout(
      resolve,
      name === 'part-000.glb' ? 0 : 500,
    ));
    await route.continue();
  });
  await page.goto('http://127.0.0.1:8104/');

  const progress = page.locator('[data-role="tileset-progress"]');
  await expect(progress).toContainText(/分区 [1-3]\/4/);
  await expect(page.locator('[data-role="stage"]')).toHaveAttribute(
    'aria-busy',
    'false',
  );
  await expect(progress).toHaveText('分区 4/4');
  await expect(page.locator('[data-role="status"]')).toHaveText('资产已加载');
});
```

- [ ] **步骤 3：运行 RED**

```bash
source "$HOME/.nvm/nvm.sh"
nvm use
npm run test:e2e -- --project=chromium -g "shows completed partitions"
```

预期：FAIL，因为示例仍加载一个 GLB，且没有
`tileset-progress` 元素。

- [ ] **步骤 4：更新示例**

实现：

1. 将 `ICEAssetLoader` 替换为 `ICETilesetLoader`。
2. 打开 `/assets/partitioned/tileset.json`。
3. 在 tile 完成之前获取 `handle.bounds` 用于 camera fitting。
4. 立即设置空的 unified scene。
5. 添加带 `data-role="tileset-progress"` 的紧凑 toolbar indicator。
6. 加载期间显示 `分区 loaded/total`。
7. 首个 tile 提交后隐藏 full-stage loading overlay。
8. 仅在所有 tiles 成功完成后，将状态更新为 `资产已加载`。
9. 发生部分失败时，保留 scene 并显示
    `部分分区加载失败（failed/total）`。
10. 将 selection lookup 重新绑定到 `tileset.scene`。
11. 幂等地 dispose Tileset handle。
12. 保持黑色背景、flat lighting、原始颜色、edge lines、camera
    keys、mouse controls、selection highlight 和 info panel。
13. 为测试公开 `window.__ice3M1.tilesetStats()`。

- [ ] **步骤 5：运行聚焦 Chromium 测试**

```bash
npm run test:e2e -- --project=chromium -g "partitions|selects one equipment"
```

预期：增量测试和选择测试通过。

- [ ] **步骤 6：提交**

```bash
git add examples/m1 tests/e2e/m1.spec.ts packages/ice3/src packages/runtime/src \
  packages/runtime/tests packages/assets/src packages/assets/tests
git commit -m "feat(example): demonstrate incremental tiled loading"
```

---

### 任务 10：完成文档、完整验证和受控 Asset Smoke Test

**文件：**
- 修改：`ice3-toolchain/README.md`
- 修改：`ice3-engine/README.md`
- 修改：`ice3-engine/docs/api/m1.md`
- 修改：`ice3-doc/docs/contracts/asset-preparation-contract-v1.md`
- 如果实现需要额外测试或 exports，则修改：
  `ice3-toolchain/packages/toolchain-core/src/index.ts`,
  `ice3-engine/packages/runtime/src/index.ts`,
  `ice3-engine/packages/ice3/src/index.ts`

**接口：**
- 消费所有先前任务。
- 产生面向用户的 command/API 文档，以及完整跨仓库 pipeline 可工作的证据。

- [ ] **步骤 1：记录准确用法**

添加以下工具链示例：

```bash
node packages/cli/dist/main.js partition \
  tests/fixtures/partition-source.gltf \
  --output /tmp/partition-result \
  --asset-id partition-demo \
  --max-triangles 500000 \
  --max-bytes 33554432
```

添加以下 runtime 示例：

```ts
const tileset = await new ICETilesetLoader(engine, { camera }).open(
  '/assets/partitioned/tileset.json',
);
engine.setScene(tileset.scene).setCamera(camera).start();
await tileset.whenReady();
```

记录支持的 3D Tiles 子集、non-goals、progress events，以及首个版本
不卸载或合成 LOD 这一事实。

- [ ] **步骤 2：运行所有仓库验证门禁**

```bash
cd ../ice3-toolchain
nvm use
npm run verify

cd ../ice3-engine
nvm use
npm run verify
npm pack --workspaces --dry-run
```

预期：

- toolchain architecture、typecheck、unit tests、schema tests 通过；
- engine architecture、typecheck、unit tests、Chromium 和 WebKit E2E 通过；
- package dry-runs 不包含客户 assets。

如果任一命令失败，则修复失败的测试或实现，并重新运行
整个失败的仓库门禁。

- [ ] **步骤 3：在 Git 之外运行一次受控 Large-Asset Smoke Test**

```bash
mkdir -p /tmp/ice3-controlled-smoke
test -n "$ICE3_CONTROLLED_ASSET"
node packages/cli/dist/main.js partition \
  "$ICE3_CONTROLLED_ASSET" \
  --output /tmp/ice3-controlled-smoke/output \
  --asset-id controlled-smoke \
  --max-triangles 500000 \
  --max-bytes 33554432 \
  --json \
  > /tmp/ice3-controlled-smoke/result.json
```

仅展示聚合值作为证据：

```bash
node -e '
const r = require("/tmp/ice3-controlled-smoke/result.json");
console.log(JSON.stringify({
  command: r.command,
  partitionCount: r.partitionCount,
  triangleCount: r.stats?.triangleCount,
  maxPartBytes: r.stats?.maxPartBytes,
  errors: r.errors,
}));
'
```

不得打印 node names、source names、directory listings、screenshots 或
geometry。

- [ ] **步骤 4：审计并移除受控输出**

```bash
rm -rf /tmp/ice3-controlled-smoke
git status --short --ignored
git ls-files | rg -i '\.(glb|gltf|bin)$'
```

预期：最后一条命令仅列出已审查的 synthetic fixtures 和明确
可分发的 test assets。不得残留已跟踪或暂存的客户 asset 或派生内容。
`rm -rf` 仅作用于 `/tmp/ice3-controlled-smoke`。

- [ ] **步骤 5：清理后运行最终完整门禁**

```bash
cd ../ice3-toolchain
npm run verify

cd ../ice3-engine
npm run verify
npm pack --workspaces --dry-run
```

预期：两者都退出 `0`。

- [ ] **步骤 6：提交文档和最终调整**

```bash
git -C ../ice3-doc add \
  docs/contracts/asset-preparation-contract-v1.md
git -C ../ice3-doc commit \
  -m "docs: finalize tiled asset contract"

git -C ../ice3-toolchain add README.md
git -C ../ice3-toolchain commit \
  -m "docs: document tiled asset tooling"

git -C ../ice3-engine add \
  README.md docs/api/m1.md
git -C ../ice3-engine commit \
  -m "docs: document incremental tileset loading"
```

- [ ] **步骤 7：合并每个已验证的功能分支**

在每个仓库中确认 `git status --short --branch` 显示干净后：

```bash
git switch main
git merge --no-ff feature/spatial-tileset-pipeline \
  -m "merge: spatial tileset pipeline"
git branch -d feature/spatial-tileset-pipeline
```

在合并后的分支上再次运行该仓库的 `npm run verify`。如果验证未通过，
不得删除分支或声称完成。

## 执行建议

本计划更适合采用 native execution 作为默认方式。Toolchain output
schema、engine parser、runtime fixture 和 browser demonstration 共享精确的
field names 和 dependency ordering；在同一连续会话中保留这些接口决策
可减少跨仓库不一致。完整验证门禁仍提供独立的最终检查。

## 相关文档

- `ICE3-DOC-IDX-001` — [文档索引](../README.md)
- `ICE3-DOC-SPEC-007` — [空间 Tileset Pipeline 规范](../specs/2026-10-27-spatial-tileset-pipeline-design.md)
