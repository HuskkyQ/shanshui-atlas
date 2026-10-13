# 三潭印月第二处 Scenic Scene 实现计划

> **For agentic workers:** Use subagent-driven-development to execute the isolated model/content tasks and review the integrated result. 用户已确认上一轮方案，本轮直接实现；不提交、不发布。

**Goal:** 在现有西湖浏览中进入三潭印月近景，并验证两处独立景点可以复用完整的进入、探索、返回流程。

**Architecture:** 保留 World 和 scene-session 的接口与快照恢复。Scenic UI 按注册项读取内容、POI 照片和热点；三潭印月独立模型和 Scene 使用现有 Three.js、CSS2D 与可取消渐变模式。灵隐寺继续 planned。

**Tech Stack:** Vite、原生 Three.js、OrbitControls、CSS2DRenderer、Node test。

## 已确认设计

- 三座瓶形石塔、湖面、小瀛洲局部岸线与植被，3～4 个文化探索热点。近景尺寸与相对布局为艺术化示意；只有现有 World 中一座石塔具有已确认 OSM 点位，不冒充测绘成果。
- 点击三潭印月名称／图标 → World 详情 → 进入景点 → 飞行与双画布渐变 → 近景探索 → 渐变返回并恢复原视角。
- 普通左键旋转、Shift＋左键平移、滚轮缩放，沿用现有行为与手机端布局。
- 不增加历史模式、自动导览、第一人称、AI 或灵隐寺模型。

## Task 1: 内容与模型

**Files:** `src/content/santanyinyue.json`、`docs/santanyinyue-sources.md`、`src/models/santanyinyue.js`、`src/scenes/santanyinyue.js`、`tests/santan-model.test.js`。

- [x] 核验官方资料中的三塔、五孔、小瀛洲和月影文化描述；内容附来源与艺术化边界。
- [x] 实现独立模型，输出热点锚点；三座石塔具有瓶形塔腹、圆孔、台基与塔顶，局部岸线与湖面形成景观环境。
- [x] 实现 `createScene(context)`，提供 `mount`、`reveal`、`conceal`、`selectHotspot`、`resetView`、`dispose`。沿用 1.1 秒可取消双画布渐变与实例资源所有权。
- [x] 模型检查有限坐标、三塔结构、热点锚点、独立资源与合理几何量；运行 `node --test tests/santan-model.test.js`。

## Task 2: 按景点展示内容

**Files:** `src/scenic-scenes.js`、`src/scenic-ui.js`、`src/exhibit.html`、`src/scenic-content.js`、`tests/scenic-scenes.test.js`、`tests/scenic-ui.test.js`、`tests/scene-session.test.js`。

- [x] 注册两处动态 loader 与对应内容；读取 `getScenicScene(id).content`，只有雷峰塔和三潭印月 ready。
- [x] 每次进入重建标题、说明、导航与照片；照片使用注册项 `poiId`，加载提示使用景点名称，回调只作用于当前进入 revision。
- [x] 验证两处内容、POI、热点 id 不串用；灵隐寺依然无入口。

## Task 3: 集成验证与记录

**Files:** `docs/west-lake-scenic-scenes.md`、`README.md`、本计划。

- [x] `npm test` 与 `npm run build` 通过；独立审核先检查范围，再检查生命周期和资源释放。
- [x] 浏览器检查桌面／390px 手机两景点进入、热点、返回；反复进出与加载中取消后仅剩一个 World 画布，景点热点不残留。
- [x] 实际观察飞行后的两画布交叠与渐变返回；检查照片与标题正确、无横向溢出、控制台无新增错误。
- [x] 更新资料边界、实现文档和本地预览；报告实际验证范围，不作 FPS／测绘精度承诺。

## 验证记录（2026-10-04）

- 95 项测试、生产构建、规格与质量审查通过；只保留既有大 chunk 警告。
- 桌面/390×844 两处景点进入、照片、热点与返回已在浏览器检查；三潭名称点击、全景复位、重复进出、加载取消及沉浸状态恢复通过。
- 两画布交叠 opacity 已实际检查；返回后 World canvas 为 1，三潭近景热点为 0，控制台无 error/warn。
- 手机镜头构图避免介绍卡挡住主体；预览 `../../../previews/preview-santan-scenic.png` 与 `../../../previews/preview-santan-mobile.png`。
- 未测 GPU FPS、heap、真实测绘精度；不提交、不发布。
