# 独立房屋模型 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. 此任务已由用户授权实施，完成后保留本地改动。

**Goal:** 在 `src/models/house/` 制作可重复实例化的单层中式房屋，并提供独立预览。

**Architecture:** 建筑资产只负责本地米制几何、材质和锚点，入口朝 `+Z`，基座底面为 `Y=0`。预览独立处理地面、灯光、相机和控制，地图摆放留给现有场景。

**Tech Stack:** 原生 Three.js、OrbitControls、Vite、Node test。

---

### Task 1: 房屋资产

**Files:** Create `src/models/house/model.js`, `src/models/house/README.md`, `tests/house-model.test.js`。

- [x] 先编写并运行模型契约测试，确认模型尚不存在时失败。验证真实几何有限、底面落地、入口方向、独立实例资源和明确的释放行为。
- [x] 实现 `createHouseModel()`，返回 `{ group, anchors, footprint, dispose }`。房屋为灰瓦坡屋顶、白墙、木门窗、石基座与入口台阶的艺术化外观模型，不读取地图或创建灯光。
- [x] 在 Node 测试中将两个模型放入不同变换的父节点，确认可独立摆放；释放第一个模型不会释放第二个模型的资源。
- [x] 运行 `node --test tests/house-model.test.js`，预期全部通过；记录模型尺寸、使用方式和预览入口。

使用方式：

```js
import { createHouseModel } from './src/models/house/model.js';
const house = createHouseModel();
scene.add(house.group);
house.group.position.set(x, groundY, z);
house.group.rotation.y = heading;
// 场景退出时移除实例并释放其资源。
house.group.removeFromParent();
house.dispose();
```

### Task 2: 独立预览

**Files:** Create `src/models/house/view.html`, `src/models/house/preview.css`, `src/models/house/preview.js`; modify `src/main.js`。

- [x] 在现有动态入口中加入 `?model=house` 分支，只加载该房屋预览；保留现有景观入口。
- [x] 实现纸色背景的模型展示，支持拖动旋转、滚轮缩放、Shift 平移、总览/正面/背面镜头与尺寸说明。
- [x] 预览地面、灯光和相机与房屋模型分开；页面退出释放渲染器、控制器、观察器和几何资源，历史缓存恢复时重新挂载。

### Task 3: 验证与交付

- [x] 先做规格审查，再做代码质量审查；解决实际缺陷。
- [x] 运行 `npm test` 与 `npm run build`，确认没有新增失败。
- [x] 在浏览器查看桌面和手机尺寸；验证总览、正背面、旋转、缩放、复位、返回、重复进入和无横向溢出。
- [x] 保存预览截图到 `previews/preview-house-model.jpg`，交付本地预览链接和模型目录。

## 验证记录（2026-10-13）

- `npm test`：125/125 通过；`npm run build` 成功，保留既有大 chunk 提示。
- 规格审查和独立代码质量审查通过；瓦条与坡板净距 3 mm，山墙贴合屋脊下表面，多实例资源互不共享且重复释放幂等。
- 浏览器检查桌面 1280×800 与手机 390×844；验证总览、正面、背面、真实拖动旋转、滚轮缩放、总览复位及两次返回首页后重新进入。
- 手机无横向溢出，重复进入后只有一个模型 canvas，最终 error/warn 为空。Shift 平移沿用既有控制测试，未在浏览器模拟完整手势；未测 GPU FPS 或 heap。
- 桌面和手机截图位于 `previews/preview-house-model.jpg` 与 `previews/preview-house-model-mobile.jpg`。
