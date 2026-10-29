# ICE3 文档系统实施计划

> Document ID: ICE3-DOC-PLAN-015
>
> Status: Implemented
>
> Owner: ICE3 文档维护者

> **供代理执行者使用：** 必须使用子技能 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans，按任务逐步实施本计划。使用复选框（`- [ ]`）语法跟踪步骤。

**目标：** 为全部七个 ICE3 仓库提供完整、编号、交叉链接且外部读者可理解的文档集。

**架构：** 添加一个零依赖 Markdown 校验器，并将其原样复制到每个仓库。将现有设计记录迁移到公开文档目录，分配永久 IDs，然后根据各仓库的成熟度为它们添加 README、索引、架构文档、决策和用法文档。

**技术栈：** Markdown、Node.js 24.22.1 LTS、Node.js 内置 test runner、Git

**规范：** [ICE3-DOC-SPEC-011](../specs/2026-10-29-documentation-system-design.md)

## 全局约束

- 从包含全部七个同级 `ice3-*` 仓库的 workspace 目录中运行本计划中的命令。
- Public API 名称、命令名称、标识符和代码保持其实现语言及大小写。
- 新增的共享架构、决策、指南和参考文档使用 English 作为权威技术语言。
- 现有中文规范和计划保持中文；其标题可以在相关术语为规范性术语时包含 English 技术术语。
- 每份中文技术规范在其 metadata 部分包含 English 简短摘要，以便读者识别其范围。
- 使用 `ICE3-<AREA>-<TYPE>-<NNN>` 文档 IDs，并且不得重复使用标识符。
- 在单个仓库内使用相对链接。
- 跨仓库链接使用 `https://github.com/ice-3d/ice3-<repository>/blob/main/<path>`。
- 不得包含本地用户路径、凭据、真实客户数据或未经批准的厂商名称。
- 不得为未实现的仓库添加产品声明或用法说明。
- `LICENSE` 文件保持未经修改的 MIT 文本。

## 审查重点

- 移动 `docs/superpowers/*` 不得留下失效的相对链接或过时索引。
- 跨仓库链接必须使用 `ice-3d`，且不得使用本地同级路径。
- 每个 Markdown 文件必须在其仓库索引中恰好出现一次。
- 占位仓库不得暗示不存在的 APIs、命令或架构。
- 重写的 READMEs 必须保持精确的命令、ports、prerequisites 和验证行为不变。

## 初始状态

本计划批准后，在开始任务 1 之前，将已审查的规范与计划合并到
`ice3-doc/main`：

```bash
cd ice3-doc
git switch main
git merge --no-ff --no-edit design/documentation-system
git switch -c docs/foundation
```

---

## 文件结构映射

### 共享文档校验器

- `ice3-doc/scripts/check-docs.mjs`：解析已跟踪的 Markdown，验证 metadata、
  indexes、links、anchors、local paths 和 cross-repository URLs。
- `ice3-doc/scripts/check-docs.test.mjs`：运行有效和无效 fixtures。
- `ice3-doc/scripts/fixtures/docs-valid/`：可通过的 Markdown fixtures。
- `ice3-doc/scripts/fixtures/docs-invalid/`：每个 failure class 一个 fixture。
- `ice3-doc/package.json`：为 documentation repository 公开 `docs:check` 和 `test` scripts。
- 每个已实现的仓库都会收到一份相同的
  `scripts/check-docs.mjs` 副本和一个 `docs:check` package script。

### `ice3-doc`

- `README.md`
- `docs/README.md`
- `docs/architecture.md`
- `docs/decisions/README.md`
- `docs/decisions/0001-universal-engine-and-vertical-applications.md`
- `docs/decisions/0002-offline-open-asset-pipeline.md`
- `docs/decisions/0003-shared-2d-3d-composition.md`
- `docs/decisions/0004-generic-semantic-interfaces.md`
- `docs/contracts/asset-preparation-contract-v1.md`
- `docs/specs/*.md`
- `docs/plans/*.md`

### `ice3-engine`

- `README.md`
- `docs/README.md`
- `docs/architecture.md`
- `docs/guides/getting-started.md`
- `docs/guides/asset-loading.md`
- `docs/guides/development-and-troubleshooting.md`
- `docs/decisions/README.md`
- `docs/decisions/0001-public-facade-and-package-boundaries.md`
- `docs/decisions/0002-geometry-first-industrial-rendering.md`
- `docs/decisions/0003-camera-driven-tileset-and-lod.md`
- `docs/reference/diagnostics.md`
- `docs/api/m0.md`
- `docs/api/m1.md`
- `docs/specs/*.md`
- `docs/plans/*.md`

### `ice3-toolchain`

- `README.md`
- `docs/README.md`
- `docs/architecture.md`
- `docs/guides/build-validate-partition.md`
- `docs/guides/large-model-performance.md`
- `docs/reference/cli.md`
- `docs/decisions/README.md`
- `docs/decisions/0001-offline-standard-output.md`
- `docs/decisions/0002-deterministic-atomic-publication.md`
- `docs/decisions/0003-content-addressed-generation-cache.md`
- `tests/fixtures/3d-tiles-1.1-schema/SOURCE.md`
- `THIRD_PARTY_NOTICES.md`
- `docs/plans/*.md`

### `ice3-industrial`

- `README.md`
- `docs/README.md`
- `docs/architecture.md`
- `docs/guides/getting-started.md`
- `docs/reference/api.md`
- `docs/decisions/README.md`
- `docs/decisions/0001-zero-runtime-dependencies.md`
- `docs/decisions/0002-manifest-state-separation.md`
- `docs/decisions/0003-stable-identity-model.md`

### `ice3-agent-console`

- `README.md`
- `docs/README.md`
- `docs/architecture.md`
- `docs/guides/local-development.md`
- `docs/guides/static-deployment.md`
- `docs/guides/real-model-server.md`
- `docs/reference/protocol.md`
- `docs/decisions/README.md`
- `docs/decisions/0001-agent-scene-boundary.md`
- `docs/decisions/0002-scripted-and-real-model-transport.md`
- `docs/specs/*.md`
- `docs/plans/*.md`

### 占位仓库

- `ice3-studio/README.md`
- `ice3-water-demo/README.md`

---

### 任务 1：文档校验器

**文件：**
- 创建：`ice3-doc/package.json`
- 创建：`ice3-doc/scripts/check-docs.mjs`
- 创建：`ice3-doc/scripts/check-docs.test.mjs`
- 创建：`ice3-doc/scripts/fixtures/docs-valid/README.md`
- 创建：`ice3-doc/scripts/fixtures/docs-invalid/README.md`

**接口：**
- 消费：Git 跟踪的 Markdown 文件以及可选同级仓库。
- 产生：`node scripts/check-docs.mjs [--workspace-root <path>] [--json]`，
  仅当所有文档检查通过时才以 `0` 退出。

- [x] **步骤 1：编写失败的 Metadata 测试**

```js
test('accepts one titled document with valid metadata', async () => {
  const report = await checkRepository(validFixtureRoot);
  assert.deepEqual(report.errors, []);
});

test('rejects duplicate IDs and missing metadata', async () => {
  const report = await checkRepository(invalidFixtureRoot);
  assert.match(report.errors.join('\n'), /missing Document ID/);
  assert.match(report.errors.join('\n'), /duplicate Document ID/);
});
```

- [x] **步骤 2：运行测试并验证其失败**

```bash
cd ice3-doc
node --test scripts/check-docs.test.mjs
```

预期：FAIL，因为 `checkRepository` 尚不存在。

- [x] **步骤 3：实现零依赖 Validator**

使用能识别 fenced blocks 的 Markdown 解析，使示例 headings 和 links
不计为文档结构。导出 `checkRepository(root, options)` 和 CLI
entry point。验证：

```text
^# .+$
^> Document ID: ICE3-(AGENT|DOC|ENG|IND|STUDIO|TOOL|WATER)-
  (RM|IDX|ARC|ADR|GUIDE|API|SPEC|PLAN|POL|CTR|REF|NOTICE)-[0-9]{3}$
^> Status: (Draft|Approved|Active|Implemented|Historical|Deprecated|Placeholder)$
^> Owner: .+$

```

相对于包含链接的文档解析其相对链接。通过转小写、移除标点并将空格替换为连字符，
计算 GitHub heading anchors。
仅接受以 `https://github.com/ice-3d/ice3-` 开头的跨仓库链接。

- [x] **步骤 4：为每条必需规则添加一个失败 Fixture**

Fixtures 覆盖缺失 IDs、重复 IDs、不受支持的 statuses、缺失
indexes、失效相对文件、失效 anchors、本地绝对路径、格式错误的
cross-repository URLs，以及包含 shell 命令或 API
declarations 的 placeholder claims。

- [x] **步骤 5：运行 Validator 测试**

```bash
cd ice3-doc
node --test scripts/check-docs.test.mjs
```

预期：PASS，每个 failure class 一个测试。

- [x] **步骤 6：添加 Package Scripts**

```json
{
  "private": true,
  "license": "MIT",
  "engines": {
    "node": "^24.0.0 || >=26.0.0"
  },
  "scripts": {
    "docs:check": "node scripts/check-docs.mjs",
    "docs:check:workspace": "node scripts/check-docs.mjs --workspace-root ..",
    "test": "node --test scripts/check-docs.test.mjs"
  }
}
```

- [x] **步骤 7：提交**

```bash
cd ice3-doc
git switch -c docs/foundation
git add package.json scripts
git commit -m "docs: add documentation validator"
```

### 任务 2：迁移共享文档并分配 IDs

**文件：**
- 移动：`ice3-doc/docs/superpowers/specs/*.md` 到 `ice3-doc/docs/specs/*.md`
- 移动：`ice3-doc/docs/superpowers/plans/*.md` 到 `ice3-doc/docs/plans/*.md`
- 修改：所有已移动的 Markdown 文件
- 修改：`ice3-doc/docs/contracts/asset-preparation-contract-v1.md`
- 创建：`ice3-doc/docs/README.md`

**接口：**
- 消费：任务 1 validator。
- 产生：具有稳定 IDs 且不含 `docs/superpowers` 目录的扁平公开文档布局。

- [x] **步骤 1：在不更改内容的情况下移动目录**

```bash
cd ice3-doc
git mv docs/superpowers/specs docs/specs
git mv docs/superpowers/plans docs/plans
```

- [x] **步骤 2：添加规范 Metadata**

使用以下映射：

| ID | 文件 |
|---|---|
| `ICE3-DOC-SPEC-001` | `2026-10-27-adaptive-industrial-lod-design.md` |
| `ICE3-DOC-SPEC-002` | `2026-10-27-adaptive-tileset-scheduler-design.md` |
| `ICE3-DOC-SPEC-003` | `2026-10-27-hierarchical-lod-design.md` |
| `ICE3-DOC-SPEC-004` | `2026-10-27-industrial-render-batching-design.md` |
| `ICE3-DOC-SPEC-005` | `2026-10-27-lod-refinement-and-scene-api-design.md` |
| `ICE3-DOC-SPEC-006` | `2026-10-27-semantic-industrial-proxy-design.md` |
| `ICE3-DOC-SPEC-007` | `2026-10-27-spatial-tileset-pipeline-design.md` |
| `ICE3-DOC-SPEC-008` | `2026-10-28-credible-wastewater-blender-pipeline-design.md` |
| `ICE3-DOC-SPEC-009` | `2026-10-28-industrial-semantic-layer-design.md` |
| `ICE3-DOC-SPEC-010` | `2026-10-28-synthetic-wastewater-plant-asset-design.md` |
| `ICE3-DOC-SPEC-011` | `2026-10-29-documentation-system-design.md` |

将现有已实现的规范设置为 `Implemented`。在实施计划完成之前，将文档
系统规范保持为 `Approved`。
在每份中文规范的 metadata block 正下方添加一行 `English summary:`；
该摘要为一句描述已实现范围的英文。

- [x] **步骤 3：添加计划 Metadata**

使用以下映射：

| ID | 文件 |
|---|---|
| `ICE3-DOC-PLAN-001` | `2026-10-27-adaptive-industrial-lod.md` |
| `ICE3-DOC-PLAN-002` | `2026-10-27-adaptive-render-batching-workers.md` |
| `ICE3-DOC-PLAN-003` | `2026-10-27-adaptive-tileset-scheduler.md` |
| `ICE3-DOC-PLAN-004` | `2026-10-27-asset-preparation-contract.md` |
| `ICE3-DOC-PLAN-005` | `2026-10-27-hierarchical-lod-assets.md` |
| `ICE3-DOC-PLAN-006` | `2026-10-27-hierarchical-lod-runtime.md` |
| `ICE3-DOC-PLAN-007` | `2026-10-27-lod-refinement.md` |
| `ICE3-DOC-PLAN-008` | `2026-10-27-scene-query-api.md` |
| `ICE3-DOC-PLAN-009` | `2026-10-27-semantic-industrial-proxies.md` |
| `ICE3-DOC-PLAN-010` | `2026-10-27-spatial-tileset-pipeline.md` |
| `ICE3-DOC-PLAN-011` | `2026-10-27-static-render-batching.md` |
| `ICE3-DOC-PLAN-012` | `2026-10-28-credible-wastewater-blender-pipeline.md` |
| `ICE3-DOC-PLAN-013` | `2026-10-28-industrial-semantic-core.md` |
| `ICE3-DOC-PLAN-014` | `2026-10-28-synthetic-wastewater-plant-asset.md` |
| `ICE3-DOC-PLAN-015` | `2026-10-29-documentation-system.md` |

将已完成的计划设置为 `Implemented`。在所有任务和最终验证完成之前，
将此文档计划保持为 `Draft`。

- [x] **步骤 4：添加 Contract Metadata**

在现有 H1 之后立即添加以下内容：

```md
> Document ID: ICE3-DOC-CTR-001
>
> Status: Active
>
> Owner: ICE3 architecture maintainers
```

- [x] **步骤 5：修复已移动文档的链接**

```bash
cd ice3-doc
rg -n 'docs/superpowers|\.\./\.\./superpowers' docs README.md
```

修复后预期：无输出。

- [x] **步骤 6：创建初始完整 Index 和 README Metadata**

将 `ICE3-DOC-RM-001` 添加到 `README.md`，并创建 `docs/README.md`，
其中包含 `ICE3-DOC-IDX-001`。初始 index 在每个文档的
ownership section 下列出所有已移动文档各一次。任务 3 扩展导航正文并添加新文档。

- [x] **步骤 7：运行聚焦验证**

```bash
cd ice3-doc
node scripts/check-docs.mjs
```

预期：metadata、index completeness 和 file links 检查均 PASS。

- [x] **步骤 8：提交**

```bash
cd ice3-doc
git add README.md docs
git commit -m "docs: assign shared document identifiers"
```

### 任务 3：共享导航、架构和决策

**文件：**
- 修改：`ice3-doc/README.md`
- 修改：`ice3-doc/docs/README.md`
- 创建：`ice3-doc/docs/architecture.md`
- 创建：`ice3-doc/docs/decisions/README.md`
- 创建：上列四个 `ice3-doc/docs/decisions/NNNN-*.md` 文件

**接口：**
- 消费：任务 2 中的所有 IDs。
- 产生：`ICE3-DOC-RM-001`、`ICE3-DOC-IDX-001`、`ICE3-DOC-ARC-001` 以及
  `ICE3-DOC-IDX-002`、`ICE3-DOC-ADR-001..004`。

- [x] **步骤 1：编写 Family Index**

该 index 按 ID 在以下分组下组织链接：

```text
Start Here
Architecture
Decisions
Contracts
Specifications
Implementation Plans
```

每行使用 `ID | Title | Status | Purpose`。

- [x] **步骤 2：编写 Family Architecture**

记录七个仓库的职责、允许的依赖方向、从 source model 到 runtime tiles 的
asset 生命周期、2D/3D composition boundary、industrial semantic boundary
以及 Agent integration boundary。

- [x] **步骤 3：编写四项共享决策**

每个 ADR 记录所选决策和被拒绝的替代方案：

- 通用 Engine 与垂直应用：避免将可复用 engine
  capabilities 耦合到单一行业。
- 离线开放 Asset Pipeline：在浏览器之外预处理，并发布
  标准 GLB/Tileset 表示。
- 共享 2D/3D Composition：对两个维度使用同一套 engine-owned input 和 layer model。
- 通用语义 Interfaces：公开可供人、工具和
  Agents 使用的 interfaces，且不引入 AI-specific engine concepts。

- [x] **步骤 4：重写根 README**

直接链接到 index、architecture、decisions、权威 contract 以及
其他六个 repository READMEs。包含 AI disclosure 和 MIT license。

- [x] **步骤 5：运行验证**

```bash
cd ice3-doc
node scripts/check-docs.mjs
node scripts/check-docs.mjs --workspace-root ..
```

预期：两个命令均 PASS。

- [x] **步骤 6：提交**

```bash
cd ice3-doc
git add README.md docs package.json scripts
git commit -m "docs: add ICE3 documentation portal"
```

### 任务 4：迁移 Engine 文档

**文件：**
- 移动：`ice3-engine/docs/superpowers/specs/*.md` 到 `ice3-engine/docs/specs/*.md`
- 移动：`ice3-engine/docs/superpowers/plans/*.md` 到 `ice3-engine/docs/plans/*.md`
- 修改：`ice3-engine/AGENTS.md`
- 修改：`ice3-engine/docs/api/m0.md`
- 修改：`ice3-engine/docs/api/m1.md`
- 修改：`ice3-engine/docs/diagnostics.md`
- 修改：`ice3-engine/README.md`
- 创建：`ice3-engine/docs/README.md`

**接口：**
- 消费：来自任务 1 的 validator。
- 产生：engine 文档 IDs 和公开目录布局。

- [x] **步骤 1：移动 Specification 和 Plan 目录**

```bash
cd ice3-engine
git switch -c docs/complete
git mv docs/superpowers/specs docs/specs
git mv docs/superpowers/plans docs/plans
```

- [x] **步骤 2：分配 IDs**

| ID | 文件 |
|---|---|
| `ICE3-ENG-POL-001` | `AGENTS.md` |
| `ICE3-ENG-API-001` | `docs/api/m0.md` |
| `ICE3-ENG-API-002` | `docs/api/m1.md` |
| `ICE3-ENG-REF-001` | `docs/diagnostics.md` |
| `ICE3-ENG-SPEC-001` | `docs/specs/2026-10-27-engine-m0-design.md` |
| `ICE3-ENG-SPEC-002` | `docs/specs/2026-10-27-engine-m1-asset-design.md` |
| `ICE3-ENG-SPEC-003` | `docs/specs/2026-10-27-equipment-selection-design.md` |
| `ICE3-ENG-PLAN-001` | `docs/plans/2026-10-27-engine-m0.md` |
| `ICE3-ENG-PLAN-002` | `docs/plans/2026-10-27-engine-m1-asset-runtime.md` |
| `ICE3-ENG-PLAN-003` | `docs/plans/2026-10-27-equipment-selection.md` |

- [x] **步骤 3：添加初始 README 和文档 Index Metadata**

将 `ICE3-ENG-RM-001` 添加到现有 README，并将 `ICE3-ENG-IDX-001` 添加到新的
索引；该索引列出每个已迁移的 API、参考、规范、计划和策略
文档。任务 5 扩展这些内容。

- [x] **步骤 4：重写已移动链接并验证**

```bash
cd ice3-engine
rg -n 'docs/superpowers|\.\./\.\./superpowers' README.md docs
```

修复后预期：无输出。

- [x] **步骤 5：运行聚焦验证**

```bash
cd ice3-engine
node scripts/check-docs.mjs
```

预期：PASS。

- [x] **步骤 6：提交**

```bash
cd ice3-engine
git add AGENTS.md README.md docs
git commit -m "docs: assign engine document identifiers"
```

### 任务 5：Engine README、架构、指南和决策

**文件：**
- 修改：`ice3-engine/README.md`
- 修改：`ice3-engine/docs/README.md`
- 创建：`ice3-engine/docs/architecture.md`
- 创建：上列三个 `ice3-engine/docs/guides/*.md` 文件
- 创建：`ice3-engine/docs/decisions/README.md`
- 创建：上列三个 `ice3-engine/docs/decisions/NNNN-*.md` 文件
- 修改：`ice3-engine/package.json`

**接口：**
- 消费：`docs/api/m0.md`、`docs/api/m1.md` 和 `docs/diagnostics.md`
  中记录的确切 export 名称和行为。
- 产生：`ICE3-ENG-RM-001`、`ICE3-ENG-IDX-001`、`ICE3-ENG-ARC-001`、
  `ICE3-ENG-IDX-002`、`ICE3-ENG-GUIDE-001..003` 以及
  `ICE3-ENG-ADR-001..003`。

- [x] **步骤 1：重写 README**

保持当前命令和 ports 不变。添加仅使用 public `ice3` package 的
五分钟示例、能力表、明确的 M0/M1 边界、
Asset 策略摘要、验证命令和完整文档映射。

- [x] **步骤 2：编写架构和 ADRs**

Architecture 必须标识 `@ice3/core`、`@ice3/assets`、`@ice3/renderer`、
`@ice3/runtime` 和 `ice3`，并解释从 Prepared GLB 到 scene、
GPU upload、selection、Tileset scheduling、LOD 和 disposal 的数据流。

三个 ADR 必须记录：

- public facade 和依赖边界；
- 采用 geometry-first industrial rendering，并支持 basic material 和 light；
- 由 camera 驱动的 Tileset/LOD 行为和稳定的选择标识。

- [x] **步骤 3：编写三个指南**

每个指南都包含前置条件、可运行命令、预期输出、常见
故障，以及指向其精确 API/reference IDs 的链接。

- [x] **步骤 4：添加 Validator 和 Verification Script**

将 `ice3-doc/scripts/check-docs.mjs` 原样复制到
`ice3-engine/scripts/check-docs.mjs`，然后添加：

```json
"docs:check": "node scripts/check-docs.mjs"
```

修改现有 verification script，使其以 documentation gate 开始：

```json
"verify": "npm run docs:check && npm run test:architecture && npm run typecheck && npm run typecheck:example && npm test && npm run test:e2e"
```

- [x] **步骤 5：运行文档和仓库验证**

```bash
cd ice3-engine
npm run docs:check
npm run verify
```

预期：两个命令均 PASS。

- [x] **步骤 6：提交**

```bash
cd ice3-engine
git add README.md docs package.json scripts/check-docs.mjs
git commit -m "docs: complete engine developer documentation"
```

### 任务 6：Toolchain 文档迁移

**文件：**
- 移动：`ice3-toolchain/docs/superpowers/plans/*.md` 到
  `ice3-toolchain/docs/plans/*.md`
- 修改：`ice3-toolchain/AGENTS.md`
- 修改：`ice3-toolchain/THIRD_PARTY_NOTICES.md`
- 修改：`ice3-toolchain/tests/fixtures/3d-tiles-1.1-schema/SOURCE.md`
- 修改：`ice3-toolchain/README.md`
- 创建：`ice3-toolchain/docs/README.md`

**接口：**
- 消费：来自任务 1 的 validator。
- 产生：`ICE3-TOOL-POL-001`、`ICE3-TOOL-NOTICE-001`、
  `ICE3-TOOL-REF-002` 和 `ICE3-TOOL-PLAN-001`。

- [x] **步骤 1：移动并分配 Metadata**

```bash
cd ice3-toolchain
git switch -c docs/complete
git mv docs/superpowers/plans docs/plans
```

添加 metadata：

| ID | 文件 |
|---|---|
| `ICE3-TOOL-PLAN-001` | `docs/plans/2026-10-27-toolchain-m1-glb-pipeline.md` |
| `ICE3-TOOL-POL-001` | `AGENTS.md` |
| `ICE3-TOOL-NOTICE-001` | `THIRD_PARTY_NOTICES.md` |
| `ICE3-TOOL-REF-002` | `tests/fixtures/3d-tiles-1.1-schema/SOURCE.md` |

- [x] **步骤 2：添加初始 README 和文档 Index Metadata**

将 `ICE3-TOOL-RM-001` 添加到现有 README，并将 `ICE3-TOOL-IDX-001` 添加到新的
index；该 index 列出 policy、notice、fixture source 和已迁移 plan。任务 7
扩展这些内容。

- [x] **步骤 3：修复已移动链接**

```bash
cd ice3-toolchain
rg -n 'docs/superpowers|\.\./\.\./superpowers' README.md docs tests
```

修复后预期：无输出。

- [x] **步骤 4：运行聚焦验证**

```bash
cd ice3-toolchain
node scripts/check-docs.mjs
```

预期：PASS。

- [x] **步骤 5：提交**

```bash
cd ice3-toolchain
git add AGENTS.md README.md THIRD_PARTY_NOTICES.md docs tests/fixtures
git commit -m "docs: assign toolchain document identifiers"
```

### 任务 7：Toolchain README、架构、指南和决策

**文件：**
- 修改：`ice3-toolchain/README.md`
- 修改：`ice3-toolchain/docs/README.md`
- 创建：`ice3-toolchain/docs/architecture.md`
- 创建：上列两个 `ice3-toolchain/docs/guides/*.md` 文件
- 创建：`ice3-toolchain/docs/reference/cli.md`
- 创建：`ice3-toolchain/docs/decisions/README.md`
- 创建：上列三个 `ice3-toolchain/docs/decisions/NNNN-*.md` 文件
- 修改：`ice3-toolchain/package.json`

**接口：**
- 消费：当前 README 示例和 `packages/cli/src/commands.ts`。
- 产生：`ICE3-TOOL-RM-001`、`ICE3-TOOL-IDX-001`、
  `ICE3-TOOL-IDX-002`、`ICE3-TOOL-ARC-001`、`ICE3-TOOL-GUIDE-001..002`、
  `ICE3-TOOL-REF-001` 和 `ICE3-TOOL-ADR-001..003`。

- [x] **步骤 1：重写 README**

保持少于 180 行。README 包含用途、要求、快速开始、
四个主要命令、asset-safety 规则、验证、文档映射、
AI disclosure 和 license。将详尽的 option 和 format 内容移至
参考文档。

- [x] **步骤 2：编写架构和指南**

Architecture 描述 source adapter、normalization、prepared profile、
partitioning、LOD、semantic proxies、static batching、atomic publication 和
cache。指南覆盖精确的 build/validate/partition 工作流以及测得的
large-model 缓存/性能行为。

- [x] **步骤 3：编写 CLI 参考**

列出 `parseArguments` 支持的每个 option，包括默认值、
约束和失败行为。包含一个完整的 large-model command 和
一个 validation command。

- [x] **步骤 4：编写三个 ADRs**

记录 offline standard output、deterministic atomic publication，以及
带 invalidation inputs 的 content-addressed Blender source cache。

- [x] **步骤 5：运行文档和仓库验证**

将 `ice3-doc/scripts/check-docs.mjs` 原样复制到
`ice3-toolchain/scripts/check-docs.mjs`。添加并接入 package scripts：

```json
"docs:check": "node scripts/check-docs.mjs",
"verify": "npm run docs:check && npm run test:architecture && npm run typecheck && npm run typecheck:tools && npm test"
```

```bash
cd ice3-toolchain
npm run docs:check
npm run verify
```

预期：两个命令均 PASS。

- [x] **步骤 6：提交**

```bash
cd ice3-toolchain
git add README.md docs tests/fixtures/3d-tiles-1.1-schema/SOURCE.md
git add package.json scripts/check-docs.mjs
git commit -m "docs: complete toolchain developer documentation"
```

### 任务 8：工业语义文档

**文件：**
- 修改：`ice3-industrial/README.md`
- 创建：`ice3-industrial/docs/README.md`
- 创建：`ice3-industrial/docs/architecture.md`
- 创建：`ice3-industrial/docs/guides/getting-started.md`
- 创建：`ice3-industrial/docs/reference/api.md`
- 创建：`ice3-industrial/docs/decisions/README.md`
- 创建：上列三个 `ice3-industrial/docs/decisions/NNNN-*.md` 文件
- 复制：`ice3-doc/scripts/check-docs.mjs` 到
  `ice3-industrial/scripts/check-docs.mjs`
- 修改：`ice3-industrial/package.json`

**接口：**
- 消费：来自 `packages/industrial-core/src/index.ts` 的 exported symbols
  以及现有 README 示例。
- 产生：`ICE3-IND-RM-001`、`ICE3-IND-IDX-001`、`ICE3-IND-ARC-001`、
  `ICE3-IND-IDX-002`、`ICE3-IND-GUIDE-001`、`ICE3-IND-API-001` 以及
  `ICE3-IND-ADR-001..003`。

- [x] **步骤 1：检查 Public Exports**

```bash
cd ice3-industrial
rg -n '^export ' packages/industrial-core/src
```

使用输出确保 reference 记录每个 public export，且不记录任何
private source path。

- [x] **步骤 2：编写架构和 ADRs**

记录 manifest parser、registries、relation graph、state store、query
engine、context、event stream、operation registry、adapters 和 workspace
composition。记录 zero dependencies、static/runtime separation 和 stable
identity decisions。

- [x] **步骤 3：编写入门指南和 API 参考**

保留当前 manifest example，然后将 state updates、queries、relation
traversal、context changes、serialization 和错误行为作为独立的
copyable examples 添加。

- [x] **步骤 4：运行文档和仓库验证**

添加 validator，并将其接入 verification：

```json
"docs:check": "node scripts/check-docs.mjs",
"verify": "npm run docs:check && npm run test:architecture && npm run typecheck && npm test"
```

```bash
cd ice3-industrial
npm run docs:check
npm run verify
```

预期：两个命令均 PASS。

- [x] **步骤 5：提交**

```bash
cd ice3-industrial
git add README.md docs package.json scripts/check-docs.mjs
git commit -m "docs: complete industrial developer documentation"
```

### 任务 9：Agent Console 文档迁移

**文件：**
- 移动：`ice3-agent-console/docs/superpowers/specs/*.md` 到
  `ice3-agent-console/docs/specs/*.md`
- 移动：`ice3-agent-console/docs/superpowers/plans/*.md` 到
  `ice3-agent-console/docs/plans/*.md`
- 修改：`ice3-agent-console/AGENTS.md`
- 修改：`ice3-agent-console/README.md`
- 创建：`ice3-agent-console/docs/README.md`

**接口：**
- 消费：来自任务 1 的 validator。
- 产生：`ICE3-AGENT-POL-001`、`ICE3-AGENT-SPEC-001` 和
  `ICE3-AGENT-PLAN-001`。

- [x] **步骤 1：移动并分配 Metadata**

```bash
cd ice3-agent-console
git switch -c docs/complete
git mv docs/superpowers/specs docs/specs
git mv docs/superpowers/plans docs/plans
```

| ID | 文件 |
|---|---|
| `ICE3-AGENT-POL-001` | `AGENTS.md` |
| `ICE3-AGENT-SPEC-001` | `docs/specs/2026-10-28-ice3-agent-console-design.md` |
| `ICE3-AGENT-PLAN-001` | `docs/plans/2026-10-28-ice3-agent-console.md` |

- [x] **步骤 2：添加初始 README 和文档 Index Metadata**

将 `ICE3-AGENT-RM-001` 添加到现有 README，并将 `ICE3-AGENT-IDX-001` 添加到新的
index；该 index 列出 policy、specification 和 plan。任务 10 扩展这些
内容。

- [x] **步骤 3：修复已移动链接**

```bash
cd ice3-agent-console
rg -n 'docs/superpowers|\.\./\.\./superpowers' README.md docs
```

修复后预期：无输出。

- [x] **步骤 4：运行聚焦验证**

```bash
cd ice3-agent-console
node scripts/check-docs.mjs
```

预期：PASS。

- [x] **步骤 5：提交**

```bash
cd ice3-agent-console
git add AGENTS.md README.md docs
git commit -m "docs: assign agent console document identifiers"
```

### 任务 10：Agent Console README、架构、指南和决策

**文件：**
- 修改：`ice3-agent-console/README.md`
- 修改：`ice3-agent-console/docs/README.md`
- 创建：`ice3-agent-console/docs/architecture.md`
- 创建：上列三个 `ice3-agent-console/docs/guides/*.md` 文件
- 创建：`ice3-agent-console/docs/reference/protocol.md`
- 创建：`ice3-agent-console/docs/decisions/README.md`
- 创建：上列两个 `ice3-agent-console/docs/decisions/NNNN-*.md` 文件
- 修改：`ice3-agent-console/package.json`

**接口：**
- 消费：`shared/`、`server/`、`src/protocol/` 和当前 README 行为。
- 产生：`ICE3-AGENT-RM-001`、`ICE3-AGENT-IDX-001`、
  `ICE3-AGENT-IDX-002`、`ICE3-AGENT-ARC-001`、`ICE3-AGENT-GUIDE-001..003`、
  `ICE3-AGENT-REF-001` 和 `ICE3-AGENT-ADR-001..002`。

- [x] **步骤 1：重写 README**

保持当前 ports 和 build modes 不变。添加能力/边界表、
五分钟 scripted mode、static build instructions、real-model configuration、
六个 scene tools、验证和文档映射。

- [x] **步骤 2：编写架构和 ADRs**

解释 event stream、shared protocol、scene controller、click 和
selection flow、autoplay cancellation、server/client transport split 以及 static
demo marker。记录 Agent/scene boundary，以及明确的 scripted 与
configured-model failure policy。

- [x] **步骤 3：编写指南和 Protocol 参考**

protocol reference 列出每个 event 和每个 scene tool，包括 payload
shape 和失败行为。指南覆盖本地开发、静态部署
以及 real-model configuration，且不得暴露 credentials。

- [x] **步骤 4：运行文档和仓库验证**

将 `ice3-doc/scripts/check-docs.mjs` 原样复制到
`ice3-agent-console/scripts/check-docs.mjs`。添加并接入 package scripts：

```json
"docs:check": "node scripts/check-docs.mjs",
"verify": "npm run docs:check && npm run typecheck && npm test && npm run build"
```

```bash
cd ice3-agent-console
npm run docs:check
npm run verify
```

预期：两个命令均 PASS。

- [x] **步骤 5：提交**

```bash
cd ice3-agent-console
git add README.md docs package.json scripts/check-docs.mjs
git commit -m "docs: complete agent console developer documentation"
```

### 任务 11：占位仓库

**文件：**
- 修改：`ice3-studio/README.md`
- 修改：`ice3-water-demo/README.md`

**接口：**
- 消费：来自 `ICE3-DOC-SPEC-011` 的 placeholder status rules。
- 产生：`ICE3-STUDIO-RM-001` 和 `ICE3-WATER-RM-001`。

- [x] **步骤 1：编写 Studio Placeholder**

README 仅包含标题、metadata、一句仓库用途说明、
明确说明尚不存在 public API、命令或架构的语句、
AI disclosure 以及 MIT license。

- [x] **步骤 2：编写 Water Demo Placeholder**

使用相同结构，并将演示目的设为 water-industry。不得添加
安装步骤、命令、APIs 或架构声明。

- [x] **步骤 3：验证独立 Placeholder 规则**

```bash
for repository in ice3-studio ice3-water-demo; do
  node ice3-doc/scripts/check-docs.mjs --root "$repository"
done
```

预期：两个命令均 PASS，并且仅报告兼容 placeholder 的文档。

- [x] **步骤 4：提交每个仓库**

```bash
cd ice3-studio
git switch -c docs/placeholder
git add README.md
git commit -m "docs: add Studio placeholder"

cd ../ice3-water-demo
git switch -c docs/placeholder
git add README.md
git commit -m "docs: add water demo placeholder"
```

### 任务 12：跨仓库导航和发布门禁

**文件：**
- 如果跨仓库 target IDs 发生变化，则修改 `ice3-doc/docs/README.md`
- 修改每个仓库 README 的文档映射

**接口：**
- 消费：所有先前任务。
- 产生：通过的家族级文档与代码发布门禁。

- [x] **步骤 1：验证复制的 Validators 完全相同**

```bash
shasum -a 256 \
  ice3-doc/scripts/check-docs.mjs \
  ice3-engine/scripts/check-docs.mjs \
  ice3-industrial/scripts/check-docs.mjs \
  ice3-toolchain/scripts/check-docs.mjs \
  ice3-agent-console/scripts/check-docs.mjs
```

预期：全部五个 hashes 相同。

- [x] **步骤 2：验证完整 Cross-Repository Catalog**

```bash
cd ice3-doc
npm run docs:check:workspace
```

预期：PASS，每个 owned Markdown 文件都恰好被索引一次。

- [x] **步骤 3：验证没有残留的过时内部目录**

```bash
find ice3-agent-console ice3-doc ice3-engine ice3-toolchain \
  -type d -name superpowers -print
rg -n '\]\([^)]*docs/superpowers' ice3-agent-console ice3-doc ice3-engine \
  ice3-toolchain -g '*.md' -g '!node_modules/**' -g '!dist/**'
```

预期：无输出。

- [x] **步骤 4：验证不存在 Local Paths**

```bash
rg -n '/Users/[A-Za-z0-9._-]+/|/home/[A-Za-z0-9._-]+/|[A-Za-z]:\\Users\\' \
  ice3-agent-console ice3-doc ice3-engine ice3-industrial ice3-studio \
  ice3-toolchain ice3-water-demo -g '*.md' -g '!node_modules/**' -g '!dist/**'
```

预期：无输出。

- [x] **步骤 5：运行所有已实现仓库的验证**

```bash
cd ice3-agent-console && npm run verify
cd ../ice3-engine && npm run verify
cd ../ice3-industrial && npm run verify
cd ../ice3-toolchain && npm run verify
```

预期：所有命令均退出 `0`。

- [x] **步骤 6：手动遍历 Navigation Graph**

从每个 README 出发，沿其 index 访问：

1. Architecture。
2. 一个 ADR。
3. 一个用法指南。
4. 相关 API 或 reference。
5. 相关的权威 `ice3-doc` contract。
6. 返回 repository index。

记录每个失效或误导性的跳转，并在提交前修复。

- [x] **步骤 7：将 Specification 和 Plan 标记为 Implemented**

仅当所有先前步骤通过后，才将 `ICE3-DOC-SPEC-011` 和 `ICE3-DOC-PLAN-015`
从 `Approved`/`Draft` 更改为 `Implemented`。

- [x] **步骤 8：提交并合并每个仓库**

```bash
cd ice3-doc
git add README.md docs package.json scripts
git commit -m "docs: complete ICE3 documentation system"
git switch main
git merge --no-ff --no-edit docs/foundation

cd ../ice3-engine
git add README.md docs package.json scripts/check-docs.mjs
git commit -m "docs: finalize engine documentation system"
git switch main
git merge --no-ff --no-edit docs/complete

cd ../ice3-toolchain
git add README.md docs package.json scripts/check-docs.mjs
git commit -m "docs: finalize toolchain documentation system"
git switch main
git merge --no-ff --no-edit docs/complete

cd ../ice3-industrial
git add README.md docs package.json scripts/check-docs.mjs
git commit -m "docs: finalize industrial documentation system"
git switch main
git merge --no-ff --no-edit docs/complete

cd ../ice3-agent-console
git add README.md docs package.json scripts/check-docs.mjs
git commit -m "docs: finalize agent console documentation system"
git switch main
git merge --no-ff --no-edit docs/complete

cd ../ice3-studio
git switch main
git merge --no-ff --no-edit docs/placeholder

cd ../ice3-water-demo
git switch main
git merge --no-ff --no-edit docs/placeholder
```

## 相关文档

- `ICE3-DOC-IDX-001` — [文档索引](../README.md)
- `ICE3-DOC-SPEC-011` — [文档系统规范](../specs/2026-10-29-documentation-system-design.md)
