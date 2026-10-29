# ICE3 工业语义层设计规格

> Document ID: ICE3-DOC-SPEC-009
>
> Status: Implemented
>
> Owner: ICE3 architecture maintainers

>

| 项目 | 内容 |
| --- | --- |
| 状态 | 已实现 |
| 版本 | 1.0 |
| 日期 | 2026-10-28 |
| 适用范围 | `ice3-industrial` 领域核心、浏览器场景集成、工作区状态、2D/3D 协同和后续标准适配器 |
| 前置条件 | `ice3` 的场景、Tileset、稳定选择身份、空间查询和工业合批已合入 `main` |

> 2026-10-28：`@ice3/industrial-core` 已完成清单验证、实体与外部身份索引、关系图、查询、事务状态、事件、操作注册、工作区上下文、确定性序列化和原生 ICE JSON 适配器。浏览器场景集成、二维/三维适配器、Studio、协议连接器及行业规则仍按后续独立计划推进。

## 1. 目标

建立独立于渲染引擎和具体客户业务的工业领域语义层，将三维场景中的几何载体映射为稳定、可查询、可操作、可实时更新的工业对象。

这一层必须回答：

- 这是哪个工业实体。
- 实体属于什么类型、区域和层级。
- 实体具有哪些属性、操作和事件。
- 实体与其他对象存在什么关系。
- 实体的当前状态、质量、时间和来源是什么。
- 同一实体在哪些模型、LOD、Tile、批次和 2D 视图中出现。
- 普通应用、二维视图、三维场景和自动化入口如何共享同一选择与上下文。

工业语义层不是渲染器包装，也不是完整 SCADA、BPM、工单或告警规则系统。它提供可复用的工业对象与交互模型，具体行业规则和客户流程由上层应用实现。

## 2. 核心原则

1. **领域核心与浏览器解耦**：语义、关系和状态可以在 Node.js、浏览器和服务端测试中运行。
2. **身份稳定**：内部实体 ID、外部标准身份和三维选择身份分别建模。
3. **静态与动态分离**：实体静态模型可序列化；运行值、质量和事件不写回静态清单。
4. **状态与业务规则分离**：核心提供状态、事件和操作通道，不内置行业规则。
5. **适配器融入生态**：采用开放标准的公共抽象，不在核心中实现完整标准栈。
6. **单一选择真相**：所有选择来源通过工作区提交实体 ID。
7. **无 Agent 专用接口**：UI、业务应用和自动化入口使用相同通用 API。
8. **确定性与可验证性**：查询、事件、序列化和诊断必须稳定可复现。
9. **引擎不感知工业业务**：`ice3` 不出现设备、告警、工单、Agent 或工作区概念。
10. **隐私最小化**：日志、诊断和发布包不包含客户资产、名称或完整业务数据。

## 3. 工程结构与依赖

`ice3-industrial` 建立独立 workspace：

```text
ice3-industrial/
  packages/
    industrial-core/   → @ice3/industrial-core
    industrial/        → @ice3/industrial
```

### 3.1 `@ice3/industrial-core`

纯 TypeScript 领域核心，不依赖 DOM、浏览器、WebGL、渲染运行时或具体协议。

负责：

- 工业实体、类型、属性和操作契约。
- 关系图与外部身份索引。
- 工作区状态、事件和命令注册。
- 查询、验证、序列化和诊断。
- 标准适配器接口。

### 3.2 `@ice3/industrial`

浏览器集成层，依赖 `@ice3/industrial-core` 和公共 `ice3` 包。

负责：

- `selectionId` 与实体 ID 映射。
- 场景选择、聚焦、显隐、隔离和高亮。
- 2D/3D 选择同步。
- 引擎事件和工作区事件的桥接。
- 浏览器生命周期和资源清理。

依赖方向固定为：

```text
@ice3/industrial-core ← @ice3/industrial → ice3
```

禁止反向依赖：

- `industrial-core` 不得引用集成包或 `ice3`。
- `ice3` 不得引用任一工业语义包。
- 标准适配器不得把标准专属对象泄漏到核心公共 API。

第一版不创建 Studio、协议连接器或完整标准实现包，只保留稳定的适配器边界。

## 4. 核心数据模型

### 4.1 通用值

核心只接受可确定性序列化的值：

```ts
type ICEIndustrialValue =
  | string
  | number
  | boolean
  | null
  | readonly ICEIndustrialValue[]
  | { readonly [key: string]: ICEIndustrialValue };
```

`NaN`、无穷值和运行时对象引用均不允许。

### 4.2 外部身份

```ts
interface ICEIndustrialExternalId {
  readonly scheme: string;
  readonly value: string;
  readonly scope?: string;
}
```

同一实体可以携带多个外部身份。`scheme`、`scope` 和 `value` 均为稳定字符串。

示例：

```ts
externalIds: [
  { scheme: 'ice', value: 'asset-7/entity-12' },
  { scheme: 'aas', value: 'urn:asset:example' },
  { scheme: 'ifc', value: '3vB2...' },
  { scheme: 'realtime', value: 'ns=2;s=Plant.Pump01' },
]
```

规则：

- 内部 `entity.id` 是唯一主键。
- 同一 `scheme + scope + value` 只能映射一个实体。
- 显示名称不能作为身份。
- `selectionId` 不是外部业务身份。

### 4.3 实体类型

```ts
interface ICEIndustrialEntityType {
  readonly id: string;
  readonly label: string;
  readonly parentTypeId?: string;
  readonly propertyDefinitions: readonly ICEIndustrialPropertyDefinition[];
  readonly operationDefinitions: readonly ICEIndustrialOperationDefinition[];
  readonly allowedRelationTypes?: readonly string[];
}
```

实体类型描述可复用结构。第一版不实现复杂继承推导；`parentTypeId` 只用于类型层级查询和后续标准映射。

### 4.4 实体

```ts
interface ICEIndustrialEntity {
  readonly id: string;
  readonly typeId: string;
  readonly parentId?: string;
  readonly displayName: string;
  readonly description?: string;
  readonly externalIds: readonly ICEIndustrialExternalId[];
  readonly spatial?: ICEIndustrialSpatialBinding;
}
```

实体表示具体对象，可以对应设备、区域、部件、点位、连接段或控制单元，但不内置水务、电力、楼宇等行业对象。

### 4.5 属性定义

```ts
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
```

属性定义属于类型，不包含当前运行值。

### 4.6 实体状态

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
```

值、质量、时间和来源共同构成有效状态。状态更新不修改静态实体。

### 4.7 关系

```ts
interface ICEIndustrialRelation {
  readonly id: string;
  readonly type: string;
  readonly fromEntityId: string;
  readonly toEntityId: string;
  readonly directed: boolean;
  readonly metadata?: Readonly<Record<string, ICEIndustrialValue>>;
}
```

核心保留少量通用语义：

```text
ice:contains
ice:partOf
ice:connectedTo
ice:upstreamOf
ice:dependsOn
```

其他关系必须使用带命名空间的类型：

```text
ext:<domain>:<relation>
```

关系两端必须引用已存在实体。第一版允许环，但遍历 API 必须显式限制深度和访问次数。

### 4.8 操作定义

```ts
interface ICEIndustrialOperationDefinition {
  readonly id: string;
  readonly label: string;
  readonly inputSchema?: Readonly<Record<string, ICEIndustrialValue>>;
  readonly outputSchema?: Readonly<Record<string, ICEIndustrialValue>>;
  readonly requiresConfirmation: boolean;
}
```

操作定义描述能力，不包含执行逻辑。应用或适配器注册 handler。

### 4.9 事件

```ts
interface ICEIndustrialEvent {
  readonly id: string;
  readonly type: string;
  readonly entityId?: string;
  readonly severity: 'info' | 'warning' | 'error' | 'critical';
  readonly timestamp: number;
  readonly source?: string;
  readonly correlationId?: string;
  readonly sequence: number;
  readonly payload?: Readonly<Record<string, ICEIndustrialValue>>;
}
```

第一版只定义规范事件信封，不实现告警规则、确认、恢复、升级或工单流程。

### 4.10 空间绑定

```ts
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
```

一个实体可以关联多个选择身份、模型和 Tile。不同 LOD 中的节点仍解析为同一实体。空间绑定不参与业务主键计算。

### 4.11 工作区清单

```ts
interface ICEIndustrialWorkspaceManifest {
  readonly version: '1.0';
  readonly workspaceId: string;
  readonly assetIds: readonly string[];
  readonly entityTypes: readonly ICEIndustrialEntityType[];
  readonly entities: readonly ICEIndustrialEntity[];
  readonly relations: readonly ICEIndustrialRelation[];
}
```

清单只保存静态语义。运行状态、事件历史、选择、过滤、隔离、标注和相机视图不写入资产清单。

## 5. 运行时结构

核心以 `ICEIndustrialWorkspace` 为唯一门面：

```text
Manifest Validator
       ↓
TypeRegistry + EntityRegistry + RelationGraph
       ↓
StateStore + QueryEngine
       ↓
WorkspaceContext + OperationRegistry
       ↓
ICEIndustrialWorkspace
```

### 5.1 核心 API

```ts
const workspace = new ICEIndustrialWorkspace({ manifest });

workspace.getEntity(entityId);
workspace.getType(typeId);
workspace.getRelations(entityId, options?);
workspace.queryEntities(query?);
workspace.getProperty(entityId, propertyId);
workspace.updateProperties(patches);
workspace.insertEvent(event);
workspace.on('STATE_CHANGE', listener);
workspace.on('EVENT', listener);
workspace.on('CONTEXT_CHANGE', listener);
workspace.dispose();
```

所有公开集合只读。调用方不能直接修改 registry、关系图或状态 store。

### 5.2 查询

查询至少支持：

- 实体 ID、类型和父实体。
- 属性值和状态质量。
- 外部身份。
- 关系方向和类型。
- 空间边界和区域。
- 空间绑定中的 `selectionId`、模型和 Tile。

结果按实体 ID 去重并稳定排序。

### 5.3 状态更新

一次 `updateProperties()` 调用是事务：

1. 先校验全部补丁。
2. 丢弃早于当前 `sourceTimestamp` 的补丁并计数。
3. 同一实体的同一属性采用 latest-wins。
4. 统一更新状态库。
5. 在一个 microtask 或注入的调度器中广播合并变更。

事件与状态分开订阅。高频点位更新不能导致逐值完整重绘。

### 5.4 工作区上下文

```ts
interface ICEIndustrialWorkspaceContext {
  readonly selection: readonly string[];
  readonly visibleEntityIds?: ReadonlySet<string>;
  readonly isolatedEntityIds?: ReadonlySet<string>;
  readonly filters: readonly ICEIndustrialFilter[];
  readonly timeRange?: {
    readonly start?: number;
    readonly end?: number;
  };
}
```

任何来源的选择都先转换为实体 ID：

```ts
workspace.setSelection(['pump-01'], { source: 'scene' });
```

## 6. 浏览器集成

```ts
const view = new ICEIndustrialView({
  engine,
  workspace,
  canvas,
});
```

第一版能力：

- `selectionId` 到实体 ID 映射。
- 工作区选择到场景高亮同步。
- `focus(entityId)`。
- `setVisibility(entityIds, visible)`。
- `showOnly(entityIds)`。
- `clearIsolation()`。
- 相机书签保存与跳转。
- 引擎 Tileset、LOD 和选择事件桥接。

### 6.1 选择链路

```text
3D selectionId ─┐
2D objectId ────┼→ workspace.setSelection(entityIds)
列表/搜索 ──────┤          │
自动化命令 ─────┘          ↓
                    CONTEXT_CHANGE
                           ↓
                 2D、3D、列表、信息面板同步
```

三维适配器负责多节点、多批次和多 LOD 去重。实体暂时不在当前 Tile 时，逻辑选择保留，等待内容重新出现。

### 6.2 2D/3D 适配器

```ts
interface ICEIndustrialSelectionAdapter {
  setSelection(entityIds: readonly string[]): void;
  subscribe(
    listener: (entityIds: readonly string[]) => void,
  ): () => void;
}
```

二维图和三维场景不直接互相依赖，只共同依赖工作区选择上下文。

### 6.3 视图状态

```ts
interface ICEIndustrialViewState {
  readonly selection: readonly string[];
  readonly hiddenEntityIds: readonly string[];
  readonly isolatedEntityIds: readonly string[];
  readonly highlightedEntityIds: readonly string[];
  readonly activeBookmarkId?: string;
}
```

显隐计算顺序：

1. 从全部实体开始。
2. 应用显式隐藏。
3. 应用隔离集合。
4. 保留当前选择所需的父级空间上下文。

## 7. 操作与业务边界

工业语义层提供：

- 查询与筛选。
- 状态读取与更新。
- 关系遍历。
- 视图操作。
- 操作调用和结果事件。

工业语义层不提供：

- 行业告警阈值和联锁规则。
- 工单、审批、排班和运维流程。
- 预测性维护算法。
- 客户权限模型。
- 自动执行策略。
- CAD 编辑或设备建模。

具体应用订阅状态和事件，执行业务规则，再调用工作区公开命令。

### 7.1 操作上下文

```ts
interface ICEIndustrialOperationContext {
  readonly entityId: string;
  readonly actor?: string;
  readonly source: 'ui' | 'api' | 'automation';
  readonly signal?: AbortSignal;
}
```

核心只传递上下文，不依赖具体身份系统。应用负责认证、授权、确认和审计。

## 8. 生态适配

### 8.1 统一适配器

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
```

第一版实现：

- 原生 ICE JSON manifest 导入、导出和严格校验。
- 适配器注册表。
- 确定性序列化。
- 外部身份冲突检测。
- 带命名空间的未知扩展保存。

### 8.2 标准映射原则

- 资产数字孪生标准用于实体、资产身份、属性集合和子模型映射。
- W3C WoT 用于 Property、Action、Event 语义映射。
- 工业实时通信信息模型用于实时属性、方法和事件适配。
- BIM/IFC 只在外置预处理阶段提取稳定构件身份、空间层级和属性。
- 参考代号作为外部身份保存。
- OGC 3D Tiles 和单 JSON/单 BIN GLB 继续只负责几何分发。

标准专属类型不能进入核心公共 API。

### 8.3 实时数据源

```ts
interface ICEIndustrialDataSource {
  connect(signal?: AbortSignal): Promise<void>;
  disconnect(): Promise<void>;
  subscribe(
    listener: (update: ICEIndustrialStatePatch | ICEIndustrialEvent) => void,
  ): () => void;
}
```

适配器负责协议、重连、订阅和转换；工作区负责合并、校验和分发。

## 9. 诊断

```text
ICE3_INDUSTRIAL_MANIFEST_INVALID
ICE3_INDUSTRIAL_DUPLICATE_ENTITY
ICE3_INDUSTRIAL_IDENTITY_CONFLICT
ICE3_INDUSTRIAL_UNKNOWN_ENTITY
ICE3_INDUSTRIAL_UNKNOWN_TYPE
ICE3_INDUSTRIAL_UNKNOWN_PROPERTY
ICE3_INDUSTRIAL_INVALID_RELATION
ICE3_INDUSTRIAL_STATE_INVALID
ICE3_INDUSTRIAL_STALE_STATE
ICE3_INDUSTRIAL_OPERATION_FAILED
ICE3_INDUSTRIAL_OPERATION_CANCELLED
ICE3_INDUSTRIAL_ADAPTER_FAILED
```

诊断包含稳定 code、severity、message 和可选实体 ID，不包含客户名称或完整业务数据。

## 10. 生命周期与一致性

- Manifest 全部验证通过后才创建索引。
- 重复实体、类型错误、父级缺失、悬空关系或身份冲突拒绝整个 manifest。
- Adapter attach/detach 幂等。
- `dispose()` 后拒绝所有操作并释放订阅、handler、索引和缓存。
- 数据源断开时保留最后值，但状态质量标记为不可用。
- Tile/LOD 节点卸载不删除实体、状态、选择或关系。
- 场景重新绑定后重建 `selectionId` 索引。

## 11. 性能要求

- 实体、类型和外部身份查询使用 O(1) 索引。
- 关系遍历不复制整张关系表。
- 批量状态更新在一次 microtask 或一个动画帧内合并。
- 查询和更新不得引入与实体总数无关的大型临时对象。
- 基准至少覆盖 10,000 个实体、50,000 个属性和高频状态补丁。

第一版不承诺固定毫秒上限，但必须记录并防止数量级退化。

## 12. 测试策略

### 12.1 核心包

- Manifest 正向与负向验证。
- 实体、类型和外部身份索引。
- 关系遍历、缺失引用和循环。
- 状态补丁、过期值、质量和事件顺序。
- 查询确定性、去重和排序。
- 序列化往返和版本兼容。
- 生命周期幂等性。

### 12.2 集成包

- `selectionId` 与实体 ID 映射。
- 多 LOD、多批次同一实体去重。
- 2D 到 3D、3D 到 2D 选择同步。
- 聚焦、显隐和隔离。
- Tile 卸载后上下文保持。
- LOD 切换期间选择、状态和标签一致。

### 12.3 浏览器

- Chromium 与 WebKit。
- 合成三维场景和二维选择源。
- 连续旋转、缩放和 LOD 切换。
- 页面错误、请求失败、选择身份和工业工作区诊断均为零异常。

## 13. 工程约束

- Node.js 24.22.1 LTS。
- TypeScript 严格模式。
- 功能分支开发，完整验证后合入 `main`。
- 核心包零运行时依赖。
- 集成包只依赖 `@ice3/industrial-core` 和公共 `ice3`。
- 不复制跨工程契约，权威定义位于 `ice3-doc`。
- 不提交客户资产、派生模型、截图、日志或完整业务数据。
- 文档、代码、注释和提交信息遵守现有法务命名约束。
- 公共 API 使用 ICE 显式对象、事件、销毁和稳定身份风格。

## 14. 非目标

第一版不包含：

- 完整 AAS、WoT、OPC UA 或 IFC 实现。
- 实时协议栈和具体设备连接器。
- 告警规则引擎和完整告警生命周期。
- 工单、审批、排班和运维流程。
- 预测性维护和数据分析。
- Studio 管理界面。
- Agent、Prompt、模型调度或 AI 专用 API。
- CAD 建模、设备编辑和几何修改。
- 纹理、PBR、动画和物理。

## 15. 实施阶段

1. **核心契约与 Registry**
   - Manifest、类型、实体、外部身份、关系、查询。

2. **状态、事件和操作**
   - State store、批量补丁、事件序列、操作注册。

3. **工作区上下文与序列化**
   - 选择、显隐、隔离、过滤、视图状态和快照。

4. **浏览器场景集成**
   - Selection mapping、focus、visibility、isolation 和事件桥接。

5. **2D/3D 协同**
   - 通用 adapter、双向选择、共享上下文。

6. **生态适配边界**
   - ICE JSON、标准适配器接口、实时数据源接口。

Studio、标准连接器和行业规则属于后续独立计划。

## 16. 验收标准

1. `industrial-core` 可在无 DOM、无 WebGL 环境独立运行。
2. `ice3` 不依赖任何工业语义包。
3. Manifest 导入、查询、状态更新、事件和序列化契约通过测试。
4. 同一实体跨多节点、多批次、多 LOD 和 Tile 重载保持稳定身份。
5. 2D 与 3D 双向选择使用同一实体选择状态。
6. 聚焦、显隐、隔离和选择在 LOD 切换中保持一致。
7. 高频状态更新被合并，不造成逐值完整重绘。
8. 标准能力通过适配器边界接入，专属类型不泄漏进核心。
9. Chromium 和 WebKit 交互测试通过。
10. 所有核心代码、文档和包产物不含客户资产或敏感业务数据。

## Related Documents

- `ICE3-DOC-IDX-001` — [Documentation index](../README.md)
- `ICE3-DOC-PLAN-013` — [Industrial semantic core implementation](../plans/2026-10-28-industrial-semantic-core.md)
