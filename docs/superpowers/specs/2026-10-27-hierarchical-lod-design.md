# ICE3 层级 LOD 设计规格

| 项目 | 内容 |
| --- | --- |
| 状态 | 已确认 |
| 版本 | 1.0 |
| 日期 | 2026-10-27 |
| 适用范围 | `ice3-toolchain`、`ice3-engine`、空间 Tileset 契约和浏览器示例 |
| 前置条件 | 自适应 Tileset 调度已合入 `main` |
| 后续阶段 | 层级 LOD 粗模生成、运行时切面和选择延续 |

## 1. 目标

在现有显式空间 Tileset 上增加真正的层级 LOD：

1. 构建阶段为内部空间节点生成粗模，叶子保留细模。
2. 运行时根据屏幕空间误差，为每个可见子树独立选择精度。
3. 总览优先显示粗模，局部视角自动切换到更高精度内容。
4. 不同区域可以同时处于不同 LOD，不需要全局“粗模/细模”开关。
5. 任何切面切换都不能让可见设备出现空洞。
6. 粗模和细模保留相同的设备选择身份，切换时选中状态和业务浮层不丢失。
7. 继续复用视锥、预取、驻留预算、逐帧提交和动态卸载。
8. 使用标准 OGC 3D Tiles 1.1 语义和 Prepared GLB，不创造私有传输概念。

## 2. 成功标准

- 总览视角首先出现可覆盖整个场景的粗模，而不是等待全部细模。
- 相机聚焦设备时只细化相关子树，相邻区域可继续使用粗模。
- 可见区域始终由当前切面中的节点完整覆盖。
- 细模未完成或失败时，父粗模继续显示，不出现白洞、黑块或设备消失。
- 窗口缩放会改变屏幕空间误差，并触发重新选择精度。
- 粗模使用实际世界单位误差，不依赖固定 LOD 编号或相机距离档位。
- 选中设备从粗模切换到细模后仍保持选中和同一业务信息。
- 可见完整性优先于软驻留预算。
- 客户资产、派生粗模、截图和敏感路径不进入 Git 或发布包。

## 3. 非目标

本阶段不包含：

- 隐式分块和外部 Tileset。
- 单个 Tile 的多个内容条目。
- 运行时网格简化或格式转换。
- 纹理、PBR、贴花、动画、蒙皮或 Morph 目标。
- 自动生成碰撞体、导航网格或物理代理。
- 地形 LOD、虚拟纹理或屏幕空间反射。
- 多相机、分屏或 VR 的独立 LOD 状态。
- 精确 GPU 驱动显存计量。
- 使用固定距离阈值替代 `geometricError`。

## 4. 核心原则

1. **构建期决定粗模**：浏览器只消费 Prepared GLB。
2. **覆盖优先**：任何精度选择都必须形成无可见空洞的完整切面。
3. **误差驱动**：精度由 `geometricError`、相机和视口共同决定。
4. **局部细化**：不同空间子树独立选择 LOD。
5. **身份稳定**：视觉场景节点可变化，设备选择 ID 不变。
6. **渐进提交**：沿用逐帧提交，避免大子树在同帧阻塞。
7. **可回退**：目标内容缺失、失败或未完成时继续显示已有粗模。
8. **聚合度量**：真实资产验证只记录数量、字节、耗时和错误数。
9. **单源构建**：细模和粗模由同一次源解析和同一构建流水线产生。

## 5. 用户可见行为

### 5.1 总览

- 首次显示以根粗模为目标。
- 如果根粗模尚未驻留，加载遮罩保持显示。
- 根粗模提交后才显示场景；后续细模在后台渐进准备。
- 总览中的设备仍可选中并显示业务浮层。

### 5.2 局部聚焦

- 聚焦子树超过 SSE 阈值后开始准备更精细内容。
- 父粗模在替代内容完整可用前保持显示。
- 替代内容按帧提交；完成后移除父内容。
- 相邻未聚焦区域继续使用其粗模，不跟随当前焦点整体切换。

### 5.3 镜头离开

- 离开保留范围的粗模和细模正常卸载。
- 未完成、已过期或不属于当前目标的候选内容被丢弃。
- 选择只在当前驻留切面不再包含该选择身份时清除。

## 6. 架构

```text
Source model
    │
    ▼
Partition plan
    ├── semantic units per spatial node
    ├── fine leaf GLBs
    └── coarse internal-node GLBs
    │
    ▼
Explicit OGC 3D Tiles 1.1 tree
    │
    ▼
ICELodSelector
    ├── visible target cut
    ├── fallback ancestor chain
    └── screen-space error decisions
    │
    ▼
ICETilesetHandle
    ├── current coverage cut
    ├── target coverage cut
    ├── bounded request queue
    ├── staged candidates
    ├── per-frame commit
    ├── parent fallback retention
    └── atomic logical cut replacement
```

模块边界：

| 单元 | 职责 | 禁止 |
| --- | --- | --- |
| 分区规划 | 生成空间树、语义单元和 LOD 代理任务 | 生成浏览器场景 |
| 粗模构建 | 简化设备几何、保留选择身份、度量误差 | 运行时调用 |
| Tileset 生成 | 表达父内容、子内容和 `geometricError` | 自定义调度属性替代标准语义 |
| `ICELodSelector` | 计算目标切面、SSE 和回退链 | 下载、构景、GPU |
| `ICETilesetHandle` | 请求、缓存、提交、回退和切面生命周期 | 在每帧递归重算整棵树 |
| 应用 | 展示统计、选择和业务浮层 | 自己实现 LOD 选择 |

## 7. 资产与 Tileset 契约

### 7.1 层级结构

- 内部节点可以同时拥有 `content` 和 `children`。
- 内部节点内容是该子树后代设备的粗模。
- 叶子节点内容是该设备的现有细模。
- 所有节点使用 `refine: "REPLACE"`。
- 每个节点最多一个内容 URI。
- 粗模和细模都必须是 Prepared GLB。

### 7.2 文件布局

```text
tileset.json
parts/part-000.glb
parts/part-001.glb
coarse/group-root.glb
coarse/group-root-0.glb
coarse/group-root-1.glb
```

- 粗模文件位于 `coarse/`。
- 文件名由稳定 tile ID 派生。
- 文件名不包含源客户名称、绝对路径或本地用户名。

### 7.3 几何误差

- 叶子 `geometricError` 为零。
- 内部节点保存从粗模切换到后代内容时的保守世界误差，单位为米。
- 父节点误差取以下二者最大值：
  - 粗模相对后代细模的最大实测简化误差。
  - 所有子节点误差的最大值。
- 误差必须与 Prepared GLB 最终世界单位一致。
- 工具报告保存每个粗模的简化前后三角数、误差和字节数。

### 7.4 选择身份

- 细模继续使用源节点稳定 ID 作为选择身份。
- 粗模节点使用独立场景 ID，避免父子内容过渡时出现节点 ID 冲突。
- Prepared GLB 的节点契约增加可选 `selectionId`：

```json
{
  "extras": {
    "ice3": {
      "id": "overview:group-root-0/node/17",
      "selectionId": "asset/node/17"
    }
  }
}
```

- 缺少 `selectionId` 时沿用节点 `id`，保持现有资产兼容。
- `id` 必须在单个 GLB 中唯一。
- `selectionId` 可以跨多个 LOD 内容重复，表示同一业务设备。

## 8. 工具链设计

### 8.1 CLI

`partition` 增加：

```text
--lod
--lod-ratio <ratio>
--lod-max-triangles <count>
--lod-min-unit-triangles <count>
```

默认值：

| 参数 | 默认值 |
| --- | ---: |
| `lod` | `false` |
| `lodRatio` | `0.15` |
| `lodMaxTriangles` | `250000` |
| `lodMinUnitTriangles` | `8` |

参数校验：

- `0 < lodRatio < 1`。
- `lodMaxTriangles` 与 `lodMinUnitTriangles` 为正整数。
- `lodMinUnitTriangles <= lodMaxTriangles`。
- 未启用 `--lod` 时，其他 LOD 参数不改变现有输出。

### 8.2 简化范围

- 按分区单元中的设备分组独立简化。
- 设备内部再按材质 primitive 分别简化。
- 禁止跨设备合并三角形或复用一个简化后的选择身份。
- 基础颜色、顶点颜色和可见性语义保持不变。
- 简化完成后按现有规则生成边线。
- `--skip-edges` 同时作用于粗模和细模。

### 8.3 目标三角数

对内部节点的每个设备单元：

```text
unitTarget = max(minUnitTriangles, floor(unitTriangles * lodRatio))
```

- 原始设备三角数不高于下限时保留原几何。
- 所有设备目标之和不超过 `lodMaxTriangles` 时直接使用。
- 超过上限时，在不低于每个设备下限的前提下，优先压缩三角数最多的设备。
- 当“设备数 × 下限”已经超过节点上限时，设备完整性优先，允许节点超软上限。
- 工具报告必须标记该情况，不能静默删除设备。

### 8.4 简化算法

- 使用成熟的二次误差边折叠实现。
- 简化器只运行在工具链中。
- 每个 primitive 输出新的位置和索引缓冲。
- 简化误差从局部单位转换到场景世界单位。
- 每个设备至少保留一个有效三角形。
- 无法安全简化时保留原设备几何。
- 工具不改变源模型坐标、材质或选择分组语义。

### 8.5 生成与发布

细模和粗模属于同一个构建任务，不是前后独立的两轮流程。

1. 源模型只解析一次。
2. 按设备语义单元提取坐标、几何、颜色和选择身份，形成规范化中间结果。
3. 规划空间树，并把每个设备的中间几何放入受控临时工作区。
4. 同一次构建任务生成叶子细模和内部节点粗模。
5. 每个粗模从该设备对应的原始规范化几何简化，不从已经简化过的子粗模再次简化。
6. 使用实测误差和子节点误差生成 `geometricError`。
7. 输出 Tileset、粗模文件、细模文件和可选报告。
8. 校验选择身份覆盖、误差单调性和父级包围盒包含关系。
9. 整目录原子发布。

临时工作区要求：

- 优先使用系统临时目录，不使用发布目录或客户资产目录。
- 内存缓存必须有上限；超过上限的语义单元写入临时文件并在使用后释放。
- 同一规范化设备几何可以在生成不同祖先粗模时复用，但不得把子粗模误当成原始几何。
- 失败、中止或成功完成后都删除临时工作区。
- 诊断日志不得记录临时文件中的客户名称、节点名称或绝对路径。

构建必须保证：

- 源模型的每个设备只被规范化一次。
- 细模与粗模对同一设备使用相同选择身份。
- 粗模误差基于原始规范化几何计算，不随祖先层数重复累加。
- 未启用 `--lod` 时保持现有单精度构建路径。
- 任一步失败都不保留发布目录。

### 8.6 工具统计

结果至少包含：

- 细模三角数。
- 粗模三角数。
- 每种粗模级别的误差。
- 粗模总字节。
- 最大粗模字节。
- 被保留而未简化的设备数。
- 因完整性优先超过软三角上限的节点数。

## 9. 运行时选择

### 9.1 选项

`ICETilesetLoaderOptions` 增加：

```ts
readonly maxScreenSpaceErrorPixels?: number;
```

默认值：

```text
maxScreenSpaceErrorPixels = 16
```

要求为有限正数。

### 9.2 纯选择器

运行时提供独立的纯计算单元：

```ts
export interface ICELodSelectionInput {
  readonly root: ICETilesetTile;
  readonly camera: ICEPerspectiveCamera;
  readonly viewport: ICEViewport;
  readonly residentIds: ReadonlySet<string>;
  readonly failedIds: ReadonlySet<string>;
  readonly maxScreenSpaceErrorPixels: number;
}

export interface ICELodSelection {
  readonly target: readonly ICETilesetTile[];
  readonly fallbackByTargetId: ReadonlyMap<string, string>;
}

export class ICELodSelector {
  select(input: ICELodSelectionInput): ICELodSelection;
}
```

选择器不执行网络、场景或 GPU 操作。

### 9.3 屏幕空间误差

```text
SSE = geometricError * viewportHeight
      / (2 * distance * tan(verticalFov / 2))
```

- `verticalFov` 使用弧度。
- `distance` 是相机位置到 tile 包围盒最近点的距离，最小钳制为相机 near 值。
- `SSE > maxScreenSpaceErrorPixels` 时继续细化。
- 叶节点、无子节点或误差为零时停止细化。

### 9.4 目标切面

从根开始遍历：

1. 与严格视锥不相交的子树不进入目标切面。
2. 当前节点无需细化时选择该节点内容。
3. 当前节点需要细化时递归遍历全部可见子节点。
4. 无内容的内部节点必须继续向子节点细化。
5. 输出节点必须覆盖每个可见叶子区域。

位于视锥外的兄弟子树无需加入目标切面，因为不会造成可见空洞。

### 9.5 回退链

每个目标 tile 记录最近的、有内容的祖先：

- 优先请求目标节点。
- 若目标节点及其父级都未驻留，先请求最近的粗模祖先。
- 父粗模显示后，再准备目标内容。
- 目标及其必要兄弟内容全部可用前，不移除父粗模。

## 10. 切面切换

### 10.1 当前切面与目标切面

- `currentCut` 是当前实际绘制的覆盖切面。
- `targetCut` 是 SSE 选择出的目标覆盖切面。
- 相机或视口变化只更新 `targetCut`，不立即修改场景。

### 10.2 加载与提交

- 目标内容进入现有有界请求队列。
- 成功构景的节点进入候选集合，不立即移除父内容。
- 每帧最多提交 `maxCommitsPerFrame` 个候选。
- 目标子树所有必要内容提交后，才移除被替代的父内容。
- 切面变化只请求一次重绘。

### 10.3 相机再次变化

- 重新计算目标切面。
- 不属于新目标且不在保留范围的候选直接释放。
- 当前切面保持可覆盖状态，直到新目标覆盖内容可用。
- 已开始但不属于新目标的请求允许完成，完成后立即释放。

### 10.4 失败

- 细模失败保留父粗模，记录局部 LOD fallback。
- 单个子树的失败不使整个 Tileset 进入致命错误。
- 如果根粗模失败且没有可显示内容，才进入全局失败状态。
- 失败目标在后续相机变化时可以重新进入请求集合。

### 10.5 节点身份

- 粗模和细模场景节点 ID 全局唯一。
- 切换期间允许父子内容短暂同时驻留。
- 父内容退出后，不留下空容器、陈旧缓存或重复节点。

## 11. 选择延续

- 选择状态基于稳定 `selectionId`，不基于当前 LOD 的视觉节点 ID。
- 粗模提交后，如果对应选择 ID 仍存在，选择保持不变。
- 父粗模退出前，细模必须已包含同一选择 ID。
- 卸载粗模时只在当前驻留场景中不存在该选择 ID 时清空选择。
- 选择浮层不因 LOD 切换闪烁或丢失。
- 同一 `selectionId` 在过渡中同时存在时，拾取只返回一个逻辑设备。

## 12. 预算与性能

- 可见覆盖内容优先于软驻留预算。
- 预算达到上限时停止加载预取和非必要细化。
- 低精度父模取代高精度子模可以降低驻留字节。
- 过渡期间父子同时驻留会临时增加字节和三角形数，这是预期行为。
- 过渡完成后释放父内容，驻留指标必须下降。

新增统计：

```ts
export interface ICELodStats {
  readonly target: number;
  readonly resident: number;
  readonly coarseResident: number;
  readonly fineResident: number;
  readonly transitioning: number;
  readonly fallback: number;
  readonly maxScreenSpaceErrorPixels: number;
}
```

- `target`：目标切面节点数。
- `resident`：当前切面实际驻留节点数。
- `coarseResident`：有子节点的驻留内容数。
- `fineResident`：叶子驻留内容数。
- `transitioning`：存在待提交内容且父内容仍在显示的子树数。
- `fallback`：目标内容不可用而显示祖先粗模的子树数。

## 13. 事件与诊断

新增事件：

- `TILESET_LOD_CHANGED`：目标切面发生变化。
- `TILESET_LOD_FALLBACK`：目标精度不可用并启用祖先回退。

新增诊断：

| 代码 | 触发器 | 调用方动作 |
| --- | --- | --- |
| `ICE3_TILESET_LOD_INVALID` | 层级内容、误差或选择身份不合法 | 使用工具链重新生成 |
| `ICE3_TILESET_LOD_FALLBACK` | 细模未完成或失败，继续显示粗模 | 保留当前画面并检查日志 |

预算诊断继续使用 `ICE3_TILESET_RESIDENT_BUDGET_EXCEEDED`。

## 14. 量化指标

浏览器和真实资产测量至少记录：

- `firstCoarseContentMs`
- `targetCutReadyMs`
- `residentNodes`
- `coarseNodes`
- `fineNodes`
- `residentTriangles`
- `residentBytes`
- `coarseToFineTriangleReduction`
- `coarseToFineByteReduction`
- `transitionCount`
- `fallbackCount`
- `selectionRetentionCount`
- `pageErrors`

不记录客户名称、节点名称、绝对路径、截图或几何快照。

## 15. 验证策略

### 15.1 工具测试

- 内部节点生成粗模，叶子保持原细模。
- 粗模三角数低于后代细模。
- 每个设备选择 ID 在粗模中存在。
- 基础颜色和边线保留。
- 低三角设备按规则保留原几何。
- 粗模上限和单设备下限的冲突按完整性优先处理。
- 父级误差不小于子级误差，叶子误差为零。
- 失败时不发布半成品目录。

### 15.2 Tileset 测试

- 接收内部内容与 `REPLACE`。
- 拒绝多重内容、非法误差和非 Prepared GLB。
- 父内容 URI 和子内容 URI 均可解析。
- 选择身份扩展通过 Prepared GLB 校验。

### 15.3 选择器测试

- 总览选择根粗模。
- 聚焦后只细化相关子树。
- 相邻子树可以停留在不同精度。
- 视口宽高变化会改变 SSE。
- 阈值边界行为确定。
- 目标切面无可见覆盖空洞。
- 视锥外子树不进入目标。

### 15.4 生命周期测试

- 父粗模保持到目标子树完整可用。
- 过渡中相机变化会丢弃旧候选。
- 细模失败保持父粗模。
- 父内容退出后节点和缓存被释放。
- 选择跨粗模到细模保持。
- 整包释放清空所有选择。
- 每帧提交数量不超配置。

### 15.5 浏览器测试

- 合成层级资产首次显示粗模。
- 聚焦后切换到细模。
- 退回总览后恢复粗模并释放细模。
- 窗口缩放触发切面变化。
- 选择在切面变化后保持。
- 请求失败时保留粗模覆盖。
- Chromium 与 WebKit 均通过。

## 16. 验收标准

1. 工具能够从一个受控模型生成父粗模和叶子细模。
2. Tileset 使用标准显式树、`REPLACE` 和真实 `geometricError`。
3. 运行时总览先显示粗模，局部聚焦后细化对应子树。
4. 粗模和细模可以同时驻留并在过渡后释放粗模。
5. 切换期间没有可见空洞。
6. 细模失败时父粗模继续显示。
7. 选中设备跨 LOD 切换保持。
8. 可见完整性优先于软预算。
9. 所有单元、浏览器和打包门禁通过。
10. 真实资产测量只留下聚合指标。

## 17. 隐私与命名

- 真实客户模型、派生粗模和截图不得进入 Git、测试夹具、日志或发布包。
- 文档和实现不写客户文件名或绝对路径。
- 不使用竞品名称描述设计。
- API 和代码沿用 ICE 家族命名。
