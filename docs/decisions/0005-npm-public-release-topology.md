# npm 公开发布拓扑

> Document ID: ICE3-DOC-ADR-005
>
> Status: Historical
>
> Owner: ICE3 architecture maintainers

## 1. 背景

ICE3 的源码按职责拆成多个 workspace package，以约束依赖方向并支持独立测试。直接把这
些内部 package 全部发布到 npm 会让使用者面对过多安装入口，也会把实现边界误当成 API
承诺。

## 2. 决策

本决策记录 Toolchain 退役前的 npm 公开发布拓扑，当时发布三个 package：

| Package | 来源 | 用途 |
|---|---|---|
| `ice3` | `ice3-engine/packages/ice3` | Engine 唯一公开 Runtime API；内部四个 package 打入同一发布产物 |
| `@ice3/industrial-core` | `ice3-industrial/packages/industrial-core` | 独立工业语义核心 |
| `@ice3/toolchain` | `ice3-toolchain/packages/cli` | 离线资产工具链；提供 `ice3-tool` 命令 |

Engine 的 `@ice3/core`、`@ice3/assets`、`@ice3/renderer`、`@ice3/runtime`，以及
Toolchain 的 `@ice3/toolchain-core` 保持 `private`，不作为单独安装入口发布。

## 3. 发布约束

- 三个公开 package 初始版本统一为 `0.1.0`。
- 公开 Engine 产物不得包含对私有 `@ice3/*` package 的 bare import。
- Toolchain 产物可以保留其第三方 runtime dependency，但不得依赖私有
  `@ice3/toolchain-core`。
- 每个公开 package 必须包含 README、MIT License、repository metadata 和明确 exports。
- Toolchain 发布包必须携带第三方声明。
- 发布前必须从 tarball 在空目录执行安装和最小运行验证。
- GitHub organization 与 npm scope 相互独立；发布 scoped package 前必须拥有 npm
  `@ice3` organization。

## 4. 影响

- 使用者只需要记住三个安装入口。
- Monorepo 内部仍保留细粒度来源模块和架构门禁。
- 发布构建需要额外的 JS bundling 与声明文件整合步骤。
- 以后如出现真实需求，可以增加新的公开 package，但不能把当前私有 package 自动视为
  稳定 API。

Toolchain 仓库退役后，`@ice3/toolchain` 不再是现行产品依赖。当前 Studio Asset
pipeline 通过 Studio Core、Server 和 `studio-cli` 提供，Source import、prepare、
partition、LOD、Tileset export 和 validation 不调用独立 Toolchain package。

## 5. 验证

```bash
npm run release:check
```

并分别验证：

```bash
npm install <ice3-tarball>
npm install <industrial-core-tarball>
npm install <historical-toolchain-tarball> # 仅用于历史兼容验证
npx ice3-tool --help
```

## 6. 关联文档

- `ICE3-DOC-IDX-002` — [架构决策索引](README.md)
- `ICE3-DOC-PLAN-017` — [npm 公开发布实施计划](../plans/2026-10-29-npm-public-release.md)
