# 通用 semantic interface

> Document ID: ICE3-DOC-ADR-004
>
> Status: Active
>
> Owner: ICE3 architecture maintainers

## 背景

Agent、automation tool、editor、dashboard 和人类用户都需要检查并控制工业 Entity。
向 Engine 增加 Agent 专用名称或 workflow，会让通用 Scene API 依赖单一消费方。

## 决策

ICE3 为领域对象、query、Selection、focus、context、operation 和 event 提供明确、
确定性的 interface。这些 interface 描述 industrial semantic，但不包含 AI model、
prompt、conversation 或 Agent protocol。

Agent 实现位于应用中，并调用其他 client 同样可用的公开 interface。它不进入 rendering
engine，也不直接修改 GPU 或私有 Runtime state。

## 备选方案

- 向 Renderer 或 Scene class 增加 Agent 专用 method。
- 允许 Agent 发出任意 internal command。
- 使用应用专用 display name 保存 semantic identity。

这些方案会让平台绑定单一集成、削弱 validation，并把非 Agent client 降为二等能力。

## 影响

- 人类界面、脚本、测试和 Agent 共享一套 capability model。
- Semantic operation 必须显式 validation，并返回稳定 error。
- Agent policy、prompt construction 和 conversation state 留在应用中。
- 增加新消费方不需要改变 Engine 概念。

## 兼容性

Semantic identifier 和公开 operation name 是带版本的 API surface。向 Engine 增加
Agent 专用 requirement 必须替代本决策。

## 验证

- 公开 API 不包含 Agent 专用术语。
- 应用 tool 通过公开 Engine 和 industrial API 工作。
- 未知 operation 和无效 payload 失败时不得产生部分 state change。

## 关联文档

- `ICE3-DOC-ARC-001` — [ICE3 家族架构](../architecture.md)
- `ICE3-DOC-ADR-001` — [通用 Engine 与垂直应用](0001-universal-engine-and-vertical-applications.md)
- `ICE3-IND-ARC-001` — Industrial semantic 架构，发布在 `ice3-industrial`。
