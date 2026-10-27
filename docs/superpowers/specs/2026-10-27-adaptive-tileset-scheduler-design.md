# ICE3 自适应 Tileset 调度设计规格

| 项目 | 内容 |
| --- | --- |
| 状态 | 待用户评审 |
| 版本 | 1.0 |
| 日期 | 2026-10-27 |
| 适用范围 | `ice3-engine` 的 Tileset 运行时、现有浏览器示例和后续 LOD |
| 前置条件 | 空间分区与开放 Tileset 管线已合入 `main` |
| 后续阶段 | LOD 粗模生成与多精度选择 |

## 1. 目标

把 Tileset 运行时从“按距离顺序加载全部分区”改为“维护与当前相机相关的工作集”：

1. 只请求严格视锥内和有限预取范围内的分区。
2. 离开保留范围的分区从统一场景卸载。
3. 相机移动不会让已经无关的低优先级请求和完成结果继续占用场景或 GPU。
4. 场景合并与首次 GPU 上传按帧限流，避免多个分区在同一帧集中提交。
5. 驻留分区数和几何缓冲字节数可观测、可配置。
6. 缓存、场景节点和 GPU 引用在卸载及整包释放时能够回收。

完整加载全部 Tileset 不再是目标。全部加载时间只保留为诊断信息。

## 2. 成功标准

- 相机聚焦局部区域时，不请求严格视锥和预取范围之外的分区。
- 相机离开区域后，相关分区被卸载，驻留数量和几何字节下降。
- 相机小幅移动不会触发反复加载和卸载。
- 每帧最多提交一个已完成分区和一次重绘请求。
- 已加载、加载中、失败、卸载状态可以准确观察。
- `whenIdle()` 正确等待当前工作集稳定；相机变化会开启新一轮等待。
- 卸载后重新进入视野可以安全重载，不留下陈旧节点、选择引用或缓存。
- 总览全厂时仍然完整显示所有可见设备，不因预算人为制造空洞。
- 现有 Chromium 与 WebKit 功能和交互测试不回退。

## 3. 非目标

本阶段不包含：

- LOD 生成、LOD 选择或屏幕空间误差细化。
- 对父节点与子节点内容同时存在的 Tileset 进行 LOD 调度。
- 隐式分块、外部 Tileset 或 `region` 坐标。
- Web Worker 几何解析。
- 渲染器内部的单缓冲增量上传。
- 后台全场景预加载。
- 真实 GPU 驱动显存计量。
- 多相机或分屏调度。

## 4. 核心指标口径

| 指标 | 定义 |
| --- | --- |
| `firstContentMs` | 从发起 Tileset 请求到首个可见分区完成两次动画帧的时间 |
| `resident` | 当前加入统一场景的已加载分区数 |
| `residentBytes` | 驻留分区顶点、索引、边线和颜色 TypedArray 字节数之和 |
| `visible` | 严格视锥相交分区数 |
| `pending` | 属于当前工作集但尚未开始请求的分区数 |
| `loading` | 正在请求或构景的分区数 |
| `failed` | 当前调度周期内失败的分区数 |
| `evicted` | 因离开保留范围而卸载的分区数 |
| `commitFrameCount` | 实际发生分区场景提交的帧数 |

`residentBytes` 是显式估算值，不冒充 GPU 驱动报告的实际显存。

## 5. 架构

```text
ICEPerspectiveCamera
        │
        ▼
ICEFrustum (core)
        │
        ▼
ICETilesetScheduler (runtime, pure state decisions)
        │
        ├── desired visible set
        ├── prefetch set
        ├── retain/evict set
        └── priority order
        │
        ▼
ICETilesetHandle
        ├── bounded network queue
        ├── one-partition-per-frame commit queue
        ├── unified ICEScene
        ├── per-tile scene container
        └── statistics and events
```

模块边界：

| 单元 | 职责 | 禁止 |
| --- | --- | --- |
| `ICEFrustum` | 从 view-projection 提取平面并判断包围盒关系 | 网络、DOM、GPU、业务状态 |
| `ICETilesetScheduler` | 根据相机、分区边界和预算生成工作集及优先级 | 下载、构景、修改节点 |
| `ICETilesetHandle` | 下载、构景、逐帧提交、卸载和事件 | 把视锥数学写进生命周期类 |
| `ICEAssetLoader` | 单 GLB 下载、解析、构景及缓存清理入口 | Tileset 调度策略 |
| 应用示例 | 展示进度、选择和业务浮层 | 自己重写调度算法 |

## 6. 视锥与保留范围

### 6.1 视锥 API

`@ice3/core` 新增 ICE 家族风格的通用视锥：

```ts
export class ICEFrustum {
  static fromViewProjection(matrix: ICEMatrix4): ICEFrustum;
  intersectsBounds(bounds: ICEGeometryBounds, margin?: number): boolean;
}
```

实现要求：

- 平面从 view-projection 矩阵按列主序提取。
- 六个平面归一化。
- 包围盒使用所有八个角点判断是否完全位于任一平面外侧。
- `margin` 将平面向视锥外侧扩展，单位为世界空间。
- 不依赖 Canvas、WebGL 或 DOM。

### 6.2 三组范围

每次调度计算三个集合：

- **visible**：与严格视锥相交。
- **prefetch**：与向外扩展 `prefetchMarginRatio * sceneRadius` 的视锥相交，但不属于 visible。
- **retain**：与向外扩展 `unloadMarginRatio * sceneRadius` 的视锥相交。

默认：

```text
prefetchMarginRatio = 0.10
unloadMarginRatio = 0.20
```

要求 `unloadMarginRatio > prefetchMarginRatio > 0`，形成加载和卸载之间的滞回区。

### 6.3 优先级

同一范围内的分区按以下顺序排序：

1. visible 优先于 prefetch。
2. 分区包围盒中心到相机位置的距离更近者优先。
3. 距离相同时按稳定 tile ID 排序。

## 7. 预算模型

`ICETilesetLoaderOptions` 调整为：

```ts
export interface ICETilesetLoaderOptions {
  readonly fetch?: typeof globalThis.fetch;
  readonly camera: ICEPerspectiveCamera;
  readonly maxConcurrentTiles?: number;
  readonly maxResidentTiles?: number;
  readonly maxResidentBytes?: number;
  readonly prefetchMarginRatio?: number;
  readonly unloadMarginRatio?: number;
  readonly maxCommitsPerFrame?: number;
}
```

默认值：

| 选项 | 默认值 |
| --- | ---: |
| `maxConcurrentTiles` | 2 |
| `maxResidentTiles` | 24 |
| `maxResidentBytes` | 256 MiB |
| `prefetchMarginRatio` | `0.10` |
| `unloadMarginRatio` | `0.20` |
| `maxCommitsPerFrame` | 1 |

### 7.1 完整性优先

visible 分区具有最高优先级：

- visible 分区即使使 resident 数量或字节超过预算，也可以加载和保留。
- 预算不能导致视野内设备缺少。
- 超出预算时发出一次去重后的
  `ICE3_TILESET_RESIDENT_BUDGET_EXCEEDED` warning。
- 预算主要限制预取和保留集合之外的内存。

### 7.2 卸载

已加载分区在以下情况卸载：

- 不再与 retain 视锥相交。
- 超出驻留缓存预算，且不属于 visible。
- Tileset handle 被释放。

卸载步骤：

1. 若当前选择位于该分区，先清空选择。
2. 从统一场景移除整个分区容器。
3. 释放容器中的节点和几何引用。
4. 清理该分区在单 GLB loader 中的缓存。
5. 请求重绘。
6. 发出 `TILESET_TILE_UNLOADED`。

visible 分区不得仅因预算被卸载。

## 8. 分区容器与场景完整性

每个已加载分区必须始终包围在一个稳定容器节点中：

```text
unified scene
└── <asset-id>:tile:<tile-id>
    └── partition GLB scene roots
```

即使分区的标准 transform 是单位矩阵，也要创建容器，以便原子卸载。容器 ID 只由稳定资产 ID 和 tile ID 组成。

加载失败不得留下空容器。重载后不得复用包含陈旧子节点的容器。

## 9. 加载、提交与卸载队列

### 9.1 网络队列

- 同时最多 `maxConcurrentTiles` 个请求。
- 队列内容随相机变化重新排序。
- 尚未开始的过期预取直接移除。
- 已开始的请求允许完成，不要求运行时中断底层 fetch。
- 请求完成时重新检查分区是否仍在 retain 集合。
- 已无关的结果构景后立即释放，不加入统一场景。

### 9.2 提交队列

- 成功构景的分区进入独立提交队列。
- 每帧最多提交 `maxCommitsPerFrame` 个分区。
- 每提交一个分区后，场景变更只请求一次重绘。
- 提交前再次检查 `whenIdle()` 等待条件和缓存预算。
- 提交与相机调度都不得在渲染帧内部递归触发渲染。

### 9.3 调度触发

- 初始化时执行一次调度。
- 监听引擎渲染生命周期，在相机位置、目标或视口改变后执行调度。
- 若相机矩阵和视口均未变化，不重复计算或重新排序。
- 调度计算以微任务或帧任务执行，不允许递归进入当前渲染。

## 10. 公共 API 与状态

### 10.1 状态

```ts
export type ICETilesetTileState =
  | 'pending'
  | 'loading'
  | 'loaded'
  | 'failed'
  | 'evicted';
```

### 10.2 统计

```ts
export interface ICETilesetStats {
  readonly total: number;
  readonly visible: number;
  readonly resident: number;
  readonly residentBytes: number;
  readonly pending: number;
  readonly loading: number;
  readonly loaded: number;
  readonly failed: number;
  readonly evicted: number;
}
```

`loaded` 与 `resident` 在本阶段定义相同，保留两个字段是为了区分下载完成和场景驻留。

### 10.3 句柄

```ts
export class ICETilesetHandle extends ICEEventDispatcher {
  readonly scene: ICEScene;
  readonly bounds: ICEGeometryBounds;
  get stats(): ICETilesetStats;
  tileState(tileId: string): ICETilesetTileState | undefined;
  whenReady(): Promise<void>;
  whenIdle(): Promise<void>;
  dispose(): void;
}
```

`whenReady()`：

- 首个 visible 分区成功提交后 resolve。
- 所有可见分区失败时 reject。

`whenIdle()`：

- 当前工作集没有 pending、loading 或待提交分区时 resolve。
- 调用后若相机使工作集再次变化，旧调用不等待未来工作集。
- 新调用 `whenIdle()` 才等待当前最新工作集。

移除 `whenComplete()`。它会让调用方错误地认为系统最终必须驻留全部 Tileset。

### 10.4 事件

- `TILESET_TILE_LOADING`
- `TILESET_TILE_LOADED`
- `TILESET_TILE_FAILED`
- `TILESET_TILE_UNLOADED`
- `TILESET_READY`
- `TILESET_IDLE`

事件参数使用冻结的统计快照；分区事件同时携带 tile ID。

## 11. 错误与诊断

新增：

- `ICE3_TILESET_CAMERA_REQUIRED`
- `ICE3_TILESET_RESIDENT_BUDGET_EXCEEDED`

保持：

- `ICE3_TILESET_INVALID`
- `ICE3_TILESET_UNSUPPORTED`
- `ICE3_TILESET_TILE_FAILED`
- `ICE3_TILESET_DUPLICATE_ID`
- `ICE3_TILESET_ABORTED`

规则：

- 缺少 camera 时拒绝打开 Tileset。
- 不可见预取失败不显示全局错误，只记录 tile failure。
- visible 分区失败继续保留其他成功区域，并维持 partial 状态。
- 预算压力是 warning，不是加载失败。
- dispose 中止所有排队请求、清空缓存、移除场景容器并结算 idle promise。

## 12. 示例更新

示例进度从“全部分区完成数”改为工作集指标：

```text
驻留 12 · 可见 8 · 预取中 2 · 总计 54
```

状态规则：

- 首个 visible 分区提交后隐藏加载遮罩。
- 当前工作集 idle 后显示“当前视角已就绪”。
- 部分 visible 分区失败时显示失败数，但保留其他分区。
- 相机移动时更新进度，不显示“加载完全部 54 个分区”。
- 现有选择、信息浮层、方向键、WASD、鼠标旋转和缩放保持不变。

## 13. 验证策略

### 13.1 Core

- view-projection 提取六个平面。
- 包围盒完全位于每个平面外时被裁剪。
- 与视锥相交但中心在外的包围盒不会被误裁。
- margin 能正确扩展边界。
- 退化包围盒和零尺度包围盒有确定行为。

### 13.2 调度器

- 只生成 visible 和 prefetch 请求。
- 卸载边界大于预取边界。
- 相机小幅移动不改变工作集。
- 超预算时只卸载非 visible 分区。
- visible 超出预算时产生 warning 并保留完整性。
- 按 visible、距离和稳定 ID 排序。
- 过期预取在开始前被移除。
- 完成结果在提交前重新检查保留范围。

### 13.3 Loader 与生命周期

- 每帧提交数不超过配置。
- 分区容器在单位和非单位 transform 下都可原子卸载。
- 卸载后单 GLB 缓存被清理。
- 选择中的设备卸载时选择被清空。
- 重载不产生重复容器或节点 ID。
- `whenIdle()` 不等待相机变化前的工作集。
- dispose 中止队列并释放所有驻留分区。
- 统计字段与实际场景节点、TypedArray 字节一致。

### 13.4 浏览器 E2E

- 聚焦局部区域时，请求数少于 Tileset 总分区数。
- 相机移动到另一区域后，旧分区卸载、新分区加载。
- 小幅相机移动不触发反复网络请求。
- 超过预算时视野内完整显示并出现 warning。
- 示例状态使用工作集语义。
- Chromium 与 WebKit 均通过。

### 13.5 真实资产验收

使用仓库外的受控资产：

- 记录总览视角的 visible 数和 resident 数，允许可见集合超过预算。
- 聚焦局部区域后，resident 分区数必须低于总分区数。
- 相机切出区域后，residentBytes 和 resident 必须下降。
- 台账只记录聚合指标，不记录客户名称、节点名称或几何。
- 生成物验证后清理，不进入版本库。

## 14. 后续 LOD 阶段

本阶段完成后立即开始 LOD，但使用独立规格和计划：

- 工具链生成粗模和多精度分区。
- Tileset 表达父子层级和 `geometricError`。
- 运行时支持父节点内容与子节点的 `REPLACE` 选择。
- 全厂总览使用粗模，局部视角切换到高精度分区。

本阶段建立的 frustum、预算、逐帧提交和卸载机制必须可直接被 LOD 复用。

## 15. 验收标准

本阶段完成时：

1. 可见工作集调度和卸载由公共运行时实现，不由示例自行模拟。
2. 相机离开区域后不继续驻留无关分区。
3. 每帧最多完成配置数量的分区提交。
4. 工作集超过预算时完整性优先，并有 warning。
5. `whenIdle()` 在当前工作集稳定后正确结算。
6. 现有 44 条浏览器 E2E 更新到工作集语义后全部通过。
7. 真实模型局部视角下的 resident 分区数显著低于 54。
8. 所有仓库验证门禁与打包检查通过。
9. 客户资产或派生内容未进入 Git、测试夹具、截图或发布包。
