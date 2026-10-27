# ICE3 层级 LOD 运行时实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 Tileset 运行时根据屏幕空间误差选择覆盖完整的 LOD 切面，在细模未就绪或失败时保留父粗模，并跨 LOD 保持设备选择。

**Architecture:** 纯选择器从完整 Tileset 树计算目标切面和最近粗模回退。句柄保留当前覆盖切面，分帧准备候选内容，必要替代内容齐备后再移除父粗模。现有视锥、预算、缓存和场景容器继续复用。

**Tech Stack:** TypeScript 7, Node.js 24 LTS, WebGL2, node-test, Playwright, OGC 3D Tiles 1.1, ICE3 core/assets/runtime

**Spec:** `ice3-doc/docs/superpowers/specs/2026-10-27-hierarchical-lod-design.md`

## Global Constraints

- Use Node.js 24 LTS from `.nvmrc`.
- Develop on `feature/hierarchical-lod`; merge to `main` only after the complete gate passes.
- Follow RED-GREEN-REFACTOR for every behavior change.
- Add no runtime dependency.
- Camera and viewport are required for LOD selection.
- Default `maxScreenSpaceErrorPixels` is `16`.
- Visible coverage wins over the soft resident budget.
- Parent coarse content remains until required finer content is resident.
- Coarse and fine scene nodes have unique IDs while sharing stable selection IDs.
- Clear a selection only when no resident content contains that selection ID.
- Do not expose AI-specific behavior; APIs remain general engine capabilities.
- Do not put real customer assets or derived files in Git, fixtures, screenshots, logs, or packages.

## Review Focus

- A parent may be partially visible; replacing it must not create a hole in the visible area.
- A camera change during an in-progress refinement must preserve old coverage and discard stale children.
- A failed child must trigger parent fallback without turning the whole Tileset fatal.
- A selected coarse device must stay selected when the same selection ID moves to fine content.
- Resizing the viewport without moving the camera must recompute SSE and the target cut.

---

### Task 1: Read Complete Hierarchical Tilesets

**Files:**
- Modify: `ice3-engine/packages/assets/src/ICETileset.ts`
- Modify: `ice3-engine/packages/assets/src/ICETilesetReader.ts`
- Modify: `ice3-engine/packages/assets/tests/TilesetReader.test.ts`
- Modify: `ice3-engine/packages/assets/src/index.ts`

**Interfaces:**

```ts
interface ICETilesetSnapshot {
  readonly assetId: string;
  readonly root: ICETilesetTile;
  readonly bounds: ICEGeometryBounds;
  readonly tiles: readonly ICETilesetTile[];
}
```

- `tiles` contains every content-bearing tile, coarse and fine.
- `root` retains the full explicit tree.
- Internal content is accepted.
- Multiple contents, `region`, implicit tiling, external Tilesets, and nonfinite
  errors remain rejected.

- [ ] **Step 1: Replace the rejection test with hierarchy tests**

In `packages/assets/tests/TilesetReader.test.ts`, replace the current
"rejects content on a non-leaf" test with:

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

- [ ] **Step 2: Run RED**

```bash
source "$HOME/.nvm/nvm.sh"
nvm use 24
npx node-test run packages/assets/tests/TilesetReader.test.ts
```

Expected: FAIL because internal content is rejected and `root` is absent.

- [ ] **Step 3: Implement hierarchy parsing**

- Return `root: rootTile` from `readTileset`.
- Keep outputting content-bearing nodes in traversal order.
- Remove the non-leaf content rejection.
- Validate `child.geometricError <= parent.geometricError`.
- Preserve transform composition and relative URI checks.

- [ ] **Step 4: Verify GREEN**

```bash
npx node-test run packages/assets/tests/TilesetReader.test.ts
npm test
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add packages/assets/src/ICETileset.ts \
  packages/assets/src/ICETilesetReader.ts \
  packages/assets/src/index.ts \
  packages/assets/tests/TilesetReader.test.ts
git commit -m "feat(assets): read hierarchical tilesets"
```

---

### Task 2: Pure Screen-Space LOD Selector

**Files:**
- Create: `ice3-engine/packages/runtime/src/asset/ICELodSelector.ts`
- Create: `ice3-engine/packages/runtime/tests/LodSelector.test.ts`
- Modify: `ice3-engine/packages/runtime/src/index.ts`

**Interfaces:**

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

- `fallbackByTargetId` maps a target content tile to its nearest ancestor with
  content.
- The selector is pure and does not know URLs, fetch, scene, or GPU state.

- [ ] **Step 1: Write failing selector tests**

```ts
import { expect, test } from 'node-test';
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

Add tests for:

- changing only viewport width changes the target;
- a zero-error leaf stops refinement;
- a culled subtree is absent;
- an internal tile without content continues to children.

- [ ] **Step 2: Run RED**

```bash
npx node-test run packages/runtime/tests/LodSelector.test.ts
```

Expected: FAIL because `ICELodSelector` does not exist.

- [ ] **Step 3: Implement selection**

```ts
const distance = Math.max(
  input.camera.near,
  distanceToBounds(input.camera.getPosition().toArray(), tile.bounds),
);
const sse = tile.geometricError * input.viewport.height / (
  2 * distance * Math.tan(input.camera.fov * Math.PI / 360)
);
```

Traversal:

1. Reject tiles outside `ICEFrustum`.
2. Stop at a content leaf or when `sse <= threshold`.
3. For an internal node above threshold, recurse into visible children.
4. If an internal node has no content and cannot refine, keep its visible
   content-bearing descendants.
5. Resolve fallback from the nearest content ancestor for each target.

- [ ] **Step 4: Verify GREEN**

```bash
npx node-test run packages/runtime/tests/LodSelector.test.ts
npm run typecheck
npm test
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add packages/runtime/src/asset/ICELodSelector.ts \
  packages/runtime/src/index.ts \
  packages/runtime/tests/LodSelector.test.ts
git commit -m "feat(runtime): select hierarchical lod cuts"
```

---

### Task 3: Add LOD Options, Stats, and Events

**Files:**
- Modify: `ice3-engine/packages/runtime/src/asset/ICETilesetLoader.ts`
- Modify: `ice3-engine/packages/runtime/tests/TilesetLoader.test.ts`
- Modify: `ice3-engine/examples/m1/global.d.ts`

**Interfaces:**

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

Events:

- `TILESET_LOD_CHANGED`
- `TILESET_LOD_FALLBACK`

- [ ] **Step 1: Write failing stats tests**

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

- [ ] **Step 2: Run RED**

```bash
npx node-test run packages/runtime/tests/TilesetLoader.test.ts
```

Expected: FAIL because the option and stats do not exist.

- [ ] **Step 3: Implement stable initial values**

- Default threshold is `16`.
- Initialize LOD stats to zero before the first selection.
- Emit `TILESET_LOD_CHANGED` only when target IDs differ from the previous cut.
- Emit `TILESET_LOD_FALLBACK` once per target tile transition into fallback.
- Include frozen stats in every LOD event.

- [ ] **Step 4: Verify GREEN**

```bash
npx node-test run packages/runtime/tests/TilesetLoader.test.ts
npm run typecheck
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add packages/runtime/src/asset/ICETilesetLoader.ts \
  packages/runtime/tests/TilesetLoader.test.ts \
  examples/m1/global.d.ts
git commit -m "feat(runtime): expose lod selection state"
```

---

### Task 4: Maintain Coverage During LOD Transitions

**Files:**
- Modify: `ice3-engine/packages/runtime/src/asset/ICETilesetLoader.ts`
- Create: `ice3-engine/packages/runtime/tests/LodLoader.test.ts`
- Modify: `ice3-engine/packages/runtime/tests/TilesetLoader.test.ts`

**Interfaces:**

- `ICETilesetHandle` keeps internal `currentCut` and `targetCut` ID sets.
- A target tile with an ancestor fallback does not remove that ancestor until
  all required visible target children are committed.
- Failed target children keep the fallback branch active.

- [ ] **Step 1: Write failing fallback tests**

Use a synthetic hierarchy whose root has coarse content and two child leaves.

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

- [ ] **Step 2: Run RED**

```bash
npx node-test run packages/runtime/tests/LodLoader.test.ts
```

Expected: FAIL because the current loader removes/commits content without a
coverage cut.

- [ ] **Step 3: Implement cut-aware lifecycle**

- Run `ICELodSelector.select()` before building the scheduler work set.
- Give target nodes priority; include required fallback ancestors.
- Mark a subtree as transitioning when any target child is pending.
- Stage candidates without adding duplicate scene IDs.
- Keep current fallback content until all visible target replacement content is
  committed.
- On failure, keep fallback and remove only the failed target from readiness.
- On camera change, discard candidates not retained by the new cut.
- Keep one scene commit per configured frame.
- After the replacement set commits, remove superseded parent content.

- [ ] **Step 4: Verify GREEN**

```bash
npx node-test run packages/runtime/tests/LodLoader.test.ts \
  packages/runtime/tests/TilesetLoader.test.ts
npm run typecheck
npm test
```

Expected: all pass including stale-request and idle tests.

- [ ] **Step 5: Commit**

```bash
git add packages/runtime/src/asset/ICETilesetLoader.ts \
  packages/runtime/tests/LodLoader.test.ts \
  packages/runtime/tests/TilesetLoader.test.ts
git commit -m "feat(runtime): preserve coverage across lod transitions"
```

---

### Task 5: Preserve Selection and Enforce Budgets

**Files:**
- Modify: `ice3-engine/packages/runtime/src/asset/ICETilesetLoader.ts`
- Modify: `ice3-engine/packages/runtime/tests/LodLoader.test.ts`
- Modify: `ice3-engine/packages/runtime/tests/TilesetLoader.test.ts`

**Interfaces:**

- Selection lookup uses `ICEMesh.selectionId`, not scene node IDs.
- Unload clears selection only if no remaining resident content contains the
  selected semantic ID.
- Visible coverage is never removed for budget.

- [ ] **Step 1: Write failing selection and budget tests**

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

- [ ] **Step 2: Run RED**

```bash
npx node-test run packages/runtime/tests/LodLoader.test.ts
```

Expected: FAIL because selection is currently cleared by container unload and
budget handling is not cut-aware.

- [ ] **Step 3: Implement identity-aware unload and budget**

- Collect remaining resident semantic IDs before removing a container.
- Clear selection only when an active ID has no remaining resident match.
- Preserve selected IDs as intent during a staged replacement.
- Prioritize visible coverage before optional detail and prefetch.
- Suppress optional refinement while resident limits are reached.
- Continue to allow visible completeness above the soft budget.

- [ ] **Step 4: Verify GREEN**

```bash
npx node-test run packages/runtime/tests/LodLoader.test.ts \
  packages/runtime/tests/TilesetLoader.test.ts
npm run typecheck
npm test
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add packages/runtime/src/asset/ICETilesetLoader.ts \
  packages/runtime/tests/LodLoader.test.ts \
  packages/runtime/tests/TilesetLoader.test.ts
git commit -m "feat(runtime): preserve lod selection and budgets"
```

---

### Task 6: Hierarchical Browser Example

**Files:**
- Create: `ice3-engine/tests/fixtures/hierarchical-demo/tileset.json`
- Create: `ice3-engine/tests/fixtures/hierarchical-demo/coarse/*.glb`
- Create: `ice3-engine/tests/fixtures/hierarchical-demo/parts/*.glb`
- Modify: `ice3-engine/examples/m1/assets/hierarchical-demo/**`
- Modify: `ice3-engine/examples/m1/main.ts`
- Modify: `ice3-engine/examples/m1/index.html`
- Modify: `ice3-engine/examples/m1/styles.css`
- Modify: `ice3-engine/examples/m1/global.d.ts`
- Modify: `ice3-engine/tests/e2e/m1.spec.ts`

**Interfaces:**

- Example loads a reviewed synthetic hierarchy generated by Task 4 of the asset
  plan.
- Browser bridge exposes `tilesetStats()` with LOD fields and deterministic
  camera poses.
- UI shows target/resident cut counts without exposing internal paths.

- [ ] **Step 1: Write failing E2E tests**

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

- [ ] **Step 2: Run RED**

```bash
npm run test:e2e -- --project=chromium -g "coarse coverage|coarse-to-fine|blank frame"
```

Expected: FAIL because the example has no hierarchy or LOD UI.

- [ ] **Step 3: Generate and wire the synthetic hierarchy**

- Generate the reviewed synthetic fixture with the toolchain using the asset
  plan's `--lod` flow.
- Commit only that synthetic fixture.
- Point M1 at `/assets/hierarchical-demo/tileset.json`.
- Add LOD progress text: target cut, coarse resident, fine resident, fallback.
- Add deterministic focus, overview, selection, and idle helpers.
- Keep black background, flat color, yellow selection, controls, loading, and
  upper-right business panel.

- [ ] **Step 4: Verify GREEN**

```bash
npm run typecheck:example
npm run test:e2e -- --project=chromium tests/e2e/m1.spec.ts
npm run test:e2e -- --project=webkit tests/e2e/m1.spec.ts
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add tests/fixtures/hierarchical-demo examples/m1 tests/e2e/m1.spec.ts
git commit -m "feat(example): demonstrate hierarchical lod"
```

---

### Task 7: Documentation, Real-Asset Validation, and Merge

**Files:**
- Modify: `ice3-engine/README.md`
- Modify: `ice3-engine/docs/api/m1.md`
- Modify: `ice3-engine/docs/diagnostics.md`
- Modify: `ice3-doc/docs/contracts/asset-preparation-contract-v1.md`

- [ ] **Step 1: Document runtime behavior**

Document:

- `maxScreenSpaceErrorPixels`.
- Current/target/fallback cut semantics.
- LOD stats and events.
- Selection identity.
- Parent fallback and failures.
- No runtime simplification.
- No implicit tiling or external Tilesets.

- [ ] **Step 2: Run full gates**

```bash
cd ../ice3-toolchain
source "$HOME/.nvm/nvm.sh"
nvm use 24
npm run verify

cd ../ice3-engine
npm run verify
npm pack --workspaces --dry-run
```

Expected:

- architecture and type checks pass;
- all unit tests pass;
- Chromium and WebKit browser tests pass;
- packages contain no customer or synthetic model fixtures.

- [ ] **Step 3: Measure a controlled real asset**

Generate temporary hierarchical output outside Git with the toolchain LOD flags.
Use a temporary browser page and public API. Record only:

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

Do not print or persist model names, node names, paths, screenshots, or geometry.

- [ ] **Step 4: Audit and clean**

```bash
git status --short --ignored
git ls-files | rg -i '\.(glb|gltf|bin)$'
```

Expected: only reviewed synthetic fixtures are tracked; temporary real-asset
output is removed. Run the project-approved naming audit and record no
findings.

- [ ] **Step 5: Commit docs and merge**

```bash
cd ../ice3-engine
git add README.md docs/api/m1.md docs/diagnostics.md
git commit -m "docs: document hierarchical lod runtime"

cd ../ice3-doc
git add docs/contracts/asset-preparation-contract-v1.md
git commit -m "docs: finalize hierarchical lod contract"
```

After all repositories are clean and fully verified:

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

Run the full engine and toolchain gates once more on `main`. Confirm the naming
audit with the project-approved term list in addition to the product list above.

## Execution Recommendation

Use Native execution after the asset plan is complete. LOD cut calculation,
coverage-preserving transitions, selection identity, and the scheduler share
tight lifecycle invariants; one continuous implementation session reduces
interface mismatch.
