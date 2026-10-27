# ICE3 通用场景查询与交互 API 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 提供稳定、去重、可序列化的场景查询、屏幕拾取、世界射线和设备聚焦能力，供任意工具或业务调用。

**Architecture:** 通用查询器遍历当前统一场景，按语义选择身份去重并选择最精细代表节点。引擎暴露只读查询快照；拾取和射线返回同一快照格式；相机控制器只接收查询结果的世界包围盒。

**Tech Stack:** TypeScript 7, Node.js 24 LTS, WebGL2, node-test, Playwright, ICE3 core/runtime

**Spec:** `ice3-doc/docs/superpowers/specs/2026-10-27-lod-refinement-and-scene-api-design.md`

## Global Constraints

- Use Node.js 24 LTS from `.nvmrc`.
- Develop on `feature/lod-refinement`.
- Follow RED-GREEN-REFACTOR.
- Add no runtime dependency.
- API names and documentation contain no Agent- or AI-specific concepts.
- Query results are frozen read-only snapshots.
- Duplicate LOD representations of one selection identity return one result.
- Results are deterministic and sorted by `selectionId`.
- All world coordinates are Y-up meters, matching the Prepared GLB contract.
- Customer assets and derivatives never enter tracked artifacts.

## Review Focus

- Coarse and fine representations of one device coexist during a transition and
  must not appear twice in query results.
- A hidden child with visible ancestors must remain hidden.
- Screen picking and world raycasting must return the same logical device.
- A query during pending LOD work must return only resident nodes.
- Focus on a very small or flat device must choose a finite camera distance.

---

### Task 1: Pure Scene Item Collector

**Files:**
- Create: `ice3-engine/packages/runtime/src/query/ICESceneQuery.ts`
- Create: `ice3-engine/packages/runtime/tests/SceneQuery.test.ts`
- Modify: `ice3-engine/packages/runtime/src/index.ts`

**Interfaces:**

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

- Traverse all `ICEMesh` nodes.
- Group by `selectionId`.
- Choose the deepest representative; ties use lexical `node.id`.
- Compute world bounds from geometry bounds and the node world matrix.
- Apply filters and sort by `selectionId`.

- [ ] **Step 1: Write failing dedupe, visibility, bounds, and limit tests**

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

- [ ] **Step 2: Run RED**

```bash
npx node-test run packages/runtime/tests/SceneQuery.test.ts
```

Expected: FAIL because the query module does not exist.

- [ ] **Step 3: Implement**

- Validate positive integer limits and finite query bounds.
- Compute node world bounds once during traversal.
- A node is visible only when itself and all ancestors are visible.
- Do not mutate scene nodes.
- Freeze each item and the returned array.

- [ ] **Step 4: Verify GREEN**

```bash
npx node-test run packages/runtime/tests/SceneQuery.test.ts
npm run typecheck
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add packages/runtime/src/query/ICESceneQuery.ts \
  packages/runtime/src/index.ts \
  packages/runtime/tests/SceneQuery.test.ts
git commit -m "feat(runtime): collect semantic scene items"
```

---

### Task 2: Public Engine Query API

**Files:**
- Modify: `ice3-engine/packages/runtime/src/ICE3.ts`
- Modify: `ice3-engine/packages/runtime/tests/EngineLifecycle.test.ts`
- Modify: `ice3-engine/docs/api/m1.md`

**Interfaces:**

```ts
engine.queryScene(query?: ICESceneQuery): readonly ICESceneItem[];
engine.findBySelectionId(selectionId: string): ICENode | undefined;
```

- `findBySelectionId` uses the same representative choice as `queryScene`.
- Calls before a scene is configured return an empty query and `undefined`.
- Engine destruction makes further queries throw `ICE3_ENGINE_DESTROYED`.

- [ ] **Step 1: Write failing engine tests**

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

- [ ] **Step 2: Run RED**

```bash
npx node-test run packages/runtime/tests/EngineLifecycle.test.ts
```

Expected: FAIL because the public methods do not exist.

- [ ] **Step 3: Implement and export**

- Reuse `collectSceneItems`.
- `findBySelectionId` returns the node whose `nodeId` matches the selected
  representative.
- Update public package exports.

- [ ] **Step 4: Verify GREEN**

```bash
npx node-test run packages/runtime/tests/EngineLifecycle.test.ts
npm run typecheck
npm test
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add packages/runtime/src/ICE3.ts \
  packages/runtime/tests/EngineLifecycle.test.ts \
  docs/api/m1.md
git commit -m "feat(runtime): expose semantic scene queries"
```

---

### Task 3: Screen Pick Result with Semantic Item

**Files:**
- Modify: `ice3-engine/packages/runtime/src/ICE3.ts`
- Modify: `ice3-engine/packages/runtime/src/query/ICESceneQuery.ts`
- Modify: `ice3-engine/packages/runtime/tests/SelectionGesture.test.ts`
- Modify: `ice3-engine/tests/e2e/m1.spec.ts`

**Interfaces:**

```ts
engine.pickItem(point: ICEScreenPoint): {
  readonly item?: ICESceneItem;
  readonly point?: readonly [number, number, number];
};
```

- Existing `engine.pick()` remains.
- `pickItem()` reuses the GPU exact pick and same semantic representative.
- An empty or error pick returns an empty object.

- [ ] **Step 1: Write failing tests**

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

- [ ] **Step 2: Run RED**

```bash
npx node-test run packages/runtime/tests/SelectionGesture.test.ts
```

Expected: FAIL because `pickItem` does not exist.

- [ ] **Step 3: Implement**

- Reuse `samplePick`.
- Convert the hit node to `ICESceneItem`.
- Keep current selection and highlight behavior unchanged.

- [ ] **Step 4: Verify GREEN**

```bash
npx node-test run packages/runtime/tests/SelectionGesture.test.ts
npm run test:e2e -- --project=chromium tests/e2e/m1.spec.ts
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add packages/runtime/src/ICE3.ts \
  packages/runtime/src/query/ICESceneQuery.ts \
  packages/runtime/tests/SelectionGesture.test.ts \
  tests/e2e/m1.spec.ts
git commit -m "feat(runtime): expose semantic pick results"
```

---

### Task 4: World-Space Raycast

**Files:**
- Create: `ice3-engine/packages/runtime/src/query/ICESceneRaycaster.ts`
- Create: `ice3-engine/packages/runtime/tests/SceneRaycaster.test.ts`
- Modify: `ice3-engine/packages/runtime/src/ICE3.ts`
- Modify: `ice3-engine/packages/runtime/src/index.ts`

**Interfaces:**

```ts
interface ICERay {
  readonly origin: readonly [number, number, number];
  readonly direction: readonly [number, number, number];
  readonly maxDistance?: number;
}

engine.raycast(ray: ICERay): ICESceneItem | undefined;
```

- Normalize direction.
- Transform the ray into mesh local coordinates.
- Test indexed triangles with the smallest positive intersection.
- Respect node/ancestor visibility and max distance.
- Deduplicate the final hit by semantic identity.

- [ ] **Step 1: Write failing ray tests**

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

- [ ] **Step 2: Run RED**

```bash
npx node-test run packages/runtime/tests/SceneRaycaster.test.ts
```

Expected: FAIL because raycasting does not exist.

- [ ] **Step 3: Implement**

- Reuse geometry bounds for initial rejection.
- Use Möller–Trumbore triangle intersection.
- Ignore backface side selection rules; both windings count as geometry hits.
- Choose the nearest valid hit and return the semantic item from Task 1.

- [ ] **Step 4: Verify GREEN**

```bash
npx node-test run packages/runtime/tests/SceneRaycaster.test.ts \
  packages/runtime/tests/SceneQuery.test.ts
npm run typecheck
npm test
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add packages/runtime/src/query/ICESceneRaycaster.ts \
  packages/runtime/src/ICE3.ts \
  packages/runtime/src/index.ts \
  packages/runtime/tests/SceneRaycaster.test.ts
git commit -m "feat(runtime): raycast semantic scene items"
```

---

### Task 5: Generic Camera Focus

**Files:**
- Modify: `ice3-engine/packages/runtime/src/input/ICEOrbitController.ts`
- Modify: `ice3-engine/packages/runtime/tests/OrbitController.test.ts`
- Modify: `ice3-engine/examples/m1/main.ts`
- Modify: `ice3-engine/tests/e2e/m1.spec.ts`

**Interfaces:**

```ts
controller.focus(
  target: Pick<ICESceneItem, 'bounds'>,
  options?: {
    readonly padding?: number;
    readonly animate?: boolean;
  },
): void;
```

- Preserve the current view direction.
- Choose `distance = radius / sin(verticalFov / 2) * padding`.
- Clamp the center for flat or point bounds.
- Default padding is `1.15`.
- Default animate is `true`, unless reduced-motion is active.

- [ ] **Step 1: Write failing focus tests**

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

- [ ] **Step 2: Run RED**

```bash
npx node-test run packages/runtime/tests/OrbitController.test.ts
```

Expected: FAIL because focus does not exist.

- [ ] **Step 3: Implement**

- Operate only on camera transforms.
- Reuse existing render requests and damping lifecycle.
- `animate: false` applies the final pose immediately.
- Confirm an animated focus naturally changes the LOD target.

- [ ] **Step 4: Verify GREEN**

```bash
npx node-test run packages/runtime/tests/OrbitController.test.ts \
  packages/runtime/tests/LodLoader.test.ts
npm run test:e2e -- --project=chromium tests/e2e/m1.spec.ts
npm run test:e2e -- --project=webkit tests/e2e/m1.spec.ts
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add packages/runtime/src/input/ICEOrbitController.ts \
  packages/runtime/tests/OrbitController.test.ts \
  examples/m1/main.ts \
  tests/e2e/m1.spec.ts
git commit -m "feat(runtime): focus scene items"
```

---

### Task 6: API Documentation and Final Verification

**Files:**
- Modify: `ice3-engine/README.md`
- Modify: `ice3-engine/docs/api/m1.md`
- Modify: `ice3-engine/docs/diagnostics.md`
- Modify: `ice3-doc/docs/contracts/asset-preparation-contract-v1.md`

- [ ] **Step 1: Document**

Document:

- query filter and snapshot semantics;
- semantic deduplication across LOD;
- screen pick and world raycast;
- focus behavior and reduced-motion;
- no AI-specific API.

- [ ] **Step 2: Run complete gates**

```bash
cd ../ice3-toolchain
npm run verify

cd ../ice3-engine
npm run verify
npm pack --workspaces --dry-run
```

- [ ] **Step 3: Audit and clean**

- Remove temporary controlled assets and scripts.
- Check Git, tracked binaries, ignored files, package contents, and naming.

- [ ] **Step 4: Commit and merge**

```bash
git add README.md docs/api/m1.md docs/diagnostics.md
git commit -m "docs: document semantic scene queries"

cd ../ice3-doc
git add docs/contracts/asset-preparation-contract-v1.md
git commit -m "docs: define semantic scene query capabilities"
```

Merge both feature branches to `main` after full verification.

## Execution Recommendation

Use Native execution after the LOD refinement plan. Query, pick, raycast, and
focus share one semantic representative rule; implementing them in one focused
session avoids inconsistent device identity.
