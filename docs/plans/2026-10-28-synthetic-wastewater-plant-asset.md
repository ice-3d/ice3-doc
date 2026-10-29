# 虚构污水处理厂三维资产实施计划

> Document ID: ICE3-DOC-PLAN-014
>
> Status: Implemented
>
> Owner: ICE3 架构维护者

> **供智能代理工作者使用：** 需要使用子技能：`superpowers:subagent-driven-development`（推荐）或逐项执行本计划的 `superpowers:executing-plans`。步骤使用复选框（`- [ ]`）跟踪。

**目标：** 程序化生成一个完全虚构、可确定性重建的市政污水处理厂 GLB，并完成 prepared、空间拆分、LOD 粗模、粗模分块和示例集成。

**架构：** 在预处理工具工程中增加独立的 TypeScript 生成器，使用 `@gltf-transform/core` 构建几何、材质、场景层级和设备身份。生成器只产出 source GLB；现有 CLI 负责 prepared GLB、空间拆分、LOD 粗模与粗模分块，浏览器示例只加载处理后的 Tileset。

**技术栈：** Node.js 24.22.1 LTS、TypeScript 7、`@gltf-transform/core` 4.5.1、现有预处理 CLI、Node.js 测试运行器、Playwright、WebGL2

**规格：** `../specs/2026-10-28-synthetic-wastewater-plant-asset-design.md`

## 全局约束

- 生成器不得读取、引用、复制或派生任何真实客户模型。
- 不实现 Agent、Prompt、工具调用或 AI 专用接口。
- 生成和格式转换只能发生在离线工具链，不得进入浏览器运行时。
- 设备选择身份、设备编号和显示名称必须稳定且唯一。
- 所有生成资产必须是完全虚构、可公开提交的数据。
- 只生成程序化基础几何、基础色和清晰边线；不引入纹理、动画或复杂物理材质。
- 所有浏览器测试固定拦截本地客户预览探测，测试不得依赖本机客户文件。
- 代码、文档、测试、日志和提交信息不得包含禁止名称或客户信息。
- 使用仓库现有的 Node.js 测试运行器；不得重新引入已移除的测试体系。

## 审查重点

- 生成器意外读取本地客户资产：测试必须证明生成只使用仓库内常量与几何函数。
- 设备在离屏合批或分区后丢失选择身份：测试必须比较 source、prepared 和 Tileset 的语义身份集合。
- 粗模只有部分厂区或无法独立加载：测试必须验证每个粗模分块可读且并在逻辑上覆盖完整主流程。
- 默认示例继续显示旧占位资产或绕过本地预览优先级：浏览器测试必须同时覆盖默认虚拟厂区和本地覆盖分支。
- 相同输入生成不同文件或留下半成品：测试必须比较字节哈希，并验证失败或重建后不存在临时目录。

---

### 任务 1：建立程序化几何基础

**文件：**
- 修改：`ice3-toolchain/package.json`
- 创建：`ice3-toolchain/tools/wastewater-plant/tsconfig.json`
- 创建：`ice3-toolchain/tools/wastewater-plant/types.ts`
- 创建：`ice3-toolchain/tools/wastewater-plant/palette.ts`
- 创建：`ice3-toolchain/tools/wastewater-plant/primitives.ts`
- 测试：`ice3-toolchain/tests/wastewater/primitives.test.ts`

**接口：**

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

- 消费：glTF 2.0 三角形约定和现有预处理子集。
- 产出：所有后续设备构建器使用的有限、带索引的三角形几何。

- [ ] **步骤 1：添加生成依赖和类型检查入口**

添加固定的构建时依赖和脚本：

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

`tools/wastewater-plant/tsconfig.json`：

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

- [ ] **步骤 2：编写失败的基础几何测试**

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

- [ ] **步骤 3：运行基础几何测试并验证 RED**

运行：

```bash
cd ../ice3-toolchain
source ~/.nvm/nvm.sh && nvm use 24
npm run test -- tests/wastewater/primitives.test.ts
```

预期：FAIL，因为生成器模块不存在。

- [ ] **步骤 4：实现几何契约和调色板**

在 `palette.ts` 中定义精确的调色板值：

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

实现具有以下不变量的基础几何：

- 每个位置和法线均为有限值。
- 每个索引均为顶点数范围内的无符号整数。
- 盒体各面具有独立顶点和平坦面法线。
- 圆柱分段数为 8 到 64 之间的整数。
- 开口圆柱省略端盖，并保留外壁绕序。
- 管段生成从第一个端点到第二个端点的封闭圆柱。
- 所有数组均为类型化数组，且绝不包含外部资源。

- [ ] **步骤 5：运行聚焦测试和完整工具链测试**

运行：

```bash
npm run typecheck:tools
npm run typecheck
npm run test -- tests/wastewater/primitives.test.ts
npm test
```

预期：PASS。

- [ ] **步骤 6：提交**

```bash
git add package.json tsconfig.json tools/wastewater-plant tests/wastewater/primitives.test.ts
git commit -m "feat(toolchain): add wastewater geometry primitives"
```

---

### 任务 2：构建完整厂区场景

**文件：**
- 创建：`ice3-toolchain/tools/wastewater-plant/equipment.ts`
- 创建：`ice3-toolchain/tools/wastewater-plant/layout.ts`
- 创建：`ice3-toolchain/tools/wastewater-plant/scene.ts`
- 测试：`ice3-toolchain/tests/wastewater/scene.test.ts`

**接口：**

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

- 消费：任务 1 的几何和调色板。
- 产出：包含完整工艺层级和稳定设备身份的内存中 glTF 文档。

- [ ] **步骤 1：编写失败的场景测试**

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

- [ ] **步骤 2：运行场景测试并验证 RED**

```bash
npm run test -- tests/wastewater/scene.test.ts
```

预期：FAIL，因为场景构建器不存在。

- [ ] **步骤 3：定义精确的设备清单**

创建至少包含这些 tag 族的确定性清单：

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

每项设备规格都使用精确的 tag 作为其稳定身份后缀。将清单放入固定分组：

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

- [ ] **步骤 4：组装场景和设备几何**

为每项设备规格创建一个可选节点。每个可选节点必须：

- 引用一个包含一个或多个三角形图元的网格。
- 设置与设备 tag 相同的稳定名称。
- 将 extras 存储在 `ice3` 下：

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

使用专用构建器：

- 矩形工艺池包含底板、四面池壁、水面、步道和简化栏杆。
- 圆形澄清池包含环形池壁、中心机构、横桥和栏杆。
- 泵包含底座、泵体、电机、联轴器和一根进口/出口管道。
- 格栅包含框架、平行栅条、电机和收集槽。
- 鼓风机和脱水机包含底座、外壳、电机和检修面。
- 过滤器和接触池包含池壁、水面、介质隔间和管道集管。
- 阀门包含阀体、执行器和管接头。
- 分析仪包含机柜、立杆、显示面和电缆导管。

添加不可选择的场地基础设施：

- 地面底板。
- 内部道路和安全区。
- 主水、污泥、空气和化学药剂管线。
- 控制楼和公用工程楼。
- 周界围栏和少量通行步道。

管道走向必须连接 2D 参考流程中的相邻工艺阶段。添加 3 条回流路径：

- 滤池反冲洗至配水井。
- 污泥浓缩池上清液至配水井。
- 脱水滤液至配水井。

- [ ] **步骤 5：验证场景结构并更新架构测试**

扩展 `tests/architecture/layout.test.ts`，确保 GLB 生成依赖属于工具链开发依赖，且没有浏览器包导入它。

运行：

```bash
npm run typecheck:tools
npm run test -- tests/wastewater/scene.test.ts tests/architecture/layout.test.ts
npm test
```

预期：PASS。

- [ ] **步骤 6：提交**

```bash
git add tools/wastewater-plant tests/wastewater/scene.test.ts tests/architecture/layout.test.ts
git commit -m "feat(toolchain): build virtual wastewater facility"
```

---

### 任务 3：导出 Source GLB 和 Prepared 预览

**文件：**
- 创建：`ice3-toolchain/tools/wastewater-plant/generate.ts`
- 创建：`ice3-toolchain/tools/wastewater-plant/build-example.mjs`
- 创建：`ice3-toolchain/tools/wastewater-plant/verify.ts`
- 修改：`ice3-toolchain/package.json`
- 创建：`ice3-engine/examples/m1/assets/wastewater-plant/source/wastewater-plant.glb`
- 创建：`ice3-engine/examples/m1/assets/wastewater-plant/prepared/wastewater-plant.glb`
- 创建：`ice3-engine/examples/m1/assets/wastewater-plant/prepared/wastewater-plant.report.json`
- 测试：`ice3-toolchain/tests/wastewater/export.test.ts`

**接口：**

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

- 消费：任务 2 的场景文档。
- 产出：确定性的 source GLB 和 prepared 运行时 GLB。

- [ ] **步骤 1：编写失败的确定性导出测试**

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

- [ ] **步骤 2：运行导出测试并验证 RED**

```bash
npm run test -- tests/wastewater/export.test.ts
```

预期：FAIL，因为生成器入口不存在。

- [ ] **步骤 3：实现确定性的 source 导出**

使用 `NodeIO.writeBinary(document)`，用 SHA-256 对字节计算哈希，创建父目录，并通过临时同级文件写入后再重命名为最终路径。

公开一个 CLI 入口：

```bash
node --import tsx tools/wastewater-plant/generate.ts \
  --output ../ice3-engine/examples/m1/assets/wastewater-plant/source/wastewater-plant.glb
```

CLI 必须以 `ICE3_WWTP_EXPORT_FAILED` 拒绝缺失的 `--output`、意外参数、空输出路径和写入失败。

- [ ] **步骤 4：添加完整的示例构建脚本**

`build-example.mjs` 必须：

1. 解析同级 `ice3-engine` 目录。
2. 在目标资产目录下创建暂存目录。
3. 将 source GLB 生成到暂存目录中。
4. 运行工具链构建命令，生成 prepared GLB 和报告。
5. 验证 prepared GLB。
6. 将任务 4 的拆分流水线运行到暂存目录中。
7. 验证完成后的目录。
8. 仅在所有步骤通过后替换先前的 `wastewater-plant` 目录。

添加脚本：

```json
{
  "generate:wastewater": "node --import tsx tools/wastewater-plant/generate.ts",
  "build:wastewater-demo": "npm run build && node tools/wastewater-plant/build-example.mjs"
}
```

预览的构建命令是：

```bash
node packages/cli/dist/main.js build \
  "$staging/source/wastewater-plant.glb" \
  --output "$staging/prepared/wastewater-plant.glb" \
  --report "$staging/prepared/wastewater-plant.report.json" \
  --budget unrestricted \
  --asset-id ice3-virtual-wwtp
```

- [ ] **步骤 5：生成并验证 source/prepared 产物**

运行：

```bash
npm run build:wastewater-demo
node packages/cli/dist/main.js validate \
  ../ice3-engine/examples/m1/assets/wastewater-plant/prepared/wastewater-plant.glb
```

预期：

- Source GLB 是标准的单 JSON/单 BIN GLB。
- Prepared GLB 通过当前生效的资产契约。
- 选择组数量至少为 60。
- Source 和 prepared 资产不包含纹理或外部资源。
- 生成的字节可复现。

- [ ] **步骤 6：提交生成的 source 和预览**

在工具链仓库中：

```bash
git add package.json tools/wastewater-plant tests/wastewater/export.test.ts
git commit -m "feat(toolchain): export virtual wastewater assets"
```

在引擎仓库中：

```bash
git add examples/m1/assets/wastewater-plant/source \
  examples/m1/assets/wastewater-plant/prepared
git commit -m "feat(example): add virtual wastewater models"
```

---

### 任务 4：拆分资产并生成 LOD 内容

**文件：**
- 修改：`ice3-toolchain/tools/wastewater-plant/build-example.mjs`
- 创建：`ice3-engine/examples/m1/assets/wastewater-plant/tiled/tileset.json`
- 创建：`ice3-engine/examples/m1/assets/wastewater-plant/tiled/parts/*.glb`
- 创建：`ice3-engine/examples/m1/assets/wastewater-plant/tiled/coarse/*.glb`
- 测试：`ice3-toolchain/tests/wastewater/pipeline.test.ts`

**接口：**

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

- 消费：任务 3 source GLB 的原始几何。Prepared 输出包含生成的边图元，不能作为有效的二次拆分输入。
- 产出：可加载的 Tileset，包含多个细模分区和多个粗模分块。

- [ ] **步骤 1：编写失败的产物测试**

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

- [ ] **步骤 2：运行流水线测试并验证 RED**

```bash
npm run test -- tests/wastewater/pipeline.test.ts
```

预期：FAIL，因为 Tiled 产物和检查辅助程序不存在。

- [ ] **步骤 3：在构建脚本中添加拆分和 LOD 生成**

在 prepared 验证完成后，对已验证的 source GLB 运行分区 CLI：

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

如果实测几何仅产生一个细模分区或一个粗模分块，则降低相关的字节/三角形阈值，直到两项断言均通过。不得通过接受单个容器来削弱测试。

- [ ] **步骤 4：实现产物检查**

`verify.ts` 必须：

- 解析并验证 Tileset。
- 使用现有 prepared 读取器读取每个细模和粗模 GLB。
- 收集唯一的语义选择 ID。
- 拒绝可见语义节点中重复的选择 ID。
- 确认 prepared 层级中包含所有预期的设备 tag。
- 拒绝外部 HTTP 引用、缺失文件、格式错误的 GLB 和空粗模覆盖。

- [ ] **步骤 5：重新构建并验证所有生成的资产**

运行：

```bash
npm run build:wastewater-demo
npm run test -- tests/wastewater
node packages/cli/dist/main.js validate \
  ../ice3-engine/examples/m1/assets/wastewater-plant/prepared/wastewater-plant.glb
```

预期：

- 至少两个细模分区。
- 至少两个粗模分块。
- 所有生成的 GLB 和 Tileset 均通过验证。
- 细模和粗模资产保留完整的稳定身份集合。

- [ ] **步骤 6：提交**

在工具链仓库中：

```bash
git add tools/wastewater-plant/build-example.mjs \
  tools/wastewater-plant/verify.ts tests/wastewater/pipeline.test.ts
git commit -m "feat(toolchain): split and simplify virtual wastewater assets"
```

在引擎仓库中：

```bash
git add examples/m1/assets/wastewater-plant/tiled
git commit -m "feat(example): add virtual wastewater tileset"
```

---

### 任务 5：将虚拟污水处理厂设为默认示例

**文件：**
- 修改：`ice3-engine/examples/m1/main.ts`
- 修改：`ice3-engine/tests/e2e/m1.spec.ts`
- 修改：`ice3-engine/tests/e2e/selection-dpr.spec.ts`
- 创建：`ice3-engine/tests/e2e/wastewater-plant.spec.ts`

**接口：**

- 消费：`/assets/wastewater-plant/tiled/tileset.json`。
- 产出：默认指向虚拟污水处理厂的根 URL，同时保留同源本地预览覆盖。

资产优先级：

```text
explicit ?asset=...
  → available local preview
  → virtual wastewater plant
```

自适应演示查询继续选择自适应夹具。

- [ ] **步骤 1：编写失败的默认资产浏览器测试**

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

- [ ] **步骤 2：运行默认资产测试并验证 RED**

```bash
cd ../ice3-engine
npx playwright test tests/e2e/wastewater-plant.spec.ts \
  --project=chromium --workers=1
```

预期：FAIL，因为根 URL 仍选择旧的回退项。

- [ ] **步骤 3：更改默认资产回退项**

将旧的默认回退项替换为：

```ts
const defaultAssetUrl = adaptiveDemo
  ? '/assets/adaptive-demo/tileset.json'
  : '/assets/wastewater-plant/tiled/tileset.json';
```

不得更改本地预览探测或显式 `?asset=` 行为。

- [ ] **步骤 4：固定旧版夹具专用测试**

有意依赖旧版分层夹具的测试必须使用以下方式导航：

```text
http://127.0.0.1:8104/?asset=/assets/hierarchical-demo/tileset.json
```

这包括延迟或使分层分区请求失败的测试，以及断言旧版粗模总览行为的测试。当断言与夹具无关时，通用加载、键盘控制、选择和布局测试可以继续使用虚拟污水处理厂。

更新本地覆盖测试，以虚拟污水处理 Tileset 作为覆盖夹具。

- [ ] **步骤 5：运行聚焦测试和完整浏览器测试**

```bash
npx playwright test tests/e2e/wastewater-plant.spec.ts \
  --project=chromium --workers=1
npx playwright test --project=chromium --workers=1
npx playwright test --project=webkit --workers=1
```

预期：PASS，且没有页面错误、失败请求或缺失的选择身份。

- [ ] **步骤 6：提交**

```bash
git add examples/m1/main.ts tests/e2e/m1.spec.ts \
  tests/e2e/selection-dpr.spec.ts tests/e2e/wastewater-plant.spec.ts
git commit -m "feat(example): show the virtual wastewater plant"
```

---

### 任务 6：最终验证和文档编写

**文件：**
- 修改：`ice3-toolchain/README.md`
- 修改：`ice3-engine/examples/m1/index.html`
- 修改：`ice3-engine/examples/m1/main.ts`
- 测试：现有生成器、流水线、单元和浏览器测试套件

**接口：**

- 消费所有先前的任务。
- 产出有文档说明、可复现且可发布的合成演示资产。

- [ ] **步骤 1：更新可见的演示文案**

将示例副标题从通用分块资产文本改为：

```text
虚拟市政污水处理厂
```

保持状态、进度和选择面板不变。

- [ ] **步骤 2：记录重建命令**

将准确命令添加到工具链 README 中：

```bash
npm run build:wastewater-demo
```

说明它会生成 source、prepared、tiled、细模和粗模资产，且结果完全为合成内容。

- [ ] **步骤 3：运行完整验证**

工具链：

```bash
cd ../ice3-toolchain
source ~/.nvm/nvm.sh && nvm use 24
npm run verify
```

引擎：

```bash
cd ../ice3-engine
source ~/.nvm/nvm.sh && nvm use 24
npm run verify
```

预期：所有类型检查、单元测试和 Chromium/WebKit 测试均通过。

- [ ] **步骤 4：审计可复现性和隐私**

运行两次：

```bash
npm run build:wastewater-demo
shasum -a 256 \
  ../ice3-engine/examples/m1/assets/wastewater-plant/source/wastewater-plant.glb
npm run build:wastewater-demo
shasum -a 256 \
  ../ice3-engine/examples/m1/assets/wastewater-plant/source/wastewater-plant.glb
```

预期：SHA-256 值相同。

运行：

```bash
git status --short
git ls-files '*.local.*' '*.preview.*'
git grep -I -n -i -E "$ICE3_FORBIDDEN_NAME_PATTERN" -- . || true
```

预期：已跟踪内容中没有本地预览文件、客户资产、暂存目录、禁止名称或生成的日志。

- [ ] **步骤 5：提交最终文档**

在工具链仓库中：

```bash
git add README.md
git commit -m "docs(toolchain): document virtual wastewater generation"
```

在引擎仓库中：

```bash
git add examples/m1/index.html examples/m1/main.ts
git commit -m "docs(example): describe virtual wastewater scene"
```

---

## 最终验收

仅当满足以下条件时，实施才算完成：

1. `npm run build:wastewater-demo` 可以从头重建所有合成产物。
2. Source 和 prepared GLB 具有确定性且有效。
3. Tiled 输出包含多个细模分区和多个粗模分块。
4. 每个预期设备身份都能在 prepared、分区、LOD 和静态合批后保留。
5. 根示例显示完整的虚拟污水处理厂，且不包含任何本地客户资产。
6. 本地客户预览仍仅在本地机器上覆盖合成资产。
7. Chromium 和 WebKit 浏览器测试报告没有页面错误或失败请求。
8. 没有客户资产或禁止名称进入源代码、生成资产、文档、测试或提交历史。

## 相关文档

- `ICE3-DOC-IDX-001` — [文档索引](../README.md)
- `ICE3-DOC-SPEC-010` — [合成污水处理厂规格](../specs/2026-10-28-synthetic-wastewater-plant-asset-design.md)
