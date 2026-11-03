# ICE3 文档命名与编号规范

> Document ID: ICE3-DOC-REF-002
>
> Status: Active
>
> Owner: ICE3 documentation maintainers

## 1. 目标

本规范统一 ICE3 各仓库 Markdown 文档的文件名、Document ID、目录位置、索引顺序和
状态写法，避免同名文件、重复编号、不可预测锚点和历史文档冒充当前能力。

## 2. Document ID

Document ID 使用以下结构：

```text
ICE3-<AREA>-<TYPE>-<NNN>
```

- `AREA` 使用 `DOC`、`ENG`、`STUDIO`、`AGENT`、`IND`、`WATER` 或未来的稳定区域码。
- `TYPE` 使用 `RM`、`IDX`、`ARC`、`ADR`、`GUIDE`、`API`、`SPEC`、`PLAN`、
  `POL`、`CTR`、`REF` 或 `NOTICE`。
- `NNN` 是至少三位、补零的十进制序号。
- 序号在“仓库区域 + 文档类型”范围内唯一；ID 一经发布不得复用或重排。
- 删除文档时保留历史文件和状态，不能把编号分配给另一主题。

## 3. 文件命名

| 文档类型 | 命名规则 | 示例 |
|---|---|---|
| 仓库与索引 | `README.md` | `docs/README.md` |
| 架构 | `architecture.md` | `docs/architecture.md` |
| ADR | `NNNN-kebab-case.md` 或现有 `0001-kebab-case.md` | `decisions/0006-agent-led-studio-workbench.md` |
| 指南 | `kebab-case.md` | `guides/static-deployment.md` |
| API 与参考 | `kebab-case.md` | `reference/protocol.md` |
| Contract | `<topic>-v<major>.md` | `asset-preparation-contract-v1.md` |
| Spec | `YYYY-MM-DD-kebab-case-design.md` | `2026-11-02-studio-asset-prepare-parity-design.md` |
| Plan | `YYYY-MM-DD-kebab-case.md` | `2026-11-02-studio-prepare-core.md` |

文件名使用小写 ASCII、数字和连字符。不得使用 `final`、`new`、`temp`、`misc`、
`copy`、日期重复后缀或无法表达主题的名称。翻译标题时保留既有文件名，除非迁移计划
同时更新所有内部与跨仓库链接。

## 4. 元数据

除 `LICENSE`、README 和明确法律例外外，产品文档必须包含：

```text
> Document ID: ...
>
> Status: ...
>
> Owner: ...
```

Status 只能使用文档校验器支持的稳定集合。实现完成但性能门禁未通过的能力使用
`Implemented`，并在正文中明确“实验性”或“默认关闭”；被替代方案使用
`Deprecated`、`Historical` 或 `Implemented` 中语义最准确的一种。

`Historical` 与 `Deprecated` 文档可以保留原始实施语言作为审计证据，但标题、元数据和
索引用途必须可检索，正文顶部必须说明退役原因或替代方案。该例外不适用于 README、
Architecture、Guide、API、Reference、ADR 或当前有效的 Contract。

## 5. 索引

- 每个包含产品文档的仓库必须有 `docs/README.md`。
- 索引按 Document ID 的数字序号排序，不按文件名或创建时间排序。
- 每个文档恰好在索引中出现一次。
- Active 文档优先展示；Historical、Deprecated 和存档文档放入独立小节。
- 标题和用途必须描述当前内容，不能继续引用已删除仓库、依赖或生产能力。

## 6. 链接与状态

- 内部链接使用仓库相对路径。
- 跨仓库链接使用固定 `main` 分支的完整 GitHub URL。
- 修改标题时必须同步更新 GitHub heading anchor。
- 历史文档必须在显著位置说明其替代方案或退役原因。
- 当前架构、API、指南和参考文档不得把历史方案描述为生产依赖。

## 7. 验证

```bash
npm run docs:check
npm run docs:check:workspace
npm test
```

结构、语言、链接、索引和命名任一检查失败时，不得把文档标记为完成。

## 8. 关联文档

- `ICE3-DOC-IDX-001` — [文档索引](../README.md)
- `ICE3-DOC-SPEC-011` — [文档系统设计](https://github.com/ice-3d/ice3-doc/blob/main/docs/specs/2026-10-29-documentation-system-design.md)
- `ICE3-DOC-SPEC-012` — [全中文文档改版设计](https://github.com/ice-3d/ice3-doc/blob/main/docs/specs/2026-10-29-chinese-documentation-policy-design.md)
