# npm 公开发布实施计划

> Document ID: ICE3-DOC-PLAN-017
>
> Status: Active
>
> Owner: ICE3 architecture maintainers

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps
> use checkbox (`- [ ]`) syntax for tracking.

**目标：** 将对外 npm 拓扑收敛为 `ice3`、`@ice3/industrial-core` 和
`@ice3/toolchain` 三个 package。

**架构：** Monorepo 保留内部模块边界；Engine facade 和 Toolchain CLI 在发布时打包
私有的同仓实现。Industrial core 保持单 package 构建。发布产物在空目录安装验证后，
再尝试发布到 npm registry。

**技术栈：** Node.js 24.22.1、TypeScript 7、esbuild 0.28.2、npm 11。

**规格：** [npm 公开发布拓扑](../decisions/0005-npm-public-release-topology.md)。

## 全局约束

- 公开 package 只有 `ice3`、`@ice3/industrial-core`、`@ice3/toolchain`。
- 私有 workspace package 保持 `private: true`。
- 三个公开 package 初始版本为 `0.1.0`。
- 发布产物中不得出现对私有 `@ice3/*` package 的运行时依赖。
- 不加入客户模型、派生模型、凭据或绝对本地路径。
- 发布前通过 `npm pack` 和空目录安装测试。
- Git author 和 committer 必须为 `damoqiongqiu <damoqiongqiu@126.com>`。

## 审查重点

- Engine 只打包 facade 却遗漏内部实现：tarball 安装后导入失败。
- 工具链打包后仍 import `@ice3/toolchain-core`：用户无法安装。
- Scoped package 没有 npm scope 权限：发布失败且不能静默改用其他名称。
- 第三方依赖或声明未进入 Toolchain tarball：CLI 运行或法律披露不完整。
- Workspace 测试通过但 tarball 安装失败：每次发布前必须在空目录复验。

---

### Task 1：Engine 单包发布

**文件：**

- 修改：`ice3-engine/package.json`
- 修改：`ice3-engine/packages/ice3/package.json`
- 新建：`ice3-engine/packages/ice3/README.md`
- 新建：`ice3-engine/packages/ice3/LICENSE`
- 新建：`ice3-engine/scripts/build-release-package.mjs`
- 新建：`ice3-engine/tests/release/package.test.ts`

**接口：**

- 产出：`npm run release:package`，生成可发布 `packages/ice3/dist`。
- 产出：`npm run release:check`，生成本地 tarball 并检查包内容。

- [ ] **步骤 1：编写失败的 manifest test**

断言 `packages/ice3/package.json` 使用 `ice3@0.1.0`、无 `private`、无私有依赖和
有效 exports；其他四个 workspace package 保持 private。

- [ ] **步骤 2：确认测试失败**

运行：`npm test -- tests/release/package.test.ts`

- [ ] **步骤 3：增加 esbuild release build**

先生成 TypeScript 声明，再把四个内部 package 的 `.d.ts` 复制到 facade 的
`dist/_types/`，把 bare `@ice3/*` declaration import 重写为相对路径，最后用 esbuild
生成单一 `dist/index.js`。

- [ ] **步骤 4：更新 package metadata 和 README**

- [ ] **步骤 5：验证**

运行：`npm run release:package && npm run release:check && npm run verify`

### Task 2：Industrial 单包发布

**文件：**

- 修改：`ice3-industrial/package.json`
- 修改：`ice3-industrial/packages/industrial-core/package.json`
- 新建：`ice3-industrial/packages/industrial-core/README.md`
- 新建：`ice3-industrial/packages/industrial-core/LICENSE`
- 修改：`ice3-industrial/tests/architecture/package-boundaries.test.mjs`

**接口：**

- 产出：`@ice3/industrial-core@0.1.0`。

- [ ] **步骤 1：编写失败的 release metadata test**

断言 package 名为 `@ice3/industrial-core`、版本 `0.1.0`、不是 private，并保留零
runtime dependency。

- [ ] **步骤 2：确认测试失败**

运行：`npm test -- tests/architecture/package-boundaries.test.mjs`

- [ ] **步骤 3：更新 package metadata、README 和 LICENSE**

- [ ] **步骤 4：验证**

运行：`npm run verify && npm pack --workspace @ice3/industrial-core --dry-run`

### Task 3：Toolchain 单包发布

**文件：**

- 修改：`ice3-toolchain/package.json`
- 修改：`ice3-toolchain/packages/cli/package.json`
- 新建：`ice3-toolchain/packages/cli/README.md`
- 新建：`ice3-toolchain/packages/cli/LICENSE`
- 新建：`ice3-toolchain/packages/cli/THIRD_PARTY_NOTICES.md`
- 新建：`ice3-toolchain/scripts/build-release-package.mjs`
- 新建：`ice3-toolchain/tests/release/package.test.ts`
- 修改：`ice3-toolchain/tests/architecture/layout.test.ts`

**接口：**

- 产出：`@ice3/toolchain@0.1.0`。
- 产出：可执行命令 `ice3-tool`。

- [ ] **步骤 1：编写失败的 manifest test**

断言 package 名称、版本、CLI bin、public access 和第三方 runtime dependencies；
`@ice3/toolchain-core` 继续 private。

- [ ] **步骤 2：确认测试失败**

运行：`npm test -- tests/release/package.test.ts`

- [ ] **步骤 3：增加 esbuild release build**

打包 CLI 和私有 core，外部化 `@gltf-transform/*`、`draco3dgltf` 和
`meshoptimizer`，保留可执行 shebang 与 source map。

- [ ] **步骤 4：更新 package metadata、README、LICENSE 和第三方声明**

- [ ] **步骤 5：验证**

运行：`npm run release:package && npm run release:check && npm run verify`

### Task 4：跨仓库 tarball 验收

**文件：**

- 新建：`ice3-doc/scripts/verify-npm-tarballs.mjs`

**接口：**

- 消费：三个 `npm pack` tarball。
- 产出：空目录安装、Engine import、Industrial import 和 CLI execution 验证。

- [ ] **步骤 1：运行三个仓库的 release package 命令**
- [ ] **步骤 2：在空目录安装三个 tarball**
- [ ] **步骤 3：执行最小 import 和 `npx ice3-tool --help`**
- [ ] **步骤 4：记录 package 大小、文件和运行结果**

### Task 5：发布与收尾

**文件：**

- 修改：`ice3-doc/docs/plans/2026-10-29-npm-public-release.md`

**接口：**

- 消费：已验证 tarball。
- 产出：npm 上的三个公开 package。

- [ ] **步骤 1：确认当前 npm 用户已拥有 `@ice3` scope**
- [ ] **步骤 2：依次发布 `ice3`、`@ice3/industrial-core`、`@ice3/toolchain`**
- [ ] **步骤 3：从 registry 重新安装并验证**
- [ ] **步骤 4：更新计划状态并合并各仓库分支**
