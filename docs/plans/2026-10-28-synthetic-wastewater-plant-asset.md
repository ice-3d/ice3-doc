# 虚构污水处理厂三维资产 Implementation Plan

> Document ID: ICE3-DOC-PLAN-014
>
> Status: Implemented
>
> Owner: ICE3 architecture maintainers

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 程序化生成一个完全虚构、可确定性重建的市政污水处理厂 GLB，并完成 prepared、空间拆分、LOD 粗模、粗模分块和示例集成。

**Architecture:** 在预处理工具工程中增加独立的 TypeScript 生成器，使用 `@gltf-transform/core` 构建几何、材质、场景层级和设备身份。生成器只产出 source GLB；现有 CLI 负责 prepared GLB、空间拆分、LOD 粗模与粗模分块，浏览器示例只加载处理后的 Tileset。

**Tech Stack:** Node.js 24、TypeScript 7、`@gltf-transform/core` 4.5.1、现有预处理 CLI、Node.js 测试运行器、Playwright、WebGL2

**Spec:** `../specs/2026-10-28-synthetic-wastewater-plant-asset-design.md`

## Global Constraints

- 生成器不得读取、引用、复制或派生任何真实客户模型。
- 不实现 Agent、Prompt、工具调用或 AI 专用接口。
- 生成和格式转换只能发生在离线工具链，不得进入浏览器运行时。
- 设备选择身份、设备编号和显示名称必须稳定且唯一。
- 所有生成资产必须是完全虚构、可公开提交的数据。
- 只生成程序化基础几何、基础色和清晰边线；不引入纹理、动画或复杂物理材质。
- 所有浏览器测试固定拦截本地客户预览探测，测试不得依赖本机客户文件。
- 代码、文档、测试、日志和提交信息不得包含禁止名称或客户信息。
- 使用仓库现有的 Node.js 测试运行器；不得重新引入已移除的测试体系。

## Review Focus

- 生成器意外读取本地客户资产：测试必须证明生成只使用仓库内常量与几何函数。
- 设备在离屏合批或分区后丢失选择身份：测试必须比较 source、prepared 和 Tileset 的语义身份集合。
- 粗模只有部分厂区或无法独立加载：测试必须验证每个粗模分块可读且并在逻辑上覆盖完整主流程。
- 默认示例继续显示旧占位资产或绕过本地预览优先级：浏览器测试必须同时覆盖默认虚拟厂区和本地覆盖分支。
- 相同输入生成不同文件或留下半成品：测试必须比较字节哈希，并验证失败或重建后不存在临时目录。

---

### Task 1: 建立程序化几何基础

**Files:**
- Modify: `ice3-toolchain/package.json`
- Create: `ice3-toolchain/tools/wastewater-plant/tsconfig.json`
- Create: `ice3-toolchain/tools/wastewater-plant/types.ts`
- Create: `ice3-toolchain/tools/wastewater-plant/palette.ts`
- Create: `ice3-toolchain/tools/wastewater-plant/primitives.ts`
- Test: `ice3-toolchain/tests/wastewater/primitives.test.ts`

**Interfaces:**

```ts
interface ICEWWTPMeshData {
  readonly positions: Float32Array;
  readonly normals: Float32Array;
  readonly indices: Uint32Array;
}

function createBox(width: number, height: number, depth: number): ICEWWTPMeshData;
function createCylinder(radius: number, height: number, segments?: number): ICEWWTPMeshData;
function createOpenCylinder(radius: number, height: number, segments?: number): ICEWWTPMeshData;
function createPipeSegment(from: readonly [number, number, number], to: readonly [number, number, number], radius: number): ICEWWTPMeshData;
```

- Consumes: glTF 2.0 triangle conventions and the existing preprocessing subset.
- Produces: finite, indexed triangle geometry used by all later equipment builders.

- [ ] **Step 1: Add the generation dependency and typecheck entry**

Add the fixed build-time dependency and script:

```json
{
  "scripts": {
    "typecheck:tools": "tsc -p tools/wastewater-plant/tsconfig.json --pretty false",
    "verify": "npm run test:architecture && npm run typecheck && npm run typecheck:tools && npm test"
  },
  "devDependencies": {
    "@gltf-transform/core": "4.5.1"
  }
}
```

`tools/wastewater-plant/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "composite": false,
    "declaration": false,
    "declarationMap": false,
    "noEmit": true
  },
  "include": ["**/*.ts"]
}
```

- [ ] **Step 2: Write the failing primitive tests**

```ts
import { test } from 'node:test';
import { expect } from '#test-expect';
import {
  createBox,
  createCylinder,
  createOpenCylinder,
  createPipeSegment,
} from '../../tools/wastewater-plant/primitives.js';

test('creates a finite indexed box with independent face normals', () => {
  const box = createBox(2, 3, 4);
  expect(box.positions).toHaveLength(72);
  expect(box.normals).toHaveLength(72);
  expect(box.indices).toHaveLength(36);
  expect([...box.positions].every(Number.isFinite)).toBe(true);
  expect([...box.normals].every(Number.isFinite)).toBe(true);
});

test('creates closed and open cylindrical walls with stable winding', () => {
  const closed = createCylinder(2, 4, 16);
  const open = createOpenCylinder(2, 4, 16);
  expect(closed.indices.length % 3).toBe(0);
  expect(open.indices.length % 3).toBe(0);
  expect(open.indices.length).toBeLessThan(closed.indices.length);
});

test('creates a pipe segment aligned with two finite endpoints', () => {
  const pipe = createPipeSegment([1, 2, 3], [4, 5, 6], 0.25);
  expect(pipe.positions.length).toBeGreaterThan(0);
  expect([...pipe.positions].every(Number.isFinite)).toBe(true);
  expect([...pipe.indices].every((index) => (
    index >= 0 && index < pipe.positions.length / 3
  ))).toBe(true);
});
```

- [ ] **Step 3: Run the primitive tests and verify RED**

Run:

```bash
cd ../ice3-toolchain
source ~/.nvm/nvm.sh && nvm use 24
npm run test -- tests/wastewater/primitives.test.ts
```

Expected: FAIL because the generator modules do not exist.

- [ ] **Step 4: Implement the geometry contract and palette**

Define the exact palette values in `palette.ts`:

```ts
export const WASTEWATER_PALETTE = Object.freeze({
  concrete: '#a7afb5',
  concreteDark: '#717a82',
  water: '#1f74a8',
  sludge: '#6c6652',
  equipment: '#2d8f91',
  equipmentDark: '#244e5b',
  airPipe: '#8bc7ea',
  waterPipe: '#2479b8',
  sludgePipe: '#8b7651',
  chemicalPipe: '#d7a63b',
  safety: '#f2c94c',
  instrument: '#dce8e9',
  terrain: '#263138',
  road: '#4b555b',
});
```

Implement primitives with these invariants:

- Every position and normal is finite.
- Every index is an unsigned integer within the vertex count.
- Box faces have independent vertices and flat face normals.
- Cylinder segment count is an integer from 8 to 64.
- Open cylinders omit caps and preserve outer wall winding.
- Pipe segments produce a closed cylinder oriented from the first endpoint to the second.
- All arrays are typed arrays and never contain external resources.

- [ ] **Step 5: Run focused and full toolchain tests**

Run:

```bash
npm run typecheck:tools
npm run typecheck
npm run test -- tests/wastewater/primitives.test.ts
npm test
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add package.json tsconfig.json tools/wastewater-plant tests/wastewater/primitives.test.ts
git commit -m "feat(toolchain): add wastewater geometry primitives"
```

---

### Task 2: Build the Full Facility Scene

**Files:**
- Create: `ice3-toolchain/tools/wastewater-plant/equipment.ts`
- Create: `ice3-toolchain/tools/wastewater-plant/layout.ts`
- Create: `ice3-toolchain/tools/wastewater-plant/scene.ts`
- Test: `ice3-toolchain/tests/wastewater/scene.test.ts`

**Interfaces:**

```ts
type ICEWWTPStage =
  | 'intake'
  | 'primary'
  | 'biological'
  | 'secondary'
  | 'advanced'
  | 'sludge'
  | 'chemical'
  | 'utilities';

interface ICEWWTPEquipmentSpec {
  readonly tag: string;
  readonly name: string;
  readonly stage: ICEWWTPStage;
  readonly kind:
    | 'screen' | 'pump' | 'valve' | 'basin'
    | 'clarifier' | 'blower' | 'filter' | 'analyzer';
  readonly position: readonly [number, number, number];
  readonly rotationY?: number;
}

function createWastewaterPlantDocument(): {
  readonly document: Document;
  readonly equipment: readonly ICEWWTPEquipmentSpec[];
};
```

- Consumes: Task 1 geometry and palette.
- Produces: an in-memory glTF document with complete process hierarchy and stable equipment identities.

- [ ] **Step 1: Write failing scene tests**

```ts
import { test } from 'node:test';
import { expect } from '#test-expect';
import { createWastewaterPlantDocument } from
  '../../tools/wastewater-plant/scene.js';

test('builds the complete synthetic treatment facility', () => {
  const { document, equipment } = createWastewaterPlantDocument();
  const scene = document.getRoot().listScenes()[0]!;
  expect(scene.getName()).toBe('SyntheticWastewaterPlant');
  expect(equipment.length).toBeGreaterThanOrEqual(60);
  expect(new Set(equipment.map((item) => item.tag)).size)
    .toBe(equipment.length);
  expect(document.getRoot().listTextures()).toHaveLength(0);
});

test('writes stable semantic identity to every selectable equipment node', () => {
  const { document, equipment } = createWastewaterPlantDocument();
  const selectable = document.getRoot().listNodes()
    .filter((node) => Boolean(node.getExtras().ice3));
  expect(selectable).toHaveLength(equipment.length);
  for (const node of selectable) {
    const identity = node.getExtras().ice3 as Record<string, unknown>;
    expect(identity.selectionId).toBe(
      `ice3-virtual-wwtp/equipment/${identity.equipmentTag}`,
    );
    expect(String(identity.processStage).length).toBeGreaterThan(0);
  }
});

test('covers all primary, auxiliary, and return-flow systems', () => {
  const { equipment } = createWastewaterPlantDocument();
  const tags = new Set(equipment.map((item) => item.tag));
  for (const tag of [
    'IN-001', 'GR-101', 'P-101', 'GR-102', 'GC-101', 'PC-101',
    'DW-101', 'AT-101', 'AX-101', 'AE-101', 'AT-201', 'AX-201',
    'AE-201', 'SC-101', 'SC-201', 'P-RAS-101', 'P-WAS-301',
    'P-LIFT-111', 'CO-101', 'FL-101', 'DT-101', 'AIT-COD-101',
    'FIT-101', 'OUT-101', 'ST-101', 'DWG-101', 'DRY-101',
    'SILO-101', 'PAC-101', 'PAM-101', 'NACLO-101', 'EQ-101',
  ]) {
    expect(tags.has(tag)).toBe(true);
  }
});
```

- [ ] **Step 2: Run scene tests and verify RED**

```bash
npm run test -- tests/wastewater/scene.test.ts
```

Expected: FAIL because the scene builder does not exist.

- [ ] **Step 3: Define the exact equipment inventory**

Create a deterministic inventory with at least these tag families:

```text
IN-001
GR-101, GR-102
P-101, P-102
CV-101
GC-101, GW-101
PC-101
DW-101
EQ-101, P-EQ-101
AT-101, AX-101, AE-101
AT-201, AX-201, AE-201
BLW-101, BLW-102
SC-101, SC-201
P-RAS-101, P-RAS-201, P-WAS-301
P-LIFT-111, P-LIFT-112
CO-101, CL-101
FL-101, P-BW-301, MOV-301
OZ-101, GAC-101, UF-101
DT-101
AIT-COD-101, AIT-NH3-101, AIT-TP-101, AIT-TN-101, AIT-TU-101
FIT-101, V-OUT-101, OUT-101
ST-101, DWG-101, DRY-101, SILO-101, CONV-101, P-SL-101
PAC-101, PAC-102, PAM-101, PAM-102
NACLO-101, NACLO-102, CARBON-101, CARBON-102
ODR-101, ODR-102, FAN-101
```

Each equipment specification uses the exact tag as its stable identity suffix. Place the inventory in fixed groups:

```text
WaterTreatmentArea
  IntakeArea
  PrimaryTreatmentArea
  BiologicalTrainA
  BiologicalTrainB
  SecondaryTreatmentArea
  AdvancedTreatmentArea
  DischargeArea
SludgeTreatmentArea
ChemicalDosingArea
UtilitiesArea
SiteInfrastructure
```

- [ ] **Step 4: Assemble the scene and equipment geometry**

Create one selectable node per equipment specification. Every selectable node must:

- Reference one mesh containing one or more triangle primitives.
- Set a stable name equal to its equipment tag.
- Store extras under `ice3`:

```ts
node.setExtras({
  ice3: {
    selectionId: `ice3-virtual-wwtp/equipment/${spec.tag}`,
    equipmentTag: spec.tag,
    processStage: spec.stage,
    displayName: spec.name,
  },
});
```

Use specialized builders:

- Rectangular process basins have floor, four walls, water surface, walkway, and simplified railing.
- Circular clarifiers have an annular wall, center mechanism, cross bridge, and railing.
- Pumps have base, body, motor, coupling, and one inlet/outlet pipe.
- Screens have frame, parallel bars, motor, and collection trough.
- Blowers and dewatering machines have base, enclosure, motor, and service face.
- Filters and contact tanks have walls, water surface, media bays, and pipe headers.
- Valves have body, actuator, and pipe stubs.
- Analyzers have cabinet, pole, display face, and cable conduit.

Add non-selectable site infrastructure:

- Ground slab.
- Internal roads and safety zones.
- Main water, sludge, air, and chemical pipe runs.
- Control building and utility building.
- Perimeter fencing and a small number of access walkways.

Pipe routes must connect adjacent process stages in the 2D reference flow. Add the 3 return routes:

- Filter backwash to distribution well.
- Sludge thickener supernatant to distribution well.
- Dewatering filtrate to distribution well.

- [ ] **Step 5: Verify scene structure and update architecture test**

Extend `tests/architecture/layout.test.ts` so the GLB generation dependency is a toolchain development dependency and no browser package imports it.

Run:

```bash
npm run typecheck:tools
npm run test -- tests/wastewater/scene.test.ts tests/architecture/layout.test.ts
npm test
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add tools/wastewater-plant tests/wastewater/scene.test.ts tests/architecture/layout.test.ts
git commit -m "feat(toolchain): build virtual wastewater facility"
```

---

### Task 3: Export Source GLB and Prepared Preview

**Files:**
- Create: `ice3-toolchain/tools/wastewater-plant/generate.ts`
- Create: `ice3-toolchain/tools/wastewater-plant/build-example.mjs`
- Create: `ice3-toolchain/tools/wastewater-plant/verify.ts`
- Modify: `ice3-toolchain/package.json`
- Create: `ice3-engine/examples/m1/assets/wastewater-plant/source/wastewater-plant.glb`
- Create: `ice3-engine/examples/m1/assets/wastewater-plant/prepared/wastewater-plant.glb`
- Create: `ice3-engine/examples/m1/assets/wastewater-plant/prepared/wastewater-plant.report.json`
- Test: `ice3-toolchain/tests/wastewater/export.test.ts`

**Interfaces:**

```ts
interface ICEWWTPGenerateOptions {
  readonly outputPath: string;
}

async function generateWastewaterPlant(
  options: ICEWWTPGenerateOptions,
): Promise<{
  readonly bytes: Uint8Array;
  readonly equipmentCount: number;
  readonly sha256: string;
}>;
```

- Consumes: Task 2 scene document.
- Produces: deterministic source GLB and prepared runtime GLB.

- [ ] **Step 1: Write failing deterministic export tests**

```ts
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { expect } from '#test-expect';
import { generateWastewaterPlant } from
  '../../tools/wastewater-plant/generate.js';

test('exports deterministic source GLB bytes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ice3-wwtp-'));
  try {
    const first = join(root, 'first.glb');
    const second = join(root, 'second.glb');
    const firstResult = await generateWastewaterPlant({ outputPath: first });
    const secondResult = await generateWastewaterPlant({ outputPath: second });
    expect(firstResult.sha256).toBe(secondResult.sha256);
    expect(await readFile(first)).toEqual(await readFile(second));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2: Run export tests and verify RED**

```bash
npm run test -- tests/wastewater/export.test.ts
```

Expected: FAIL because the generator entrypoint does not exist.

- [ ] **Step 3: Implement deterministic source export**

Use `NodeIO.writeBinary(document)`, hash the bytes with SHA-256, create the parent directory, and write through a temporary sibling before renaming to the final path.

Expose a CLI entrypoint:

```bash
node --import tsx tools/wastewater-plant/generate.ts \
  --output ../ice3-engine/examples/m1/assets/wastewater-plant/source/wastewater-plant.glb
```

The CLI must reject a missing `--output`, unexpected arguments, empty output paths, and write failures with `ICE3_WWTP_EXPORT_FAILED`.

- [ ] **Step 4: Add the complete example build script**

`build-example.mjs` must:

1. Resolve the sibling `ice3-engine` directory.
2. Create a staging directory under the target asset directory.
3. Generate the source GLB into staging.
4. Run the toolchain build command to create prepared GLB and report.
5. Validate the prepared GLB.
6. Run the splitting pipeline from Task 4 into staging.
7. Validate the finished directory.
8. Replace the previous `wastewater-plant` directory only after all steps pass.

Add scripts:

```json
{
  "generate:wastewater": "node --import tsx tools/wastewater-plant/generate.ts",
  "build:wastewater-demo": "npm run build && node tools/wastewater-plant/build-example.mjs"
}
```

The build command for the preview is:

```bash
node packages/cli/dist/main.js build \
  "$staging/source/wastewater-plant.glb" \
  --output "$staging/prepared/wastewater-plant.glb" \
  --report "$staging/prepared/wastewater-plant.report.json" \
  --budget unrestricted \
  --asset-id ice3-virtual-wwtp
```

- [ ] **Step 5: Generate and verify source/prepared artifacts**

Run:

```bash
npm run build:wastewater-demo
node packages/cli/dist/main.js validate \
  ../ice3-engine/examples/m1/assets/wastewater-plant/prepared/wastewater-plant.glb
```

Expected:

- Source GLB is a standard single-JSON/single-BIN GLB.
- Prepared GLB passes the active asset contract.
- Selection group count is at least 60.
- Source and prepared assets contain no textures or external resources.
- Generated bytes are reproducible.

- [ ] **Step 6: Commit generated source and preview**

In the toolchain repository:

```bash
git add package.json tools/wastewater-plant tests/wastewater/export.test.ts
git commit -m "feat(toolchain): export virtual wastewater assets"
```

In the engine repository:

```bash
git add examples/m1/assets/wastewater-plant/source \
  examples/m1/assets/wastewater-plant/prepared
git commit -m "feat(example): add virtual wastewater models"
```

---

### Task 4: Split the Asset and Generate LOD Content

**Files:**
- Modify: `ice3-toolchain/tools/wastewater-plant/build-example.mjs`
- Create: `ice3-engine/examples/m1/assets/wastewater-plant/tiled/tileset.json`
- Create: `ice3-engine/examples/m1/assets/wastewater-plant/tiled/parts/*.glb`
- Create: `ice3-engine/examples/m1/assets/wastewater-plant/tiled/coarse/*.glb`
- Test: `ice3-toolchain/tests/wastewater/pipeline.test.ts`

**Interfaces:**

```ts
interface ICEWWTPArtifactSummary {
  readonly fineParts: number;
  readonly coarseParts: number;
  readonly selectionIds: readonly string[];
  readonly triangleCount: number;
}

async function inspectWastewaterArtifacts(
  assetRoot: string,
): Promise<ICEWWTPArtifactSummary>;
```

- Consumes: Task 3 source GLB's original geometry. Prepared output contains generated edge primitives and is not a valid second partition input.
- Produces: loadable Tileset with multiple fine partitions and multiple coarse chunks.

- [ ] **Step 1: Write failing artifact tests**

```ts
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { expect } from '#test-expect';
import { inspectWastewaterArtifacts } from
  '../../tools/wastewater-plant/verify.js';

test('produces split fine content and split coarse proxies', async () => {
  const summary = await inspectWastewaterArtifacts(
    '../ice3-engine/examples/m1/assets/wastewater-plant',
  );
  expect(summary.fineParts).toBeGreaterThan(1);
  expect(summary.coarseParts).toBeGreaterThan(1);
  expect(summary.selectionIds.length).toBeGreaterThanOrEqual(60);
  expect(new Set(summary.selectionIds).size)
    .toBe(summary.selectionIds.length);
});

test('writes a valid local Tileset with no external roots', async () => {
  const document = JSON.parse(await readFile(
    '../ice3-engine/examples/m1/assets/wastewater-plant/tiled/tileset.json',
    'utf8',
  )) as Record<string, unknown>;
  expect(document.asset).toMatchObject({ version: '1.1' });
  expect(document.extensionsRequired).toBeUndefined();
  expect(JSON.stringify(document)).not.toContain('http://');
  expect(JSON.stringify(document)).not.toContain('https://');
});
```

- [ ] **Step 2: Run pipeline tests and verify RED**

```bash
npm run test -- tests/wastewater/pipeline.test.ts
```

Expected: FAIL because Tiled artifacts and inspection helper do not exist.

- [ ] **Step 3: Add splitting and LOD generation to the build script**

Run the partition CLI on the validated source GLB after prepared validation:

```bash
node packages/cli/dist/main.js partition \
  "$staging/source/wastewater-plant.glb" \
  --output "$staging/tiled" \
  --asset-id ice3-virtual-wwtp \
  --max-triangles 20000 \
  --max-bytes 4194304 \
  --lod \
  --lod-ratio 0.12 \
  --lod-allocation adaptive \
  --lod-max-triangles 20000 \
  --lod-min-unit-triangles 8 \
  --semantic-proxy auto \
  --render-batch static \
  --coarse-chunk-max-bytes 2097152
```

If measured geometry produces only one fine part or one coarse chunk, lower the relevant byte/triangle threshold until both assertions pass. Do not weaken the tests by accepting a single container.

- [ ] **Step 4: Implement artifact inspection**

`verify.ts` must:

- Parse and validate the Tileset.
- Read every fine and coarse GLB with the existing prepared reader.
- Collect unique semantic selection IDs.
- Reject duplicate selection IDs across visible semantic nodes.
- Confirm all expected equipment tags are present in the prepared hierarchy.
- Reject external HTTP references, missing files, malformed GLBs and empty coarse coverage.

- [ ] **Step 5: Rebuild and verify all generated assets**

Run:

```bash
npm run build:wastewater-demo
npm run test -- tests/wastewater
node packages/cli/dist/main.js validate \
  ../ice3-engine/examples/m1/assets/wastewater-plant/prepared/wastewater-plant.glb
```

Expected:

- At least two fine partitions.
- At least two coarse chunks.
- All generated GLBs and the Tileset validate.
- Fine and coarse assets retain the complete stable identity set.

- [ ] **Step 6: Commit**

In the toolchain repository:

```bash
git add tools/wastewater-plant/build-example.mjs \
  tools/wastewater-plant/verify.ts tests/wastewater/pipeline.test.ts
git commit -m "feat(toolchain): split and simplify virtual wastewater assets"
```

In the engine repository:

```bash
git add examples/m1/assets/wastewater-plant/tiled
git commit -m "feat(example): add virtual wastewater tileset"
```

---

### Task 5: Make the Virtual Plant the Default Example

**Files:**
- Modify: `ice3-engine/examples/m1/main.ts`
- Modify: `ice3-engine/tests/e2e/m1.spec.ts`
- Modify: `ice3-engine/tests/e2e/selection-dpr.spec.ts`
- Create: `ice3-engine/tests/e2e/wastewater-plant.spec.ts`

**Interfaces:**

- Consumes: `/assets/wastewater-plant/tiled/tileset.json`.
- Produces: root URL defaulting to the virtual plant while preserving the same-origin local preview override.

Asset precedence:

```text
explicit ?asset=...
  → available local preview
  → virtual wastewater plant
```

The adaptive demo query continues to select the adaptive fixture.

- [ ] **Step 1: Write failing default-asset browser tests**

```ts
import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route(
    '**/assets/local-preview.local.json',
    (route) => route.fulfill({ status: 404 }),
  );
});

test('loads the virtual wastewater plant from the root URL', async ({ page }) => {
  const errors: string[] = [];
  const assetRequests: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => {
    if (request.url().includes('/assets/wastewater-plant/')) {
      assetRequests.push(request.url());
    }
  });
  await page.goto('http://127.0.0.1:8104/');
  await expect(page.locator('[data-role="status"]'))
    .toHaveText('当前视角已就绪');
  const stats = await page.evaluate(() => window.__ice3M1.assetStats());
  expect(stats.selectionGroupCount).toBeGreaterThanOrEqual(60);
  expect(stats.meshCount).toBeGreaterThan(60);
  expect(assetRequests.length).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test('selects a virtual wastewater device from the default scene', async ({ page }) => {
  await page.goto('http://127.0.0.1:8104/');
  await expect(page.locator('[data-role="status"]'))
    .toHaveText('当前视角已就绪');
  const center = await page.evaluate(() => window.__ice3M1.assetCenter());
  const stage = await page.locator('[data-role="stage"]').boundingBox();
  if (!stage) throw new Error('Stage bounds missing');
  await page.mouse.click(stage.x + center.x, stage.y + center.y);
  await expect.poll(
    () => page.evaluate(() => window.__ice3M1.selectedIds().length),
  ).toBe(1);
  await expect(page.locator('[data-role="selection-info"]')).toBeVisible();
});
```

- [ ] **Step 2: Run the default-asset tests and verify RED**

```bash
cd ../ice3-engine
npx playwright test tests/e2e/wastewater-plant.spec.ts \
  --project=chromium --workers=1
```

Expected: FAIL because the root URL still selects the old fallback.

- [ ] **Step 3: Change the default asset fallback**

Replace the old default fallback with:

```ts
const defaultAssetUrl = adaptiveDemo
  ? '/assets/adaptive-demo/tileset.json'
  : '/assets/wastewater-plant/tiled/tileset.json';
```

Do not change the local-preview probe or explicit `?asset=` behavior.

- [ ] **Step 4: Pin legacy fixture-specific tests**

Tests that intentionally depend on the old hierarchical fixture must navigate with:

```text
http://127.0.0.1:8104/?asset=/assets/hierarchical-demo/tileset.json
```

This includes tests that delay or fail hierarchical part requests and tests that assert the old coarse overview behavior. Tests of generic loading, keyboard control, selection and layout may continue using the virtual plant when their assertions are fixture-independent.

Update the local-override test to use the virtual wastewater Tileset as the override fixture.

- [ ] **Step 5: Run focused and complete browser tests**

```bash
npx playwright test tests/e2e/wastewater-plant.spec.ts \
  --project=chromium --workers=1
npx playwright test --project=chromium --workers=1
npx playwright test --project=webkit --workers=1
```

Expected: PASS with zero page errors, failed requests or missing selection identities.

- [ ] **Step 6: Commit**

```bash
git add examples/m1/main.ts tests/e2e/m1.spec.ts \
  tests/e2e/selection-dpr.spec.ts tests/e2e/wastewater-plant.spec.ts
git commit -m "feat(example): show the virtual wastewater plant"
```

---

### Task 6: Final Verification and Documentation

**Files:**
- Modify: `ice3-toolchain/README.md`
- Modify: `ice3-engine/examples/m1/index.html`
- Modify: `ice3-engine/examples/m1/main.ts`
- Test: existing generator, pipeline, unit and browser suites

**Interfaces:**

- Consumes all previous tasks.
- Produces documented, reproducible and release-ready synthetic demo assets.

- [ ] **Step 1: Update visible demo copy**

Change the example subtitle from the generic tiled asset text to:

```text
虚拟市政污水处理厂
```

Keep status, progress and selection panels unchanged.

- [ ] **Step 2: Document the rebuild command**

Add the exact command to the toolchain README:

```bash
npm run build:wastewater-demo
```

Document that it generates source, prepared, tiled, fine and coarse assets, and that the result is entirely synthetic.

- [ ] **Step 3: Run complete verification**

Toolchain:

```bash
cd ../ice3-toolchain
source ~/.nvm/nvm.sh && nvm use 24
npm run verify
```

Engine:

```bash
cd ../ice3-engine
source ~/.nvm/nvm.sh && nvm use 24
npm run verify
```

Expected: all type checks, unit tests and Chromium/WebKit tests pass.

- [ ] **Step 4: Audit reproducibility and privacy**

Run twice:

```bash
npm run build:wastewater-demo
shasum -a 256 \
  ../ice3-engine/examples/m1/assets/wastewater-plant/source/wastewater-plant.glb
npm run build:wastewater-demo
shasum -a 256 \
  ../ice3-engine/examples/m1/assets/wastewater-plant/source/wastewater-plant.glb
```

Expected: identical SHA-256 values.

Run:

```bash
git status --short
git ls-files '*.local.*' '*.preview.*'
git grep -I -n -i -E "$ICE3_FORBIDDEN_NAME_PATTERN" -- . || true
```

Expected: no local preview files, customer assets, scratch directories, forbidden names, or generated logs in tracked content.

- [ ] **Step 5: Commit final documentation**

In the toolchain repository:

```bash
git add README.md
git commit -m "docs(toolchain): document virtual wastewater generation"
```

In the engine repository:

```bash
git add examples/m1/index.html examples/m1/main.ts
git commit -m "docs(example): describe virtual wastewater scene"
```

---

## Final Acceptance

The implementation is complete only when:

1. `npm run build:wastewater-demo` rebuilds all synthetic artifacts from scratch.
2. Source and prepared GLBs are deterministic and valid.
3. Tiled output contains multiple fine partitions and multiple coarse chunks.
4. Every expected equipment identity survives prepared, partition, LOD and static batching.
5. The root example shows the complete virtual wastewater plant without any local customer asset.
6. Local customer previews still override the synthetic asset only on the local machine.
7. Chromium and WebKit browser tests report no page errors or failed requests.
8. No customer asset or prohibited name enters source, generated assets, documentation, tests or commit history.

## Related Documents

- `ICE3-DOC-IDX-001` — [Documentation index](../README.md)
- `ICE3-DOC-SPEC-010` — [Synthetic wastewater plant specification](../specs/2026-10-28-synthetic-wastewater-plant-asset-design.md)
