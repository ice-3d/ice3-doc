# ICE3 Documentation 仓库规则

> Document ID: ICE3-DOC-POL-001
>
> Status: Active
>
> Owner: ICE3 documentation maintainers

## 跨仓库契约

- 本仓库是跨项目 format、metric、budget、compatibility rule、shared diagnostic 及其版本规则的唯一权威。
- 每份 contract 必须定义适用范围、兼容窗口、消费方、冻结示例和 validation requirement。
- 消费仓库链接权威 contract，不维护独立完整副本。
- contract 变更必须检查所有消费方，并通过跨仓库文档与一致性检查。
- 每份产品 Markdown 使用唯一 `ICE3-<AREA>-<TYPE>-<NNN>` ID，并包含明确标题、Status、Owner、索引条目和有效相对链接。
- 根目录 `AGENTS.md` 是仓库治理输入，不属于产品文档，不进入产品文档发现流程。

## 交付

- 使用 `.nvmrc` 指定的 Node.js 24.22.1 LTS。
- 在功能分支开发，完整验证门禁通过后才可合入 `main`。
- 保持生成的索引、contract reference 和 repository link 具有确定性。
- 不得为了让无效文档通过而削弱 validation test。

## 提交身份

- 本仓库所有 Git author 和 committer 名称必须为 `damoqiongqiu`。
- 提交、合并或推送前核对配置名称与提交记录。

## 命名与法律边界

- 文档、链接、图表、metadata、示例或 commit 中不得出现竞品、厂商或第三方产品名称。
- 不得通过 URL、截图、package 名、仓库名、class 名或其他标识间接暴露禁止名称。
- 技术比较只使用经批准的中性类别。
- 必要的外部资料留在产品仓库之外，并接受法律审查。

## 客户 Asset 保护

- 真实客户模型 Asset 保留在受控本地目录中，不进入任何仓库。
- 客户模型或派生片段不得进入文档、截图、示例、图表、日志或 Git history。
- 公开文档使用虚构、已脱敏或明确可分发材料。
- 完成 Asset 相关工作前，检查 Git status、tracked files、ignore rules 和 staged content。

## 验证

```bash
npm test
npm run docs:check
npm run docs:check:workspace
```

## 关联文档

- `ICE3-DOC-IDX-001` — [文档索引](docs/README.md)
- `ICE3-DOC-ARC-001` — [ICE3 家族架构](docs/architecture.md)
