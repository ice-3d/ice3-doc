# ICE3 文档系统设计规格

> Document ID: ICE3-DOC-SPEC-011
>
> Status: Implemented
>
> Owner: ICE3 documentation maintainers

## 目标

本规格定义所有 ICE3 仓库的文档系统，使没有项目背景的开发者也能理解、导航并验证每个
仓库。

文档系统必须在不依赖内部口头知识的情况下回答四个问题：

1. 这个仓库是什么，不是什么？
2. 它如何与其他 ICE3 仓库协作？
3. 其背后有哪些重要技术决策？
4. 开发者如何安装、运行、使用、调试和验证它？

本规格定义 Document identity、taxonomy、repository coverage、reference rule、
lifecycle、migration 和 automated validation。它不定义 Runtime architecture 或
Asset format；这些内容仍由各自的权威设计和 contract 管理。

## 读者

- 需要可靠入门路径的新贡献者。
- 使用公开 ICE3 package 的应用开发者。
- 准备、验证、拆分和发布 Asset 的工具作者。
- 需要定位权威 contract 和决策的维护者。
- 需要验证文档与实现一致的审查者。

## 范围

本规格适用于以下仓库中的全部 Markdown 文档：

- `ice3-agent-console`
- `ice3-doc`
- `ice3-engine`
- `ice3-industrial`
- `ice3-studio`
- `ice3-toolchain`
- `ice3-water-demo`

范围包括 repository README、index、architecture document、ADR、guide、API
reference、contract、Spec、implement plan、repository policy、source notice 和
third-party reference。

根目录 `AGENTS.md` 是仓库治理输入，不属于产品文档。每个仓库拥有自己的文件，并使其
与实际职责一致。治理文件不进入产品文档索引要求和自动产品文档验证。

`LICENSE` 使用未修改的 MIT 许可证文本，不适用 Markdown document metadata 规则。

## 目标清单

- 为每份 Markdown 提供清晰标题和永久内部 ID。
- 从每个 repository README 提供完整导航路径。
- 分离入口、架构、决策、使用、参考、Spec、Plan 和 policy。
- 为每个 shared contract 建立唯一权威。
- 确保发布后的 GitHub cross-repository reference 有效。
- 保留历史设计背景，但不将其作为当前使用指引。
- 阻止 local path、temporary link 和未说明 placeholder 进入公开文档。
- 让文档完整性和链接完整性可以机械验证。

## 非目标

- 本阶段生成 documentation website。
- 公开所有内部 implementation detail。
- 在每个仓库重复维护权威 Asset contract。
- 改写历史设计或实施文档的技术结论。
- 为未实现能力增加产品声明或使用说明。
- 为每份文档维护多个翻译版本。

## 文档原则

### 先入口后细节

每个仓库以简洁 README 开始，说明目标、边界、快速开始、验证和文档导航。详细内容
位于 README 链接的专题文档中。

### 先决策后实现细节

ADR 记录问题、选定方案、备选方案、影响和关联文档。实施指南再说明如何应用该决策。

### 单一权威定义

共享 format、Diagnostic、compatibility rule 和 metric 只在 `ice3-doc` 定义一次。
其他仓库链接该定义，只描述自身实现。

### 当前与历史分离

当前 API 和操作指南必须与已实现的设计和 Plan 清楚分开。历史文档继续保留，以支持
追溯。

### 稳定 Identity

Document ID 在文件移动和标题修改后保持不变。未来文档可以复用路径，但不得复用已有
Document ID。

### 默认验证

每个文档化 command 都必须有验证路径。无法从全新 clone 运行的 command 必须说明前置
条件和预期结果。

## Document Identity

每份产品 Markdown 以一个一级标题开始，随后是 metadata block。仓库 `AGENTS.md`
使用相同 header 形状，便于读者识别和引用治理规则：

```md
# Human-readable title

> Document ID: ICE3-ENG-RM-001
>
> Status: Active
>
> Owner: ICE3 Engine maintainers

```

Document ID 格式为：

```text
ICE3-<AREA>-<TYPE>-<NNN>
```

要求：

- `AREA` 标识所属项目。
- `TYPE` 标识文档类别。
- `NNN` 是同一 `AREA` 和 `TYPE` 下的三位补零序号。
- Identifier 在 ICE3 文档集中全局唯一。
- Commit 后 Identifier 不可修改。
- 文档删除后编号不得复用。
- 新编号使用 `AREA` 和 `TYPE` namespace 中下一个未使用值。
- Identifier 存于文档正文，不根据 filename 推断。

## Area Code

| 领域 | Code | 仓库 |
|---|---|---|
| Agent Console | `AGENT` | `ice3-agent-console` |
| Shared documentation | `DOC` | `ice3-doc` |
| Engine | `ENG` | `ice3-engine` |
| Industrial semantics | `IND` | `ice3-industrial` |
| Studio | `STUDIO` | `ice3-studio` |
| Toolchain | `TOOL` | `ice3-toolchain` |
| Water demo | `WATER` | `ice3-water-demo` |

## Document Type

| 类型 | Code | 用途 |
|---|---|---|
| README | `RM` | Repository entry point and navigation |
| Index | `IDX` | Catalog of related documents |
| Architecture | `ARC` | Components, boundaries, dependencies, and data flow |
| Decision | `ADR` | Accepted architectural or engineering decision |
| Guide | `GUIDE` | Installation, development, usage, deployment, or troubleshooting |
| API | `API` | Public programming interface and behavioral contract |
| Specification | `SPEC` | Approved functional or system design |
| Plan | `PLAN` | Ordered implementation and verification record |
| Policy | `POL` | Repository engineering and collaboration rules |
| Contract | `CTR` | Cross-repository format, metric, compatibility, or diagnostic agreement |
| Reference | `REF` | Lookup material such as formats, diagnostics, CLI syntax, or sources |
| Notice | `NOTICE` | Third-party copyright, attribution, or license notice |

## Status 生命周期

允许的 lifecycle state 为：

| Status | 含义 |
|---|---|
| `Draft` | Under review and not yet authoritative |
| `Approved` | Accepted design that is not yet fully implemented |
| `Active` | Current authoritative guidance or reference |
| `Implemented` | Completed plan or design retained for traceability |
| `Historical` | Superseded material retained for project history |
| `Deprecated` | Must no longer be used for new work |
| `Placeholder` | Reserved repository with no implemented capability yet |

状态转换规则：

- Spec 从 `Draft` 开始。
- Maintainer 批准后改为 `Approved`。
- 接受范围完成后，Plan 或 Spec 改为 `Implemented`。
- 被替代内容改为 `Historical` 或 `Deprecated`。
- 空仓库在实施开始前使用 `Placeholder`。

## 必需 Heading 结构

### Repository README

每个已实现 repository README 包含：

1. 目标。
2. 当前能力和明确边界。
3. Repository relationship。
4. 前置条件。
5. 快速开始。
6. 主要 workflow。
7. 验证。
8. Documentation map。
9. AI-assisted development disclosure。
10. 许可证。

Command 仅在 working directory 不是 repository root 时说明该目录。跨仓库 command
从本 repository root 开始，并使用已发布的 cross-repository URL 规范。

### 架构文档

每份 architecture document 包含：

1. System context。
2. Component 职责。
3. Dependency direction。
4. 主要 data flow。
5. Public/private boundary。
6. Failure behavior。
7. 关联决策。
8. 关联 Spec 和 reference。

### 架构决策记录（ADR）

每份 decision record 包含：

1. 背景和问题。
2. 决策。
3. 备选方案。
4. 影响与 trade-off。
5. Compatibility impact。
6. Verification approach。
7. Supersession link。

### 使用指南

每份 usage guide 包含：

1. 目标结果。
2. 前置条件。
3. Input 和 assumption。
4. 有序步骤。
5. 预期结果。
6. Failure diagnosis。
7. 关联 API 和 reference 文档。

### API 或 Reference 文档

每份 API 或 reference 文档包含：

1. 支持范围。
2. 不支持范围。
3. 稳定 public name。
4. Input/output shape。
5. Lifecycle 和 error 行为。
6. 完整可执行示例。
7. Versioning 或 compatibility policy。
8. 关联 contract Identifier。

### Spec 与 Implementation Plan

现有技术内容保持不变。每份文档包含标准 metadata block 和关联文档章节。Plan 指出
其实现的 Spec；Spec 指出治理该设计的决策和 contract。

### Placeholder README

空仓库只包含：

1. 标题和 metadata。
2. Repository 目标。
3. `Placeholder` Status。
4. 尚无 public API、command 或 architecture 的说明。
5. AI-assisted development disclosure。
6. 许可证。

Placeholder 不得暗示功能已经存在。

## 权威 Source-of-Truth 模型

以下内容以 `ice3-doc` 为权威：

- Cross-repository architecture。
- Prepared Asset 和 format contract。
- Shared compatibility rule。
- Shared budget 和 metric。
- Shared Diagnostic ID。
- Cross-repository decision。

以下内容以所属仓库为权威：

- Public package API。
- CLI 行为。
- Runtime 架构。
- Application Protocol。
- 安装和操作步骤。
- Repository-specific engineering policy。

所属仓库可以摘要权威 contract 来解释本地用法，但必须链接权威文档，不得建立竞争定义。

## Repository 文档矩阵

### `ice3-doc`

| ID | 文档 | Status 目标 |
|---|---|---|
| `ICE3-DOC-RM-001` | README | Active |
| `ICE3-DOC-IDX-001` | Documentation index | Active |
| `ICE3-DOC-IDX-002` | Decisions index | Active |
| `ICE3-DOC-ARC-001` | ICE3 family architecture | Active |
| `ICE3-DOC-ADR-001` | Universal engine and vertical applications | Active |
| `ICE3-DOC-ADR-002` | Offline preprocessing and open asset formats | Active |
| `ICE3-DOC-ADR-003` | Shared 2D/3D composition | Active |
| `ICE3-DOC-ADR-004` | Generic semantic interfaces and Agent boundary | Active |
| `ICE3-DOC-CTR-001` | Asset Preparation Contract v1 | Active |
| `ICE3-DOC-SPEC-001..011` | Existing and current design specifications | Approved or Implemented |
| `ICE3-DOC-PLAN-001..014` | Existing implementation plans | Implemented or Historical |
| `ICE3-DOC-PLAN-015` | Documentation system implementation | Active |

### `ice3-engine`

| ID | 文档 | Status 目标 |
|---|---|---|
| `ICE3-ENG-RM-001` | README | Active |
| `ICE3-ENG-IDX-001` | Documentation index | Active |
| `ICE3-ENG-IDX-002` | Decisions index | Active |
| `ICE3-ENG-ARC-001` | Runtime and package architecture | Active |
| `ICE3-ENG-GUIDE-001` | Getting started | Active |
| `ICE3-ENG-GUIDE-002` | Asset loading and Tileset usage | Active |
| `ICE3-ENG-GUIDE-003` | Development and troubleshooting | Active |
| `ICE3-ENG-ADR-001` | Public facade and package boundaries | Active |
| `ICE3-ENG-ADR-002` | Geometry-first industrial rendering | Active |
| `ICE3-ENG-ADR-003` | Camera-driven Tileset and LOD runtime | Active |
| `ICE3-ENG-API-001` | M0 public API | Active |
| `ICE3-ENG-API-002` | M1 asset API | Active |
| `ICE3-ENG-REF-001` | Diagnostics reference | Active |
| `ICE3-ENG-POL-001` | Repository policy | Active |
| Existing specifications and plans | M0, M1, and equipment selection | Implemented or Historical |

### `ice3-toolchain`

| ID | 文档 | Status 目标 |
|---|---|---|
| `ICE3-TOOL-RM-001` | README | Active |
| `ICE3-TOOL-IDX-001` | Documentation index | Active |
| `ICE3-TOOL-IDX-002` | Decisions index | Active |
| `ICE3-TOOL-ARC-001` | Preparation and partition architecture | Active |
| `ICE3-TOOL-GUIDE-001` | Build, validate, partition, and publish | Active |
| `ICE3-TOOL-GUIDE-002` | Large-model troubleshooting and performance | Active |
| `ICE3-TOOL-REF-001` | CLI reference | Active |
| `ICE3-TOOL-ADR-001` | Offline conversion and standard output | Active |
| `ICE3-TOOL-ADR-002` | Deterministic atomic publication | Active |
| `ICE3-TOOL-ADR-003` | Content-addressed generation cache | Active |
| `ICE3-TOOL-POL-001` | Repository policy | Active |
| `ICE3-TOOL-NOTICE-001` | Third-party notices | Active |
| `ICE3-TOOL-REF-002` | OGC fixture source | Active |
| Existing specifications and plans | GLB pipeline | Implemented or Historical |

### `ice3-agent-console`

| ID | 文档 | Status 目标 |
|---|---|---|
| `ICE3-AGENT-RM-001` | README | Active |
| `ICE3-AGENT-IDX-001` | Documentation index | Active |
| `ICE3-AGENT-IDX-002` | Decisions index | Active |
| `ICE3-AGENT-ARC-001` | Console and event-stream architecture | Active |
| `ICE3-AGENT-GUIDE-001` | Local development | Active |
| `ICE3-AGENT-GUIDE-002` | Static deployment | Active |
| `ICE3-AGENT-GUIDE-003` | Real-model server configuration | Active |
| `ICE3-AGENT-REF-001` | Agent event and tool protocol | Active |
| `ICE3-AGENT-ADR-001` | Agent and scene responsibility boundary | Active |
| `ICE3-AGENT-ADR-002` | Scripted and real-model transport policy | Active |
| `ICE3-AGENT-POL-001` | Repository policy | Active |
| Existing specification and plan | Console design and delivery | Implemented or Historical |

### `ice3-industrial`

| ID | 文档 | Status 目标 |
|---|---|---|
| `ICE3-IND-RM-001` | README | Active |
| `ICE3-IND-IDX-001` | Documentation index | Active |
| `ICE3-IND-IDX-002` | Decisions index | Active |
| `ICE3-IND-ARC-001` | Industrial semantic architecture | Active |
| `ICE3-IND-GUIDE-001` | Getting started and common workflows | Active |
| `ICE3-IND-API-001` | Public package reference | Active |
| `ICE3-IND-ADR-001` | Zero-runtime-dependency core | Active |
| `ICE3-IND-ADR-002` | Static manifest and runtime state separation | Active |
| `ICE3-IND-ADR-003` | Stable identity model | Active |

### `ice3-studio`

| ID | 文档 | Status 目标 |
|---|---|---|
| `ICE3-STUDIO-RM-001` | Placeholder README | Placeholder |

### `ice3-water-demo`

| ID | 文档 | Status 目标 |
|---|---|---|
| `ICE3-WATER-RM-001` | Placeholder README | Placeholder |

## Document Reference 模型

每份实质性文档以关联文档章节结束，至少列出以下内容的稳定 ID 和标题：

- 其父级 overview 或 index。
- 治理该文档的决策。
- 受影响的 Spec 或 contract。
- 存在时对应的 implementation plan。
- 读者下一步应使用的 API、guide 或 reference。

### 同仓库链接

使用当前文档出发的相对 Markdown 链接：

```md
[M1 Asset API](../api/m1.md)
```

链接目标必须是 tracked file，anchor 必须匹配 GitHub 生成的 heading slug。

### 跨仓库链接

使用已发布的 GitHub URL：

```text
https://github.com/ice-3d/ice3-<repository>/blob/main/<path>
```

示例：

```text
https://github.com/ice-3d/ice3-doc/blob/main/docs/contracts/asset-preparation-contract-v1.md
https://github.com/ice-3d/ice3-engine/blob/main/docs/api/m1.md
```

公开文档不得使用 `../ice3-engine` 这类 sibling-directory link，因为 GitHub
repository 相互独立。

### Identity Reference

目标尚未公开时，使用 Document Identifier 作为文本，并明确说明发布后建立链接。不得
输出已知失效 URL。

### Reference 完整性

- 一份文档可以链接多个关联文档。
- 文档不得声明拥有已委派给其他权威文档的权力。
- 改变共享行为的决策必须链接替代文档或受影响 contract。
- 被替代文档必须链接其替代文档。
- Index 必须包含仓库拥有的每份产品 Markdown，除 `LICENSE`、根 `AGENTS.md` 和生成临时文件。

## 文件布局

公开文档使用以下布局：

```text
README.md
docs/
  README.md
  architecture.md
  decisions/
    README.md
    0001-topic.md
  guides/
    getting-started.md
  reference/
    api.md
    cli.md
    diagnostics.md
  specs/
    YYYY-MM-DD-topic-design.md
  plans/
    YYYY-MM-DD-topic.md
```

每个仓库在常规位置保留自己的 `AGENTS.md` 和第三方声明。不存在 workspace 级共享
`AGENTS.md`。

原内部 workflow directory 移至 `docs/specs` 和 `docs/plans`，内部链接同步更新。所有
reference 迁移完成后移除旧目录。

## 语言政策

- 标题、正文、步骤、表格说明和验收条件使用简体中文。
- 产品名、标准名、缩写、API、类型、字段、命令、路径和 Diagnostic ID 保留英文原样。
- `Scene`、`Asset`、`Selection`、`Node`、`Mesh`、`Material` 和 `LOD` 等技术词汇直接使用英文。
- 技术词不强制添加中文括注，技术词写法以 [ICE3 技术词表](../reference/terminology.md) 为准。
- 代码块、inline code、URL、schema key 和协议字符串不因语言政策改变。
- 不维护中英双语正文，也不要求中文 Spec 提供 English summary。
- `THIRD_PARTY_NOTICES.md`、测试夹具中的 `SOURCE.md` 和 `scripts/fixtures/**/*.md` 保留原文。
- 自动语言检查在迁移完成后默认启用。

## 写作规则

- 使用具体动词和短段落。
- 将术语作为 requirement 使用前先定义。
- 明确说明不支持行为。
- 当前说明放在 guide，历史理由放在 Spec 或 Plan。
- 每个 code block 在 Markdown 支持时标注 language。
- 每个 command block 说明是否从 repository root 运行。
- 每个 command block 包含预期 output 或 verification condition。
- Cross-document prose 使用稳定 Document Identifier。
- 不包含 local user path、credential、真实客户数据或未批准 vendor name。
- 不把 repository-specific implementation 当作 shared contract 定义。

## 自动验证

Documentation gate 检查所有 tracked product Markdown。根 `AGENTS.md` 是 repository
governance input，不进入扫描：

1. 恰好一个 level-one heading。
2. Title 非空，且在 repository 内唯一。
3. Title 后紧跟有效 `Document ID`。
4. ID 匹配 `ICE3-<AREA>-<TYPE>-<NNN>`。
5. ID 在本地文档集内唯一。
6. Status 值受支持。
7. Repository index 包含其拥有的所有产品 Markdown。
8. 相对 file link 指向 tracked file。
9. Heading anchor 指向目标文档中的 heading。
10. Cross-repository link 使用 `https://github.com/ice-3d/...`，并在同级仓库存在时映射到已知 repository 和 tracked path。
11. 不出现 `/Users/<name>`、`/home/<name>`、Windows user path、`file://` URL 或 temporary output path。
12. Placeholder repository 不含 executable command 或 API claim。

Validation command 必须可从每个 repository 运行，并在迁移后纳入其 verification
workflow。

## Migration Plan

1. 添加本 Spec 并批准其 Status。
2. 添加 family 和 repository documentation index。
3. 为既有文档分配 Identifier 和 metadata，不改变技术结论。
4. 将 Spec 和 Plan 移出内部 workflow directory，并修复受影响 link。
5. 按依赖顺序添加 architecture、decision、guide、API、reference 和 policy：shared documentation、Engine、Toolchain、industrial core、Agent Console，最后是 Placeholder。
6. 将 repository README 改写为导航和快速开始入口。
7. 运行 documentation validation、content check 和每个 repository 的既有 verification command。
8. 从每个 README 经 index 到详细文档，再经关联文档链接返回，审查完整导航。

## 验收标准

满足以下条件时文档系统完成：

- 每份 Markdown 都有 title、唯一 internal ID、Status 和 Owner。
- 每个已实现 repository 都有 README 和完整 documentation index。
- 每个 documented command 在安装前置依赖后可从 fresh clone 运行。
- 每个 technical decision 都有 ADR，或明确记录在现有权威 Spec 中。
- 所有 shared-format reference 指向 `ice3-doc` 权威 contract。
- Cross-repository link 使用 `ice-3d` GitHub organization，不包含 local sibling path。
- 所有 repository index 不缺少也不多余拥有文档。
- 所有 relative link 和 anchor 通过自动验证。
- 空 repository 只包含真实 placeholder documentation。
- 既有 repository test 和 build verification 保持通过。

## 关联文档

- `ICE3-DOC-RM-001` — ICE3 文档 README。
- `ICE3-DOC-IDX-001` — ICE3 文档索引。
- `ICE3-DOC-ARC-001` — ICE3 家族架构。
- `ICE3-DOC-CTR-001` — Asset Preparation Contract v1.

上述关联 Identifier 在相应文档迁移后建立链接。
