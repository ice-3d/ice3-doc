# Asset Preparation Contract v1 实施计划

> Document ID: ICE3-DOC-PLAN-004
>
> Status: Implemented
>
> Owner: ICE3 架构维护者

> **面向智能体执行者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 按任务逐步实施本计划。步骤使用复选框（`- [ ]`）语法跟踪。

**目标：** 实施 Asset Preparation Contract v1 定义的共享 GLB 契约、预算评估、可选报告、引擎消费和跨仓库验证。

**架构：** 工具链计算规范指标，并将小型运行时契约嵌入每个 Prepared GLB，然后可选地写入确定性 sidecar 报告供 CI 和 UI 使用。引擎验证并暴露嵌入的契约，同时继续拒绝需要运行时转换的 Asset；运行时从不需要该报告。

**技术栈：** TypeScript、Node.js 24.22.1 LTS、ESM、npm workspaces、GLB、Node.js 测试运行器、Playwright

**规范：** `../../contracts/asset-preparation-contract-v1.md`

**仓库：** `ice3-toolchain`、`ice3-engine`

## 全局约束

- 使用 Node.js 24.22.1 LTS 和 npm 11 或更高版本。
- 工具链输出仍为标准的单 JSON/单 BIN GLB。
- 仍禁止运行时转换：`runtimeConversionRequired` 必须为 `false`。
- GLB 是权威运行时制品；JSON 报告为可选内容。
- 不要添加运行时依赖。
- 保持 `@ice3/core` 独立于 DOM、Canvas、GPU 和同级包。
- 不要跨仓库导入私有源路径。
- 不得提交真实客户模型、派生预览、源路径、截图或报告。
- 自动化 fixture 必须是合成的或明确可分发的。
- 不要在代码、文档、注释、提交或示例中使用竞品或厂商产品名称。
- 在每个仓库中使用功能分支，并仅在该仓库完整验证门禁通过后合入其 `main`。
- 工具链和引擎的迁移必须保持兼容：没有契约的现有 Prepared Asset 通过 `ICE3_ASSET_CONTRACT_MISSING` 加载。
- 引擎 TypeScript 已启用精确可选属性类型；条件式展开可选值。

## 审查重点

- 恰好位于软限制或硬限制边界的已报告预算不得被归类为超过该边界。
- 嵌入 `encodedBytes` 时必须收敛到稳定的最终 GLB，而不是基于临时文件报告预算状态。
- 报告必须具有确定性，且不得披露源路径或客户文件名。
- 没有 `contractVersion` 的旧 Asset 必须带警告加载，而不受支持的主版本和运行时转换请求必须失败。
- 运行时指标必须区分声明的 Asset 数量、实际实例化数量和渲染器绘制/GPU 指标。

## 文件结构

### `ice3-toolchain`

**新建**

- `packages/toolchain-core/src/output/assetContract.ts`：共享契约类型、常量、指标规范化和预算结果结构。
- `packages/toolchain-core/src/output/evaluateAssetBudget.ts`：内置预算配置文件和确定性阈值评估。
- `packages/toolchain-core/src/output/createAssetReport.ts`：规范 sidecar 报告构建。
- `tests/output/assetContract.test.ts`：契约和报告结构测试。
- `tests/output/evaluateAssetBudget.test.ts`：边界和配置文件测试。

**修改**

- `packages/toolchain-core/src/output/buildPreparedGLB.ts`：计算指标并嵌入契约；最终确定依赖字节数的预算状态。
- `packages/toolchain-core/src/output/validatePreparedGLB.ts`：验证嵌入的契约。
- `packages/toolchain-core/src/index.ts`：导出契约和预算 API。
- `packages/cli/src/commands.ts`：预算选择、报告输出和警告退出策略。
- `tests/cli/commands.test.ts`：CLI 行为。
- `fixtures/prepared-cube.glb`：重新生成的合成契约 fixture。
- `fixtures/prepared-cube.report.json`：重新生成的合成报告。
- `README.md`：命令和预算文档。

### `ice3-engine`

**修改**

- `packages/assets/src/ICEPreparedGLB.ts`：契约快照类型。
- `packages/assets/src/ICEProfileValidator.ts`：契约兼容性检查。
- `packages/assets/src/ICEGLBReader.ts`：契约和扩展指标提取。
- `packages/assets/tests/createFixture.ts`：契约 fixture 元数据。
- `packages/assets/tests/GLBReader.test.ts`：旧/新契约行为。
- `packages/runtime/src/asset/ICEAssetLoader.ts`：在 `ICEAssetHandle` 中暴露契约。
- `packages/runtime/tests/AssetLoader.test.ts`：句柄契约暴露。
- `packages/renderer/src/types.ts`：后端契约上的只读渲染器指标。
- `packages/renderer/src/FakeRendererBackend.ts`：确定性测试指标。
- `packages/runtime/src/ICE3.ts`：运行时诊断集成。
- `packages/runtime/tests/EngineLifecycle.test.ts`：诊断集成。
- `examples/m1/assets/prepared-cube.glb`：复制的合成契约 fixture。
- `README.md` 和 `docs/api/m1.md`：消费规范契约。
- `docs/diagnostics.md`：稳定契约诊断。

---

### 任务 1：定义工具链契约类型和规范指标

**仓库：** `ice3-toolchain`

**文件：**
- 新建：`packages/toolchain-core/src/output/assetContract.ts`
- 新建：`tests/output/assetContract.test.ts`
- 修改：`tests/output/buildPreparedGLB.test.ts`
- 修改：`packages/toolchain-core/src/index.ts`

**接口：**
- 产出：`ICE_ASSET_CONTRACT_VERSION = '1.0'`。
- 产出：`ICEAssetMetrics`，包含 `encodedBytes`、`jsonChunkBytes`、`binChunkBytes`，以及 Node/深度/Mesh/primitive/三角形/边/Material/Selection 指标。
- 产出：`ICEAssetPreparation` 和 `ICEAssetContract`。
- 产出：`contractStats(metrics): ICEAssetContractStats`。

- [ ] **步骤 1：编写失败的契约指标测试**

创建 `tests/output/assetContract.test.ts`：

```ts
import { test } from 'node:test';
import { expect } from 'expect';
import {
  ICE_ASSET_CONTRACT_VERSION,
  contractStats,
} from '../packages/toolchain-core/src/output/assetContract';

test('exposes only the stable runtime stats subset', () => {
  expect(ICE_ASSET_CONTRACT_VERSION).toBe('1.0');
  expect(contractStats({
    encodedBytes: 400,
    jsonChunkBytes: 100,
    binChunkBytes: 300,
    nodeCount: 4,
    maxNodeDepth: 2,
    meshCount: 3,
    primitiveCount: 6,
    triangleCount: 12,
    edgeSegmentCount: 18,
    materialCount: 2,
    selectionGroupCount: 3,
  })).toEqual({
    nodeCount: 4,
    maxNodeDepth: 2,
    meshCount: 3,
    primitiveCount: 6,
    triangleCount: 12,
    edgeSegmentCount: 18,
    materialCount: 2,
    selectionGroupCount: 3,
  });
});
```

在 `buildPreparedGLB.test.ts` 中添加构建器断言：

```ts
expect(built.metrics).toMatchObject({
  nodeCount: 1,
  maxNodeDepth: 0,
  meshCount: 1,
  primitiveCount: 1,
  triangleCount: 12,
  edgeSegmentCount: 12,
  materialCount: 2,
  selectionGroupCount: 1,
});
```

将较早的四个字段 `first.stats` 预期替换为扩展统计对象，使测试反映新的规范结构。

- [ ] **步骤 2：验证 RED**

运行：

```bash
npm test -- tests/output/assetContract.test.ts tests/output/buildPreparedGLB.test.ts
```

预期：失败，因为契约模块和 `built.metrics` 尚不存在。

- [ ] **步骤 3：实现契约类型**

创建 `assetContract.ts`：

```ts
export const ICE_ASSET_CONTRACT_VERSION = '1.0';

export interface ICEAssetMetrics {
  readonly encodedBytes: number;
  readonly jsonChunkBytes: number;
  readonly binChunkBytes: number;
  readonly nodeCount: number;
  readonly maxNodeDepth: number;
  readonly meshCount: number;
  readonly primitiveCount: number;
  readonly triangleCount: number;
  readonly edgeSegmentCount: number;
  readonly materialCount: number;
  readonly selectionGroupCount: number;
}

export type ICEAssetContractStats = Omit<
  ICEAssetMetrics,
  'encodedBytes' | 'jsonChunkBytes' | 'binChunkBytes'
>;

export const contractStats = (
  metrics: ICEAssetMetrics,
): ICEAssetContractStats => ({
  nodeCount: metrics.nodeCount,
  maxNodeDepth: metrics.maxNodeDepth,
  meshCount: metrics.meshCount,
  primitiveCount: metrics.primitiveCount,
  triangleCount: metrics.triangleCount,
  edgeSegmentCount: metrics.edgeSegmentCount,
  materialCount: metrics.materialCount,
  selectionGroupCount: metrics.selectionGroupCount,
});

export interface ICEAssetPreparation {
  readonly runtimeConversionRequired: false;
  readonly sourceFormat: 'gltf-2.0';
  readonly unitsNormalized: true;
  readonly matrixTransformsBaked: true;
  readonly requiredCompressionDecoded: true;
  readonly edgesPrepared: boolean;
  readonly selectionGroupsPrepared: true;
  readonly options: Readonly<{
    creaseAngleDegrees: number;
    edges: boolean;
  }>;
}

export interface ICEAssetContract {
  readonly contractVersion: '1.0';
  readonly stats: ICEAssetContractStats;
  readonly preparation: ICEAssetPreparation;
}
```

扩展 `ICEPreparedGLB` 返回值：

```ts
export interface ICEPreparedGLB {
  readonly bytes: Uint8Array;
  readonly stats: ICEAssetContractStats;
  readonly metrics: ICEAssetMetrics;
}
```

使用确定性递归函数计算 `maxNodeDepth`：

```ts
const nodeDepth = (index: number, visiting = new Set<number>()): number => {
  if (visiting.has(index)) {
    throw new Error('ICE3_TOOL_INVALID_SOURCE: node cycle detected');
  }
  const children = integers(sourceNodes[index]?.children);
  if (children.length === 0) return 0;
  const next = new Set(visiting).add(index);
  return 1 + Math.max(...children.map((child) => nodeDepth(child, next)));
};
const maxNodeDepth = sceneNodeIndices.length === 0
  ? 0
  : Math.max(...sceneNodeIndices.map((index) => nodeDepth(index)));
```

将 `selectionGroupCount` 计算为拥有至少一个三角形 primitive 的唯一源 Node 索引数量。这符合当前契约中一个命名 Mesh Node 就是一个设备单元的约定。根据 `outputMaterials.length` 计算 Material 数量。`encodedBytes`、JSON 块和 BIN 块大小初始可以为 `0`；任务 3 会在打包后最终确定字节指标。

- [ ] **步骤 4：验证 GREEN**

运行：

```bash
npm test -- tests/output/assetContract.test.ts tests/output/buildPreparedGLB.test.ts
npm run typecheck
```

预期：通过。

- [ ] **步骤 5：提交**

```bash
git add packages/toolchain-core/src/output/assetContract.ts \
  packages/toolchain-core/src/output/buildPreparedGLB.ts \
  packages/toolchain-core/src/index.ts \
  tests/output/assetContract.test.ts \
  tests/output/buildPreparedGLB.test.ts
git commit -m "feat(toolchain): define asset contract metrics"
```

---

### 任务 2：实现预算配置文件和边界评估

**仓库：** `ice3-toolchain`

**文件：**
- 新建：`packages/toolchain-core/src/output/evaluateAssetBudget.ts`
- 新建：`tests/output/evaluateAssetBudget.test.ts`
- 修改：`packages/toolchain-core/src/index.ts`

**接口：**
- 使用：`ICEAssetMetrics`。
- 产出：`ICEBudgetLimit`、`ICEBudgetProfile`、`ICEBudgetCheck`、`ICEBudgetResult`。
- 产出：`BUDGET_PROFILES`、`evaluateAssetBudget()`、`validateBudgetProfile()`。

- [ ] **步骤 1：编写失败的边界测试**

创建 `tests/output/evaluateAssetBudget.test.ts`：

```ts
import { test } from 'node:test';
import { expect } from 'expect';
import {
  BUDGET_PROFILES,
  evaluateAssetBudget,
} from '../packages/toolchain-core/src/output/evaluateAssetBudget';
import type { ICEAssetMetrics } from '../packages/toolchain-core/src/output/assetContract';

const metrics = (triangleCount: number): ICEAssetMetrics => ({
  encodedBytes: 100,
  jsonChunkBytes: 20,
  binChunkBytes: 80,
  nodeCount: 1,
  maxNodeDepth: 0,
  meshCount: 1,
  primitiveCount: 2,
  triangleCount,
  edgeSegmentCount: 0,
  materialCount: 1,
  selectionGroupCount: 1,
});

test('classifies soft and hard limits inclusively', () => {
  const budget = BUDGET_PROFILES['interactive-desktop-v1'];
  expect(evaluateAssetBudget(metrics(5_000_000), budget).status).toBe('pass');
  expect(evaluateAssetBudget(metrics(5_000_001), budget).status).toBe('warning');
  expect(evaluateAssetBudget(metrics(20_000_000), budget).status).toBe('warning');
  expect(evaluateAssetBudget(metrics(20_000_001), budget).status).toBe('error');
});

test('reports every check with stable IDs', () => {
  const result = evaluateAssetBudget(
    metrics(5_000_001),
    BUDGET_PROFILES['interactive-desktop-v1'],
  );
  expect(result.checks.map((check) => check.id)).toContain('triangles');
  expect(result.warningCount).toBeGreaterThan(0);
  expect(result.errorCount).toBe(0);
});

test('rejects malformed custom budget profiles', () => {
  expect(() => validateBudgetProfile({
    id: 'custom',
    limits: [{ id: 'triangleCount', softLimit: 10, hardLimit: 5 }],
  })).toThrow(/ICE3_TOOL_INVALID_BUDGET/);
});
```

- [ ] **步骤 2：验证 RED**

运行：

```bash
npm test -- tests/output/evaluateAssetBudget.test.ts
```

预期：失败，因为模块尚不存在。

- [ ] **步骤 3：实现评估器和配置文件**

创建：

```ts
export interface ICEBudgetLimit {
  readonly id: keyof Omit<ICEAssetMetrics, 'jsonChunkBytes' | 'binChunkBytes'>;
  readonly label: string;
  readonly softLimit: number;
  readonly hardLimit: number;
}

export interface ICEBudgetProfile {
  readonly id: 'interactive-desktop-v1' | 'unrestricted' | string;
  readonly limits: readonly ICEBudgetLimit[];
}

export interface ICEBudgetCheck {
  readonly id: string;
  readonly metric: string;
  readonly value: number;
  readonly softLimit: number;
  readonly hardLimit: number;
  readonly status: 'pass' | 'warning' | 'error';
}

export interface ICEBudgetResult {
  readonly profile: string;
  readonly status: 'pass' | 'warning' | 'error';
  readonly warningCount: number;
  readonly errorCount: number;
  readonly checks: readonly ICEBudgetCheck[];
}
```

使用契约中的确切软/硬限制：

```ts
export const BUDGET_PROFILES: Record<string, ICEBudgetProfile> = {
  'interactive-desktop-v1': {
    id: 'interactive-desktop-v1',
    limits: [
      { id: 'nodeCount', label: 'Nodes', softLimit: 25_000, hardLimit: 50_000 },
      { id: 'meshCount', label: 'Meshes', softLimit: 5_000, hardLimit: 15_000 },
      { id: 'primitiveCount', label: 'Primitives', softLimit: 10_000, hardLimit: 30_000 },
      { id: 'triangleCount', label: 'Triangles', softLimit: 5_000_000, hardLimit: 20_000_000 },
      { id: 'edgeSegmentCount', label: 'Edge segments', softLimit: 10_000_000, hardLimit: 40_000_000 },
      { id: 'encodedBytes', label: 'Encoded bytes', softLimit: 134_217_728, hardLimit: 536_870_912 },
      { id: 'selectionGroupCount', label: 'Selection groups', softLimit: 20_000, hardLimit: 100_000 },
    ],
  },
  unrestricted: { id: 'unrestricted', limits: [] },
};
```

分类规则：

```ts
const checkStatus = (
  value: number,
  softLimit: number,
  hardLimit: number,
): 'pass' | 'warning' | 'error' => {
  if (value > hardLimit) return 'error';
  if (value > softLimit) return 'warning';
  return 'pass';
};
```

如果存在任何错误，总体状态为 `error`；否则若存在任何警告，则为 `warning`；否则为 `pass`。

`validateBudgetProfile(value)` 要求 `id` 为非空字符串、`limits` 为数组、指标 ID 已知、两项限制均为有限非负整数，且 `softLimit <= hardLimit`。它返回冻结的规范化配置文件，否则抛出 `ICE3_TOOL_INVALID_BUDGET`。

- [ ] **步骤 4：验证 GREEN**

运行：

```bash
npm test -- tests/output/evaluateAssetBudget.test.ts
npm run typecheck
```

预期：通过。

- [ ] **步骤 5：提交**

```bash
git add packages/toolchain-core/src/output/evaluateAssetBudget.ts \
  packages/toolchain-core/src/index.ts \
  tests/output/evaluateAssetBudget.test.ts
git commit -m "feat(toolchain): evaluate asset budgets"
```

---

### 任务 3：将最终契约嵌入 Prepared GLB

**仓库：** `ice3-toolchain`

**文件：**
- 修改：`packages/toolchain-core/src/output/assetContract.ts`
- 修改：`packages/toolchain-core/src/output/buildPreparedGLB.ts`
- 修改：`packages/toolchain-core/src/output/validatePreparedGLB.ts`
- 修改：`tests/output/buildPreparedGLB.test.ts`
- 修改：`tests/output/validatePreparedGLB.test.ts`

**接口：**
- 使用：`ICEBudgetProfile`、`evaluateAssetBudget()`、`contractStats()`。
- 产出：`ICEBuildOptions.budget?: ICEBudgetProfile`。
- 产出：`ICEAssetContract.budget`，包含 `{ profile, status, warningCount, errorCount }`。
- 产出：最终 GLB 的 `asset.extras.ice3.contractVersion`、扩展 `stats`、`preparation` 和 `budget`。

- [ ] **步骤 1：编写失败的嵌入契约测试**

添加到 `buildPreparedGLB.test.ts`：

```ts
test('embeds preparation, extended stats, and budget status', () => {
  const built = buildPreparedGLB(source, {
    assetId: 'sample',
    budget: BUDGET_PROFILES['interactive-desktop-v1'],
  });
  const profile = readProfile(built.bytes);
  expect(profile.contractVersion).toBe('1.0');
  expect(profile.stats).toMatchObject({
    nodeCount: 1,
    maxNodeDepth: 0,
    meshCount: 1,
    primitiveCount: 1,
    triangleCount: 12,
    materialCount: 2,
    selectionGroupCount: 1,
  });
  expect(profile.preparation.runtimeConversionRequired).toBe(false);
  expect(profile.preparation.matrixTransformsBaked).toBe(true);
  expect(profile.budget).toMatchObject({
    profile: 'interactive-desktop-v1',
    status: 'pass',
  });
});
```

添加到 `validatePreparedGLB.test.ts`：

```ts
test('rejects runtime conversion and unsupported contract versions', () => {
  const valid = buildPreparedGLB(source, { assetId: 'sample' }).bytes;

  const conversion = mutateProfile(valid, (profile) => {
    profile.preparation.runtimeConversionRequired = true;
  });
  expect(validatePreparedGLB(conversion).errors).toContain(
    'ICE3_TOOL_RUNTIME_CONVERSION_REQUIRED',
  );

  const unsupported = mutateProfile(valid, (profile) => {
    profile.contractVersion = '2.0';
  });
  expect(validatePreparedGLB(unsupported).errors).toContain(
    'ICE3_TOOL_CONTRACT_UNSUPPORTED',
  );
});
```

使用该测试文件中现有的 `rewriteJSON()` 辅助函数定义：

```ts
const mutateProfile = (
  bytes: Uint8Array,
  mutate: (profile: Record<string, unknown>) => void,
): Uint8Array => rewriteJSON(bytes, (json) => {
  const asset = json.asset as Record<string, unknown>;
  const extras = asset.extras as Record<string, unknown>;
  mutate(extras.ice3 as Record<string, unknown>);
});
```

在构建测试旁定义 `readProfile()`：

```ts
const readProfile = (bytes: Uint8Array): Record<string, unknown> => {
  const buffer = Buffer.from(bytes);
  const length = buffer.readUInt32LE(12);
  const json = JSON.parse(
    buffer.subarray(20, 20 + length).toString('utf8').trimEnd(),
  ) as Record<string, unknown>;
  const asset = json.asset as Record<string, unknown>;
  return (asset.extras as Record<string, unknown>).ice3 as Record<string, unknown>;
};
```

- [ ] **步骤 2：验证 RED**

运行：

```bash
npm test -- tests/output/buildPreparedGLB.test.ts tests/output/validatePreparedGLB.test.ts
```

预期：失败，因为 GLB 不包含 contract、preparation 或 budget 字段。

- [ ] **步骤 3：实现两轮最终化**

在 `buildPreparedGLB.ts` 中添加辅助函数：

```ts
const packWithContract = (
  json: JSONRecord,
  binary: Buffer,
  baseMetrics: ICEAssetMetrics,
  contract: ICEAssetContract,
  budget: ICEBudgetProfile,
): { bytes: Uint8Array; metrics: ICEAssetMetrics; budget: ICEBudgetResult } => {
  let previousSignature = '';
  let contractValue = contract;
  for (let pass = 0; pass < 3; pass += 1) {
    const packed = packGLB(withContract(json, contractValue), binary);
    const metrics = measurePackedMetrics(packed, baseMetrics);
    const budgetResult = evaluateAssetBudget(metrics, budget);
    const signature = `${metrics.encodedBytes}:${budgetResult.status}`;
    if (signature === previousSignature) {
      return { bytes: packed, metrics, budget: budgetResult };
    }
    previousSignature = signature;
    contractValue = {
      ...contract,
      stats: contractStats(metrics),
      budget: {
        profile: budget.id,
        status: budgetResult.status,
        warningCount: budgetResult.warningCount,
        errorCount: budgetResult.errorCount,
      },
    };
  }
  throw new Error('ICE3_TOOL_BUDGET_UNSTABLE: final GLB size did not converge');
};
```

向 `ICEAssetContract` 添加 budget 成员：

```ts
readonly budget: Readonly<{
  profile: string;
  status: 'pass' | 'warning' | 'error';
  warningCount: number;
  errorCount: number;
}>;
```

定义上面使用的两个辅助函数：

```ts
const withContract = (
  json: JSONRecord,
  contract: ICEAssetContract,
): JSONRecord => {
  const asset = record(json.asset)!;
  const extras = record(asset.extras)!;
  const ice3 = record(extras.ice3)!;
  return {
    ...json,
    asset: {
      ...asset,
      extras: {
        ...extras,
        ice3: {
          ...ice3,
          contractVersion: contract.contractVersion,
          stats: contract.stats,
          preparation: contract.preparation,
          budget: contract.budget,
        },
      },
    },
  };
};

const measurePackedMetrics = (
  packed: Uint8Array,
  base: ICEAssetMetrics,
): ICEAssetMetrics => {
  const buffer = Buffer.from(packed);
  const jsonChunkBytes = buffer.readUInt32LE(12);
  const binHeader = 20 + jsonChunkBytes;
  const binChunkBytes = buffer.readUInt32LE(binHeader);
  return {
    ...base,
    encodedBytes: packed.byteLength,
    jsonChunkBytes,
    binChunkBytes,
  };
};
```

`measurePackedMetrics()` 必须：

- 从打包后的 GLB 读取实际 JSON 块填充后字节长度和 BIN 块长度。
- 将 `encodedBytes` 设置为 `packed.byteLength`。
- 保留构建器提供的结构指标。

`asset.extras.ice3` 对象必须包含：

```ts
{
  profile: 'ice3-prepared',
  profileVersion: '1.0',
  contractVersion: '1.0',
  assetId,
  contentDigest,
  coordinateSystem,
  colorSpace: 'srgb',
  bounds,
  stats,
  preparation: {
    runtimeConversionRequired: false,
    sourceFormat: 'gltf-2.0',
    unitsNormalized: true,
    matrixTransformsBaked: true,
    requiredCompressionDecoded: true,
    edgesPrepared: options.edges !== false,
    selectionGroupsPrepared: true,
    options: {
      creaseAngleDegrees,
      edges: options.edges !== false,
    },
  },
  budget: {
    profile: budget.id,
    status,
    warningCount,
    errorCount,
  },
}
```

验证必须：

- 为向后兼容，接受缺少契约字段的配置文件。
- 存在时要求 `contractVersion === '1.0'`。
- 要求 `preparation.runtimeConversionRequired === false`。
- 要求所有扩展统计与结构计数一致。
- 当且仅当 `status === 'error'` 时要求 `errorCount > 0`，并拒绝与状态矛盾的 `warningCount`/`errorCount` 组合。
- 对于内置预算配置文件 ID，根据嵌入指标重新计算结果并要求完全一致。自定义配置文件限制保存在可选报告中；嵌入的自定义配置文件摘要只做结构验证。

- [ ] **步骤 4：验证 GREEN**

运行：

```bash
npm test -- tests/output/buildPreparedGLB.test.ts tests/output/validatePreparedGLB.test.ts
npm run typecheck
```

预期：通过。

- [ ] **步骤 5：提交**

```bash
git add packages/toolchain-core/src/output/buildPreparedGLB.ts \
  packages/toolchain-core/src/output/validatePreparedGLB.ts \
  tests/output/buildPreparedGLB.test.ts \
  tests/output/validatePreparedGLB.test.ts
git commit -m "feat(toolchain): embed asset preparation contract"
```

---

### 任务 4：生成 sidecar 报告并执行 CLI 预算

**仓库：** `ice3-toolchain`

**文件：**
- 新建：`packages/toolchain-core/src/output/createAssetReport.ts`
- 新建：`tests/output/createAssetReport.test.ts`
- 修改：`packages/toolchain-core/src/index.ts`
- 修改：`packages/cli/src/commands.ts`
- 修改：`tests/cli/commands.test.ts`
- 修改：`README.md`

**接口：**
- 使用：最终 GLB 字节、构建指标、验证和预算结果。
- 产出：`ICEAssetReport`、`createAssetReport()`。
- 产出 CLI 标志：`--report <file>`、`--budget <profile-or-json>`、`--warnings-as-errors`。

- [ ] **步骤 1：编写失败的报告和 CLI 测试**

添加到 `tests/output/createAssetReport.test.ts`：

```ts
test('creates a deterministic report without source paths', () => {
  const metrics = {
    encodedBytes: 400,
    jsonChunkBytes: 100,
    binChunkBytes: 300,
    nodeCount: 1,
    maxNodeDepth: 0,
    meshCount: 1,
    primitiveCount: 2,
    triangleCount: 1,
    edgeSegmentCount: 3,
    materialCount: 2,
    selectionGroupCount: 1,
  };
  const budget = {
    profile: 'interactive-desktop-v1',
    status: 'pass' as const,
    warningCount: 0,
    errorCount: 0,
    checks: [],
  };
  const report = createAssetReport({
    toolVersion: '0.0.0',
    sourceFormat: 'gltf-2.0',
    sourceDigest: `sha256:${'a'.repeat(64)}`,
    assetId: 'sample',
    profileVersion: '1.0',
    contractVersion: '1.0',
    contentDigest: `sha256:${'b'.repeat(64)}`,
    metrics,
    budget,
    diagnostics: [],
  });
  expect(report.kind).toBe('ice3-asset-report');
  expect(report.status).toBe('pass');
  expect(JSON.stringify(report)).not.toContain('/Users/');
  expect(JSON.stringify(report)).not.toContain('sourcePath');
});
```

添加 CLI 测试：

```ts
test('build writes a report and fails hard budgets before publishing GLB', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'ice3-cli-budget-'));
  directories.push(directory);
  const minimalSource = 'tests/fixtures/minimal.gltf';
  const output = join(directory, 'asset.glb');
  const reportPath = join(directory, 'asset.report.json');
  const exitCode = await runCli([
    'build',
    minimalSource,
    '--output',
    output,
    '--report',
    reportPath,
    '--budget',
    'interactive-desktop-v1',
    '--json',
  ]);
  expect(exitCode).toBe(0);
  expect(JSON.parse(await readFile(reportPath, 'utf8')).kind)
    .toBe('ice3-asset-report');

  const rejectedOutput = join(directory, 'rejected.glb');
  const tinyHardBudgetPath = join(directory, 'tiny-budget.json');
  writeFileSync(tinyHardBudgetPath, JSON.stringify({
    id: 'tiny',
    limits: [{
      id: 'triangleCount',
      label: 'Triangles',
      softLimit: 0,
      hardLimit: 0,
    }],
  }));
  const rejected = await runCli([
    'build',
    minimalSource,
    '--output',
    rejectedOutput,
    '--budget',
    tinyHardBudgetPath,
    '--json',
  ]);
  expect(rejected).not.toBe(0);
  await expect(readFile(rejectedOutput)).rejects.toThrow();
});
```

- [ ] **步骤 2：验证 RED**

运行：

```bash
npm test -- tests/output/createAssetReport.test.ts tests/cli/commands.test.ts
```

预期：失败，因为报告生成和 CLI 标志尚不存在。

- [ ] **步骤 3：实现报告和 CLI 行为**

报告结构严格遵循契约。`createAssetReport()` 按固定指标顺序对预算检查排序，并按 `code`、再按 `message` 对诊断排序。它绝不添加时间戳或绝对路径。当存在任何错误诊断或预算错误时，报告状态为 `error`；否则当存在任何警告诊断或预算警告时为 `warning`；否则为 `pass`。

创建公共报告类型：

```ts
export interface ICEAssetReportDiagnostic {
  readonly code: string;
  readonly severity: 'error' | 'warning' | 'info';
  readonly message: string;
  readonly path?: string;
}

export interface ICEAssetReportInput {
  readonly toolVersion: string;
  readonly sourceFormat: 'gltf-2.0' | 'ice3-prepared';
  readonly sourceDigest: string;
  readonly assetId: string;
  readonly profileVersion: string;
  readonly contractVersion: string;
  readonly contentDigest: string;
  readonly metrics: ICEAssetMetrics;
  readonly budget: ICEBudgetResult;
  readonly diagnostics: readonly ICEAssetReportDiagnostic[];
}

export interface ICEAssetReport {
  readonly kind: 'ice3-asset-report';
  readonly schemaVersion: '1.0';
  readonly asset: Readonly<{
    id: string;
    profileVersion: string;
    contractVersion: string;
    contentDigest: string;
  }>;
  readonly status: 'pass' | 'warning' | 'error';
  readonly tool: Readonly<{ name: 'ice3-toolchain'; version: string }>;
  readonly source: Readonly<{
    format: 'gltf-2.0' | 'ice3-prepared';
    digest: string;
  }>;
  readonly metrics: ICEAssetMetrics;
  readonly budget: ICEBudgetResult;
  readonly diagnostics: readonly ICEAssetReportDiagnostic[];
}
```

根据原始源文件字节计算源摘要：

```ts
const sourceDigest = `sha256:${
  createHash('sha256').update(await readFile(sourcePath)).digest('hex')
}`;
```

在 CLI 启动时读取工具版本：

```ts
const packageJson = JSON.parse(await readFile(
  new URL('../../../package.json', import.meta.url),
  'utf8',
)) as { version: string };
const toolVersion = packageJson.version;
```

预算选择：

```ts
const resolveBudget = async (
  value: string | undefined,
): Promise<ICEBudgetProfile> => {
  const selected = value ?? 'interactive-desktop-v1';
  if (Object.hasOwn(BUDGET_PROFILES, selected)) {
    return BUDGET_PROFILES[selected]!;
  }
  const parsed = JSON.parse(await readFile(resolve(selected), 'utf8'));
  return validateBudgetProfile(parsed);
};
```

构建行为：

1. 解析源和预算。
2. 构建最终 GLB。
3. 当预算状态为 `error` 时拒绝并返回非零值。
4. 仅当存在 `--warnings-as-errors` 时，对 `warning` 返回非零值；此模式下不要发布任一制品。
5. 在发布 GLB 前将可选报告写入临时文件。
6. 通过临时文件写入 GLB，并重命名两者。
7. 如果报告写入失败，报告 `ICE3_TOOL_REPORT_WRITE_FAILED`，且不要发布 GLB。

命令解析添加：

```ts
new Set([
  '--output',
  '--asset-id',
  '--crease-angle',
  '--report',
  '--budget',
])
```

`--warnings-as-errors` 仍为标志。

- [ ] **步骤 4：验证 GREEN**

运行：

```bash
npm test -- tests/output/createAssetReport.test.ts tests/cli/commands.test.ts
npm run typecheck
npm run verify
```

预期：通过。

- [ ] **步骤 5：提交**

```bash
git add packages/toolchain-core/src/output/createAssetReport.ts \
  packages/toolchain-core/src/index.ts \
  packages/cli/src/commands.ts \
  tests/output/createAssetReport.test.ts \
  tests/cli/commands.test.ts \
  README.md
git commit -m "feat(cli): write asset reports and enforce budgets"
```

---

### 任务 5：在引擎 Asset 中读取并验证契约

**仓库：** `ice3-engine`

**文件：**
- 修改：`packages/assets/src/ICEPreparedGLB.ts`
- 修改：`packages/assets/src/ICEProfileValidator.ts`
- 修改：`packages/assets/src/ICEGLBReader.ts`
- 修改：`packages/assets/tests/createFixture.ts`
- 修改：`packages/assets/tests/GLBReader.test.ts`

**接口：**
- 产出：`ICEPreparedContract` 和 `ICEPreparedStats`。
- 产出：`ICEPreparedAssetSnapshot.contract`。
- 产出诊断：`ICE3_ASSET_CONTRACT_MISSING`、`ICE3_ASSET_CONTRACT_UNSUPPORTED`、`ICE3_ASSET_STATS_MISMATCH`。

- [ ] **步骤 1：编写失败的读取器测试**

添加：

```ts
test('reads v1 contract, preparation, extended stats, and budget', () => {
  const snapshot = readPreparedGLB(createMinimalPreparedGLB());
  expect(snapshot.contract).toEqual({
    version: '1.0',
    preparation: expect.objectContaining({
      runtimeConversionRequired: false,
      matrixTransformsBaked: true,
    }),
    budget: expect.objectContaining({
      profile: 'interactive-desktop-v1',
      status: 'pass',
    }),
  });
  expect(snapshot.stats).toMatchObject({
    primitiveCount: 2,
    materialCount: 2,
    selectionGroupCount: 1,
  });
});

test('rejects unsupported contract majors and runtime conversion', () => {
  expect(() => readPreparedGLB(
    createMinimalPreparedGLB({ contract: 'unsupported' }),
  ))
    .toThrow(/ICE3_ASSET_CONTRACT_UNSUPPORTED/);

  expect(() => readPreparedGLB(
    createMinimalPreparedGLB({ contract: 'conversion' }),
  ))
    .toThrow(/ICE3_TOOL_RUNTIME_CONVERSION_REQUIRED/);
});

test('loads legacy assets without a contract', () => {
  expect(readPreparedGLB(
    createMinimalPreparedGLB({ contract: 'legacy' }),
  ).contract.status).toBe('legacy');
});
```

- [ ] **步骤 2：验证 RED**

运行：

```bash
npm test -- packages/assets/tests/GLBReader.test.ts
```

预期：失败，因为契约快照尚不存在。

- [ ] **步骤 3：实现契约读取和兼容性**

类型：

```ts
export interface ICEPreparedStats {
  readonly nodeCount: number;
  readonly maxNodeDepth: number;
  readonly meshCount: number;
  readonly primitiveCount: number;
  readonly triangleCount: number;
  readonly edgeSegmentCount: number;
  readonly materialCount: number;
  readonly selectionGroupCount: number;
}

export interface ICEPreparedContract {
  readonly status: 'active' | 'legacy';
  readonly version?: string;
  readonly preparation?: Readonly<{
    runtimeConversionRequired: false;
    sourceFormat: 'gltf-2.0';
    unitsNormalized: true;
    matrixTransformsBaked: true;
    requiredCompressionDecoded: true;
    edgesPrepared: boolean;
    selectionGroupsPrepared: true;
  }>;
  readonly budget?: Readonly<{
    profile: string;
    status: 'pass' | 'warning' | 'error';
    warningCount: number;
    errorCount: number;
  }>;
}
```

验证器顺序：

1. 执行现有基础配置文件验证。
2. 如果 `contractVersion` 不存在，设置 `status: 'legacy'`。
3. 如果存在但不是受支持的 `1.x`，抛出 `ICE3_ASSET_CONTRACT_UNSUPPORTED`。
4. 拒绝 `preparation.runtimeConversionRequired !== false`。
5. 验证所有嵌入统计字段均为非负整数。
6. 读取所有 Mesh/Material 后，计算实际数量并与嵌入统计比较；抛出 `ICE3_ASSET_STATS_MISMATCH`。

对于 legacy 统计，使用实际结构计数填充缺失字段。

扩展 `FixtureOptions`：

```ts
readonly contract?: 'active' | 'legacy' | 'unsupported' | 'conversion';
```

新建 fixture GLB 时默认使用 `active`。fixture 构建器必须输出 `contractVersion`、扩展 `stats`、`preparation` 和 `budget`；`legacy` 模式省略这些字段，`unsupported` 写入版本 `2.0`，`conversion` 写入 `runtimeConversionRequired: true`。

- [ ] **步骤 4：验证 GREEN**

运行：

```bash
npm test -- packages/assets
npm run typecheck
```

预期：通过。

- [ ] **步骤 5：提交**

```bash
git add packages/assets/src/ICEPreparedGLB.ts \
  packages/assets/src/ICEProfileValidator.ts \
  packages/assets/src/ICEGLBReader.ts \
  packages/assets/tests/createFixture.ts \
  packages/assets/tests/GLBReader.test.ts
git commit -m "feat(assets): read asset preparation contract"
```

---

### 任务 6：暴露契约和运行时指标

**仓库：** `ice3-engine`

**文件：**
- 修改：`packages/runtime/src/asset/ICEAssetLoader.ts`
- 修改：`packages/runtime/tests/AssetLoader.test.ts`
- 修改：`packages/renderer/src/types.ts`
- 修改：`packages/renderer/src/FakeRendererBackend.ts`
- 修改：`packages/runtime/src/ICE3.ts`
- 修改：`packages/runtime/tests/EngineLifecycle.test.ts`

**接口：**
- 产出：`ICEAssetHandle.contract: ICEPreparedContract`。
- 产出：`ICERendererBackend.stats?: ICERendererStats`。
- 产出：`ICEEngineDiagnostics.renderer`。
- 产出：`ICE3.reportDiagnostic(code, message, severity?)`。

- [ ] **步骤 1：编写失败的 API 和诊断测试**

添加：

```ts
test('exposes the declared asset contract on the handle', async () => {
  const handle = await loader.load('/asset.glb');
  expect(handle.contract.status).toBe('active');
  expect(handle.contract.budget?.profile).toBe('interactive-desktop-v1');
});

test('reports renderer metrics alongside engine frame metrics', () => {
  const engine = new ICE3({
    backend: new FakeRendererBackend({
      stats: { drawCalls: 3, renderedMeshes: 1, gpuBytes: 2048 },
    }),
  });
  const diagnostics = engine.getDiagnostics();
  expect(diagnostics.renderer).toEqual({
    drawCalls: 3,
    renderedMeshes: 1,
    gpuBytes: 2048,
  });
});

test('emits a warning when loading a legacy asset', async () => {
  const engine = new ICE3({ backend: new FakeRendererBackend() });
  const diagnostics: string[] = [];
  engine.on<{ code: string }>('DIAGNOSTIC', (event) => {
    if (event.param) diagnostics.push(event.param.code);
  });
  const loader = new ICEAssetLoader(engine, {
    fetch: vi.fn(async () => new Response(
      createMinimalPreparedGLB({ contract: 'legacy' }),
    )),
  });
  await loader.load('/legacy.glb');
  expect(diagnostics).toContain('ICE3_ASSET_CONTRACT_MISSING');
});
```

- [ ] **步骤 2：验证 RED**

运行：

```bash
npm test -- packages/runtime/tests/AssetLoader.test.ts \
  packages/runtime/tests/EngineLifecycle.test.ts
```

预期：失败，因为句柄和诊断字段尚不存在。

- [ ] **步骤 3：实现公共运行时元数据**

扩展：

```ts
export interface ICEAssetHandle {
  readonly id: string;
  readonly scene: ICEScene;
  readonly bounds: ICEGeometryBounds;
  readonly stats: ICEPreparedStats;
  readonly contract: ICEPreparedContract;
  dispose(): void;
}
```

从 `load()` 返回 `cached.snapshot.contract` 和 `cached.snapshot.stats`。

渲染器契约：

```ts
export interface ICERendererStats {
  readonly drawCalls: number;
  readonly renderedMeshes: number;
  readonly gpuBytes: number;
}

export interface ICERendererBackend {
  readonly stats?: Readonly<ICERendererStats>;
}
```

为 `FakeRendererBackend` 选项添加可选 `stats`，默认值为 `{ drawCalls: 0, renderedMeshes: 0, gpuBytes: 0 }`。WebGL2 后端已经具有兼容的 `stats` getter。

诊断：

```ts
readonly renderer: Readonly<{
  drawCalls: number;
  renderedMeshes: number;
  gpuBytes: number;
}>;
```

使用 `this.backend.stats ?? { drawCalls: 0, renderedMeshes: 0, gpuBytes: 0 }`。

将引擎现有的私有诊断记录器提升为：

```ts
reportDiagnostic(
  code: string,
  message: string,
  severity: ICEDiagnostic['severity'] = 'error',
): this {
  this.assertActive();
  this.lastDiagnostic = { severity, code, message };
  this.trigger('DIAGNOSTIC', this.lastDiagnostic);
  return this;
}
```

将内部 `recordDiagnostic()` 调用替换为 `reportDiagnostic()`。读取 legacy Asset 后，`ICEAssetLoader` 调用：

```ts
this.engine.reportDiagnostic(
  'ICE3_ASSET_CONTRACT_MISSING',
  'Prepared asset has no collaboration contract; using legacy statistics',
  'warning',
);
```

- [ ] **步骤 4：验证 GREEN**

运行：

```bash
npm test -- packages/runtime packages/renderer
npm run typecheck
```

预期：通过。

- [ ] **步骤 5：提交**

```bash
git add packages/runtime/src/asset/ICEAssetLoader.ts \
  packages/runtime/tests/AssetLoader.test.ts \
  packages/renderer/src/types.ts \
  packages/renderer/src/FakeRendererBackend.ts \
  packages/runtime/src/ICE3.ts \
  packages/runtime/tests/EngineLifecycle.test.ts
git commit -m "feat(runtime): expose asset contract diagnostics"
```

---

### 任务 7：冻结并验证跨仓库契约

**仓库：** `ice3-toolchain`、`ice3-engine`、`ice3-doc`

**文件：**
- 修改：`ice3-toolchain/fixtures/prepared-cube.glb`
- 修改：`ice3-toolchain/fixtures/prepared-cube.report.json`
- 修改：`ice3-engine/examples/m1/assets/prepared-cube.glb`
- 修改：`ice3-engine/packages/assets/tests/GLBReader.test.ts`
- 修改：`ice3-toolchain/tests/fixtures/contract.test.ts`
- 修改：`ice3-engine/README.md`
- 修改：`ice3-toolchain/README.md`
- 修改：`ice3-engine/docs/api/m1.md`
- 修改：`ice3-engine/docs/diagnostics.md`
- 修改：`ice3-doc/README.md`

**接口：**
- 使用：启用契约后的最终工具链输出。
- 产出：两个仓库中完全相同的合成 GLB fixture。
- 产出：指向规范契约的文档链接。

- [ ] **步骤 1：重新生成合成 fixture**

在 `ice3-toolchain` 中运行：

```bash
node packages/cli/dist/main.js build tests/fixtures/cube.gltf \
  --output fixtures/prepared-cube.glb \
  --report fixtures/prepared-cube.report.json \
  --budget interactive-desktop-v1 \
  --asset-id prepared-cube \
  --json
```

仅将合成 GLB 复制到引擎：

```bash
cp fixtures/prepared-cube.glb \
  ../ice3-engine/examples/m1/assets/prepared-cube.glb
```

- [ ] **步骤 2：添加失败的跨仓库一致性测试**

工具链：

```ts
test('fixture report matches the frozen GLB contract', async () => {
  const bytes = await readFile(fixtureGlb);
  const report = JSON.parse(await readFile(fixtureReport, 'utf8'));
  const profile = readProfile(bytes);
  expect(report.asset.contentDigest).toBe(
    `sha256:${profile.contentDigest.value}`,
  );
  expect(report.metrics).toMatchObject(profile.stats);
});
```

在工具链 fixture 测试中使用以下本地辅助函数：

```ts
const readProfile = (bytes: Uint8Array): {
  contentDigest: { value: string };
  stats: Record<string, unknown>;
} => {
  const buffer = Buffer.from(bytes);
  const length = buffer.readUInt32LE(12);
  const json = JSON.parse(
    buffer.subarray(20, 20 + length).toString('utf8').trimEnd(),
  );
  return json.asset.extras.ice3;
};
```

引擎：

```ts
test('frozen toolchain fixture exposes the v1 contract', async () => {
  const bytes = await readFile(
    new URL('../../../examples/m1/assets/prepared-cube.glb', import.meta.url),
  );
  const snapshot = readPreparedGLB(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  );
  expect(snapshot.contract).toMatchObject({
    status: 'active',
    version: '1.0',
    budget: { profile: 'interactive-desktop-v1', status: 'pass' },
  });
});
```

- [ ] **步骤 3：验证 fixture 哈希一致**

从共享 Workspace 运行：

```bash
shasum -a 256 ice3-toolchain/fixtures/prepared-cube.glb \
  ice3-engine/examples/m1/assets/prepared-cube.glb
```

预期：两个哈希完全相同。

- [ ] **步骤 4：更新文档和诊断**

两个仓库的 README 均声明：

```md
Cross-repository asset formats, shared metrics, budgets, compatibility, and
diagnostic codes are defined by the canonical
`ice3-doc/docs/contracts/asset-preparation-contract-v1.md` contract.
```

引擎诊断表添加：

- `ICE3_ASSET_CONTRACT_MISSING`
- `ICE3_ASSET_CONTRACT_UNSUPPORTED`
- `ICE3_ASSET_STATS_MISMATCH`
- `ICE3_TOOL_RUNTIME_CONVERSION_REQUIRED`

工具链文档添加报告和预算标志。

- [ ] **步骤 5：在两个仓库中运行完整验证**

工具链：

```bash
npm run verify
```

引擎：

```bash
npm run verify
npm pack --workspaces --dry-run
```

预期：所有架构、类型、单元、集成、Chromium 和 WebKit 测试均通过；打包文件不包含客户 Asset。

- [ ] **步骤 6：审查名称和 Asset**

在每个仓库中：

```bash
git status --short --branch
git diff --check
git ls-files '*.glb' '*.gltf'
git status --short --ignored
```

根据 `AGENTS.md` 手动审查每个已更改的文档和源文件。仅可跟踪合成的 `prepared-cube.glb` fixture。

- [ ] **步骤 7：提交并合并每个仓库**

工具链：

```bash
git add fixtures/prepared-cube.glb fixtures/prepared-cube.report.json \
  tests/fixtures/contract.test.ts README.md
git commit -m "test(toolchain): freeze asset preparation contract"
git switch main
git merge --ff-only feature/asset-preparation-contract
```

引擎：

```bash
git add examples/m1/assets/prepared-cube.glb \
  packages/assets/tests/GLBReader.test.ts \
  README.md docs/api/m1.md docs/diagnostics.md
git commit -m "test(engine): freeze asset preparation contract"
git switch main
git merge --ff-only feature/asset-preparation-contract
```

文档：

```bash
git add README.md
git commit -m "docs: link asset contract consumers"
git switch main
git merge --ff-only docs/asset-contract-implementation-plan
```

所有仓库在 `main` 上均通过后，重启 M1 预览，并验证本地合成 fixture 和本地提供的模型，不得提交客户内容或对其截图。

## 相关文档

- `ICE3-DOC-IDX-001` — [文档索引](../README.md)
- `ICE3-DOC-CTR-001` — [Asset Preparation Contract v1](../contracts/asset-preparation-contract-v1.md)
