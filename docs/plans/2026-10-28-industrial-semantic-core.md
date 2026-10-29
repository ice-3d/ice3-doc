# 工业语义核心实施计划

> Document ID: ICE3-DOC-PLAN-013
>
> Status: Implemented
>
> Owner: ICE3 架构维护者

> **供智能代理工作者使用：** 需要使用子技能：`superpowers:subagent-driven-development`（推荐）或逐项执行本计划的 `superpowers:executing-plans`。步骤使用复选框（`- [ ]`）跟踪。

**目标：** 构建不依赖浏览器的 `@ice3/industrial-core` 包，包含经过验证的工业清单、实体/类型注册表、关系图、查询引擎、批量状态更新、事件、操作、工作区上下文、序列化以及原生 ICE JSON 适配器。

**架构：** 纯 TypeScript 工作区核心负责不可变领域模型和可变运行时存储。注册表提供索引查询，关系图处理类型化边，`ICEIndustrialWorkspace` 协调上下文变更、批量状态通知、事件、操作和清单序列化，且不引入 DOM、WebGL、HTTP 或 AI 专用概念。

**技术栈：** Node.js 24.22.1 LTS、TypeScript 7、ESM、npm workspaces、Node.js 内置测试运行器、`expect`、`tsx`、兼容 JSON Schema 的 TypeScript 验证

**规格：** `../specs/2026-10-28-industrial-semantic-layer-design.md`

## 全局约束

- 使用 `.nvmrc` 指定的 Node.js 24.22.1 LTS；并使用同一版本运行验证。
- 使用 TypeScript 严格模式和 ESM。
- `@ice3/industrial-core` 的运行时依赖数为零。
- 核心包不得依赖 DOM、浏览器、WebGL、引擎、协议、文件系统、网络或 AI。
- 仓库中不得包含客户资产、派生资产、截图、日志、完整业务数据或客户路径。
- 代码、文档、注释、示例或提交消息中不得出现竞品、厂商或禁止的第三方产品名称。
- 保留公开的 ICE 风格显式工厂/构造函数、不可变快照、稳定 ID、事件和确定性行为。
- 标准映射不属于本计划；本计划只交付规范核心和原生 ICE JSON。
- 浏览器集成、2D/3D 适配器、Studio、协议连接器和 Agent 工具属于独立的后续计划。
- 所有行为变更均遵循 RED-GREEN-REFACTOR。

## 审查重点

- 当清单中存在悬空父级或关系端点时，必须在任何注册表可用之前失败。
- 即使不同实体的显示名称不同，只要外部身份重复，也必须拒绝。
- 存在循环的关系遍历必须在配置的深度和方向上确定性地终止。
- 源时间戳相同或更早的状态补丁不得覆盖更新的有效值。
- 高频状态写入必须合并通知，同时不得丢失最新值或事件顺序。

---

### 任务 1：搭建工业核心脚手架并验证清单

**文件：**
- 创建：`ice3-industrial/.gitignore`
- 创建：`ice3-industrial/.nvmrc`
- 创建：`ice3-industrial/package.json`
- 创建：`ice3-industrial/package-lock.json`
- 创建：`ice3-industrial/tsconfig.base.json`
- 创建：`ice3-industrial/tsconfig.json`
- 创建：`ice3-industrial/scripts/run-tests.mjs`
- 创建：`ice3-industrial/scripts/clean.mjs`
- 创建：`ice3-industrial/tests/architecture/package-boundaries.test.mjs`
- 创建：`ice3-industrial/packages/industrial-core/package.json`
- 创建：`ice3-industrial/packages/industrial-core/tsconfig.json`
- 创建：`ice3-industrial/packages/industrial-core/src/index.ts`
- 创建：`ice3-industrial/packages/industrial-core/src/manifest/ICEIndustrialManifest.ts`
- 创建：`ice3-industrial/packages/industrial-core/src/manifest/parseIndustrialManifest.ts`
- 测试：`ice3-industrial/tests/core/Manifest.test.ts`
- 创建：`ice3-industrial/tests/core/manifestFixture.ts`

**接口：**

```ts
type ICEIndustrialValue =
  | string
  | number
  | boolean
  | null
  | readonly ICEIndustrialValue[]
  | { readonly [key: string]: ICEIndustrialValue };

interface ICEIndustrialExternalId {
  readonly scheme: string;
  readonly value: string;
  readonly scope?: string;
}

interface ICEIndustrialPropertyDefinition {
  readonly id: string;
  readonly label: string;
  readonly dataType: 'string' | 'number' | 'boolean' | 'enum' | 'object';
  readonly unit?: string;
  readonly semanticId?: string;
  readonly readable: boolean;
  readonly writable: boolean;
  readonly enumValues?: readonly string[];
}

interface ICEIndustrialOperationDefinition {
  readonly id: string;
  readonly label: string;
  readonly inputSchema?: Readonly<Record<string, ICEIndustrialValue>>;
  readonly outputSchema?: Readonly<Record<string, ICEIndustrialValue>>;
  readonly requiresConfirmation: boolean;
}

interface ICEIndustrialEntityType {
  readonly id: string;
  readonly label: string;
  readonly parentTypeId?: string;
  readonly propertyDefinitions: readonly ICEIndustrialPropertyDefinition[];
  readonly operationDefinitions: readonly ICEIndustrialOperationDefinition[];
  readonly allowedRelationTypes?: readonly string[];
}

interface ICEIndustrialSpatialBinding {
  readonly selectionIds: readonly string[];
  readonly modelAssetId?: string;
  readonly bounds?: {
    readonly min: readonly [number, number, number];
    readonly max: readonly [number, number, number];
  };
  readonly anchor?: readonly [number, number, number];
  readonly tileIds?: readonly string[];
}

interface ICEIndustrialEntity {
  readonly id: string;
  readonly typeId: string;
  readonly parentId?: string;
  readonly displayName: string;
  readonly description?: string;
  readonly externalIds: readonly ICEIndustrialExternalId[];
  readonly spatial?: ICEIndustrialSpatialBinding;
}

interface ICEIndustrialRelation {
  readonly id: string;
  readonly type: string;
  readonly fromEntityId: string;
  readonly toEntityId: string;
  readonly directed: boolean;
  readonly metadata?: Readonly<Record<string, ICEIndustrialValue>>;
}

interface ICEIndustrialWorkspaceManifest {
  readonly version: '1.0';
  readonly workspaceId: string;
  readonly assetIds: readonly string[];
  readonly entityTypes: readonly ICEIndustrialEntityType[];
  readonly entities: readonly ICEIndustrialEntity[];
  readonly relations: readonly ICEIndustrialRelation[];
}

function parseIndustrialManifest(
  value: unknown,
): Readonly<ICEIndustrialWorkspaceManifest>;
```

- 消费：未知的已解码 JSON 值。
- 产出：经过验证的深度不可变清单，或 `ICE3_INDUSTRIAL_MANIFEST_INVALID`。

- [ ] **步骤 1：编写失败的合法清单测试**

```ts
import { test } from 'node:test';
import { expect } from 'expect';
import { parseIndustrialManifest } from
  '../../packages/industrial-core/src/index.js';
import { manifestFixture } from './manifestFixture.js';

test('parses and freezes a valid workspace manifest', () => {
  const parsed = parseIndustrialManifest(manifestFixture());

  expect(parsed).toMatchObject({
    version: '1.0',
    workspaceId: 'workspace-1',
  });
  expect(parsed.entities[0]!.id).toBe('pump-01');
  expect(Object.isFrozen(parsed)).toBe(true);
  expect(Object.isFrozen(parsed.entities[0])).toBe(true);
});
```

创建 `manifestFixture.ts`，其中包含一个 `pump` 类型、`pump-01`、`valve-01`，以及一个 `ice:connectedTo` 关系。

- [ ] **步骤 2：运行测试并验证 RED**

运行：

```bash
cd ../ice3-industrial
source ~/.nvm/nvm.sh && nvm use 24
npm test -- tests/core/Manifest.test.ts
```

预期：FAIL，因为工作区/包不存在。

- [ ] **步骤 3：搭建工作区**

使用共享脚本创建根工作区和核心包：

```json
{
  "scripts": {
    "clean": "node scripts/clean.mjs",
    "build": "npm run clean && tsc -b",
    "typecheck": "tsc -b --pretty false",
    "test": "node scripts/run-tests.mjs",
    "test:architecture": "node --test tests/architecture/package-boundaries.test.mjs",
    "verify": "npm run test:architecture && npm run typecheck && npm test"
  }
}
```

根开发依赖：

```json
{
  "@types/node": "24.19.2",
  "typescript": "7.0.2",
  "expect": "30.5.2",
    "jest-mock": "30.5.2",
    "tsx": "4.23.15"
}
```

创建包清单后运行一次 `npm install`，并提交生成的 `package-lock.json`。

`industrial-core` 包：

```json
{
  "name": "@ice3/industrial-core",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "files": ["dist/**/*.js", "dist/**/*.d.ts", "dist/**/*.map"],
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  }
}
```

使用既有的严格编译器选项，并设置 `lib: ["ES2024"]`；不得包含 DOM。

架构测试会读取两个包清单，并断言 `@ice3/industrial-core` 没有依赖。

- [ ] **步骤 4：实现严格的清单解析**

拒绝：

- 不支持或缺失的 `version`。
- 空的工作区/类型/实体/关系/属性/操作 ID。
- 重复的实体、类型、关系、类型内属性或类型内操作 ID。
- 缺失的实体类型。
- 缺失的实体父级。
- 缺失的关系端点。
- 两个实体具有相同的外部 ID（`scheme + scope + value`）。
- 不可序列化的值、`NaN` 和无穷大。
- 无效的边界、锚点、单位、枚举定义和 schema 记录。

所有失败均抛出：

```ts
new Error(`ICE3_INDUSTRIAL_MANIFEST_INVALID: ${detail}`);
```

返回前深度冻结数组、记录、实体/类型对象、关系元数据和 schema。

- [ ] **步骤 5：添加负向清单测试**

添加表驱动用例：

```ts
it.each([
  ['missing entity type', (m) => { m.entities[0].typeId = 'missing'; }],
  ['missing parent', (m) => { m.entities[0].parentId = 'missing'; }],
  ['dangling relation', (m) => { m.relations[0].toEntityId = 'missing'; }],
  ['duplicate entity', (m) => { m.entities[1].id = m.entities[0].id; }],
  ['identity conflict', (m) => {
    m.entities[1].externalIds = [...m.entities[0].externalIds];
  }],
])('rejects %s', (_name, mutate) => {
  const manifest = manifestFixture();
  mutate(manifest);
  expect(() => parseIndustrialManifest(manifest))
    .toThrow(/ICE3_INDUSTRIAL_MANIFEST_INVALID/);
});
```

- [ ] **步骤 6：运行聚焦测试、类型检查和完整测试套件**

```bash
npm test -- tests/core/Manifest.test.ts
npm run typecheck
npm test
```

预期：PASS。

- [ ] **步骤 7：提交**

```bash
git add .
git commit -m "feat(core): scaffold industrial semantic manifests"
```

---

### 任务 2：构建实体、类型和外部身份注册表

**文件：**
- 创建：`ice3-industrial/packages/industrial-core/src/registry/ICEIndustrialTypeRegistry.ts`
- 创建：`ice3-industrial/packages/industrial-core/src/registry/ICEIndustrialEntityRegistry.ts`
- 修改：`ice3-industrial/packages/industrial-core/src/index.ts`
- 测试：`ice3-industrial/tests/core/Registries.test.ts`

**接口：**

```ts
class ICEIndustrialTypeRegistry {
  constructor(types: readonly ICEIndustrialEntityType[]);
  get(id: string): ICEIndustrialEntityType | undefined;
  require(id: string): ICEIndustrialEntityType;
  list(): readonly ICEIndustrialEntityType[];
}

class ICEIndustrialEntityRegistry {
  constructor(
    entities: readonly ICEIndustrialEntity[],
    types: ICEIndustrialTypeRegistry,
  );
  get(id: string): ICEIndustrialEntity | undefined;
  require(id: string): ICEIndustrialEntity;
  findByExternalId(
    scheme: string,
    value: string,
    scope?: string,
  ): ICEIndustrialEntity | undefined;
  byType(typeId: string): readonly ICEIndustrialEntity[];
  children(parentId: string): readonly ICEIndustrialEntity[];
  list(): readonly ICEIndustrialEntity[];
}
```

- 消费：经过验证的清单实体和类型。
- 产出：O(1) 的主键/类型/外部索引以及稳定的排序列表。

- [ ] **步骤 1：编写失败的注册表测试**

```ts
const types = new ICEIndustrialTypeRegistry(manifest.entityTypes);
const entities = new ICEIndustrialEntityRegistry(manifest.entities, types);

expect(entities.require('pump-01').displayName).toBe('Pump 01');
expect(entities.findByExternalId('aas', 'urn:asset:pump-01')?.id)
  .toBe('pump-01');
expect(entities.byType('pump').map((entity) => entity.id))
  .toEqual(['pump-01']);
expect(entities.children('plant-01').map((entity) => entity.id))
  .toEqual(['pump-01', 'valve-01']);
expect(() => entities.require('missing'))
  .toThrow(/ICE3_INDUSTRIAL_UNKNOWN_ENTITY/);
```

- [ ] **步骤 2：验证 RED**

```bash
npm test -- tests/core/Registries.test.ts
```

预期：FAIL，因为相关类不存在。

- [ ] **步骤 3：实现不可变索引**

在构造函数中一次性构建映射；查询时不得重新扫描数组。返回按 ID 排序的冻结列表快照。`require()` 错误使用：

```text
ICE3_INDUSTRIAL_UNKNOWN_TYPE
ICE3_INDUSTRIAL_UNKNOWN_ENTITY
```

- [ ] **步骤 4：添加冲突和排序测试**

验证重复 ID 和外部身份冲突在构造期间抛出，即使调用方绕过了清单解析。验证插入顺序不影响列表排序。

- [ ] **步骤 5：运行聚焦测试、类型检查和完整测试套件**

```bash
npm test -- tests/core/Registries.test.ts
npm run typecheck
npm test
```

预期：PASS。

- [ ] **步骤 6：提交**

```bash
git add packages/industrial-core/src/registry packages/industrial-core/src/index.ts tests/core/Registries.test.ts
git commit -m "feat(core): index industrial entities and identities"
```

---

### 任务 3：添加关系遍历和实体查询

**文件：**
- 创建：`ice3-industrial/packages/industrial-core/src/relation/ICEIndustrialRelationGraph.ts`
- 创建：`ice3-industrial/packages/industrial-core/src/query/ICEIndustrialQuery.ts`
- 修改：`ice3-industrial/packages/industrial-core/src/index.ts`
- 测试：`ice3-industrial/tests/core/Relations.test.ts`
- 测试：`ice3-industrial/tests/core/Queries.test.ts`

**接口：**

```ts
interface ICEIndustrialRelationQuery {
  readonly direction?: 'outgoing' | 'incoming' | 'both';
  readonly types?: readonly string[];
  readonly maxDepth?: number;
}

interface ICEIndustrialEntityQuery {
  readonly ids?: readonly string[];
  readonly typeIds?: readonly string[];
  readonly parentIds?: readonly string[];
  readonly externalIds?: readonly ICEIndustrialExternalId[];
  readonly propertyFilters?: readonly {
    readonly propertyId: string;
    readonly equals?: ICEIndustrialValue;
    readonly quality?: 'good' | 'uncertain' | 'bad';
  }[];
}

class ICEIndustrialRelationGraph {
  constructor(relations: readonly ICEIndustrialRelation[]);
  related(
    entityId: string,
    query?: ICEIndustrialRelationQuery,
  ): readonly ICEIndustrialRelation[];
  reachable(
    entityId: string,
    query?: ICEIndustrialRelationQuery,
  ): readonly string[];
}

class ICEIndustrialQuery {
  constructor(
    entities: ICEIndustrialEntityRegistry,
    relations: ICEIndustrialRelationGraph,
    getState: (
      entityId: string,
      propertyId: string,
    ) => ICEIndustrialPropertyValue | undefined,
  );
  queryEntities(
    query?: ICEIndustrialEntityQuery,
  ): readonly ICEIndustrialEntity[];
}
```

- 消费：关系/实体注册表和状态查询。
- 产出：确定性的关系遍历和查询过滤。

- [ ] **步骤 1：编写失败的关系测试**

```ts
expect(graph.related('pump-01').map((relation) => relation.id))
  .toEqual(['rel-pump-valve']);
expect(graph.related('valve-01', { direction: 'incoming' })
  .map((relation) => relation.id)).toEqual(['rel-pump-valve']);
expect(graph.reachable('pump-01', {
  direction: 'both',
  maxDepth: 2,
})).toEqual(['pump-01', 'valve-01']);
```

- [ ] **步骤 2：验证 RED**

```bash
npm test -- tests/core/Relations.test.ts
```

预期：FAIL，因为关系图不存在。

- [ ] **步骤 3：实现有界图遍历**

维护出站/入站索引。按 ID 对关系去重。遍历保留已访问集合，拒绝负数/非整数深度，并返回按 ID 稳定排序的结果。

- [ ] **步骤 4：编写失败的查询测试**

```ts
expect(query.queryEntities({
  typeIds: ['pump'],
  propertyFilters: [{
    propertyId: 'running',
    equals: true,
    quality: 'good',
  }],
})).toEqual(['pump-01']);
```

覆盖无查询、ID/类型/父级过滤、外部身份、属性质量、未知属性以及确定性排序。

- [ ] **步骤 5：验证查询 RED**

```bash
npm test -- tests/core/Queries.test.ts
```

预期：FAIL，因为查询过滤尚不存在。

- [ ] **步骤 6：实现确定性查询过滤**

查询层使用注册表索引，并且仅通过提供的查询回调读取状态。未知属性过滤会抛出 `ICE3_INDUSTRIAL_UNKNOWN_PROPERTY`。

- [ ] **步骤 7：运行聚焦测试、类型检查和完整测试套件**

```bash
npm test -- tests/core/Relations.test.ts tests/core/Queries.test.ts
npm run typecheck
npm test
```

预期：PASS。

- [ ] **步骤 8：提交**

```bash
git add packages/industrial-core/src/relation packages/industrial-core/src/query packages/industrial-core/src/index.ts tests/core/Relations.test.ts tests/core/Queries.test.ts
git commit -m "feat(core): traverse relations and query entities"
```

---

### 任务 4：实现事务性状态更新和合并通知

**文件：**
- 创建：`ice3-industrial/packages/industrial-core/src/state/ICEIndustrialStateStore.ts`
- 修改：`ice3-industrial/packages/industrial-core/src/index.ts`
- 测试：`ice3-industrial/tests/core/StateStore.test.ts`

**接口：**

```ts
interface ICEIndustrialPropertyValue {
  readonly entityId: string;
  readonly propertyId: string;
  readonly value: ICEIndustrialValue;
  readonly quality: 'good' | 'uncertain' | 'bad';
  readonly sourceTimestamp?: number;
  readonly serverTimestamp?: number;
  readonly source?: string;
}

interface ICEIndustrialStatePatch {
  readonly entityId: string;
  readonly propertyId: string;
  readonly value: ICEIndustrialValue;
  readonly quality: 'good' | 'uncertain' | 'bad';
  readonly sourceTimestamp?: number;
  readonly serverTimestamp?: number;
  readonly source?: string;
}

interface ICEIndustrialStateChange {
  readonly current: ICEIndustrialPropertyValue;
  readonly previous?: ICEIndustrialPropertyValue;
}

class ICEIndustrialStateStore {
  constructor(
    entities: ICEIndustrialEntityRegistry,
    types: ICEIndustrialTypeRegistry,
    schedule?: (callback: () => void) => void,
  );
  get(entityId: string, propertyId: string): ICEIndustrialPropertyValue | undefined;
  snapshot(): ReadonlyMap<string, ICEIndustrialPropertyValue>;
  update(patches: readonly ICEIndustrialStatePatch[]): void;
  subscribe(
    listener: (changes: readonly ICEIndustrialStateChange[]) => void,
  ): () => void;
  flush(): void;
}

class ICEIndustrialEventStore {
  constructor(options?: {
    readonly historyLimit?: number;
  });
  insert(input: ICEIndustrialEventInput): ICEIndustrialEvent;
  list(): readonly ICEIndustrialEvent[];
  subscribe(listener: (event: ICEIndustrialEvent) => void): () => void;
  clear(): void;
  dispose(): void;
}

class ICEIndustrialOperationRegistry {
  register(
    entityId: string,
    operationId: string,
    handler: ICEIndustrialOperationHandler,
  ): () => void;
  execute(
    entityId: string,
    operationId: string,
    input?: Readonly<Record<string, ICEIndustrialValue>>,
    context?: Partial<ICEIndustrialOperationContext>,
  ): Promise<Readonly<Record<string, ICEIndustrialValue>> | void>;
}
```

- 消费：来自 UI、适配器或测试的经过验证的补丁。
- 产出：最新值优先的事务性状态，以及一个合并后的通知。

- [ ] **步骤 1：编写失败的状态测试**

```ts
const scheduled: Array<() => void> = [];
const store = new ICEIndustrialStateStore(entities, types, (callback) => {
  scheduled.push(callback);
});
const changes: readonly ICEIndustrialStateChange[][] = [];
store.subscribe((next) => changes.push(next));

store.update([patch({ propertyId: 'running', value: true, sourceTimestamp: 10 })]);
store.update([patch({ propertyId: 'running', value: false, sourceTimestamp: 20 })]);
expect(store.get('pump-01', 'running')?.value).toBe(false);
expect(changes).toHaveLength(0);
scheduled.shift()!();
expect(changes).toHaveLength(1);
expect(changes[0]).toHaveLength(1);
```

- [ ] **步骤 2：验证 RED**

```bash
npm test -- tests/core/StateStore.test.ts
```

预期：FAIL，因为状态存储不存在。

- [ ] **步骤 3：实现事务性验证**

应用之前验证：

- 实体和属性存在。
- 属性可读。
- 运行时值与声明的数据类型和枚举列表匹配。
- 质量、时间戳和来源有效。

如果有任一补丁无效，则不应用任何补丁，并抛出 `ICE3_INDUSTRIAL_STATE_INVALID`。

- [ ] **步骤 4：实现最新值优先的顺序**

跟踪每个属性的来源版本：

- 更高的 `sourceTimestamp` 获胜。
- 时间戳相同时，只有来源相同才使用较晚到达的值；否则按过期拒绝。
- 缺失时间戳时使用到达顺序。
- 过期补丁会被忽略，并由公开的诊断快照计数。

通知按 `entityId/propertyId` 合并，只调度一次，并按稳定的键顺序投递。

- [ ] **步骤 5：添加过期、质量、未知和类型测试**

覆盖：

- 较早的时间戳不会覆盖。
- 来自另一来源的相同时间戳视为过期。
- 无效类型会拒绝整个批次。
- 未知实体/属性会拒绝。
- 质量不良的状态仍可查询。
- 取消订阅会停止投递。
- `dispose()` 会清除订阅，并拒绝后续更新。

- [ ] **步骤 6：运行聚焦测试、类型检查和完整测试套件**

```bash
npm test -- tests/core/StateStore.test.ts
npm run typecheck
npm test
```

预期：PASS。

- [ ] **步骤 7：提交**

```bash
git add packages/industrial-core/src/state packages/industrial-core/src/index.ts tests/core/StateStore.test.ts
git commit -m "feat(core): batch industrial state updates"
```

---

### 任务 5：添加事件排序和操作注册

**文件：**
- 创建：`ice3-industrial/packages/industrial-core/src/event/ICEIndustrialEventStore.ts`
- 创建：`ice3-industrial/packages/industrial-core/src/operation/ICEIndustrialOperationRegistry.ts`
- 修改：`ice3-industrial/packages/industrial-core/src/index.ts`
- 测试：`ice3-industrial/tests/core/Events.test.ts`
- 测试：`ice3-industrial/tests/core/Operations.test.ts`

**接口：**

```ts
interface ICEIndustrialEventInput {
  readonly id?: string;
  readonly type: string;
  readonly entityId?: string;
  readonly severity: 'info' | 'warning' | 'error' | 'critical';
  readonly timestamp: number;
  readonly source?: string;
  readonly correlationId?: string;
  readonly payload?: Readonly<Record<string, ICEIndustrialValue>>;
}

interface ICEIndustrialOperationContext {
  readonly entityId: string;
  readonly actor?: string;
  readonly source: 'ui' | 'api' | 'automation';
  readonly signal?: AbortSignal;
}

type ICEIndustrialOperationHandler = (
  input: Readonly<Record<string, ICEIndustrialValue>>,
  context: ICEIndustrialOperationContext,
) => Promise<Readonly<Record<string, ICEIndustrialValue>> | void>;
```

- 消费：规范化事件和已注册的处理程序。
- 产出：单调递增的事件序列和经过验证的操作执行。

- [ ] **步骤 1：编写失败的事件测试**

```ts
const first = store.insert({
  type: 'ice:alarmRaised',
  entityId: 'pump-01',
  severity: 'warning',
  timestamp: 100,
});
const second = store.insert({
  type: 'ice:alarmCleared',
  entityId: 'pump-01',
  severity: 'info',
  timestamp: 101,
});

expect(first.sequence).toBe(1);
expect(second.sequence).toBe(2);
expect(store.list().map((event) => event.type))
  .toEqual(['ice:alarmRaised', 'ice:alarmCleared']);
```

- [ ] **步骤 2：验证事件 RED**

```bash
npm test -- tests/core/Events.test.ts
```

预期：FAIL，因为事件存储尚不存在。

- [ ] **步骤 3：实现事件规范化**

验证实体 ID、严重级别、时间戳、载荷和非空类型。未提供事件 ID 时生成一个。维护单调递增序列，以及由构造函数选项提供的有界历史记录。

- [ ] **步骤 4：编写失败的操作测试**

```ts
registry.register('pump-01', 'ice:start', async () => ({ accepted: true }));

await expect(registry.execute('pump-01', 'ice:start', {}, {
  entityId: 'pump-01',
  source: 'api',
})).resolves.toEqual({ accepted: true });
```

- [ ] **步骤 5：验证操作 RED**

```bash
npm test -- tests/core/Operations.test.ts
```

预期：FAIL，因为操作注册尚不存在。

- [ ] **步骤 6：实现操作注册**

要求：

- 实体类型声明该操作。
- 输入满足声明的 schema。
- 处理程序存在，且每个实体/操作组合唯一。
- `requiresConfirmation` 作为能力元数据公开。确认、授权和审计由调用方在 `execute()` 之前完成。

将处理程序失败包装为 `ICE3_INDUSTRIAL_OPERATION_FAILED`；将 `AbortError` 保留为 `ICE3_INDUSTRIAL_OPERATION_CANCELLED`。

- [ ] **步骤 7：运行聚焦测试、类型检查和完整测试套件**

```bash
npm test -- tests/core/Events.test.ts tests/core/Operations.test.ts
npm run typecheck
npm test
```

预期：PASS。

- [ ] **步骤 8：提交**

```bash
git add packages/industrial-core/src/event packages/industrial-core/src/operation packages/industrial-core/src/index.ts tests/core/Events.test.ts tests/core/Operations.test.ts
git commit -m "feat(core): order events and register operations"
```

---

### 任务 6：构建工作区上下文、门面和序列化

**文件：**
- 创建：`ice3-industrial/packages/industrial-core/src/workspace/ICEIndustrialWorkspaceContext.ts`
- 创建：`ice3-industrial/packages/industrial-core/src/workspace/ICEIndustrialWorkspace.ts`
- 创建：`ice3-industrial/packages/industrial-core/src/workspace/serializeIndustrialWorkspace.ts`
- 修改：`ice3-industrial/packages/industrial-core/src/index.ts`
- 测试：`ice3-industrial/tests/core/Workspace.test.ts`
- 测试：`ice3-industrial/tests/core/Serialization.test.ts`

**接口：**

```ts
interface ICEIndustrialFilter {
  readonly id: string;
  readonly entityIds?: readonly string[];
  readonly typeIds?: readonly string[];
  readonly externalIds?: readonly ICEIndustrialExternalId[];
}

interface ICEIndustrialWorkspaceContext {
  readonly selection: readonly string[];
  readonly hiddenEntityIds: readonly string[];
  readonly isolatedEntityIds: readonly string[];
  readonly highlightedEntityIds: readonly string[];
  readonly filters: readonly ICEIndustrialFilter[];
  readonly timeRange?: {
    readonly start?: number;
    readonly end?: number;
  };
}

class ICEIndustrialWorkspace {
  constructor(options: {
    readonly manifest: ICEIndustrialWorkspaceManifest;
    readonly stateScheduler?: (callback: () => void) => void;
    readonly eventHistoryLimit?: number;
  });
  readonly context: ICEIndustrialWorkspaceContext;
  readonly entities: ICEIndustrialEntityRegistry;
  readonly types: ICEIndustrialTypeRegistry;
  readonly relations: ICEIndustrialRelationGraph;
  readonly state: ICEIndustrialStateStore;
  readonly events: ICEIndustrialEventStore;
  readonly operations: ICEIndustrialOperationRegistry;
  queryEntities(
    query?: ICEIndustrialEntityQuery,
  ): readonly ICEIndustrialEntity[];
  updateProperties(patches: readonly ICEIndustrialStatePatch[]): void;
  insertEvent(input: ICEIndustrialEventInput): ICEIndustrialEvent;
  setSelection(ids: readonly string[], options?: {
    readonly source?: string;
  }): void;
  setHidden(ids: readonly string[]): void;
  setIsolated(ids: readonly string[]): void;
  setHighlighted(ids: readonly string[]): void;
  setFilters(filters: readonly ICEIndustrialFilter[]): void;
  resetContext(): void;
  on(type: string, listener: (event: unknown) => void): () => void;
  dispose(): void;
}
```

- 消费：任务 1-5。
- 产出：一个公开的工作区门面，具有稳定的上下文事件。

- [ ] **步骤 1：编写失败的工作区测试**

```ts
const workspace = new ICEIndustrialWorkspace({ manifest });
const contexts: readonly ICEIndustrialWorkspaceContext[] = [];
workspace.on('CONTEXT_CHANGE', (context) => contexts.push(
  context as ICEIndustrialWorkspaceContext,
));

workspace.setSelection(['pump-01'], { source: 'scene' });
expect(workspace.context.selection).toEqual(['pump-01']);
expect(contexts).toHaveLength(1);

workspace.setSelection(['pump-01'], { source: 'scene' });
expect(contexts).toHaveLength(1);
```

- [ ] **步骤 2：验证工作区 RED**

```bash
npm test -- tests/core/Workspace.test.ts
```

预期：FAIL，因为门面不存在。

- [ ] **步骤 3：实现不可变上下文更新**

验证实体 ID，去重并排序，仅在上下文发生实质变化时发出事件，并深度冻结每个发出的上下文。注册表、状态、事件和操作的对外暴露均为只读。

- [ ] **步骤 4：编写失败的序列化测试**

```ts
const first = serializeIndustrialWorkspace(manifest);
const second = serializeIndustrialWorkspace(manifest);

expect(first).toBe(second);
expect(parseIndustrialManifest(JSON.parse(first))).toEqual(manifest);
```

验证对象键插入顺序不影响输出，且动态状态/上下文不包含在输出中。

- [ ] **步骤 5：验证序列化 RED**

```bash
npm test -- tests/core/Serialization.test.ts
```

预期：FAIL，因为确定性序列化尚不存在。

- [ ] **步骤 6：实现确定性序列化**

递归排序对象键，同时保留数组顺序，除非清单定义了与顺序无关的集合；使用契约定义的稳定集合顺序。序列化时使用两空格缩进和末尾换行。

- [ ] **步骤 7：运行聚焦测试、类型检查和完整测试套件**

```bash
npm test -- tests/core/Workspace.test.ts tests/core/Serialization.test.ts
npm run typecheck
npm test
```

预期：PASS。

- [ ] **步骤 8：提交**

```bash
git add packages/industrial-core/src/workspace packages/industrial-core/src/index.ts tests/core/Workspace.test.ts tests/core/Serialization.test.ts
git commit -m "feat(core): expose industrial workspace context"
```

---

### 任务 7：添加原生 ICE JSON 适配器并完成核心验证

**文件：**
- 创建：`ice3-industrial/packages/industrial-core/src/adapter/ICEIndustrialAssetAdapter.ts`
- 创建：`ice3-industrial/packages/industrial-core/src/adapter/ICEIndustrialAdapterRegistry.ts`
- 创建：`ice3-industrial/packages/industrial-core/src/adapter/ICEJsonAdapter.ts`
- 创建：`ice3-industrial/README.md`
- 修改：`ice3-industrial/packages/industrial-core/src/index.ts`
- 测试：`ice3-industrial/tests/core/Adapters.test.ts`
- 测试：`ice3-industrial/tests/core/Performance.test.ts`

**接口：**

```ts
interface ICEIndustrialAssetAdapter {
  readonly id: string;
  import(
    source: Uint8Array | string,
    options?: Readonly<Record<string, unknown>>,
  ): Promise<ICEIndustrialWorkspaceManifest>;
  export(
    manifest: ICEIndustrialWorkspaceManifest,
    options?: Readonly<Record<string, unknown>>,
  ): Promise<Uint8Array | string>;
}

class ICEIndustrialAdapterRegistry {
  register(adapter: ICEIndustrialAssetAdapter): void;
  unregister(id: string): void;
  get(id: string): ICEIndustrialAssetAdapter | undefined;
  require(id: string): ICEIndustrialAssetAdapter;
}

const iceJsonAdapter: ICEIndustrialAssetAdapter;
```

- 消费：任务 1 的解析器和任务 6 的序列化器。
- 产出：确定性的原生导入/导出和适配器生命周期。

- [ ] **步骤 1：编写失败的适配器测试**

```ts
const imported = await iceJsonAdapter.import(JSON.stringify(manifest));
expect(imported.workspaceId).toBe(manifest.workspaceId);

const exported = await iceJsonAdapter.export(manifest);
expect(await iceJsonAdapter.import(exported)).toEqual(manifest);
```

验证重复适配器 ID、未知适配器 ID、格式错误的导入和适配器失败诊断。

- [ ] **步骤 2：验证 RED**

```bash
npm test -- tests/core/Adapters.test.ts
```

预期：FAIL，因为适配器不存在。

- [ ] **步骤 3：实现适配器注册表和原生适配器**

使用稳定的诊断信息：

- `ICE3_INDUSTRIAL_ADAPTER_FAILED`
- 重复适配器 ID 抛出相同代码，并附带具体细节。
- 导入/导出绝不对工作区进行部分修改。

- [ ] **步骤 4：添加大型合成性能测试夹具**

完全在内存中生成：

- 20 种类型下的 10,000 个实体。
- 50,000 个属性定义。
- 100,000 个状态补丁。
- 有界图中的确定性关系。

测试查找、查询、遍历、状态合并和序列化能够在没有过度内存增长的情况下完成。使用适合 CI 的宽松确定性超时；不要断言机器相关的毫秒数。

- [ ] **步骤 5：运行完整核心验证**

```bash
cd ../ice3-industrial
source ~/.nvm/nvm.sh && nvm use 24
npm run verify
npm pack --workspaces --dry-run --json
```

预期：

- 架构测试证明核心依赖数为零。
- 所有单元/集成测试通过。
- 包试运行内容不包含资产、客户数据或日志。

- [ ] **步骤 6：审计命名和隐私**

运行：

```bash
git status --porcelain=v1
git ls-files '*.glb' '*.gltf' '*.bin' '*.png' '*.jpg'
git grep -I -n -i -E "$ICE3_FORBIDDEN_NAME_PATTERN" -- . || true
```

从经批准的本地审查列表设置 `ICE3_FORBIDDEN_NAME_PATTERN`。
预期：没有生成的资产，也没有禁止名称。

- [ ] **步骤 7：提交**

```bash
git add README.md packages/industrial-core/src/adapter packages/industrial-core/src/index.ts tests/core/Adapters.test.ts tests/core/Performance.test.ts
git commit -m "feat(core): add native industrial json adapters"
```

## 相关文档

- `ICE3-DOC-IDX-001` — [文档索引](../README.md)
- `ICE3-DOC-SPEC-009` — [工业语义层规格](../specs/2026-10-28-industrial-semantic-layer-design.md)
