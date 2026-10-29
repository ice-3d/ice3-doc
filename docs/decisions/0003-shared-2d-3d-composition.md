# 共享 2D 与 3D composition

> Document ID: ICE3-DOC-ADR-003
>
> Status: Active
>
> Owner: ICE3 architecture maintainers

## 背景

工业界面需要 label、panel、overlay、diagram 和 control 与空间 Geometry 共同显示。
把 2D 和 3D 视为无关渲染产品，会造成重复的 input routing、lifecycle management、
coordinate handling 和 Selection 行为。

## 决策

Engine 为 2D layer 和 3D content 提供共享 composition model。应用按明确顺序注册视觉
layer。Pointer、wheel、focus、resize 和 disposal 使用同一 Engine lifecycle。

2D content 可以覆盖、标注或交互 3D content。2D layer 可以消费 hit-test region，并按
明确策略阻止或透传 event。

## 备选方案

- 内嵌独立 2D canvas，并使用独立 DOM event handling。
- 要求每个应用协调多个 rendering lifecycle。
- 将所有 2D interface 投影为带 texture 的 3D Geometry。

这些方案会增加同步问题，并让一致的 Selection 和 accessibility 更难实现。

## 影响

- 应用只需理解一套 layer 和 input model。
- 2D 与 3D 可以联合测试。
- Renderer backend 必须保持共享 event 和 lifecycle semantic。
- 不属于空间 composition 的大型应用专用 2D UI 可以继续留在 Engine 之外。

## 兼容性

共享 composition API 是公开 Engine 边界。后端专用 canvas object 和 GPU state 保持私有。

## 验证

- 测试覆盖有序 hit testing、event blocking/passthrough、pointer capture、resize 和 disposal。
- Headless interface 可以在不依赖特定 GPU 的情况下验证 2D/3D routing。

## 关联文档

- `ICE3-DOC-ARC-001` — [ICE3 家族架构](../architecture.md)
- `ICE3-ENG-ARC-001` — ICE3 Engine 架构，发布在 `ice3-engine`。
