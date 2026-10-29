# ICE3 资产预处理协同契约 v1

> Document ID: ICE3-DOC-CTR-001
>
> Status: Active
>
> Owner: ICE3 architecture maintainers

| 项目 | 内容 |
| --- | --- |
| 状态 | 生效 |
| 版本 | 1.0 |
| 日期 | 2026-10-27 |
| 适用范围 | ICE3 引擎、工具链、CLI、未来的资产工具 UI 和 CI |
| 契约形式 | GLB 内嵌运行时契约 + 可选 JSON 旁路报告 |

## 1. 目标

建立一套“契约紧、实现松”的资产协同关系：

- 源格式解析、坐标和单位规范化、几何准备、选择分组、空间索引和优化全部在工具侧完成。
- 运行时只校验并消费已经准备好的数据进行 GPU 上传、绘制、拾取和交互。
- 工具链和引擎使用同一套资产指标、预算口径、稳定身份和诊断码。
- 单个 prepared GLB 可以独立部署，不依赖旁路文件。
- CLI、未来 UI 和 CI 使用详细旁路报告进行质量检查，不把报告变成运行时依赖。

## 2. 核心原则

1. **预处理优先**：所有重转换和可能造成卡顿的工作离线完成。
2. **运行时零转换**：运行时不得重新三角化、合并、拆分、旋转换算、单位换算、解码必需压缩或生成空间索引。
3. **单文件运行**：运行时所需信息必须内嵌在 GLB 中。
4. **旁路可审计**：详细检查、软预算和人工诊断放在可选 JSON 报告中。
5. **同口径指标**：工具与引擎对同名指标采用相同定义。
6. **稳定身份**：资产、节点、网格、材质、设备和运行时引用使用确定性 ID。
7. **版本可协商**：配置档版本和协同契约版本相互独立。
8. **失败前置**：不兼容、不可运行或超出硬预算的资产不得发布。

## 3. 职责边界

| 工程 | 负责 | 禁止 |
| --- | --- | --- |
| 资产工具 UI | 选择配置、展示检查报告、预算和差异 | 进入浏览器运行时热路径 |
| CLI / CI | 自动化构建、预算门禁、回归和发布 | 在页面运行时调用 |
| toolchain-core | 源格式读取、规范化、几何准备、选择分组、契约生成 | 依赖引擎运行时 |
| `@ice3/assets` | 读取并验证 prepared GLB 与内嵌契约 | 依赖工具链源码 |
| `@ice3/runtime` | 下载、校验、实例化、资源生命周期和运行诊断 | 重做离线预处理 |
| `@ice3/renderer` | 直接上传准备好的缓冲并执行绘制、拾取 | 了解源格式或业务资产 |
| 应用业务层 | 设备业务信息、告警、点位和真实运行状态 | 修改引擎资产格式 |

工具链和引擎不允许直接导入对方私有源码。双方通过本契约、冻结样例和契约测试协作。

## 4. 两类交付物

### 4.1 Prepared GLB

运行时必需，是唯一权威资产：

- 标准 GLB 容器。
- 包含几何、材质、稳定身份和 ICE3 配置档。
- 内嵌运行所需的协同契约摘要。
- 不包含绝对路径、源客户文件名、时间戳或运行环境相关内容。

### 4.2 Asset Report JSON

运行时可选，供工具和 CI 使用：

- 与 Prepared GLB 成对生成。
- 不参与默认浏览器加载。
- 缺失时 GLB 仍可运行。
- 存在时用于审计、CI、UI 展示和跨版本比较。
- 不包含真实客户源路径或无法公开的资产内容。

## 5. GLB 内嵌契约

契约位于 `asset.extras.ice3`。现有 `profileVersion` 表示 GLB 配置档兼容性，`contractVersion` 表示工具和引擎之间的协同契约版本。

```json
{
  "profile": "ice3-prepared",
  "profileVersion": "1.0",
  "contractVersion": "1.0",
  "assetId": "example-asset",
  "contentDigest": {
    "algorithm": "sha256",
    "value": "<binary-chunk-sha256>",
    "covers": "binary-chunk"
  },
  "coordinateSystem": {
    "handedness": "right",
    "upAxis": "y",
    "linearUnit": "meter"
  },
  "colorSpace": "srgb",
  "bounds": {
    "min": [0, 0, 0],
    "max": [1, 1, 1]
  },
  "stats": {
    "nodeCount": 1,
    "maxNodeDepth": 0,
    "meshCount": 1,
    "primitiveCount": 2,
    "triangleCount": 12,
    "edgeSegmentCount": 18,
    "materialCount": 2,
    "selectionGroupCount": 1
  },
  "preparation": {
    "runtimeConversionRequired": false,
    "sourceFormat": "gltf-2.0",
    "unitsNormalized": true,
    "matrixTransformsBaked": true,
    "requiredCompressionDecoded": true,
    "edgesPrepared": true,
    "selectionGroupsPrepared": true,
    "options": {
      "creaseAngleDegrees": 30,
      "edges": true
    }
  },
  "budget": {
    "profile": "interactive-desktop-v1",
    "status": "pass",
    "warningCount": 0,
    "errorCount": 0
  }
}
```

### 5.1 内嵌字段约束

- 内嵌内容必须保持小型，不放大型空间索引、完整诊断列表或业务数据。
- `runtimeConversionRequired` 只能为 `false`；为 `true` 时运行时必须拒绝资产。
- `stats` 是从 GLB 结构计算出的权威统计，不使用估算值。
- `budget.status` 是构建时结论；详细逐项比较放在旁路报告中。
- `sourceFormat` 只记录中性格式名称，不记录客户端路径。
- `options` 只记录会改变资产生成结果的选项。

## 6. 旁路报告

建议文件名：`<asset-id>.report.json`。

```json
{
  "kind": "ice3-asset-report",
  "schemaVersion": "1.0",
  "asset": {
    "id": "example-asset",
    "profileVersion": "1.0",
    "contractVersion": "1.0",
    "contentDigest": "sha256:<hex>"
  },
  "status": "pass",
  "tool": {
    "name": "ice3-toolchain",
    "version": "0.0.0"
  },
  "source": {
    "format": "gltf-2.0",
    "digest": "sha256:<hex>"
  },
  "metrics": {
    "encodedBytes": 1234,
    "jsonChunkBytes": 512,
    "binChunkBytes": 722,
    "nodeCount": 1,
    "maxNodeDepth": 0,
    "meshCount": 1,
    "primitiveCount": 2,
    "triangleCount": 12,
    "edgeSegmentCount": 18,
    "materialCount": 2,
    "selectionGroupCount": 1
  },
  "budget": {
    "profile": "interactive-desktop-v1",
    "status": "pass",
    "checks": [
      {
        "id": "triangles",
        "metric": "triangleCount",
        "value": 12,
        "softLimit": 5000000,
        "hardLimit": 20000000,
        "status": "pass",
        "message": "Triangle count is within the interactive budget."
      }
    ]
  },
  "diagnostics": []
}
```

### 6.1 报告约束

- `source.path`、绝对路径、用户名、客户名称和真实客户文件名不得写入报告。
- 需要关联源文件时使用内容摘要，不使用路径。
- 报告不得包含模型截图、纹理内容或大块几何数据。
- 同一输入、选项、工具版本和预算配置生成相同报告内容，不写时间戳。
- `status` 取值为 `pass`、`warning` 或 `error`。
- 诊断项使用稳定 `code`、`severity`、`message` 和可选结构路径。

## 7. 统一指标定义

| 指标 | 定义 |
| --- | --- |
| `encodedBytes` | 最终 GLB 文件总字节数 |
| `jsonChunkBytes` | GLB JSON chunk 填充后的字节数 |
| `binChunkBytes` | GLB BIN chunk 字节数 |
| `nodeCount` | 输出场景图节点数 |
| `maxNodeDepth` | 根节点到最深叶节点的层数，根节点为 0 |
| `meshCount` | 输出 glTF mesh 条目数，不等同于 draw call |
| `primitiveCount` | 所有 mesh 的 primitive 数量 |
| `triangleCount` | 三角形 primitive 中三角形总数 |
| `edgeSegmentCount` | 预处理边线线段总数 |
| `materialCount` | 输出材质数 |
| `selectionGroupCount` | 唯一设备选择身份数 |

运行时额外采集但不写入 GLB：

- `gpuBytes`：当前几何缓冲占用。
- `drawCalls`：上一帧实际 draw call 数。
- `renderedMeshes`：上一帧实际绘制网格数。
- `pickTimeMs`：最近一次精确拾取耗时。
- `cpuFrameTimeMs`：最近一帧 CPU 提交耗时。

工具不得用 `meshCount` 冒充 draw call。需要联合评估时，以工具 metrics 和运行时诊断成对展示。

## 8. 预算模型

### 8.1 门禁级别

- `pass`：所有指标低于软限制。
- `warning`：至少一项超过软限制，但未超过硬限制；允许构建，CI 可用 `--warnings-as-errors` 拒绝发布。
- `error`：至少一项超过硬限制；不得生成最终 GLB。

### 8.2 基线档位

`interactive-desktop-v1` 是初始工程基线，不是永久行业标准，必须通过真实设备基准持续校准。

| 指标 | 软限制 | 硬限制 |
| --- | ---: | ---: |
| `nodeCount` | 25,000 | 50,000 |
| `meshCount` | 5,000 | 15,000 |
| `primitiveCount` | 10,000 | 30,000 |
| `triangleCount` | 5,000,000 | 20,000,000 |
| `edgeSegmentCount` | 10,000,000 | 40,000,000 |
| `encodedBytes` | 128 MiB | 512 MiB |
| `selectionGroupCount` | 20,000 | 100,000 |

`unrestricted` 只用于诊断、试验或明确接受风险的高级场景，不应用于默认发布。

### 8.3 预算配置

预算可以从以下来源提供：

1. 内置档位。
2. JSON 预算文件。
3. CI 环境中的发布策略。

最终 GLB 只记录档位名、状态和告警/错误数量；逐项比较只存在旁路报告。

## 9. 工具命令契约

建议扩展：

```text
ice3-tool inspect <source> [--json] [--budget <profile-or-file>]
ice3-tool build <source> --output <file.glb> [--report <file.json>]
ice3-tool validate <file.glb> [--report <file.json>]
```

规则：

- 生成旁路报告时，报告必须与最终 GLB 的摘要和指标一致。
- 硬预算失败时不留下最终 GLB。
- 报告和 GLB 分别使用临时文件原子替换。
- 如果报告可选且写入失败，GLB 仍是权威资产，CLI 必须返回明确错误和诊断。
- `--warnings-as-errors` 可以把软预算 warning 提升为发布失败。

## 10. 引擎消费契约

引擎负责：

1. 读取并验证 `profileVersion` 与 `contractVersion`。
2. 拒绝 `runtimeConversionRequired: true`。
3. 将 `stats` 与读取到的实际资产结构进行廉价一致性检查。
4. 通过 `ICEAssetHandle.contract` 暴露只读契约摘要。
5. 让应用可以读取工具声明值，但不在运行时加载旁路报告。

兼容规则：

- 缺少 `contractVersion` 的旧资产仍可加载，但产生一次 `ICE3_ASSET_CONTRACT_MISSING` warning。
- 不支持的主版本产生 `ICE3_ASSET_CONTRACT_UNSUPPORTED` error 并拒绝加载。
- 同主版本新增可选字段属于兼容变更。

## 11. 运行时诊断闭环

应用和调试界面应能够同时查看：

- 工具声明的资产统计。
- 运行时实际场景统计。
- GPU 缓冲、draw call 和网格数。
- 最近拾取与 CPU 帧耗时。

两者出现明显差异时产生：

- `ICE3_ASSET_STATS_MISMATCH`
- `ICE3_ASSET_CONTRACT_MISSING`
- `ICE3_ASSET_CONTRACT_UNSUPPORTED`

工具侧稳定诊断：

- `ICE3_TOOL_BUDGET_WARNING`
- `ICE3_TOOL_BUDGET_EXCEEDED`
- `ICE3_TOOL_RUNTIME_CONVERSION_REQUIRED`
- `ICE3_TOOL_REPORT_WRITE_FAILED`

## 12. 版本与兼容

### 12.1 独立版本

- `profileVersion`：GLB 内容结构兼容性。
- `contractVersion`：工具与引擎的协同契约兼容性。
- `schemaVersion`：旁路报告结构兼容性。
- `tool.version`：工具构建版本。

### 12.2 升级规则

- 新增可选字段：次版本升级。
- 改变字段含义、默认值或必填性：主版本升级。
- 引擎必须声明支持的契约主版本和最小次版本。
- 工具必须能够输出当前发布档和一个明确的兼容过渡档，直到旧运行时退出支持窗口。

## 13. 隐私与资产保护

- 真实客户模型和任何派生预览不得进入本契约仓库、测试夹具、截图、日志或发布包。
- 旁路报告不得写入客户文件名、绝对路径、用户名或业务敏感信息。
- 源文件关联使用内容摘要。
- 自动化测试只使用合成或明确授权的资产。
- 发布前必须检查 Git 跟踪内容、报告内容和构建产物。

## 14. 验证策略

### 14.1 契约测试

- 工具链生成的冻结 GLB 与引擎读取结果一致。
- GLB 内嵌契约可被引擎验证。
- 旁路报告与 GLB 指标一致。
- 同输入、选项和版本生成相同字节与相同报告。
- 缺少契约的旧资产产生 warning 并可加载。
- 不支持的契约主版本被拒绝。
- `runtimeConversionRequired: true` 被拒绝。
- 软预算产生 warning，硬预算阻止发布。

### 14.2 预算边界测试

对每项指标验证：

- 恰等于软限制：pass。
- 超过软限制但低于硬限制：warning。
- 恰等于硬限制：不视为超过硬限制；若已超过软限制则为 warning。
- 超过硬限制：error。

### 14.3 运行时对齐测试

- 引擎实际节点、网格、三角形、材质和选择组数量与契约声明一致。
- 上下文恢复后运行时诊断仍可读取。
- 运行时 draw call 和 GPU 字节在理论下降后才会下降，不要求与工具 metrics 相等。

## 15. 非目标

首版契约不包含：

- 自动为客户模型做最优优化。
- 在运行时动态应用预算或执行优化。
- 屏幕空间误差 LOD 选择、隐式分块和外部 Tileset 调度。
- 业务点位、告警和设备实时状态。
- 精确预测所有 GPU 架构的显存占用。
- 固化永久预算数字。

## 16. 实施阶段

1. **契约落地**：在工具链与引擎分别增加契约类型、校验和冻结样例。
2. **指标闭环**：扩展共享统计口径和运行时渲染诊断。
3. **旁路报告**：CLI 与未来 UI 支持报告生成、预算和差异展示。
4. **预算校准**：使用合成基准和获授权的工业场景校准初始档位。
5. **格式演进**：在主版本兼容规则下增加空间索引、纹理策略和流式分区信息。

## 17. 验收标准

契约首版完成时：

1. 工具链能够生成符合本契约的 GLB 和可选报告。
2. 引擎能够验证并暴露内嵌契约。
3. 工具与引擎使用同一套指标定义和诊断码。
4. 超硬预算资产无法发布。
5. 旧资产兼容路径明确。
6. 旁路报告可选且不是运行时依赖。
7. 客户资产与敏感路径不进入契约示例、测试和报告。
8. 跨仓库冻结样例和契约测试通过。

## 18. Tileset 分发与 partition Diagnostic

- 分发索引为 OGC 3D Tiles 1.1 `tileset.json`。
- Content 为 ICE3 Prepared GLB Profile v1 文件。
- 每个内嵌 GLB `bufferView` 都包含必需的 `buffer: 0` index。
- 支持的 v1 子集包括显式 `children`、本地 Cartesian `box` 或 `sphere`、相对
  `content.uri`、有限 4x4 `transform` 和 `REPLACE` refinement。
- 不支持的 v1 功能包括 `region`、外部 Tileset、`implicitTiling`、非 Prepared GLB
  content 和未声明的 required extension。
- Partition 输出以目录为单位原子发布。
- ICE3 自有 Tile metadata 位于标准 `extras.ice3`。
- Tool Diagnostic 包括 `ICE3_TOOL_PARTITION_OPTIONS_INVALID`、
  `ICE3_TOOL_PARTITION_EMPTY`, `ICE3_TOOL_PARTITION_UNSPLITTABLE`,
  `ICE3_TOOL_PARTITION_OUTPUT_EXISTS`,
  `ICE3_TOOL_TILESET_INVALID`, and `ICE3_TOOL_TILESET_WRITE_FAILED`.
- Runtime Diagnostic 包括 `ICE3_TILESET_INVALID`、`ICE3_TILESET_UNSUPPORTED`、
  `ICE3_TILESET_TILE_FAILED`, `ICE3_TILESET_DUPLICATE_ID`,
  `ICE3_TILESET_ABORTED`, `ICE3_TILESET_CAMERA_REQUIRED`, and
  `ICE3_TILESET_RESIDENT_BUDGET_EXCEEDED`.

## 19. Adaptive Tileset Runtime 行为

分发对象仍是标准 explicit-tree OGC 3D Tiles 1.1 Tileset。Runtime 结合当前
PerspectiveCamera、Viewport 和 partition Bounds 维护以下 camera-relative set：

- `visible`：与严格 view frustum 相交的 partition。
- `prefetch`：位于严格 frustum 外、但处于扩展 prefetch margin 内的 partition。
- `retain`：位于更大 unload margin 内的已加载或候选 partition。

更大的 retention margin 形成 hysteresis，避免小幅 camera movement 反复加载和卸载同一
partition。Partition 离开 retention 范围，或因 budget pressure 被挤出 visible set
后，Runtime 将其从统一 Scene 移除并释放 decoded cache entry。

Runtime 默认值如下：

| 选项 | 默认值 |
| --- | ---: |
| `maxConcurrentTiles` | 2 |
| `maxResidentTiles` | 24 |
| `maxResidentBytes` | 256 MiB |
| `prefetchMarginRatio` | 0.10 |
| `unloadMarginRatio` | 0.20 |
| `maxCommitsPerFrame` | 1 |
| `lodSettleDelayMs` | 180 |

`maxResidentTiles` 和 `maxResidentBytes` 是 soft budget。可见完整性优先：visible set
超出任一 budget 时仍继续加载并保持 resident，同时 Runtime 只发送一次去重的
`ICE3_TILESET_RESIDENT_BUDGET_EXCEEDED` warning。超出 budget 时暂停 offscreen
prefetch。`residentBytes` 统计 prepared position、index、edge 和 color buffer，不得
表述为 driver-reported GPU usage。

每个 partition 在统一 Scene 中由一个可移除 container 表示，包括 identity-transform
partition。Disposal 前，Runtime 检查 active Selection 是否属于该 container，并先清除
Selection。stale request result 在 Scene commit 前丢弃并释放 cache。成功 partition
每帧最多提交 `maxCommitsPerFrame` 次。

Handle 暴露 `pending`、`loading`、`loaded`、`failed` 和 `evicted` Tile state，以及
聚合 work-set 统计。它发送 `TILESET_TILE_LOADING`、
`TILESET_TILE_LOADED`, `TILESET_TILE_FAILED`, `TILESET_TILE_UNLOADED`,
`TILESET_READY`, and `TILESET_IDLE`. `whenReady()` reports the first visible
content; `whenIdle()` reports stability of the work set active when it was
called. `whenComplete()` is not part of the contract because camera-driven
residency must not imply global completion.

### 19.1 LOD 过渡可见性

Hierarchical LOD 切换使用稳定的 screen-space-error band。Coarse Tile 的 error 超过配置
上限时执行 refine；只有 error 低于该上限的 75% 后才 coarsen，避免 camera 在阈值附近
移动时反复切换 representation。

加载完整的下一可见 representation 时，当前可见 representation 继续留在 Scene。
Runtime 发布最深的完整 coverage frontier：只有父级下每个可见 child branch 都有
resident child representation 时才替换父级。因此新就绪的 coarse branch 可以逐步替换
ancestor，无需等待视图中所有最终 leaf target。每次替换在同一次 Scene mutation 中移除
旧层级。Ancestor 与 descendant content 不得同时可见，transition 也不得产生空白帧。
Prefetched descendant 在进入 active coverage frontier 前保持隐藏。

Camera 连续运动不会发布重复 LOD group swap。当前视图的下一 target group 在 off-scene
加载时，active representation 保持稳定。带内容的 coarse ancestor 可保持 resident 但
隐藏，作为 motion fallback。进入运动状态时可以原子切换到 fallback；只有 camera 稳定
达到 `lodSettleDelayMs` 后，Runtime 才发布最终 target group。将该延迟设为 `0` 会关闭
interaction stabilization window。

必需 descendant 失败时，其 fallback content 替换整个重叠 target subtree；成功 sibling
不得与 ancestor representation 混合。只有首个完整 visible group 提交后才发送
`TILESET_READY`。这些保证不改变 Tileset schema、Prepared GLB format 或
`selectionId` identity。

本阶段建立 frustum、retention、budget、commit throttling 和 unload 机制，供
hierarchical LOD 复用。Implicit tiling、external Tileset 和 Runtime Mesh
simplification 仍不支持。

## 20. Hierarchical LOD Asset 生成

`partition --lod` 在不改变标准 Tileset 形状的前提下启用 coarse proxy：

- fine leaf 保留在 `parts/`。
- internal-node proxy 写入 `coarse/`。
- internal 和 leaf content 都是相对 Prepared GLB。
- 每个 Node 继续使用 `REPLACE`。
- `geometricError` 以 world meter 计量，绝不根据固定 LOD index 或 camera distance 推导。

默认值：

| 选项 | 默认值 |
| --- | ---: |
| `lodRatio` | 0.15 |
| `lodMaxTriangles` | 250000 |
| `lodMinUnitTriangles` | 8 |
| `lodAllocation` | `proportional` |
| `lodCurveSamples` | 8 |

Coarse Geometry 按 semantic device 和 Material primitive 简化。Device 不会合并到共享
Selection identity；proportional mode 中，per-device minimum 优先于 Node 的 soft
triangle cap。

`lodAllocation` 接受以下值：

- `proportional`：每个 device 使用相同配置比例，并应用 device minimum。相同 input、
  option 和 tool version 的既有输出保持稳定。
- `adaptive`：每个 device 使用确定性 logarithmic simplification curve。Allocator 只
  保留增加实际 triangle 会降低 error 的 monotonic sample，再把 Node budget 分配给
  normalized marginal error reduction 最大的样本。

Adaptive Node budget 为：

```text
min(lodMaxTriangles, proportional target total for that node)
```

这样 adaptive 和 proportional comparison 具有相同 nominal Node work。
`lodMaxTriangles` 仍是上限。所有 device 在 minimum sample 下仍超过该 Node budget 时，
adaptive generation 以 `ICE3_TOOL_LOD_BUDGET_INVALID` 失败，不输出部分结果。

`lodCurveSamples` 必须是 `4` 到 `32` 的整数。Curve sample Geometry 与 normalized
source Geometry 存放在同一个有界 temporary workspace。每个 semantic device 缓存一条
curve，concurrent spill 使用唯一路径；无论成功或失败，所有 temporary data 都会删除。

Prepared GLB Node extras 可以包含：

```json
{
  "ice3": {
    "id": "lod:group-root/node/17",
    "selectionId": "asset/node/17"
  }
}
```

`id` 在 GLB 内保持唯一。`selectionId` 可以跨 LOD content 重复，以标识同一个业务设备。
缺少 `selectionId` 时回退到 `id`，从而兼容既有 Asset。

Source document 只解析一次。Normalized device Geometry 保存在有界 temporary workspace，
超出的 unit 写入 temporary binary file。Fine 和 coarse output 由同一个 build task
生成。每个 coarse proxy 都从原始 normalized Geometry 简化，而不是简化另一个 proxy。
无论成功、失败或取消，都会删除 temporary data 和不完整 output directory。

新增 tool Diagnostic 包括 `ICE3_TOOL_LOD_INVALID`、
`ICE3_TOOL_LOD_UNSUPPORTED`, `ICE3_TOOL_LOD_BUDGET_INVALID`, and
`ICE3_TOOL_LOD_CLEANUP_FAILED`.
可选 LOD simplifier 是 toolchain dependency，不属于 browser Runtime 或公开 package
dependency graph。

Partition report 保留现有 coarse statistic，并增加：

```ts
interface ICELodAdaptiveStats {
  readonly allocationMode: 'proportional' | 'adaptive';
  readonly adaptiveUnitCount: number;
  readonly minimumUnitTriangleRatio: number;
  readonly maximumUnitTriangleRatio: number;
  readonly maximumErrorMeters: number;
  readonly curveSampleCount: number;
}
```

Adaptive generation 只改变 coarse Geometry 和 error metadata，不新增 Tileset 字段、
不改变 `REPLACE`、不改变 Prepared GLB framing，也不把工作移入 browser Runtime。

Internal coarse content 超过配置 chunk limit 时，可以使用标准 Tileset `contents`
数组。Chunk 具有确定性，不拆分单个 device，并保留稳定 semantic Selection identity。
Runtime 将所有必需 chunk 作为一个 logical Tile 加载，只提交完整 group。

## 21. 保守 semantic proxy 生成

`partition --lod --lod-allocation adaptive` 接受可选
`--semantic-proxy off|auto` 开关，默认值为 `off`。除非同时启用 `--lod` 和 adaptive
allocation，否则 `auto` 在 source processing 前被拒绝；`off` 对相同 input 和 option
保持既有 adaptive output。

Proxy generation 是作用于 semantic device unit 的离线 toolchain operation。它采样唯一
source Mesh vertex 和非退化 triangle centroid，在 mesh-local coordinate 中拟合 OBB 和
cylinder candidate，并把合格 Geometry 存入有界 temporary workspace。Principal axis
从去重 surface vertex 推导，避免非对称 tessellation 旋转原本对称设备的 axis。

Accepted candidate 必须满足以下固定限制：

| Metric | 限制 |
| --- | ---: |
| Normalized maximum surface deviation | `<= 0.05` |
| Proxy volume / source local AABB volume | `<= 2.0` |
| Source triangle reduction | `>= 8x` |

少于 64 个 source triangle 的 device 不参与。OBB 使用 12 个 triangle，cylinder 使用
64 个。未满足限制、axis 不稳定或 triangle reduction 不足的 candidate 被拒绝，并继续
使用既有 QEM path。Accepted proxy 与 QEM sample 在相同 Tile triangle budget 下竞争；
proxy 不获得 semantic budget bonus。

OBB candidate 还要求 source Bounds aspect ratio 不超过 `8:1`。传送带等高度细长设备
继续使用 QEM Geometry，因为普通 box 会丢失过多可见结构。Cylinder candidate 不适用该
aspect limit。

Selected proxy 只替换 Prepared GLB 中 source Mesh 的 Geometry，保留 source
mesh-local coordinate、Node transform、Node ID 和 `selectionId`。共享 source Mesh
继续共享一个 proxy；proxy 与 QEM device 可以共存于同一 Tile 和 coarse content group。
输出仍是标准 Prepared GLB，不增加 proxy-specific extension、Tileset field、私有
Asset format 或 Runtime API。Selected proxy Geometry 无效时构建失败，不发布部分输出。

Material selection 具有确定性：先按 triangle count 选择 dominant Material，再用最低
source Material index 排序。只有所有 contributing primitive 都有 vertex color 时才
使用平均 vertex color，否则保留 dominant Material。Proxy 不读取 texture，也不合成新
PBR Material。

Partition report 增加：

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

Accepted、rejected 和类型计数使用唯一 semantic unit。Selected、triangle 和
saved-triangle count 描述最终 coarse content。saved triangle count 是 adaptive
allocator 重新分配 budget 前的 local device benefit，不等同于最终 Tile total 的预期
缩减。Proxy report 不包含 source path、客户名、设备名、preview 或 Geometry。

Proxy workflow 保持与 contract 其余部分相同的 compatibility boundary：禁止 Runtime
conversion；生成内容是普通 Prepared GLB；每个 GLB 必须通过 validation；既有 Tileset
行为不变。启用或禁用 proxy 不得改变 `selectionId` identity 或 Node transform。

## 22. Static render batch 与重复 Geometry

Static batching 是可选离线 preprocessing step。Toolchain command 默认
`--render-batch off`；`--render-batch static` 在不改变 source parsing、不增加 runtime
dependency 的情况下启用该功能。没有 batch metadata 的既有 Prepared GLB 继续走普通
Mesh path，bytes 保持不变。

Batched Prepared GLB 仍包含一个 JSON chunk 和一个 BIN chunk。Batch metadata 位于
`asset.extras.ice3.batching`：

```ts
interface ICEPreparedBatching {
  readonly version: '1.0';
  readonly semanticIds: readonly string[];
  readonly semanticNodeIds: readonly string[];
  readonly semanticSelectionIds: readonly string[];
  readonly batches: readonly {
    readonly id: string;
    readonly mesh: number;
    readonly primitive: number;
    readonly material: number;
    readonly mode: 4;
    readonly triangleCount: number;
    readonly bounds: {
      readonly min: readonly [number, number, number];
      readonly max: readonly [number, number, number];
    };
  }[];
}
```

3 个 semantic array 长度相同。`semanticNodeIds` 引用 Prepared GLB Node namespace，并
必须匹配对应 Node 的 `selectionId`。每个 batch triangle primitive 声明名为
`_ICE3_SEMANTIC_INDEX` 的 `UNSIGNED_INT` `SCALAR` attribute；每个值索引 semantic
array。Metadata、Bounds、primitive reference 或 semantic index 无效时，以
`ICE3_ASSET_BATCH_INVALID` 失败。

Version 1.0 只对 triangle Geometry 执行 static batch。Source Geometry 在有效 output
Material state、vertex-color mode 和 edge state 完全相同时可以共享 batch。World
transform 烘焙到 batch vertex。Semantic Node 继续作为 query-only identity carrier；
每个 Tile 获得只在统一 Tileset Scene 内唯一的 render-only batch Node。

Partition report 增加：

```ts
interface ICRenderBatchStats {
  readonly renderBatchMode: 'off' | 'static';
  readonly renderBatchInputPrimitives: number;
  readonly renderBatchCount: number;
  readonly renderBatchTriangles: number;
  readonly renderBatchBytes: number;
  readonly renderBatchFallbackPrimitives: number;
  readonly renderBatchDrawReduction: number;
}
```

`renderBatchDrawReduction` 为
`(inputPrimitives - batchCount) / max(1, inputPrimitives)`. Reports contain
aggregate counts only and never include customer names, source paths, semantic
labels, or geometry.

Runtime compatibility rule：

- Batch Node 只使用一次 batch Geometry，并保留 GPU picking 返回的既有 `selectionId`。
- Geometry 和 Material object 相同的重复普通 Mesh 通过一次 instanced draw 提交；
  Geometry 保留在一个 GPU buffer。
- 每个 instance 携带稳定 semantic index，供 picking 和 highlight 使用。
- Instance-buffer allocation 失败时回退到普通 Mesh draw，并增加
  `renderer.instancingFallbacks`；Runtime 发送去重 warning
  `ICE3_RENDER_INSTANCING_FALLBACK`。
- LOD replacement 仍按 Tile 原子执行。Batching 不改变 `geometricError`、`REPLACE`
  行为或 semantic identity。

在关闭 edge、使用相同 partition setting 的受控工业 Prepared GLB 上测得：

| Metric | 普通 Mesh path | Static batch |
| --- | ---: | ---: |
| Source triangles | 16,939,337 | 16,939,337 |
| Input drawable primitives | 1,472 | 1,472 |
| Runtime Draw Calls | 1,472 | 662 |
| Draw reduction | 0% | 55.03% |
| Output bytes | 406,072,056 | 476,678,116 |
| Build wall clock | 22.68 s | 40.77 s |
| Peak resident memory | 4.64 GiB | 3.42 GiB |
| Selection identities | 261 | 261 |
| Page errors / failed requests | 0 / 0 | 0 / 0 |

在相同设置下启用 proportional LOD 时，完整输出包含 108 个 GLB 和 107 个 Tile。
聚合 batch report 覆盖 fine/coarse content 的 9,984 个 input drawable primitive，
输出 2,079 个 batch，报告缩减率为 79.18%。每个 GLB 都通过 validation，261 个
semantic Selection identity 与普通输出一致，Chromium 与 WebKit 都没有页面错误或失败
请求。相同 camera 和 45 秒观察窗口内，Chromium active LOD work set 绘制 1,472 个普通
Draw Call，而 static batch 为 114 个，且加载相同 coarse work set。Static batching
以更大的 prepared bytes 和更长的 offline build 换取显著更低的 Runtime submission
cost。

### 22.1 可选 adaptive Runtime repacking

`ICETilesetLoader` 的 `renderBatching.mode` 接受 `asset`、`adaptive` 或 `off`，默认
`asset`：使用 Prepared GLB batch，不在 Runtime repacking。`adaptive` 启用 idle-time
generation；`off` 关闭 adaptive planning，并且不重写或解包 prepared batch。

只有 camera 和 visible target set 稳定时才允许 adaptive planning。Runtime 可以为当前
generation 跨 content boundary 合并兼容 visible batch Geometry，但不得改变 semantic
Selection ID、Tileset Bounds、`geometricError` 或 `REPLACE` 行为。

Implementation contract：

- Worker concurrency 有界，默认值为
  `min(4, max(1, hardwareConcurrency - 1))`.
- Source ownership 通过 `ArrayBuffer` transfer list 恰好转移一次。
- Candidate upload 按 `uploadBytesPerFrame` 拆分；超过 frame budget 的 buffer 不会由
  该 budget 接受。
- 每个 chunk 准备完成前，candidate GPU Geometry 保持 inactive。
- 单次 callback 激活完整 generation。Camera motion、target change、cancellation 或
  disposal 时，Runtime 恢复之前的 visible Mesh/Batch layout。
- Worker、transfer、upload 或 activation 失败时，上一个 active generation 保持不变，
  并释放 candidate resource。
- 每个 generation 的 Diagnostic 会去重：
  `ICE3_RENDER_BATCH_ADAPTIVE_STARTED`,
  `ICE3_RENDER_BATCH_ADAPTIVE_COMPLETED`,
  `ICE3_RENDER_BATCH_ADAPTIVE_CANCELLED`,
  `ICE3_RENDER_BATCH_ADAPTIVE_FAILED`, and
  `ICE3_RENDER_BATCH_MEMORY_REJECTED`.
- `ICETilesetHandle.adaptiveStats` 只暴露 generation counter 和 batch count，不暴露
  Worker、transferable 或 GPU handle。

### 22.2 GPU residency 与 transition stability

CPU-resident Tile 从成功 commit 到实际 unload 期间拥有自己的 GPU Geometry。Visibility、
frustum membership 和 temporary LOD coverage 变化不得单独驱逐这些 buffer。

Runtime compatibility rule：

- Tile 可见前上传其完整 Geometry。
- Camera motion 期间保持当前完整 visible coverage，直到下一 LOD cut 完整且 GPU-ready。
- 对无关的 GPU-ready Tile，可以在 Camera motion 期间更新 spatial visibility；只有
  ancestor/descendant LOD replacement 需要等待 camera settle 和完整 replacement
  coverage。
- 默认使用 full-asset-radius retention halo，避免仅因 camera movement 卸载 Resident
  Tile；resident count 和 byte budget 仍是最终 memory limit。
- 非自有 Geometry 至少保留 60 个 inactive frame 后才可驱逐。
- 非自有 Geometry 使用按 byte budget 约束的 least-recently-used eviction；默认
  Geometry budget 为 768 MiB。
- 默认将 resident limit 保持为 64 Tiles 和 768 MiB，使受控测试中 54 Tile、469 MB 的
  industrial working set 保持稳定。
- 在 `gpuBytes` 旁暴露累计 `gpuUploads` 和 `gpuEvictions` Diagnostic。重新进入已
  resident content 不得增加任一 counter。

只有 Tile unload、非自有资源超过 inactivity window，或 GPU budget 需要移除未 pinned
的 least-recently-used resource 时才允许 eviction。Context loss 仍执行 full-device
reset。
