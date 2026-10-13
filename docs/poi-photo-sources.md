# 景点实景图片来源

全景地图图片用于景点详情卡片，文件保存在 `public/images/pois/`，并通过 `src/content/poi-photos.json` 按 POI id 关联。所有图片均从 Wikimedia Commons 页面下载为不超过 960px 宽的本地 JPEG；详情卡片应同时展示作者、许可和来源链接。

## 独立景点的探索点配图

雷峰塔、三潭印月和灵隐寺另有 3 张总览与 15 张探索点配图，位于 `public/images/scenic/`。`src/content/scenic-photos.json` 以 Scene id 关联总览，以 `Scene id:hotspot id` 关联探索点，避免同名热点跨景点串图。切换时图片、图注、作者、许可和来源一起更新；没有单独配图时显示缺图状态，不回退为其他探索点的图片。

- [雷峰塔来源](scenic-photos-leifeng.md)：完整塔身、遗址内保存的塔基、塔檐下构件，以及从雷峰塔高处眺望西湖。
- [三潭印月来源](scenic-photos-santan.md)：三塔同框、石塔孔洞近景、小瀛洲水岸；“月影意境”用叶肖岩《三潭印月》宋代绘画，并在图注明确标注非实景照片。
- [灵隐寺来源](scenic-photos-lingyin.md)：山门总览及七处殿堂对应外观，替换单景中原先共用的飞来峰石刻照片。

2026-10-13 核验：18 个本地 JPEG 均可解码且宽度不超过 960px，合计约 4 MB。保留各 Commons 文件页的署名与许可证；画作同时记录馆方出处。

## 已覆盖

| POI | 本地文件 | 景点对应关系 | 作者 | 许可 | 来源 |
| --- | --- | --- | --- | --- | --- |
| leifeng | `leifeng.jpg` | 西湖望雷峰塔 | Bjoertvedt | CC BY-SA 4.0 | [Commons](https://commons.wikimedia.org/wiki/File:West_Lake_IMG_8792_leifeng_pagoda.jpg) |
| lingyin-temple | `lingyin.jpg` | 灵隐寺 | Dave Proffer | CC BY 2.0 | [Commons](https://commons.wikimedia.org/wiki/File:Lingyin_Buddhist_Temple,_Hangzhou_(3019250421).jpg) |
| santan | `santan.jpg` | 三潭印月 | Hangzhou West Lake, Ten Thousand Strangers | CC BY 4.0 | [Commons](https://commons.wikimedia.org/wiki/File:Three_Pools_Mirroring_the_Moon.jpg) |
| duanqiao | `duanqiao.jpg` | 断桥残雪 | Suicasmo | CC0 1.0 | [Commons](https://commons.wikimedia.org/wiki/File:Broken_Bridge_(Hangzhou)_20250505.jpg) |
| pinghu | `pinghu.jpg` | 平湖秋月临湖景观 | Zhou Guanhuai | CC BY-SA 4.0 | [Commons](https://commons.wikimedia.org/wiki/File:西湖十景-平湖秋月.jpg) |
| sudi | `sudi.jpg` | 苏堤 | DXR | CC BY-SA 4.0 | [Commons](https://commons.wikimedia.org/wiki/File:Su_Causeway_near_West_Lake,_looking_towards_north_20120529_1.jpg) |
| baidi | `baochu.jpg` | 白堤与保俶塔远景共同景观 | Shujianyang | CC BY-SA 4.0 | [Commons](https://commons.wikimedia.org/wiki/File:West_Lake_2025.06_03.jpg) |
| quyuan | `quyuan.jpg` | 曲院风荷 | Zhou Guanhuai | CC BY-SA 4.0 | [Commons](https://commons.wikimedia.org/wiki/File:西湖十景-曲院风荷.jpg) |
| liulang | `liulang.jpg` | 柳浪闻莺 | Zhou Guanhuai | CC BY-SA 4.0 | [Commons](https://commons.wikimedia.org/wiki/File:西湖十景-柳浪闻莺.jpg) |
| gushan | `gushan.jpg` | 孤山眺望西湖 | CatOnMars | CC BY-SA 4.0 | [Commons](https://commons.wikimedia.org/wiki/File:View_of_the_West_Lake_from_Gushan.jpg) |
| huagang | `huagang.jpg` | 花港观鱼 | Shizhao | CC BY-SA 1.0 | [Commons](https://commons.wikimedia.org/wiki/File:View_Fish_in_the_Flower_Harbour.JPG) |
| yuemiao | `yuemiao.jpg` | 岳王庙 | Takashishin | CC BY 4.0 | [Commons](https://commons.wikimedia.org/wiki/File:Yu_Fei_Temple.jpg) |
| baochu-tower | `baochu.jpg` | 宝石山、保俶塔、白堤和断桥同景 | Shujianyang | CC BY-SA 4.0 | [Commons](https://commons.wikimedia.org/wiki/File:West_Lake_2025.06_03.jpg) |
| huxinting | `huxinting.jpg` | 湖心亭所在小岛 | Bjoertvedt | CC BY-SA 4.0 | [Commons](https://commons.wikimedia.org/wiki/File:West_Lake_IMG_8761_huxin_pavillion_island.jpg) |
| xiaoyingzhou | `santan.jpg` | 小瀛洲附近湖面的三潭印月石塔周边景观 | Hangzhou West Lake, Ten Thousand Strangers | CC BY 4.0 | [Commons](https://commons.wikimedia.org/wiki/File:Three_Pools_Mirroring_the_Moon.jpg) |
| jiuxi-mist-tree | `jiuxi.jpg` | 九溪烟树题记与溪谷景观 | Shizhao | CC BY 1.0 | [Commons](https://commons.wikimedia.org/wiki/File:Jiuxiyanshu.JPG) |
| longjing-spring | `longjing.jpg` | 龙井泉周边龙井茶村景观 | Niklas Dougherty | CC BY-SA 4.0 | [Commons](https://commons.wikimedia.org/wiki/File:Longjing_tea_village_Hangzhou.jpg) |
| guangming | `guangming.jpg` | 光明顶 | Emitchan | Public domain | [Commons](https://commons.wikimedia.org/wiki/File:GuangMingDing.jpg) |
| lianhua | `lianhua.jpg` | 莲花峰 | De-Shao Liu (Terry850324) | CC BY-SA 4.0 | [Commons](https://commons.wikimedia.org/wiki/File:Huangshan,_September_2018_35_蓮花峰與玉屏峰.jpg) |
| feilai | `feilai.jpg` | 飞来石 | Tiger@西北 | CC BY-SA 3.0 | [Commons](https://commons.wikimedia.org/wiki/File:安徽_黄山_-_飞来石_Mount._Huangshan_-_Flied_stone_-_panoramio.jpg) |
| tiandu | `tiandu.jpg` | 天都峰登山道 | Jakemete | Public domain | [Commons](https://commons.wikimedia.org/wiki/File:Huangshan_-_Steps_to_Heaven.jpg) |
| shixin | `shixin.jpg` | 始信峰远眺 | JesseW900 | CC BY-SA 4.0 | [Commons](https://commons.wikimedia.org/wiki/File:Huangshan_view.JPG) |
| paiyun | `paiyun.jpg` | 排云亭 | Siyuwj | CC BY-SA 4.0 | [Commons](https://commons.wikimedia.org/wiki/File:Paiyun_Pavilion,_Huangshan,_2021-10-17_01.jpg) |

## 暂无对应图片

当前没有为以下现有 POI 放入准确对应图片，避免用泛化风景图冒充具体景点：宝石山（`baoshi`）、葛岭（`ge`）、北高峰（`beigao`）、南高峰（`nangao`）、五云山（`wuyun`）、玉皇山（`yuhuang`）、抱朴道院（`baopu-daoist-yard`）、烟霞洞（`yanxia-cave`）、紫来洞（`zilai-cave`）、福星观（`fuxing-temple`）、灵顺寺（`lingshun-temple`），7 座桥（`yingbo`、`suolan`、`wangshan`、`yadi`、`dongpu`、`kuahong`、`jindai`），以及 6 个上山口（`baoshi-foothill`、`beigao-trail`、`nangao-manjuelong`、`longjing-shifeng`、`jiuxi-side-path`、`yuhuang-steps`）。上山口暂不使用附近景区照片代替入口实景。
