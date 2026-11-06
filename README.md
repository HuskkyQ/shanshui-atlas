# 山水志 · 中国山水与园林的三维漫游

**Shanshui Atlas** 是一个基于 Three.js 的中国山水交互式 3D 展示。首页提供黄山、西湖、长白山、漓江兴坪、拙政园、承启楼、大慈岩和周庄入口；景点数据保留来源说明，并明确区分地形依据与艺术化近似。[访问山水志](https://shanshui.piihub.icu/)。

## 快速开始

项目需要 Node.js 22.12 或更高版本。依赖安装沿用 npm 锁文件；安装后可用 `npm run dev` 或 `pnpm dev` 启动。

```bash
npm install
npm run dev
npm test
npm run lint
npm run format:check
npm run build
```

干净检出可运行项目测试与构建。需要本地研究快照的来源比对在快照目录未提供时会单独标记为跳过。

## 目录结构

- `src/main.js`：首页路由和景点入口。
- `src/landscape/`：黄山、西湖总览及公共展示页面。
- `src/<place>/`：独立景点的模型、场景和交互。
- `src/shared/`：罗盘、光影、漫游、布局和资源生命周期工具。
- `src/data/`、`src/content/`：生成数据与景点内容。
- `scripts/`：从公开来源快照生成运行时数据，依赖见 [`scripts/README.md`](scripts/README.md)。
- `tests/`：模型、布局、导航和 UI 状态测试。

## 新增景点

先在 `src/places/registry.js` 登记来源和动态加载入口，并在 `src/places/catalog.json` 登记首页卡片，再添加对应景点模块、数据来源文档、测试和封面。景点页应复用公共罗盘、光影、沉浸和自动漫游控件；首页来源卡片必须链接到可核验来源与近似边界。

页面布局、光影、沉浸、漫游和验收要求见[开发手册](docs/development-guide.md)。

## 数据边界

DEM、OSM 和官方资料用于地形、道路、桥位及景点布局依据；普通建筑、树木、材质和局部构件可以按项目约定简化。模型不是测绘成果，也不是实时导航。各景点的具体来源、生成命令、验收结果和未测量指标见 [`docs/`](docs/)。

## 历史记录

工程和界面变更见 [变更记录](docs/changelog.md)。历史验收和原始研究快照保留在本地工作区。
