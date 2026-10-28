# Asset Preparation Contract v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the shared GLB contract, budget evaluation, optional report, engine consumption, and cross-repository verification defined by Asset Preparation Contract v1.

**Architecture:** Toolchain computes canonical metrics and embeds a small runtime contract in each prepared GLB, then optionally writes a deterministic sidecar report for CI and UI use. The engine validates and exposes the embedded contract while continuing to reject assets that require runtime conversion; the report is never required at runtime.

**Tech Stack:** TypeScript, Node.js 24, ESM, npm workspaces, GLB, Node.js test runner, Playwright

**Spec:** `docs/contracts/asset-preparation-contract-v1.md`

**Repositories:** `ice3-toolchain`, `ice3-engine`

## Global Constraints

- Use Node 24 LTS and npm 11 or newer.
- Toolchain output remains a standard single-JSON/single-BIN GLB.
- Runtime conversion remains forbidden: `runtimeConversionRequired` must be `false`.
- The GLB is the authoritative runtime artifact; the JSON report is optional.
- Do not add runtime dependencies.
- Keep `@ice3/core` independent of DOM, Canvas, GPU, and sibling packages.
- Do not import private source paths across repositories.
- No real customer model, derived preview, source path, screenshot, or report may be committed.
- Automated fixtures must be synthetic or explicitly distributable.
- Do not use competitor or vendor product names in code, docs, comments, commits, or examples.
- Use a feature branch in each repository and merge to that repository's `main` only after its full verification gate passes.
- Toolchain and engine migrations must remain compatible: existing prepared assets without a contract load with `ICE3_ASSET_CONTRACT_MISSING`.
- Exact optional property types are enabled in engine TypeScript; conditionally spread optional values.

## Review Focus

- A reported budget at the exact soft or hard boundary must not be classified as exceeding that boundary.
- Embedding `encodedBytes` must converge to a stable final GLB rather than reporting budget status against the provisional file.
- Reports must be deterministic and must not disclose source paths or customer filenames.
- Old assets without `contractVersion` must load with a warning, while unsupported major versions and runtime-conversion requests must fail.
- Runtime metrics must distinguish declared asset counts, actual instantiated counts, and renderer draw/GPU metrics.

## File Structure

### `ice3-toolchain`

**Create**

- `packages/toolchain-core/src/output/assetContract.ts`: shared contract types, constants, metric normalization, and budget result shapes.
- `packages/toolchain-core/src/output/evaluateAssetBudget.ts`: built-in budget profiles and deterministic threshold evaluation.
- `packages/toolchain-core/src/output/createAssetReport.ts`: canonical sidecar report construction.
- `tests/output/assetContract.test.ts`: contract and report shape tests.
- `tests/output/evaluateAssetBudget.test.ts`: boundary and profile tests.

**Modify**

- `packages/toolchain-core/src/output/buildPreparedGLB.ts`: compute metrics and embed contract; finalize byte-dependent budget status.
- `packages/toolchain-core/src/output/validatePreparedGLB.ts`: validate the embedded contract.
- `packages/toolchain-core/src/index.ts`: export contract and budget APIs.
- `packages/cli/src/commands.ts`: budget selection, report output, and warning exit policy.
- `tests/cli/commands.test.ts`: CLI behavior.
- `fixtures/prepared-cube.glb`: regenerated synthetic contract fixture.
- `fixtures/prepared-cube.report.json`: regenerated synthetic report.
- `README.md`: command and budget documentation.

### `ice3-engine`

**Modify**

- `packages/assets/src/ICEPreparedGLB.ts`: contract snapshot types.
- `packages/assets/src/ICEProfileValidator.ts`: contract compatibility checks.
- `packages/assets/src/ICEGLBReader.ts`: contract and extended metric extraction.
- `packages/assets/tests/createFixture.ts`: contract fixture metadata.
- `packages/assets/tests/GLBReader.test.ts`: old/new contract behavior.
- `packages/runtime/src/asset/ICEAssetLoader.ts`: expose contract in `ICEAssetHandle`.
- `packages/runtime/tests/AssetLoader.test.ts`: handle contract exposure.
- `packages/renderer/src/types.ts`: read-only renderer metrics on the backend contract.
- `packages/renderer/src/FakeRendererBackend.ts`: deterministic test metrics.
- `packages/runtime/src/ICE3.ts`: runtime diagnostics integration.
- `packages/runtime/tests/EngineLifecycle.test.ts`: diagnostics integration.
- `examples/m1/assets/prepared-cube.glb`: copied synthetic contract fixture.
- `README.md` and `docs/api/m1.md`: consume the canonical contract.
- `docs/diagnostics.md`: stable contract diagnostics.

---

### Task 1: Define Toolchain Contract Types and Canonical Metrics

**Repository:** `ice3-toolchain`

**Files:**
- Create: `packages/toolchain-core/src/output/assetContract.ts`
- Create: `tests/output/assetContract.test.ts`
- Modify: `tests/output/buildPreparedGLB.test.ts`
- Modify: `packages/toolchain-core/src/index.ts`

**Interfaces:**
- Produces: `ICE_ASSET_CONTRACT_VERSION = '1.0'`.
- Produces: `ICEAssetMetrics` with `encodedBytes`, `jsonChunkBytes`, `binChunkBytes`, node/depth/mesh/primitive/triangle/edge/material/selection metrics.
- Produces: `ICEAssetPreparation` and `ICEAssetContract`.
- Produces: `contractStats(metrics): ICEAssetContractStats`.

- [ ] **Step 1: Write failing contract metric tests**

Create `tests/output/assetContract.test.ts`:

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

Add a builder assertion in `buildPreparedGLB.test.ts`:

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

Replace the older four-field `first.stats` expectation with the extended
stats object so the test reflects the new canonical shape.

- [ ] **Step 2: Verify RED**

Run:

```bash
npm test -- tests/output/assetContract.test.ts tests/output/buildPreparedGLB.test.ts
```

Expected: FAIL because the contract module and `built.metrics` do not exist.

- [ ] **Step 3: Implement contract types**

Create `assetContract.ts`:

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

Extend `ICEPreparedGLB` return:

```ts
export interface ICEPreparedGLB {
  readonly bytes: Uint8Array;
  readonly stats: ICEAssetContractStats;
  readonly metrics: ICEAssetMetrics;
}
```

Compute `maxNodeDepth` with a deterministic recursive function:

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

Compute `selectionGroupCount` as the number of unique source-node indices that
own at least one triangle primitive. This matches the current contract where
one named mesh node is one equipment unit. Compute material count from
`outputMaterials.length`. `encodedBytes`, JSON chunk, and BIN chunk sizes may
initially be `0`; Task 3 finalizes byte metrics after packing.

- [ ] **Step 4: Verify GREEN**

Run:

```bash
npm test -- tests/output/assetContract.test.ts tests/output/buildPreparedGLB.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/toolchain-core/src/output/assetContract.ts \
  packages/toolchain-core/src/output/buildPreparedGLB.ts \
  packages/toolchain-core/src/index.ts \
  tests/output/assetContract.test.ts \
  tests/output/buildPreparedGLB.test.ts
git commit -m "feat(toolchain): define asset contract metrics"
```

---

### Task 2: Implement Budget Profiles and Boundary Evaluation

**Repository:** `ice3-toolchain`

**Files:**
- Create: `packages/toolchain-core/src/output/evaluateAssetBudget.ts`
- Create: `tests/output/evaluateAssetBudget.test.ts`
- Modify: `packages/toolchain-core/src/index.ts`

**Interfaces:**
- Consumes: `ICEAssetMetrics`.
- Produces: `ICEBudgetLimit`, `ICEBudgetProfile`, `ICEBudgetCheck`, `ICEBudgetResult`.
- Produces: `BUDGET_PROFILES`, `evaluateAssetBudget()`, `validateBudgetProfile()`.

- [ ] **Step 1: Write failing boundary tests**

Create `tests/output/evaluateAssetBudget.test.ts`:

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

- [ ] **Step 2: Verify RED**

Run:

```bash
npm test -- tests/output/evaluateAssetBudget.test.ts
```

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement evaluator and profiles**

Create:

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

Use the exact soft/hard limits from the contract:

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

Classification:

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

Overall status is `error` if any error, otherwise `warning` if any warning, otherwise `pass`.

`validateBudgetProfile(value)` requires a nonempty string `id`, a `limits`
array, known metric IDs, finite nonnegative integers for both limits, and
`softLimit <= hardLimit`. It returns a frozen normalized profile and throws
`ICE3_TOOL_INVALID_BUDGET` otherwise.

- [ ] **Step 4: Verify GREEN**

Run:

```bash
npm test -- tests/output/evaluateAssetBudget.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/toolchain-core/src/output/evaluateAssetBudget.ts \
  packages/toolchain-core/src/index.ts \
  tests/output/evaluateAssetBudget.test.ts
git commit -m "feat(toolchain): evaluate asset budgets"
```

---

### Task 3: Embed the Final Contract in Prepared GLB

**Repository:** `ice3-toolchain`

**Files:**
- Modify: `packages/toolchain-core/src/output/assetContract.ts`
- Modify: `packages/toolchain-core/src/output/buildPreparedGLB.ts`
- Modify: `packages/toolchain-core/src/output/validatePreparedGLB.ts`
- Modify: `tests/output/buildPreparedGLB.test.ts`
- Modify: `tests/output/validatePreparedGLB.test.ts`

**Interfaces:**
- Consumes: `ICEBudgetProfile`, `evaluateAssetBudget()`, `contractStats()`.
- Produces: `ICEBuildOptions.budget?: ICEBudgetProfile`.
- Produces: `ICEAssetContract.budget` with `{ profile, status, warningCount, errorCount }`.
- Produces: final GLB `asset.extras.ice3.contractVersion`, extended `stats`, `preparation`, and `budget`.

- [ ] **Step 1: Write failing embedded-contract tests**

Add to `buildPreparedGLB.test.ts`:

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

Add to `validatePreparedGLB.test.ts`:

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

Use the existing `rewriteJSON()` helper from that test file to define:

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

Define `readProfile()` beside the build test:

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

- [ ] **Step 2: Verify RED**

Run:

```bash
npm test -- tests/output/buildPreparedGLB.test.ts tests/output/validatePreparedGLB.test.ts
```

Expected: FAIL because the GLB does not contain contract, preparation, or budget fields.

- [ ] **Step 3: Implement two-pass finalization**

Add a helper in `buildPreparedGLB.ts`:

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

Add the budget member to `ICEAssetContract`:

```ts
readonly budget: Readonly<{
  profile: string;
  status: 'pass' | 'warning' | 'error';
  warningCount: number;
  errorCount: number;
}>;
```

Define the two helpers used above:

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

`measurePackedMetrics()` must:

- Read the actual JSON chunk padded byte length and BIN chunk length from the packed GLB.
- Set `encodedBytes` to `packed.byteLength`.
- Preserve the structural metrics from the builder.

The `asset.extras.ice3` object must include:

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

Validation must:

- Accept a profile missing contract fields for backward compatibility.
- Require `contractVersion === '1.0'` when present.
- Require `preparation.runtimeConversionRequired === false`.
- Require all extended stats to equal structural counts.
- Require `errorCount > 0` if and only if `status === 'error'`, and reject
  `warningCount`/`errorCount` combinations that contradict the status.
- For built-in budget profile IDs, recompute the result from the embedded
  metrics and require exact agreement. Custom profile limits live in the
  optional report; the embedded custom-profile summary is shape-validated.

- [ ] **Step 4: Verify GREEN**

Run:

```bash
npm test -- tests/output/buildPreparedGLB.test.ts tests/output/validatePreparedGLB.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/toolchain-core/src/output/buildPreparedGLB.ts \
  packages/toolchain-core/src/output/validatePreparedGLB.ts \
  tests/output/buildPreparedGLB.test.ts \
  tests/output/validatePreparedGLB.test.ts
git commit -m "feat(toolchain): embed asset preparation contract"
```

---

### Task 4: Generate Sidecar Reports and Enforce CLI Budgets

**Repository:** `ice3-toolchain`

**Files:**
- Create: `packages/toolchain-core/src/output/createAssetReport.ts`
- Create: `tests/output/createAssetReport.test.ts`
- Modify: `packages/toolchain-core/src/index.ts`
- Modify: `packages/cli/src/commands.ts`
- Modify: `tests/cli/commands.test.ts`
- Modify: `README.md`

**Interfaces:**
- Consumes: final GLB bytes, build metrics, validation, and budget result.
- Produces: `ICEAssetReport`, `createAssetReport()`.
- Produces CLI flags: `--report <file>`, `--budget <profile-or-json>`, `--warnings-as-errors`.

- [ ] **Step 1: Write failing report and CLI tests**

Add to `tests/output/createAssetReport.test.ts`:

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

Add CLI tests:

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

- [ ] **Step 2: Verify RED**

Run:

```bash
npm test -- tests/output/createAssetReport.test.ts tests/cli/commands.test.ts
```

Expected: FAIL because report generation and CLI flags do not exist.

- [ ] **Step 3: Implement report and CLI behavior**

Report shape follows the contract exactly. `createAssetReport()` sorts budget
checks by a fixed metric order and diagnostics by `code`, then `message`. It
never adds timestamps or absolute paths. Report status is `error` when any
error diagnostic or budget error exists, otherwise `warning` when any warning
diagnostic or budget warning exists, otherwise `pass`.

Create the public report types:

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

Compute the source digest from the original source file bytes:

```ts
const sourceDigest = `sha256:${
  createHash('sha256').update(await readFile(sourcePath)).digest('hex')
}`;
```

Read the tool version at CLI startup:

```ts
const packageJson = JSON.parse(await readFile(
  new URL('../../../package.json', import.meta.url),
  'utf8',
)) as { version: string };
const toolVersion = packageJson.version;
```

Budget selection:

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

Build behavior:

1. Resolve source and budget.
2. Build final GLB.
3. Reject and return nonzero when budget status is `error`.
4. Return nonzero for `warning` only when `--warnings-as-errors` is present;
   do not publish either artifact in this mode.
5. Write optional report to a temporary file before GLB publication.
6. Write GLB through its temporary file and rename both.
7. If report write fails, report `ICE3_TOOL_REPORT_WRITE_FAILED` and do not publish GLB.

Command parsing adds:

```ts
new Set([
  '--output',
  '--asset-id',
  '--crease-angle',
  '--report',
  '--budget',
])
```

`--warnings-as-errors` remains a flag.

- [ ] **Step 4: Verify GREEN**

Run:

```bash
npm test -- tests/output/createAssetReport.test.ts tests/cli/commands.test.ts
npm run typecheck
npm run verify
```

Expected: PASS.

- [ ] **Step 5: Commit**

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

### Task 5: Read and Validate the Contract in Engine Assets

**Repository:** `ice3-engine`

**Files:**
- Modify: `packages/assets/src/ICEPreparedGLB.ts`
- Modify: `packages/assets/src/ICEProfileValidator.ts`
- Modify: `packages/assets/src/ICEGLBReader.ts`
- Modify: `packages/assets/tests/createFixture.ts`
- Modify: `packages/assets/tests/GLBReader.test.ts`

**Interfaces:**
- Produces: `ICEPreparedContract` and `ICEPreparedStats`.
- Produces: `ICEPreparedAssetSnapshot.contract`.
- Produces diagnostics: `ICE3_ASSET_CONTRACT_MISSING`, `ICE3_ASSET_CONTRACT_UNSUPPORTED`, `ICE3_ASSET_STATS_MISMATCH`.

- [ ] **Step 1: Write failing reader tests**

Add:

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

- [ ] **Step 2: Verify RED**

Run:

```bash
npm test -- packages/assets/tests/GLBReader.test.ts
```

Expected: FAIL because the contract snapshot does not exist.

- [ ] **Step 3: Implement contract read and compatibility**

Types:

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

Validator order:

1. Existing base profile validation.
2. If `contractVersion` is absent, set `status: 'legacy'`.
3. If present and not a supported `1.x`, throw `ICE3_ASSET_CONTRACT_UNSUPPORTED`.
4. Reject `preparation.runtimeConversionRequired !== false`.
5. Validate all embedded stat fields are nonnegative integers.
6. After reading all meshes/materials, compute actual counts and compare to embedded stats; throw `ICE3_ASSET_STATS_MISMATCH`.

For legacy stats, fill missing fields with actual structural counts.

Extend `FixtureOptions`:

```ts
readonly contract?: 'active' | 'legacy' | 'unsupported' | 'conversion';
```

Default to `active` for newly created fixture GLBs. The fixture builder must
emit `contractVersion`, extended `stats`, `preparation`, and `budget`; the
`legacy` mode omits those fields, `unsupported` writes version `2.0`, and
`conversion` writes `runtimeConversionRequired: true`.

- [ ] **Step 4: Verify GREEN**

Run:

```bash
npm test -- packages/assets
npm run typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/assets/src/ICEPreparedGLB.ts \
  packages/assets/src/ICEProfileValidator.ts \
  packages/assets/src/ICEGLBReader.ts \
  packages/assets/tests/createFixture.ts \
  packages/assets/tests/GLBReader.test.ts
git commit -m "feat(assets): read asset preparation contract"
```

---

### Task 6: Expose Contract and Runtime Metrics

**Repository:** `ice3-engine`

**Files:**
- Modify: `packages/runtime/src/asset/ICEAssetLoader.ts`
- Modify: `packages/runtime/tests/AssetLoader.test.ts`
- Modify: `packages/renderer/src/types.ts`
- Modify: `packages/renderer/src/FakeRendererBackend.ts`
- Modify: `packages/runtime/src/ICE3.ts`
- Modify: `packages/runtime/tests/EngineLifecycle.test.ts`

**Interfaces:**
- Produces: `ICEAssetHandle.contract: ICEPreparedContract`.
- Produces: `ICERendererBackend.stats?: ICERendererStats`.
- Produces: `ICEEngineDiagnostics.renderer`.
- Produces: `ICE3.reportDiagnostic(code, message, severity?)`.

- [ ] **Step 1: Write failing API and diagnostics tests**

Add:

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

- [ ] **Step 2: Verify RED**

Run:

```bash
npm test -- packages/runtime/tests/AssetLoader.test.ts \
  packages/runtime/tests/EngineLifecycle.test.ts
```

Expected: FAIL because the handle and diagnostics fields do not exist.

- [ ] **Step 3: Implement public runtime metadata**

Extend:

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

Return `cached.snapshot.contract` and `cached.snapshot.stats` from `load()`.

Renderer contract:

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

Extend `FakeRendererBackend` options with optional `stats` and default it to
`{ drawCalls: 0, renderedMeshes: 0, gpuBytes: 0 }`. WebGL2 backend already has a
compatible `stats` getter.

Diagnostics:

```ts
readonly renderer: Readonly<{
  drawCalls: number;
  renderedMeshes: number;
  gpuBytes: number;
}>;
```

Use `this.backend.stats ?? { drawCalls: 0, renderedMeshes: 0, gpuBytes: 0 }`.

Promote the engine's existing private diagnostic recorder to:

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

Replace internal `recordDiagnostic()` calls with `reportDiagnostic()`. After a
legacy asset is read, `ICEAssetLoader` calls:

```ts
this.engine.reportDiagnostic(
  'ICE3_ASSET_CONTRACT_MISSING',
  'Prepared asset has no collaboration contract; using legacy statistics',
  'warning',
);
```

- [ ] **Step 4: Verify GREEN**

Run:

```bash
npm test -- packages/runtime packages/renderer
npm run typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

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

### Task 7: Freeze and Verify the Cross-Repository Contract

**Repositories:** `ice3-toolchain`, `ice3-engine`, `ice3-doc`

**Files:**
- Modify: `ice3-toolchain/fixtures/prepared-cube.glb`
- Modify: `ice3-toolchain/fixtures/prepared-cube.report.json`
- Modify: `ice3-engine/examples/m1/assets/prepared-cube.glb`
- Modify: `ice3-engine/packages/assets/tests/GLBReader.test.ts`
- Modify: `ice3-toolchain/tests/fixtures/contract.test.ts`
- Modify: `ice3-engine/README.md`
- Modify: `ice3-toolchain/README.md`
- Modify: `ice3-engine/docs/api/m1.md`
- Modify: `ice3-engine/docs/diagnostics.md`
- Modify: `ice3-doc/README.md`

**Interfaces:**
- Consumes: final contract-enabled toolchain output.
- Produces: identical synthetic GLB fixture in both repositories.
- Produces: documentation links to the canonical contract.

- [ ] **Step 1: Regenerate synthetic fixtures**

Run in `ice3-toolchain`:

```bash
node packages/cli/dist/main.js build tests/fixtures/cube.gltf \
  --output fixtures/prepared-cube.glb \
  --report fixtures/prepared-cube.report.json \
  --budget interactive-desktop-v1 \
  --asset-id prepared-cube \
  --json
```

Copy only the synthetic GLB to the engine:

```bash
cp fixtures/prepared-cube.glb \
  ../ice3-engine/examples/m1/assets/prepared-cube.glb
```

- [ ] **Step 2: Add failing cross-repository identity tests**

Toolchain:

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

Use this local helper in the toolchain fixture test:

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

Engine:

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

- [ ] **Step 3: Verify fixture hash equality**

Run from the shared workspace:

```bash
shasum -a 256 ice3-toolchain/fixtures/prepared-cube.glb \
  ice3-engine/examples/m1/assets/prepared-cube.glb
```

Expected: two identical hashes.

- [ ] **Step 4: Update documentation and diagnostics**

Both repository READMEs state:

```md
Cross-repository asset formats, shared metrics, budgets, compatibility, and
diagnostic codes are defined by the canonical
`ice3-doc/docs/contracts/asset-preparation-contract-v1.md` contract.
```

Engine diagnostics table adds:

- `ICE3_ASSET_CONTRACT_MISSING`
- `ICE3_ASSET_CONTRACT_UNSUPPORTED`
- `ICE3_ASSET_STATS_MISMATCH`
- `ICE3_TOOL_RUNTIME_CONVERSION_REQUIRED`

Toolchain documentation adds report and budget flags.

- [ ] **Step 5: Run full verification in both repositories**

Toolchain:

```bash
npm run verify
```

Engine:

```bash
npm run verify
npm pack --workspaces --dry-run
```

Expected: all architecture, type, unit, integration, Chromium, and WebKit tests pass; packaged files contain no customer assets.

- [ ] **Step 6: Audit names and assets**

In each repository:

```bash
git status --short --branch
git diff --check
git ls-files '*.glb' '*.gltf'
git status --short --ignored
```

Manually review every changed document and source file against `AGENTS.md`.
Only the synthetic `prepared-cube.glb` fixtures may be tracked.

- [ ] **Step 7: Commit and merge each repository**

Toolchain:

```bash
git add fixtures/prepared-cube.glb fixtures/prepared-cube.report.json \
  tests/fixtures/contract.test.ts README.md
git commit -m "test(toolchain): freeze asset preparation contract"
git switch main
git merge --ff-only feature/asset-preparation-contract
```

Engine:

```bash
git add examples/m1/assets/prepared-cube.glb \
  packages/assets/tests/GLBReader.test.ts \
  README.md docs/api/m1.md docs/diagnostics.md
git commit -m "test(engine): freeze asset preparation contract"
git switch main
git merge --ff-only feature/asset-preparation-contract
```

Documentation:

```bash
git add README.md
git commit -m "docs: link asset contract consumers"
git switch main
git merge --ff-only docs/asset-contract-implementation-plan
```

After all repositories are green on `main`, restart the M1 preview and
verify the local synthetic fixture and the locally supplied model without
committing or screenshotting customer content.
