# Adaptive Tileset Scheduler Implementation Plan

> Document ID: ICE3-DOC-PLAN-003
>
> Status: Implemented
>
> Owner: ICE3 architecture maintainers

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace eager all-tile loading with a camera-driven resident work set that culls, prefetches, commits, and unloads Tileset partitions under explicit limits.

**Architecture:** A pure core frustum and runtime work-set planner decide which tiles are visible, useful for prefetch, or safe to evict. The Tileset handle owns bounded network and commit queues, keeps every partition under a removable container, and recalculates the work set after camera or viewport changes.

**Tech Stack:** TypeScript 7, Node.js 24.22.1 LTS, WebGL2, Node.js test runner, Playwright, OGC 3D Tiles 1.1, ICE3 core/runtime packages.

**Spec:** `../specs/2026-10-27-adaptive-tileset-scheduler-design.md`

## Global Constraints

- Use Node.js 24.22.1 LTS from `.nvmrc`.
- Develop on `feature/adaptive-tileset-scheduler`; merge to `main` only after the full gate passes.
- Follow RED-GREEN-REFACTOR for every behavior change.
- Do not use competitor, vendor, or third-party product names in code, comments, documentation, tests, diagnostics, or commit messages.
- Do not expose a real customer model or any derived partition in Git, test fixtures, screenshots, logs, or packages.
- Keep the existing OGC 3D Tiles 1.1 format and Prepared GLB content unchanged.
- Camera is required for Tileset scheduling.
- Defaults: 2 concurrent tile requests, 24 resident tiles, 256 MiB resident geometry bytes, 10% prefetch margin, 20% unload margin, 1 committed tile per frame.
- Visible partitions are never omitted to satisfy a residency budget.
- A partition is always represented by one removable scene container, even with identity transform.
- Unloading clears selection if the selected node belongs to the removed partition.
- `whenComplete()` is removed; `whenIdle()` waits for the current work set, not future camera changes.
- LOD, implicit tiling, parent-content refinement, external tilesets, and `region` remain unsupported.
- Do not add runtime dependencies.

## Review Focus

- A visible set larger than `maxResidentTiles` must continue to load completely; budget pressure may warn but must never create undisplayed visible equipment.
- A camera change while tiles are loading or waiting to commit must discard stale queued work without creating orphaned nodes or retaining old cache entries.
- Resizing the viewport changes the frustum aspect and must invalidate the previous work set even when camera position and target are unchanged.
- Unloading the partition containing the selected device must clear selection before disposal so picking and the selection panel cannot reference a disposed node.
- A failed offscreen prefetch must remain a tile-local failure and must not turn the whole Tileset into a fatal error.

---

### Task 1: Core Frustum Bounds Testing

**Files:**
- Create: `ice3-engine/packages/core/src/culling/ICEFrustum.ts`
- Create: `ice3-engine/packages/core/tests/ICEFrustum.test.ts`
- Modify: `ice3-engine/packages/core/src/index.ts`

**Interfaces:**
- Consumes: `ICEMatrix4`, `ICEGeometryBounds`.
- Produces:

```ts
export class ICEFrustum {
  static fromViewProjection(matrix: ICEMatrix4): ICEFrustum;
  intersectsBounds(bounds: ICEGeometryBounds, margin?: number): boolean;
}
```

- [ ] **Step 1: Write failing frustum tests**

Create `packages/core/tests/ICEFrustum.test.ts`:

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

- [ ] **Step 2: Run RED**

```bash
cd ../ice3-engine
nvm use
npm test -- packages/core/tests/ICEFrustum.test.ts
```

Expected: FAIL because `ICEFrustum` does not exist.

- [ ] **Step 3: Implement core frustum extraction**

Implement six normalized planes from view-projection rows:

```text
left   = row4 + row1
right  = row4 - row1
bottom = row4 + row2
top    = row4 - row2
near   = row4 + row3
far    = row4 - row3
```

Use the positive vertex of the AABB for each plane. Return `false` when the
positive vertex is outside by more than `margin`. Validate finite bounds and
reject negative margin.

Export from `packages/core/src/index.ts`.

- [ ] **Step 4: Verify GREEN**

```bash
npm test -- packages/core/tests/ICEFrustum.test.ts
npm test
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/culling/ICEFrustum.ts \
  packages/core/src/index.ts packages/core/tests/ICEFrustum.test.ts
git commit -m "feat(core): add frustum bounds testing"
```

---

### Task 2: Pure Tileset Work-Set Planner

**Files:**
- Create: `ice3-engine/packages/runtime/src/asset/ICETilesetScheduler.ts`
- Create: `ice3-engine/packages/runtime/tests/TilesetScheduler.test.ts`
- Modify: `ice3-engine/packages/runtime/src/index.ts`

**Interfaces:**
- Consumes: `ICEFrustum`, camera, viewport, asset bounds, Tileset tiles, and
  resident tile byte estimates.
- Produces:

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

- [ ] **Step 1: Write failing scheduler tests**

Create a helper that produces tiles on x = 0, 100, 200:

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

- [ ] **Step 2: Run RED**

```bash
npm test -- packages/runtime/tests/TilesetScheduler.test.ts
```

Expected: FAIL because scheduler does not exist.

- [ ] **Step 3: Implement the pure planner**

Implement:

1. Validate all ratios and budgets before use.
2. Calculate scene radius from the diagonal of `assetBounds`.
3. Build frustums with margins
   `sceneRadius * prefetchMarginRatio` and
   `sceneRadius * unloadMarginRatio`.
4. Partition tiles into strict visible, prefetch, and retain sets.
5. Sort visible first and then by center distance to camera position, with tile
   ID tie-break.
6. Combine visible and prefetch for `ordered`.
7. Set `budgetExceeded` when resident count or bytes exceed configured limits.
8. Never remove visible tiles because of that flag.
9. Return immutable arrays and a frozen `retainIds` set wrapper represented as
   a readonly set backed by a new `Set` on every call.

- [ ] **Step 4: Verify GREEN**

```bash
npm test -- packages/runtime/tests/TilesetScheduler.test.ts
npm test
```

- [ ] **Step 5: Commit**

```bash
git add packages/runtime/src/asset/ICETilesetScheduler.ts \
  packages/runtime/src/index.ts packages/runtime/tests/TilesetScheduler.test.ts
git commit -m "feat(runtime): plan camera-driven tile work sets"
```

---

### Task 3: Per-URL Asset Cache Release

**Files:**
- Modify: `ice3-engine/packages/runtime/src/asset/ICEAssetLoader.ts`
- Modify: `ice3-engine/packages/runtime/tests/AssetLoader.test.ts`

**Interfaces:**
- Extends `ICEAssetLoader.clear(url?: string): void`.
- With no argument, preserves current behavior and clears all cached URLs.
- With a URL, removes only that URL and its legacy warning marker.

- [ ] **Step 1: Write the failing cache test**

Append:

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

- [ ] **Step 2: Run RED**

```bash
npm test -- packages/runtime/tests/AssetLoader.test.ts -t "clears one"
```

Expected: FAIL because `clear` ignores the URL argument and fetch is called four
times as each cleared load is distinct.

- [ ] **Step 3: Implement selective clear**

Change `clear` to:

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

- [ ] **Step 4: Verify GREEN and commit**

```bash
npm test -- packages/runtime/tests/AssetLoader.test.ts
npm test
git add packages/runtime/src/asset/ICEAssetLoader.ts \
  packages/runtime/tests/AssetLoader.test.ts
git commit -m "feat(runtime): release individual asset cache entries"
```

---

### Task 4: Camera-Driven Tileset State and Resident Containers

**Files:**
- Modify: `ice3-engine/packages/runtime/src/asset/ICETilesetLoader.ts`
- Modify: `ice3-engine/packages/runtime/tests/TilesetLoader.test.ts`
- Modify: `ice3-engine/examples/m1/global.d.ts`
- Modify: `ice3-engine/docs/api/m1.md`

**Interfaces:**
- `ICETilesetLoaderOptions.camera` becomes required.
- Extends state with `'evicted'`.
- Extends stats with `visible`, `resident`, `residentBytes`, `evicted`.
- Replaces `whenComplete()` with `whenIdle()`.
- Every committed tile is always wrapped by
  `${assetId}:tile:${tileId}`.

- [ ] **Step 1: Update loader tests for required camera and work-set stats**

Give every `ICETilesetLoader` construction in the test file a camera. Add:

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

- [ ] **Step 2: Run RED**

```bash
npm test -- packages/runtime/tests/TilesetLoader.test.ts -t "removable container"
```

Expected: FAIL because identity-transform partitions are currently added as
multiple scene roots and `whenIdle` does not exist.

- [ ] **Step 3: Refactor tile ownership**

Implement an internal record:

```ts
interface ICEResidentTile {
  readonly tile: ICETilesetTile;
  readonly container: ICENode;
  readonly bytes: number;
  readonly contentUri: string;
}
```

Maintain `resident: Map<string, ICEResidentTile>` and always create a container
with identity or tile transform. Move all GLB roots under that container.

Compute a tile's bytes from its unique geometry TypedArrays before releasing the
temporary GLB handle. Track the sum in `residentBytes`.

Update states for all tiles to `evicted` initially; scheduling changes desired
but not loaded tiles to `pending`.

- [ ] **Step 4: Add `whenIdle` without changing network behavior**

Implement waiter records containing the IDs being awaited:

```ts
interface ICEIdleWaiter {
  readonly watchedIds: ReadonlySet<string>;
  readonly resolve: () => void;
}
```

`whenIdle()` resolves when none of its watched IDs is pending, loading, or in the
commit queue. A camera change that queues unrelated IDs must not extend an older
waiter.

- [ ] **Step 5: Verify GREEN**

```bash
npm test -- packages/runtime/tests/TilesetLoader.test.ts
npm run typecheck
npm test
```

Expected: all pass after tests that referenced `whenComplete` use `whenIdle`.

- [ ] **Step 6: Commit**

```bash
git add packages/runtime/src/asset/ICETilesetLoader.ts \
  packages/runtime/tests/TilesetLoader.test.ts \
  examples/m1/global.d.ts docs/api/m1.md
git commit -m "feat(runtime): track resident tileset containers"
```

---

### Task 5: Camera Updates, Bounded Queues, and Dynamic Unload

**Files:**
- Modify: `ice3-engine/packages/runtime/src/asset/ICETilesetLoader.ts`
- Modify: `ice3-engine/packages/runtime/tests/TilesetLoader.test.ts`
- Modify: `ice3-engine/docs/diagnostics.md`

**Interfaces:**
- Consumes: `ICETilesetScheduler`.
- Produces loader options:

```ts
maxConcurrentTiles?: number;
maxResidentTiles?: number;
maxResidentBytes?: number;
prefetchMarginRatio?: number;
unloadMarginRatio?: number;
maxCommitsPerFrame?: number;
```

- [ ] **Step 1: Write failing view-change and unload tests**

Use a request response map with tile-specific GLBs and camera poses:

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

Add the stale-idle test:

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

Add the visible-over-budget test:

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

Add the offscreen-prefetch failure test:

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

- [ ] **Step 2: Run RED**

```bash
npm test -- packages/runtime/tests/TilesetLoader.test.ts \
  -t "leaves it|older idle|resident budget|offscreen prefetch"
```

Expected: FAIL because loading still consumes the original full list and never
re-evaluates the camera.

- [ ] **Step 3: Integrate the scheduler**

Implement:

1. Validate all scheduler options in constructor.
2. Hook `AFTER_RENDER` to queue one asynchronous work-set update.
3. Compute camera/viewport signature; skip unchanged work.
4. Pass current resident byte map to `ICETilesetScheduler.update`.
5. Replace the request queue with the scheduler's ordered visible/prefetch IDs.
6. Do not enqueue prefetch IDs when `budgetExceeded`, except visible IDs.
7. Re-check `retainIds` after a tile load completes and before commit.
8. Discard stale completed candidates, dispose their temporary scene, and clear
   their URL cache.

- [ ] **Step 4: Implement budget warning**

When real resident count or bytes first exceeds a soft budget, report one
`ICE3_TILESET_RESIDENT_BUDGET_EXCEEDED` warning. Do not unload visible tiles.
Reset the warning flag when resident values return below both limits.

- [ ] **Step 5: Implement one-commit-per-frame**

Maintain a commit queue and schedule with:

```ts
requestAnimationFrame(() => {
  this.commitNextTile();
});
```

Commit at most `maxCommitsPerFrame` candidates. After each commit call
`engine.requestRender('tileset-tile-committed')` once. Tests may stub
`requestAnimationFrame` with a microtask-backed implementation.

- [ ] **Step 6: Implement unload**

Before removing a container, collect all descendant IDs. If any intersects
`engine.getSelection()`, call `engine.setSelection([])`.

Then:

1. Remove the container with `dispose: true`.
2. Delete the resident record.
3. Subtract its bytes.
4. Call `assetLoader.clear(contentUri)`.
5. Set state to `evicted`.
6. Emit `TILESET_TILE_UNLOADED`.
7. Request one render.

- [ ] **Step 7: Remove `whenComplete` and update docs**

Update API docs, package exports, the example, and all tests to use
`whenIdle()`. Add the two new diagnostic codes to `docs/diagnostics.md`.

- [ ] **Step 8: Verify GREEN**

```bash
npm test -- packages/runtime/tests/TilesetLoader.test.ts
npm run typecheck
npm test
```

- [ ] **Step 9: Commit**

```bash
git add packages/runtime/src/asset/ICETilesetLoader.ts \
  packages/runtime/tests/TilesetLoader.test.ts docs/diagnostics.md \
  docs/api/m1.md examples/m1/global.d.ts
git commit -m "feat(runtime): schedule and unload visible tiles"
```

---

### Task 6: Work-Set UI and End-to-End Behavior

**Files:**
- Modify: `ice3-engine/examples/m1/main.ts`
- Modify: `ice3-engine/examples/m1/index.html`
- Modify: `ice3-engine/examples/m1/styles.css`
- Modify: `ice3-engine/examples/m1/global.d.ts`
- Modify: `ice3-engine/tests/e2e/m1.spec.ts`

**Interfaces:**
- Consumes: work-set `stats`, `whenReady()`, `whenIdle()`, and
  `TILESET_TILE_UNLOADED`.
- Produces UI text:

```text
驻留 3 · 可见 1 · 预取中 1 · 总计 4
```

- [ ] **Step 1: Write failing E2E work-set tests**

Add a camera-pose test helper to `window.__ice3M1`:

```ts
setCameraPose(
  position: readonly [number, number, number],
  target: readonly [number, number, number],
): void;
```

Add:

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

Add a test that zooms while focus is on an object, then verifies its selection is
cleared after moving to another region.

- [ ] **Step 2: Run RED**

```bash
npm run test:e2e -- --project=chromium -g "visible work set"
```

Expected: FAIL because the example still displays global completion and has no
camera-pose helper.

- [ ] **Step 3: Update the example**

Implement:

1. Progress text uses `驻留 / 可见 / 预取中 / 总计`.
2. Hide the initial loading overlay after `whenReady`.
3. Use `whenIdle()` and status `当前视角已就绪`.
4. On camera movement, status `正在更新当前视角`.
5. Preserve partial failure status.
6. Expose `setCameraPose` for deterministic browser verification.
7. Keep black background, flat color, selection highlight, and info panel.

- [ ] **Step 4: Verify GREEN**

```bash
npm run test:e2e -- --project=chromium tests/e2e/m1.spec.ts
npm run typecheck:example
```

- [ ] **Step 5: Commit**

```bash
git add examples/m1 tests/e2e/m1.spec.ts
git commit -m "feat(example): visualize camera-driven tile work sets"
```

---

### Task 7: Full Verification and Real-Asset Quantification

**Files:**
- Modify: `ice3-engine/README.md`
- Modify: `ice3-engine/docs/api/m1.md`
- Modify: `ice3-engine/docs/diagnostics.md`
- Modify: `ice3-doc/docs/contracts/asset-preparation-contract-v1.md`

**Interfaces:**
- Consumes all prior tasks.
- Produces final runtime documentation and performance evidence.

- [ ] **Step 1: Document the scheduler**

Document:

- Required camera.
- The six options and defaults.
- Working-set semantics and soft budget.
- `whenReady()` versus `whenIdle()`.
- New states and events.
- No `whenComplete()`.
- LOD remains future work.

- [ ] **Step 2: Run full repository gates**

```bash
cd ../ice3-engine
nvm use
npm run verify
npm pack --workspaces --dry-run
```

Expected:

- architecture and type checks pass;
- all existing and new unit tests pass;
- all Chromium and WebKit E2E tests pass;
- package dry-run contains no controlled asset.

- [ ] **Step 3: Run controlled real-asset work-set measurement**

Generate the same local real asset into `/tmp/ice3-scheduler-smoke` with:

```bash
--skip-edges --max-triangles 500000 --max-bytes 33554432
```

Use a temporary page and public ICE3 API. Record aggregate values only:

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

Do not print model names, node names, paths, screenshots, or geometry.

Expected:

- overview may retain more than the soft budget because visible completeness wins;
- focused resident count is strictly below total partitions;
- moving away decreases resident count and bytes;
- no page errors.

- [ ] **Step 4: Clean temporary data and audit the repository**

Delete only `/tmp/ice3-scheduler-smoke`.

```bash
git status --short --ignored
git ls-files | rg -i '\.(glb|gltf|bin)$'
```

Expected: only reviewed synthetic fixtures are tracked and no controlled asset
appears in status, index, history, or package contents.

- [ ] **Step 5: Re-run final full gate**

```bash
npm run verify
npm pack --workspaces --dry-run
```

- [ ] **Step 6: Commit documentation**

```bash
git add README.md docs/api/m1.md docs/diagnostics.md
git commit -m "docs: document adaptive tileset scheduling"

git -C ../ice3-doc \
  add docs/contracts/asset-preparation-contract-v1.md
git -C ../ice3-doc \
  commit -m "docs: define adaptive tileset runtime behavior"
```

- [ ] **Step 7: Merge verified branches**

After confirming both repositories are clean:

```bash
git switch main
git merge --no-ff feature/adaptive-tileset-scheduler \
  -m "merge: adaptive tileset scheduler"
git branch -d feature/adaptive-tileset-scheduler
```

Run `npm run verify` once more after the merge.

## Execution Recommendation

Native execution is recommended. The frustum, scheduler decision object, and
loader state machine share exact IDs and lifecycle conditions across many tests;
one continuous implementation session reduces interface mismatch. The final full
gate still provides independent regression coverage.

## Related Documents

- `ICE3-DOC-IDX-001` — [Documentation index](../README.md)
- `ICE3-DOC-SPEC-002` — [Adaptive Tileset scheduler specification](../specs/2026-10-27-adaptive-tileset-scheduler-design.md)
