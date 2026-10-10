# 拙政园中部园实施计划

**Goal:** 在主页增加独立拙政园入口，展示中部主池、二岛、桥廊和七处核心建筑，并支持热点探索。

**Architecture:** 保留现有黄山与西湖入口。新增单独动态加载的园林页面、局部布局数据、模型和场景；使用既有 `enableShiftPan` 与地标图标，沿用当前展陈风格，不重构西湖 session。

**Tech Stack:** Vite、Three.js、OrbitControls、CSS2DRenderer、现有 Node test runner。

用户于 2026-10-05 确认“中部园核心水景，逐步做精细”。研究依据见 `docs/zhuozheng-garden-research.md`。本次不提交、推送或发布网站。

## 1. 布局与内容

- [x] 从 OSM 主 API 和可信参考核对园区水体、岛、命名建筑及桥廊，投影为局部东 x / 南 z 的米坐标；缺少实测尺寸时明确近似依据。
- [x] 新增 `src/data/zhuozheng-layout.json`，保留来源、原始 WGS84 坐标和数据获取日期；内容包含 ponds、islands、buildings、paths。
- [x] 新增 `src/content/zhuozheng-garden.json`，固定七个 id：`yuanxiang-hall`、`xuexiang-pavilion`、`hefeng-pavilion`、`xiangzhou`、`xiaofeihong`、`wuzhu-pavilion`、`jianshan-lou`；说明附官方直接链接。
- [x] 检查水陆拓扑、建筑投影、缺少依据的连接与示意尺寸。

## 2. 可独立拥有资源的模型

- [x] 新增 `src/models/zhuozheng-garden.js`，导出 `createZhuozhengGardenModel()`，返回 `{ group, anchors, dispose }`；anchors 的 key 与七个内容 id 完全对应。
- [x] 制作自然池岸与二岛、灰瓦粉墙、木柱格窗、六角亭、长方山亭、三段旱船、廊桥、楼阁及必要连通步道；高度与构件细节标记为艺术化近似。
- [x] 多形态乔木、竹与荷叶采用重复几何或实例，保持建筑视线与水面开阔。
- [x] 新增有意义的模型测试：水面保留岛洞、几何坐标有限、七个 anchor 对应独立建筑、资源幂等释放且多实例互不影响。

## 3. 场景与页面

- [x] 新增 `src/scenes/zhuozheng-garden.js`，沿用 `createScene().mount({ container, onHotspot })`、`selectHotspot(id)`、`resetView()`、`dispose()`；真实平滑镜头允许拖拽中断。
- [x] 新增 `src/garden.html`、`src/garden.css`、`src/garden.js`，包括返回主页、景点列表、详情卡、全景复位及沉浸开关；沉浸时仅保留退出沉浸按钮和可交互模型热点。
- [x] 标签与图标同按钮、无框不换行；模型 hotspot hover 先展示名称与短述，click 同步列表和详情。
- [x] 移动端更远总览、合适视角偏移和紧凑底部卡片，避免遮挡主体。尊重减少动态效果偏好。
- [x] 页面退出取消帧、监听器、ResizeObserver，并释放 geometry、material、renderer。

## 4. 首页最小接入

- [x] `src/main.js` 增加 `place=zhuozheng-garden` 分支，只加载园林资源；现有两景入口原样保留。
- [x] `index.html` 增加园林区卡片与已有收藏按钮模式，预览使用完成后的本地模型截图。
- [x] `src/home.css` 仅增加第三处独立卡片的必要布局，保留两张山水卡片。
- [x] 更新 README 和研究文档的已实施边界。

## 5. 集成验证

- [x] `npm test`：现有与新增测试均通过；`npm run build`：生产构建成功。
- [x] 本地浏览器 1280×720 与 390×844：七个热点、图标和名称点击、平滑镜头、拖拽接管、缩放、复位、沉浸切换、返回与收藏。Shift 平移复用已有控制器并通过 OrbitControls 集成测试，未在浏览器模拟完整手势。
- [x] 实际检查画面中的模型、水陆关系、目标构图、文字不换行与横向溢出；保存桌面、近景和手机截图。
- [x] 重新打开黄山、西湖及至少一处原有独立景点确认原流程；控制台检查无新增 error/warn。

验证记录：111 项测试通过，生产构建成功（保留既有大 chunk 提示）；数据生成器重放后与保存 JSON 逐字节一致。黄山、西湖、雷峰塔进入与返回回归正常，返回只保留一个 World canvas。浏览器控制台无 error/warn。未测 GPU FPS、heap 或测绘精度；未提交、推送或发布。
