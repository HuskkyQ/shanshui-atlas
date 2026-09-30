# 西湖湖边与湖内轻量建模数据

`src/data/west-lake-built-landmarks.json` 是从本地缓存的 OpenStreetMap XML
复现生成的 WGS84 几何数据。生成命令为：

```sh
python3 scripts/generate-west-lake-built-landmarks.py
# 使用另一份缓存目录复现
python3 scripts/generate-west-lake-built-landmarks.py --osm-dir /path/to/west-lake-osm
```

默认缓存目录是 `/tmp/west-lake-terrain`。脚本读取目录内所有 `.osm` 文件，按
`node`、`way`、`relation` 各自的 OSM `version` 保留最高版本，再生成 JSON；因此
同一元素同时出现在多个区域缓存文件中时，不会因为文件遍历顺序覆盖新数据。
缓存目录本身不属于仓库，重新获取时可以用 OSM API 的 bbox 接口，例如：

```sh
mkdir -p /path/to/west-lake-osm
curl -L 'https://api.openstreetmap.org/api/0.6/map?bbox=120.12,30.23,120.16,30.27' \
  -o /path/to/west-lake-osm/west-lake.osm
python3 scripts/generate-west-lake-built-landmarks.py --osm-dir /path/to/west-lake-osm
```

若 bbox 响应缺少某个完整关系或建筑轮廓，可按元素类型补取，再放入同一缓存
目录后重新生成：

```sh
curl -L 'https://api.openstreetmap.org/api/0.6/relation/5740510/full' \
  -o /path/to/west-lake-osm/relation-5740510-full.osm
curl -L 'https://api.openstreetmap.org/api/0.6/way/1466925249/full' \
  -o /path/to/west-lake-osm/way-1466925249-full.osm
```

补取的 `.osm` 必须保留 API 返回的 `version`、节点和 way 成员；生成器会自动把
它们与 bbox 缓存合并。OSM 数据许可和署名要求见
[OpenStreetMap Copyright](https://www.openstreetmap.org/copyright)。

数据包括：

- 苏堤和白堤的连续步道链。链路按共享 OSM 节点拼接，并把苏堤六座桥、断桥、锦带桥的步道段放在同一条真实连通链路中；`nodeIds` 和 `osmWays` 保留了来源。
- 六座苏堤桥，以及断桥、锦带桥的两节点中心线和可用的桥体轮廓。
- 湖心亭建筑轮廓、小瀛洲 multipolygon 的外轮廓和内环（单独放在 `islands` 字段）。
- 三潭印月的景区轮廓，以及缓存数据中唯一带 `三潭石塔` 标签的独立点位。

来源元素可直接在 OSM 查看：

- [苏堤](https://www.openstreetmap.org/way/30072145)、[白堤](https://www.openstreetmap.org/way/28538286)
- [映波桥](https://www.openstreetmap.org/way/30072147)、[锁澜桥](https://www.openstreetmap.org/way/30072144)、[望山桥](https://www.openstreetmap.org/way/30072139)、[压堤桥](https://www.openstreetmap.org/way/30072130)、[东浦桥](https://www.openstreetmap.org/way/30075392)、[跨虹桥](https://www.openstreetmap.org/way/30072125)
- [断桥步道](https://www.openstreetmap.org/way/28538289)、[断桥轮廓](https://www.openstreetmap.org/way/1466925249)、[锦带桥](https://www.openstreetmap.org/way/28538285)、[锦带桥轮廓](https://www.openstreetmap.org/way/1466925248)
- [湖心亭建筑](https://www.openstreetmap.org/way/30086285)、[小瀛洲关系](https://www.openstreetmap.org/relation/5740510)、[三潭印月景区](https://www.openstreetmap.org/way/975360503)、[三潭石塔点位](https://www.openstreetmap.org/node/9025997767)

这些数据是位置、轮廓和步道拓扑，不是测绘级建筑网格。`causeways[].widthMetres`
（苏堤约 30m、白堤约 20m）和 `bridges[].widthMetres`（约 18m）均明确标记为
`widthApproximate: true`，是完整堤岸和桥体的视觉建模尺寸，不能当作实测值。桥拱、
栏杆、亭顶、石塔形制等应继续使用现场照片或景区官方资料校准。三潭的
`landmarks[].points` 是对象数组，字段为 `name`、`longitude`、`latitude`、
`osmElement`，方便模型侧直接生成交互点。

特别是三潭印月：缓存 OSM 和实时 OSM 查询都只确认了一个独立的三潭石塔点位，
因此输出只包含这个点，另外两座塔不能用估算坐标冒充真实数据。杭州市文化广电
旅游局的[三潭印月资料](https://wgly.hangzhou.gov.cn/attach/538/2307051510367229.pdf)
说明三座石塔位于岛南水域，建模时应把它们放在水中，不能放到小瀛洲岛轮廓内部；
三塔的另外两个位置仍需依据该资料或现场影像校准。
