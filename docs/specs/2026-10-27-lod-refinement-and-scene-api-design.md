# ICE3 LOD 精炼与通用场景 API 设计规格

> Document ID: ICE3-DOC-SPEC-005
>
> Status: Implemented
>
> Owner: ICE3 architecture maintainers

>

| 项目 | 内容 |
| --- | --- |
| 状态 | 已实现 |
| 版本 | 1.0 |
| 日期 | 2026-10-27 |
| 适用范围 | 层级粗模分片、Tileset 多内容生命周期、预取、SSE 校准和公共场景查询 |
| 前置条件 | 层级 LOD 资产生成、SSE 切面和选择延续已合入 `main` |
| 后续阶段 | 上层 Agent 应用集成，但不属于本规格 |

## 1. 目标

在不引入私有资产格式的前提下精炼现有 LOD：

1. 粗模总体积必须小于细模，校准目标不超过细模三角形总量的 `25%`。
2. 单个粗模分片默认不超过 `32 MiB`。
3. 使用 OGC 3D Tiles 1.1 标准多内容能力拆分粗模。
4. 一个逻辑 Tile 的所有分片共同形成一个覆盖单元。
5. 恢复预算受限的离屏预取，但预取不阻塞当前切面稳定。
6. 使用真实受控资产校准默认 SSE 阈值。
7. 增加通用场景查询、拾取和聚焦 API。
8. 查询和交互 API 保持通用，不出现 Agent、AI 或提示词专用概念。

## 2. 成功标准

- 大型内部 LOD 节点不再生成超大单文件。
- 同一逻辑 Tile 的多个粗模分片不会造成短暂空洞或部分设备重复。
- 任一必需分片失败时，该逻辑 Tile 整体回退到父粗模。
- 粗模资产目录总体小于细模资产目录。
- 设备选择身份跨分片、跨 LOD 和跨查询保持一致。
- 预取内容不会阻塞当前切面的 `whenIdle()` 或 `TILESET_READY`。
- SSE 默认值经过多个阈值测量，不凭单个指标决定。
- 上层工具可仅通过公共查询、拾取和相机 API 定位设备。
- 业务或 Agent 可以组合这些 API，但引擎不感知调用者身份。

## 3. 非目标

- 隐式分块和外部 Tileset。
- 对单个设备继续切分几何。
- 运行时网格简化。
- 把粗模分片表达成伪造的空间子节点。
- 自定义 Tileset 旁路清单。
- Agent 对话、工具协议、提示词、调度策略或权限系统。
- 业务告警、设备台账和实时状态。
- 纹理、PBR、动画和碰撞。

## 4. 核心原则

1. **标准优先**：多分片使用标准 Tileset `contents` 数组。
2. **逻辑 Tile 优先**：分片是存储单位，不是调度单位。
3. **设备不可分割**：单个设备是分片最小语义单位。
4. **覆盖优先**：部分分片失败不能产生可见空洞。
5. **预算前置**：粗模总三角预算在分片前分配。
6. **预取次要**：预取不得延长当前工作集 idle。
7. **查询通用**：公共 API 不绑定任何调用者类型。
8. **可复现输出**：文件、分片和查询结果稳定排序。

## 5. Tileset 多内容模型

### 5.1 标准表达

单分片 Tile 继续使用：

```json
{
  "content": {
    "uri": "coarse/group-root-0.glb"
  }
}
```

多分片 Tile 使用标准 3D Tiles 1.1：

```json
{
  "contents": [
    { "uri": "coarse/group-root/part-000.glb" },
    { "uri": "coarse/group-root/part-001.glb" }
  ]
}
```

- 同一 Tile 不得同时包含 `content` 和 `contents`。
- 每个条目只允许一个相对 Prepared GLB URI。
- `contents` 顺序由稳定 partition ID 和稳定设备 ID 决定。
- 空数组、重复 URI、绝对 URI 外部资源和非 Prepared GLB 均拒绝。

### 5.2 资产快照

`ICETilesetTile` 使用规范化数组：

```ts
interface ICETilesetTile {
  readonly contentUris: readonly string[];
  readonly contentUri?: string;
}
```

- `contentUris` 是运行时唯一权威集合。
- 单分片时保留 `contentUri`，便于现有调用方平滑迁移。
- 多分片时不设置 `contentUri`。
- `contentUris` 为空表示该节点没有内容。

### 5.3 逻辑身份

- 分片不改变 Tile ID、包围盒、`geometricError` 或 `REPLACE` 语义。
- 各分片中的设备选择 ID 保持唯一业务身份。
- 同一逻辑设备只能出现在该 Tile 的一个分片中。
- 容器 ID 使用 Tile ID，子分片可以使用稳定内容序号命名。

## 6. 粗模体积预算

### 6.1 两级目标

- 强制要求：全部粗模文件总字节低于全部细模文件总字节。
- 校准目标：粗模总三角形不超过细模总三角形的 `25%`。
- 未达到校准目标时构建成功，但报告必须列出实际比例和超预算节点。

### 6.2 简化顺序

每个设备先在自身材质 primitive 内简化：

1. 使用保拓扑二次误差简化。
2. 如果仍显著高于分配目标，使用受控的保守顶点合并。
3. 如果结果没有有效三角形或误差不可接受，保留原设备几何。
4. 不允许为了达到比例删除设备或合并设备选择身份。

### 6.3 实际结果

- 上限和比例检查使用最终生成三角数，不使用预分配目标冒充结果。
- `overBudgetCoarseNodes` 同时检查分配预算和实际结果。
- 工具报告提供：

```ts
interface ICELodBuildStats {
  readonly coarseTriangleRatio: number;
  readonly coarseByteRatio: number;
  readonly coarseContentCount: number;
  readonly maxCoarseChunkBytes: number;
  readonly oversizedCoarseChunks: number;
  readonly overBudgetCoarseNodes: number;
  readonly preservedCoarseUnits: number;
}
```

## 7. 粗模分片算法

### 7.1 分组

- 以设备的语义单元为最小单位。
- 先按稳定设备 ID 排序。
- 将设备粗模几何加入当前分片，直到加入下一个设备会超过 `maxChunkBytes`。
- 超限时关闭当前分片并从该设备开始新分片。
- 单个设备自身超限时保留完整设备，生成超限分片并记录。

CLI 增加 `--coarse-chunk-max-bytes`。未提供时采用当前
`--max-bytes`；两者默认值均为 `32 MiB`。

### 7.2 简化预算

- 每个内部 Tile 先计算整体粗模三角上限。
- 设备预算按设备源三角数比例分配，并满足设备下限。
- 分片数量不改变整体预算。
- 禁止把 `maxChunkBytes` 乘以分片数后当作新的三角预算。

### 7.3 输出

```text
coarse/group-root/part-000.glb
coarse/group-root/part-001.glb
coarse/group-root-0/part-000.glb
```

- 单分片 Tile 可继续使用 `coarse/<tile-id>.glb`。
- 多分片 Tile 使用 `coarse/<tile-id>/part-NNN.glb`。
- 发布仍为整个目录原子替换。

## 8. 运行时多分片生命周期

### 8.1 Tile 状态

- `pending`：逻辑 Tile 等待请求。
- `loading`：至少一个分片请求或构景中。
- `loaded`：所有分片完整提交。
- `failed`：任一必需分片失败。
- `evicted`：不在保留集合或被预算移除。

### 8.2 请求

- 一个逻辑 Tile 占用一个请求并发槽。
- Tile 内分片按稳定顺序请求，默认顺序执行。
- 不允许多个逻辑 Tile 因分片数量绕过 `maxConcurrentTiles`。
- 已开始的分片允许完成；结果不满足当前保留条件时立即释放。

### 8.3 暂存与提交

- 每个分片构景后暂存在 Tile 临时容器中。
- Tile 内所有分片成功后才进入统一提交队列。
- 提交时创建一个逻辑 Tile 容器并加入所有分片容器。
- `maxCommitsPerFrame` 以逻辑 Tile 计数。
- 任一必需分片失败时释放全部暂存分片，不提交半个逻辑 Tile。
- `TILESET_TILE_LOADED` 在整个逻辑 Tile 完成时触发一次。

### 8.4 统计

```ts
interface ICETilesetStats {
  readonly resident: number;
  readonly residentContents: number;
  readonly loading: number;
  readonly loadingContents: number;
  readonly residentBytes: number;
}
```

- `resident` 是逻辑 Tile 数。
- `residentContents` 是实际驻留 GLB 分片数。
- 选择、预算和卸载以逻辑 Tile 为单位。
- 字节预算按所有分片实际 TypedArray 字节计算。

## 9. 预取

### 9.1 范围

- 预取当前可见目标的一层相邻内容。
- 不为每个目标递归加载全部后代。
- 预取集合由扩展视锥和当前 LOD 层级共同限定。

### 9.2 优先级与预算

- 可见覆盖内容优先。
- 已驻留粗模的下一层高于独立离屏预取。
- 达到软驻留预算后不再发起新预取。
- 预取不触发可见完整性超预算。

### 9.3 idle 语义

- `whenIdle()` 只等待当前可见切面及其必要回退内容。
- 后台预取存在时仍可进入 idle，状态通过扩展统计观察。
- `TILESET_READY` 只反映首个可见内容，不等待预取。
- 预取失败只更新该 Tile 的本地缓存与统计，不进入全局失败状态。

## 10. SSE 校准

使用同一受控真实资产测量：

```text
16 px
32 px
48 px
```

对每个阈值记录：

- 总览目标节点数。
- 总览粗模/细模数量。
- 聚焦目标节点数。
- 聚焦粗模/细模数量。
- 驻留字节。
- 首个内容时间。
- 切面稳定时间。
- 页面错误。

默认阈值选择必须同时满足：

1. 总览和局部的目标工作集明显不同，或证明当前资产确实无需不同。
2. 聚焦设备仍可辨识和选中。
3. 驻留字节在预算内或能解释为可见完整性。
4. 不通过放宽阈值掩盖错误的 `geometricError`。

### 10.1 受控真实资产实测

预处理结果（仅记录聚合值）：

| 指标 | 结果 |
| --- | ---: |
| 细模三角形 | 16,939,337 |
| 粗模三角形 | 10,401,648 |
| 粗模三角形比例 | 61.41% |
| 粗模字节 | 172,943,328 |
| 粗模字节比例 | 42.61% |
| 粗模内容数 | 53 |
| 最大粗模分片 | 27,135,196 |
| 超过 32 MiB 的分片 | 0 |

粗模三角形比例仍高于 `25%` 的校准目标，属于已知差距；当前保守简化优先保留工业几何特征，不通过牺牲结构真实性来满足比例指标。

浏览器测量使用同一资产、`1440 × 900` 视口和隔离页面：

| SSE | 总览目标/驻留 | 总览驻留字节 | 聚焦目标/驻留 | 聚焦驻留字节 | 首个内容 | 切面就绪 | 总览 idle |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 16 px | 19 / 19 | 127,732,320 | 9 / 9 | 55,320,990 | 96 ms | 136 ms | 41,594 ms |
| 32 px | 10 / 10 | 46,035,690 | 9 / 9 | 55,320,990 | 80 ms | 81 ms | 15,376 ms |
| 48 px | 10 / 10 | 46,035,690 | 9 / 9 | 55,320,990 | 82 ms | 83 ms | 15,759 ms |

三个阈值均无页面错误和失败请求，移出视锥后驻留节点均降为 `0`。`32 px` 与 `48 px` 得到相同总览和聚焦切面；默认保留 `16 px`，以更高但仍在预算内的总览驻留换取更细的可见几何。聚焦后三个阈值工作集完全一致，因此设备级表现不受该选择影响。

## 11. 通用场景查询 API

### 11.1 查询对象

```ts
interface ICESceneQuery {
  readonly ids?: readonly string[];
  readonly selectionIds?: readonly string[];
  readonly bounds?: ICEGeometryBounds;
  readonly visibleOnly?: boolean;
  readonly limit?: number;
}

interface ICESceneItem {
  readonly nodeId: string;
  readonly selectionId: string;
  readonly name: string;
  readonly typeId: string;
  readonly bounds: ICEGeometryBounds;
  readonly visible: boolean;
}

queryScene(query?: ICESceneQuery): readonly ICESceneItem[];
findBySelectionId(selectionId: string): ICENode | undefined;
```

规则：

- 查询按稳定 `selectionId` 去重。
- LOD 父子内容同时存在时只返回一个逻辑结果。
- 结果按 `selectionId` 排序。
- 包围盒使用世界空间。
- 返回只读快照，不暴露 Tile 容器。

### 11.2 拾取

```ts
interface ICEScreenPickResult {
  readonly item?: ICESceneItem;
  readonly point?: readonly [number, number, number];
}

interface ICERay {
  readonly origin: readonly [number, number, number];
  readonly direction: readonly [number, number, number];
  readonly maxDistance?: number;
}

pickItem(point: ICEScreenPoint): ICEScreenPickResult;
raycast(ray: ICERay): ICESceneItem | undefined;
```

- 屏幕拾取复用 GPU 精确拾取。
- 世界射线拾取不依赖 Canvas 或浏览器。
- 两种拾取返回相同语义设备。
- 无效方向、非有限坐标和非正最大距离被拒绝。

### 11.3 聚焦

```ts
interface ICEFocusOptions {
  readonly padding?: number;
  readonly animate?: boolean;
}

focus(
  target: ICESceneItem,
  options?: ICEFocusOptions,
): void;
```

- 保留当前观察方向。
- 根据目标世界包围盒计算距离。
- 默认平滑，遵守 reduced-motion。
- 聚焦只操作相机，LOD 仍由正常 SSE 调度响应。

### 11.4 事件

继续复用：

- `SELECTION_CHANGE`
- `TILESET_TILE_LOADED`
- `TILESET_TILE_UNLOADED`
- `TILESET_LOD_CHANGED`
- `TILESET_LOD_FALLBACK`
- `DIAGNOSTIC`

事件保持冻结、只读和可序列化。

## 12. 诊断

新增：

| 代码 | 触发 | 调用方动作 |
| --- | --- | --- |
| `ICE3_TILESET_CONTENTS_INVALID` | Tile 同时包含单内容和多内容，或分片列表非法 | 使用工具链重新生成 |
| `ICE3_TILESET_CONTENT_FAILED` | 逻辑 Tile 中一个必需分片失败 | 检查分片 ID；保留父粗模回退 |
| `ICE3_TOOL_LOD_CHUNK_OVERSIZED` | 单个不可分割设备超过最大分片字节 | 提高单分片上限或优化源设备 |

多分片失败仍报告 `TILESET_TILE_FAILED`，其 `tileId` 是逻辑 Tile ID。

## 13. 验证策略

### 13.1 工具

- 同一内部节点的多个设备按稳定规则拆成多个 GLB。
- 每个非单设备分片不超过配置上限。
- 单设备超限产生稳定诊断。
- 分片总数和总三角数不扩大。
- 粗模总体小于细模。
- 25% 目标能报告实际达成或偏差。
- 多个分片中的设备选择 ID 保持完整且不重复。
- 输出目录原子发布。

### 13.2 Tileset

- 单 `content` 规范化为一个 `contentUris`。
- 多 `contents` 保留稳定顺序。
- 内容和多内容同时出现被拒绝。
- 空分片、重复 URI、绝对 URI 被拒绝。

### 13.3 运行时

- 逻辑 Tile 的全部分片成功后只产生一个容器。
- 分片加载期间父粗模保持。
- 任一分片失败不提交半个 Tile。
- 重载和卸载会清理所有分片缓存。
- `residentContents` 与场景子容器数量一致。
- 预取不阻塞 `whenIdle()`。
- 预取失败不影响当前可见切面。
- 预算达到后停止新增预取。

### 13.4 查询与交互

- 查询按语义身份去重。
- 粗模和细模同时存在时返回一个设备。
- 世界包围盒和可见性过滤正确。
- GPU 与射线拾取返回同一设备。
- 聚焦不改变选择身份。
- 查询结果顺序稳定。

### 13.5 浏览器

- 多分片粗模按逻辑 Tile 完整提交。
- 分片延迟和失败不产生空洞。
- 预取存在时当前切面仍及时 idle。
- Chromium 与 WebKit 通过。

## 14. 验收标准

1. 粗模总体积小于细模总体积。
2. 粗模三角形比例达到或明确报告与 `25%` 校准目标的差距。
3. 单个非单设备粗模分片不超过 `32 MiB`。
4. 同一逻辑 Tile 的所有粗模分片共同提交。
5. 预取不阻塞当前切面稳定，也不扩大预算。
6. SSE 默认值经过 `16 / 32 / 48 px` 实测校准。
7. 通用查询、屏幕拾取、世界射线和设备聚焦通过测试。
8. 查询与交互 API 不包含 Agent 专用语义。
9. 客户模型及派生文件不进入仓库或发布包。

## Related Documents

- `ICE3-DOC-IDX-001` — [Documentation index](../README.md)
- `ICE3-DOC-PLAN-007` — [LOD refinement implementation](../plans/2026-10-27-lod-refinement.md)
