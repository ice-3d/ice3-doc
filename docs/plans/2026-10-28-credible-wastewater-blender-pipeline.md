# 高可信度污水处理厂三维资产生成 Implementation Plan

> Document ID: ICE3-DOC-PLAN-012
>
> Status: Implemented
>
> Owner: ICE3 architecture maintainers

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用固定版本的成熟三维建模工具替换手写三角面生成器，生成可用于客户演示的虚构污水厂 GLB，同时保留现有 ICE3 预处理、拆分、LOD、合批和选择链路。

**Architecture:** TypeScript 继续维护设备、工艺、位置和区域数据，并导出稳定的构建 JSON。Blender 5.2.3 无界面 Python 脚本读取 JSON，生成分层几何、材质和语义属性，导出标准 GLB；现有预处理和 Tileset 流水线消费该 GLB。

**Tech Stack:** Node.js 24.22.1 LTS、TypeScript 7、Blender 5.2.3 Python API、glTF 2.0、现有 ICE3 预处理 CLI、Node.js 测试运行器、Playwright、WebGL2

**Spec:** `../specs/2026-10-28-credible-wastewater-blender-pipeline-design.md`

## Global Constraints

- Blender 固定版本为 `5.2.3`；其他版本必须明确失败。
- Blender 仅用于构建期资产生成，不得进入浏览器运行时。
- 源模型目标为 15 万至 30 万三角形，单个设备无意义超过 1 万三角形。
- 细模单块上限暂定 8000 三角形；粗模总预算按设备保真和总览清晰度校准。
- 不依赖纹理、法线贴图、复杂灯光或第三方模型资产。
- 保持黑背景和大平光展示，不通过渲染效果掩盖几何问题。
- 65 个已有设备身份不得丢失；新增设备身份必须唯一且稳定。
- 生成器不得读取客户目录、客户模型、环境中的模型路径或网络资源。
- TypeScript、文档、测试、日志和提交记录不得包含客户信息和禁止名称。
- 不实现 Agent、Prompt 或 AI 专用接口。
- 只在特性分支开发，测试通过后合入 `main`。

## Review Focus

- Blender 缺失或版本不符时必须停止生成并保留旧资产，不能回退到旧几何生成器。
- GLB 导出必须保留每个设备的 `extras.ice3` 语义对象，分区后仍能选择设备。
- 倒角、布尔和几何节点应用后不得产生穿模、悬空构件、退化三角形或错误法线。
- 两次独立构建必须生成字节一致的 GLB；版本、路径和时间信息不得进入结果。
- 高细节资产进入 LOD 和静态合批后不得出现粗模遮挡、重新进入闪烁或不可交互帧率。

---

## File Structure

### 文档仓库

- `docs/specs/2026-10-28-credible-wastewater-blender-pipeline-design.md`
  - 已批准的设计规格。
- `docs/plans/2026-10-28-credible-wastewater-blender-pipeline.md`
  - 本实施计划。

### 工具链仓库

- `tools/wastewater-plant/blender-runtime.ts`
  - 定位 Blender、读取版本并验证受支持版本。
- `tools/wastewater-plant/scene-spec.ts`
  - 将设备、布局和工艺数据序列化为 Blender 输入 JSON。
- `tools/wastewater-plant/blender/generate.py`
  - Blender 场景生成入口，负责调用各建模模块和 GLB 导出。
- `tools/wastewater-plant/blender/geometry.py`
  - 实体盒、圆柱、曲线管道、桁架、楼梯、栏杆和材质等低层构件。
- `tools/wastewater-plant/blender/site.py`
  - 地坪、道路、建筑、围墙、管廊和场地设施。
- `tools/wastewater-plant/blender/equipment.py`
  - 各类设备原型、构件组合和设备语义。
- `tools/wastewater-plant/blender/export.py`
  - 场景清理、单位设置、GLB 导出和导出后自检。
- `tools/wastewater-plant/build-blender-source.ts`
  - 调用场景规格导出、Blender 生成和错误包装。
- `tools/wastewater-plant/finalize-source-glb.ts`
  - 固定 GLB 生成器标识并在验证通过后原子发布。
- `tools/wastewater-plant/build-example.mjs`
  - 改为调用新 source 生成命令，再运行现有预处理流水线。
- `tests/wastewater/blender-runtime.test.ts`
  - Blender 安装与版本校验。
- `tests/wastewater/scene-spec.test.ts`
  - 构建规格的数据完整性。
- `tests/wastewater/blender-source.test.ts`
  - Blender 导出的 GLB 结构、几何、语义和确定性。

### 引擎仓库

- `examples/m1/assets/wastewater-plant/**`
  - 新的 source、prepared、fine、coarse 和 Tileset 资产。
- `tests/e2e/wastewater-plant.spec.ts`
  - 根地址、设备点击、属性浮层、LOD 和网络完整性。

---

### Task 1: Install and Pin Blender

**Files:**
- Create: `tools/wastewater-plant/blender-runtime.ts`
- Test: `tests/wastewater/blender-runtime.test.ts`
- Modify: `README.md`

**Interfaces:**
- Produces:
  - `SUPPORTED_BLENDER_VERSION = '5.2.3'`
  - `resolveBlenderBinary(explicitPath?: string): string`
  - `readBlenderVersion(binary: string): { version: string; major: number; minor: number; patch: number }`
  - `assertSupportedBlender(binary: string): void`

- [ ] **Step 1: Write the failing test**

```ts
import { test } from 'node:test';
import { expect } from '#test-expect';
import {
  assertSupportedBlender,
  readBlenderVersion,
  resolveBlenderBinary,
  SUPPORTED_BLENDER_VERSION,
} from '../../tools/wastewater-plant/blender-runtime.js';

test('uses the pinned Blender installation', () => {
  const binary = resolveBlenderBinary();
  assertSupportedBlender(binary);
  expect(readBlenderVersion(binary).version).toBe(SUPPORTED_BLENDER_VERSION);
});
```

- [ ] **Step 2: Run the focused test to verify RED**

```bash
cd ../ice3-toolchain
source ~/.nvm/nvm.sh && nvm use 24
node scripts/run-tests.mjs tests/wastewater/blender-runtime.test.ts
```

Expected: FAIL because `blender-runtime.ts` does not exist.

- [ ] **Step 3: Install the approved build-time tool**

```bash
brew install --cask blender
/Applications/Blender.app/Contents/MacOS/Blender --version
```

Expected: the installed version is `5.2.3`.

- [ ] **Step 4: Implement version resolution**

```ts
import { execFileSync } from 'node:child_process';
import { accessSync, constants } from 'node:fs';

export const SUPPORTED_BLENDER_VERSION = '5.2.3';

export function resolveBlenderBinary(explicitPath?: string): string {
  const candidate = explicitPath
    ?? process.env.BLENDER_BIN
    ?? '/Applications/Blender.app/Contents/MacOS/Blender';
  accessSync(candidate, constants.X_OK);
  return candidate;
}

export function readBlenderVersion(binary: string): {
  version: string;
  major: number;
  minor: number;
  patch: number;
} {
  const output = execFileSync(binary, ['--version'], { encoding: 'utf8' });
  const match = output.match(/Blender\s+(\d+)\.(\d+)\.(\d+)/);
  if (!match) throw new Error('ICE3_WWTP_BLENDER_VERSION_INVALID');
  const major = Number(match[1]);
  const minor = Number(match[2]);
  const patch = Number(match[3]);
  return { version: `${major}.${minor}.${patch}`, major, minor, patch };
}

export function assertSupportedBlender(binary: string): void {
  const actual = readBlenderVersion(binary).version;
  if (actual !== SUPPORTED_BLENDER_VERSION) {
    throw new Error(
      `ICE3_WWTP_BLENDER_VERSION_INVALID: expected ${SUPPORTED_BLENDER_VERSION}, got ${actual}`,
    );
  }
}
```

- [ ] **Step 5: Run the focused test to verify GREEN**

```bash
node scripts/run-tests.mjs tests/wastewater/blender-runtime.test.ts
```

Expected: `1/1` pass.

- [ ] **Step 6: Document the build prerequisite**

Add to `README.md`:

```markdown
Building the virtual wastewater source GLB requires Blender 5.2.3.
Set `BLENDER_BIN` when it is installed outside the standard macOS path.
```

- [ ] **Step 7: Commit**

```bash
git add README.md tests/wastewater/blender-runtime.test.ts \
  tools/wastewater-plant/blender-runtime.ts
git commit -m "build(toolchain): pin the wastewater model generator"
```

---

### Task 2: Export a Stable Scene Specification

**Files:**
- Create: `tools/wastewater-plant/scene-spec.ts`
- Test: `tests/wastewater/scene-spec.test.ts`
- Modify: `package.json`

**Interfaces:**

```ts
export interface ICEWastewaterSceneSpec {
  readonly schemaVersion: 1;
  readonly assetId: 'ice3-virtual-wwtp';
  readonly units: 'meters';
  readonly equipment: readonly ICEWWTPEquipmentSpec[];
  readonly areas: readonly string[];
  readonly mainFlowTags: readonly string[];
  readonly returnFlows: readonly {
    readonly id: string;
    readonly from: string;
    readonly to: string;
    readonly material: string;
  }[];
}

export function createWastewaterSceneSpec(): ICEWastewaterSceneSpec;
export function writeWastewaterSceneSpec(
  outputPath: string,
): Promise<void>;
```

Consumes:
- `WASTEWATER_EQUIPMENT`
- `AREA_NAMES`
- `MAIN_FLOW_TAGS`
- `RETURN_FLOW_ROUTES`

Produces:
- deterministic build JSON consumed by `blender/generate.py`

- [ ] **Step 1: Write the failing test**

```ts
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { expect } from '#test-expect';
import {
  createWastewaterSceneSpec,
  writeWastewaterSceneSpec,
} from '../../tools/wastewater-plant/scene-spec.js';

test('exports deterministic equipment and process topology', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ice3-wwtp-spec-'));
  const output = join(root, 'scene.json');
  try {
    const spec = createWastewaterSceneSpec();
    expect(spec.schemaVersion).toBe(1);
    expect(spec.assetId).toBe('ice3-virtual-wwtp');
    expect(spec.units).toBe('meters');
    expect(spec.equipment).toHaveLength(65);
    expect(new Set(spec.equipment.map((item) => item.tag)).size).toBe(65);
    expect(spec.mainFlowTags).toContain('UV-101');
    await writeWastewaterSceneSpec(output);
    const text = await readFile(output, 'utf8');
    expect(JSON.parse(text)).toEqual(spec);
    expect(text.endsWith('\n')).toBe(true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2: Run the test to verify RED**

```bash
node scripts/run-tests.mjs tests/wastewater/scene-spec.test.ts
```

Expected: FAIL because `scene-spec.ts` does not exist.

- [ ] **Step 3: Implement deterministic serialization**

```ts
import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { WASTEWATER_EQUIPMENT } from './equipment.js';
import {
  AREA_NAMES,
  MAIN_FLOW_TAGS,
  RETURN_FLOW_ROUTES,
} from './layout.js';
import type { ICEWWTPEquipmentSpec } from './types.js';

export interface ICEWastewaterSceneSpec {
  readonly schemaVersion: 1;
  readonly assetId: 'ice3-virtual-wwtp';
  readonly units: 'meters';
  readonly equipment: readonly ICEWWTPEquipmentSpec[];
  readonly areas: readonly string[];
  readonly mainFlowTags: readonly string[];
  readonly returnFlows: readonly {
    readonly id: string;
    readonly from: string;
    readonly to: string;
    readonly material: string;
  }[];
}

export function createWastewaterSceneSpec(): ICEWastewaterSceneSpec {
  return Object.freeze({
    schemaVersion: 1,
    assetId: 'ice3-virtual-wwtp',
    units: 'meters',
    equipment: WASTEWATER_EQUIPMENT,
    areas: AREA_NAMES,
    mainFlowTags: MAIN_FLOW_TAGS,
    returnFlows: RETURN_FLOW_ROUTES,
  });
}

export async function writeWastewaterSceneSpec(
  outputPath: string,
): Promise<void> {
  const target = resolve(outputPath);
  const temporary = `${target}.tmp`;
  try {
    await mkdir(dirname(target), { recursive: true });
    await writeFile(
      temporary,
      `${JSON.stringify(createWastewaterSceneSpec(), null, 2)}\n`,
    );
    await rename(temporary, target);
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => {});
    throw error;
  }
}
```

Add script:

```json
"generate:wastewater-spec": "node --import tsx tools/wastewater-plant/scene-spec.ts --output"
```

- [ ] **Step 4: Add a CLI entry to `scene-spec.ts`**

```ts
if (process.argv[1]?.endsWith('scene-spec.ts')) {
  const index = process.argv.indexOf('--output');
  const output = process.argv[index + 1];
  if (index < 0 || !output) {
    throw new Error('usage: scene-spec --output <path>');
  }
  await writeWastewaterSceneSpec(output);
}
```

- [ ] **Step 5: Run the focused test and typecheck**

```bash
node scripts/run-tests.mjs tests/wastewater/scene-spec.test.ts
npm run typecheck:tools
```

Expected: both pass.

- [ ] **Step 6: Commit**

```bash
git add package.json tests/wastewater/scene-spec.test.ts \
  tools/wastewater-plant/scene-spec.ts
git commit -m "feat(toolchain): export wastewater build specification"
```

---

### Task 3: Bootstrap the Blender Source Generator

**Files:**
- Create: `tools/wastewater-plant/blender/generate.py`
- Create: `tools/wastewater-plant/blender/export.py`
- Create: `tools/wastewater-plant/build-blender-source.ts`
- Create: `tools/wastewater-plant/finalize-source-glb.ts`
- Test: `tests/wastewater/blender-source.test.ts`

**Interfaces:**

- `build-blender-source.ts` CLI:
  - `--output <glb-path>`
- `generate.py` CLI:
  - `--spec <json-path>`
  - `--output <glb-path>`
- `export.py`:
  - `prepare_scene(asset_id: str) -> bpy.types.Scene`
  - `export_glb(output_path: str) -> None`
- `finalize-source-glb.ts`:
  - `finalizeSourceGlb(inputPath: string, outputPath: string): Promise<void>`

- [ ] **Step 1: Write the failing integration test**

```ts
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { NodeIO } from '@gltf-transform/core';
import { expect } from '#test-expect';
import { spawnSync } from 'node:child_process';

test('exports a valid source GLB with stable equipment roots', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ice3-wwtp-blender-'));
  const output = join(root, 'source.glb');
  try {
    const result = spawnSync(process.execPath, [
      '--import',
      'tsx',
      'tools/wastewater-plant/build-blender-source.ts',
      '--output',
      output,
    ], { encoding: 'utf8' });
    expect(result.status, result.stderr).toBe(0);
    const document = await new NodeIO().read(output);
    expect(document.getRoot().getAsset().generator)
      .toBe('ICE3 authored wastewater pipeline');
    const ids = document.getRoot().listNodes().flatMap((node) => {
      const value = node.getExtras().ice3 as
        | { selectionId?: string } | undefined;
      return value?.selectionId ? [value.selectionId] : [];
    });
    expect(new Set(ids).size).toBe(65);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2: Run the test to verify RED**

```bash
node scripts/run-tests.mjs tests/wastewater/blender-source.test.ts
```

Expected: FAIL because the Blender build entry does not exist.

- [ ] **Step 3: Implement the Node wrapper**

```ts
import { spawnSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  assertSupportedBlender,
  resolveBlenderBinary,
} from './blender-runtime.js';
import { writeWastewaterSceneSpec } from './scene-spec.js';
import { finalizeSourceGlb } from './finalize-source-glb.js';

const outputIndex = process.argv.indexOf('--output');
const output = process.argv[outputIndex + 1];
if (outputIndex < 0 || !output) {
  throw new Error('usage: build-blender-source --output <glb-path>');
}
const root = await mkdtemp(join(tmpdir(), 'ice3-wwtp-build-'));
try {
  const spec = join(root, 'scene.json');
  const raw = join(root, 'source.raw.glb');
  await writeWastewaterSceneSpec(spec);
  const blender = resolveBlenderBinary();
  assertSupportedBlender(blender);
  const result = spawnSync(blender, [
    '--background',
    '--factory-startup',
    '--python-exit-code',
    '1',
    '--python',
    'tools/wastewater-plant/blender/generate.py',
    '--',
    '--spec',
    spec,
    '--output',
    raw,
  ], { stdio: 'inherit' });
  if (result.status !== 0) {
    throw new Error('ICE3_WWTP_BLENDER_GENERATION_FAILED');
  }
  await finalizeSourceGlb(raw, output);
} finally {
  await rm(root, { recursive: true, force: true });
}
```

`finalize-source-glb.ts`:

```ts
import { rename, rm, writeFile } from 'node:fs/promises';
import { NodeIO } from '@gltf-transform/core';

export async function finalizeSourceGlb(
  inputPath: string,
  outputPath: string,
): Promise<void> {
  const document = await new NodeIO().read(inputPath);
  document.getRoot().getAsset().generator =
    'ICE3 authored wastewater pipeline';
  const temporary = `${outputPath}.tmp`;
  try {
    await writeFile(temporary, await new NodeIO().writeBinary(document));
    await rename(temporary, outputPath);
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => {});
    throw error;
  }
}
```

- [ ] **Step 4: Create the minimal Blender exporter**

`export.py`:

```python
import bpy

BLENDER_VERSION = "5.2.3"

def prepare_scene(asset_id: str):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_WORKBENCH"
    scene.unit_settings.system = "METRIC"
    scene.unit_settings.scale_length = 1.0
    scene["ice3.assetId"] = asset_id
    return scene

def export_glb(output_path: str) -> None:
    bpy.ops.export_scene.gltf(
        filepath=output_path,
        export_format="GLB",
        export_apply=True,
        export_extras=True,
        export_yup=True,
        export_cameras=False,
        export_lights=False,
        export_animations=False,
    )
```

`generate.py`:

```python
import argparse
import json
import sys
from pathlib import Path

import bpy

sys.path.insert(0, str(Path(__file__).parent))
from export import export_glb, prepare_scene

parser = argparse.ArgumentParser()
parser.add_argument("--spec", required=True)
parser.add_argument("--output", required=True)
args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:])
spec = json.loads(Path(args.spec).read_text())
blender_version = bpy.app.version_string
if blender_version != "5.2.3":
    raise RuntimeError(
        f"ICE3_WWTP_BLENDER_VERSION_INVALID: {blender_version}"
    )
prepare_scene(spec["assetId"])

for item in spec["equipment"]:
    bpy.ops.mesh.primitive_cube_add(
        size=1,
        location=(item["position"][0], -item["position"][2], item["position"][1]),
    )
    obj = bpy.context.object
    obj.name = item["tag"]
    obj["ice3"] = {
        "selectionId": f'{spec["assetId"]}/equipment/{item["tag"]}',
        "equipmentTag": item["tag"],
        "processStage": item["stage"],
        "displayName": item["name"],
    }

export_glb(args.output)
```

- [ ] **Step 5: Run the focused test**

```bash
node scripts/run-tests.mjs tests/wastewater/blender-source.test.ts
```

Expected: PASS with 65 unique equipment identities.

- [ ] **Step 6: Commit**

```bash
git add tests/wastewater/blender-source.test.ts \
  tools/wastewater-plant/build-blender-source.ts \
  tools/wastewater-plant/finalize-source-glb.ts \
  tools/wastewater-plant/blender/generate.py \
  tools/wastewater-plant/blender/export.py
git commit -m "feat(toolchain): bootstrap authored wastewater source"
```

---

### Task 4: Add Reusable Geometry and Site Construction

**Files:**
- Create: `tools/wastewater-plant/blender/geometry.py`
- Create: `tools/wastewater-plant/blender/site.py`
- Modify: `tools/wastewater-plant/blender/generate.py`
- Test: `tests/wastewater/blender-source.test.ts`

**Interfaces:**

`geometry.py`:

```python
def create_material(name: str, color: str, roughness: float = 0.82)
def add_box(name: str, size: tuple[float, float, float],
            location: tuple[float, float, float],
            bevel: float = 0.04)
def add_cylinder(name: str, radius: float, depth: float,
                 location: tuple[float, float, float],
                 vertices: int = 32, bevel: float = 0.02)
def add_curve_pipe(name: str, points: list[tuple[float, float, float]],
                   radius: float)
def add_railing(name: str, start: tuple[float, float],
                end: tuple[float, float], height: float)
def add_ladder(name: str, x: float, y: float, height: float)
```

`site.py`:

```python
def build_site(asset_id: str) -> bpy.types.Collection
def build_process_pipes(spec: dict) -> bpy.types.Collection
```

- [ ] **Step 1: Extend the failing source test**

```ts
test('creates the complete site envelope and process infrastructure', async () => {
  const result = await buildSourceForTest();
  const document = await new NodeIO().read(result);
  const names = document.getRoot().listNodes().map((node) => node.getName());
  expect(names).toEqual(expect.arrayContaining([
    'Site',
    'RoadNetwork',
    'Buildings',
    'ProcessPipes',
    'Perimeter',
  ]));
  const primitives = document.getRoot().listMeshes()
    .flatMap((mesh) => mesh.listPrimitives());
  expect(primitives.length).toBeGreaterThan(100);
});
```

- [ ] **Step 2: Run RED**

```bash
node scripts/run-tests.mjs tests/wastewater/blender-source.test.ts
```

Expected: FAIL because the site nodes are absent.

- [ ] **Step 3: Implement reusable geometry**

Implement `geometry.py` with actual Blender operations:

```python
import bpy
from mathutils import Vector

def create_material(name, color, roughness=0.82):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1.0)
    mat.roughness = roughness
    return mat

def apply_bevel(obj, width=0.04, segments=2):
    if width <= 0:
        return
    modifier = obj.modifiers.new("Edge Chamfer", "BEVEL")
    modifier.width = width
    modifier.segments = segments
    modifier.limit_method = "ANGLE"
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=modifier.name)

def add_box(name, size, location, bevel=0.04):
    bpy.ops.mesh.primitive_cube_add(size=1, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.scale = (size[0], size[1], size[2])
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    apply_bevel(obj, bevel)
    return obj

def add_curve_pipe(name, points, radius):
    curve = bpy.data.curves.new(name, "CURVE")
    curve.dimensions = "3D"
    curve.bevel_depth = radius
    curve.resolution_u = 8
    spline = curve.splines.new("POLY")
    spline.points.add(len(points) - 1)
    for point, value in zip(spline.points, points):
        point.co = (*value, 1)
    obj = bpy.data.objects.new(name, curve)
    bpy.context.collection.objects.link(obj)
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.convert(target="MESH")
    return bpy.context.object
```

`site.py` uses these helpers to create named collections for ground, roads, perimeter fence, buildings, pipe racks, and process pipes.

- [ ] **Step 4: Implement site layout**

Create:

- Ground slab covering `x=-24..294` and `z=-68..112`.
- Main access road, service road, perimeter road, curbs and markings.
- Fence segments separated by side to prevent scene-wide proxies.
- Headworks, chemical, blower, dewatering and administration buildings.
- Five named building groups with walls, doors, windows, roofs, canopies and roof vents.
- Process pipes following `mainFlowTags` and `returnFlows`, with supports.

- [ ] **Step 5: Run focused test**

```bash
node scripts/run-tests.mjs tests/wastewater/blender-source.test.ts
```

Expected: PASS and the exported GLB contains all site groups.

- [ ] **Step 6: Commit**

```bash
git add tests/wastewater/blender-source.test.ts \
  tools/wastewater-plant/blender/geometry.py \
  tools/wastewater-plant/blender/site.py \
  tools/wastewater-plant/blender/generate.py
git commit -m "feat(toolchain): model wastewater site infrastructure"
```

---

### Task 5: Build Detailed Water-Treatment Equipment

**Files:**
- Create: `tools/wastewater-plant/blender/equipment.py`
- Modify: `tools/wastewater-plant/blender/generate.py`
- Test: `tests/wastewater/blender-source.test.ts`

**Interfaces:**

```python
def build_equipment(item: dict, materials: dict) -> bpy.types.Object
```

Each returned object:
- Uses `item["tag"]` as the object name.
- Stores the complete `ice3` extras object.
- Contains one mesh with multiple material slots.
- Uses sharp/flat shading.

- [ ] **Step 1: Write failing detailed-equipment tests**

```ts
test('models distinct process equipment with presentation-grade detail', async () => {
  const output = await buildSourceForTest();
  const document = await new NodeIO().read(output);
  const nodes = new Map(
    document.getRoot().listNodes().map((node) => [node.getName(), node]),
  );
  const triangleCount = (name: string) => nodes.get(name)?.getMesh()
    ?.listPrimitives().reduce((sum, primitive) => (
      sum + (primitive.getIndices()?.getCount() ?? 0) / 3
    ), 0) ?? 0;
  expect(triangleCount('SC-101')).toBeGreaterThan(1200);
  expect(triangleCount('AE-101')).toBeGreaterThan(900);
  expect(triangleCount('GR-102')).toBeGreaterThan(500);
  expect(triangleCount('BLW-101')).toBeGreaterThan(400);
});
```

- [ ] **Step 2: Run RED**

```bash
node scripts/run-tests.mjs tests/wastewater/blender-source.test.ts
```

Expected: FAIL because equipment objects are still placeholder boxes.

- [ ] **Step 3: Implement water-treatment prototypes**

Implement these builders in `equipment.py`:

- `build_inlet`
- `build_bar_screen`
- `build_pump`
- `build_grit_basin`
- `build_grit_classifier`
- `build_rectangular_clarifier`
- `build_distribution_well`
- `build_biological_reactor`
- `build_circular_clarifier`

Required construction:

- Circular clarifier uses a beveled annular wall, separate center feed well, half-bridge truss, center drive, two scraper arms, effluent launder, weir, scum baffle, outlet pipe and ladder.
- Biological reactor uses three compartments, separated water surfaces, one exposed diffuser cell, center walkway, double-rail perimeter, air headers, valves and diffuser discs.
- Bar screen uses an inclined bar rack, rake assembly, drive, screenings chute and bin.
- Pumps use base rails, volute, motor, coupling guard, suction and discharge piping.

- [ ] **Step 4: Join component meshes by equipment**

Use a helper with this contract:

```python
def join_parts(parts: list[bpy.types.Object], root_name: str) -> bpy.types.Object:
    bpy.ops.object.select_all(action="DESELECT")
    for part in parts:
        part.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.join()
    joined = bpy.context.object
    joined.name = root_name
    return joined
```

Only the joined root receives `ice3` extras.

- [ ] **Step 5: Run focused tests**

```bash
node scripts/run-tests.mjs tests/wastewater/blender-source.test.ts
```

Expected: all detail thresholds and identity checks pass.

- [ ] **Step 6: Commit**

```bash
git add tests/wastewater/blender-source.test.ts \
  tools/wastewater-plant/blender/equipment.py \
  tools/wastewater-plant/blender/generate.py
git commit -m "feat(toolchain): model detailed water-treatment equipment"
```

---

### Task 6: Build Advanced Treatment, Sludge and UV Equipment

**Files:**
- Modify: `tools/wastewater-plant/blender/equipment.py`
- Test: `tests/wastewater/blender-source.test.ts`

**Interfaces:**

Extends `build_equipment(item, materials)` for:

- `coagulation-basin`
- `filter-cell`
- `contact-basin`
- `membrane-basin`
- `chemical-tank`
- `blower`
- `analyzer`
- `sludge-thickener`
- `sludge-dewatering`
- `sludge-dryer`
- `sludge-storage`
- `conveyor`
- `digester`
- `flare`
- `uv`

- [ ] **Step 1: Add failing equipment-family assertions**

```ts
test('models advanced and sludge equipment with recognizable assemblies', async () => {
  const output = await buildSourceForTest();
  const document = await new NodeIO().read(output);
  const names = new Set(
    document.getRoot().listNodes().map((node) => node.getName()),
  );
  for (const name of ['DIG-101', 'DIG-102', 'FLARE-101', 'UV-101',
    'DWG-101', 'FL-101', 'OZ-101']) {
    expect(names.has(name)).toBe(true);
  }
  const total = document.getRoot().listMeshes()
    .flatMap((mesh) => mesh.listPrimitives())
    .reduce((sum, primitive) => (
      sum + (primitive.getIndices()?.getCount() ?? 0) / 3
    ), 0);
  expect(total).toBeGreaterThanOrEqual(150_000);
});
```

- [ ] **Step 2: Run RED**

```bash
node scripts/run-tests.mjs tests/wastewater/blender-source.test.ts
```

Expected: FAIL because the advanced/sludge detail contract is not complete.

- [ ] **Step 3: Implement the remaining prototypes**

Required construction:

- Filter cells: multiple compartments, weirs, troughs, grating walkway and backwash headers.
- Contact basins: serpentine water channels, dividing walls, gates and disinfectant piping.
- Chemical tanks: storage vessel, dome/roof, bund, mixer, dosing pump, valves and risers.
- Blowers: skid, enclosure, intake filter, silencer, motor, flexible connector, check valve and discharge header.
- Dewatering: sludge tank, flocculation tank, mixer, polymer dosing, screw press, spray water and cake conveyor.
- Digestors: large beveled cylinder, gas dome, maintenance ring, gas pipe and ladder.
- Flare: stack, tripod support and gas line.
- UV: open channel, lamp banks, quartz sleeves, wiping frame and control cabinet.

- [ ] **Step 4: Add explicit style by equipment category**

Use distinct dimensions and component layouts:

- Biological tanks are long and compartmented.
- Circular clarifiers are cylindrical with radial bridge structures.
- Chemical devices are vertical vessels inside square bunds.
- Sludge equipment forms a connected process chain rather than standalone boxes.
- UV equipment is a linear channel with repeating lamp banks.

- [ ] **Step 5: Run focused test**

```bash
node scripts/run-tests.mjs tests/wastewater/blender-source.test.ts
```

Expected: PASS with total triangles between 150,000 and 300,000.

- [ ] **Step 6: Commit**

```bash
git add tests/wastewater/blender-source.test.ts \
  tools/wastewater-plant/blender/equipment.py
git commit -m "feat(toolchain): model advanced and sludge treatment equipment"
```

---

### Task 7: Replace the Source Generator and Preserve the Asset Pipeline

**Files:**
- Modify: `tools/wastewater-plant/build-example.mjs`
- Modify: `package.json`
- Delete: `tools/wastewater-plant/assemblies.ts`
- Delete: `tools/wastewater-plant/primitives.ts`
- Delete: `tools/wastewater-plant/scene.ts`
- Delete: `tools/wastewater-plant/generate.ts`
- Delete: `tests/wastewater/primitives.test.ts`
- Modify: `tests/wastewater/pipeline.test.ts`
- Modify: `README.md`

**Interfaces:**

- `npm run build:wastewater-demo` must call:

```text
build-blender-source.ts --output <staging>/source/wastewater-plant.glb
```

- All downstream commands and output paths remain unchanged.

- [ ] **Step 1: Update the integration test first**

Add:

```ts
test('checked-in source is produced by the pinned authored generator', async () => {
  const source = await readFile(
    '../ice3-engine/examples/m1/assets/wastewater-plant/'
      + 'source/wastewater-plant.glb',
  );
  const headerLength = source.readUInt32LE(12);
  const json = JSON.parse(source.subarray(20, 20 + headerLength).toString());
  expect(json.asset.generator).toBe('ICE3 authored wastewater pipeline');
});
```

- [ ] **Step 2: Run RED**

```bash
node scripts/run-tests.mjs tests/wastewater/pipeline.test.ts
```

Expected: FAIL because the checked-in source still reports the previous generator.

- [ ] **Step 3: Confirm the stable generator marker**

`build-blender-source.ts` already invokes `finalizeSourceGlb()` from Task 3.
Verify the generated source reports:

```text
ICE3 authored wastewater pipeline
```

Keep the marker constant shared between the finalizer and its test.

- [ ] **Step 4: Switch build commands**

Change:

```json
"generate:wastewater":
  "node --import tsx tools/wastewater-plant/build-blender-source.ts --output",
"build:wastewater-demo":
  "npm run build && node --import tsx tools/wastewater-plant/build-example.mjs"
```

Change `build-example.mjs` source generation:

```js
run(process.execPath, [
  '--import',
  'tsx',
  join(toolDirectory, 'build-blender-source.ts'),
  '--output',
  source,
]);
```

- [ ] **Step 5: Remove the obsolete mesh authoring implementation**

Delete the old direct geometry files and their no-longer-relevant tests listed above.
Keep `equipment.ts`, `layout.ts`, `types.ts`, `scene-spec.ts`,
`blender-runtime.ts`, `finalize-source-glb.ts`, `verify.ts`, and replacement
tests.

- [ ] **Step 6: Rebuild source and downstream assets**

```bash
npm run build:wastewater-demo
```

Expected:
- New source GLB is generated by the authored pipeline.
- All 65 identities survive source and prepared.
- Fine and coarse outputs contain multiple files.
- Existing asset validator passes.

- [ ] **Step 7: Run toolchain verification**

```bash
npm run verify
```

Expected: all typechecks and tests pass.

- [ ] **Step 8: Commit**

```bash
git add README.md package.json tools/wastewater-plant tests/wastewater
git commit -m "feat(toolchain): switch wastewater assets to authored pipeline"
```

---

### Task 8: Validate Visual Quality and Runtime Integration

**Files:**
- Modify: `ice3-engine/tests/e2e/wastewater-plant.spec.ts` if element positions change
- Modify: `README.md` and the asset specification when implementation values change
- Generated: `ice3-engine/examples/m1/assets/wastewater-plant/**`

**Interfaces:**

- Consumes the source GLB produced by Task 7.
- Produces the final prepared, fine, coarse and Tileset assets.

- [ ] **Step 1: Add fixed-camera visual smoke assertions**

Add tests that:

- Load the default virtual plant.
- Set a total-plant camera pose.
- Assert at least 60 equipment identities are resident after idle.
- Set a close camera pose for `SC-101`.
- Click the projected bridge center and assert the selected ID is exactly
  `ice3-virtual-wwtp/equipment/SC-101`.
- Assert the selection panel is visible and contains a non-empty device name.

- [ ] **Step 2: Run browser tests**

```bash
npx playwright test tests/e2e/wastewater-plant.spec.ts \
  --project=chromium --workers=1 --repeat-each=2
npx playwright test tests/e2e/wastewater-plant.spec.ts \
  --project=webkit --workers=1 --repeat-each=2
```

Expected: all repetitions pass without page errors or failed asset requests.

- [ ] **Step 3: Validate deterministic authored output**

```bash
npm run build:wastewater-demo
shasum -a 256 ../ice3-engine/examples/m1/assets/wastewater-plant/source/wastewater-plant.glb
npm run build:wastewater-demo
shasum -a 256 ../ice3-engine/examples/m1/assets/wastewater-plant/source/wastewater-plant.glb
```

Expected: identical SHA-256 values.

- [ ] **Step 4: Audit generated assets**

```bash
git status --short
git ls-files '*.local.*' '*.preview.*'
find ../ice3-engine/examples/m1/assets -maxdepth 1 \
  -name '.wastewater-plant.staging-*'
```

Expected: no local previews, customer assets or staging directories.

- [ ] **Step 5: Run complete verification**

```bash
cd ../ice3-toolchain
npm run verify
cd ../ice3-engine
npm run verify
```

Expected:
- Toolchain tests all pass.
- Engine unit and integration tests all pass.
- Chromium and WebKit tests all pass.

- [ ] **Step 6: Capture visual review frames**

Generate synthetic-only screenshots at:

- plant overview;
- secondary clarifier close-up;
- biological reactor walkway and diffuser detail;
- sludge dewatering and digester area.

Review for:

- recognizable process zoning;
- no floating or interpenetrating components;
- no disappeared elongated equipment after LOD collapse;
- no large empty terrain dominating the initial camera.

- [ ] **Step 7: Commit generated assets and final documentation**

```bash
git add examples/m1/assets/wastewater-plant tests/e2e/wastewater-plant.spec.ts
git commit -m "feat(example): ship authored wastewater plant assets"
```

- [ ] **Step 8: Merge feature branches**

Review both feature branches from their recorded merge bases. Merge only after
all tests and visual checks pass.

```bash
git switch main
git merge --no-ff feat/blender-wastewater-model
git merge --no-ff feat/blender-wastewater-demo
```

## Related Documents

- `ICE3-DOC-IDX-001` — [Documentation index](../README.md)
- `ICE3-DOC-SPEC-008` — [Wastewater Blender pipeline specification](../specs/2026-10-28-credible-wastewater-blender-pipeline-design.md)
