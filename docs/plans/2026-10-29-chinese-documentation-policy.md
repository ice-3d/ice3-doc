# ICE3 全中文文档改版实施计划

> Document ID: ICE3-DOC-PLAN-016
>
> Status: Draft
>
> Owner: ICE3 documentation maintainers
>
> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**目标：** 将 7 个 ICE3 工程中除法律文本和测试夹具外的全部 Markdown 改为中文叙述，同时保留技术词汇、API、命令和稳定标识的原样写法，并增加长期有效的自动检查。

**架构：** 在 `ice3-doc` 中先实现独立的中文叙述分析器、技术词表和语言规则；迁移按入口文档、当前实现文档、历史文档三批执行。每批先在同一仓库形成小而完整的提交，再跨仓库汇总验证；最后启用默认语言门禁并合入各仓库 `main`。

**技术栈：** Node.js 24.22.1 LTS、原生 Node test runner、ESM、Markdown、Git、Playwright（仅用于受文档改动影响工程的既有验证）。

**规格：** [ICE3 全中文文档改版设计规格](../specs/2026-10-29-chinese-documentation-policy-design.md)

## 全局约束

- 只修改 Markdown 叙述，不修改代码行为、API、schema、Document ID、文件名或公开 URL。
- 技术词保留英文原词和大小写，不强制添加中文括注。
- 代码块、inline code、命令、JSON、YAML、路径、URL、错误码和协议字符串保持原样。
- `THIRD_PARTY_NOTICES.md`、测试中的 `SOURCE.md` 和 `scripts/fixtures/**/*.md` 不要求中文。
- 各工程使用 `docs/chinese-localization` 功能分支，验证通过后再合入 `main`。
- 每批使用独立提交，提交作者与提交者名称必须为 `damoqiongqiu`。
- 禁止机械翻译后直接提交；每份文档都要按工程语境人工改写。
- 翻译标题时必须同步修复内部和跨仓库 anchor。

## 重点审查

- `Scene and Selection` 这类纯英文标题会被误当作合法技术词，检查器必须识别并报错。
- 技术字段表可能整表使用英文但仍是有效内容，检查器不能误报表格中的纯技术值。
- `THIRD_PARTY_NOTICES.md` 与 `SOURCE.md` 若被误改，会产生法律或来源追溯风险。
- 翻译标题后 cross-repository URL 中的 anchor 最容易失效。
- 历史 Spec 和 Plan 的 Status、日期、预算、错误码与验收条件最容易被“顺句”改坏。

---

## Task 1：实现中文叙述分析器

**文件：**

- 新建：`ice3-doc/scripts/chinese-language.mjs`
- 新建：`ice3-doc/scripts/check-language-files.mjs`
- 修改：`ice3-doc/scripts/check-docs.test.mjs`
- 修改：`ice3-doc/scripts/check-docs.mjs`

**接口：**

- 产出：`findLanguageViolations(source: string, relativePath: string): LanguageViolation[]`
- `LanguageViolation` 的形状为 `{ code: string, line: number, message: string }`
- `checkRepository(root, { language: true })` 将语言诊断追加到现有 `errors`
- 默认 `language` 为 `false`，迁移完成后由任务 7 改为 `true`
- 产出：`node scripts/check-language-files.mjs --root <仓库> <文件或目录...>`，只检查明确给出的迁移范围

- [ ] **步骤 1：为分析器写失败测试**

在 `scripts/check-docs.test.mjs` 中添加：

```js
import { findLanguageViolations } from './chinese-language.mjs';

test('accepts Chinese narrative with retained technical terms', () => {
  const source = [
    '# 场景与 Selection',
    '',
    '当前 Selection 保存在 Scene 中，并在相机变化后保持稳定。',
    '',
  ].join('\n');

  assert.deepEqual(findLanguageViolations(source, 'README.md'), []);
});

test('rejects an English-only heading', () => {
  const violations = findLanguageViolations(
    '# Scene and Selection\n\n当前 Selection 保持稳定。\n',
    'README.md',
  );

  assert.equal(violations[0].code, 'ICE3_DOC_ENGLISH_HEADING');
  assert.equal(violations[0].line, 1);
});

test('rejects an English-only prose paragraph', () => {
  const violations = findLanguageViolations([
    '# 示例',
    '',
    'The current selection remains stable while the camera moves through the scene.',
    '',
  ].join('\n'), 'README.md');

  assert.equal(violations[0].code, 'ICE3_DOC_ENGLISH_PROSE');
  assert.equal(violations[0].line, 3);
});

test('ignores English inside fenced and inline code', () => {
  const source = [
    '# 示例',
    '',
    '使用 `findSelectionById` 查询当前 Selection。',
    '',
    '```ts',
    'const selection = findSelectionById("device-01");',
    'console.log(selection);',
    '```',
    '',
  ].join('\n');

  assert.deepEqual(findLanguageViolations(source, 'README.md'), []);
});

test('accepts technical table values without Chinese descriptions', () => {
  const source = [
    '# 字段',
    '',
    '| Field | Type |',
    '| --- | --- |',
    '| selectionId | string |',
    '| nodeId | string |',
    '',
  ].join('\n');

  assert.deepEqual(findLanguageViolations(source, 'README.md'), []);
});

test('excludes legal notices and source fixtures by path', () => {
  const english = '# Third Party Notices\n\nUpstream license text remains unchanged.\n';
  assert.deepEqual(
    findLanguageViolations(english, 'THIRD_PARTY_NOTICES.md'),
    [],
  );
  assert.deepEqual(
    findLanguageViolations(
      english,
      'tests/fixtures/3d-tiles-1.1-schema/SOURCE.md',
    ),
    [],
  );
});
```

- [ ] **步骤 2：运行测试并确认失败**

运行：

```bash
export PATH=/Users/felix/.nvm/versions/node/v24.22.1/bin:$PATH
node --test scripts/check-docs.test.mjs
```

预期：因为 `scripts/chinese-language.mjs` 不存在而失败，错误包含 `ERR_MODULE_NOT_FOUND`。

- [ ] **步骤 3：实现最小语言分析器**

创建 `scripts/chinese-language.mjs`。实现必须：

1. 按行保留原始行号。
2. 跳过 fenced code block、metadata、URL、inline code 和图片目标。
3. 扫描 heading；去掉 inline code 后若至少有 3 个 ASCII 单词且没有汉字，产生 `ICE3_DOC_ENGLISH_HEADING`。
4. 按空行聚合正文段落；去掉链接目标后若至少有 8 个 ASCII 单词且没有汉字，产生 `ICE3_DOC_ENGLISH_PROSE`。
5. 对根 `AGENTS.md` 正常扫描。
6. 对 `THIRD_PARTY_NOTICES.md`、任意 `tests/fixtures/**/SOURCE.md` 和 `scripts/fixtures/**/*.md` 返回空结果。

核心判断使用以下逻辑，测试要求的具体阈值不得改变：

```js
const CJK_PATTERN = /\p{Script=Han}/u;
const LATIN_WORD_PATTERN = /[A-Za-z][A-Za-z0-9_.:/-]*/g;

function latinWordCount(value) {
  return value.match(LATIN_WORD_PATTERN)?.length ?? 0;
}

function supportsLanguagePolicy(relativePath) {
  return relativePath !== 'THIRD_PARTY_NOTICES.md'
    && !/^tests\/fixtures\/.*\/SOURCE\.md$/.test(relativePath)
    && !relativePath.startsWith('scripts/fixtures/');
}
```

- [ ] **步骤 4：把语言检查接入可选 CLI**

在 `check-docs.mjs` 中为 `parseArgs` 增加 `--language`，并把选项传入 `checkRepository`。当 `language` 为真时：

- 对现有产品文档路径运行 `findLanguageViolations`。
- 单独读取仓库根的 `AGENTS.md` 并运行语言检查。
- 将每条 violation 转为 `${displayPath}:${line}: ${code}: ${message}`。
- 不把 `AGENTS.md` 加回产品文档数量或索引要求。

在 `check-docs.test.mjs` 添加一个临时仓库测试：

```js
test('flags English AGENTS prose without requiring an index entry', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ice3-docs-'));
  try {
    await writeFile(join(root, 'README.md'), [
      '# 占位仓库',
      '',
      '> Document ID: ICE3-DOC-RM-001',
      '>',
      '> Status: Placeholder',
      '>',
      '> Owner: Documentation tests',
      '',
      '当前没有公开实现。',
      '',
    ].join('\n'));
    await writeFile(join(root, 'AGENTS.md'), [
      '# Repository Rules',
      '',
      '> Document ID: ICE3-DOC-POL-001',
      '>',
      '> Status: Active',
      '>',
      '> Owner: Documentation tests',
      '',
      'All repository changes must follow the verification rules.',
      '',
    ].join('\n'));

    const report = await checkRepository(root, {
      expectedArea: 'DOC',
      language: true,
    });
    const errors = report.errors.join('\n');
    assert.match(errors, /AGENTS\.md:1: ICE3_DOC_ENGLISH_HEADING/);
    assert.doesNotMatch(errors, /index does not link/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
```

- [ ] **步骤 5：增加分批语言检查命令**

创建 `scripts/check-language-files.mjs`。它接受 `--root` 和一个或多个文件或目录；目录递归查找 `.md` 文件。对每个文件调用 `findLanguageViolations`，按 `${relativePath}:${line}: ${code}: ${message}` 输出并按非零状态退出。

添加 CLI 测试：

```js
test('language file CLI checks only the requested path', () => {
  const result = spawnSync(
    process.execPath,
    [
      join(scriptsDirectory, 'check-language-files.mjs'),
      '--root',
      invalidFixtureRoot,
      'docs/chinese-spec.md',
    ],
    { encoding: 'utf8' },
  );

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /ICE3_DOC_ENGLISH_HEADING/);
});
```

- [ ] **步骤 6：运行全量文档测试**

运行：

```bash
export PATH=/Users/felix/.nvm/versions/node/v24.22.1/bin:$PATH
npm test
npm run docs:check
```

预期：所有测试通过；默认文档检查仍通过；可用 `--language` 显式检查当前英文文档并得到诊断。

- [ ] **步骤 7：提交**

```bash
git add scripts/chinese-language.mjs scripts/check-language-files.mjs \
  scripts/check-docs.mjs scripts/check-docs.test.mjs
git commit -m "feat: add Chinese documentation language checks"
```

---

## Task 2：建立技术词表并更新语言政策

**文件：**

- 新建：`ice3-doc/docs/reference/terminology.md`
- 修改：`ice3-doc/docs/specs/2026-10-29-documentation-system-design.md`
- 修改：`ice3-doc/docs/specs/2026-10-29-chinese-documentation-policy-design.md`
- 修改：`ice3-doc/docs/README.md`
- 修改：`ice3-doc/scripts/check-docs.mjs`
- 修改：`ice3-doc/scripts/check-docs.test.mjs`
- 修改：`ice3-doc/scripts/fixtures/docs-valid/docs/chinese-spec.md`

**接口：**

- 产出：`ICE3-DOC-REF-001` 技术词表，供所有文档链接和检索。
- 产出：文档系统 Spec 的新语言政策。
- 移除：`Chinese specification lacks English summary` 错误。

- [ ] **步骤 1：先写取消 English summary 的失败测试**

在 `check-docs.test.mjs` 添加：

```js
test('accepts a Chinese specification without an English summary', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ice3-docs-'));
  try {
    await mkdir(join(root, 'docs'));
    await writeFile(join(root, 'README.md'), [
      '# 仓库',
      '',
      '> Document ID: ICE3-DOC-RM-001',
      '>',
      '> Status: Active',
      '>',
      '> Owner: Documentation tests',
      '',
      '[索引](docs/README.md)',
      '',
    ].join('\n'));
    await writeFile(join(root, 'docs', 'README.md'), [
      '# 文档索引',
      '',
      '> Document ID: ICE3-DOC-IDX-001',
      '>',
      '> Status: Active',
      '>',
      '> Owner: Documentation tests',
      '',
      '- [README](../README.md)',
      '- [规格](spec.md)',
      '',
    ].join('\n'));
    await writeFile(join(root, 'docs', 'spec.md'), [
      '# 中文规格',
      '',
      '> Document ID: ICE3-DOC-SPEC-001',
      '>',
      '> Status: Draft',
      '>',
      '> Owner: Documentation tests',
      '',
      '本文定义中文文档规则。',
      '',
    ].join('\n'));

    const report = await checkRepository(root, { expectedArea: 'DOC' });
    assert.deepEqual(report.errors, []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
```

- [ ] **步骤 2：运行测试并确认失败**

运行：

```bash
export PATH=/Users/felix/.nvm/versions/node/v24.22.1/bin:$PATH
node --test --test-name-pattern="without an English summary" scripts/check-docs.test.mjs
```

预期：失败信息包含 `Chinese specification lacks English summary`。

- [ ] **步骤 3：移除旧规则并更新 fixture**

从 `check-docs.mjs` 删除检查 `Chinese specification lacks English summary` 的分支。

从 `scripts/fixtures/docs-valid/docs/chinese-spec.md` 删除 `English summary` 行，保持其他结构不变。

- [ ] **步骤 4：创建技术词表**

`terminology.md` 至少记录以下词条，并为每项写中文解释：

```text
Scene
Asset
Selection
Node
Mesh
Material
Geometry
Bounds
Runtime
Renderer
Worker
Batch
Draw call
LOD
Tileset
GLB
WebGL
OGC 3D Tiles
```

表格列固定为“保留写法”“中文解释”“使用约束”。不要在表中加入强制中文译名。

- [ ] **步骤 5：更新语言政策和索引**

在 `2026-10-29-documentation-system-design.md`：

- 将 `Language Policy` 改为中文标题和中文正文。
- 写明中文承担叙述、技术词保留英文、禁止双语正文。
- 写明法律文本和测试夹具例外。
- 写明自动语言检查将默认启用。
- 删除 English summary 要求。

在 `2026-10-29-chinese-documentation-policy-design.md`：

- 删除临时 English summary。
- 将 Status 保持 `Draft`，直到实施验收完成。

在 `docs/README.md` 增加“参考资料”表，并登记 `ICE3-DOC-REF-001`。

- [ ] **步骤 6：运行测试与文档检查**

```bash
export PATH=/Users/felix/.nvm/versions/node/v24.22.1/bin:$PATH
npm test
npm run docs:check
```

预期：测试和 `ice3-doc` 文档检查通过。

- [ ] **步骤 7：提交**

```bash
git add docs/reference/terminology.md \
  docs/specs/2026-10-29-documentation-system-design.md \
  docs/specs/2026-10-29-chinese-documentation-policy-design.md \
  docs/README.md scripts/check-docs.mjs scripts/check-docs.test.mjs \
  scripts/fixtures/docs-valid/docs/chinese-spec.md
git commit -m "docs: establish Chinese terminology and policy"
```

---

## Task 3：迁移各仓库入口文档

**文件：**

- `ice3-agent-console/AGENTS.md`
- `ice3-agent-console/README.md`
- `ice3-agent-console/docs/README.md`
- `ice3-doc/AGENTS.md`
- `ice3-doc/README.md`
- `ice3-doc/docs/README.md`
- `ice3-engine/AGENTS.md`
- `ice3-engine/README.md`
- `ice3-engine/docs/README.md`
- `ice3-industrial/AGENTS.md`
- `ice3-industrial/README.md`
- `ice3-industrial/docs/README.md`
- `ice3-studio/AGENTS.md`
- `ice3-studio/README.md`
- `ice3-toolchain/AGENTS.md`
- `ice3-toolchain/README.md`
- `ice3-toolchain/docs/README.md`
- `ice3-water-demo/AGENTS.md`
- `ice3-water-demo/README.md`

**接口：**

- 消费：任务 2 的语言政策与技术词表。
- 产出：所有仓库入口文档采用统一中文叙述。

- [ ] **步骤 1：建立功能分支**

在 ICE3 workspace 根目录建立其余仓库的功能分支；`ice3-doc` 已在任务 1 使用同一分支：

```bash
for repo in ice3-agent-console ice3-engine ice3-industrial \
  ice3-studio ice3-toolchain ice3-water-demo
do
  git -C "$repo" switch -c docs/chinese-localization
done
```

- [ ] **步骤 2：逐份审阅并改写**

对每个文件执行以下操作：

1. 标题和说明改为中文。
2. `Scene`、`Asset`、`Selection`、`LOD` 等词保留英文。
3. 命令、URL、路径、代码块和 Document ID 不改。
4. 文档索引的标题与链接文本同步改为中文。
5. `AGENTS.md` 只保留当前仓库真实适用的规则。

- [ ] **步骤 3：检查 7 个仓库的入口文档语言**

在 `ice3-doc` 中运行：

```bash
export PATH=/Users/felix/.nvm/versions/node/v24.22.1/bin:$PATH
node scripts/check-language-files.mjs --root ../ice3-agent-console \
  AGENTS.md README.md docs/README.md
node scripts/check-language-files.mjs --root ../ice3-doc \
  AGENTS.md README.md docs/README.md
node scripts/check-language-files.mjs --root ../ice3-engine \
  AGENTS.md README.md docs/README.md
node scripts/check-language-files.mjs --root ../ice3-industrial \
  AGENTS.md README.md docs/README.md
node scripts/check-language-files.mjs --root ../ice3-studio \
  AGENTS.md README.md
node scripts/check-language-files.mjs --root ../ice3-toolchain \
  AGENTS.md README.md docs/README.md
node scripts/check-language-files.mjs --root ../ice3-water-demo \
  AGENTS.md README.md
npm run docs:check:workspace
```

预期：所有命令退出码为 0，且没有 `ICE3_DOC_ENGLISH_HEADING` 或 `ICE3_DOC_ENGLISH_PROSE`。命令只检查本批次文件，不扫描尚未迁移的深层文档。

- [ ] **步骤 4：按仓库提交**

在 ICE3 workspace 根目录对每个仓库分别运行其适用的 staging 和提交命令。以 `ice3-engine` 为例：

```bash
git -C ice3-engine add AGENTS.md README.md docs/README.md
git -C ice3-engine commit -m "docs: localize repository entry points"
```

7 个仓库都完成入口提交后，才进入任务 4。

---

## Task 4：迁移 `ice3-doc` 当前实现文档

**文件：**

- `ice3-doc/docs/architecture.md`
- `ice3-doc/docs/contracts/asset-preparation-contract-v1.md`
- `ice3-doc/docs/decisions/0001-universal-engine-and-vertical-applications.md`
- `ice3-doc/docs/decisions/0002-offline-open-asset-pipeline.md`
- `ice3-doc/docs/decisions/0003-shared-2d-3d-composition.md`
- `ice3-doc/docs/decisions/0004-generic-semantic-interfaces.md`
- `ice3-doc/docs/decisions/README.md`

**接口：**

- 消费：任务 2 的技术词表和语言政策。
- 产出：跨仓库 architecture、ADR 和 contract 使用中文叙述。

- [ ] **步骤 1：改写当前实现文档**

逐份翻译标题、正文、表格说明和 ADR 理由。保留所有 schema、identifier、指标名、错误码和代码块。

Contract 文档中的 normative key、JSON、指标列和 Diagnostic code 不得改名。表格首列是代码字段时保持原值，只在说明列使用中文。

- [ ] **步骤 2：运行语言与链接检查**

```bash
cd ice3-doc
export PATH=/Users/felix/.nvm/versions/node/v24.22.1/bin:$PATH
node scripts/check-docs.mjs --root . --language
```

预期：退出码为 0。若仍有 Spec 或 Plan 的英文错误，确认错误只来自任务 5 尚未迁移的历史文档。

- [ ] **步骤 3：审查语义差异**

人工对照 diff，确认以下内容没有变化：

- 预算阈值和单位
- `profileVersion`、`contractVersion`、Diagnostic ID
- 运行时转换禁令
- ADR 的 Decision 与 Consequence 含义

- [ ] **步骤 4：提交**

```bash
git add docs/architecture.md docs/contracts docs/decisions
git commit -m "docs: localize shared architecture and contracts"
```

---

## Task 5：迁移 `Agent Console`、`Engine`、`Industrial`、`Toolchain` 当前实现文档

**文件：**

- `ice3-agent-console/docs/architecture.md`
- `ice3-agent-console/docs/decisions/0001-agent-scene-boundary.md`
- `ice3-agent-console/docs/decisions/0002-scripted-and-real-model-transport.md`
- `ice3-agent-console/docs/decisions/README.md`
- `ice3-agent-console/docs/guides/local-development.md`
- `ice3-agent-console/docs/guides/real-model-server.md`
- `ice3-agent-console/docs/guides/static-deployment.md`
- `ice3-agent-console/docs/reference/protocol.md`
- `ice3-engine/docs/api/m0.md`
- `ice3-engine/docs/api/m1.md`
- `ice3-engine/docs/architecture.md`
- `ice3-engine/docs/decisions/0001-public-facade-and-package-boundaries.md`
- `ice3-engine/docs/decisions/0002-geometry-first-industrial-rendering.md`
- `ice3-engine/docs/decisions/0003-camera-driven-tileset-and-lod.md`
- `ice3-engine/docs/decisions/README.md`
- `ice3-engine/docs/diagnostics.md`
- `ice3-engine/docs/guides/asset-loading.md`
- `ice3-engine/docs/guides/development-and-troubleshooting.md`
- `ice3-engine/docs/guides/getting-started.md`
- `ice3-industrial/docs/architecture.md`
- `ice3-industrial/docs/decisions/0001-zero-runtime-dependencies.md`
- `ice3-industrial/docs/decisions/0002-manifest-state-separation.md`
- `ice3-industrial/docs/decisions/0003-stable-identity-model.md`
- `ice3-industrial/docs/decisions/README.md`
- `ice3-industrial/docs/guides/getting-started.md`
- `ice3-industrial/docs/reference/api.md`
- `ice3-toolchain/docs/architecture.md`
- `ice3-toolchain/docs/decisions/0001-offline-standard-output.md`
- `ice3-toolchain/docs/decisions/0002-deterministic-atomic-publication.md`
- `ice3-toolchain/docs/decisions/0003-content-addressed-generation-cache.md`
- `ice3-toolchain/docs/decisions/README.md`
- `ice3-toolchain/docs/guides/build-validate-partition.md`
- `ice3-toolchain/docs/guides/large-model-performance.md`
- `ice3-toolchain/docs/reference/cli.md`

**接口：**

- 消费：任务 2 的语言规则。
- 产出：全部当前实现文档使用中文叙述，技术标识保持原样。

- [ ] **步骤 1：改写 Agent Console 文档**

保留 tool name、event name、HTTP env var、URL parameter、SSE frame 和 protocol field。只翻译界面、流程、失败边界和操作说明。

- [ ] **步骤 2：改写 Engine 文档**

所有 public API 示例、类型名、error code、Tileset 字段和代码块保持原样。翻译方法用途、生命周期、预算、选择和故障说明。

- [ ] **步骤 3：改写 Industrial 文档**

保留 `ICEIndustrialWorkspace`、`manifest`、`entity`、`relation`、`state`、`operation` 等 identifier 和 schema key。中文解释不得扩大或缩小包职责。

- [ ] **步骤 4：改写 Toolchain 文档**

保留 CLI flag、GLB key、partition 参数、stat/metric 名称和错误输出。命令示例不得改写。

`THIRD_PARTY_NOTICES.md` 与 `tests/fixtures/3d-tiles-1.1-schema/SOURCE.md` 不改。

- [ ] **步骤 5：逐仓库运行语言、链接与测试门禁**

```bash
export PATH=/Users/felix/.nvm/versions/node/v24.22.1/bin:$PATH
cd ../ice3-agent-console && npm run docs:check && cd ../ice3-doc
node scripts/check-language-files.mjs --root ../ice3-agent-console \
  AGENTS.md README.md docs/README.md docs/architecture.md \
  docs/decisions docs/guides docs/reference

cd ../ice3-engine && npm run docs:check && cd ../ice3-doc
node scripts/check-language-files.mjs --root ../ice3-engine \
  AGENTS.md README.md docs/README.md docs/api docs/architecture.md \
  docs/decisions docs/diagnostics.md docs/guides

cd ../ice3-industrial && npm run docs:check && cd ../ice3-doc
node scripts/check-language-files.mjs --root ../ice3-industrial \
  AGENTS.md README.md docs/README.md docs/architecture.md \
  docs/decisions docs/guides docs/reference

cd ../ice3-toolchain && npm run docs:check && cd ../ice3-doc
node scripts/check-language-files.mjs --root ../ice3-toolchain \
  AGENTS.md README.md docs/README.md docs/architecture.md \
  docs/decisions docs/guides docs/reference
```

预期：4 个仓库的当前文档与入口文档无语言错误；命令不包含尚未迁移的 Spec 和 Plan。

- [ ] **步骤 6：逐仓库提交**

在 ICE3 workspace 根目录为每个仓库分别提交：

```bash
git -C ice3-agent-console add docs/architecture.md docs/decisions docs/guides docs/reference
git -C ice3-agent-console commit -m "docs: localize application guidance"

git -C ice3-engine add docs/api docs/architecture.md docs/decisions docs/diagnostics.md docs/guides
git -C ice3-engine commit -m "docs: localize engine guidance"

git -C ice3-industrial add docs/architecture.md docs/decisions docs/guides docs/reference
git -C ice3-industrial commit -m "docs: localize industrial guidance"

git -C ice3-toolchain add docs/architecture.md docs/decisions docs/guides docs/reference
git -C ice3-toolchain commit -m "docs: localize toolchain guidance"
```

---

## Task 6：迁移全部历史 Spec 与 Plan

**文件：**

- `ice3-agent-console/docs/specs/2026-10-28-ice3-agent-console-design.md`
- `ice3-agent-console/docs/plans/2026-10-28-ice3-agent-console.md`
- `ice3-doc/docs/specs/2026-10-27-adaptive-industrial-lod-design.md`
- `ice3-doc/docs/specs/2026-10-27-adaptive-tileset-scheduler-design.md`
- `ice3-doc/docs/specs/2026-10-27-hierarchical-lod-design.md`
- `ice3-doc/docs/specs/2026-10-27-industrial-render-batching-design.md`
- `ice3-doc/docs/specs/2026-10-27-lod-refinement-and-scene-api-design.md`
- `ice3-doc/docs/specs/2026-10-27-semantic-industrial-proxy-design.md`
- `ice3-doc/docs/specs/2026-10-27-spatial-tileset-pipeline-design.md`
- `ice3-doc/docs/specs/2026-10-28-credible-wastewater-blender-pipeline-design.md`
- `ice3-doc/docs/specs/2026-10-28-industrial-semantic-layer-design.md`
- `ice3-doc/docs/specs/2026-10-28-synthetic-wastewater-plant-asset-design.md`
- `ice3-doc/docs/plans/2026-10-27-adaptive-industrial-lod.md`
- `ice3-doc/docs/plans/2026-10-27-adaptive-render-batching-workers.md`
- `ice3-doc/docs/plans/2026-10-27-adaptive-tileset-scheduler.md`
- `ice3-doc/docs/plans/2026-10-27-asset-preparation-contract.md`
- `ice3-doc/docs/plans/2026-10-27-hierarchical-lod-assets.md`
- `ice3-doc/docs/plans/2026-10-27-hierarchical-lod-runtime.md`
- `ice3-doc/docs/plans/2026-10-27-lod-refinement.md`
- `ice3-doc/docs/plans/2026-10-27-scene-query-api.md`
- `ice3-doc/docs/plans/2026-10-27-semantic-industrial-proxies.md`
- `ice3-doc/docs/plans/2026-10-27-spatial-tileset-pipeline.md`
- `ice3-doc/docs/plans/2026-10-27-static-render-batching.md`
- `ice3-doc/docs/plans/2026-10-28-credible-wastewater-blender-pipeline.md`
- `ice3-doc/docs/plans/2026-10-28-industrial-semantic-core.md`
- `ice3-doc/docs/plans/2026-10-28-synthetic-wastewater-plant-asset.md`
- `ice3-doc/docs/plans/2026-10-29-documentation-system.md`
- `ice3-engine/docs/specs/2026-10-27-engine-m0-design.md`
- `ice3-engine/docs/specs/2026-10-27-engine-m1-asset-design.md`
- `ice3-engine/docs/specs/2026-10-27-equipment-selection-design.md`
- `ice3-engine/docs/plans/2026-10-27-engine-m0.md`
- `ice3-engine/docs/plans/2026-10-27-engine-m1-asset-runtime.md`
- `ice3-engine/docs/plans/2026-10-27-equipment-selection.md`
- `ice3-toolchain/docs/plans/2026-10-27-toolchain-m1-glb-pipeline.md`

**接口：**

- 消费：任务 2 的语言规则。
- 产出：历史文档使用中文叙述，但技术结论、状态和时间保持不变。

- [ ] **步骤 1：按仓库批量翻译 Spec**

先处理 `ice3-doc`、`ice3-engine` 和 `ice3-agent-console` 的 Spec。保留所有指标、预算、错误码、状态表和验收数值。

- [ ] **步骤 2：按仓库批量翻译 Plan**

将标题、任务说明、测试目的和提交说明改为中文。所有代码块、命令、文件路径、测试名称、错误码和 commit message 保持原样。

- [ ] **步骤 3：清理旧 English summary**

删除所有产品 Spec 中的 `English summary` 行，包括：

```text
ice3-doc/docs/specs/*.md
ice3-engine/docs/specs/*.md
```

新语言政策不再要求英文摘要。

- [ ] **步骤 4：运行语言检查并定位剩余英文段落**

```bash
cd ice3-doc
export PATH=/Users/felix/.nvm/versions/node/v24.22.1/bin:$PATH
node scripts/check-language-files.mjs --root ../ice3-agent-console .
node scripts/check-language-files.mjs --root ../ice3-doc .
node scripts/check-language-files.mjs --root ../ice3-engine .
node scripts/check-language-files.mjs --root ../ice3-toolchain .
```

预期：4 个仓库退出码为 0。所有例外文件不产生语言错误。

- [ ] **步骤 5：人工比较历史语义**

对每个 Spec 和 Plan 检查：

- Status、日期、版本、Document ID 未变
- 数值阈值、单位和预算未变
- `REPLACE`、`ADD`、Diagnostic ID、Tileset 字段未变
- Task 顺序和依赖关系未变
- 代码块内容未变

- [ ] **步骤 6：逐仓库提交**

在 ICE3 workspace 根目录分别提交：

```bash
git -C ice3-agent-console add docs/specs docs/plans
git -C ice3-agent-console commit -m "docs: localize application design history"

git -C ice3-doc add docs/specs docs/plans
git -C ice3-doc commit -m "docs: localize shared design history"

git -C ice3-engine add docs/specs docs/plans
git -C ice3-engine commit -m "docs: localize engine design history"

git -C ice3-toolchain add docs/plans
git -C ice3-toolchain commit -m "docs: localize toolchain design history"
```

---

## Task 7：默认启用语言门禁

**文件：**

- 修改：`ice3-doc/scripts/check-docs.mjs`
- 修改：`ice3-doc/scripts/check-docs.test.mjs`
- 修改：`ice3-doc/package.json`（仅当测试文件拆分需要调整命令）

**接口：**

- 产出：`checkRepository` 和 CLI 默认执行语言检查。
- 保留：`--language` 可继续显式传入，行为不变。

- [ ] **步骤 1：写默认启用的失败测试**

添加：

```js
test('runs the language gate by default', async () => {
  const report = await checkRepository(invalidFixtureRoot, { expectedArea: 'DOC' });
  assert.match(report.errors.join('\n'), /ICE3_DOC_ENGLISH_HEADING/);
});
```

- [ ] **步骤 2：运行并确认失败**

```bash
export PATH=/Users/felix/.nvm/versions/node/v24.22.1/bin:$PATH
node --test --test-name-pattern="language gate by default" scripts/check-docs.test.mjs
```

预期：失败，因为当前默认 `language` 为 `false`。

- [ ] **步骤 3：将默认值改为 true**

把 `checkRepository` 的默认值从 `options.language ?? false` 改为 `options.language ?? true`。CLI 不需要额外参数即可执行语言检查。

- [ ] **步骤 4：隔离结构测试与语言测试**

对所有只验证结构、链接、索引或本地路径的既有测试显式传入 `{ language: false }`，保持原测试意图。把 workspace 测试夹具的标题和叙述改为中文，使该测试继续验证默认语言门禁。

例如：

```js
const report = await checkRepository(validFixtureRoot, {
  expectedArea: 'DOC',
  language: false,
});
```

- [ ] **步骤 5：运行所有文档检查**

```bash
cd ice3-doc
export PATH=/Users/felix/.nvm/versions/node/v24.22.1/bin:$PATH
npm test
npm run docs:check
npm run docs:check:workspace
```

预期：全部命令退出码为 0，无 English heading 或 prose 诊断。

- [ ] **步骤 6：提交**

```bash
cd ice3-doc
git add scripts/check-docs.mjs scripts/check-docs.test.mjs package.json
git commit -m "docs: enforce Chinese narrative by default"
```

---

## Task 8：全仓链接与语义终审

**文件：**

- 复核所有受影响 `.md`
- 重点检查：`ice3-doc/docs/README.md`
- 重点检查：各仓库 `README.md` 与 `docs/README.md`
- 重点检查：跨仓库 URL 中的 heading anchor

**接口：**

- 消费：任务 3 至任务 7 的全部翻译结果。
- 产出：完整导航、有效 anchor、无语义漂移的最终文档树。

- [ ] **步骤 1：执行全工作区文档门禁**

```bash
cd ice3-doc
export PATH=/Users/felix/.nvm/versions/node/v24.22.1/bin:$PATH
npm test
npm run docs:check
npm run docs:check:workspace
```

预期：

- Validator 测试全部通过。
- `ice3-agent-console` 没有语言错误。
- `ice3-doc` 没有语言错误。
- `ice3-engine` 没有语言错误。
- `ice3-industrial` 没有语言错误。
- `ice3-studio` 没有语言错误。
- `ice3-toolchain` 没有语言错误。
- `ice3-water-demo` 没有语言错误。

- [ ] **步骤 2：检查仍含大段英文的文件**

运行：

```bash
rg -n -U --glob '*.md' '(^|\n)([^\n]*[A-Za-z][^\n]*\n){4,}' . | sed -n '1,240p'
```

人工区分合法代码、表格值和漏翻段落。发现漏翻时回到所属仓库的对应任务修正，不在本任务直接批量替换。

- [ ] **步骤 3：检查术语一致性**

对以下词检查大小写和拼写：

```text
Scene
Asset
Selection
Node
Mesh
Material
Geometry
Runtime
Renderer
LOD
Tileset
GLB
WebGL
OGC 3D Tiles
```

不符合技术词表时修正，不以中文同义词替代。

- [ ] **步骤 4：检查历史内容未被改变**

使用 `git diff main...HEAD --word-diff` 审阅高价值指标和协议字段。重点确认：

- 所有数字阈值保持不变
- 所有 fenced code block 内容保持不变
- 所有 Diagnostic ID 保持不变
- 所有 Document ID 和 Status 保持不变
- 所有历史验收结论保持不变

- [ ] **步骤 5：提交链接修复**

若终审只产生 anchor 和索引修复：

```bash
git -C ice3-doc add docs
git -C ice3-doc commit -m "docs: repair localized document navigation"
```

其他仓库如有自己内部的 anchor 修复，也分别提交 `docs: repair localized navigation`。

---

## Task 9：执行各工程完整验证并合入

**文件：**

- 不新增产品文件
- 复核 7 个仓库的 `main`、工作树、提交身份和最终文档

**接口：**

- 消费：全部迁移与修复提交。
- 产出：所有工程在 `main` 上通过既定验证门禁。

- [ ] **步骤 1：在功能分支运行各仓库验证**

```bash
export PATH=/Users/felix/.nvm/versions/node/v24.22.1/bin:$PATH

cd ice3-agent-console && npm run verify
cd ../ice3-engine && npm run verify
cd ../ice3-industrial && npm run verify
cd ../ice3-toolchain && npm run verify
cd ../ice3-doc && npm test && npm run docs:check:workspace
```

预期：每个命令退出码为 0。`ice3-studio` 与 `ice3-water-demo` 没有可执行门禁，由全工作区文档检查覆盖。

- [ ] **步骤 2：检查 diff 和提交身份**

```bash
for repo in \
  ice3-agent-console ice3-doc ice3-engine ice3-industrial \
  ice3-studio ice3-toolchain ice3-water-demo
do
  git -C "$repo" diff --check main...HEAD
  git -C "$repo" log --format='%an <%ae> | %cn <%ce>' main..HEAD
  git -C "$repo" status --short
done
```

预期：

- 没有 whitespace error。
- 所有提交作者和提交者都是 `damoqiongqiu <damoqiongqiu@126.com>`。
- 7 个工作树都干净。

- [ ] **步骤 3：逐仓库合入 `main`**

```bash
for repo in \
  ice3-agent-console ice3-doc ice3-engine ice3-industrial \
  ice3-studio ice3-toolchain ice3-water-demo
do
  git -C "$repo" switch main
  git -C "$repo" merge --no-ff docs/chinese-localization \
    -m "Merge branch 'docs/chinese-localization'"
done
```

预期：7 个仓库均无冲突并生成 merge commit。

- [ ] **步骤 4：在 `main` 上重跑最终门禁**

```bash
export PATH=/Users/felix/.nvm/versions/node/v24.22.1/bin:$PATH

cd ice3-doc
npm test
npm run docs:check:workspace

cd ../ice3-agent-console && npm run verify
cd ../ice3-engine && npm run verify
cd ../ice3-industrial && npm run verify
cd ../ice3-toolchain && npm run verify
```

预期：全部通过。

- [ ] **步骤 5：验证 Git 历史与工作树**

```bash
for repo in \
  ice3-agent-console ice3-doc ice3-engine ice3-industrial \
  ice3-studio ice3-toolchain ice3-water-demo
do
  git -C "$repo" fsck --full --no-dangling
  git -C "$repo" status --porcelain=v1
done
```

预期：

- 7 个 `fsck` 均无错误。
- 7 个工作树均无输出。
- 当前分支均为 `main`。
- 所有 commit object 的 author 和 committer 都是 `damoqiongqiu`。

---

## 完成定义

- [ ] 除例外文件外，全部 Markdown 使用中文叙述。
- [ ] 技术词汇、缩写、API、命令和标识保持原样。
- [ ] 所有 English summary 已从产品 Spec 中移除。
- [ ] 技术词表已建立并进入文档索引。
- [ ] 语言检查默认启用，并有完整单元测试。
- [ ] 所有内部和跨仓库链接及 anchor 有效。
- [ ] 7 个仓库的既定验证门禁通过。
- [ ] 7 个仓库改动已合入 `main`。
- [ ] 所有提交身份为 `damoqiongqiu`。
