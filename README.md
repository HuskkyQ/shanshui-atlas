# 山形志 · 黄山与杭州西湖

一个基于 Three.js 的中国山水交互式 3D 展示。首页提供黄山与杭州西湖两个模型入口，采用现有模型的实景截图作为预览。黄山核心区山体由 Copernicus DEM GLO-30 高程数据生成，松树、碎石与云海为艺术化效果；它不是测绘级的真实地形模型。

## 杭州西湖与群山

根路径 `/` 打开首页，点击景观卡片进入模型。西湖入口为 `/?place=west-lake`，黄山入口为 `/?place=huangshan`。模型页顶部「黄山 / 西湖」切换景观，点击左上角「山形志」返回首页。首页仅加载静态预览图，进入景观后才加载 Three.js 和地形数据。

- 地貌参考：[Google Maps 西湖地形视图](https://www.google.com/maps/@30.238,120.125,13z/data=!5m1!1e4)，用于核对西湖三面环山和西侧连续山脊。实际建模高程与黄山一样，来自公开的 [Copernicus DEM GLO-30](https://registry.opendata.aws/copernicus-dem/)。
- 高程瓦片：`Copernicus_DSM_COG_10_N30_00_E120_00_DEM.tif`。裁剪范围约东经 120.055°–120.171°、北纬 30.166°–30.286°，约 11 × 13 公里。`src/data/west-lake-dem.bin` 保存 418 × 432 个原始高程样本，使用带符号的 16 位小端分米编码，保留范围内略低于零米的数值。元数据记录 GeoTIFF 像素中心坐标，所有点位使用 WGS84。
- 水平比例根据中心纬度换算，南北朝向与黄山相同，地理北方为世界坐标 `-z`。山体采用 **4 倍垂直夸张**，用于辨认低海拔山脊；30 米级 DSM 包含植被和建筑表面高程，不能替代测绘或导航资料。
- 湖岸来自 © OpenStreetMap 贡献者的[西湖关系 2308774](https://www.openstreetmap.org/relation/2308774)，湖面按轮廓三角化，保留岛屿与堤岸形成的陆地区域。当前来源的 33 个内环中有一处嵌套陆地边界，生成脚本合并为 32 处有效陆地区域，避免三角化误填小岛；处理数量记录在 `src/data/west-lake-shore.json`。湖面采用源 DEM 湖内样本中位数 **7.5 米**的平整示意面，渲染时下移湖底，高程文件本身不变；这不是当日水位观测。
- 六座山的地理地点为[宝石山](https://www.openstreetmap.org/node/5580634142)、[葛岭东峰](https://www.openstreetmap.org/node/5580634141)、[北高峰](https://www.openstreetmap.org/node/2763362675)、[南高峰](https://www.openstreetmap.org/node/5162287122)、[五云山](https://www.openstreetmap.org/node/756935539)、[玉皇山](https://www.openstreetmap.org/node/4943773762)，公开地图坐标保存于 `src/data/west-lake-landmarks.json`。山脊为 DEM 生成，树木与湖面水纹为艺术化效果。
- 湖上实体模型包括苏堤、白堤的堤身与步道、沿岸柳树和桃树，苏堤六座石拱桥、断桥、锦带桥，湖心亭的双檐亭阁、三潭印月的三座瓶形石塔，以及小瀛洲的石岸轮廓。模型由 `src/west-lake-built-models.js` 生成，无须购买外部模型；真实路径、桥段和轮廓保存在 `src/data/west-lake-built-landmarks.json`，来源及复现方法见[湖上地标建模资料](docs/west-lake-built-landmarks.md)。堤宽、桥拱、树木及建筑细节为艺术化近似；三潭只有一座独立石塔已按 OSM 定位，另外两座在岛南水域近似摆放。
- 在「湖畔名胜」中点击这些景点，或在地图上点击对应图标，可查看介绍和近景。西湖现在允许进一步放大查看建筑；选择实体模型的视角时暂停自动旋转、收起路线覆盖，切回总览或路线视角恢复原有展示。拉远时保留堤岸、桥体、亭阁与石塔轮廓，靠近后显示栏杆与石塔五孔；这些实体在「去除光影」模式中继续保留。
- 侧栏按「上山口、山间名胜、湖畔名胜、西湖群山」四组展开，地图随分组显示点位。点位使用 C「立体地标剪影」：山峰、寺观、洞穴、上山口、湖畔按类别区分；悬停描边，选中使用浅金色底框。点击标记或侧栏可查看介绍与资料。新点位分别记录在 `src/data/west-lake-trailheads.json`、`src/data/west-lake-hill-sights.json`，整理表见[西湖群山点位资料](docs/west-lake-pois.md)。
- 支持「湖山全景」「湖畔之间」「湖西群山」「游览路线」「群山徒步」、六座山地点位、上山口与山间名胜标记、实时太阳/月亮光照、罗盘、漫游开关与去除光影模式。光照按杭州西湖附近的北纬 30.241°、东经 120.140°计算；路线和去除光影视角暂停自动旋转。
- 「群山徒步」保留五条彩色精选主线，并用浅色细线补充真实 OSM 分叉与共享步道。湖西路网连接北高峰、南高峰、十里琅珰、五云山及梅家坞、云栖、九溪支路；宝石山、玉皇山各自保留独立网络。当前有 1,004 段共享步道、524 个分叉，不把地图缺口补成直线。玉皇山精选步道段约 1.17 公里。覆盖范围、调查来源、原始数据校验和复现方法见[群山徒步资料](docs/west-lake-hikes.md)及[路网调查记录](docs/west-lake-trail-network-research.md)。

路网更新验收（2026-09-30）：31 项测试与生产构建通过；全部 10,798 条边已对原始 OSM XML 核验，连续性、坐标、访问标签及普通道路精确边检查无错误。浏览器检查了 1280×720 与 390×844 的路网、图例、沉浸模式点位点击、去除光影隐藏及恢复，未记录控制台错误。预览：[桌面路网](preview-west-lake-trail-network.png)、[手机沉浸路网](preview-west-lake-trail-network-mobile.png)。这是选取的地图步道网络，不是完整官方徒步导航。

重建西湖数据需要 Python Pillow。先下载高程瓦片、完整西湖关系和六处 OSM 节点到临时目录，再运行：

```bash
mkdir -p /tmp/west-lake-terrain
curl -fL 'https://copernicus-dem-30m.s3.amazonaws.com/Copernicus_DSM_COG_10_N30_00_E120_00_DEM/Copernicus_DSM_COG_10_N30_00_E120_00_DEM.tif' -o /tmp/west-lake-terrain/N30E120.tif
curl -fL 'https://api.openstreetmap.org/api/0.6/relation/2308774/full' -o /tmp/west-lake-terrain/west-lake.osm
curl -fL 'https://api.openstreetmap.org/api/0.6/nodes?nodes=5580634142,5580634141,2763362675,5162287122,756935539,4943773762' -o /tmp/west-lake-terrain/peaks.osm
python3 scripts/generate-west-lake.py /tmp/west-lake-terrain/N30E120.tif /tmp/west-lake-terrain/west-lake.osm /tmp/west-lake-terrain/peaks.osm
```

数据源访问与地貌核对日期：2026-09-30。两处模型都属于高程数据驱动的微缩景观，细小建筑、树木和岩石不代表实物细节。

两处模型页均提供「沉浸式体验」：侧栏向两侧淡出，只保留退出按钮和地图点位。悬停或键盘聚焦点位可显示名称与介绍，点击固定信息卡，点击空白地图、开始旋转或缩放时收起；点击「退出沉浸」或按 Escape 恢复原视角与分组。沉浸期间暂停自动旋转，保留水面与云层动画；进入时会退出「去除光影」模式以恢复点位。西湖在沉浸期间显示所有分组的点位。

两个模型支持 Shift＋左键拖拽平移，普通左键继续旋转，滚轮与原有双指手势继续缩放。平移同步移动相机和观察中心，便于把侧边的西湖移入画面；切换探索视角会回到该视角的预设位置。该手势同样适用于沉浸模式和去除光影模式。

平移验证（2026-10-01）：38 项测试与生产构建通过。新增 7 项真实 OrbitControls 集成测试，通过 Node DOM stub 检查相机/目标同步平移、平移后旋转、其他鼠标与双指操作及监听清理；浏览器检查了两个模型载入、西湖普通左键旋转，以及 940px/1280px 页脚提示布局。带修饰键的完整拖拽由集成测试验证，未在浏览器中模拟该完整手势。

湖上地标验证（2026-10-01）：47 项测试与生产构建通过。新增 9 项测试检查几何朝向、真实桥段对齐、三座石塔接水与位置来源、实体保留及投影 LOD；OSM 提取脚本重跑与保存 JSON 逐字节一致。浏览器检查了 1280×720 断桥、湖心亭和三潭近景、沉浸图标点击、去除光影及恢复，以及 390×844 新增景点选择和亭阁近景，未记录渲染错误。预览：[断桥实体](preview-west-lake-bridge-model.png)、[湖心亭](preview-west-lake-pavilion-model.png)、[三潭石塔](preview-west-lake-stone-pagodas.png)。几何预算测试验证了新增层的绘制批次和三角形数量，没有进行 GPU 帧率测量。

验证：22 项自动测试与生产构建通过。浏览器检查了西湖桌面/手机沉浸切换、点位点击固定、键盘聚焦提示、空白处取消、Escape 退出、原视角/分组恢复，以及黄山点位介绍和去除光影进入沉浸。未记录控制台错误；截图为 `preview-west-lake-immersive.jpg`、`preview-west-lake-immersive-mobile.jpg` 与 `preview-huangshan-immersive.jpg`。

执行 `npm test` 检查西湖栅格尺寸、带符号高程、湖内与陆地点位以及湖面三角网的面积守恒。该面积检查会检测嵌套孔洞导致的小岛误填。

## 黄山地形数据

- 来源：[Copernicus DEM GLO-30](https://dataspace.copernicus.eu/explore-data/data-collections/copernicus-contributing-missions/collections-description/COP-DEM)，公开数据由 [AWS Open Data](https://registry.opendata.aws/copernicus-dem/) 提供。原始瓦片为 `Copernicus_DSM_COG_10_N30_00_E118_00_DEM.tif`，模型使用约东经 118.120°–118.192°、北纬 30.104°–30.180° 的裁剪区域，以容纳西门和北门点位。
- `src/data/huangshan-dem.bin` 保存裁剪后的 30 米级高程栅格，`src/data/huangshan-dem.json` 记录范围和尺寸。`scripts/generate-terrain.py` 可从原始 GeoTIFF 重新生成这两个文件，需要 Python Pillow。
- 山体在场景中做了约 1.9 倍的垂直夸张，以突出山脊与峡谷；30 米级高程数据无法还原单个奇石、绝壁和松树。Google 地图的地形图层用于核对地貌走势，项目未复制其地图瓦片或调用其高程 API。

Data attribution: produced using Copernicus WorldDEM-30 © DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH 2014-2018 provided under COPERNICUS by the European Union and ESA; all rights reserved.

## 登山点位

场景标出四处山脚徒步登山点：南门前山[慈光阁](https://www.openstreetmap.org/way/137223201)、南门后山[云谷寺](https://www.openstreetmap.org/node/13372245165)、北门[松谷庵站](https://www.openstreetmap.org/way/214868363)、西门[钓桥庵](https://www.openstreetmap.org/node/2924632541)。坐标取自 © OpenStreetMap 贡献者的相应地名或站点要素，以 WGS84 经纬度映射到高程网格；标记代表地名附近位置，不保证与检票闸机或步道起点精确重合。东大门目前没有从山脚到东海索道上站的徒步登山游步道，未列入这四处标记。

## 上山路线

「登山路线」视角绘制四条山脚徒步主线：慈光阁经半山寺至玉屏楼、云谷寺经白鹅岭至北海、松谷庵经松谷景区至北海、钓桥庵经三溪口与步仙桥至天海。另补上玉屏楼经百步云梯、鳌鱼洞至天海，以及天海经光明顶至北海两段共享步道，让四条入口线在模型中连通。节点顺序核对了[黄山风景区管委会的路线资料](docs/huangshan-ascent-routes.md)；其中西线参考 2007—2025 年总体规划，不能据此判断当前开放。路线采用 [OpenStreetMap 地图数据](https://www.openstreetmap.org/copyright)中的 `path`、`footway`、`steps` 连通步道，经节点寻路并按现有 DEM 高程贴到山体；不是导航轨迹。松谷庵站牌坊到已绘步道间约 103 米为近似连接。索道和轮休山峰支线未绘制，实际通行请查景区公告。

路线表面改为重复石阶形状；台阶密度按模型视觉效果设置，不代表真实台阶的数量、宽度或每级高差。

静态路线坐标在 `src/data/huangshan-routes.json`。若要复现：从 [OSM 主 API](https://api.openstreetmap.org/api/0.6/map?bbox=118.120,30.104,118.192,30.180)取得该范围 XML，再运行 `python3 scripts/generate-routes.py 地图文件.osm`。脚本按上述官方节点顺序，在可通行标记的主步道连通图中提取路线；它不判断实时开放状态。

## 山上名胜

在现有迎客松视角之外，右下角新增光明顶、莲花峰、天都峰、始信峰、飞来石、排云亭六个探索入口。点击入口或山体上的金色标记，镜头会移向对应位置并显示简短介绍与景区资料链接。点位坐标来自 © OpenStreetMap 贡献者的公开要素，景点选择和描述参考[黄山风景区管委会资料](docs/huangshan-landmarks.md)；具体对象与坐标记录在 `src/data/huangshan-landmarks.json`。坐标和 30 米级高程只能近似定位，不能还原飞来石、亭阁等景物的实体细节，也不代表该景点实时开放或可达。

## 实时光照

场景用 [SunCalc](https://github.com/mourner/suncalc) 根据黄山核心区中心坐标（约北纬 30.12847°、东经 118.16292°）和当前时间计算太阳、月亮方位。白天的日光从实际方位照射，清晨与傍晚逐渐变暖、变暗；夜晚仅在月亮位于地平线上方时按月相和高度加入冷色月光。月亮未升起时保留少量环境光以辨认山体。页面时间统一显示为北京时间，每分钟刷新一次；光照不包含实时天气和地形以外的遮挡。

## 本地运行

```bash
npm install
npm run dev
```

打开终端显示的本地地址。执行 `npm run build` 可生成 `dist/` 静态文件。

## 操作

- 左键拖动旋转，Shift＋左键拖动平移，滚轮或双指手势缩放。
- 右侧罗盘的 N 指向模型的地理北方，拖动或切换视角时会跟着转动；去除光影模式隐藏罗盘。
- 点击「群峰全景」「迎客松」「云海之间」「登山路线」切换视角；右下角「山上名胜」可逐点探索六处景点。
- 点击「自动漫游」暂停或恢复自动旋转与云雾运动。
- 右上角「去除光影」关闭太阳/月亮光照、投影、云雾及水面反光，以均匀照明保留模型原色；同时进入完整模型视角，隐藏页面文案并暂停自动旋转；点击「恢复光影」会恢复原视角和实时光照。
- 四个牌坊剪影对应登山点地名位置；鼠标悬停或触屏轻点图标时显示名称。「登山路线」视角暂停自动旋转，俯瞰四条彩色上山线及浅色山顶联络线；离开该视角后恢复原来的漫游设置。切换到「去除光影」时隐藏图标、线路和名胜标记。

西湖桌面侧栏固定序号、名称和箭头三列，长名称保持单行，悬停和选中时向右移动 6px，并为完整名称与箭头预留空间。用户已选择图标方案 C，两个模型共用 `src/landmark-icons.js`：22px 分层剪影固定朝向屏幕，随三维点位定位；黄山飞来石另用奇石剪影。相近图标通过 `src/landmark-layout.js` 在屏幕内避让，细引线连接原锚点，不改变地图坐标。三组候选预览保留在 `public/design/scenic-icon-options.html`（本地预览 `/design/scenic-icon-options.html`）。

C 方案验证：25 项测试与生产构建通过；浏览器检查了黄山和西湖的桌面、390px 手机视口与沉浸模式点位点击，西湖徒步总览中 29 个图标中心均命中自身。未记录控制台错误；预览为 `preview-west-lake-icons-c.png`、`preview-west-lake-icons-c-mobile.png` 与 `preview-huangshan-icons-c.png`。

后续样式调整：图标在普通、悬停、键盘聚焦及选中状态均去除底框，仅保留图标自身的高亮；名称提示和介绍卡样式保留。生产构建通过，黄山选中/聚焦与西湖沉浸点击已在浏览器复查，最新预览为 `preview-west-lake-icons-unframed.png`。透视相机与图标叠加层保持现有效果。

使用系统减少动态效果设置时，自动漫游默认关闭。

## 树木与远近细节

两个模型共用 `src/tree-models.js` 的层叠松、偏冠松、圆冠阔叶树和细长阔叶树。树干、分枝与多簇树冠合并为单棵树的几何，提供精细和简化两版；黄山以松树为主，西湖以阔叶树为主。树林依据稳定随机种子在地形上散布，大小、朝向与色调有所变化，缩放时不会重新随机位置。黄山避开陡崖、步道、标志松和景点标记；西湖避开湖水、低地和山地点位。树种及其位置是艺术化表达，没有接入真实植被调查。

`src/forest.js` 按每棵树的屏幕投影大小调整细节。远景只显示较少的简化树，树木从约 4 到 30 像素逐步增加显示密度；接近 24 像素时改用精细树，拉远到 21 像素以下再简化，避免阈值附近反复切换。靠近时增加树冠和枝干细节，视野之外的树不绘制。四种树分别批量实例化，森林最多使用 8 批绘制，精细树总量上限为 1400，超出的树保持简化版。LOD 更新间隔至少 0.12 秒，镜头不变时跳过更新。黄山最小观察距离由 10 调为 6，便于查看树冠。

`npm test` 包含几何预算、固定随机分布、湖水与步道避让、远近密度变化以及精细树上限的检查。
