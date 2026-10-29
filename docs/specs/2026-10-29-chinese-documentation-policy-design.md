# ICE3 全中文文档改版设计规格

> Document ID: ICE3-DOC-SPEC-012
>
> Status: Draft
>
> Owner: ICE3 documentation maintainers
>
> English summary: Define a Chinese narrative policy that preserves technical nouns and abbreviations, migrates all product and repository policy documents, and validates future documentation without creating bilingual duplicates.

## 1. 目标

将 ICE3 各工程的 Markdown 文档统一为中文叙述，让读者可以直接理解工程目标、架构、使用方法和设计决策，同时保留技术领域沿用英文的术语、缩写、API、命令和稳定标识。

本次改版解决三个问题：

1. 同一份文档中缺少统一语言规则，导致中文说明与整段英文叙述混杂。
2. 同类文档之间的标题、术语和写作风格不一致。
3. 后续新增文档没有自动检查，无法阻止语言再次漂移。

## 2. 适用范围

适用范围包括 7 个工程中的 Markdown 文档：

- `ice3-agent-console`
- `ice3-doc`
- `ice3-engine`
- `ice3-industrial`
- `ice3-studio`
- `ice3-toolchain`
- `ice3-water-demo`

迁移对象包括 README、文档索引、架构文档、ADR、API、CLI、诊断、指南、Spec、Plan 和各工程根目录的 `AGENTS.md`。

设计阶段的统计基线是 106 份受版本控制的 Markdown 文件。实施阶段以实际跟踪文件为准，不依赖固定数量。

以下内容明确例外：

- `LICENSE` 及具有法律效力的原始许可文本。
- `THIRD_PARTY_NOTICES.md`、测试夹具中的 `SOURCE.md` 等第三方声明或上游原文。
- `scripts/fixtures/**/*.md` 等故意保持特定内容的测试输入。

例外文件仍受仓库命名、安全与资产规则约束，但不要求改写成中文。

## 3. 语言规则

### 3.1 中文承担叙述

标题、正文、步骤、表格说明、列表说明、决策理由和验收条件使用简体中文。

正确示例：

```text
## 场景与选择

当前 Selection 保存在 Scene 中。相机变化后，运行时继续保留同一个稳定 identity。
```

错误示例：

```text
## Scene and Selection

The current Selection remains stable when the camera changes.
```

### 3.2 技术词汇保留英文

以下内容直接使用英文原词，不要求翻译，也不强制添加中文括注：

- 产品名、项目名和公司名
- 标准名、协议名和规范名
- 专有名词与缩写
- API、类型、函数、属性、字段和诊断码
- 普通技术概念，例如 `Scene`、`Asset`、`Selection`、`Node`、`Mesh`、`Material`、`LOD`

英文技术词应自然嵌入中文句子，不为追求“完全中文”而生造译名。

### 3.3 不改变机器可读内容

以下内容保持字节级含义不变：

- fenced code block 与 inline code
- 命令、参数、JSON、YAML、TypeScript 和其他代码
- URL、路径、文件名、扩展名
- Document ID、Status、Owner 等元数据字段
- 错误码、日志文本、schema key 和协议字符串

翻译不得修改代码注释以外的可执行示例。若注释属于解释性内容，可以改为中文，但不得改变代码行为。

## 4. 技术词治理

在 `ice3-doc` 中新增技术词表，记录：

- 固定英文写法与大小写
- 中文解释
- 常见错误写法或含义混淆
- 适用工程或上下文

技术词表不提供“英文到中文”的强制翻译映射。它的职责是保证 `Scene`、`scene` 之类写法不会混用，并让读者理解保留英文的原因。

共享技术词以 `ice3-doc` 为准。工程特有词由对应仓库维护，但不得改变共享词的既定写法。发现新共享词时，先补充技术词表，再更新消费文档。

## 5. 迁移结构

实施分为四个阶段。

### 阶段 0：规则与检查

1. 更新文档系统 Spec 的语言规则。
2. 建立 `ICE3-DOC-REF-001` 技术词表。
3. 增加 Markdown 语言检查及测试。
4. 删除“中文 Spec 必须提供 English summary”的旧规则，并清理不再需要的摘要。

### 阶段 1：入口文档

迁移各仓库的 `README.md`、`docs/README.md` 和 `AGENTS.md`。

这一批决定开发者首次进入仓库时看到的语言和术语写法，必须先完成。

### 阶段 2：当前实现文档

迁移架构文档、ADR、API、CLI、诊断、部署指南、开发指南、资产说明和契约文档。

这一批涉及最多跨文档链接与标题锚点，必须逐文件检查链接。

### 阶段 3：历史文档

迁移 Spec 和 Plan。只改变叙述语言与标题，不改变：

- Status、日期、版本和 Document ID
- 技术结论、范围、预算、失败条件和验收标准
- 历史决策与后续演进的先后关系

## 6. 仓库与提交策略

每个仓库使用独立的功能分支 `docs/chinese-localization`。

`ice3-doc` 先完成规则、技术词表和校验器，再由其余仓库应用同一规则。每批迁移使用独立提交，便于审查和回退。

每批完成后必须运行：

```bash
npm run docs:check
```

全工作区修改还必须在 `ice3-doc` 中运行：

```bash
npm run docs:check:workspace
```

所有仓库完成迁移并通过各自验证后，才能合入 `main`。

## 7. 链接与标识兼容

文件名、目录名、Document ID 和公开 URL 不因翻译而改变。

标题翻译会改变 GitHub 生成的 heading anchor。修改标题时必须同步更新：

- 同仓库内部链接的锚点
- 跨仓库链接的锚点
- README 与索引中的导航

只在外部 URL 本身不含锚点、或外部平台明确维护英文锚点时保留外部片段。不得为了保留旧锚点同时创建双语标题。

## 8. 自动验证

文档结构校验继续验证标题、Document ID、Status、Owner、索引和链接。

新增语言检查只分析 Markdown 的叙述内容：

- 忽略 fenced code block、inline code、URL、路径和元数据。
- 标题必须包含中文，或完全由一个受控技术词构成。
- 连续英文叙述超过可配置阈值且不含中文时报告错误。
- `AGENTS.md` 参与语言检查，但不参与产品文档索引检查。
- 例外文件通过明确、可审计的路径规则排除，不使用宽泛目录忽略。

检查失败必须报告文件与行号。新增测试至少覆盖：

1. 中文叙述与技术词混排通过。
2. 纯英文标题失败。
3. 纯英文正文段落失败。
4. 代码块中的英文通过。
5. 合法例外文件通过。
6. `AGENTS.md` 接受语言检查但不要求进入文档索引。

## 9. 人工审查

自动检查只能判断语言比例，不能判断译文是否忠实。每份迁移文档必须人工检查：

- 技术结论没有被改写或弱化
- 命令、示例和错误码没有被修改
- 技术词大小写和含义未被破坏
- 表格列义与单位保持一致
- 历史状态和时间信息保持不变
- 链接和锚点仍然有效

禁止使用机械翻译结果直接提交。可以使用工具辅助发现英文段落，但最终内容必须按工程语境重写为自然中文。

## 10. 验收标准

满足以下条件才视为改版完成：

1. 除明确例外外，所有受跟踪 Markdown 使用中文叙述。
2. 技术词、缩写、API、命令、路径和标识保持原样。
3. 不存在中英双语正文或并行维护的译本。
4. 所有内部与跨仓库链接有效。
5. 文档结构与语言检查全部通过。
6. 7 个仓库的工作树干净，修改已合入各自 `main`。
7. 所有 Git 提交的作者与提交者名称保持为 `damoqiongqiu`。

## 11. 非目标

- 翻译代码、标识符或运行时日志。
- 修改 API、协议、资产格式或工程行为。
- 重写历史技术结论。
- 建立持续翻译流程或多语言站点。
- 翻译明确例外中的法律文本和测试夹具。

## 12. 关联文档

- `ICE3-DOC-SPEC-011` — [文档系统设计规格](2026-10-29-documentation-system-design.md)
- `ICE3-DOC-ARC-001` — [ICE3 家族架构](../architecture.md)
- `ICE3-DOC-IDX-001` — [文档索引](../README.md)
