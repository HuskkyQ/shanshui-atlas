# 拙政园中部园局部布局资料

本文件记录 `src/data/zhuozheng-layout.json` 的来源和建模边界。采集日期为 2026-10-05；数据用于 Three.js 展示，不具有测绘、导航或施工精度。

## 可重放的 OSM 来源

- 原始 XML：[`zhuozheng-layout-source.osm`](./zhuozheng-layout-source.osm)
- 生成器：[`generate-zhuozheng-layout.py`](../scripts/generate-zhuozheng-layout.py)
- 主 API：[OpenStreetMap map endpoint](https://api.openstreetmap.org/api/0.6/map?bbox=120.622,31.3245,120.628,31.328)
- bbox：`120.622,31.3245,120.628,31.328`

生成器保留 `origin = [120.6235, 31.3262]`（WGS84，经度、纬度），并将经度投影为向东的 `x`、纬度投影为向南的 `z`，单位为局部展示米。每个水体、岛、建筑和路径对象都保留相关 OSM way id、原始 WGS84 坐标和 API URL。

关系 `7399712` 的 `natural=water` 外环 `508113067` 是中部主池，inner way `508113071` 和 `508113070` 是真实的二岛洞环；JSON 同时把两条 inner ring 放进 `ponds[0].holes` 和 `islands`，因此水面三角剖分不会把岛填成水。主池 way `508113069` 属于西园池，relation `7399707` 的 outer `508112939` 属于东园池，`508112937`（涵清）也属于东园池，本布局排除它们。保留的中部小水院为 `508112956`、`508113046`、`508113053`。

七个固定建筑 key 及其 OSM footprint 为：远香堂 `485084803`、雪香云蔚亭 `485084802`、荷风四面亭 `485084751`、香洲 `485084785`、梧竹幽居 `508113044`、见山楼（OSM 名为“见山阁”）`485084793`、小飞虹桥 `485084818`。建筑宽深和旋转由 footprint 主边的定向包围盒计算；小飞虹宽度取 bridge 端点间距（约 9 m），深度 2.2 m 为艺术近似。雪香亭的展示基座 y=2.4 m，用来表现其位于西岛高地；二岛高度同样是艺术近似。

路径只取 XML 中真实的 footway/bridge/pedestrian 线段，并按展示 crop `x=4..152, z=-81..44` 裁剪；生成器断言所有路径点留在 crop 内，避免外部园路把布局范围撑大。`metadata.bounds` 是展示 crop，不是 OSM 园界，也不表示所有被裁去的园外道路不存在。

## 参考资料与边界

苏州市园林和绿化管理局的[拙政园总览](https://ylj.suzhou.gov.cn/szsylj/sjyc/201905/c1df393edc8745abb20e8a9bd5525782.shtml)、[理水说明](https://ylj.suzhou.gov.cn/szsylj/ylys/201903/df5a3bf3bdbd49b0b787076f355b1074.shtml)、[建筑说明](https://ylj.suzhou.gov.cn/szsylj/ylys/201903/484421d38f504f5787a8f307925e3ad7.shtml)用于名称、景观关系和建筑类型的语义参考。UNESCO 保护范围图和遥感图只能核对整体范围，不能替代中部内部测绘。

OSM footprint 是公开地图数据，坐标投影和建筑尺寸仍是展示用途。没有把艺术高度、墙体厚度、室内结构或路径连通关系表述为实测事实；OSM 的“见山阁”标签与用户固定接口 `jianshan-lou` 的“见山楼”显示名差异已在 JSON source 中保留。
