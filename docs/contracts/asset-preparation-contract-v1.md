# ICE3 资产预处理协同契约 v1

| 项目 | 内容 |
| --- | --- |
| 状态 | 待用户评审 |
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
- 动态资源卸载和完整的视锥、屏幕空间误差网络调度策略。
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

## 18. Tileset distribution and partition diagnostics

- Distribution index: OGC 3D Tiles 1.1 `tileset.json`.
- Contents: ICE3 Prepared GLB Profile v1 files.
- Supported v1 subset: explicit `children`, local Cartesian `box` or `sphere`,
  relative `content.uri`, finite 4x4 `transform`, and `REPLACE` refinement.
- Unsupported v1 features: `region`, external tilesets, `implicitTiling`,
  non-Prepared GLB contents, and undeclared required extensions.
- Partition output is published atomically as a directory.
- ICE3-owned tile metadata lives under standard `extras.ice3`.
- Tool diagnostics are `ICE3_TOOL_PARTITION_OPTIONS_INVALID`,
  `ICE3_TOOL_PARTITION_EMPTY`, `ICE3_TOOL_PARTITION_UNSPLITTABLE`,
  `ICE3_TOOL_PARTITION_OUTPUT_EXISTS`,
  `ICE3_TOOL_TILESET_INVALID`, and `ICE3_TOOL_TILESET_WRITE_FAILED`.
- Runtime diagnostics are `ICE3_TILESET_INVALID`, `ICE3_TILESET_UNSUPPORTED`,
  `ICE3_TILESET_TILE_FAILED`, `ICE3_TILESET_DUPLICATE_ID`, and
  `ICE3_TILESET_ABORTED`.
