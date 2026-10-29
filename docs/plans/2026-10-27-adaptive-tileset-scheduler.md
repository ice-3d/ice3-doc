# 自适应 Tileset 调度器实施计划

> Document ID: ICE3-DOC-PLAN-003
>
> Status: Implemented
>
> Owner: ICE3 架构维护者

> **面向智能体执行者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 按任务逐步实施本计划。步骤使用复选框（`- [ ]`）语法跟踪。

**目标：** 用由相机驱动的驻留工作集替换全量即时 Tile 加载，在明确限制下对 Tileset 分区执行剔除、预取、提交和卸载。

**架构：** 纯核心视锥和运行时工作集规划器决定哪些 Tile 可见、适合预取或可安全驱逐。Tileset 句柄负责有界网络队列和提交队列，将每个分区置于可移除容器下，并在相机或视口变化后重新计算工作集。

**技术栈：** TypeScript 7、Node.js 24.22.1 LTS、WebGL2、Node.js 测试运行器、Playwright、OGC 3D Tiles 1.1、ICE3 core/runtime 包。

**规范：** `../specs/2026-10-27-adaptive-tileset-scheduler-design.md`

## 全局约束

- 使用 `.nvmrc` 指定的 Node.js 24.22.1 LTS。
- 在 `feature/adaptive-tileset-scheduler` 分支上开发；仅在完整门禁通过后合入 `main`。
- 每项行为变更都遵循 RED-GREEN-REFACTOR。
- 不要在代码、注释、文档、测试、诊断或提交消息中使用竞品、厂商或第三方产品名称。
- 不要在 Git、测试 fixture、截图、日志或包中暴露真实客户模型或任何派生分区。
- 保持现有 OGC 3D Tiles 1.1 格式和 Prepared GLB 内容不变。
- Tileset 调度需要相机。
- 默认值：2 个并发 Tile 请求、24 个驻留 Tile、256 MiB 驻留几何字节、10% 预取边距、20% 卸载边距、每帧提交 1 个 Tile。
- 绝不为了满足驻留预算而省略可见分区。
- 即使使用单位变换，每个分区也始终由一个可移除场景容器表示。
- 如果选中的 Node 属于被移除的分区，卸载会清除 Selection。
- `whenComplete()` 已移除；`whenIdle()` 等待当前工作集，不等待未来的相机变化。
- LOD、隐式 tiling、父内容细化、外部 tilesets 和 `region` 仍不受支持。
- 不要添加运行时依赖。

## 审查重点

- 大于 `maxResidentTiles` 的可见集必须继续完整加载；预算压力可以发出警告，但绝不能导致可见设备无法显示。
- 在 Tile 正在加载或等待提交时发生相机变化，必须丢弃过期排队工作，且不得创建孤立 Node 或保留旧缓存条目。
- 即使相机位置和目标不变，调整视口大小仍会改变视锥宽高比，因此必须使先前的工作集失效。
- 卸载包含选中设备的分区时，必须在处置前清除 Selection，使拾取和 Selection 面板无法引用已处置的 Node。
- 离屏预取失败必须保持为 Tile 局部失败，不得使整个 Tileset 变成致命错误。

---

### 任务 1：核心视锥边界测试

**文件：**
- 新建：`ice3-engine/packages/core/src/culling/ICEFrustum.ts`
- 新建：`ice3-engine/packages/core/tests/ICEFrustum.test.ts`
- 修改：`ice3-engine/packages/core/src/index.ts`

**接口：**
- 使用：`ICEMatrix4`、`ICEGeometryBounds`。
- 产出：

```ts
export class ICEFrustum {
  static fromViewProjection(matrix: ICEMatrix4): ICEFrustum;
  intersectsBounds(bounds: ICEGeometryBounds, margin?: number): boolean;
}
```

- [ ] **步骤 1：编写失败的视锥测试**

创建 `packages/core/tests/ICEFrustum.test.ts`：

```ts
import { test } from 'node:test';
import { expect } from 'expect';
import { ICEFrustum } from '../src/culling/ICEFrustum';
import { ICEPerspectiveCamera } from '../src/camera/ICEPerspectiveCamera';

const frustum = (position = [0, 0, 5] as const) => (
  ICEFrustum.fromViewProjection(
    new ICEPerspectiveCamera({
      id: 'camera',
      fov: 60,
      near: 0.1,
      far: 100,
      position,
      target: [position[0], position[1], 0],
    }).getViewProjectionMatrix(1),
  )
);

test('keeps a bounds intersecting the camera frustum', () => {
  expect(frustum().intersectsBounds({
    min: [-1, -1, -1],
    max: [1, 1, 1],
  })).toBe(true);
});

test('rejects a bounds entirely behind the camera', () => {
  expect(frustum().intersectsBounds({
    min: [-1, -1, 7],
    max: [1, 1, 8],
  })).toBe(false);
});

test('rejects a distant lateral bounds but accepts it with a world-space margin', () => {
  const bounds = { min: [20, -1, -1], max: [21, 1, 1] } as const;
  expect(frustum().intersectsBounds(bounds, 0)).toBe(false);
  expect(frustum().intersectsBounds(bounds, 40)).toBe(true);
});

test('handles flat and point bounds deterministically', () => {
  expect(frustum().intersectsBounds({
    min: [0, 0, 0],
    max: [0, 0, 0],
  })).toBe(true);
  expect(frustum().intersectsBounds({
    min: [0, 0, 7],
    max: [0, 0, 7],
  })).toBe(false);
});
```

- [ ] **步骤 2：运行 RED**

```bash
cd ../ice3-engine
nvm use
npm test -- packages/core/tests/ICEFrustum.test.ts
```

预期：失败，因为 `ICEFrustum` 尚不存在。

- [ ] **步骤 3：实现核心视锥提取**

从视图投影矩阵行实现六个规范化平面：

```text
left   = row4 + row1
right  = row4 - row1
bottom = row4 + row2
top    = row4 - row2
near   = row4 + row3
far    = row4 - row3
```

对每个平面使用 AABB 的正顶点。当正顶点超出 `margin` 时返回 `false`。验证边界为有限值，并拒绝负边距。

从 `packages/core/src/index.ts` 导出。

- [ ] **步骤 4：验证 GREEN**

```bash
npm test -- packages/core/tests/ICEFrustum.test.ts
npm test
```

预期：全部通过。

- [ ] **步骤 5：提交**

```bash
git add packages/core/src/culling/ICEFrustum.ts \
  packages/core/src/index.ts packages/core/tests/ICEFrustum.test.ts
git commit -m "feat(core): add frustum bounds testing"
```

---

### 任务 2：纯 Tileset 工作集规划器

**文件：**
- 新建：`ice3-engine/packages/runtime/src/asset/ICETilesetScheduler.ts`
- 新建：`ice3-engine/packages/runtime/tests/TilesetScheduler.test.ts`
- 修改：`ice3-engine/packages/runtime/src/index.ts`

**接口：**
- 使用：`ICEFrustum`、相机、视口、Asset 边界、Tileset Tile 和驻留 Tile 字节估计值。
- 产出：

```ts
export interface ICETilesetSchedulerOptions {
  readonly maxResidentTiles: number;
  readonly maxResidentBytes: number;
  readonly prefetchMarginRatio: number;
  readonly unloadMarginRatio: number;
}

export interface ICETilesetWorkSet {
  readonly visible: readonly ICETilesetTile[];
  readonly prefetch: readonly ICETilesetTile[];
  readonly retainIds: ReadonlySet<string>;
  readonly ordered: readonly ICETilesetTile[];
  readonly budgetExceeded: boolean;
}

export class ICETilesetScheduler {
  constructor(options: ICETilesetSchedulerOptions);
  update(input: {
    readonly assetBounds: ICEGeometryBounds;
    readonly tiles: readonly ICETilesetTile[];
    readonly camera: ICEPerspectiveCamera;
    readonly viewport: ICEViewport;
    readonly residentBytes: ReadonlyMap<string, number>;
  }): ICETilesetWorkSet;
}
```

- [ ] **步骤 1：编写失败的调度器测试**

创建一个辅助函数，在 x = 0、100、200 处生成 Tile：

```ts
import { test } from 'node:test';
import { expect } from 'expect';
import { ICEPerspectiveCamera } from '@ice3/core';
import type { ICETilesetTile } from '@ice3/assets';
import { ICETilesetScheduler } from '../src/asset/ICETilesetScheduler';

const tile = (id: string, x: number): ICETilesetTile => ({
  id,
  bounds: { min: [x - 1, -1, -1], max: [x + 1, 1, 1] },
  contentUri: `${id}.glb`,
  children: [],
  geometricError: 0,
});

const tiles = [tile('near', 0), tile('middle', 100), tile('far', 200)];
const assetBounds = { min: [-1, -1, -1], max: [201, 1, 1] } as const;
const camera = (x: number) => new ICEPerspectiveCamera({
  id: 'camera',
  fov: 30,
  near: 0.1,
  far: 1000,
  position: [x, 0, 8],
  target: [x, 0, 0],
});
const scheduler = new ICETilesetScheduler({
  maxResidentTiles: 1,
  maxResidentBytes: 10,
  prefetchMarginRatio: 0.01,
  unloadMarginRatio: 0.05,
});

test('returns visible work first and excludes distant tiles from prefetch', () => {
  const result = scheduler.update({
    assetBounds,
    tiles,
    camera: camera(0),
    viewport: { x: 0, y: 0, width: 800, height: 800 },
    residentBytes: new Map(),
  });

  expect(result.visible.map((entry) => entry.id)).toEqual(['near']);
  expect(result.prefetch.map((entry) => entry.id)).toEqual([]);
  expect(result.ordered.map((entry) => entry.id)).toEqual(['near']);
  expect(result.retainIds.has('far')).toBe(false);
});

test('reports budget pressure without dropping visible tiles', () => {
  const result = scheduler.update({
    assetBounds,
    tiles,
    camera: new ICEPerspectiveCamera({
      id: 'wide',
      fov: 120,
      near: 0.1,
      far: 1000,
      position: [0, 0, 300],
      target: [0, 0, 0],
    }),
    viewport: { x: 0, y: 0, width: 800, height: 800 },
    residentBytes: new Map([
      ['near', 8],
      ['middle', 8],
    ]),
  });

  expect(result.budgetExceeded).toBe(true);
  expect(result.visible).toHaveLength(3);
  expect(result.ordered.map((entry) => entry.id).slice(0, 3)).toEqual([
    'near', 'middle', 'far',
  ]);
});

test('changes the visible set when the viewport aspect changes', () => {
  const wide = new ICEPerspectiveCamera({
    id: 'wide',
    fov: 120,
    near: 0.1,
    far: 1000,
    position: [0, 0, 300],
    target: [0, 0, 0],
  });
  const wideResult = scheduler.update({
    assetBounds,
    tiles,
    camera: wide,
    viewport: { x: 0, y: 0, width: 800, height: 800 },
    residentBytes: new Map(),
  });
  const narrowResult = scheduler.update({
    assetBounds,
    tiles,
    camera: wide,
    viewport: { x: 0, y: 0, width: 100, height: 800 },
    residentBytes: new Map(),
  });

  expect(wideResult.visible.map((entry) => entry.id)).toEqual([
    'near', 'middle', 'far',
  ]);
  expect(narrowResult.visible.map((entry) => entry.id)).toEqual(['near']);
});
```

- [ ] **步骤 2：运行 RED**

```bash
npm test -- packages/runtime/tests/TilesetScheduler.test.ts
```

预期：失败，因为调度器尚不存在。

- [ ] **步骤 3：实现纯规划器**

实现：

1. 使用前验证所有比例和预算。
2. 根据 `assetBounds` 的对角线计算场景半径。
3. 使用 `sceneRadius * prefetchMarginRatio` 和 `sceneRadius * unloadMarginRatio` 作为边距构建视锥。
4. 将 Tile 分为严格可见集、预取集和保留集。
5. 先按可见优先排序，再按中心到相机位置的距离排序，最后以 Tile ID 作为平局判定。
6. 将可见和预取 Tile 合并为 `ordered`。
7. 当驻留数量或字节超过配置限制时设置 `budgetExceeded`。
8. 绝不因该标志移除可见 Tile。
9. 返回不可变数组，以及冻结的 `retainIds` 集合包装；该包装表示为只读集合，并在每次调用时由新的 `Set` 支持。

- [ ] **步骤 4：验证 GREEN**

```bash
npm test -- packages/runtime/tests/TilesetScheduler.test.ts
npm test
```

- [ ] **步骤 5：提交**

```bash
git add packages/runtime/src/asset/ICETilesetScheduler.ts \
  packages/runtime/src/index.ts packages/runtime/tests/TilesetScheduler.test.ts
git commit -m "feat(runtime): plan camera-driven tile work sets"
```

---

### 任务 3：按 URL 释放 Asset 缓存

**文件：**
- 修改：`ice3-engine/packages/runtime/src/asset/ICEAssetLoader.ts`
- 修改：`ice3-engine/packages/runtime/tests/AssetLoader.test.ts`

**接口：**
- 扩展 `ICEAssetLoader.clear(url?: string): void`。
- 不传参数时保留当前行为，清除所有已缓存 URL。
- 传入 URL 时，仅移除该 URL 及其 legacy 警告标记。

- [ ] **步骤 1：编写失败的缓存测试**

追加：

```ts
it('clears one cached URL without clearing another', async () => {
  const engine = new ICE3({ backend: new FakeRendererBackend() });
  const fetch = vi.fn(async () => new Response(fixtureBytes.slice(0)));
  const loader = new ICEAssetLoader(engine, { fetch });

  await loader.load('/first.glb');
  await loader.load('/second.glb');
  loader.clear('/first.glb');
  await loader.load('/first.glb');
  await loader.load('/second.glb');

  expect(fetch).toHaveBeenCalledTimes(3);
});
```

- [ ] **步骤 2：运行 RED**

```bash
npm test -- packages/runtime/tests/AssetLoader.test.ts -t "clears one"
```

预期：失败，因为 `clear` 忽略 URL 参数，并且由于每次清除后的加载都不同，fetch 被调用四次。

- [ ] **步骤 3：实现选择性清除**

将 `clear` 改为：

```ts
clear(url?: string): void {
  if (url === undefined) {
    this.cache.clear();
    this.legacyWarnings.clear();
    return;
  }
  this.cache.delete(url);
  this.legacyWarnings.delete(url);
}
```

- [ ] **步骤 4：验证 GREEN 并提交**

```bash
npm test -- packages/runtime/tests/AssetLoader.test.ts
npm test
git add packages/runtime/src/asset/ICEAssetLoader.ts \
  packages/runtime/tests/AssetLoader.test.ts
git commit -m "feat(runtime): release individual asset cache entries"
```

---

### 任务 4：相机驱动的 Tileset 状态和驻留容器

**文件：**
- 修改：`ice3-engine/packages/runtime/src/asset/ICETilesetLoader.ts`
- 修改：`ice3-engine/packages/runtime/tests/TilesetLoader.test.ts`
- 修改：`ice3-engine/examples/m1/global.d.ts`
- 修改：`ice3-engine/docs/api/m1.md`

**接口：**
- `ICETilesetLoaderOptions.camera` 变为必填。
- 扩展状态，增加 `'evicted'`。
- 扩展统计，增加 `visible`、`resident`、`residentBytes`、`evicted`。
- 用 `whenIdle()` 替换 `whenComplete()`。
- 每个已提交 Tile 始终由 `${assetId}:tile:${tileId}` 包装。

- [ ] **步骤 1：更新加载器测试，覆盖必填相机和工作集统计**

为测试文件中的每个 `ICETilesetLoader` 构造传入相机。添加：

```ts
it('uses one removable container per committed partition', async () => {
  const engine = new ICE3({ backend: new FakeRendererBackend() });
  const camera = new ICEPerspectiveCamera({
    id: 'camera',
    fov: 45,
    near: 0.1,
    far: 1000,
    position: [0, 0, 20],
    target: [0, 0, 0],
  });
  const fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith('tileset.json')) {
      return new Response(fixture('tileset.json'));
    }
    return new Response(fixture(`parts/${url.split('/').at(-1)!}`));
  });
  const tileset = await new ICETilesetLoader(engine, { fetch, camera })
    .open('https://example.test/spatial-demo/tileset.json');

  await tileset.whenIdle();
  expect(tileset.scene.children.length).toBe(tileset.stats.resident);
  expect(tileset.scene.children.every((node) => (
    node.id.startsWith('spatial-demo:tile:')
  ))).toBe(true);
});
```

- [ ] **步骤 2：运行 RED**

```bash
npm test -- packages/runtime/tests/TilesetLoader.test.ts -t "removable container"
```

预期：失败，因为单位变换分区当前会作为多个场景根添加，且 `whenIdle` 尚不存在。

- [ ] **步骤 3：重构 Tile 所有权**

实现内部记录：

```ts
interface ICEResidentTile {
  readonly tile: ICETilesetTile;
  readonly container: ICENode;
  readonly bytes: number;
  readonly contentUri: string;
}
```

维护 `resident: Map<string, ICEResidentTile>`，并始终创建使用单位变换或 Tile 变换的容器。将所有 GLB 根移入该容器下。

在释放临时 GLB 句柄前，根据 Tile 唯一几何 TypedArray 计算其字节数。在 `residentBytes` 中跟踪总和。

初始将所有 Tile 状态更新为 `evicted`；调度会将期望但尚未加载的 Tile 改为 `pending`。

- [ ] **步骤 4：添加 `whenIdle`，同时不改变网络行为**

实现包含所等待 ID 的 waiter 记录：

```ts
interface ICEIdleWaiter {
  readonly watchedIds: ReadonlySet<string>;
  readonly resolve: () => void;
}
```

当其监视的 ID 均不处于 pending、loading 或提交队列中时，`whenIdle()` 完成。使无关 ID 排队的相机变化不得延长较早的 waiter。

- [ ] **步骤 5：验证 GREEN**

```bash
npm test -- packages/runtime/tests/TilesetLoader.test.ts
npm run typecheck
npm test
```

预期：引用 `whenComplete` 的测试改为使用 `whenIdle` 后，全部通过。

- [ ] **步骤 6：提交**

```bash
git add packages/runtime/src/asset/ICETilesetLoader.ts \
  packages/runtime/tests/TilesetLoader.test.ts \
  examples/m1/global.d.ts docs/api/m1.md
git commit -m "feat(runtime): track resident tileset containers"
```

---

### 任务 5：相机更新、有界队列和动态卸载

**文件：**
- 修改：`ice3-engine/packages/runtime/src/asset/ICETilesetLoader.ts`
- 修改：`ice3-engine/packages/runtime/tests/TilesetLoader.test.ts`
- 修改：`ice3-engine/docs/diagnostics.md`

**接口：**
- 使用：`ICETilesetScheduler`。
- 产出加载器选项：

```ts
maxConcurrentTiles?: number;
maxResidentTiles?: number;
maxResidentBytes?: number;
prefetchMarginRatio?: number;
unloadMarginRatio?: number;
maxCommitsPerFrame?: number;
```

- [ ] **步骤 1：编写失败的视图变化和卸载测试**

使用包含特定 Tile GLB 和相机姿态的请求响应映射：

```ts
it('unloads a partition after the camera leaves it', async () => {
  const engine = new ICE3({ backend: new FakeRendererBackend() });
  const camera = new ICEPerspectiveCamera({
    id: 'camera',
    fov: 25,
    near: 0.1,
    far: 1000,
    position: [0, 0, 8],
    target: [0, 0, 0],
  });
  const fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith('tileset.json')) {
      return new Response(fixture('tileset.json'));
    }
    return new Response(fixture(`parts/${url.split('/').at(-1)!}`));
  });
  const tileset = await new ICETilesetLoader(engine, {
    fetch,
    camera,
    maxConcurrentTiles: 1,
    maxResidentTiles: 2,
  }).open('https://example.test/spatial-demo/tileset.json');
  await tileset.whenIdle();
  const initialIds = [...tileset.scene.children].map((node) => node.id);

  camera.setTarget([12, 0, 0]).setPosition([12, 0, 8]);
  engine.trigger('AFTER_RENDER');
  await tileset.whenIdle();

  expect([...tileset.scene.children].map((node) => node.id))
    .not.toEqual(initialIds);
  expect(tileset.stats.evicted).toBeGreaterThan(0);
});
```

添加过期空闲测试：

```ts
it('does not extend an older idle wait after the camera changes', async () => {
  const engine = new ICE3({ backend: new FakeRendererBackend() });
  const camera = new ICEPerspectiveCamera({
    id: 'camera',
    fov: 25,
    near: 0.1,
    far: 1000,
    position: [0, 0, 8],
    target: [0, 0, 0],
  });
  const fetch = vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith('tileset.json')) {
      return Promise.resolve(new Response(fixture('tileset.json')));
    }
    return new Promise<Response>(() => {});
  });
  const tileset = await new ICETilesetLoader(engine, {
    fetch,
    camera,
    maxConcurrentTiles: 1,
  }).open('https://example.test/spatial-demo/tileset.json');
  await expect.poll(() => tileset.stats.loading).toBe(1);
  const oldIdle = tileset.whenIdle();

  camera.setTarget([12, 0, 0]).setPosition([12, 0, 8]);
  engine.trigger('AFTER_RENDER');

  await expect(oldIdle).resolves.toBeUndefined();
  tileset.dispose();
});
```

添加可见内容超出预算测试：

```ts
it('keeps all visible tiles when the soft resident budget is exceeded', async () => {
  const engine = new ICE3({ backend: new FakeRendererBackend() });
  const camera = new ICEPerspectiveCamera({
    id: 'camera',
    fov: 60,
    near: 0.1,
    far: 1000,
    position: [6, 0, 20],
    target: [6, 0, 0],
  });
  const diagnostics: string[] = [];
  engine.on<{ code: string }>('DIAGNOSTIC', (event) => {
    if (event.param) diagnostics.push(event.param.code);
  });
  const fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith('tileset.json')) {
      return new Response(fixture('tileset.json'));
    }
    return new Response(fixture(`parts/${url.split('/').at(-1)!}`));
  });
  const tileset = await new ICETilesetLoader(engine, {
    fetch,
    camera,
    maxResidentTiles: 1,
  }).open('https://example.test/spatial-demo/tileset.json');

  await tileset.whenIdle();
  expect(tileset.stats.visible).toBe(4);
  expect(tileset.stats.resident).toBe(4);
  expect(diagnostics).toContain('ICE3_TILESET_RESIDENT_BUDGET_EXCEEDED');
});
```

添加离屏预取失败测试：

```ts
it('keeps an offscreen prefetch failure local to that tile', async () => {
  const engine = new ICE3({ backend: new FakeRendererBackend() });
  const camera = new ICEPerspectiveCamera({
    id: 'camera',
    fov: 25,
    near: 0.1,
    far: 1000,
    position: [0, 0, 8],
    target: [0, 0, 0],
  });
  const fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith('tileset.json')) {
      return new Response(fixture('tileset.json'));
    }
    if (url.endsWith('part-001.glb')) {
      return new Response('unavailable', { status: 500 });
    }
    return new Response(fixture(`parts/${url.split('/').at(-1)!}`));
  });
  const tileset = await new ICETilesetLoader(engine, {
    fetch,
    camera,
    prefetchMarginRatio: 0.5,
  }).open('https://example.test/spatial-demo/tileset.json');

  await tileset.whenIdle();
  expect(tileset.stats.loaded).toBeGreaterThan(0);
  expect(tileset.stats.failed).toBe(1);
  expect(engine.getDiagnostics().lastDiagnostic?.code)
    .toBe('ICE3_TILESET_TILE_FAILED');
});
```

- [ ] **步骤 2：运行 RED**

```bash
npm test -- packages/runtime/tests/TilesetLoader.test.ts \
  -t "leaves it|older idle|resident budget|offscreen prefetch"
```

预期：失败，因为加载仍会消耗原始完整列表，且从不重新评估相机。

- [ ] **步骤 3：集成调度器**

实现：

1. 在构造函数中验证所有调度器选项。
2. 挂接 `AFTER_RENDER`，将一次异步工作集更新排入队列。
3. 计算相机/视口签名；跳过未变化的工作。
4. 将当前驻留字节映射传给 `ICETilesetScheduler.update`。
5. 用调度器排序后的可见/预取 ID 替换请求队列。
6. 当 `budgetExceeded` 时不要将预取 ID 入队，可见 ID 除外。
7. Tile 加载完成之后、提交之前重新检查 `retainIds`。
8. 丢弃过期的已完成候选，处置其临时场景，并清除其 URL 缓存。

- [ ] **步骤 4：实现预算警告**

当实际驻留数量或字节首次超过软预算时，报告一次 `ICE3_TILESET_RESIDENT_BUDGET_EXCEEDED` 警告。不要卸载可见 Tile。当驻留值重新低于两项限制时重置警告标志。

- [ ] **步骤 5：实现每帧一次提交**

维护提交队列并使用以下方式调度：

```ts
requestAnimationFrame(() => {
  this.commitNextTile();
});
```

每帧最多提交 `maxCommitsPerFrame` 个候选。每次提交后调用一次 `engine.requestRender('tileset-tile-committed')`。测试可以使用基于微任务的实现来 stub `requestAnimationFrame`。

- [ ] **步骤 6：实现卸载**

移除容器前，收集所有后代 ID。如果其中任一 ID 与 `engine.getSelection()` 相交，则调用 `engine.setSelection([])`。

然后：

1. 以 `dispose: true` 移除容器。
2. 删除驻留记录。
3. 减去其字节数。
4. 调用 `assetLoader.clear(contentUri)`。
5. 将状态设置为 `evicted`。
6. 发出 `TILESET_TILE_UNLOADED`。
7. 请求一次渲染。

- [ ] **步骤 7：移除 `whenComplete` 并更新文档**

更新 API 文档、包导出、示例和所有测试，改用 `whenIdle()`。将两个新诊断代码添加到 `docs/diagnostics.md`。

- [ ] **步骤 8：验证 GREEN**

```bash
npm test -- packages/runtime/tests/TilesetLoader.test.ts
npm run typecheck
npm test
```

- [ ] **步骤 9：提交**

```bash
git add packages/runtime/src/asset/ICETilesetLoader.ts \
  packages/runtime/tests/TilesetLoader.test.ts docs/diagnostics.md \
  docs/api/m1.md examples/m1/global.d.ts
git commit -m "feat(runtime): schedule and unload visible tiles"
```

---

### 任务 6：工作集 UI 和端到端行为

**文件：**
- 修改：`ice3-engine/examples/m1/main.ts`
- 修改：`ice3-engine/examples/m1/index.html`
- 修改：`ice3-engine/examples/m1/styles.css`
- 修改：`ice3-engine/examples/m1/global.d.ts`
- 修改：`ice3-engine/tests/e2e/m1.spec.ts`

**接口：**
- 使用：工作集 `stats`、`whenReady()`、`whenIdle()` 和 `TILESET_TILE_UNLOADED`。
- 产出 UI 文本：

```text
驻留 3 · 可见 1 · 预取中 1 · 总计 4
```

- [ ] **步骤 1：编写失败的 E2E 工作集测试**

向 `window.__ice3M1` 添加相机姿态测试辅助函数：

```ts
setCameraPose(
  position: readonly [number, number, number],
  target: readonly [number, number, number],
): void;
```

添加：

```ts
test('loads and unloads with the visible work set', async ({ page }) => {
  await page.goto('http://127.0.0.1:8104/');
  await expect(page.locator('[data-role="status"]')).toHaveText('当前视角已就绪');

  await page.evaluate(() => window.__ice3M1.setCameraPose([0, 0, 8], [0, 0, 0]));
  await expect.poll(
    () => page.evaluate(() => window.__ice3M1.tilesetStats().resident),
  ).toBeLessThan(4);
  const firstResident = await page.evaluate(
    () => window.__ice3M1.tilesetStats().resident,
  );

  await page.evaluate(() => window.__ice3M1.setCameraPose([12, 0, 8], [12, 0, 0]));
  await expect.poll(
    () => page.evaluate(() => window.__ice3M1.tilesetStats().evicted),
  ).toBeGreaterThan(0);
  expect(await page.evaluate(
    () => window.__ice3M1.tilesetStats().resident,
  )).toBeGreaterThan(0);
  expect(firstResident).toBeLessThan(4);
});
```

添加一个测试：在焦点位于某个对象上时进行缩放，然后验证移动到另一个区域后其 Selection 已被清除。

- [ ] **步骤 2：运行 RED**

```bash
npm run test:e2e -- --project=chromium -g "visible work set"
```

预期：失败，因为示例仍显示全局完成状态，且没有相机姿态辅助函数。

- [ ] **步骤 3：更新示例**

实现：

1. 进度文本使用 `驻留 / 可见 / 预取中 / 总计`。
2. 在 `whenReady` 后隐藏初始加载遮罩。
3. 使用 `whenIdle()`，状态设为 `当前视角已就绪`。
4. 相机移动时，状态设为 `正在更新当前视角`。
5. 保留部分失败状态。
6. 暴露 `setCameraPose`，用于确定性的浏览器验证。
7. 保留黑色背景、平面颜色、Selection 高亮和信息面板。

- [ ] **步骤 4：验证 GREEN**

```bash
npm run test:e2e -- --project=chromium tests/e2e/m1.spec.ts
npm run typecheck:example
```

- [ ] **步骤 5：提交**

```bash
git add examples/m1 tests/e2e/m1.spec.ts
git commit -m "feat(example): visualize camera-driven tile work sets"
```

---

### 任务 7：完整验证和真实 Asset 量化

**文件：**
- 修改：`ice3-engine/README.md`
- 修改：`ice3-engine/docs/api/m1.md`
- 修改：`ice3-engine/docs/diagnostics.md`
- 修改：`ice3-doc/docs/contracts/asset-preparation-contract-v1.md`

**接口：**
- 使用所有先前任务。
- 产出最终运行时文档和性能证据。

- [ ] **步骤 1：记录调度器**

记录：

- 必填相机。
- 六个选项及其默认值。
- 工作集语义和软预算。
- `whenReady()` 与 `whenIdle()` 的区别。
- 新状态和事件。
- 不再有 `whenComplete()`。
- LOD 仍属于未来工作。

- [ ] **步骤 2：运行仓库完整门禁**

```bash
cd ../ice3-engine
nvm use
npm run verify
npm pack --workspaces --dry-run
```

预期：

- 架构和类型检查通过；
- 所有现有和新增单元测试通过；
- 所有 Chromium 和 WebKit E2E 测试通过；
- 包 dry-run 不包含受控 Asset。

- [ ] **步骤 3：运行受控真实 Asset 工作集测量**

使用以下参数将同一本地真实 Asset 生成到 `/tmp/ice3-scheduler-smoke`：

```bash
--skip-edges --max-triangles 500000 --max-bytes 33554432
```

使用临时页面和公共 ICE3 API。仅记录汇总值：

```text
totalPartitions
overviewVisible
overviewResident
focusedVisible
focusedResident
focusedResidentBytes
afterMoveResident
timeToFirstVisibleContentMs
timeToFocusedIdleMs
```

不要打印模型名称、Node 名称、路径、截图或几何。

预期：

- 总览视图可能保留超过软预算的内容，因为可见完整性优先；
- 聚焦时的驻留数量严格低于总分区数；
- 移开后驻留数量和字节数减少；
- 无页面错误。

- [ ] **步骤 4：清理临时数据并审查仓库**

仅删除 `/tmp/ice3-scheduler-smoke`。

```bash
git status --short --ignored
git ls-files | rg -i '\.(glb|gltf|bin)$'
```

预期：仅跟踪已审查的合成 fixture，且受控 Asset 不出现在 status、index、history 或包内容中。

- [ ] **步骤 5：重新运行最终完整门禁**

```bash
npm run verify
npm pack --workspaces --dry-run
```

- [ ] **步骤 6：提交文档**

```bash
git add README.md docs/api/m1.md docs/diagnostics.md
git commit -m "docs: document adaptive tileset scheduling"

git -C ../ice3-doc \
  add docs/contracts/asset-preparation-contract-v1.md
git -C ../ice3-doc \
  commit -m "docs: define adaptive tileset runtime behavior"
```

- [ ] **步骤 7：合并已验证分支**

确认两个仓库均干净后：

```bash
git switch main
git merge --no-ff feature/adaptive-tileset-scheduler \
  -m "merge: adaptive tileset scheduler"
git branch -d feature/adaptive-tileset-scheduler
```

合并后再次运行 `npm run verify`。

## 执行建议

建议使用原生执行。视锥、调度器决策对象和加载器状态机在许多测试中共享精确 ID 和生命周期条件；连续实施会话可减少接口不匹配。最终完整门禁仍提供独立的回归覆盖。

## 相关文档

- `ICE3-DOC-IDX-001` — [文档索引](../README.md)
- `ICE3-DOC-SPEC-002` — [自适应 Tileset 调度器规范](../specs/2026-10-27-adaptive-tileset-scheduler-design.md)
