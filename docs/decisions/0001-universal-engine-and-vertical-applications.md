# 通用 Engine 与垂直应用

> Document ID: ICE3-DOC-ADR-001
>
> Status: Active
>
> Owner: ICE3 architecture maintainers

## 背景

ICE3 必须服务多个工业领域，而不为每个应用重复建设 rendering 和 Asset 基础能力。
水务演示只是平台的一个应用，不定义平台本身。

## 决策

可复用的 Engine、Toolchain 和 industrial semantic core 保持领域中立。行业专用
Entity、workflow、术语、数据连接和呈现留在垂直应用中。

垂直应用组合使用公开 ICE3 API，不得把行业专用行为加入 Engine 的 core Scene、
Renderer、input、Selection 或 Asset contract。

## 备选方案

- 在第一个行业应用中构建专用 rendering stack。
- 向通用 Engine 添加水务专用概念。
- 用同一个应用仓库承载所有可复用代码和垂直代码。

这些方案可以缩短初始演示时间，但会重复基础工作，并让后续行业依赖某个应用的假设。

## 影响

- 共享改进可以惠及所有垂直应用。
- 集成必须经过明确应用边界。
- 跨仓库 contract 必须带版本并写入文档。
- 领域专用行为可以在不依赖 GPU 基础设施的情况下测试。

## 兼容性

公开 Engine API 是稳定集成边界。将领域专用关注点从应用移入通用平台时，必须单独作出
架构决策并完成 compatibility review。

## 验证

- 架构测试拒绝通用 package 依赖应用 package。
- 水务演示只消费公开 API。
- 共享 contract 不包含无关领域必须依赖的行业专用字段。

## 关联文档

- `ICE3-DOC-ARC-001` — [ICE3 家族架构](../architecture.md)
- `ICE3-DOC-ADR-004` — [通用 semantic interface](0004-generic-semantic-interfaces.md)
