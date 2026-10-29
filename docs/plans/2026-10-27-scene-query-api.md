# ICE3 通用场景查询与交互 API 实施计划

> Document ID: ICE3-DOC-PLAN-008
>
> Status: Implemented
>
> Owner: ICE3 架构维护者

> **面向 Agent 工作执行者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans，逐个任务执行本计划。使用复选框（`- [ ]`）语法跟踪步骤。

**目标：** 提供稳定、去重、可序列化的场景查询、屏幕拾取、世界射线和设备聚焦能力，供任意工具或业务调用。

**架构：** 通用查询器遍历当前统一场景，按语义选择身份去重并选择最精细代表节点。引擎暴露只读查询快照；拾取和射线返回同一快照格式；相机控制器只接收查询结果的世界包围盒。

**技术栈：** TypeScript 7, Node.js 24.22.1 LTS, WebGL2, Node.js test runner, Playwright, ICE3 core/runtime

**规范：** `../specs/2026-10-27-lod-refinement-and-scene-api-design.md`

## 全局约束

- 使用 `.nvmrc` 指定的 Node.js 24.22.1 LTS。
- 在 `feature/lod-refinement` 分支开发。
- 遵循 RED-GREEN-REFACTOR。
- 不添加运行时依赖。
- API 名称和文档不包含 Agent 或 AI 特有的概念。
- 查询结果是冻结的只读快照。
- 同一选择身份的重复 LOD 表示只返回一个结果。
- 结果具有确定性，并按 `selectionId` 排序。
- 所有世界坐标均为 Y 轴向上的米制单位，与 Prepared GLB contract 一致。
- 客户 Asset 及其派生物绝不进入受跟踪的制品。

## 审查重点

- 转换期间，同一设备的粗模和精细表示会同时存在，但不得在查询结果中出现两次。
- 祖先节点可见的隐藏子节点必须保持隐藏。
- 屏幕拾取和世界射线投射必须返回同一逻辑设备。
- LOD 工作尚未完成时执行查询，必须只返回常驻节点。
- 对极小或扁平设备进行聚焦时，必须选择有限的相机距离。

---

### 任务 1：纯场景项收集器

**文件：**
- 创建：`ice3-engine/packages/runtime/src/query/ICESceneQuery.ts`
- 创建：`ice3-engine/packages/runtime/tests/SceneQuery.test.ts`
- 修改：`ice3-engine/packages/runtime/src/index.ts`

**接口：**

```ts
export interface ICESceneQuery {
  readonly ids?: readonly string[];
  readonly selectionIds?: readonly string[];
  readonly bounds?: ICEGeometryBounds;
  readonly visibleOnly?: boolean;
  readonly limit?: number;
}

export interface ICESceneItem {
  readonly nodeId: string;
  readonly selectionId: string;
  readonly name: string;
  readonly typeId: string;
  readonly bounds: ICEGeometryBounds;
  readonly visible: boolean;
}

export function collectSceneItems(
  scene: ICEScene,
  query?: ICESceneQuery,
): readonly ICESceneItem[];
```

- 遍历所有 `ICEMesh` 节点。
- 按 `selectionId` 分组。
- 选择最深的代表节点；若并列，则使用字典序最小的 `node.id`。
- 根据几何包围盒和节点世界矩阵计算世界包围盒。
- 应用过滤条件并按 `selectionId` 排序。

- [ ] **步骤 1：编写会失败的去重、可见性、包围盒和数量限制测试**

```ts
test('returns one logical device for coarse and fine nodes', () => {
  const scene = new ICEScene({ id: 'scene' });
  const geometry = new ICEIndexedGeometry({
    id: 'geometry',
    positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
    indices: new Uint32Array([0, 1, 2]),
  });
  const material = new ICEBasicMaterial({ color: '#fff' });
  const coarse = new ICEMesh({
    id: 'coarse',
    selectionId: 'device-1',
    geometry,
    material,
  });
  const fine = new ICEMesh({
    id: 'fine',
    selectionId: 'device-1',
    geometry,
    material,
  });
  const root = new ICENode({ id: 'root' });
  coarse.addChild(fine);
  root.addChild(coarse);
  scene.addChild(root);

  expect(collectSceneItems(scene)).toHaveLength(1);
});

test('applies visibility, bounds, and deterministic limit', () => {
  const items = collectSceneItems(scene, {
    visibleOnly: true,
    limit: 1,
  });

  expect(items).toHaveLength(1);
  expect(items[0]!.selectionId.localeCompare(
    collectSceneItems(scene)[1]!.selectionId,
  )).toBeLessThan(0);
});
```

- [ ] **步骤 2：运行 RED**

```bash
npm test -- packages/runtime/tests/SceneQuery.test.ts
```

预期：FAIL，因为查询模块尚不存在。

- [ ] **步骤 3：实现**

- 验证数量限制为正整数，且查询包围盒为有限值。
- 遍历时只计算一次节点世界包围盒。
- 仅当节点自身及其所有祖先均可见时，节点才可见。
- 不得修改场景节点。
- 冻结每个项及返回数组。

- [ ] **步骤 4：验证 GREEN**

```bash
npm test -- packages/runtime/tests/SceneQuery.test.ts
npm run typecheck
```

预期：通过。

- [ ] **步骤 5：提交**

```bash
git add packages/runtime/src/query/ICESceneQuery.ts \
  packages/runtime/src/index.ts \
  packages/runtime/tests/SceneQuery.test.ts
git commit -m "feat(runtime): collect semantic scene items"
```

---

### 任务 2：公共引擎查询 API

**文件：**
- 修改：`ice3-engine/packages/runtime/src/ICE3.ts`
- 修改：`ice3-engine/packages/runtime/tests/EngineLifecycle.test.ts`
- 修改：`ice3-engine/docs/api/m1.md`

**接口：**

```ts
engine.queryScene(query?: ICESceneQuery): readonly ICESceneItem[];
engine.findBySelectionId(selectionId: string): ICENode | undefined;
```

- `findBySelectionId` 使用与 `queryScene` 相同的代表节点选择规则。
- 在配置场景之前调用时，查询返回空结果，并返回 `undefined`。
- 引擎销毁后，后续查询会抛出 `ICE3_ENGINE_DESTROYED`。

- [ ] **步骤 1：编写会失败的引擎测试**

```ts
it('queries semantic items without exposing LOD duplicates', () => {
  const fineNode = new ICEMesh({
    id: 'fine',
    selectionId: 'device-1',
    geometry,
    material,
  });
  const coarseNode = new ICEMesh({
    id: 'coarse',
    selectionId: 'device-1',
    geometry,
    material,
  });
  coarseNode.addChild(fineNode);
  const transitionScene = new ICEScene({ id: 'transition' });
  transitionScene.addChild(coarseNode);
  engine.setScene(transitionScene);

  expect(engine.queryScene()).toHaveLength(1);
  expect(engine.findBySelectionId('device-1')).toBe(fineNode);
});

it('returns an empty query before scene configuration', () => {
  expect(engine.queryScene()).toEqual([]);
});
```

- [ ] **步骤 2：运行 RED**

```bash
npm test -- packages/runtime/tests/EngineLifecycle.test.ts
```

预期：FAIL，因为公共方法尚不存在。

- [ ] **步骤 3：实现并导出**

- 复用 `collectSceneItems`。
- `findBySelectionId` 返回 `nodeId` 与选中代表节点匹配的节点。
- 更新公共软件包导出。

- [ ] **步骤 4：验证 GREEN**

```bash
npm test -- packages/runtime/tests/EngineLifecycle.test.ts
npm run typecheck
npm test
```

预期：通过。

- [ ] **步骤 5：提交**

```bash
git add packages/runtime/src/ICE3.ts \
  packages/runtime/tests/EngineLifecycle.test.ts \
  docs/api/m1.md
git commit -m "feat(runtime): expose semantic scene queries"
```

---

### 任务 3：带语义项的屏幕拾取结果

**文件：**
- 修改：`ice3-engine/packages/runtime/src/ICE3.ts`
- 修改：`ice3-engine/packages/runtime/src/query/ICESceneQuery.ts`
- 修改：`ice3-engine/packages/runtime/tests/SelectionGesture.test.ts`
- 修改：`ice3-engine/tests/e2e/m1.spec.ts`

**接口：**

```ts
engine.pickItem(point: ICEScreenPoint): {
  readonly item?: ICESceneItem;
  readonly point?: readonly [number, number, number];
};
```

- 保留现有 `engine.pick()`。
- `pickItem()` 复用 GPU 精确拾取和相同的语义代表节点。
- 空拾取或错误拾取返回空对象。

- [ ] **步骤 1：编写会失败的测试**

```ts
it('returns the logical item from a GPU hit', () => {
  backend.pickResult = 'device-1';
  const result = engine.pickItem({ x: 20, y: 20 });

  expect(result.item?.selectionId).toBe('device-1');
  expect(result.item?.nodeId).toBe('fine');
});

it('returns no item for an empty pick', () => {
  backend.pickResult = undefined;
  expect(engine.pickItem({ x: 20, y: 20 })).toEqual({});
});
```

- [ ] **步骤 2：运行 RED**

```bash
npm test -- packages/runtime/tests/SelectionGesture.test.ts
```

预期：FAIL，因为 `pickItem` 尚不存在。

- [ ] **步骤 3：实现**

- 复用 `samplePick`。
- 将命中的节点转换为 `ICESceneItem`。
- 保持当前选择和高亮行为不变。

- [ ] **步骤 4：验证 GREEN**

```bash
npm test -- packages/runtime/tests/SelectionGesture.test.ts
npm run test:e2e -- --project=chromium tests/e2e/m1.spec.ts
```

预期：通过。

- [ ] **步骤 5：提交**

```bash
git add packages/runtime/src/ICE3.ts \
  packages/runtime/src/query/ICESceneQuery.ts \
  packages/runtime/tests/SelectionGesture.test.ts \
  tests/e2e/m1.spec.ts
git commit -m "feat(runtime): expose semantic pick results"
```

---

### 任务 4：世界空间射线投射

**文件：**
- 创建：`ice3-engine/packages/runtime/src/query/ICESceneRaycaster.ts`
- 创建：`ice3-engine/packages/runtime/tests/SceneRaycaster.test.ts`
- 修改：`ice3-engine/packages/runtime/src/ICE3.ts`
- 修改：`ice3-engine/packages/runtime/src/index.ts`

**接口：**

```ts
interface ICERay {
  readonly origin: readonly [number, number, number];
  readonly direction: readonly [number, number, number];
  readonly maxDistance?: number;
}

engine.raycast(ray: ICERay): ICESceneItem | undefined;
```

- 规范化方向。
- 将射线变换到网格局部坐标。
- 使用最小正交点测试索引三角形。
- 遵守节点及其祖先的可见性以及最大距离。
- 按语义身份对最终命中结果去重。

- [ ] **步骤 1：编写会失败的射线测试**

```ts
it('hits the nearest visible indexed triangle', () => {
  const hit = raycastSceneItems(scene, {
    origin: [0.25, 0.25, 2],
    direction: [0, 0, -1],
    maxDistance: 10,
  });

  expect(hit?.selectionId).toBe('device-near');
});

it('rejects a zero or nonfinite direction', () => {
  expect(() => engine.raycast({
    origin: [0, 0, 0],
    direction: [0, 0, 0],
  })).toThrow(/ICE3_SCENE_QUERY_INVALID/);
});
```

- [ ] **步骤 2：运行 RED**

```bash
npm test -- packages/runtime/tests/SceneRaycaster.test.ts
```

预期：FAIL，因为射线投射尚不存在。

- [ ] **步骤 3：实现**

- 复用几何包围盒进行初步排除。
- 使用 Möller–Trumbore 三角形求交。
- 忽略背面侧选择规则；两种绕序均视为几何命中。
- 选择最近的有效命中，并返回任务 1 中的语义项。

- [ ] **步骤 4：验证 GREEN**

```bash
npm test -- packages/runtime/tests/SceneRaycaster.test.ts \
  packages/runtime/tests/SceneQuery.test.ts
npm run typecheck
npm test
```

预期：通过。

- [ ] **步骤 5：提交**

```bash
git add packages/runtime/src/query/ICESceneRaycaster.ts \
  packages/runtime/src/ICE3.ts \
  packages/runtime/src/index.ts \
  packages/runtime/tests/SceneRaycaster.test.ts
git commit -m "feat(runtime): raycast semantic scene items"
```

---

### 任务 5：通用相机聚焦

**文件：**
- 修改：`ice3-engine/packages/runtime/src/input/ICEOrbitController.ts`
- 修改：`ice3-engine/packages/runtime/tests/OrbitController.test.ts`
- 修改：`ice3-engine/examples/m1/main.ts`
- 修改：`ice3-engine/tests/e2e/m1.spec.ts`

**接口：**

```ts
controller.focus(
  target: Pick<ICESceneItem, 'bounds'>,
  options?: {
    readonly padding?: number;
    readonly animate?: boolean;
  },
): void;
```

- 保留当前视图方向。
- 选择 `distance = radius / sin(verticalFov / 2) * padding`。
- 对扁平或点包围盒的中心进行钳制。
- 默认 padding 为 `1.15`。
- 除非启用了减少动态效果，否则默认 animate 为 `true`。

- [ ] **步骤 1：编写会失败的聚焦测试**

```ts
it('focuses item bounds while preserving direction', () => {
  const controller = new ICEOrbitController(engine, camera).start();
  const before = direction(camera);

  controller.focus({
    bounds: { min: [-1, -1, -1], max: [1, 1, 1] },
  });

  expect(camera.getTarget().toArray()).toEqual([0, 0, 0]);
  expect(direction(camera)).toEqual(before);
  expect(distance(camera)).toBeGreaterThan(2);
});

test('focus ignores invalid padding', () => {
  expect(() => controller.focus({
    bounds: { min: [0, 0, 0], max: [0, 0, 0] },
  }, { padding: 0 })).toThrow(/ICE3_CAMERA_FOCUS_INVALID/);
});
```

- [ ] **步骤 2：运行 RED**

```bash
npm test -- packages/runtime/tests/OrbitController.test.ts
```

预期：FAIL，因为聚焦尚不存在。

- [ ] **步骤 3：实现**

- 仅操作相机变换。
- 复用现有渲染请求和阻尼生命周期。
- `animate: false` 会立即应用最终姿态。
- 确认动画聚焦会自然改变 LOD 目标。

- [ ] **步骤 4：验证 GREEN**

```bash
npm test -- packages/runtime/tests/OrbitController.test.ts \
  packages/runtime/tests/LodLoader.test.ts
npm run test:e2e -- --project=chromium tests/e2e/m1.spec.ts
npm run test:e2e -- --project=webkit tests/e2e/m1.spec.ts
```

预期：通过。

- [ ] **步骤 5：提交**

```bash
git add packages/runtime/src/input/ICEOrbitController.ts \
  packages/runtime/tests/OrbitController.test.ts \
  examples/m1/main.ts \
  tests/e2e/m1.spec.ts
git commit -m "feat(runtime): focus scene items"
```

---

### 任务 6：API 文档与最终验证

**文件：**
- 修改：`ice3-engine/README.md`
- 修改：`ice3-engine/docs/api/m1.md`
- 修改：`ice3-engine/docs/diagnostics.md`
- 修改：`ice3-doc/docs/contracts/asset-preparation-contract-v1.md`

- [ ] **步骤 1：编写文档**

记录：

- 查询过滤器和快照语义；
- 跨 LOD 的语义去重；
- 屏幕拾取和世界射线投射；
- 聚焦行为与减少动态效果；
- 不包含 AI 特有的 API。

- [ ] **步骤 2：运行完整门禁**

```bash
cd ../ice3-toolchain
npm run verify

cd ../ice3-engine
npm run verify
npm pack --workspaces --dry-run
```

- [ ] **步骤 3：审查和清理**

- 删除临时受控 Asset 和脚本。
- 检查 Git、受跟踪的二进制文件、忽略文件、软件包内容和命名。

- [ ] **步骤 4：提交并合并**

```bash
git add README.md docs/api/m1.md docs/diagnostics.md
git commit -m "docs: document semantic scene queries"

cd ../ice3-doc
git add docs/contracts/asset-preparation-contract-v1.md
git commit -m "docs: define semantic scene query capabilities"
```

完整验证通过后，将两个功能分支合入 `main`。

## 执行建议

在 LOD 精炼计划之后使用 Native 执行。查询、拾取、射线投射和聚焦共享
同一语义代表节点规则；在一个集中会话中实现它们，可避免设备身份不一致。

## 相关文档

- `ICE3-DOC-IDX-001` — [文档索引](../README.md)
- `ICE3-DOC-SPEC-005` — [LOD 精炼与场景 API 规范](../specs/2026-10-27-lod-refinement-and-scene-api-design.md)
