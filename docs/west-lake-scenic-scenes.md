# 西湖独立景点 Scene 架构

雷峰塔、三潭印月、灵隐寺与净慈寺已接入可进入的独立景点 Scene，运行时注册状态均为 `ready`、`enabled: true`、`hidden: false`。World、主页、地形与路线保持现有结构。

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

2026-10-13 相机衔接：World 飞行沿当前观察方向推进，加载与飞行结束后由 `world.captureScenicView(poiId)` 采集实际镜头，session 只将新增的 `entryView` 交给 `mount()`，不修改 loader 或调用方的 context。雷峰塔与三潭印月把相机、目标点转换到微缩模型的局部坐标，并继承有效视场角与画面偏移；三潭近景同时沿用 World 三塔的相对位置和朝向，使渐变首帧的塔体投影对齐。灵隐寺尚无 World 建筑微缩模型，按相同地理朝向和俯仰角对寺院建筑范围构图，不再次叠加建筑自身的轴线旋转。

`src/shared/scenic-entry-view.js` 负责采集镜头和计算构图。近景在 1.1 秒渐变期间保持传入镜头，之后平滑调整距离与目标点，保持观察方向；手动操作取消这段调整。点击热点或“全景”才恢复原有预设镜头参数。手机构图将主体放在下方介绍卡上方；三潭的“全景”和“三塔鼎立”根据当前三塔范围计算预设，避免重排后被卡片遮挡或裁切。

新一次 `enter`、默认 `exit()` 或 `dispose` 会通过 AbortSignal 取消飞行和渐变动画，并取消旧的加载结果。飞行和渐变接口返回 Promise：完成为 `true`，取消为 `false`，并负责移除取消监听；渐变动画也会在实例释放时取消。已取消的 loader 如果稍后完成，session 会直接释放它返回的 instance，不会再挂载。加载、飞行或显现错误都会恢复原快照，并由 `enter()` 拒绝，让 UI 显示重试入口；退场错误也会释放近景、恢复 World，并使返回 Promise 拒绝，由 UI 完成恢复。

session 拥有 loader 返回的 instance，但不拥有 World、注册表、传入的 context 或 loader 外部缓存的共享资产。共享纹理、模型缓存等应由提供缓存的上层统一释放，instance 的 `dispose()` 不应销毁仍被其他场景使用的共享资源。session 不调用 `update()`，也不创建渲染循环。

## 雷峰塔实现

- `src/west-lake/leifeng-pagoda/model.js`：四个锚点与共享塔区核心，包含塔体、保护性台基、局部平台、步道和放生池。World 通过同目录 `overview.js` 按 0.005 统一缩放，塔高约 0.1755 World 单位；原大圆盘与宽斜坡已移除。World 修正已有地形，Scenic 另建闭合坡体，两者使用相同地表高度。布局来源和艺术近似边界见[雷峰塔资料](leifeng-pagoda-sources.md)。
- `src/scenes/leifeng-pagoda.js`：独立 Three.js renderer、CSS2D 热点、镜头移动、Shift 平移与固定展陈光照。WebGL 仅在 `mount()` 时创建；`reveal()` 与 `conceal()` 使用可取消的 Web Animations 同步渐变画布与热点；`dispose()` 清理渐变动画、渲染循环、观察器、监听、实例资源、阴影、几何、材质、DOM 和 WebGL 上下文。
- `src/content/leifeng-pagoda.json`：四处热点的名称、描述和来源，不把文化介绍写进模型代码。
- `src/west-lake/scenic-ui.js`：进入/渐变返回/错误重试、介绍卡和热点按钮。每次进入从注册项读取当前景点文案，按 `src/content/scenic-photos.json` 中的 Scene id 显示总览配图，选择热点时按 `Scene id:hotspot id` 同步替换图片、图注、署名及内容；重置恢复总览，并隔离已经退出的 Scene 回调。进入期间隐藏并保留 World UI 与原来的 inert 状态，同时锁定画布交互，保留可点击的返回按钮；返回期间锁定交互并淡出景点 UI，完成后恢复普通或沉浸模式，Escape 返回只由当前 Scene 处理一次。系统开启减少动态效果时，西湖直接定位到目标并跳过飞行和渐变动画。

`session.activeScene` 在挂载成功后提供当前实例；显现期间 session 仍处于 `loading` 状态，完成后才进入 `scenic` 状态并开放热点交互。界面通过实例调用 `selectHotspot(id)` 与 `resetView()`；退出或取消后实例变回 `null`。Scene 的 `onHotspot(id)` 回调更新介绍卡和按钮的选中状态。

## 三潭印月实现

- `src/models/santanyinyue.js`：三座瓶形石塔、五孔塔腹、局部小瀛洲岸线与植被的原创艺术化模型，以及四个热点锚点。
- `src/scenes/santanyinyue.js`：独立 renderer 和 CSS2D 热点，沿用进入/返回渐变、镜头探索与资源清理接口，不改变 World 和 session。
- `src/content/santanyinyue.json`：「三塔鼎立」「五孔石塔」「小瀛洲岸线」「月影意境」四个带官方来源的文化热点；前三者使用各自实景，“月影意境”使用明确标注的宋代《三潭印月》画作，来源见[配图记录](scenic-photos-santan.md)。
- 三塔尺寸、相对布局与近景岸线没有测绘依据；月影是文化介绍，近景使用固定展陈日光。只制作局部岛岸，具体资料见[三潭印月建模边界](santanyinyue-sources.md)。

## 灵隐寺实现

- `src/data/lingyin-layout.json`：十处建筑的 WGS84 OSM 轮廓、出处与明确标为近似的台地高度；原始 `building:levels` 不用作实测尺寸。
- `src/models/lingyin-temple.js`：五进主殿、罗汉堂卍字形外观和两翼建筑，包含真实屋顶山墙、檐线、柱网、门窗格和逐级院落。四段主轴台阶按实际场景净距连续生成，测试沿路线向下投射射线验证几何无空隙。罗汉堂内部铜殿不做室外轮廓。每个实例分别拥有几何与材质。
- `src/scenes/lingyin-temple.js`：按需创建独立 renderer、七个 CSS2D 热点和固定日光；沿用可取消的双画布进入/返回渐变及资源释放接口。桌面留出右侧卡片位置，手机构图将寺院和选中的殿堂显示在下方卡片上方。
- `src/content/lingyin-temple.json`：天王殿、大雄宝殿、药师殿、直指堂、华严殿、五百罗汉堂和济公殿七处官方来源说明；七个热点分别使用对应殿堂外观照片，来源见[配图记录](scenic-photos-lingyin.md)。
- 建筑外观、台地高差和背景均为艺术化近似；未制作室内佛像、飞来峰完整景区或实测构件。布局与结构依据见[建模调查](lingyin-model-research.md)。

历史模式、自动导览、第一人称与 AI 导游仍未实现。

`src/scenic-content.js` 集中导入三份 JSON，注册表和三个 Scene 读取相同的内容对象，避免静态入口与动态入口重复导入 JSON 时的构建属性警告。模型与 renderer 仍各自按需加载。

2026-10-04 验证：95 项 Node 测试与生产构建通过，规格及资源生命周期独立审核通过。桌面与 390×844 浏览器检查了两景点内容、照片、热点、进入/返回；实际测得渐变期间两个 canvas 同时显示且近景 opacity 位于 0 与 1 之间。三潭反复进入、加载中取消和手机返回后无近景 DOM 残留，沉浸返回保持原模式，控制台 error/warn 为空。GPU 帧率、heap 和测绘精度未测量。

同日灵隐寺增量验证：102 项 Node 测试与生产构建通过，模型为 89 个渲染对象、33,346 个三角形。1280×720 和 390×844 浏览器检查了全景、近景、七处内容与选中同步、模型图标和名称点击、全景复位、重复进入/返回、进入中取消及沉浸状态恢复。进入时两个 canvas 同时显示，近景 opacity 实测约 0.0009；返回中约 0.91，均保留 World 底图。返回与取消后只剩一个 World canvas，灵隐热点为零。手机无横向溢出，已检查的主体显示在卡片上方，控制台 error/warn 为空。Shift＋左键完整拖拽由控制集成测试验证；未测 GPU FPS、heap 或实测精度。预览：[桌面全景](../previews/preview-lingyin-scenic.png)、[大雄宝殿近景](../previews/preview-lingyin-daxiong.png)、[手机全景](../previews/preview-lingyin-mobile.png)。修改仅在本地，未同步网站。

2026-10-13 相机衔接验证：140 项测试与生产构建通过。投影测试覆盖缩放及旋转模型、有效视场角、手机画面偏移、不同场景原点、无微缩模型的朝向继承，以及三塔预设的显示范围。1280×720 浏览器逐帧检查三个景点的飞行与渐变，另外调整三潭与灵隐寺的入场角度；390×844 检查三个景点的最终构图。三潭桌面和手机预设完整显示塔身，手动旋转可接管入场后的镜头调整。渐变中返回后只剩一个 World canvas、零个三潭热点，控制台 error/warn 为空。仅本地更新，未测 GPU FPS 或 heap。

同日配图增量验证：143 项测试与生产构建通过。浏览器逐一选择 15 个探索点，确认图片、图注与名称对应且均已加载，点击模型上的名称也会换图；重置恢复总览。390×844 检查三个景点的配图、署名和文化画作标注，页面无横向溢出，控制台 error/warn 为空。详情媒体保持完整图片，避免裁掉殿堂和塔体。配图与出处见[来源清单](poi-photo-sources.md)，仅本地更新。

## 净慈寺复建方案建筑群（2026-10-14）

- `src/west-lake/jingci-temple/layout.js` / `model.js`：按用户所选复建效果图表达 36 个建筑体块、8 处院落和逐级抬升的中轴石台阶。补齐前院两侧小楼、两翼配殿廊院、左侧独立建筑群、右后院和后部高台三檐大阁，采用方案图的灰瓦木构配色。布局、尺度、院界均为艺术化近似。图源见[出处核查](jingci-reference-provenance-2026-10-14.md)，逐栋对应见[编号与名称清单](jingci-campus-building-map.md)。
- `overview.js`：在寺院代表点 `node/4427428610`（120.1443406,30.2311307）放置共享核心的简化版本，以代表点地面高度为起点，沿原有院落台地逐级升高。取消整寺统一高台及外围裙边；局部展示坡面与台地衔接，并在外围约 100 米范围渐变接回 DEM。源高程文件及衔接范围外地形不变；寺院附近的坡面属于艺术化展示近似，该点也不是游客入口。
- `scene.js`：继续使用独立场景生命周期、Shift＋左键平移、图标缩放和热点避让。World 相机转换到共享核心的局部坐标，单景首帧保持方向和投影，再平滑调整构图；返回使用原有渐变并恢复全景状态。
- 七个探索点中，山门、大雄宝殿、钟楼与石庭沿用各自现状照片，总览为 2008 年从雷峰塔俯瞰的照片。新增后殿、高阁和两翼院落无法与实景照片可靠对应，显示暂无实景照片；说明中明确现状照片可能与方案不同。来源及许可见[配图记录](scenic-photos-jingci.md)。
- 林坡使用三类树冠，共 620 株实例树，全域分布且保留后山树林。树干、树冠避开全部房屋、院落和入口道路；山坡在建筑、院坪与台阶范围压低，保持铺地可见。院落射线与房屋碰撞检查避免山坡覆盖院坪、辅助房屋实体相交和道路长树。

初版核心区验收：153 项 Node 测试与生产构建通过；浏览器在 1280×800 与 390×844 检查四处配图、名称/图标点击、进入与返回。这是布局扩展前的历史记录。

布局扩展验收：156 项 Node 测试与生产构建通过，详细模型 195 个绘制对象、32,042 个基础三角（实例树复制后的渲染三角另计），全景共享简模为 135 个对象、7,380 个三角。新增几何检查包括曲面共边闭合、两端曲线封山面正向可见、院坪首命中、独立院与中轴不交叠、道路无树、高台与林坡连续接触；七个锚点在全景简模和单景详模的首帧投影一致。

最终浏览器验收：1440×900 桌面与 390×844 手机检查了七处内容切换、四张已核对实景照片和三处无对应照片提示，名称和图标均可选中主殿。手机全景主体在详情卡上方，无横向溢出；未选中名称在手机视图收起，触碰或选中时显示白色文本。返回时两画布渐变，结束后一个 World 画布、零个单景标记。最终版本刷新启动与再次进入没有新增控制台 error/warn；开发过程的临时 HMR 中间态错误未计入最终通过结果。预览：[整寺布局](../previews/preview-jingci-campus.png)、[主殿近景](../previews/preview-jingci-campus-daxiong.png)、[手机布局](../previews/preview-jingci-campus-mobile.png)。本轮新增内容未发布，GPU FPS 与 heap 未测。

同日接地修正验收：159 项 Node 测试、生产构建及差异格式检查通过。单景坡体使用 144×136 网格，补齐侧壁和底面并扩大外缘，36 栋建筑、8 处院坪、4 级台地、4 段台阶共 468 个中心和边角射线全部有地形支撑且未被坡面穿入，118 棵外缘树也有地面支撑；闭合边、四向侧壁和底面朝向检查通过。详细模型仍为 195 个绘制对象、109,050 个基础三角（实例复制另计），坡体为一个对象、79,456 个三角。全景只细分局部地形，支撑边缘及台阶射线核对实际渲染三角面与高度查询，七个共享锚点首帧投影保持一致；源 DEM SHA-256 与仓库版本相同。

1440×900 与 390×844 浏览器复查了低角度旋转、主殿名称/详情选择、再次进入和返回。低角度可见完整土层，西湖全景不再出现整寺高挡墙；返回渐变期间单景画布 opacity 实测约 0.953，结束后只剩一个 World 画布、零个单景热点。手机页面无横向溢出，最终刷新后的 error/warn 为空。预览：[封闭地块](../previews/preview-jingci-closed-landform.png)、[贴近地面的视角](../previews/preview-jingci-closed-landform-low.png)、[全景接地](../previews/preview-jingci-grounded-world.png)、[手机低角度](../previews/preview-jingci-closed-landform-mobile.png)。仅本地修复，未发布；GPU FPS、heap 与实测标高仍未验证。

## 雷峰塔景区布局改造（2026-10-15）

移除旧版大圆盘、宽斜坡和最高采样点托平策略。共享 `leifeng-pagoda/model.js`、`site-layout.js` 与 `overview.js` 表达夕照山塔址、保护性基座、外部平台、南侧入口、十段开放地图步道及放生池。World 塔体统一缩放 0.005，Scenic 使用同源地表与闭合山体；附近的树林避开平台、步道和池塘。原始来源与未核验内容见[布局调查](leifeng-scenic-layout-research-2026-10-15.md)。

161 项 Node 测试、生产构建、差异格式检查及数据重复生成检查通过。新增集成测试在实际 DEM 和生产地形代码上依次应用净慈寺与雷峰塔修正，核对高度查询与渲染三角面，并验证第三次重叠调整保持一致；共享锚点首帧投影一致。独立几何检查覆盖全部步道边界、台阶上表面、平台支撑、池塘范围、树根和闭合地块。源 DEM SHA-256 未变。

1280×720 桌面与 390×844 手机检查了入场、塔基名称点击、照片切换、旋转、缩放、全景复位及返回。返回中两画布渐变，结束后一个 World 画布、零个单景热点；手机无横向溢出。预览：[塔与山坡](../previews/preview-leifeng-site-base.png)、[完整景区](../previews/preview-leifeng-site-overview.png)、[手机近景](../previews/preview-leifeng-site-mobile.png)。仅本地更新，未发布；GPU FPS、heap 与真实测绘精度未测。

同日修复全景悬浮外观：地形细分后 `position` / `color` 已增至 224,316 个顶点，旧 `normal` 仍为 180,576 个，导致实际 WebGL 地表绘制异常，而 CPU 射线仍能命中几何。`adjustGround()` 现删除旧法线属性后重新计算，使全部顶点属性与索引一致。集成检查在净慈寺、雷峰塔及第三次重叠修正后分别验证缓冲长度和索引范围，已先观察到旧代码失败再验证修复通过；161 项测试与生产构建再次通过。此前的射线与俯视检查不能单独证明地表已正确绘制。

浏览器复查桌面低角度与 390×844 手机全景，塔下连续坡面可见，进入/返回后保留一个 World 画布、零个单景热点，手机无横向溢出，最终运行无新增 error/warn。预览：[低角度接地](../previews/preview-leifeng-grounded-world-low.png)、[手机接地](../previews/preview-leifeng-grounded-world-mobile.png)。仅本地修复，未发布。
