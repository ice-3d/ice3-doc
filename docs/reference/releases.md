# ICE3 公开发布状态

> Document ID: ICE3-DOC-REF-003
>
> Status: Active
>
> Owner: ICE3 architecture maintainers

## 当前 npm 包

| Package | 当前版本 | 状态 | 用途 |
|---|---:|---|---|
| `ice3` | `0.2.1` | Active | Engine 唯一公开 Runtime API |
| `@ice3/industrial-core` | `0.1.0` | Active | 浏览器独立的 industrial semantic core |
| `@ice3/toolchain` | 已停止发布 | Retired | 历史离线 Toolchain；不纳入新部署 |

`ice3@0.2.1` 包含 Studio Prepared Asset 消费、共享业务 Selection、Tileset
Node identity、逻辑 Selection 保留和 WebGL2/WebGPU 当前修复。Agent Console 必须锁定
这一版本或经兼容验证的更新 minor。

## 发布边界

- Studio 是私有应用和统一 Asset pipeline 入口，不发布 npm package。
- Agent Console、Studio Viewer 和 Doc 仓库不发布 npm package。
- Engine 的 `@ice3/*` workspace package 保持私有，并打入公开 `ice3` 产物。
- Toolchain 仓库、Sidecar 和 `@ice3/toolchain` 发布链已退役。

## 发布验证

Engine 发布前必须通过：

```bash
PLAYWRIGHT_CHANNEL=chrome npm run verify
npm run release:check
```

发布后必须从 npm registry 重新安装精确版本，并在实际消费应用完成 typecheck、build 和
浏览器 E2E。不能以本地 `file:` 或未发布 tarball 作为部署验收的替代品。

## 关联文档

- `ICE3-DOC-ADR-005` — [历史 npm 发布拓扑](../decisions/0005-npm-public-release-topology.md)
- `ICE3-DOC-CTR-001` — [Asset Preparation Contract v1](../contracts/asset-preparation-contract-v1.md)
- `ICE3-ENG-RM-002` — [npm package ice3](https://github.com/ice-3d/ice3-engine/blob/main/packages/ice3/README.md)
