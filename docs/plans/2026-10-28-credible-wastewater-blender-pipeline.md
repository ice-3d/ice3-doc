# 高可信度污水处理厂三维资产生成实施计划

> Document ID: ICE3-DOC-PLAN-012
>
> Status: Implemented
>
> Owner: ICE3 架构维护者

> **供智能代理工作者使用：** 需要使用子技能：`superpowers:subagent-driven-development`（推荐）或逐项执行本计划的 `superpowers:executing-plans`。步骤使用复选框（`- [ ]`）跟踪。

**目标：** 用固定版本的成熟三维建模工具替换手写三角面生成器，生成可用于客户演示的虚构污水厂 GLB，同时保留现有 ICE3 预处理、拆分、LOD、合批和选择链路。

**架构：** TypeScript 继续维护设备、工艺、位置和区域数据，并导出稳定的构建 JSON。Blender 5.2.3 无界面 Python 脚本读取 JSON，生成分层几何、材质和语义属性，导出标准 GLB；现有预处理和 Tileset 流水线消费该 GLB。

**技术栈：** Node.js 24.22.1 LTS、TypeScript 7、Blender 5.2.3 Python API、glTF 2.0、现有 ICE3 预处理 CLI、Node.js 测试运行器、Playwright、WebGL2

**规格：** `../specs/2026-10-28-credible-wastewater-blender-pipeline-design.md`

## 全局约束

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

## 审查重点

- Blender 缺失或版本不符时必须停止生成并保留旧资产，不能回退到旧几何生成器。
- GLB 导出必须保留每个设备的 `extras.ice3` 语义对象，分区后仍能选择设备。
- 倒角、布尔和几何节点应用后不得产生穿模、悬空构件、退化三角形或错误法线。
- 两次独立构建必须生成字节一致的 GLB；版本、路径和时间信息不得进入结果。
- 高细节资产进入 LOD 和静态合批后不得出现粗模遮挡、重新进入闪烁或不可交互帧率。

---

## 文件结构

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

### 任务 1：安装并固定 Blender 版本

**文件：**
- 创建：`tools/wastewater-plant/blender-runtime.ts`
- 测试：`tests/wastewater/blender-runtime.test.ts`
- 修改：`README.md`

**接口：**
- 产出：
  - `SUPPORTED_BLENDER_VERSION = '5.2.3'`
  - `resolveBlenderBinary(explicitPath?: string): string`
  - `readBlenderVersion(binary: string): { version: string; major: number; minor: number; patch: number }`
  - `assertSupportedBlender(binary: string): void`

- [ ] **步骤 1：编写失败的测试**

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

- [ ] **步骤 2：运行聚焦测试并验证 RED**

```bash
cd ../ice3-toolchain
source ~/.nvm/nvm.sh && nvm use 24
node scripts/run-tests.mjs tests/wastewater/blender-runtime.test.ts
```

预期：FAIL，因为 `blender-runtime.ts` 不存在。

- [ ] **步骤 3：安装经批准的构建时工具**

```bash
brew install --cask blender
/Applications/Blender.app/Contents/MacOS/Blender --version
```

预期：安装的版本为 `5.2.3`。

- [ ] **步骤 4：实现版本解析**

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

- [ ] **步骤 5：运行聚焦测试并验证 GREEN**

```bash
node scripts/run-tests.mjs tests/wastewater/blender-runtime.test.ts
```

预期：`1/1` 通过。

- [ ] **步骤 6：记录构建先决条件**

添加到 `README.md`：

```markdown
Building the virtual wastewater source GLB requires Blender 5.2.3.
Set `BLENDER_BIN` when it is installed outside the standard macOS path.
```

- [ ] **步骤 7：提交**

```bash
git add README.md tests/wastewater/blender-runtime.test.ts \
  tools/wastewater-plant/blender-runtime.ts
git commit -m "build(toolchain): pin the wastewater model generator"
```

---

### 任务 2：导出稳定的场景规格

**文件：**
- 创建：`tools/wastewater-plant/scene-spec.ts`
- 测试：`tests/wastewater/scene-spec.test.ts`
- 修改：`package.json`

**接口：**

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

消费：
- `WASTEWATER_EQUIPMENT`
- `AREA_NAMES`
- `MAIN_FLOW_TAGS`
- `RETURN_FLOW_ROUTES`

产出：
- 由 `blender/generate.py` 消费的确定性构建 JSON

- [ ] **步骤 1：编写失败的测试**

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

- [ ] **步骤 2：运行测试并验证 RED**

```bash
node scripts/run-tests.mjs tests/wastewater/scene-spec.test.ts
```

预期：FAIL，因为 `scene-spec.ts` 不存在。

- [ ] **步骤 3：实现确定性序列化**

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

添加脚本：

```json
"generate:wastewater-spec": "node --import tsx tools/wastewater-plant/scene-spec.ts --output"
```

- [ ] **步骤 4：向 `scene-spec.ts` 添加 CLI 入口**

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

- [ ] **步骤 5：运行聚焦测试和类型检查**

```bash
node scripts/run-tests.mjs tests/wastewater/scene-spec.test.ts
npm run typecheck:tools
```

预期：两者均通过。

- [ ] **步骤 6：提交**

```bash
git add package.json tests/wastewater/scene-spec.test.ts \
  tools/wastewater-plant/scene-spec.ts
git commit -m "feat(toolchain): export wastewater build specification"
```

---

### 任务 3：引导 Blender source 生成器

**文件：**
- 创建：`tools/wastewater-plant/blender/generate.py`
- 创建：`tools/wastewater-plant/blender/export.py`
- 创建：`tools/wastewater-plant/build-blender-source.ts`
- 创建：`tools/wastewater-plant/finalize-source-glb.ts`
- 测试：`tests/wastewater/blender-source.test.ts`

**接口：**

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

- [ ] **步骤 1：编写失败的集成测试**

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

- [ ] **步骤 2：运行测试并验证 RED**

```bash
node scripts/run-tests.mjs tests/wastewater/blender-source.test.ts
```

预期：FAIL，因为 Blender 构建入口不存在。

- [ ] **步骤 3：实现 Node 包装器**

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

`finalize-source-glb.ts`：

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

- [ ] **步骤 4：创建最小 Blender 导出器**

`export.py`：

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

`generate.py`：

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

- [ ] **步骤 5：运行聚焦测试**

```bash
node scripts/run-tests.mjs tests/wastewater/blender-source.test.ts
```

预期：PASS，且具有 65 个唯一设备身份。

- [ ] **步骤 6：提交**

```bash
git add tests/wastewater/blender-source.test.ts \
  tools/wastewater-plant/build-blender-source.ts \
  tools/wastewater-plant/finalize-source-glb.ts \
  tools/wastewater-plant/blender/generate.py \
  tools/wastewater-plant/blender/export.py
git commit -m "feat(toolchain): bootstrap authored wastewater source"
```

---

### 任务 4：添加可复用几何和场地构建

**文件：**
- 创建：`tools/wastewater-plant/blender/geometry.py`
- 创建：`tools/wastewater-plant/blender/site.py`
- 修改：`tools/wastewater-plant/blender/generate.py`
- 测试：`tests/wastewater/blender-source.test.ts`

**接口：**

`geometry.py`：

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

`site.py`：

```python
def build_site(asset_id: str) -> bpy.types.Collection
def build_process_pipes(spec: dict) -> bpy.types.Collection
```

- [ ] **步骤 1：扩展失败的 source 测试**

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

- [ ] **步骤 2：运行 RED**

```bash
node scripts/run-tests.mjs tests/wastewater/blender-source.test.ts
```

预期：FAIL，因为场地节点不存在。

- [ ] **步骤 3：实现可复用几何**

使用实际 Blender 操作实现 `geometry.py`：

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

`site.py` 使用这些辅助程序为地面、道路、周界围栏、建筑、管廊和工艺管道创建命名集合。

- [ ] **步骤 4：实现场地布局**

创建：

- 覆盖 `x=-24..294` 和 `z=-68..112` 的地面底板。
- 主入口道路、检修道路、周界道路、路缘和标线。
- 按侧边拆分的围栏段，以避免整个场景范围的代理对象。
- 进水、化学、鼓风机、脱水和行政建筑。
- 五个命名建筑组，包含墙体、门、窗、屋顶、雨棚和屋顶通风口。
- 沿 `mainFlowTags` 和 `returnFlows` 布置并带有支架的工艺管道。

- [ ] **步骤 5：运行聚焦测试**

```bash
node scripts/run-tests.mjs tests/wastewater/blender-source.test.ts
```

预期：PASS，且导出的 GLB 包含所有场地分组。

- [ ] **步骤 6：提交**

```bash
git add tests/wastewater/blender-source.test.ts \
  tools/wastewater-plant/blender/geometry.py \
  tools/wastewater-plant/blender/site.py \
  tools/wastewater-plant/blender/generate.py
git commit -m "feat(toolchain): model wastewater site infrastructure"
```

---

### 任务 5：构建详细的水处理设备

**文件：**
- 创建：`tools/wastewater-plant/blender/equipment.py`
- 修改：`tools/wastewater-plant/blender/generate.py`
- 测试：`tests/wastewater/blender-source.test.ts`

**接口：**

```python
def build_equipment(item: dict, materials: dict) -> bpy.types.Object
```

每个返回对象：
- 将 `item["tag"]` 用作对象名称。
- 存储完整的 `ice3` extras 对象。
- 包含一个具有多个材质槽的网格。
- 使用锐利/平坦着色。

- [ ] **步骤 1：编写失败的详细设备测试**

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

- [ ] **步骤 2：运行 RED**

```bash
node scripts/run-tests.mjs tests/wastewater/blender-source.test.ts
```

预期：FAIL，因为设备对象仍是占位盒体。

- [ ] **步骤 3：实现水处理原型**

在 `equipment.py` 中实现这些构建器：

- `build_inlet`
- `build_bar_screen`
- `build_pump`
- `build_grit_basin`
- `build_grit_classifier`
- `build_rectangular_clarifier`
- `build_distribution_well`
- `build_biological_reactor`
- `build_circular_clarifier`

必需的构建内容：

- 圆形澄清池使用倒角环形池壁、独立的中心进水井、半桥桁架、中心驱动、两条刮臂、出水槽、堰、浮渣挡板、出水管和梯子。
- 生物反应池使用三个隔间、分隔的水面、一个外露曝气单元、中心步道、双侧栏杆、空气集管、阀门和曝气盘。
- 格栅使用倾斜栅架、耙组件、驱动装置、栅渣滑槽和收集箱。
- 泵使用底轨、蜗壳、电机、联轴器护罩、吸入管和排出管。

- [ ] **步骤 4：按设备合并组件网格**

使用具有以下契约的辅助函数：

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

只有合并后的根节点接收 `ice3` extras。

- [ ] **步骤 5：运行聚焦测试**

```bash
node scripts/run-tests.mjs tests/wastewater/blender-source.test.ts
```

预期：所有细节阈值和身份检查均通过。

- [ ] **步骤 6：提交**

```bash
git add tests/wastewater/blender-source.test.ts \
  tools/wastewater-plant/blender/equipment.py \
  tools/wastewater-plant/blender/generate.py
git commit -m "feat(toolchain): model detailed water-treatment equipment"
```

---

### 任务 6：构建深度处理、污泥和 UV 设备

**文件：**
- 修改：`tools/wastewater-plant/blender/equipment.py`
- 测试：`tests/wastewater/blender-source.test.ts`

**接口：**

扩展 `build_equipment(item, materials)`，使其支持：

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

- [ ] **步骤 1：添加失败的设备族断言**

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

- [ ] **步骤 2：运行 RED**

```bash
node scripts/run-tests.mjs tests/wastewater/blender-source.test.ts
```

预期：FAIL，因为深度处理/污泥细节契约尚未完成。

- [ ] **步骤 3：实现其余原型**

必需的构建内容：

- 滤池单元：多个隔间、堰、槽、格栅步道和反冲洗集管。
- 接触池：蛇形水流通道、隔墙、闸门和消毒管道。
- 化学罐：储罐、穹顶/顶盖、围堰、混合器、加药泵、阀门和立管。
- 鼓风机：滑橇、外壳、进气过滤器、消声器、电机、柔性连接、止回阀和排出集管。
- 脱水设备：污泥池、絮凝池、混合器、聚合物加药、螺旋压榨机、喷水和泥饼输送机。
- 消化池：大型倒角圆柱、气穹、维护环、气体管道和梯子。
- 火炬：烟囱、三脚支架和气体管线。
- UV：开放渠道、灯排、石英套管、擦拭框架和控制柜。

- [ ] **步骤 4：按设备类别添加明确的样式**

使用不同的尺寸和组件布局：

- 生物池呈狭长且分隔的形式。
- 圆形澄清池呈圆柱形，并带有径向桥架结构。
- 化学设备是位于方形围堰内的立式容器。
- 污泥设备形成相互连接的工艺链，而非独立盒体。
- UV 设备是带有重复灯排的线性渠道。

- [ ] **步骤 5：运行聚焦测试**

```bash
node scripts/run-tests.mjs tests/wastewater/blender-source.test.ts
```

预期：PASS，且总三角形数在 150,000 到 300,000 之间。

- [ ] **步骤 6：提交**

```bash
git add tests/wastewater/blender-source.test.ts \
  tools/wastewater-plant/blender/equipment.py
git commit -m "feat(toolchain): model advanced and sludge treatment equipment"
```

---

### 任务 7：替换 source 生成器并保留资产流水线

**文件：**
- 修改：`tools/wastewater-plant/build-example.mjs`
- 修改：`package.json`
- 删除：`tools/wastewater-plant/assemblies.ts`
- 删除：`tools/wastewater-plant/primitives.ts`
- 删除：`tools/wastewater-plant/scene.ts`
- 删除：`tools/wastewater-plant/generate.ts`
- 删除：`tests/wastewater/primitives.test.ts`
- 修改：`tests/wastewater/pipeline.test.ts`
- 修改：`README.md`

**接口：**

- `npm run build:wastewater-demo` 必须调用：

```text
build-blender-source.ts --output <staging>/source/wastewater-plant.glb
```

- 所有下游命令和输出路径保持不变。

- [ ] **步骤 1：先更新集成测试**

添加：

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

- [ ] **步骤 2：运行 RED**

```bash
node scripts/run-tests.mjs tests/wastewater/pipeline.test.ts
```

预期：FAIL，因为检入的 source 仍报告先前的生成器。

- [ ] **步骤 3：确认稳定的生成器标记**

`build-blender-source.ts` 已在任务 3 中调用 `finalizeSourceGlb()`。
验证生成的 source 报告：

```text
ICE3 authored wastewater pipeline
```

保持终结器和其测试共享的标记常量。

- [ ] **步骤 4：切换构建命令**

更改：

```json
"generate:wastewater":
  "node --import tsx tools/wastewater-plant/build-blender-source.ts --output",
"build:wastewater-demo":
  "npm run build && node --import tsx tools/wastewater-plant/build-example.mjs"
```

更改 `build-example.mjs` 的 source 生成：

```js
run(process.execPath, [
  '--import',
  'tsx',
  join(toolDirectory, 'build-blender-source.ts'),
  '--output',
  source,
]);
```

- [ ] **步骤 5：移除过时的网格编写实现**

删除上面列出的旧直接几何文件及不再相关的测试。
保留 `equipment.ts`、`layout.ts`、`types.ts`、`scene-spec.ts`、
`blender-runtime.ts`、`finalize-source-glb.ts`、`verify.ts` 和替换后的
测试。

- [ ] **步骤 6：重建 source 和下游资产**

```bash
npm run build:wastewater-demo
```

预期：
- 新的 source GLB 由编写后的流水线生成。
- 所有 65 个身份在 source 和 prepared 中均保留。
- 细模和粗模输出包含多个文件。
- 现有资产验证器通过。

- [ ] **步骤 7：运行工具链验证**

```bash
npm run verify
```

预期：所有类型检查和测试均通过。

- [ ] **步骤 8：提交**

```bash
git add README.md package.json tools/wastewater-plant tests/wastewater
git commit -m "feat(toolchain): switch wastewater assets to authored pipeline"
```

---

### 任务 8：验证视觉质量和运行时集成

**文件：**
- 如果元素位置发生变化，修改：`ice3-engine/tests/e2e/wastewater-plant.spec.ts`
- 如果实施值发生变化，修改：`README.md` 和资产规格
- 生成：`ice3-engine/examples/m1/assets/wastewater-plant/**`

**接口：**

- 消费任务 7 生成的 source GLB。
- 产出最终的 prepared、细模、粗模和 Tileset 资产。

- [ ] **步骤 1：添加固定相机视觉冒烟断言**

添加以下测试：

- 加载默认虚拟污水处理厂。
- 设置全厂相机姿态。
- 断言空闲后至少驻留 60 个设备身份。
- 为 `SC-101` 设置近距相机姿态。
- 点击投影后的桥中心，并断言选中的 ID 精确为
  `ice3-virtual-wwtp/equipment/SC-101`.
- 断言选择面板可见，并包含非空设备名称。

- [ ] **步骤 2：运行浏览器测试**

```bash
npx playwright test tests/e2e/wastewater-plant.spec.ts \
  --project=chromium --workers=1 --repeat-each=2
npx playwright test tests/e2e/wastewater-plant.spec.ts \
  --project=webkit --workers=1 --repeat-each=2
```

预期：所有重复运行均通过，且没有页面错误或失败的资产请求。

- [ ] **步骤 3：验证确定性编写输出**

```bash
npm run build:wastewater-demo
shasum -a 256 ../ice3-engine/examples/m1/assets/wastewater-plant/source/wastewater-plant.glb
npm run build:wastewater-demo
shasum -a 256 ../ice3-engine/examples/m1/assets/wastewater-plant/source/wastewater-plant.glb
```

预期：SHA-256 值相同。

- [ ] **步骤 4：审计生成的资产**

```bash
git status --short
git ls-files '*.local.*' '*.preview.*'
find ../ice3-engine/examples/m1/assets -maxdepth 1 \
  -name '.wastewater-plant.staging-*'
```

预期：没有本地预览、客户资产或暂存目录。

- [ ] **步骤 5：运行完整验证**

```bash
cd ../ice3-toolchain
npm run verify
cd ../ice3-engine
npm run verify
```

预期：
- 工具链测试全部通过。
- 引擎单元和集成测试全部通过。
- Chromium 和 WebKit 测试全部通过。

- [ ] **步骤 6：截取视觉审查画面**

在以下位置生成仅含合成内容的截图：

- 污水厂总览；
- 二沉池近景；
- 生物反应池步道和曝气器细节；
- 污泥脱水和消化池区域。

审查以下方面：

- 工艺分区是否清晰可辨；
- 是否有悬空或相互穿插的组件；
- LOD 折叠后是否有长条形设备消失；
- 初始相机是否被大面积空旷地形占据。

- [ ] **步骤 7：提交生成的资产和最终文档**

```bash
git add examples/m1/assets/wastewater-plant tests/e2e/wastewater-plant.spec.ts
git commit -m "feat(example): ship authored wastewater plant assets"
```

- [ ] **步骤 8：合并功能分支**

从记录的合并基点审查两个功能分支。仅在所有测试和视觉检查通过后合并。

```bash
git switch main
git merge --no-ff feat/blender-wastewater-model
git merge --no-ff feat/blender-wastewater-demo
```

## 相关文档

- `ICE3-DOC-IDX-001` — [文档索引](../README.md)
- `ICE3-DOC-SPEC-008` — [污水处理 Blender 流水线规格](../specs/2026-10-28-credible-wastewater-blender-pipeline-design.md)
