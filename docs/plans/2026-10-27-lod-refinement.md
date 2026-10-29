# ICE3 LOD 精炼实施计划

> Document ID: ICE3-DOC-PLAN-007
>
> Status: Implemented
>
> Owner: ICE3 架构维护者

> **面向 Agent 工作执行者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans，逐个任务执行本计划。使用复选框（`- [ ]`）语法跟踪步骤。

**目标：** 使用标准 Tileset 多内容把粗模控制在分片和总体预算内，并恢复非阻塞预取与经过实测的 SSE 默认值。

**架构：** 工具链继续从单一规范化几何流水线生成粗模，但把内部 Tile 的粗模拆成稳定设备分片；运行时把所有分片组合成一个逻辑 Tile。预取使用独立低优先级集合，不参与当前切面的 ready/idle 判定。

**技术栈：** TypeScript 7, Node.js 24.22.1 LTS, Node.js test runner, Playwright, OGC 3D Tiles 1.1, ICE3 core/assets/runtime/toolchain

**规范：** `../specs/2026-10-27-lod-refinement-and-scene-api-design.md`

## 全局约束

- 使用 `.nvmrc` 指定的 Node.js 24.22.1 LTS。
- 在 `feature/lod-refinement` 分支开发；仅当完整验证门禁通过后才可合入 `main`。
- 每项行为变更都遵循 RED-GREEN-REFACTOR。
- 不添加浏览器运行时依赖。
- 粗模总字节数必须低于精细模型总字节数。
- 校准目标是粗模三角形数量不超过精细模型三角形数量的 25%；若未达标，须报告。
- 默认粗模分片上限为 32 MiB。
- 绝不拆分单个设备单元。
- 使用标准 OGC 3D Tiles 1.1 `contents`，绝不使用私有清单。
- 预取不得阻塞当前可见切面的 `whenIdle()`。
- 不得将客户 Asset 或其派生物放入 Git、测试、截图、日志或软件包。

## 审查重点

- 包含多个分片的逻辑 Tile 只能在所有必需分片成功后才提交。
- 单个超大设备必须保持完整并予以报告，不得被静默丢弃。
- 分片顺序和输出字节必须具有确定性。
- 预取失败不得改变当前可见就绪状态或全局失败状态。
- 分片加载期间相机发生变化时，必须释放过期暂存分片和缓存。

---

### 任务 1：解析单内容与多内容 Tile

**文件：**
- 修改：`ice3-engine/packages/assets/src/ICETileset.ts`
- 修改：`ice3-engine/packages/assets/src/ICETilesetReader.ts`
- 修改：`ice3-engine/packages/assets/tests/TilesetReader.test.ts`
- 修改：`ice3-toolchain/packages/toolchain-core/src/partition/tileset.ts`
- 修改：`ice3-toolchain/tests/partition/tileset.test.ts`

**接口：**

```ts
interface ICETilesetTile {
  readonly contentUris: readonly string[];
  readonly contentUri?: string;
}

interface ICEFinishedTile {
  readonly contentUris: readonly string[];
  readonly contentUri?: string;
}
```

- 单个 `content.uri` 规范化为一个 `contentUris` 条目，并保留
  `contentUri`。
- 多个 `contents` 生成有序的 `contentUris`，并省略 `contentUri`。
- 空数组、重复 URI、同时提供两个字段、绝对 URI 或越界 URI，
  以及非相对资源都会被拒绝。

- [ ] **步骤 1：编写会失败的 reader 和 writer 测试**

```ts
test('normalizes multiple tile contents in stable order', () => {
  const value = JSON.parse(tileset());
  delete value.root.content;
  value.root.contents = [
    { uri: 'coarse/root/part-001.glb' },
    { uri: 'coarse/root/part-000.glb' },
  ];

  const snapshot = readTileset(
    JSON.stringify(value),
    'https://example.test/scene/tileset.json',
  );

  expect(snapshot.root.contentUris).toEqual([
    'https://example.test/scene/coarse/root/part-001.glb',
    'https://example.test/scene/coarse/root/part-000.glb',
  ]);
  expect(snapshot.root.contentUri).toBeUndefined();
});

test('rejects content and contents on the same tile', () => {
  const value = JSON.parse(tileset());
  value.root.contents = [{ uri: 'coarse/root/part-000.glb' }];

  expect(() => readTileset(
    JSON.stringify(value),
    'https://example.test/scene/tileset.json',
  )).toThrow(/ICE3_TILESET_CONTENTS_INVALID/);
});
```

工具链测试：

```ts
test('writes standard contents for a chunked tile', () => {
  const document = createTilesetDocument('factory', {
    bounds: { min: [0, 0, 0], max: [4, 2, 2] },
    contentUris: [
      'coarse/group-root/part-000.glb',
      'coarse/group-root/part-001.glb',
    ],
    partitionId: 'group-root',
    geometricError: 3,
    children: [],
  });

  expect(document.root).toMatchObject({
    contents: [
      { uri: 'coarse/group-root/part-000.glb' },
      { uri: 'coarse/group-root/part-001.glb' },
    ],
  });
});
```

- [ ] **步骤 2：运行 RED**

```bash
cd ../ice3-engine
npm test -- packages/assets/tests/TilesetReader.test.ts

cd ../ice3-toolchain
npm test -- tests/partition/tileset.test.ts
```

预期：FAIL，因为多内容会被拒绝，且 writer 只输出一个 content。

- [ ] **步骤 3：实现规范化与写入**

- 在 assets reader 中创建一个共享的规范化辅助函数。
- 保留输入内容的顺序。
- 通过 `contentUri` 保持现有单内容消费方正常工作。
- 工具链为单个 URI 选择 `content`，为多个 URI 选择 `contents`。
- writer 变更后验证 OGC schema。

- [ ] **步骤 4：验证 GREEN**

```bash
npm test -- packages/assets/tests/TilesetReader.test.ts

cd ../ice3-toolchain
npm test -- tests/partition/tileset.test.ts
```

预期：两个测试套件均通过。

- [ ] **步骤 5：提交两个仓库**

```bash
cd ../ice3-engine
git add packages/assets/src/ICETileset.ts \
  packages/assets/src/ICETilesetReader.ts \
  packages/assets/tests/TilesetReader.test.ts
git commit -m "feat(assets): read multi-content tiles"

cd ../ice3-toolchain
git add packages/toolchain-core/src/partition/tileset.ts \
  tests/partition/tileset.test.ts
git commit -m "feat(toolchain): write multi-content tiles"
```

---

### 任务 2：确定性的粗模分片规划

**文件：**
- 创建：`ice3-toolchain/packages/toolchain-core/src/lod/createCoarseChunkPlan.ts`
- 创建：`ice3-toolchain/tests/lod/createCoarseChunkPlan.test.ts`
- 修改：`ice3-toolchain/packages/toolchain-core/src/partition/types.ts`
- 修改：`ice3-toolchain/packages/toolchain-core/src/index.ts`

**接口：**

```ts
interface ICECoarseChunkOptions {
  readonly maxBytes: number;
}

interface ICECoarseChunkUnit {
  readonly unitId: string;
  readonly bytes: number;
}

interface ICECoarseChunk {
  readonly unitIds: readonly string[];
  readonly bytes: number;
  readonly oversized: boolean;
}

function createCoarseChunkPlan(
  units: readonly ICECoarseChunkUnit[],
  options: ICECoarseChunkOptions,
): readonly ICECoarseChunk[];
```

- `unitId` 是稳定的语义设备键，而不是显示名称。
- 单元按 `unitId` 排序。
- 贪婪分组保持顺序。
- 超大单元会单独形成一个超大分片，而不是被切分。

- [ ] **步骤 1：编写会失败的分片规划测试**

```ts
test('groups stable units without splitting a device', () => {
  const chunks = createCoarseChunkPlan([
    { unitId: 'device-c', bytes: 10 },
    { unitId: 'device-a', bytes: 8 },
    { unitId: 'device-b', bytes: 8 },
  ], { maxBytes: 16 });

  expect(chunks).toEqual([
    { unitIds: ['device-a', 'device-b'], bytes: 16, oversized: false },
    { unitIds: ['device-c'], bytes: 10, oversized: false },
  ]);
});

test('keeps an oversized unit intact', () => {
  expect(createCoarseChunkPlan([
    { unitId: 'large', bytes: 40 },
    { unitId: 'small', bytes: 4 },
  ], { maxBytes: 16 })).toEqual([
    { unitIds: ['large'], bytes: 40, oversized: true },
    { unitIds: ['small'], bytes: 4, oversized: false },
  ]);
});
```

- [ ] **步骤 2：运行 RED**

```bash
npm test -- tests/lod/createCoarseChunkPlan.test.ts
```

预期：FAIL，因为分片规划尚不存在。

- [ ] **步骤 3：实现确定性分组**

- 拒绝非正数或非有限字节上限。
- 拒绝重复或空的单元 ID。
- 按字典序对稳定 ID 排序。
- 使用提供的字节估算值进行规划；实际生成大小会在任务 4 中再次检查。

- [ ] **步骤 4：验证 GREEN**

```bash
npm test -- tests/lod/createCoarseChunkPlan.test.ts
npm run typecheck
```

预期：通过。

- [ ] **步骤 5：提交**

```bash
git add packages/toolchain-core/src/lod/createCoarseChunkPlan.ts \
  packages/toolchain-core/src/partition/types.ts \
  packages/toolchain-core/src/index.ts \
  tests/lod/createCoarseChunkPlan.test.ts
git commit -m "feat(toolchain): plan stable coarse chunks"
```

---

### 任务 3：生成并测量粗模分片

**文件：**
- 修改：`ice3-toolchain/packages/toolchain-core/src/partition/partitionAsset.ts`
- 修改：`ice3-toolchain/packages/toolchain-core/src/lod/simplifyGeometry.ts`
- 修改：`ice3-toolchain/packages/toolchain-core/src/partition/types.ts`
- 修改：`ice3-toolchain/packages/toolchain-core/src/partition/tileset.ts`
- 修改：`ice3-toolchain/packages/cli/src/commands.ts`
- 修改：`ice3-toolchain/tests/partition/lodGeneration.test.ts`
- 修改：`ice3-toolchain/tests/cli/commands.test.ts`
- 修改：`ice3-toolchain/tests/lod/simplifyGeometry.test.ts`

**接口：**

- `ICELodBuildOptions` 新增：

```ts
readonly coarseChunkMaxBytes?: number;
```

- `ICEPartitionResult.stats` 新增：

```ts
readonly coarseContentCount: number;
readonly maxCoarseChunkBytes: number;
readonly oversizedCoarseChunks: number;
readonly coarseTriangleRatio: number;
readonly coarseByteRatio: number;
```

- Tile 粗模内容使用 `contentUris`。

- [ ] **步骤 1：编写会失败的集成拆分测试**

为 `lodGeneration.test.ts` 增加一个测试，其源包含至少四个设备，且分片上限
会强制产生两个或更多粗模分片：

```ts
const result = await partitionAsset(createLodPartitionSource(), {
  assetId: 'lod-demo',
  maxTriangles: 8,
  lod: {
    ratio: 0.15,
    maxTrianglesPerProxy: 64,
    minTrianglesPerUnit: 1,
    coarseChunkMaxBytes: 5000,
  },
});

const root = result.tileset.root as {
  contents: Array<{ uri: string }>;
  content?: unknown;
  geometricError: number;
};

expect(root.content).toBeUndefined();
expect(root.contents.length).toBeGreaterThan(1);
expect(result.stats.coarseContentCount).toBeGreaterThan(1);
expect(result.stats.maxCoarseChunkBytes).toBeLessThanOrEqual(5000);
```

增加一个简化测试：保持拓扑的简化无法达到目标，但第二阶段折叠可以达到；
断言实际结果更低，且报告误差仍为有限值。

- [ ] **步骤 2：运行 RED**

```bash
npm test -- tests/partition/lodGeneration.test.ts \
  tests/lod/simplifyGeometry.test.ts
```

预期：FAIL，因为粗模内容仍是一个文件，且回退简化尚不存在。

- [ ] **步骤 3：实现分片生成**

- 在分片前为逻辑 Tile 分配一个粗模三角形预算。
- 根据语义单元构建候选粗模分片字节。
- 使用 `createCoarseChunkPlan` 对单元分组。
- 为每个组生成一个 Prepared GLB。
- 如果实际分片字节超过配置上限且存在多个单元，则进一步拆分该组。
- 输出 `coarse/<tile-id>/part-NNN.glb`。
- 向完成的 Tile 写入多个 `contentUris`。
- 先运行保持拓扑的简化，仅在明显未达到目标时运行基于计数的保守折叠。
- 报告实际比例和超大设备。
- 解析 `--coarse-chunk-max-bytes`，默认使用 `--max-bytes`。
- 在 JSON CLI 输出中公开所有粗模分片统计信息。

- [ ] **步骤 4：验证 GREEN**

```bash
npm test -- tests/partition/lodGeneration.test.ts \
  tests/lod/simplifyGeometry.test.ts \
  tests/cli/commands.test.ts
npm run typecheck
npm test
```

预期：全部通过，且现有非 LOD 输出保持不变。

- [ ] **步骤 5：提交**

```bash
git add packages/toolchain-core/src/partition/partitionAsset.ts \
  packages/toolchain-core/src/lod/simplifyGeometry.ts \
  packages/toolchain-core/src/partition/types.ts \
  packages/toolchain-core/src/partition/tileset.ts \
  packages/cli/src/commands.ts \
  tests/partition/lodGeneration.test.ts \
  tests/cli/commands.test.ts \
  tests/lod/simplifyGeometry.test.ts
git commit -m "feat(toolchain): split coarse lod content"
```

---

### 任务 4：逻辑多内容 Tile 生命周期

**文件：**
- 修改：`ice3-engine/packages/runtime/src/asset/ICETilesetLoader.ts`
- 修改：`ice3-engine/packages/runtime/tests/TilesetLoader.test.ts`
- 创建：`ice3-engine/packages/runtime/tests/MultiContentTile.test.ts`
- 修改：`ice3-engine/examples/m1/global.d.ts`

**接口：**

```ts
interface ICETilesetStats {
  readonly residentContents: number;
  readonly loadingContents: number;
}
```

- 一个逻辑 Tile 拥有所有已暂存的分片容器。
- 仅当每个必需分片都成功后，Tile 才会被加载。
- Tile 缓存清理会清除每个内容 URI。

- [ ] **步骤 1：编写会失败的多内容测试**

```ts
it('commits one logical container after all chunks finish', async () => {
  const tileset = await openMultiContentFixture();

  await tileset.whenReady();
  expect(tileset.scene.children).toHaveLength(1);
  expect(tileset.stats.resident).toBe(1);
  expect(tileset.stats.residentContents).toBe(2);
  expect(tileset.scene.children[0]!.children).toHaveLength(2);
});

it('does not commit a partial logical tile when one chunk fails', async () => {
  const tileset = await openMultiContentFixture({ fail: 1 });
  await tileset.whenIdle();

  expect(tileset.stats.resident).toBe(0);
  expect(tileset.stats.failed).toBe(1);
  expect(tileset.scene.children).toHaveLength(0);
});
```

- [ ] **步骤 2：运行 RED**

```bash
npm test -- packages/runtime/tests/MultiContentTile.test.ts
```

预期：FAIL，因为 loader 假定只有一个 `contentUri`。

- [ ] **步骤 3：实现逻辑 Tile 加载**

- 将单 URI 缓存字段替换为按分片记录。
- 在一个并发槽位内按顺序加载分片 URI。
- 暂存所有分片容器。
- 全部成功后，创建一个逻辑容器并提交一次。
- 加载失败或驱逐时，释放所有暂存分片并清除每个 URL。
- 将所有事件和统计计算更新为逻辑 Tile 计数加各分片计数。
- `TILESET_TILE_LOADED` 对逻辑 Tile 只发出一次。

- [ ] **步骤 4：验证 GREEN**

```bash
npm test -- packages/runtime/tests/MultiContentTile.test.ts \
  packages/runtime/tests/TilesetLoader.test.ts \
  packages/runtime/tests/LodLoader.test.ts
npm run typecheck
npm test
```

预期：全部通过。

- [ ] **步骤 5：提交**

```bash
git add packages/runtime/src/asset/ICETilesetLoader.ts \
  packages/runtime/tests/MultiContentTile.test.ts \
  packages/runtime/tests/TilesetLoader.test.ts \
  examples/m1/global.d.ts
git commit -m "feat(runtime): load multi-content tiles atomically"
```

---

### 任务 5：非阻塞预取

**文件：**
- 修改：`ice3-engine/packages/runtime/src/asset/ICETilesetLoader.ts`
- 修改：`ice3-engine/packages/runtime/src/asset/ICELodSelector.ts`
- 修改：`ice3-engine/packages/runtime/tests/LodLoader.test.ts`
- 修改：`ice3-engine/packages/runtime/tests/LodSelector.test.ts`

**接口：**

- selector 返回可选预取目标列表，范围超出可见切面一级。
- 预取状态与当前切面必需工作分开跟踪。

- [ ] **步骤 1：编写会失败的预取测试**

```ts
it('keeps visible whenIdle independent from background prefetch', async () => {
  const tileset = await openHierarchicalWithDelayedPrefetch();
  await tileset.whenReady();

  await expect(tileset.whenIdle()).resolves.toBeUndefined();
  expect(tileset.stats.loadingContents).toBeGreaterThan(0);
});

it('does not treat prefetch failure as a visible failure', async () => {
  const tileset = await openHierarchicalWithFailedPrefetch();
  await tileset.whenIdle();

  expect(tileset.stats.resident).toBeGreaterThan(0);
  expect(tileset.stats.failed).toBe(0);
  expect(engine.getDiagnostics().lastDiagnostic?.code)
    .not.toBe('ICE3_TILESET_TILE_FAILED');
});
```

- [ ] **步骤 2：运行 RED**

```bash
npm test -- packages/runtime/tests/LodLoader.test.ts
```

预期：FAIL，因为当前尚未实现预取。

- [ ] **步骤 3：实现预取**

- 从可见目标切面派生一级相邻内容。
- 达到常驻上限时停止预取。
- 将预取排入低于当前可见工作和回退工作的队列。
- 将预取候选与必需的 idle 工作分开跟踪。
- 相机变化时，丢弃保留范围之外的预取内容。
- 预取失败时，仅在本地执行驱逐，不使可见覆盖失败。

- [ ] **步骤 4：验证 GREEN**

```bash
npm test -- packages/runtime/tests/LodLoader.test.ts \
  packages/runtime/tests/LodSelector.test.ts
npm run typecheck
npm test
```

预期：全部通过。

- [ ] **步骤 5：提交**

```bash
git add packages/runtime/src/asset/ICETilesetLoader.ts \
  packages/runtime/src/asset/ICELodSelector.ts \
  packages/runtime/tests/LodLoader.test.ts \
  packages/runtime/tests/LodSelector.test.ts
git commit -m "feat(runtime): prefetch adjacent lod content"
```

---

### 任务 6：测量并选择 SSE 默认值

**文件：**
- 修改：`ice3-engine/packages/runtime/src/asset/ICETilesetLoader.ts`
- 修改：`ice3-engine/README.md`
- 修改：`ice3-engine/docs/api/m1.md`
- 验证期间在 Git 之外修改受控工作集测量脚本

**接口：**

- 在受控浏览器中评估阈值 `16`、`32` 和 `48`。
- 只有在比较目标差异、可见质量、常驻字节、首个内容耗时和 idle 耗时后，
  才选择一个默认值。

- [ ] **步骤 1：添加确定性阈值测试**

```ts
it('produces distinct target cuts at calibrated thresholds', () => {
  const overview16 = selector.select(input(1000, 800, {
    maxScreenSpaceErrorPixels: 16,
  }));
  const overview48 = selector.select(input(1000, 800, {
    maxScreenSpaceErrorPixels: 48,
  }));

  expect(overview16.target.length)
    .toBeGreaterThanOrEqual(overview48.target.length);
});
```

- [ ] **步骤 2：运行 RED**

```bash
npm test -- packages/runtime/tests/LodSelector.test.ts -t calibrated
```

预期：仅当当前行为违反单调细化时才为 FAIL。

- [ ] **步骤 3：测量受控 Asset**

在 Git 之外生成临时层级输出。使用临时浏览器页面和公共 API。
对每个阈值仅记录聚合指标。

- [ ] **步骤 4：设置校准后的默认值**

修改：

```ts
this.maxScreenSpaceErrorPixels = options.maxScreenSpaceErrorPixels ?? <chosen>;
```

并将所有默认值断言和文档更新为实测值。

- [ ] **步骤 5：验证 GREEN 并提交**

```bash
npm test -- packages/runtime/tests/LodSelector.test.ts
npm run verify
git add packages/runtime/src/asset/ICETilesetLoader.ts README.md docs/api/m1.md
git commit -m "feat(runtime): calibrate lod screen-space error"
```

---

### 任务 7：LOD 精炼验证

**文件：**
- 修改：`ice3-toolchain/README.md`
- 修改：`ice3-doc/docs/contracts/asset-preparation-contract-v1.md`
- 修改：`ice3-engine/docs/diagnostics.md`

- [ ] **步骤 1：运行两个完整门禁**

```bash
cd ../ice3-toolchain
source "$HOME/.nvm/nvm.sh"
nvm use 24
npm run verify

cd ../ice3-engine
npm run verify
npm pack --workspaces --dry-run
```

预期：所有测试通过，且没有模型文件被打包。

- [ ] **步骤 2：运行受控真实 Asset 验证**

仅记录：

```text
totalFineTriangles
totalFineBytes
totalCoarseTriangles
totalCoarseBytes
coarseTriangleRatio
coarseByteRatio
coarseContentCount
maxCoarseChunkBytes
oversizedCoarseChunks
overviewTargetNodes
focusedTargetNodes
focusedResidentBytes
afterMoveResidentNodes
firstCoarseContentMs
targetCutReadyMs
prefetchFailures
selectedSseThreshold
pageErrors
```

验收标准：

- 粗模字节 < 精细模型字节；
- 每个未超大的粗模分片 <= 配置上限；
- 三角形比例不高于 25%，或明确报告超过目标；
- 预取失败计数与可见失败隔离；
- 移开后释放常驻内容；
- 没有页面错误。

- [ ] **步骤 3：清理和审查**

删除临时受控 Asset，然后运行 Git、软件包和命名审查。

- [ ] **步骤 4：提交文档并合并**

```bash
cd ../ice3-toolchain
git add README.md
git commit -m "docs: document coarse lod chunking"

cd ../ice3-engine
git add docs/diagnostics.md docs/api/m1.md README.md
git commit -m "docs: document multi-content lod runtime"

cd ../ice3-doc
git add docs/contracts/asset-preparation-contract-v1.md
git commit -m "docs: define chunked coarse lod contract"
```

在干净且完整的验证通过后，将所有仓库分支合入 `main`。

## 执行建议

使用 Native 执行。多内容解析、分片规划、逻辑 Tile 加载、预取和 SSE 行为
共享精确的 Tile ID 与就绪语义；在一个连续实施会话中完成可减少生命周期漂移。

## 相关文档

- `ICE3-DOC-IDX-001` — [文档索引](../README.md)
- `ICE3-DOC-SPEC-005` — [LOD 精炼与场景 API 规范](../specs/2026-10-27-lod-refinement-and-scene-api-design.md)
