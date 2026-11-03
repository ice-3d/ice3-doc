# Agent 主导的 Studio 工作台

> Document ID: ICE3-DOC-ADR-006
>
> Status: Active
>
> Owner: ICE3 architecture maintainers

## 1. 背景

Studio 的核心目标是让 AI Agent 承担建模规划、场景查询、Operation 提案、求值和验证。
人类负责表达目标、审查证据、纠偏与批准高风险变更。如果界面以对象树、属性表单和
手工几何编辑为中心，产品会退化为传统 3D 编辑器，Agent 只能成为附属聊天窗口。

## 2. 决策

Studio Web Viewer 采用 Agent 主导、人类辅助的信息层级：

1. Agent Mission Control 默认可见，并呈现当前项目、revision、焦点对象和下一步操作。
2. 3D Scene 是 Agent 工作的空间证据和候选变更预览，不是默认的精细建模操作面板。
3. Object、Inspect 和 Changes 保留为人类辅助入口，分别用于定位上下文、检查参数和
   审阅变更。
4. 人类点击对象时，对象首先成为 Agent 的工作焦点；需要精确修改时再显式进入人工检查。
5. Agent Gateway 不可用时必须如实显示离线状态，并保留人工审查和表单编辑路径。
6. AI 提案和人工修改共同进入 ChangeSet；候选 digest 与审批权限继续强制人类决定权。

界面布局保持现有 Objects、3D Scene、Review dock 三部分，不把 Agent 变成一个与传统
编辑器等权并列的普通工具标签。人工精细控制仍然存在，但不抢占默认注意力。

## 3. 结果

- 用户先理解目标、上下文和待决策事项，再查看模型细节。
- Agent 的上下文来自可重算的 Document 和稳定 object identity，而不是屏幕面片。
- 3D Scene 继续承担空间审查，但不要求人类逐构件摆放和对齐。
- 人工入口保持可发现，Agent 离线时产品仍可完成检查和审批。

## 4. 边界

- Studio 不内置模型凭据、Prompt、Agent policy 或供应商 SDK。
- Agent 必须通过公开 API 和 ChangeSet 工作，不能直接修改 Document 或派生 Geometry。
- 本决策不改变 Engine、Industrial Core 或 Agent Console 的职责。独立 Toolchain 已
  退役，Studio 原生 Asset pipeline 是当前生产入口。

## 5. 关联文档

- `ICE3-STUDIO-SPEC-014` — [Agent 主导的工作台设计](https://github.com/ice-3d/ice3-studio/blob/main/docs/specs/2026-11-01-agent-led-workbench-design.md)
- `ICE3-STUDIO-ARC-001` — [Studio 架构](https://github.com/ice-3d/ice3-studio/blob/main/docs/architecture.md)
- `ICE3-DOC-ARC-001` — [ICE3 家族架构](../architecture.md)
- `ICE3-DOC-ADR-004` — [通用 semantic interface](0004-generic-semantic-interfaces.md)
