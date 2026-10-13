# 西湖游览路线与湖畔景点

调查与地图下载日期：2026-09-30。坐标均采用 OSM 的 WGS84，与现有 DEM、湖岸一致。

杭州文旅的[《杭州市10条文化旅游精品线路》](https://wgly.hangzhou.gov.cn/module/download/downfile.jsp?classid=0&filename=c3ccb4250d3143a09047ee20fbe1170c.pdf)给出北岸的断桥、白堤、平湖秋月、中山公园、西泠印社，以及第二天的雷峰塔、苏堤春晓、岳庙等节点。模型参考这些节点，用公开地图步道串联出下面两段；完整环线为本项目整理的步行展示示意，不是官方发布的完整导航路线。

| 展示线 | 景点顺序 | 地图折线长度 |
| --- | --- | --- |
| 白堤北岸线（金色） | 断桥残雪 → 白堤 → 平湖秋月 → 孤山 → 西泠桥 → 岳王庙 → 曲院风荷 | 3,348 米 |
| 苏堤环湖线（青绿） | 曲院风荷 → 苏堤 → 花港观鱼 → 雷峰塔附近 → 南岸 → 柳浪闻莺 → 湖滨 → 断桥残雪 | 9,099 米 |

几何由四个 OSM map API 分片提取，下载 URL、524 个路线节点 ID、每条边所属 way ID 均保存在 `src/data/west-lake-routes.json`。Dijkstra 优先选择 footway、path、pedestrian、steps 等步行道路，排除禁止步行、私有道路和船线。北段含约250米公共道路连接，南段约116米；它们同样来自地图道路几何，详见 `mixedRoadWayIds`。两段共享起终点，没有额外的穿湖直线。最大景点到步道的偏移约51.5米；路线长度包含景点附近的短支路，按地图折线估算，不代表实际行走耗时或当前开放状态。

8 个新增点位保存在 `src/data/west-lake-attractions.json`，保留原6座山的独立数据。普通点位用 OSM node；岳王庙与雷峰塔用相应建筑 way 的几何中心。建筑标记与附近步道分开，模型不还原建筑细节。

景点资料还参考杭州政府的[曲院风荷荷花报道](https://www.hangzhou.gov.cn/art/2023/6/18/art_812268_59082764.html)、文旅局的[雷峰塔介绍](https://wgly.hangzhou.gov.cn/art/2022/12/1/art_1229696389_58943150.html)和[柳浪闻莺介绍](https://wgly.hangzhou.gov.cn/art/2022/12/1/art_1229696389_58943144.html)。花港观鱼的点位及地理描述采用公开地图资料。地图几何署名：© OpenStreetMap contributors，适用[ODbL](https://www.openstreetmap.org/copyright)。

重新提取路线：使用 JSON 中的4个分片URL下载 XML，然后运行 `python3 scripts/generate-west-lake-routes.py <northwest.osm> <northeast.osm> <southwest.osm> <southeast.osm>`。原始下载文件仅作为本地再现输入，不随构建发布。

渲染采用随 DEM 起伏的彩色带，白堤和苏堤处高于湖面，「去除光影」模式隐藏路线与标记。点击“游览路线”切换到湖区俯瞰；点击标记或侧栏进入景点视角。路线和点位只在西湖场景生效。

验收：`npm test` 共10项通过，`npm run build` 通过。浏览器检查了1280×720与390×844布局、8个景点切换和来源链接、模型热点点击、纯模型隐藏/恢复、黄山原登山路线及景点。两场景未记录到控制台错误。截图为 `../previews/preview-west-lake-routes.jpg` 和 `../previews/preview-west-lake-routes-mobile.jpg`。
