# ICE3 自适应工业 LOD 设计规格

> Document ID: ICE3-DOC-SPEC-001
>
> Status: Implemented
>
> Owner: ICE3 architecture maintainers
>
> English summary: Define deterministic per-unit triangle budget allocation and error curves for adaptive coarse LOD generation.

| 项目 | 内容 |
| --- | --- |
| 状态 | 已实现 |
| 版本 | 1.0 |
| 日期 | 2026-10-27 |
| 适用范围 | `ice3-toolchain` 的粗模预算分配、离线简化、报告和 CLI |
| 前置条件 | 标准层级 Tileset、多内容故障原子性、SSE 切面和选择延续已合入 `main` |
| 所属路线 | 自适应多级 LOD、语义代理、远景簇代理三个阶段中的第一阶段 |

## 1. 目标

将当前所有设备使用相同简化率的粗模生成方式，升级为场景预算下的自适应分配：

1. 保留现有 OGC 3D Tiles 1.1 层级、`REPLACE` 语义和 Prepared GLB。
2. 按设备统计可实现的三角数、字节数和米制误差曲线。
3. 在同一内部 Tile 的预算内，为不同设备分配不同简化率。
4. 让简化误差较高的设备获得更多三角形，简单外壳或平坦几何承担更多压缩。
5. 将实际简化误差继续写入父节点 `geometricError`，供现有 SSE 选择器消费。
6. 保持设备选择身份、分块原子性和现有运行时 API 不变。
7. 提供可重复的对照模式，以真实工业资产验证自适应结果是否优于统一比例。

本阶段只改变粗模生成策略，不改变传输格式、瓦片协议或运行时切面算法。

## 2. 成功标准

- 同一内部 Tile 中，不同设备的实际简化率可以不同。
- 总粗模三角形不超过该 Tile 的自适应目标预算。
- 达到最低表示要求后预算仍有剩余时，优先分配给边际误差下降最大的设备。
- 不得为了满足预算删除设备、合并设备语义身份或越过材质 primitive 边界。
- 实际误差、源三角数、最终三角数和保留源几何状态写入构建统计。
- 相同输入、参数和工具版本生成稳定一致的设备排序、预算结果和文件内容。
- 在相同三角形预算下，自适应模式的节点高分位归一化误差不劣于统一比例模式；否则保留统一比例模式作为默认。归一化误差定义为设备米制误差除以所属内部 Tile 包围盒对角线长度。
- 客户端仍只使用现有 Tileset 标准字段和场景 API。
- 客户资产及派生文件不进入 Git、测试、日志或发布包。

## 3. 行业依据

本设计遵循以下已验证的行业共识：

- 层级瓦片使用米制 `geometricError` 表达当前粗表示相对后备内容的误差，运行时再换算为屏幕空间误差选择精度。
- 离线生成有限级 LOD，浏览器运行时只选择、请求、缓存和切换。
- 异质几何不能安全地使用统一简化率；应按模型误差曲线分配场景级预算。
- 简化必须保护边界和拓扑，并返回可用于 LOD 选择的实际误差。
- 压缩字节、减少三角形和减少绘制批次是三个独立指标。

公开依据：

- OGC 3D Tiles 1.1 对层级 LOD、`geometricError`、`REPLACE` 和多内容的定义。
- 2026 年 ISPRS 关于 BIM/GIS/数字孪生四层 LOD 自适应简化率的研究，DOI `10.3390/ijgi15020061`。
- 开源几何优化工具关于边界锁定、属性误差、折叠保护和绝对误差的接口说明。

## 4. 非目标

本阶段不包含：

- 包围盒、圆柱或凸包等语义代理生成。
- 远景设备簇和 HLOD 合并。
- 新增自定义 Tileset 字段、旁路索引或私有传输格式。
- 运行时网格简化、预算分配或格式转换。
- 新 LOD 树结构；仍使用现有空间分区树。
- 通用材质合并、纹理图集或绘制批次优化。
- 自动修复源 CAD/BIM 拓扑缺陷。
- 按设备业务类型配置不同的误差权重。

这些能力分别属于后续“语义代理”和“远景簇代理”阶段。

## 5. 核心模型

### 5.1 预算单位

- 预算分配的基本单位是内部 Tile 内的语义设备。
- 设备内部仍按材质 primitive 独立简化。
- 同一设备的所有 primitive 共享该设备分配到的三角预算。
- 单设备最少三角形取现有 `minTrianglesPerUnit` 与该设备源三角数的较小值。
- 单设备最多三角形不超过其源三角数。

### 5.2 简化曲线

对每个设备生成离散误差曲线。每个采样点包含：

```ts
interface ICELodSample {
  readonly targetTriangles: number;
  readonly actualTriangles: number;
  readonly errorMeters: number;
  readonly preservedSource: boolean;
  readonly geometryWorkspaceKey: string;
}
```

- 采样按三角数从低到高排列。
- 对 `curveSamples` 个采样点，在最低三角数与源三角数之间按对数尺度等距取值；四舍五入并去重后至少保留最低表示和源几何两个端点。
- 例如源几何为 `1000`、最低表示为 `10`、采样数为 `4` 时，目标三角数为 `10`、`46`、`215`、`1000`。
- `actualTriangles` 取简化器实际结果，不使用请求目标冒充结果。
- `errorMeters` 是简化器返回误差经过该设备世界变换缩放后的保守值。
- 当简化器无法满足目标而保留源几何时，该采样标记 `preservedSource`。
- 曲线至少包含最低表示与源几何两个端点。
- 中间采样数量和比例由构建参数控制，不写死 LOD 编号。
- 候选几何保存在受内存上限约束的临时工作区；分配器只持有采样元数据和工作区键，不把全部候选几何同时常驻内存。
- 只保留帕累托改进采样：后一个采样的实际三角数必须增加，误差必须下降；被新采样同时支配的旧采样会被移除。

### 5.3 边际收益

相邻采样点之间定义升级收益：

```text
marginalBenefit =
  (previousErrorMeters - nextErrorMeters)
  / (nextActualTriangles - previousActualTriangles)
```

- 从最低表示开始，将更高精度采样视为可购买步骤。
- 一个设备只有在选中前一采样后，其下一采样才进入候选集，禁止跳过中间步骤。
- 每增加一定三角形，选择能减少最多累计误差的步骤。
- 并行收益比较使用归一化误差，避免大型设备仅因米制误差绝对值更大而长期占用预算。
- 达到 Tile 总预算、所有设备达到源几何或没有正收益步骤时停止。
- 误差为零的平坦几何可以保持最低表示，把预算让给轮廓复杂的设备。
- 结果必须确定：收益相同时按稳定设备 ID 和采样顺序决定。

首版按实际三角数计算成本，避免目标三角数无法达到时错误消费预算。不引入屏幕面积权重；运行时的 SSE 已经负责视距和屏幕大小，构建期不重复模拟相机。

自适应目标预算定义为：

```text
min(maxTrianglesPerProxy, 该节点按比例策略计算的目标三角总数)
```

这样自适应和比例模式在同一个节点的名义工作量下进行比较；`maxTrianglesPerProxy` 仍然是上限，而不是自动扩大预算的理由。

## 6. 执行流程

```text
Source geometry
    │
    ▼
Per-unit simplification samples
    │
    ▼
Per-node adaptive budget allocation
    │
    ▼
Chosen per-unit representation
    │
    ▼
Prepared GLB coarse content
    │
    ▼
Standard Tileset geometricError
```

详细步骤：

1. 解析源模型并生成稳定的语义设备和空间分区树。
2. 为每个设备 primitive 生成候选简化曲线。
3. 对每个内部 Tile 收集其所有设备曲线。
4. 从所有设备的最低表示开始，记录已用三角形。
5. 在总预算内贪心选择边际误差收益最高的升级步骤。
6. 按最终选择重建该 Tile 的粗模 GLB。
7. 将设备误差最大值与子节点误差合并为当前 Tile 的 `geometricError`。
8. 继续现有粗模分块、逻辑 Tile 原子提交和统计流程。

## 7. CLI 与配置

新增选项：

```text
--lod-allocation <proportional|adaptive>
--lod-curve-samples <count>
```

默认策略在首版保持 `proportional`，确保现有资产构建结果不变。自适应模式先通过显式选项启用；真实资产对照通过后，再单独决定是否切换默认值。

默认值：

| 参数 | 默认值 |
| --- | --- |
| `lodAllocation` | `proportional` |
| `lodCurveSamples` | `8` |

校验：

- `lodCurveSamples` 为 `4..32` 的整数。
- `proportional` 完全复用当前预算算法和行为。
- `adaptive` 仍要求 `0 < lodRatio < 1`。`lodRatio` 不表示每个设备的实际简化率，但参与计算该节点的比例目标总量；自适应预算取该总量与 `maxTrianglesPerProxy` 的较小值。
- 未启用 `--lod` 时，新参数不改变普通分区输出。

## 8. 接口

工具链核心接口扩展：

```ts
type ICELodAllocationMode = 'proportional' | 'adaptive';

interface ICELodBuildOptions {
  readonly allocation?: ICELodAllocationMode;
  readonly curveSamples?: number;
  readonly ratio: number;
  readonly maxTrianglesPerProxy: number;
  readonly minTrianglesPerUnit: number;
  readonly maxMemoryBytes?: number;
  readonly coarseChunkMaxBytes?: number;
}

interface ICELodAllocationResult {
  readonly units: readonly {
    readonly unitId: string;
    readonly sourceTriangles: number;
    readonly targetTriangles: number;
    readonly sampledErrorMeters: number;
  }[];
  readonly allocatedTriangles: number;
  readonly maximumErrorMeters: number;
}
```

实现单元：

| 单元 | 职责 | 禁止 |
| --- | --- | --- |
| 曲线采样 | 为设备生成可比较的简化候选 | 选择场景预算 |
| 预算分配 | 在 Tile 上限内选择设备采样点 | 修改几何或 Tileset |
| 粗模重建 | 按选择结果生成 Prepared GLB | 自行重新解释 Tileset |
| 误差汇总 | 将设备误差传播为 `geometricError` | 使用固定距离档位 |
| CLI | 解析和校验构建策略 | 实现简化算法 |

## 9. 报告

构建统计增加：

```ts
interface ICELodAdaptiveStats {
  readonly allocationMode: ICELodAllocationMode;
  readonly adaptiveUnitCount: number;
  readonly minimumUnitTriangleRatio: number;
  readonly maximumUnitTriangleRatio: number;
  readonly maximumErrorMeters: number;
  readonly curveSampleCount: number;
}
```

- `adaptiveUnitCount` 是实际简化率与同节点最高频简化率相差超过 `0.01` 的设备数量，不把全部设备数当作自适应证据。
- 现有 `coarseTriangleCount`、`coarseBytes`、`preservedCoarseUnits` 和 `overBudgetCoarseNodes` 保持兼容。
- 报告不包含源资产名称、绝对路径或设备业务数据。

## 10. 错误处理

- 某设备无法生成有效简化时保留源几何，并记录 `preservedCoarseUnits`。
- 简化错误不可计算或不是有限值时拒绝该采样，不写入无效 `geometricError`。
- 分配结果超过 Tile 预算时构建失败，诊断码使用 `ICE3_TOOL_LOD_BUDGET_INVALID`，并报告最低总量、预算和设备数。
- 分配结果无法满足设备最低三角数时构建失败，不生成部分 Tile。
- 任何失败都继续使用现有原子输出清理，不留下部分目录。

## 11. 测试策略

### 11.1 单元测试

- 两个设备源三角数相同但几何复杂度不同，自适应模式产生不同简化率。
- 增加预算后，更多三角形流向边际误差收益较高的设备。
- 收益相同时输出确定一致。
- 平坦零误差设备保持最低表示。
- 单设备最低表示、源几何上限和整体预算均被遵守。
- 实际误差传播到分配结果和 Tile `geometricError`。

### 11.2 集成测试

- `proportional` 模式的输出与当前基线逐字节一致。
- `adaptive` 模式生成标准 Prepared GLB 和标准 Tileset。
- 逻辑 Tile 多分片仍原子提交，失败路径不变。
- 设备选择 ID 在所有采样和最终输出中不变。
- 相同参数重复构建得到相同文件清单、统计和字节。

### 11.3 真实资产对照

在同一受控工业资产和相同总三角形预算下比较：

```text
allocationMode
totalCoarseTriangles
totalCoarseBytes
maximumPerUnitErrorMeters
medianPerUnitTriangleRatio
minimumPerUnitTriangleRatio
maximumPerUnitTriangleRatio
preservedCoarseUnits
overBudgetCoarseNodes
wallClockMs
```

接受条件：

- 自适应模式不得超过 Tile 三角形预算或分片字节预算。
- 相同总三角预算下，最大或高分位设备误差应低于统一比例模式；不能证明收益时保留统一比例默认值。
- 构建时间可以增加，但必须报告；不得把运行时成本转移到浏览器。
- 真实资产派生文件验证后删除。

### 11.4 首轮真实结果

受控资产使用相同 `0.15` 比例目标、`1,048,576` 最大代理三角形和 `8` 个曲线采样点：

| 指标 | 比例模式 | 自适应模式 |
| --- | ---: | ---: |
| 粗模三角形 | 12,911,713 | 12,270,999 |
| 粗模字节 | 189,709,240 | 201,837,664 |
| 超预算节点 | 2 | 0 |
| 保留源几何设备 | 162 | 108 |
| Tileset 根误差（米） | 31.6927 | 2.8244 |
| 节点误差 P90（米） | 7.2618 | 1.9035 |
| 离线构建耗时 | 117.7 秒 | 140.2 秒 |

浏览器 1440 × 900 视口下，比例模式首屏驻留 `19` 个节点、约 `131.4 MB`；自适应模式驻留 `7` 个节点、约 `47.9 MB`。Chromium 和 WebKit 均无页面错误或失败请求。全部 `214` 个生成 GLB 通过格式校验。

首轮对照验证了自适应分配在相同节点目标预算下降低三角形、超预算节点和几何误差。自适应粗模字节较高，因为不同设备保留的几何组合产生更多 GLB 与缓冲开销；该指标仍低于细模总字节，因此没有以牺牲结构完整性换取表面上的整体压缩。

## 12. 实施边界

本规格可以独立形成一个实施计划。完成后：

- 运行时无需改动。
- Tileset 格式无需改动。
- 现有 `proportional` 资产保持兼容。
- 后续语义代理可作为新的采样来源接入同一预算分配器。
- 后续簇代理可以复用误差汇总和预算报告，但不在本阶段实现。

## Related Documents

- `ICE3-DOC-IDX-001` — [Documentation index](../README.md)
- `ICE3-DOC-PLAN-001` — [Adaptive Industrial LOD implementation](../plans/2026-10-27-adaptive-industrial-lod.md)
