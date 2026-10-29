# ICE3 层级 LOD 运行时实施计划

> Document ID: ICE3-DOC-PLAN-006
>
> Status: Implemented
>
> Owner: ICE3 架构维护者

> **面向智能体执行者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 按任务逐步实施本计划。步骤使用复选框（`- [ ]`）语法跟踪。

**目标：** 让 Tileset 运行时根据屏幕空间误差选择覆盖完整的 LOD 切面，在细模未就绪或失败时保留父粗模，并在 LOD 切换期间保持设备 Selection。

**架构：** 纯选择器从完整 Tileset 树计算目标切面和最近粗模回退。句柄保留当前覆盖切面，分帧准备候选内容，并在必要替代内容齐备后移除父粗模。现有视锥、预算、缓存和场景容器继续复用。

**技术栈：** TypeScript 7、Node.js 24.22.1 LTS、WebGL2、Node.js 测试运行器、Playwright、OGC 3D Tiles 1.1、ICE3 core/assets/runtime

**规范：** `../specs/2026-10-27-hierarchical-lod-design.md`

## 全局约束

- 使用 `.nvmrc` 指定的 Node.js 24.22.1 LTS。
- 在 `feature/hierarchical-lod` 分支上开发；仅在完整门禁通过后合入 `main`。
- 每项行为变更都遵循 RED-GREEN-REFACTOR。
- 不添加运行时依赖。
- LOD 选择需要相机和视口。
- `maxScreenSpaceErrorPixels` 默认为 `16`。
- 可见覆盖优先于软驻留预算。
- 在所需细模内容驻留前保留父粗模内容。
- 粗模和细模场景 Node 具有唯一 ID，同时共享稳定的 Selection ID。
- 仅当没有任何驻留内容包含该 Selection ID 时清除 Selection。
- 不要暴露 AI 专用行为；API 仍是通用引擎能力。
- 不要将真实客户 Asset 或派生文件放入 Git、fixture、截图、日志或包中。

## 审查重点

- 父节点可能部分可见；替换它时不得在可见区域产生空洞。
- 细化过程中发生相机变化时，必须保留旧覆盖并丢弃过期子节点。
- 子节点失败必须触发父级回退，同时不得使整个 Tileset 致命失败。
- 当同一 Selection ID 移到细模内容时，已选中的粗模设备必须保持选中。
- 不移动相机而调整视口大小时，必须重新计算 SSE 和目标切面。

---

### 任务 1：读取完整的层级 Tileset

**文件：**
- 修改：`ice3-engine/packages/assets/src/ICETileset.ts`
- 修改：`ice3-engine/packages/assets/src/ICETilesetReader.ts`
- 修改：`ice3-engine/packages/assets/tests/TilesetReader.test.ts`
- 修改：`ice3-engine/packages/assets/src/index.ts`

**接口：**

```ts
interface ICETilesetSnapshot {
  readonly assetId: string;
  readonly root: ICETilesetTile;
  readonly bounds: ICEGeometryBounds;
  readonly tiles: readonly ICETilesetTile[];
}
```

- `tiles` 包含每个带内容的 Tile，包括粗模和细模。
- `root` 保留完整显式树。
- 接受内部内容。
- 多个内容、`region`、隐式 tiling、外部 Tileset 和非有限误差仍会被拒绝。

- [ ] **步骤 1：用层级测试替换拒绝测试**

在 `packages/assets/tests/TilesetReader.test.ts` 中，将当前的“拒绝非叶节点内容”测试替换为：

```ts
test('parses parent content and retains the complete hierarchy', () => {
  const value = JSON.parse(tileset());
  value.root.children = [{
    boundingVolume: value.root.boundingVolume,
    geometricError: 0,
    refine: 'REPLACE',
    content: { uri: 'parts/part-001.glb' },
  }];
  const snapshot = readTileset(
    JSON.stringify(value),
    'https://example.test/scene/tileset.json',
  );

  expect(snapshot.root.contentUri).toBe(
    'https://example.test/scene/parts/part-000.glb',
  );
  expect(snapshot.root.children).toHaveLength(1);
  expect(snapshot.tiles.map((tile) => tile.contentUri)).toEqual([
    'https://example.test/scene/parts/part-000.glb',
    'https://example.test/scene/parts/part-001.glb',
  ]);
});

test('rejects a tile whose error is above its parent', () => {
  const value = JSON.parse(tileset());
  value.root.geometricError = 1;
  value.root.children = [{
    boundingVolume: value.root.boundingVolume,
    geometricError: 2,
    refine: 'REPLACE',
    content: { uri: 'parts/part-001.glb' },
  }];

  expect(() => readTileset(
    JSON.stringify(value),
    'https://example.test/scene/tileset.json',
  )).toThrow(/ICE3_TILESET_INVALID/);
});
```

- [ ] **步骤 2：运行 RED**

```bash
source "$HOME/.nvm/nvm.sh"
nvm use 24
npm test -- packages/assets/tests/TilesetReader.test.ts
```

预期：失败，因为内部内容会被拒绝且缺少 `root`。

- [ ] **步骤 3：实现层级解析**

- 从 `readTileset` 返回 `root: rootTile`。
- 继续按遍历顺序输出带内容的 Node。
- 移除非叶节点内容拒绝逻辑。
- 验证 `child.geometricError <= parent.geometricError`。
- 保留变换组合和相对 URI 检查。

- [ ] **步骤 4：验证 GREEN**

```bash
npm test -- packages/assets/tests/TilesetReader.test.ts
npm test
```

预期：全部通过。

- [ ] **步骤 5：提交**

```bash
git add packages/assets/src/ICETileset.ts \
  packages/assets/src/ICETilesetReader.ts \
  packages/assets/src/index.ts \
  packages/assets/tests/TilesetReader.test.ts
git commit -m "feat(assets): read hierarchical tilesets"
```

---

### 任务 2：纯屏幕空间 LOD 选择器

**文件：**
- 新建：`ice3-engine/packages/runtime/src/asset/ICELodSelector.ts`
- 新建：`ice3-engine/packages/runtime/tests/LodSelector.test.ts`
- 修改：`ice3-engine/packages/runtime/src/index.ts`

**接口：**

```ts
export interface ICELodSelectionInput {
  readonly root: ICETilesetTile;
  readonly camera: ICEPerspectiveCamera;
  readonly viewport: ICEViewport;
  readonly residentIds: ReadonlySet<string>;
  readonly failedIds: ReadonlySet<string>;
  readonly maxScreenSpaceErrorPixels: number;
}

export interface ICELodSelection {
  readonly target: readonly ICETilesetTile[];
  readonly fallbackByTargetId: ReadonlyMap<string, string>;
}

export class ICELodSelector {
  select(input: ICELodSelectionInput): ICELodSelection;
}
```

- `fallbackByTargetId` 将目标内容 Tile 映射到其最近的带内容祖先。
- 选择器是纯函数，不了解 URL、fetch、场景或 GPU 状态。

- [ ] **步骤 1：编写失败的选择器测试**

```ts
import { test } from 'node:test';
import { expect } from 'expect';
import { ICEPerspectiveCamera } from '@ice3/core';
import type { ICETilesetTile } from '@ice3/assets';
import { ICELodSelector } from '../src/asset/ICELodSelector';

const child = (
  id: string,
  minX: number,
  triangleError: number,
): ICETilesetTile => ({
  id,
  bounds: { min: [minX, -1, -1], max: [minX + 2, 1, 1] },
  contentUri: `parts/${id}.glb`,
  geometricError: triangleError,
  children: [],
});

const tree = (): ICETilesetTile => ({
  id: 'root',
  bounds: { min: [-1, -1, -1], max: [5, 1, 1] },
  contentUri: 'coarse/root.glb',
  geometricError: 10,
  children: [child('near', 0, 0), child('far', 3, 0)],
});

const camera = (z: number) => new ICEPerspectiveCamera({
  id: 'camera',
  fov: 45,
  near: 0.1,
  far: 1000,
  position: [2, 0, z],
  target: [2, 0, 0],
});

const selector = new ICELodSelector();
const input = (z: number, width = 800) => ({
  root: tree(),
  camera: camera(z),
  viewport: { x: 0, y: 0, width, height: 800 },
  residentIds: new Set<string>(),
  failedIds: new Set<string>(),
  maxScreenSpaceErrorPixels: 16,
});

test('selects parent coarse content at overview distance', () => {
  const result = selector.select(input(100));
  expect(result.target.map((tile) => tile.id)).toEqual(['root']);
  expect(result.fallbackByTargetId.get('root')).toBeUndefined();
});

test('refines locally when screen-space error exceeds the threshold', () => {
  const result = selector.select(input(2, 100));
  expect(result.target.map((tile) => tile.id)).toEqual(['near', 'far']);
  expect(result.fallbackByTargetId.get('near')).toBe('root');
  expect(result.fallbackByTargetId.get('far')).toBe('root');
});

test('provides ancestor fallback while target content is not resident', () => {
  const result = selector.select({
    ...input(2, 100),
    residentIds: new Set(['root']),
  });
  expect(result.fallbackByTargetId).toEqual(new Map([
    ['near', 'root'],
    ['far', 'root'],
  ]));
});
```

添加以下测试：

- 仅更改视口宽度会改变目标；
- 零误差叶节点停止细化；
- 被剔除的子树不存在；
- 不带内容的内部 Tile 会继续进入子节点。

- [ ] **步骤 2：运行 RED**

```bash
npm test -- packages/runtime/tests/LodSelector.test.ts
```

预期：失败，因为 `ICELodSelector` 尚不存在。

- [ ] **步骤 3：实现选择**

```ts
const distance = Math.max(
  input.camera.near,
  distanceToBounds(input.camera.getPosition().toArray(), tile.bounds),
);
const sse = tile.geometricError * input.viewport.height / (
  2 * distance * Math.tan(input.camera.fov * Math.PI / 360)
);
```

遍历：

1. 拒绝 `ICEFrustum` 之外的 Tile。
2. 在内容叶节点或 `sse <= threshold` 时停止。
3. 对于高于阈值的内部 Node，递归进入可见子节点。
4. 如果内部 Node 没有内容且无法细化，则保留其可见的带内容后代。
5. 为每个目标从最近的内容祖先解析回退。

- [ ] **步骤 4：验证 GREEN**

```bash
npm test -- packages/runtime/tests/LodSelector.test.ts
npm run typecheck
npm test
```

预期：全部通过。

- [ ] **步骤 5：提交**

```bash
git add packages/runtime/src/asset/ICELodSelector.ts \
  packages/runtime/src/index.ts \
  packages/runtime/tests/LodSelector.test.ts
git commit -m "feat(runtime): select hierarchical lod cuts"
```

---

### 任务 3：添加 LOD 选项、统计和事件

**文件：**
- 修改：`ice3-engine/packages/runtime/src/asset/ICETilesetLoader.ts`
- 修改：`ice3-engine/packages/runtime/tests/TilesetLoader.test.ts`
- 修改：`ice3-engine/examples/m1/global.d.ts`

**接口：**

```ts
interface ICETilesetLoaderOptions {
  readonly maxScreenSpaceErrorPixels?: number;
}

interface ICELodStats {
  readonly target: number;
  readonly resident: number;
  readonly coarseResident: number;
  readonly fineResident: number;
  readonly transitioning: number;
  readonly fallback: number;
  readonly maxScreenSpaceErrorPixels: number;
}

interface ICETilesetStats {
  readonly lod: ICELodStats;
}
```

事件：

- `TILESET_LOD_CHANGED`
- `TILESET_LOD_FALLBACK`

- [ ] **步骤 1：编写失败的统计测试**

```ts
it('reports the selected LOD cut and SSE threshold', async () => {
  const tileset = await openHierarchicalFixture({
    maxScreenSpaceErrorPixels: 24,
  });

  expect(tileset.stats.lod.maxScreenSpaceErrorPixels).toBe(24);
  expect(tileset.stats.lod.target).toBeGreaterThan(0);
  expect(tileset.stats.lod.fallback).toBeGreaterThanOrEqual(0);
});

it('rejects an invalid SSE threshold', () => {
  expect(() => new ICETilesetLoader(engine, {
    camera: camera(),
    maxScreenSpaceErrorPixels: 0,
  })).toThrow(/ICE3_TILESET_LOD_INVALID/);
});
```

- [ ] **步骤 2：运行 RED**

```bash
npm test -- packages/runtime/tests/TilesetLoader.test.ts
```

预期：失败，因为选项和统计尚不存在。

- [ ] **步骤 3：实现稳定的初始值**

- 默认阈值为 `16`。
- 在首次选择前将 LOD 统计初始化为零。
- 仅在目标 ID 与先前切面不同时发出 `TILESET_LOD_CHANGED`。
- 每个目标 Tile 转入回退时发出一次 `TILESET_LOD_FALLBACK`。
- 在每个 LOD 事件中包含冻结统计。

- [ ] **步骤 4：验证 GREEN**

```bash
npm test -- packages/runtime/tests/TilesetLoader.test.ts
npm run typecheck
```

预期：全部通过。

- [ ] **步骤 5：提交**

```bash
git add packages/runtime/src/asset/ICETilesetLoader.ts \
  packages/runtime/tests/TilesetLoader.test.ts \
  examples/m1/global.d.ts
git commit -m "feat(runtime): expose lod selection state"
```

---

### 任务 4：在 LOD 过渡期间维持覆盖

**文件：**
- 修改：`ice3-engine/packages/runtime/src/asset/ICETilesetLoader.ts`
- 新建：`ice3-engine/packages/runtime/tests/LodLoader.test.ts`
- 修改：`ice3-engine/packages/runtime/tests/TilesetLoader.test.ts`

**接口：**

- `ICETilesetHandle` 保留内部 `currentCut` 和 `targetCut` ID 集合。
- 具有祖先回退的目标 Tile 在全部所需可见目标子节点提交前，不会移除该祖先。
- 目标子节点失败时保持回退分支活动。

- [ ] **步骤 1：编写失败的回退测试**

使用一个合成层级，其根具有粗模内容和两个子叶节点。

```ts
it('keeps coarse parent coverage until both target children commit', async () => {
  const fetch = hierarchicalFetch({
    delayed: ['near', 'far'],
  });
  const tileset = await openHierarchical(fetch, {
    maxScreenSpaceErrorPixels: 16,
  });

  await tileset.whenReady();
  expect(tileset.stats.lod.coarseResident).toBe(1);
  expect(tileset.stats.lod.transitioning).toBe(1);
  expect(tileset.scene.findByID('root:tile:root')).toBeDefined();

  resolveTile('near');
  await Promise.resolve();
  expect(tileset.scene.findByID('root:tile:root')).toBeDefined();

  resolveTile('far');
  await tileset.whenIdle();
  expect(tileset.scene.findByID('root:tile:root')).toBeUndefined();
  expect(tileset.stats.lod.fineResident).toBe(2);
  expect(tileset.stats.lod.transitioning).toBe(0);
});

it('keeps parent coverage when a child fails', async () => {
  const tileset = await openHierarchical(failureFetch('far'));
  await tileset.whenIdle();

  expect(tileset.scene.findByID('root:tile:root')).toBeDefined();
  expect(tileset.stats.lod.fallback).toBeGreaterThan(0);
  expect(tileset.scene.children.length).toBeGreaterThan(0);
});

it('discards stale refinement when the camera leaves', async () => {
  const tileset = await openHierarchical(delayedFetch());
  moveCameraAway(camera);
  engine.trigger('AFTER_RENDER');
  await tileset.whenIdle();

  expect(tileset.stats.lod.transitioning).toBe(0);
  expect(tileset.scene.children.length).toBe(0);
});
```

- [ ] **步骤 2：运行 RED**

```bash
npm test -- packages/runtime/tests/LodLoader.test.ts
```

预期：失败，因为当前加载器在没有覆盖切面的情况下移除/提交内容。

- [ ] **步骤 3：实现切面感知生命周期**

- 在构建调度器工作集之前运行 `ICELodSelector.select()`。
- 优先处理目标 Node；包含所需回退祖先。
- 当任一目标子节点处于 pending 时，将子树标记为 transitioning。
- 暂存候选，同时不添加重复场景 ID。
- 在所有可见目标替代内容提交前，保留当前回退内容。
- 失败时保留回退，仅将失败目标从就绪状态移除。
- 相机变化时，丢弃未被新切面保留的候选。
- 按配置保持每帧一次场景提交。
- 替代集提交后，移除已被取代的父内容。

- [ ] **步骤 4：验证 GREEN**

```bash
npm test -- packages/runtime/tests/LodLoader.test.ts \
  packages/runtime/tests/TilesetLoader.test.ts
npm run typecheck
npm test
```

预期：全部通过，包括过期请求和空闲测试。

- [ ] **步骤 5：提交**

```bash
git add packages/runtime/src/asset/ICETilesetLoader.ts \
  packages/runtime/tests/LodLoader.test.ts \
  packages/runtime/tests/TilesetLoader.test.ts
git commit -m "feat(runtime): preserve coverage across lod transitions"
```

---

### 任务 5：保留 Selection 并执行预算

**文件：**
- 修改：`ice3-engine/packages/runtime/src/asset/ICETilesetLoader.ts`
- 修改：`ice3-engine/packages/runtime/tests/LodLoader.test.ts`
- 修改：`ice3-engine/packages/runtime/tests/TilesetLoader.test.ts`

**接口：**

- Selection 查找使用 `ICEMesh.selectionId`，而不是场景 Node ID。
- 仅当没有剩余驻留内容包含所选语义 ID 时，卸载才清除 Selection。
- 绝不因预算移除可见覆盖。

- [ ] **步骤 1：编写失败的 Selection 和预算测试**

```ts
it('preserves selection when a coarse device is replaced by fine content', async () => {
  const tileset = await openHierarchical(immediateFetch());
  await tileset.whenReady();
  engine.setScene(tileset.scene).setSelection(['source-asset/node/0']);

  await tileset.whenIdle();

  expect(engine.getSelection()).toEqual(['source-asset/node/0']);
});

it('keeps visible coverage above the soft budget', async () => {
  const tileset = await openHierarchical(immediateFetch(), {
    maxResidentTiles: 1,
  });
  await tileset.whenIdle();

  expect(tileset.stats.lod.fineResident).toBeGreaterThan(1);
  expect(engine.getDiagnostics().lastDiagnostic?.code)
    .toBe('ICE3_TILESET_RESIDENT_BUDGET_EXCEEDED');
});

it('stops optional refinement when the budget is reached', async () => {
  const tileset = await openHierarchical(delayedFetch(), {
    maxResidentTiles: 1,
  });
  await tileset.whenReady();

  expect(tileset.stats.lod.fallback).toBeGreaterThan(0);
  expect(tileset.stats.lod.transitioning).toBe(0);
});
```

- [ ] **步骤 2：运行 RED**

```bash
npm test -- packages/runtime/tests/LodLoader.test.ts
```

预期：失败，因为当前容器卸载会清除 Selection，且预算处理不支持感知切面。

- [ ] **步骤 3：实现身份感知卸载和预算**

- 移除容器前收集剩余驻留语义 ID。
- 仅当活动 ID 没有剩余驻留匹配时清除 Selection。
- 在分阶段替换期间将已选 ID 保留为意图。
- 在可选细节和预取之前优先保证可见覆盖。
- 达到驻留限制时暂停可选细化。
- 继续允许可见完整性超过软预算。

- [ ] **步骤 4：验证 GREEN**

```bash
npm test -- packages/runtime/tests/LodLoader.test.ts \
  packages/runtime/tests/TilesetLoader.test.ts
npm run typecheck
npm test
```

预期：全部通过。

- [ ] **步骤 5：提交**

```bash
git add packages/runtime/src/asset/ICETilesetLoader.ts \
  packages/runtime/tests/LodLoader.test.ts \
  packages/runtime/tests/TilesetLoader.test.ts
git commit -m "feat(runtime): preserve lod selection and budgets"
```

---

### 任务 6：层级浏览器示例

**文件：**
- 新建：`ice3-engine/tests/fixtures/hierarchical-demo/tileset.json`
- 新建：`ice3-engine/tests/fixtures/hierarchical-demo/coarse/*.glb`
- 新建：`ice3-engine/tests/fixtures/hierarchical-demo/parts/*.glb`
- 修改：`ice3-engine/examples/m1/assets/hierarchical-demo/**`
- 修改：`ice3-engine/examples/m1/main.ts`
- 修改：`ice3-engine/examples/m1/index.html`
- 修改：`ice3-engine/examples/m1/styles.css`
- 修改：`ice3-engine/examples/m1/global.d.ts`
- 修改：`ice3-engine/tests/e2e/m1.spec.ts`

**接口：**

- 示例加载 Asset 计划任务 4 生成的已审查合成层级。
- 浏览器桥暴露带 LOD 字段的 `tilesetStats()` 和确定性相机姿态。
- UI 显示目标/驻留切面数量，且不暴露内部路径。

- [ ] **步骤 1：编写失败的 E2E 测试**

```ts
test('shows coarse coverage and refines the focused branch', async ({ page }) => {
  await page.goto('http://127.0.0.1:8104/');
  await expect(page.locator('[data-role="lod-state"]'))
    .toContainText('粗模');

  await page.evaluate(() => window.__ice3M1.focusLodBranch());
  await expect.poll(
    () => page.evaluate(
      () => window.__ice3M1.tilesetStats().lod.fineResident,
    ),
  ).toBeGreaterThan(0);
  await expect(page.locator('[data-role="tileset-progress"]'))
    .toContainText(/细模 [1-9]/);
});

test('keeps selection through a coarse-to-fine transition', async ({ page }) => {
  await page.goto('http://127.0.0.1:8104/');
  await page.evaluate(() => window.__ice3M1.selectOverviewDevice());
  await page.evaluate(() => window.__ice3M1.focusLodBranch());
  await page.evaluate(() => window.__ice3M1.whenLodIdle());

  expect(await page.evaluate(() => window.__ice3M1.selectedIds().length))
    .toBe(1);
  await expect(page.locator('[data-role="selection-info"]')).toBeVisible();
});

test('shows no blank frame during an intentionally delayed refinement', async ({
  page,
}) => {
  await page.route('**/hierarchical-demo/parts/**', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 500));
    await route.continue();
  });
  await page.goto('http://127.0.0.1:8104/');

  await page.evaluate(() => window.__ice3M1.focusLodBranch());
  expect(await page.evaluate(() => window.__ice3M1.visibleMeshCount()))
    .toBeGreaterThan(0);
});
```

- [ ] **步骤 2：运行 RED**

```bash
npm run test:e2e -- --project=chromium -g "coarse coverage|coarse-to-fine|blank frame"
```

预期：失败，因为示例没有层级或 LOD UI。

- [ ] **步骤 3：生成并接入合成层级**

- 使用 Asset 计划的 `--lod` 流程和工具链生成已审查的合成 fixture。
- 仅提交该合成 fixture。
- 将 M1 指向 `/assets/hierarchical-demo/tileset.json`。
- 添加 LOD 进度文本：目标切面、粗模驻留、细模驻留、回退。
- 添加确定性的聚焦、总览、Selection 和空闲辅助函数。
- 保留黑色背景、平面颜色、黄色 Selection、控件、加载状态和右上业务面板。

- [ ] **步骤 4：验证 GREEN**

```bash
npm run typecheck:example
npm run test:e2e -- --project=chromium tests/e2e/m1.spec.ts
npm run test:e2e -- --project=webkit tests/e2e/m1.spec.ts
```

预期：全部通过。

- [ ] **步骤 5：提交**

```bash
git add tests/fixtures/hierarchical-demo examples/m1 tests/e2e/m1.spec.ts
git commit -m "feat(example): demonstrate hierarchical lod"
```

---

### 任务 7：文档、真实 Asset 验证和合并

**文件：**
- 修改：`ice3-engine/README.md`
- 修改：`ice3-engine/docs/api/m1.md`
- 修改：`ice3-engine/docs/diagnostics.md`
- 修改：`ice3-doc/docs/contracts/asset-preparation-contract-v1.md`

- [ ] **步骤 1：记录运行时行为**

记录：

- `maxScreenSpaceErrorPixels`。
- 当前/目标/回退切面语义。
- LOD 统计和事件。
- Selection 身份。
- 父级回退和失败。
- 无运行时简化。
- 无隐式 tiling 或外部 Tileset。

- [ ] **步骤 2：运行完整门禁**

```bash
cd ../ice3-toolchain
source "$HOME/.nvm/nvm.sh"
nvm use 24
npm run verify

cd ../ice3-engine
npm run verify
npm pack --workspaces --dry-run
```

预期：

- 架构和类型检查通过；
- 所有单元测试通过；
- Chromium 和 WebKit 浏览器测试通过；
- 包不包含客户或合成模型 fixture。

- [ ] **步骤 3：测量受控真实 Asset**

使用工具链 LOD 标志在 Git 之外生成临时层级输出。使用临时浏览器页面和公共 API。仅记录：

```text
totalTiles
rootCoarseTriangles
fullFineTriangles
overviewTargetNodes
overviewResidentNodes
focusedTargetNodes
focusedResidentNodes
focusedResidentBytes
afterMoveResidentNodes
firstCoarseContentMs
targetCutReadyMs
transitionCount
fallbackCount
selectionRetentionCount
pageErrors
```

不要打印或持久化模型名称、Node 名称、路径、截图或几何。

- [ ] **步骤 4：审查并清理**

```bash
git status --short --ignored
git ls-files | rg -i '\.(glb|gltf|bin)$'
```

预期：仅跟踪已审查的合成 fixture；临时真实 Asset 输出已移除。运行项目批准的命名审查，并记录无发现。

- [ ] **步骤 5：提交文档并合并**

```bash
cd ../ice3-engine
git add README.md docs/api/m1.md docs/diagnostics.md
git commit -m "docs: document hierarchical lod runtime"

cd ../ice3-doc
git add docs/contracts/asset-preparation-contract-v1.md
git commit -m "docs: finalize hierarchical lod contract"
```

所有仓库均干净且完整验证后：

```bash
cd ../ice3-toolchain
git switch main
git merge --no-ff feature/hierarchical-lod \
  -m "merge: hierarchical lod"
git branch -d feature/hierarchical-lod

cd ../ice3-engine
git switch main
git merge --no-ff feature/hierarchical-lod \
  -m "merge: hierarchical lod"
git branch -d feature/hierarchical-lod

cd ../ice3-doc
git switch main
git merge --no-ff feature/hierarchical-lod \
  -m "merge: hierarchical lod"
git branch -d feature/hierarchical-lod
```

在 `main` 上再次运行引擎和工具链完整门禁。除上述产品列表外，还使用项目批准的术语列表确认命名审查。

## 执行建议

Asset 计划完成后使用原生执行。LOD 切面计算、保覆盖过渡、Selection 身份和调度器共享紧密的生命周期不变量；连续实施会话可减少接口不匹配。

## 相关文档

- `ICE3-DOC-IDX-001` — [文档索引](../README.md)
- `ICE3-DOC-SPEC-003` — [层级 LOD 规范](../specs/2026-10-27-hierarchical-lod-design.md)
