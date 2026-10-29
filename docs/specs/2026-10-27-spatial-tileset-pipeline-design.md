# ICE3 空间分区与开放 Tileset 管线设计规格

> Document ID: ICE3-DOC-SPEC-007
>
> Status: Implemented
>
> Owner: ICE3 architecture maintainers
>
> English summary: Define deterministic spatial partitioning and OGC 3D Tiles 1.1 output for large industrial assets.

| 项目 | 内容 |
| --- | --- |
| 状态 | 已实现 |
| 版本 | 1.0 |
| 日期 | 2026-10-27 |
| 适用范围 | `ice3-toolchain`、`ice3-engine`、`ice3-doc` 和现有浏览器示例 |
| 核心标准 | OGC 3D Tiles 1.1、glTF 2.0、ICE3 Prepared GLB Profile |

## 1. 目标

为大型工业 GLB 建立一条可验证的空间分区管线：

1. 工具链读取一份源模型，按工业语义和空间位置生成多个 Prepared GLB。
2. 工具链使用 OGC 3D Tiles 1.1 标准组织分区，不定义平行的交换格式。
3. 每个叶子分区都是完整、独立、可校验和可直接加载的 GLB。
4. 运行时先读取 Tileset，再按优先级增量加载分区；每个分区完成后立即可见。
5. 现有设备选择、稳定 ID、平光材质和边线表现保持不变。
6. 浏览器示例使用合成分区资产验证完整的“构建、加载、增量显示、交互”链路。

本设计解决单体 GLB 必须完整下载后才能首次渲染的问题。它不追求一次覆盖 3D Tiles
的全部能力。

## 2. 核心决策

1. **开放标准优先**：分区索引使用 3D Tiles 1.1，内容使用 glTF 2.0，哈希使用
   SHA-256，不创建自定义索引格式、坐标体系或分块协议。
2. **预处理优先**：源格式解析、变换烘焙、网格准备、边线生成和空间分区全部在
   工具链中完成。
3. **运行时零几何转换**：运行时只读取 Tileset、下载 Prepared GLB、建立场景和
   上传已准备好的缓冲，不在浏览器中重切或重排几何。
4. **语义单元不可任意破坏**：首版以网格节点为原子单元，不切割单个网格。
5. **失败不发布**：任何分区失败都不得留下可被误用的最终输出目录。
6. **标准增量支持**：首版只接受本规格列出的 3D Tiles 子集；不支持内容必须明确
   拒绝，不能静默降级。

## 3. 非目标

首版不包含：

- 对单个超大合并网格执行三角形空间切割。
- 自动生成简化 LOD、粗模或隐式分块。
- 纹理、动画、蒙皮、Morph、光照、阴影和复杂材质。
- `region` 地理包围体、外部 Tileset 和隐式 Tileset。
- 动态卸载、跨帧显存预算调节和完整屏幕空间误差调度。
- 通用 3D Tiles 客户端或对全部 3D Tiles 扩展的兼容。
- 运行时对客户资产的格式转换或优化。
- 真实客户模型及其任何派生资源进入仓库、测试、示例、截图或 CI。

## 4. 总体架构

```text
source glTF / GLB
        │
        ▼
ice3-toolchain
  source reader and validation
  semantic unit analysis
  spatial partition plan
  Prepared GLB generation
  3D Tiles tileset generation
        │
        ▼
tileset.json + parts/*.glb
        │
        ▼
ice3-engine
  Tileset parser
  tile scheduler
  Prepared GLB loader
  scene composition
  incremental rendering
```

仓库职责：

| 工程 | 职责 | 禁止 |
| --- | --- | --- |
| `ice3-toolchain` | 源模型读取、语义分析、分区规划、GLB 和 Tileset 生成、校验 | 依赖浏览器运行时 |
| `@ice3/assets` | Tileset 标准子集解析与校验、Prepared GLB 读取 | 几何预处理、CLI、GPU 管理 |
| `@ice3/runtime` | Tileset 加载调度、分区 GLB 实例化、场景组合和生命周期 | 发明平行资产格式、重切几何 |
| `@ice3/renderer` | 已准备缓冲的 GPU 上传、绘制和拾取 | 理解 3D Tiles 或源格式 |
| `ice3` | 只暴露稳定的 ICE3 公共 API | 暴露内部实现路径 |
| 浏览器示例 | 使用公开 API 展示增量加载与交互 | 直接依赖工具链私有源码 |

## 5. 分区单元与空间规划

### 5.1 原子单元

首版把带网格的节点定义为原子语义单元。一个原子单元包含：

- 稳定的源节点身份。
- 世界变换后的包围盒。
- 三角形和边线数量。
- 引用的网格和材质。

多个节点引用同一网格时，这些节点进入同一个原子组，避免跨分区重复几何。

没有网格的祖先节点只参与世界变换计算，可以烘焙进所属单元；分区 GLB 不复制
共同的场景根节点。

### 5.2 世界变换

分区构建前必须计算每个网格节点的世界矩阵，并把该矩阵作为分区内对应节点的
局部矩阵。每个分区因此不依赖另一个分区的祖先节点。

上述烘焙只在工具链中执行。运行时不得重新计算资产原始层级或转换单位。

### 5.3 分区算法

空间规划采用确定性递归切分：

1. 计算所有原子单元的世界包围盒和包围盒中心。
2. 选择当前组包围盒中最长的轴。
3. 按该轴上的中心坐标排序；相同坐标使用稳定 ICE3 节点 ID 排序。
4. 按三角形数量选择中位位置，把原子单元分成两个子组。
5. 对子组重复上述过程，直到满足分区预算或只剩一个原子单元。

分解单调且可复现，不依赖文件系统枚举顺序、随机值或时间。

默认分区预算：

| 指标 | 默认值 |
| --- | ---: |
| 三角形数 | 500,000 |
| 最终 GLB 字节数 | 32 MiB |

两个值都可以通过 CLI 覆盖，但必须是正有限值。

三角形预算用于规划。最终字节数在 GLB 构建后校验；如果超过字节预算且组中仍有
多个原子单元，则继续切分并重新构建。如果只剩一个原子单元，构建以
`ICE3_TOOL_PARTITION_UNSPLITTABLE` 失败。

### 5.4 守恒与身份

成功输出必须满足：

- 每个源三角形恰好进入一个叶子分区。
- 每个源网格节点恰好进入一个叶子分区。
- 设备选择 ID 在所有分区中保持原值且唯一。
- 共享网格引用不产生重复渲染实例。
- 所有输出节点 ID 可由相同输入、参数和工具版本确定性重建。

## 6. 3D Tiles 1.1 输出

### 6.1 目录结构

```text
output/
├── tileset.json
└── parts/
    ├── part-000.glb
    ├── part-001.glb
    └── ...
```

分区文件名使用固定宽度十进制序号。编号按照确定性空间遍历顺序分配。

### 6.2 标准字段

`tileset.json` 使用 3D Tiles 1.1 已有字段：

- `asset.version` 为 `"1.1"`。
- `geometricError` 使用米为单位。
- `root` 表达显式空间树。
- 内部结构节点可以没有 `content`，只负责空间组织。
- 叶子节点通过标准 `content.uri` 指向 Prepared GLB。
- 包围体使用本地 Cartesian 坐标中的 `box`；解析器兼容 `sphere`。
- `refine` 使用标准 `REPLACE`。
- 节点变换使用标准 `transform`。

内部节点和叶子节点都保存非负、有限的 `geometricError`。叶子为 `0`；内部结构
节点的值由包围盒对角线确定，作为不渲染该结构节点时的空间误差声明。首版不创建
简化 LOD，因此运行时不会通过 `ADD` 叠加不同精度版本。

### 6.3 坐标

Prepared GLB 保持 glTF 标准的右手 y-up。3D Tiles 的本地 Cartesian 坐标使用
z-up。工具链按标准转换空间包围体和相机侧空间查询坐标，不修改 GLB 顶点。

引擎内部继续使用 y-up。Tileset 运行时适配层在读取标准包围体时完成坐标映射；
该映射属于正常空间数学，不属于资产几何转换。

### 6.4 ICE3 语义

ICE3 只通过标准允许的 `extras` 扩展点保存：

- 逻辑资产 ID。
- 分区 ID。
- 工具链生成的契约版本。
- 必要的指标摘要。

不得改变标准字段的含义，也不得要求标准客户端理解 ICE3 专有字段才能渲染内容。

每个分区 GLB 继续包含现有 `asset.extras.ice3` 配置档。所有分区使用同一个逻辑
`assetId`，节点 ID 继续基于全局源节点身份生成。

## 7. Tileset 运行时子集

### 7.1 公共 API

公共消费者只从 `ice3` 导入。运行时提供 ICE3 家族风格的 Tileset 加载接口，
概念名称沿用开放标准中的 “tileset”：

```ts
const tileset = await new ICETilesetLoader(engine).open(
  '/assets/partitioned/tileset.json',
);

engine
  .setScene(tileset.scene)
  .setCamera(camera)
  .start();

await tileset.whenReady();
tileset.dispose();
```

`open` 在 Tileset 元数据校验完成并建立空场景后返回，不等待所有分区加载完成。
分区完成时立即加入场景并请求重绘。`whenReady` 在第一个叶子分区成功加入统一
场景后 resolve；如果首个叶子分区失败，则 reject 该分区错误，但其他并发分区仍可
继续完成。

具体类型名可以在实现计划中调整，但必须：

- 使用 ICE3 前缀和现有事件模型。
- 通过 `ice3` 公共入口暴露。
- 与单 GLB API 的加载、取消和幂等释放语义一致。
- 不暗示这些接口专为 Agent 设计。

### 7.2 首版支持的 Tileset 子集

接口名称：

- `asset.version` 为 `1.1`。
- 显式 `children` 树。
- 本地 Cartesian `box`，同时接受 `sphere`。
- `content.uri` 指向 Prepared GLB。
- `transform` 为有限 4x4 仿射矩阵。
- `REPLACE` 细化语义。

以下内容返回 `ICE3_TILESET_UNSUPPORTED`：

- `region`。
- 外部 Tileset。
- `implicitTiling`。
- 非 Prepared GLB 内容。
- 未声明的必需扩展。

### 7.3 加载与场景组合

1. 下载并校验 Tileset。
2. 展开显式树，收集叶子分区和标准包围体。
3. 根据包围盒中心与当前相机目标或位置的距离排序。
4. 最多同时加载两个分区。
5. 每个分区完全下载、校验和构景成功后，才把节点加入统一场景。
6. 分区加入后立即请求重绘并发出进度事件。
7. 重复 URL 使用现有单 GLB 缓存，但仍为每次 Tileset 实例创建独立场景。
8. 合并场景时移除各分区临时根，只保留统一 Tileset 根，避免重复场景 ID。

首版不做动态卸载。Tileset 生命周期结束时统一释放全部分区和 GPU 几何。

### 7.4 状态与事件

Tileset 句柄至少暴露：

- 已加载分区数。
- 总分区数。
- 当前失败分区数。
- 每分区的加载状态。

至少发出：

- 分区开始加载。
- 分区加载完成。
- 分区加载失败。
- 首个可交互批次完成。
- 全部分区完成。

事件名称使用现有大写 ICE3 事件风格。接口同时提供可等待的首批完成信号，供自动化
工具和普通应用调用，不包含 Agent 专用语义。

## 8. CLI 契约

新增命令：

```bash
ice3-tool partition <source> \
  --output <directory> \
  --asset-id <public-safe-id> \
  --max-triangles 500000 \
  --max-bytes 33554432
```

支持已有选项：

- `--skip-edges`
- `--budget`
- `--warnings-as-errors`
- `--json`

规则：

- `--output` 必须指向尚不存在的目标目录。
- `--asset-id` 必填，避免默认把客户文件名写入产物。
- 所有文件先写入目标目录同级的临时目录。
- 全部分区和 Tileset 校验通过后，原子重命名临时目录。
- 失败时删除临时目录，不留下最终 Tileset、分区或临时文件。
- JSON 输出不包含源绝对路径、客户名称或敏感文件名。

## 9. 诊断码

工具侧：

- `ICE3_TOOL_PARTITION_OPTIONS_INVALID`
- `ICE3_TOOL_PARTITION_EMPTY`
- `ICE3_TOOL_PARTITION_UNSPLITTABLE`
- `ICE3_TOOL_PARTITION_OUTPUT_EXISTS`
- `ICE3_TOOL_TILESET_INVALID`
- `ICE3_TOOL_TILESET_WRITE_FAILED`

运行时：

- `ICE3_TILESET_INVALID`
- `ICE3_TILESET_UNSUPPORTED`
- `ICE3_TILESET_TILE_FAILED`
- `ICE3_TILESET_DUPLICATE_ID`
- `ICE3_TILESET_ABORTED`

诊断包含稳定 code。错误消息模板属于契约的一部分，但不得包含客户路径或资产内容。

## 10. 演示更新

现有 M1 示例改为默认加载合成分区 Tileset，并保留以下能力：

- 黑色绘图背景。
- 大平光。
- 原始 GLB 颜色。
- 清晰几何边线。
- 鼠标旋转与缩放。
- WASD 和方向键移动。
- 设备选择、黄色高亮和右上角信息浮层。

新增验证表现：

- 加载过程显示“已加载分区数/总分区数”。
- 某个延迟分区未完成时，已完成的设备先显示。
- 所有分区完成后，画面与等价单 GLB 场景保持一致的设备位置和选择行为。

合成演示资产使用多个空间分离的设备节点，使工具能够稳定生成至少四个分区。
测试通过请求延迟而不是真实客户资产证明增量显示。

## 11. 验证策略

### 11.1 工具链单元测试

- 三角形与节点在不同分区之间守恒。
- 共享网格引用的节点保持在同一分区。
- 最长轴中位切分对相同输入产生相同结果。
- 包围盒包含所属节点。
- 世界变换正确烘焙。
- 分区 ID、文件名和 JSON 字段顺序稳定。
- 三角形或字节预算超限时继续切分。
- 单个原子单元超限时返回 `ICE3_TOOL_PARTITION_UNSPLITTABLE`。
- 空场景返回 `ICE3_TOOL_PARTITION_EMPTY`。

### 11.2 Tileset 契约测试

- `tileset.json` 通过 OGC 3D Tiles 1.1 官方 JSON Schema 校验。
- 所有 `content.uri` 位于输出目录内，不包含绝对路径或目录逃逸。
- 每个叶子包围体位于父节点包围体内。
- 每个内容都是可独立通过现有 Prepared GLB 验证的 ICE3 资产。
- 不支持的 `region`、隐式分块和外部 Tileset 可稳定识别。

### 11.3 运行时测试

- 打开 Tileset 后可在所有分区完成前获得场景句柄。
- 最多两个分区并发。
- 分区完成后立即出现并触发重绘。
- 单个分区失败不删除其他已完成分区。
- 取消不污染缓存或其他调用者。
- 重复释放幂等。
- 分区合并后没有重复场景根或节点 ID。
- 设备拾取返回原始稳定 ID。

### 11.4 浏览器端到端测试

- 延迟指定分区，确认页面先在状态区显示部分分区完成。
- 首屏在全部请求完成前显示已完成设备。
- 最终分区数与 Tileset 叶子数一致。
- 最终三角形、设备数量和位置等价于源合成模型。
- 选中效果、信息浮层、背景、边线、键盘和鼠标交互保持通过。
- Chromium 和 WebKit 均通过；按现有项目约定跳过未要求测试的浏览器。

### 11.5 受控真实资产验证

使用仓库外的临时目录处理至少一份大型本地工业资产：

- 测量分区数量、最大分区大小、构建耗时和失败诊断。
- 不在测试输出、日志、截图或文档中打印节点名称、源码路径或几何内容。
- 生成物验证后清理。
- 通过 Git 状态、忽略规则和发布包检查确认没有客户资产或派生文件。

真实资产只用于本地规模验证，不作为自动化测试或演示依赖。

## 12. 验收标准

本设计完成时：

1. `ice3-tool partition` 能从受支持的源模型生成 `tileset.json` 和多个独立 GLB。
2. Tileset 通过 3D Tiles 1.1 官方 Schema 校验。
3. 每个分区 GLB 通过现有 Prepared GLB 校验。
4. 分区规划确定性、预算限制、共享网格和失败原子性均有自动化测试。
5. `ice3` 公共 API 能打开 Tileset，并逐分区增量构景和显示。
6. M1 示例使用合成分区资产完成端到端验证，原有多数交互不回退。
7. 所有仓库的完整验证命令通过。
8. 工作区和发布包中不存在真实客户模型或派生资产。

## 13. 后续演进

以下能力只使用开放规范已有机制继续演进：

- 工具链生成简化 LOD，使用 3D Tiles 的 `REPLACE` 和 `geometricError`。
- 规则网格使用 `implicitTiling` 和 subtree 资源。
- 运行时加入基于视锥、屏幕空间误差、并发和显存预算的完整调度。
- 超大合并网格在工具链中按空间三角形切分。
- 纹理和压缩通过 glTF 2.0 开放扩展表达。

只有开放标准确实无法表达经确认的工业需求时，才讨论 ICE3 专有扩展。

## Related Documents

- `ICE3-DOC-IDX-001` — [Documentation index](../README.md)
- `ICE3-DOC-PLAN-010` — [Spatial Tileset pipeline implementation](../plans/2026-10-27-spatial-tileset-pipeline.md)
