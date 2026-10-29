# 静态工业渲染批处理实施计划

> Document ID: ICE3-DOC-PLAN-011
>
> Status: Implemented
>
> Owner: ICE3 架构维护者

> **面向 Agent 工作执行者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans，逐个任务执行本计划。使用复选框（`- [ ]`）语法跟踪步骤。

**目标：** 在工具链中生成确定性的静态渲染批次，并通过 WebGL2 使用这些批次，同时保持设备选择、LOD 和 Tileset 行为不变。

**架构：** 工具链将静态节点变换烘焙到按材质划分的批次中，并输出带有紧凑语义索引的标准 GLB 几何。运行时构建仅用于查询的语义节点以及渲染批次，为每个兼容批次提交一次绘制，并将逐顶点语义索引映射回稳定选择 ID，以支持拾取和高亮。

**技术栈：** Node.js 24.22.1 LTS, TypeScript 7, ESM, npm workspaces, Node.js built-in test runner, `expect`, `tsx`, WebGL2, OGC 3D Tiles 1.1, Prepared GLB

**规范：** `../specs/2026-10-27-industrial-render-batching-design.md`

## 全局约束

- 在功能分支上开发，并仅在全量验证通过后合入 `main`。
- 使用 `.nvmrc` 指定的 Node.js 24.22.1 LTS；不得使用其他运行时进行验证。
- 不添加运行时依赖。
- 保留标准的单 JSON/单 BIN Prepared GLB 和 OGC 3D Tiles 1.1 输出。
- 不含批处理元数据的现有 Asset 必须保持当前渲染路径和字节。
- 对于相同输入、选项和工具版本，批处理构建具有确定性。
- 仅对材质、绘制模式、颜色和边缘语义均相同的静态几何进行批处理。
- 保留节点 ID、选择 ID、LOD 内容边界和 `REPLACE` 行为。
- 绝不将源模型转换或网格简化移入浏览器。
- 绝不提交受控客户 Asset、派生的 GLB、截图、报告或路径。
- 在代码、文档、测试、日志和提交消息中避免竞品名称以及被禁止的通用 3D 库品牌术语。
- 验收目标：受控工业 Asset 的可见 Draw Call 数量必须至少下降 50%。

## 审查重点

- 一个材质同时使用索引和非索引 primitive；两者必须产生相同的可见表面，且不得被错误混合。
- 一个语义节点具有多个使用不同材质的 primitive；选择仍须保持为一个设备，同时批次仍须与材质正确对应。
- 一个共享源网格出现在多个节点实例下；实例化必须保留每个节点的变换和选择 ID。
- 选中的设备跨越多个批次；每个参与范围都必须高亮，整个设备仍必须解析为同一个选择。
- 在准备替换代次时发生上下文丢失或上传失败；上一代次必须仍可使用，且不得泄漏任何 GPU 资源。

---

### 任务 1：定义并验证批处理元数据

**文件：**
- 修改：`ice3-engine/packages/assets/src/ICEPreparedGLB.ts`
- 修改：`ice3-engine/packages/assets/src/ICEGLBReader.ts`
- 修改：`ice3-engine/packages/assets/src/ICEProfileValidator.ts`
- 测试：`ice3-engine/packages/assets/tests/ICEGLBReader.test.ts`
- 测试：`ice3-engine/packages/assets/tests/ICEProfileValidator.test.ts`

**接口：**

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

- 消费：现有 Prepared GLB JSON/BIN reader。
- 产出：经过验证的不可变 `snapshot.batching`；无效元数据会抛出 `ICE3_ASSET_BATCH_INVALID`。

- [ ] **步骤 1：添加会失败的 reader 测试**

创建一个 prepared fixture，其 `asset.extras.ice3.batching` 包含一个语义 ID，
以及一个使用 `_ICE3_SEMANTIC_INDEX` 的批次 primitive。

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

- [ ] **步骤 2：运行 reader 测试并验证 RED**

运行：

```bash
cd ../ice3-engine
source ~/.nvm/nvm.sh && nvm use 24
npm test -- packages/assets/tests/ICEGLBReader.test.ts
```

预期：FAIL，因为尚不支持 `batching`。

- [ ] **步骤 3：实现严格的元数据解析**

仅接受：

- `version === '1.0'`。
- 3 个长度相等且为有限值的语义数组。
- 唯一且非空的语义 ID、节点 ID 和选择 ID。
- 唯一、非负且在范围内的 mesh 索引和 primitive 索引。
- 唯一且在范围内的材质索引。
- 绘制模式为 `4` 或 `1`。
- 非负整数三角形数量。
- 有限且有序的包围盒。
- 每个批次 primitive 都声明了 `_ICE3_SEMANTIC_INDEX` UNSIGNED_INT SCALAR 属性。

- [ ] **步骤 4：添加负向验证测试**

覆盖以下情况：语义索引越界、批次 ID 重复、语义数组长度不匹配、
版本不受支持，以及批次 primitive 缺少语义属性。

所有情况的预期错误码：`ICE3_ASSET_BATCH_INVALID`。

- [ ] **步骤 5：运行针对性测试和类型检查**

```bash
npm test -- packages/assets/tests/ICEGLBReader.test.ts packages/assets/tests/ICEProfileValidator.test.ts
npm run typecheck
```

预期：PASS。

- [ ] **步骤 6：提交**

```bash
git add packages/assets/src/ICEPreparedGLB.ts \
  packages/assets/src/ICEGLBReader.ts \
  packages/assets/src/ICEProfileValidator.ts \
  packages/assets/tests/ICEGLBReader.test.ts \
  packages/assets/tests/ICEProfileValidator.test.ts
git commit -m "feat(assets): define prepared render batches"
```

---

### 任务 2：构建确定性的工具链批次

**文件：**
- 创建：`ice3-toolchain/packages/toolchain-core/src/output/buildRenderBatches.ts`
- 修改：`ice3-toolchain/packages/toolchain-core/src/output/buildPreparedGLB.ts`
- 修改：`ice3-toolchain/packages/toolchain-core/src/index.ts`
- 测试：`ice3-toolchain/tests/output/buildPreparedGLB.test.ts`
- 测试：`ice3-toolchain/tests/output/buildRenderBatches.test.ts`

**接口：**

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

- 消费：规范化后的源节点、材质、变换和 primitive。
- 产出：不可变的世界空间批次网格、语义索引数组，以及供 GLB 打包使用的报告计数。

- [ ] **步骤 1：编写会失败的材质分组测试**

使用两个经过平移的立方体节点，它们共享一个材质，且每个设备具有超过八个源三角形。

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

- [ ] **步骤 2：运行分组测试并验证 RED**

```bash
cd ../ice3-toolchain
source ~/.nvm/nvm.sh && nvm use 24
npm test -- tests/output/buildRenderBatches.test.ts
```

预期：FAIL，因为 builder 尚不存在。

- [ ] **步骤 3：实现稳定批次键和变换烘焙**

按 `mode`、`materialIndex`、是否存在顶点颜色以及边缘材质/宽度分组。
将节点和 primitive 索引按升序排序。使用收集到的世界矩阵变换每个顶点。
追加三角形时使用 `Uint32` 索引偏移，并为每个变换后的顶点提供一个语义索引。

- [ ] **步骤 4：添加拆分和确定性测试**

验证：

- 超过任一上限的批次会以确定性方式拆分。
- 不同材质绝不共享一个批次。
- 三角形批次和线条批次绝不混合。
- 重复构建会产生完全相同的类型化数组内容和元数据。

- [ ] **步骤 5：将 builder 接入 `batchingMode: 'static' | 'off'`**

使用 `off` 时，现有输出字节保持不变。使用 `static` 时，将可绘制节点网格替换为
批次网格，在节点表中保留语义节点但不保留可绘制网格引用，并输出
`asset.extras.ice3.batching`。

- [ ] **步骤 6：运行针对性测试和类型检查**

```bash
npm test -- tests/output/buildRenderBatches.test.ts tests/output/buildPreparedGLB.test.ts
npm run typecheck
```

预期：PASS；现有冻结字节测试在 `off` 下保持不变。

- [ ] **步骤 7：提交**

```bash
git add packages/toolchain-core/src/output/buildRenderBatches.ts \
  packages/toolchain-core/src/output/buildPreparedGLB.ts \
  packages/toolchain-core/src/index.ts \
  tests/output/buildRenderBatches.test.ts \
  tests/output/buildPreparedGLB.test.ts
git commit -m "feat(toolchain): generate static render batches"
```

---

### 任务 3：公开批次生成与报告

**文件：**
- 修改：`ice3-toolchain/packages/toolchain-core/src/partition/types.ts`
- 修改：`ice3-toolchain/packages/toolchain-core/src/partition/partitionAsset.ts`
- 修改：`ice3-toolchain/packages/cli/src/commands.ts`
- 修改：`ice3-toolchain/tests/cli/commands.test.ts`
- 修改：`ice3-toolchain/README.md`

**接口：**

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

- 消费：任务 2 的批次 builder。
- 产出：`--render-batch off|static`，默认值为 `off`，并在每个 partition 结果中提供报告统计信息。

- [ ] **步骤 1：编写会失败的 CLI 测试**

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

- [ ] **步骤 2：验证 RED**

```bash
npm test -- tests/cli/commands.test.ts
```

预期：FAIL，因为该选项未知。

- [ ] **步骤 3：添加 CLI 验证和 partition 传递**

仅接受 `off|static`。无论是否启用 `--lod`，该选项都会独立应用于每个输出的
partition 和粗模 GLB。在验证选项前不得读取源 Asset。

- [ ] **步骤 4：添加报告断言**

验证批次计数具有确定性，且 `renderBatchDrawReduction` 等于：

```text
(inputPrimitives - batchCount) / max(1, inputPrimitives)
```

- [ ] **步骤 5：运行测试和类型检查**

```bash
npm test -- tests/cli/commands.test.ts tests/partition/lodGeneration.test.ts
npm run typecheck
```

预期：PASS。

- [ ] **步骤 6：提交**

```bash
git add packages/toolchain-core/src/partition/types.ts \
  packages/toolchain-core/src/partition/partitionAsset.ts \
  packages/cli/src/commands.ts \
  tests/cli/commands.test.ts \
  README.md
git commit -m "feat(cli): expose static render batching"
```

---

### 任务 4：构建仅用于查询的语义和运行时批次对象

**文件：**
- 创建：`ice3-engine/packages/runtime/src/asset/ICERenderBatch.ts`
- 修改：`ice3-engine/packages/core/src/scene/ICENode.ts`
- 修改：`ice3-engine/packages/core/src/scene/ICEMesh.ts`
- 修改：`ice3-engine/packages/runtime/src/asset/ICEAssetSceneBuilder.ts`
- 修改：`ice3-engine/packages/runtime/src/query/ICESceneQuery.ts`
- 修改：`ice3-engine/packages/runtime/src/ICE3.ts`
- 测试：`ice3-engine/packages/core/tests/NodeIdentity.test.ts`
- 测试：`ice3-engine/packages/runtime/tests/AssetSceneBuilder.test.ts`

**接口：**

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

- 消费：任务 1 的快照元数据。
- 产出：隐藏的仅查询语义节点和可见的 `ICERenderBatch` 节点；不产生重复的几何节点。

- [ ] **步骤 1：编写会失败的场景测试**

```ts
const built = buildAssetScene(batchedSnapshot);
const semantic = built.scene.findByID('node:0');
const batch = built.scene.findByID('batch:0');

expect(semantic?.typeId).toBe('ice3:Node');
expect(semantic?.selectionId).toBe('asset/node/0');
expect(batch?.typeId).toBe('ice3:RenderBatch');
expect(built.scene.findByID('semantic-render:node:0')).toBeUndefined();
```

- [ ] **步骤 2：验证 RED**

```bash
npm test -- packages/runtime/tests/AssetSceneBuilder.test.ts
```

预期：FAIL，因为语义节点没有选择身份，且批次尚不存在。

- [ ] **步骤 3：添加通用节点选择身份**

将可选的 `selectionId` 从 `ICEMeshOptions` 移到 `ICENodeOptions`。
`ICENode.selectionId` 仍为可选；`ICEMesh.selectionId` 仍为必需，并回退到
`id`。更新序列化和查询，但不改变现有输出。

- [ ] **步骤 4：构建批处理场景**

对于批处理快照：

- 根据 `snapshot.nodes` 构建语义节点。
- 语义设备节点不附带可渲染网格。
- 为每个声明的批次网格构建一个 `ICERenderBatch`。
- 将具有烘焙世界空间几何的渲染批次添加到场景根节点。
- 在构建场景前验证语义数组和索引。

- [ ] **步骤 5：运行针对性测试**

```bash
npm test -- packages/core/tests/NodeIdentity.test.ts packages/runtime/tests/AssetSceneBuilder.test.ts packages/runtime/tests/SceneQuery.test.ts
npm run typecheck
```

预期：PASS。

- [ ] **步骤 6：提交**

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

### 任务 5：通过 WebGL2 提交静态批次

**文件：**
- 创建：`ice3-engine/packages/renderer/src/WebGL2RenderBatch.ts`
- 修改：`ice3-engine/packages/renderer/src/WebGL2GeometryBatch.ts`
- 修改：`ice3-engine/packages/renderer/src/WebGL2RendererBackend.ts`
- 修改：`ice3-engine/packages/renderer/src/WebGL2GeometryCache.ts`
- 测试：`ice3-engine/packages/renderer/tests/WebGL2GeometryBatch.test.ts`
- 测试：`ice3-engine/packages/renderer/tests/BackendContract.test.ts`
- 测试：`ice3-engine/tests/e2e/m1.spec.ts`

**接口：**

```ts
interface ICERenderBatchDraw {
  readonly batch: ICERenderBatch;
  readonly worldMatrix: Float32Array;
}

function collectRenderBatches(scene: ICEScene): readonly ICERenderBatchDraw[];
```

- 消费：任务 4 中的 `ICERenderBatch`。
- 产出：每个三角形批次调用一次 `drawElements`，每个线条批次也调用一次；普通网格继续使用现有路径。

- [ ] **步骤 1：编写会失败的 renderer 批次测试**

创建一个包含 100 个普通网格且由一个批次表示的场景，并断言只收集到一个批次绘制。

```ts
const draws = collectRenderBatches(batchScene);
expect(draws).toHaveLength(1);
expect(draws[0]!.batch.selectionIds).toHaveLength(100);
```

- [ ] **步骤 2：验证 RED**

```bash
npm test -- packages/renderer/tests/WebGL2GeometryBatch.test.ts
```

预期：FAIL，因为批次收集尚不存在。

- [ ] **步骤 3：实现批次收集路径**

遍历一次可见的 `ICERenderBatch` 节点，复用帧可渲染缓冲区，并将普通
`ICEMesh` 遍历保留为回退路径。按材质键和有界 GPU 状态对三角形批次排序。

- [ ] **步骤 4：添加绘制提交计数器**

将 `renderedBatches` 添加到内部渲染器统计信息中，但不公开 GPU 对象。
`renderedMeshes` 必须继续表示普通网格。Draw Call 计数包含两者。

- [ ] **步骤 5：运行 renderer 测试和浏览器测试**

```bash
npm test -- packages/renderer/tests/WebGL2GeometryBatch.test.ts packages/renderer/tests/BackendContract.test.ts
npx playwright test tests/e2e/m1.spec.ts --project=chromium --project=webkit
npm run typecheck
```

预期：PASS，且批处理示例在两个浏览器中均能正确绘制。

- [ ] **步骤 6：提交**

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

### 任务 6：保留拾取和选择高亮

**文件：**
- 修改：`ice3-engine/packages/renderer/src/WebGL2Program.ts`
- 修改：`ice3-engine/packages/renderer/src/WebGL2Picker.ts`
- 修改：`ice3-engine/packages/renderer/src/WebGL2GeometryCache.ts`
- 修改：`ice3-engine/packages/renderer/src/WebGL2RendererBackend.ts`
- 修改：`ice3-engine/packages/runtime/src/ICE3.ts`
- 测试：`ice3-engine/packages/runtime/tests/Projection.test.ts`
- 测试：`ice3-engine/tests/e2e/m1.spec.ts`

**接口：**

```ts
function semanticSelectionId(
  batch: ICERenderBatch,
  semanticIndex: number,
): string | undefined;
```

- 消费：逐顶点语义索引和批次语义表。
- 产出：现有 `selectionId` 命名空间中的拾取结果，以及按批次着色选中顶点。

- [ ] **步骤 1：编写会失败的语义映射测试**

```ts
expect(semanticSelectionId(batch, 0)).toBe('asset/node/0');
expect(semanticSelectionId(batch, 1)).toBe('asset/node/1');
expect(semanticSelectionId(batch, 2)).toBeUndefined();
```

- [ ] **步骤 2：验证 RED**

```bash
npm test -- packages/runtime/tests/Projection.test.ts
```

预期：FAIL，因为批次拾取映射尚不可用。

- [ ] **步骤 3：实现 GPU 拾取**

将 `uint` 语义索引渲染到现有拾取附件中。读取整数结果，并通过当前活动批次代次
进行映射。业务名称或选择字符串不得进入 GPU 缓冲区。

- [ ] **步骤 4：实现选择高亮**

选择变化时，上传一个小的按批次选择掩码纹理。片段着色器使用当前顶点的语义索引
决定是否着色。跨越多个批次的选择会高亮所有参与范围。

- [ ] **步骤 5：测试跨 LOD 的选择**

使用现有的粗模到精细模型浏览器流程：

1. 选择一个批处理设备。
2. 确认只有一个选择 ID，且可见黄色像素。
3. 触发完整的 LOD 替换。
4. 确认相同的选择 ID 和高亮设备仍然存在。

- [ ] **步骤 6：运行测试**

```bash
npm test -- packages/runtime/tests/Projection.test.ts
npx playwright test tests/e2e/m1.spec.ts --project=chromium --project=webkit
npm run verify
```

预期：全部通过。

- [ ] **步骤 7：提交**

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

### 任务 7：添加批次拾取和实例化兼容性

**文件：**
- 创建：`ice3-engine/packages/renderer/src/WebGL2InstanceBatch.ts`
- 修改：`ice3-engine/packages/renderer/src/WebGL2RendererBackend.ts`
- 修改：`ice3-engine/packages/runtime/src/asset/ICEAssetSceneBuilder.ts`
- 测试：`ice3-engine/packages/renderer/tests/WebGL2InstanceBatch.test.ts`
- 测试：`ice3-engine/packages/runtime/tests/AssetSceneBuilder.test.ts`

**接口：**

```ts
interface ICEInstanceBatch {
  readonly geometry: ICEIndexedGeometry;
  readonly material: ICEBasicMaterial;
  readonly instanceMatrices: Float32Array;
  readonly semanticIds: readonly string[];
}
```

- 消费：共享的 `ICEPreparedGeometry` 身份和节点变换。
- 产出：对重复几何调用一次 `drawElementsInstanced`，同时每个实例映射到自己的设备选择。

- [ ] **步骤 1：编写会失败的共享几何测试**

构建四个节点，它们使用同一个几何和四个不同矩阵。断言只有一个实例批次，
且包含四个矩阵和四个语义 ID。

- [ ] **步骤 2：验证 RED**

```bash
npm test -- packages/renderer/tests/WebGL2InstanceBatch.test.ts
```

预期：FAIL，因为实例批次尚不存在。

- [ ] **步骤 3：实现实例缓冲区**

只存储一次几何。为 4x4 矩阵和语义索引添加实例 VAO 属性。
使用 `vertexAttribDivisor(1)` 和一次索引实例化绘制。

- [ ] **步骤 4：添加回退**

如果几何只有一个实例，则使用普通批次路径。如果实例缓冲区创建失败，
则为每个实例发出一次批次绘制，并报告 `ICE3_RENDER_INSTANCING_FALLBACK`。

- [ ] **步骤 5：运行测试和类型检查**

```bash
npm test -- packages/renderer/tests/WebGL2InstanceBatch.test.ts packages/runtime/tests/AssetSceneBuilder.test.ts
npm run typecheck
```

预期：PASS。

- [ ] **步骤 6：提交**

```bash
git add packages/renderer/src/WebGL2InstanceBatch.ts \
  packages/renderer/src/WebGL2RendererBackend.ts \
  packages/runtime/src/asset/ICEAssetSceneBuilder.ts \
  packages/renderer/tests/WebGL2InstanceBatch.test.ts \
  packages/runtime/tests/AssetSceneBuilder.test.ts
git commit -m "feat(renderer): instance repeated industrial geometry"
```

---

### 任务 8：验证真实 Asset 的绘制数量降低并最终确定静态批处理

**文件：**
- 修改：`ice3-doc/docs/contracts/asset-preparation-contract-v1.md`
- 修改：`ice3-doc/docs/specs/2026-10-27-industrial-render-batching-design.md`
- 修改：`ice3-engine/README.md`
- 修改：`ice3-toolchain/README.md`

**接口：**

- 消费：任务 1-7。
- 产出：实测静态批处理结果、兼容性 contract 以及明确的默认模式裁定。

- [ ] **步骤 1：运行所有比较前测试套件**

```bash
cd ../ice3-toolchain
source ~/.nvm/nvm.sh && nvm use 24
npm run verify

cd ../ice3-engine
npm run verify
```

预期：零失败。

- [ ] **步骤 2：在 Git 之外生成 `off` 和 `static` 输出**

使用相同的受控 Asset、`asset-id`、partition、LOD、三角形、字节和批处理参数。
绝不记录 Asset 文件名或路径。

- [ ] **步骤 3：比较可测量门禁**

记录：

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

要求可见 Draw Call 至少下降 50%、选择 ID 保持不变，并且页面错误和失败请求均为零。

- [ ] **步骤 4：验证所有 GLB 和隐私**

```bash
git status --porcelain=v1
git ls-files '*.glb' '*.gltf' '*.bin'
git grep -I -n 'CONTROLLED_ASSET_NAME' -- . ':!package-lock.json' || true
```

预期：生成的 Asset 保留在 Git 之外，且受跟踪内容中不出现受控名称。

- [ ] **步骤 5：更新共享 contract 和实测规范**

记录：

- 可选批处理元数据。
- 仅适用于静态几何的批处理边界。
- 语义拾取保证。
- 实例化和回退行为。
- 报告字段。
- 兼容性和默认模式。
- 不含客户名称或路径的真实 Asset 前后测量。

- [ ] **步骤 6：最终验证和提交**

```bash
npm run verify
npm pack --workspaces --dry-run --json
git add docs
git commit -m "docs: record static render batching"
```

## 相关文档

- `ICE3-DOC-IDX-001` — [文档索引](../README.md)
- `ICE3-DOC-SPEC-004` — [工业渲染批处理规范](../specs/2026-10-27-industrial-render-batching-design.md)
