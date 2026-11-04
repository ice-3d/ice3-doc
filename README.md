# ICE3 Documentation

> Document ID: ICE3-DOC-RM-001
>
> Status: Active
>
> Owner: ICE3 documentation maintainers

本仓库是 ICE3 家族的文档和架构门户，也是 cross-repository contract、compatibility
rule、shared metric 和 shared Diagnostic ID 的唯一权威。

## 1. 仓库

| 仓库 | 职责 |
|---|---|
| [`ice3-engine`](https://github.com/ice-3d/ice3-engine/blob/main/README.md) | 可复用的工业 3D Runtime 和公开 API |
| [`ice3-industrial`](https://github.com/ice-3d/ice3-industrial/blob/main/README.md) | 浏览器独立的 industrial semantic core |
| [`ice3-agent-console`](https://github.com/ice-3d/ice3-agent-console/blob/main/README.md) | Agent 驱动的工业 Scene 应用 |
| [`ice3-doc`](https://github.com/ice-3d/ice3-doc/blob/main/README.md) | 共享架构和 contract 仓库 |
| [`ice3-studio`](https://github.com/ice-3d/ice3-studio/blob/main/README.md) | AI-native industrial 3D authoring workspace，也是 Source import、prepare、partition、LOD 和 Tileset 导出的统一入口 |
| [`ice3-water-demo`](https://github.com/ice-3d/ice3-water-demo/blob/main/README.md) | 预留的水务行业演示 workspace |

## 2. 开发要求

所有 ICE3 workspace 使用 Node.js 24.22.1 LTS 和 npm 11 或更高版本。这是完整验证门禁
使用的准确 Node.js patch version。每个活动仓库都在 `.nvmrc` 中固定同一版本。

```bash
nvm install
nvm use
node --version
```

最后一条命令必须输出 `v24.22.1`。安装依赖或执行仓库 build、test、documentation
command 前先运行该检查。

## 3. 从这里开始

先按"你想解决什么"选入口：

| 你想要的 | 读这个 |
|---|---|
| 判断某个仓库该不该做这件事 | [ICE3 家族架构](docs/architecture.md) + [架构决策](docs/decisions/README.md) |
| 让模型资产能被 Engine 正确加载 | [Asset Preparation Contract v1](docs/contracts/asset-preparation-contract-v1.md) |
| 搞清楚 Agent 与人的权责边界 | [Agent 主导的 Studio 工作台](docs/decisions/0006-agent-led-studio-workbench.md) |
| 写新文档、编号或引用的规矩 | [文档命名与编号规范](docs/reference/documentation-conventions.md) |
| 现在到底发布了什么 | [公开发布状态](docs/reference/releases.md) |

完整清单：[文档索引](docs/README.md)
- [ICE3 家族架构](docs/architecture.md)
- [架构决策](docs/decisions/README.md)
- [Asset Preparation Contract v1](docs/contracts/asset-preparation-contract-v1.md)
- [Agent 主导的 Studio 工作台](docs/decisions/0006-agent-led-studio-workbench.md)
- [文档命名与编号规范](docs/reference/documentation-conventions.md)
- [公开发布状态](docs/reference/releases.md)

## 4. 文档验证

```bash
npm test
npm run docs:check
npm run docs:check:workspace
```

第一条命令测试 validator，第二条验证本仓库，第三条验证与 `ice3-doc` 并列 checkout 的
所有 ICE3 仓库。

## 5. 给 AI Agent 的约定

本仓库是**契约权威**：当某个仓库的实现与这里的 contract 冲突时，以 contract 为准，
或在改动 contract 之后才改实现——反过来做等于制造兼容性事故。

**必须遵守**

1. 跨仓库事实（格式、命名、Diagnostic ID、指标定义）只写在这里，其它 README 只做指针，
   不要复制一份再各自漂移。
2. 每个文档必须有 front-matter：`Document ID` / `Status` / `Owner`。`npm run docs:check`
   会拦。
3. 跨仓库链接必须指到具体文件（`.../blob/main/README.md`），指向仓库根会被判为无效。
4. 改 contract 是版本化变更：同步更新受影响仓库的 README、spec 与测试，再统一提交。
5. 改完跑 `npm run docs:check`；并列 checkout 时再加 `docs:check:workspace`。

## 6. 许可证

本项目采用 [MIT License](LICENSE) 许可。
