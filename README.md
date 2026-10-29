# ICE3 Documentation

> Document ID: ICE3-DOC-RM-001
>
> Status: Active
>
> Owner: ICE3 documentation maintainers

This repository is the documentation and architecture portal for the ICE3
family. It is the single source of truth for cross-repository contracts,
compatibility rules, shared metrics, and shared diagnostic identifiers.

## Repositories

| Repository | Role |
|---|---|
| [`ice3-engine`](https://github.com/ice-3d/ice3-engine/blob/main/README.md) | Reusable industrial 3D runtime and public API |
| [`ice3-toolchain`](https://github.com/ice-3d/ice3-toolchain/blob/main/README.md) | Offline asset preparation, partitioning, LOD, and verification |
| [`ice3-industrial`](https://github.com/ice-3d/ice3-industrial/blob/main/README.md) | Browser-independent industrial semantic core |
| [`ice3-agent-console`](https://github.com/ice-3d/ice3-agent-console/blob/main/README.md) | Agent-driven industrial scene application |
| [`ice3-doc`](https://github.com/ice-3d/ice3-doc/blob/main/README.md) | This shared architecture and contract repository |
| [`ice3-studio`](https://github.com/ice-3d/ice3-studio/blob/main/README.md) | Reserved authoring workspace |
| [`ice3-water-demo`](https://github.com/ice-3d/ice3-water-demo/blob/main/README.md) | Reserved water-industry demonstration workspace |

## Development Requirements

Use Node.js 24.22.1 LTS and npm 11 or newer for every ICE3 workspace. This is
the exact Node.js patch version used by the full verification gate. Each active
repository pins the same version in `.nvmrc`.

```bash
nvm install
nvm use
node --version
```

The last command must print `v24.22.1`. Run it before installing dependencies
or invoking a repository build, test, or documentation command.

## Start Here

- [Documentation index](docs/README.md)
- [ICE3 family architecture](docs/architecture.md)
- [Architecture decisions](docs/decisions/README.md)
- [Asset Preparation Contract v1](docs/contracts/asset-preparation-contract-v1.md)

## Documentation Validation

```bash
npm test
npm run docs:check
npm run docs:check:workspace
```

The first command tests the validator itself. The second validates this
repository. The third validates all sibling ICE3 repositories when they are
checked out beside this repository.

## AI-assisted development

This project makes substantial use of AI-assisted development. 本项目在设计和实现过程中大量使用了 AI 辅助开发。

## License

This project is licensed under the [MIT License](LICENSE).
