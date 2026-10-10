# 西湖独立景点 Scene 架构

雷峰塔、三潭印月与灵隐寺已接入可进入的独立景点 Scene，运行时注册状态均为 `ready`、`enabled: true`、`hidden: false`。World、主页、地形与路线保持现有结构。

## 注册项

内容保存在 `src/content/west-lake-scenic.json`，运行时通过 `getScenicScene(sceneId)` 查询。清单复用当前西湖模型中的 POI id、简述和资料来源，没有填写不存在的模型地址，也不会预加载资产。

每个注册项预留一个 `loader`。三处已实现景点在 `src/scenic-scenes.js` 中分别绑定自己的 `content` 与动态 loader；只读取轻量文案，不预加载模型或 WebGL。只有点击“进入景点”时才加载 Scene 模块，雷峰塔示例：

```js
loader: (context) => import('./scenes/leifeng-pagoda.js')
  .then((module) => module.createScene(context))
```

`loader(context)` 必须返回一个资源已加载但尚未挂载的 owned instance。instance 的最小接口是：

```js
{
  mount(context) {}, // 同步挂载；异步资产应在 loader 中完成
  reveal({ signal }) {}, // 可选，异步显现；完成返回 true，取消返回 false
  conceal({ signal }) {}, // 可选，异步退场；完成返回 true，取消返回 false
  update(delta) {},  // 可选，由 instance 自己的渲染循环使用
  dispose() {},      // 停止循环并释放 instance 自己创建的资源
}
```

## World 与 Scenic 的切换

`createSceneSession({ world, scenes })` 只接受已启用且具有 `loader` 的注册项。点击进入时先捕获 World 状态，再并行加载 Scene 与调用可选的 `world.flyToScenic(poiId, { signal })`。西湖用原有镜头补间在约 1.35 秒内向塔址地面附近推进；加载与飞行都完成后才暂停 World、同步挂载 Scenic。具有 `reveal()` 的实例会通过 `world.setPaused(true, { keepVisible: true })` 保留冻结的西湖画布，再将覆盖在上方的近景画布用 1.1 秒从透明渐变到不透明，完成后隐藏 World。没有 `reveal()` 的实例直接切换。

界面返回调用 `session.exit({ animate: true })`。已完成进入且具有 `conceal()` 的实例进入 `returning` 状态：先恢复进入前的 World 快照并渲染一帧，再冻结为可见底图，等待近景用 1.1 秒逐渐淡出。完成后释放近景，再次恢复快照并恢复 World 渲染；重复动画返回复用同一 Promise。加载或显现途中返回、没有 `conceal()` 的实例、默认 `exit()` 和 `dispose()` 都立即取消并释放。

新一次 `enter`、默认 `exit()` 或 `dispose` 会通过 AbortSignal 取消飞行和渐变动画，并取消旧的加载结果。飞行和渐变接口返回 Promise：完成为 `true`，取消为 `false`，并负责移除取消监听；渐变动画也会在实例释放时取消。已取消的 loader 如果稍后完成，session 会直接释放它返回的 instance，不会再挂载。加载、飞行或显现错误都会恢复原快照，并由 `enter()` 拒绝，让 UI 显示重试入口；退场错误也会释放近景、恢复 World，并使返回 Promise 拒绝，由 UI 完成恢复。

session 拥有 loader 返回的 instance，但不拥有 World、注册表、传入的 context 或 loader 外部缓存的共享资产。共享纹理、模型缓存等应由提供缓存的上层统一释放，instance 的 `dispose()` 不应销毁仍被其他场景使用的共享资源。session 不调用 `update()`，也不创建渲染循环。

## 雷峰塔实现

- `src/models/leifeng-pagoda.js`：原创近景模型与四个锚点；西湖 World 的小塔复用同一塔体与材质构造，仅缩放至 0.02 倍并省略周边近景环境。World 另按 DEM 密集采样构建小范围水平台基、贴地坡岸与入口短坡，保留原塔址，避免将塔直接叠在斜坡上。建筑外形和环境为艺术化近似，资料与边界见[雷峰塔资料](leifeng-pagoda-sources.md)。
- `src/scenes/leifeng-pagoda.js`：独立 Three.js renderer、CSS2D 热点、镜头移动、Shift 平移与固定展陈光照。WebGL 仅在 `mount()` 时创建；`reveal()` 与 `conceal()` 使用可取消的 Web Animations 同步渐变画布与热点；`dispose()` 清理渐变动画、渲染循环、观察器、监听、实例资源、阴影、几何、材质、DOM 和 WebGL 上下文。
- `src/content/leifeng-pagoda.json`：四处热点的名称、描述和来源，不把文化介绍写进模型代码。
- `src/scenic-ui.js`：进入/渐变返回/错误重试、介绍卡和热点按钮。每次进入从注册项读取当前景点的文案与 `poiId` 照片，替换导航、名称、说明与来源，并隔离已经退出的 Scene 回调。进入期间隐藏并保留 World UI 与原来的 inert 状态，同时锁定画布交互，保留可点击的返回按钮；返回期间锁定交互并淡出景点 UI，完成后恢复普通或沉浸模式，Escape 返回只由当前 Scene 处理一次。系统开启减少动态效果时，西湖直接定位到目标并跳过飞行和渐变动画。

`session.activeScene` 在挂载成功后提供当前实例；显现期间 session 仍处于 `loading` 状态，完成后才进入 `scenic` 状态并开放热点交互。界面通过实例调用 `selectHotspot(id)` 与 `resetView()`；退出或取消后实例变回 `null`。Scene 的 `onHotspot(id)` 回调更新介绍卡和按钮的选中状态。

## 三潭印月实现

- `src/models/santanyinyue.js`：三座瓶形石塔、五孔塔腹、局部小瀛洲岸线与植被的原创艺术化模型，以及四个热点锚点。
- `src/scenes/santanyinyue.js`：独立 renderer 和 CSS2D 热点，沿用进入/返回渐变、镜头探索与资源清理接口，不改变 World 和 session。
- `src/content/santanyinyue.json`：「三塔鼎立」「五孔石塔」「小瀛洲岸线」「月影意境」四个带官方来源的文化热点；图片复用 `santan` 的已授权本地实景照片。
- 三塔尺寸、相对布局与近景岸线没有测绘依据；月影是文化介绍，近景使用固定展陈日光。只制作局部岛岸，具体资料见[三潭印月建模边界](santanyinyue-sources.md)。

## 灵隐寺实现

- `src/data/lingyin-layout.json`：十处建筑的 WGS84 OSM 轮廓、出处与明确标为近似的台地高度；原始 `building:levels` 不用作实测尺寸。
- `src/models/lingyin-temple.js`：五进主殿、罗汉堂卍字形外观和两翼建筑，包含真实屋顶山墙、檐线、柱网、门窗格和逐级院落。四段主轴台阶按实际场景净距连续生成，测试沿路线向下投射射线验证几何无空隙。罗汉堂内部铜殿不做室外轮廓。每个实例分别拥有几何与材质。
- `src/scenes/lingyin-temple.js`：按需创建独立 renderer、七个 CSS2D 热点和固定日光；沿用可取消的双画布进入/返回渐变及资源释放接口。桌面留出右侧卡片位置，手机构图将寺院和选中的殿堂显示在下方卡片上方。
- `src/content/lingyin-temple.json`：天王殿、大雄宝殿、药师殿、直指堂、华严殿、五百罗汉堂和济公殿七处官方来源说明；照片复用已有灵隐景区石刻照片，不称作建筑实景。
- 建筑外观、台地高差和背景均为艺术化近似；未制作室内佛像、飞来峰完整景区或实测构件。布局与结构依据见[建模调查](lingyin-model-research.md)。

历史模式、自动导览、第一人称与 AI 导游仍未实现。

`src/scenic-content.js` 集中导入三份 JSON，注册表和三个 Scene 读取相同的内容对象，避免静态入口与动态入口重复导入 JSON 时的构建属性警告。模型与 renderer 仍各自按需加载。

2026-10-04 验证：95 项 Node 测试与生产构建通过，规格及资源生命周期独立审核通过。桌面与 390×844 浏览器检查了两景点内容、照片、热点、进入/返回；实际测得渐变期间两个 canvas 同时显示且近景 opacity 位于 0 与 1 之间。三潭反复进入、加载中取消和手机返回后无近景 DOM 残留，沉浸返回保持原模式，控制台 error/warn 为空。GPU 帧率、heap 和测绘精度未测量。

同日灵隐寺增量验证：102 项 Node 测试与生产构建通过，模型为 89 个渲染对象、33,346 个三角形。1280×720 和 390×844 浏览器检查了全景、近景、七处内容与选中同步、模型图标和名称点击、全景复位、重复进入/返回、进入中取消及沉浸状态恢复。进入时两个 canvas 同时显示，近景 opacity 实测约 0.0009；返回中约 0.91，均保留 World 底图。返回与取消后只剩一个 World canvas，灵隐热点为零。手机无横向溢出，已检查的主体显示在卡片上方，控制台 error/warn 为空。Shift＋左键完整拖拽由控制集成测试验证；未测 GPU FPS、heap 或实测精度。预览：[桌面全景](../preview-lingyin-scenic.png)、[大雄宝殿近景](../preview-lingyin-daxiong.png)、[手机全景](../preview-lingyin-mobile.png)。修改仅在本地，未同步网站。
