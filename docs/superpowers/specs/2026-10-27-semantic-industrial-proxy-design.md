# ICE3 工业语义代理设计规格

| 项目 | 内容 |
| --- | --- |
| 状态 | 已确认 |
| 版本 | 1.0 |
| 日期 | 2026-10-27 |
| 适用范围 | 离线工具链的语义代理候选、自适应 LOD 采样、Prepared GLB mesh 重建和 CLI |
| 前置条件 | 自适应多级 LOD、标准 Tileset、多内容故障原子性和选择延续已合入 `main` |
| 所属路线 | 自适应多级 LOD、语义代理、远景簇代理三个阶段中的第二阶段 |

## 1. 目标

为工业设备增加保守、可解释的语义代理：

1. 以现有语义设备单元为边界生成 OBB 和圆柱候选。
2. 只有代理可靠且明显优于网格简化时才采用。
3. 代理作为自适应 LOD 的可选采样来源，与 QEM 简化在同一预算中竞争。
4. 代理替换设备 mesh 几何，但保留节点变换、设备选择身份和业务接口。
5. Prepared GLB、Tileset schema 和浏览器运行时保持一致。
6. 代理生成、质量判定和缓存全部在离线工具链完成。
7. 无法可靠代理的设备继续使用现有自适应网格简化。

## 2. 成功标准

- 简单规则设备的粗模可以使用低三角形 OBB 或圆柱。
- 复杂异形设备不会被不合适的代理强行替换。
- 同一设备在代理和细模之间切换时，选择 ID 和业务身份不变。
- 共享同一源 mesh 的多个节点实例复用同一代理几何和各自节点变换。
- 代理误差进入 Tileset `geometricError`，并参与现有 SSE 选择。
- 代理不会绕过 Tile 三角形预算、总字节预算或粗模分块限制。
- 代理开启前，现有比例模式和自适应模式输出保持不变。
- 相同输入、参数和工具版本产生稳定一致的代理类别、材质选择和文件内容。
- 真实资产中代理接受率和质量可以量化，不以接受数量作为成功标准。
- 客户资产及派生文件不进入 Git、测试、日志、截图或发布包。

## 3. 行业依据

工业数字孪生中的粗模通常组合三类手段：

- 对规则设备使用人工或自动生成的基本体代理。
- 对不规则几何使用受约束网格简化。
- 由运行时根据几何误差和预算选择 LOD。

本阶段只实现可自动验证的基本体代理，不尝试通过模型分类或机器学习猜测业务类别。

第一版采用的边界：

- 设备边界来自现有语义单元。
- 候选形状来自实际几何拟合。
- 质量由空间误差、包络膨胀和三角形收益共同决定。
- 不满足门槛时明确回退，不做“看起来可能像”的猜测。

## 4. 非目标

本阶段不包含：

- 凸包、部件级拆分、骨架、体素或隐式曲面代理。
- 根据设备名称猜测泵、阀、罐等业务类别。
- 纹理图集、复杂材质合并或 PBR 还原。
- 人工代理编辑器或覆盖配置。
- 运行时代理生成、mesh 替换或分类。
- 新 Tileset 字段、私有资产格式或代理专用运行时 API。
- 远景设备簇或 HLOD 合并。
- 碰撞体、导航网格、物理代理或维护拆装模型。

## 5. 核心原则

1. **几何证据优先**：设备名称和节点文案不参与代理选择。
2. **设备不可分割**：代理不跨语义设备合并。
3. **保守接受**：任一质量门槛失败即放弃代理。
4. **离线生成**：运行时只消费 Prepared GLB。
5. **标准输出**：Tileset 和 Prepared GLB 结构保持不变。
6. **身份稳定**：只替换 mesh 几何，不替换业务节点身份。
7. **预算一致**：代理与 QEM 采样使用同一个分配器和预算。
8. **确定性**：候选顺序、主材质、顶点方向和输出字节稳定。
9. **可回退**：代理候选不足时继续现有网格流畅路径。
10. **可审计**：报告代理接受、拒绝、三角形和误差，不记录敏感资产内容。

## 6. 代理单位与坐标系

- 基本单位是 `ICEPartitionUnit`。
- 第一版一个 unit 只对应一个源 mesh，但该 mesh 可被多个节点实例引用。
- 代理几何在源 mesh 的局部坐标系中生成。
- 节点世界变换继续作用于代理，不把实例位置烘焙进共享代理。
- 世界空间拟合误差按该 unit 的最大节点世界缩放换算为米。
- 代理选择身份沿用这些节点原有的 `selectionId`。

## 7. 候选生成

### 7.1 采样点

从源设备几何构建确定性的拟合点集：

- 所有三角形顶点。
- 每个非退化三角形的质心。
- 对重复位置和重复质心进行稳定去重。
- 不按节点实例重复采样。

顶点坐标先保持在源 mesh 局部空间。主轴协方差使用去重后的表面顶点，不以三角形质心或面积为权重。这样可避免非对称三角剖分让本应对称的长方体主轴发生旋转，进而产生不必要的 OBB 包络膨胀；质心仍作为表面偏差采样点，面积仍用于验证三角形非退化。采样方式不修改几何。

### 7.2 OBB 候选

1. 以去重后的表面顶点计算设备协方差。
2. 计算对称 3x3 协方差矩阵的特征向量。
3. 按特征值从大到小排序，形成正交主轴。
4. 每个特征向量的绝对值最大分量设为正；分量并列时按 `x`、`y`、`z` 顺序选择，保证重复构建结果稳定。
5. 将采样点投影到三个主轴，得到中心、半长和方向。
6. 沿每个轴增加数值安全边距，生成 8 个顶点和 12 个三角形。

拒绝 OBB 的条件：

- 协方差不是有限值或任一主轴退化。
- 设排序特征值为 `λ1 >= λ2 >= λ3`，当 `λ2 / λ1 > 0.9` 且 `λ3 / λ1 > 0.8` 时视为方向不稳定。
- 体积或表面偏差超过质量门槛。

### 7.3 圆柱候选

1. 使用 OBB 的主轴作为候选圆柱轴。
2. 将采样点投影到轴向和径向。
3. 轴向范围形成圆柱高度；径向最远点形成包含全部采样点的半径。
4. 使用 16 个周向分段生成侧面和封口，固定顶点顺序。

拒绝圆柱的条件：

- 轴向长度与直径比例小于 `1.25`。
- 半径、中心或端面不是有限值。
- 体积或表面偏差超过质量门槛。
- 圆柱表面偏差不优于 OBB。

### 7.4 基准包围盒

- 计算局部 AABB 作为质量和体积基准。
- AABB 默认不作为可发布代理。
- 当 OBB 方向不稳定但 AABB 本身通过全部门槛时，记录拒绝原因，不自动发布。

## 8. 代理质量

### 8.1 表面偏差

对源采样点到代理全部三角形的最近距离取最大值：

```text
normalizedMaximumDeviation =
  maximumDistanceFromSourceSampleToProxySurface
  / sourceMeshBoundsDiagonal
```

代理必须完整包住源采样点。表面偏差衡量代理外壳与真实设备表面的距离，避免用巨大包围盒换取少量三角形而失去设备轮廓。

写入 LOD 曲线的世界误差为：

```text
errorMeters =
  normalizedMaximumDeviation
  * sourceMeshBoundsDiagonal
  * maximumNodeWorldScale
```

### 8.2 体积膨胀

```text
volumeInflation =
  proxyVolume
  / sourceLocalAabbVolume
```

零厚度或近似零体积设备使用 `max(aabbVolume, epsilon)`。

### 8.3 接受门槛

第一版固定默认值：

| 指标 | 默认门槛 |
| --- | ---: |
| 归一化最大表面偏差 | `<= 0.05` |
| 体积膨胀比 | `<= 2.0` |
| 三角形压缩倍数 | `>= 8` |

- 源三角形少于 `64` 的设备不生成代理。
- 三个门槛必须同时满足。
- OBB 和圆柱都满足时，依次比较归一化偏差、体积膨胀和实际三角形数。
- 全部相同则优先 OBB，再比较稳定候选 ID。

门槛固定在本阶段，避免 CLI 参数膨胀。真实资产验证后如需调整，先修改共享契约。

## 9. 材质与颜色

- 设备有多个 primitive/material 时，按三角形数选择主导材质。
- 三角形数相同则选择最小源 material 索引。
- 没有材质时使用工具链默认材质。
- 源设备没有顶点颜色时，代理使用主导材质。
- 源设备存在顶点颜色时：
  - 只有所有参与代理的 primitive 都有顶点颜色时才使用顶点颜色。
  - 每个 primitive 计算三角形加权平均线性颜色，再按 primitive 三角形数加权形成设备平均颜色。
  - 任一 primitive 缺少顶点颜色时放弃平均色，回退主导材质。
  - 代理所有顶点使用同一平均色。
- 代理允许丢失局部材质变化，但不允许读取纹理或生成新的 PBR 材质。

## 10. 代理缓存与数据模型

```ts
type ICESemanticProxyKind = 'obb' | 'cylinder';

interface ICESemanticProxy {
  readonly id: string;
  readonly kind: ICESemanticProxyKind;
  readonly meshIndex: number;
  readonly triangleCount: number;
  readonly normalizedMaximumDeviation: number;
  readonly volumeInflation: number;
  readonly errorMeters: number;
  readonly materialIndex?: number;
  readonly geometryKey: string;
  readonly colors?: Float32Array;
}
```

- 每个 unit 最多保留一个最终代理候选。
- 候选几何写入现有有界临时工作区。
- 代理候选按稳定 mesh/unit ID 缓存，在同一构建的多个 LOD 节点中复用。
- 候选生成失败只拒绝该设备代理，不终止其他设备构建。

## 11. 与自适应 LOD 接入

现有曲线采样扩展为两类几何结果：

```ts
interface ICELodPrimitiveReplacement {
  readonly kind: 'primitives';
  readonly primitives: readonly ICELodCurvePrimitive[];
}

interface ICELodMeshReplacement {
  readonly kind: 'mesh';
  readonly proxy: ICESemanticProxy;
}

type ICELodSampleReplacement =
  | ICELodPrimitiveReplacement
  | ICELodMeshReplacement;
```

- QEM 采样使用 `primitives`。
- 语义代理采样使用 `mesh`。
- 代理采样加入现有误差曲线后，与 QEM 采样共同执行帕累托筛选和预算分配。
- 代理按实际三角形数计费，不因“语义”获得额外预算。
- 被选中代理的误差参与当前 Tile `geometricError`。
- 代理被拒绝时不加入曲线，不改变现有 QEM 结果。

## 12. Prepared GLB mesh 重建

Prepared GLB 构建器增加工具链内部的 mesh replacement：

```ts
interface ICEPreparedMeshOverride {
  readonly positions: Float32Array;
  readonly indices: Uint32Array;
  readonly materialIndex: number;
  readonly colors?: Float32Array;
}
```

- 以源 mesh 索引为键替换该 mesh 的三角形 primitive。
- 节点列表、节点矩阵、节点 ID 和 `selectionId` 保持原样。
- 同一 mesh 的多个节点实例继续引用同一输出 mesh。
- 边线由代理几何沿用现有规则生成。
- 输出仍是一个 JSON chunk 和一个 BIN chunk。
- 不新增代理专用 glTF 扩展或运行时对象。

## 13. CLI

新增：

```text
--semantic-proxy auto|off
```

默认值为 `off`。

- `off` 时完全复用当前自适应和比例模式。
- `auto` 时为每个设备尝试保守自动代理。
- 代理只与 `--lod --lod-allocation adaptive` 一起使用；其他组合在开始读取源资产前被拒绝。
- 第一版不暴露质量阈值参数。

## 14. 报告

构建统计新增：

```ts
interface ICESemanticProxyStats {
  readonly semanticProxyAcceptedUnits: number;
  readonly semanticProxyObbUnits: number;
  readonly semanticProxyCylinderUnits: number;
  readonly semanticProxyRejectedUnits: number;
  readonly semanticProxySelectedContents: number;
  readonly semanticProxyTriangles: number;
  readonly semanticProxySavedTriangles: number;
  readonly semanticProxyMaximumErrorMeters: number;
}
```

- `semanticProxyAcceptedUnits` 和 OBB/圆柱计数是构建过程中被接受的唯一设备候选数。
- `semanticProxyRejectedUnits` 包含质量失败、方向退化和收益不足的唯一设备数。
- `semanticProxySelectedContents` 是最终粗模 GLB 中实际替换 mesh 的次数；同一代理出现在多个 LOD 层时分别计数。
- `semanticProxyTriangles` 和 `semanticProxySavedTriangles` 按最终选择的代理内容累加。
- 接受数量不能替代质量控制。
- 报告不包含设备名称、客户名称、绝对路径或代理预览。

## 15. 错误处理

- 单设备候选拟合失败时拒绝该代理并回退 QEM。
- 工作区写入失败和临时文件损坏属于构建错误，必须终止。
- 已选中的代理在 Prepared GLB 重建时无效，构建失败，不提交部分输出。
- 代理材质索引越界、颜色数量错误或索引无效时构建失败。
- 代理与普通采样合计超出 Tile 预算时沿用现有预算错误。
- 任何失败都继续使用现有原子输出清理。

## 16. 测试策略

### 16.1 单元测试

- 标准长方体产生确定 OBB。
- 长轴圆柱体产生可接受圆柱候选。
- 近球形或主轴退化设备拒绝方向代理。
- 高质量门槛任一失败时拒绝。
- 三角形收益不足时拒绝。
- 主材质选择稳定。
- 顶点颜色平均值稳定且数量正确。
- 相同输入重复拟合产生相同候选和字节。

### 16.2 集成测试

- `off` 模式输出与当前比例/自适应基线一致。
- `auto` 模式同时允许代理和 QEM 设备进入同一 Tile。
- 代理选择后业务 `selectionId` 保持一致。
- 共享 mesh 的多个节点实例保持各自变换。
- 多内容分块和原子失败路径不变。
- 代理预算与普通 QEM 预算共同生效。

### 16.3 真实资产验证

在相同受控资产和相同 LOD 参数下比较：

```text
semanticProxy
acceptedUnits
obbUnits
cylinderUnits
rejectedUnits
coarseTriangles
coarseBytes
maximumErrorMeters
overBudgetNodes
buildWallClockMs
browserResidentNodes
browserResidentBytes
pageErrors
failedRequests
```

接受条件：

- 全部代理通过质量门槛。
- 粗模三角形和分块预算不恶化。
- 至少一类规则设备能稳定使用代理；若真实资产完全不适用，明确报告并保留默认关闭。
- Chromium 与 WebKit 正常加载。
- 全部生成 GLB 通过格式校验。
- 运行时 API 与 Tileset schema 无变化。

### 16.4 首轮真实资产测量

2026-10-27 在 Git 之外的受控资产上，使用相同资产、`--asset-id` 和 LOD 参数分别构建 `off` 与 `auto`。以下只记录聚合结果，不记录资产名称、路径或几何内容。

| 指标 | `off` | `auto` | 变化 |
| --- | ---: | ---: | ---: |
| 接受代理设备数 | 0 | 65 | +65 |
| OBB / 圆柱设备数 | 0 / 0 | 65 / 0 | +65 / 0 |
| 拒绝代理设备数 | 0 | 196 | +196 |
| 最终选中代理内容数 | 0 | 8 | +8 |
| 选中代理三角形数 | 0 | 96 | +96 |
| 选中代理潜在节省三角形数 | 0 | 861,436 | +861,436 |
| 粗模三角形数 | 12,270,999 | 12,270,403 | -596（-0.0049%） |
| 粗模字节数 | 201,743,340 | 201,036,248 | -707,092（-0.3505%） |
| 全部分区 GLB 字节数 | 607,811,776 | 607,104,684 | -707,092（-0.1163%） |
| 最大 Tileset 几何误差 | 2.824362 m | 2.824362 m | 不变 |
| 最大代理误差 | 0 | 0.420629 m | +0.420629 m |
| 超预算粗模节点数 | 0 | 0 | 不变 |
| 构建墙钟时间 | 146,760 ms | 188,200 ms | +41,440 ms（+28.24%） |
| 浏览器驻留节点 / 字节 | 7 / 47,863,584 | 7 / 47,863,584 | 不变 |
| 页面错误 / 失败请求 | 0 / 0 | 0 / 0 | 不变 |

“选中代理潜在节省三角形数”按每个被选中代理与原设备三角形数之差累加。粗模总三角形数只减少 596，是因为分配器会把释放出的预算重新分配给其他 QEM 设备；代理的主要作用因此是改善同一预算下的误差分布，而不是等量减少最终粗模三角形总数。

107 个 GLB 全部通过 Prepared GLB 校验，错误和警告均为 0。261 个选择身份及 1767 个节点身份的重复次数在两种模式间完全一致。Chromium 和 WebKit 都成功加载两种输出。首轮结果表明至少一类规则设备可以稳定使用 OBB，但该资产上的总预算收益有限；因此按设计保留 `auto` 为显式可选项，并继续以 `off` 作为默认值。

## 17. 实施边界

本规格可以形成独立实施计划。完成后：

- 自适应 LOD 和比例模式的既有行为保持兼容。
- 代理默认关闭，显式启用。
- 运行时无需改动。
- 凸包、人工覆盖和部件拆分留给后续规格。
- 远景簇代理仍作为第三阶段，不混入本阶段。
