# ICE3 技术词表

> Document ID: ICE3-DOC-REF-001
>
> Status: Active
>
> Owner: ICE3 documentation maintainers

## 用途

本词表固定 ICE3 中文文档中技术词汇的英文写法、大小写和中文解释。技术词直接保留英文，不要求逐项翻译，也不要求在正文中重复添加中文括注。

| 保留写法 | 中文解释 | 使用约束 |
|---|---|---|
| Scene | 场景树及其对象关系 | 指运行时场景模型时使用大写开头 |
| Asset | 可加载的模型、几何或其他资源 | 不用于泛指业务实体 |
| Selection | 当前选中对象的身份与状态 | 与具体 UI 样式保持区分 |
| Node | 场景树中的节点 | 不替代业务实体或 Equipment |
| Mesh | 网格及其 primitive 集合 | 不指整个可选择的设备 |
| Material | 绘制表面使用的材质状态 | 工业场景中保持基础能力 |
| Geometry | 顶点、索引和拓扑数据 | 与 Mesh、Node 分层使用 |
| Bounds | 轴对齐或有方向的包围范围 | 明确空间范围时不写成区域 |
| Runtime | 加载、调度和绘制资产的运行时 | 不指构建期工具 |
| Renderer | 与 GPU 和绘制后端交互的实现 | 不由公共 API 暴露 GPU 对象 |
| Worker | 浏览器后台计算线程 | 与主线程绘制职责分开 |
| Batch | 可合并绘制的一组几何 | 不改变 selection identity |
| Draw call | 一次 GPU 绘制提交 | 与 Mesh 或 primitive 数量分别统计 |
| LOD | 多精度层级内容及其选择 | 常用作缩写，不全拼展开 |
| Tileset | 空间分层、流式加载的资产集合 | 与普通单文件 Asset 区分 |
| GLB | 二进制 glTF 资产容器 | 不改成其他缩写或中文简称 |
| WebGL | 浏览器 2D/3D 图形接口 | 保留官方大小写 |
| OGC 3D Tiles | 开放空间数据流式加载规范 | 保留空格、数字和大小写 |

## 使用规则

- 新术语先确认是否已有固定英文写法，再写入文档。
- 同一术语不得在标题、表格和正文中出现不同大小写。
- 英文技术词应嵌入中文句子，例如“当前 Selection 保存在 Scene 中”。
- API、类型、字段和 Diagnostic ID 以代码或契约中的写作为准。
- 项目特有术语由对应仓库维护；跨仓库含义发生变化时，先更新本词表。

## 关联文档

- `ICE3-DOC-SPEC-011` — [文档系统设计规格](../specs/2026-10-29-documentation-system-design.md)
- `ICE3-DOC-SPEC-012` — [全中文文档改版设计规格](../specs/2026-10-29-chinese-documentation-policy-design.md)
- `ICE3-DOC-IDX-001` — [文档索引](../README.md)
