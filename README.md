# ICE3 Documentation

> Document ID: ICE3-DOC-RM-001
>
> Status: Active
>
> Owner: ICE3 documentation maintainers

本仓库是 ICE3 家族的文档和架构门户，也是 cross-repository contract、compatibility
rule、shared metric 和 shared Diagnostic ID 的唯一权威。

## 仓库

| 仓库 | 职责 |
|---|---|
| [`ice3-engine`](https://github.com/ice-3d/ice3-engine/blob/main/README.md) | 可复用的工业 3D Runtime 和公开 API |
| [`ice3-toolchain`](https://github.com/ice-3d/ice3-toolchain/blob/main/README.md) | 离线 Asset preparation、partitioning、LOD 和 validation |
| [`ice3-industrial`](https://github.com/ice-3d/ice3-industrial/blob/main/README.md) | 浏览器独立的 industrial semantic core |
| [`ice3-agent-console`](https://github.com/ice-3d/ice3-agent-console/blob/main/README.md) | Agent 驱动的工业 Scene 应用 |
| [`ice3-doc`](https://github.com/ice-3d/ice3-doc/blob/main/README.md) | 共享架构和 contract 仓库 |
| [`ice3-studio`](https://github.com/ice-3d/ice3-studio/blob/main/README.md) | 预留的 authoring workspace |
| [`ice3-water-demo`](https://github.com/ice-3d/ice3-water-demo/blob/main/README.md) | 预留的水务行业演示 workspace |

## 开发要求

所有 ICE3 workspace 使用 Node.js 24.22.1 LTS 和 npm 11 或更高版本。这是完整验证门禁
使用的准确 Node.js patch version。每个活动仓库都在 `.nvmrc` 中固定同一版本。

```bash
nvm install
nvm use
node --version
```

最后一条命令必须输出 `v24.22.1`。安装依赖或执行仓库 build、test、documentation
command 前先运行该检查。

## 从这里开始

- [文档索引](docs/README.md)
- [ICE3 家族架构](docs/architecture.md)
- [架构决策](docs/decisions/README.md)
- [Asset Preparation Contract v1](docs/contracts/asset-preparation-contract-v1.md)

## 文档验证

```bash
npm test
npm run docs:check
npm run docs:check:workspace
```

第一条命令测试 validator，第二条验证本仓库，第三条验证与 `ice3-doc` 并列 checkout 的
所有 ICE3 仓库。

## AI 辅助开发

本项目在设计和实现过程中大量使用了 AI 辅助开发。

## 许可证

本项目采用 [MIT License](LICENSE) 许可。
