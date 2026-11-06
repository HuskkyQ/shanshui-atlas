import gardenContent from '../content/zhuozheng-garden.json' with { type: 'json' };
import chengqiContent from '../content/chengqi-lou.json' with { type: 'json' };
import xuankongContent from '../content/xuankong-si.json' with { type: 'json' };
import daciContent from '../content/daci-yan.json' with { type: 'json' };
import zhouzhuangContent from '../content/zhouzhuang.json' with { type: 'json' };
import changbaiContent from '../content/changbai.json' with { type: 'json' };
import xingpingContent from '../content/xingping.json' with { type: 'json' };

const copernicus = [
  '地形数据：Copernicus DEM GLO-30 ↗',
  'https://dataspace.copernicus.eu/explore-data/data-collections/copernicus-contributing-missions/collections-description/COP-DEM',
];
export const sources = {
  huangshan: [
    copernicus,
    ['路线与点位位置：© OpenStreetMap 贡献者 ↗', 'https://www.openstreetmap.org/copyright'],
  ],
  'west-lake': [
    copernicus,
    ['湖岸、路线与点位：© OpenStreetMap 贡献者 ↗', 'https://www.openstreetmap.org/copyright'],
    [
      '地貌参考：Google Maps 地形视图 ↗',
      'https://www.google.com/maps/@30.238,120.125,13z/data=!5m1!1e4',
    ],
  ],
  xingping: [
    copernicus,
    ['九马画山崖线：OpenStreetMap way1087179283 ↗', 'https://www.openstreetmap.org/way/1087179283'],
    ['黄布滩轮廓：OpenStreetMap way1316142632 ↗', 'https://www.openstreetmap.org/way/1316142632'],
    [
      '建筑、住宅、道路与林地：OSM原始区域数据 ↗',
      'https://api.openstreetmap.org/api/0.6/map?bbox=110.45,24.90,110.56,24.96',
    ],
    [
      '兴坪古镇牌坊位置：OpenStreetMap way1210338781 ↗',
      'https://www.openstreetmap.org/way/1210338781',
    ],
    [
      '水域外环与岛屿：OpenStreetMap关系13773143 ↗',
      'https://www.openstreetmap.org/relation/13773143',
    ],
    ['水域补充：OpenStreetMap关系14524060 ↗', 'https://www.openstreetmap.org/relation/14524060'],
    ['河道与地标：OpenStreetMap研究窗口 ↗', 'https://www.openstreetmap.org/#map=13/24.93/110.505'],
    ['九马画山临江山壁：漓江景区官网 ↗', 'https://www.liriver.com.cn/page/article/zglj.jmhs'],
    ['黄布倒影与河滩：漓江景区官网 ↗', 'https://www.liriver.com.cn/page/article/zglj.hbdy'],
    [
      '当地地形与水系：兴坪地质文化村（镇）推介宣传册 ↗',
      'https://geosociety.org.cn/upload/fieldwhc/img/whc/whcpdf/whcxp.pdf',
    ],
    [
      '峰群与喀斯特峡谷：IUCN 2014评估 ↗',
      'https://whc.unesco.org/archive/2014/whc14-38com-inf8B2-en.pdf',
    ],
    ['上下游顺序：漓江官方精华游线路 ↗', 'https://www.liriver.com.cn/page/article/ylxl.ljjhy'],
    [
      '九马画山形态参考照片：Emitchan，CC BY-SA 3.0 / GFDL ↗',
      'https://commons.wikimedia.org/wiki/File:JiuMaHuaShan.jpg',
    ],
    [
      '形态参考照片：Michaeljscott93，CC BY-SA 4.0 ↗',
      'https://commons.wikimedia.org/wiki/File:XingPing,_GuangXi,_China.jpg',
    ],
    ['地图版权：© OpenStreetMap贡献者（ODbL）↗', 'https://www.openstreetmap.org/copyright'],
  ],
  changbai: [
    copernicus,
    ['湖岸：OpenStreetMap关系11650508 ↗', 'https://www.openstreetmap.org/relation/11650508'],
    ['景点位置：天文峰步道 ↗', 'https://www.openstreetmap.org/way/1033243463'],
    ['景点位置：小天池 ↗', 'https://www.openstreetmap.org/way/543958159'],
    ['景点位置：绿渊潭 ↗', 'https://www.openstreetmap.org/way/543958160'],
    [
      '景点分布：长白山管委会 ↗',
      'https://www.changbaishan.gov.cn/zbsly/lyzn/bpgl/202108/t20210816_210159.html',
    ],
    [
      '火山口与峰谷：UNESCO世界地质公园 ↗',
      'https://www.unesco.org/en/iggp/mount-changbaishan-unesco-global-geopark',
    ],
    ['出水口与地貌：吉林省地震局 ↗', 'https://dzj.jl.gov.cn/ztzl/cbshsztbd/zbstchsdl/'],
    [
      '夏季西侧实景：Dcpeets，CC BY-SA 4.0 ↗',
      'https://commons.wikimedia.org/wiki/File:Changbaishan_Tianchi_from_western_rim.jpg',
    ],
    [
      '夏季南侧实景：A Chinese user，CC BY-SA 4.0 ↗',
      'https://commons.wikimedia.org/wiki/File:Heavenly_Lake_of_Changbaishan_(Shot_from_South),_Aug_12_2022.jpg',
    ],
    ['地图版权：© OpenStreetMap贡献者 ↗', 'https://www.openstreetmap.org/copyright'],
  ],
  'zhuozheng-garden': [
    [
      '池岸、建筑与园路：OpenStreetMap 局部数据 ↗',
      'https://api.openstreetmap.org/api/0.6/map?bbox=120.622,31.3245,120.628,31.328',
    ],
    [
      '园区与景观关系：苏州市园林和绿化管理局 ↗',
      'https://ylj.suzhou.gov.cn/szsylj/sjyc/201905/c1df393edc8745abb20e8a9bd5525782.shtml',
    ],
    [
      '水景与桥廊：苏州市园林和绿化管理局 ↗',
      'https://ylj.suzhou.gov.cn/szsylj/ylys/201903/df5a3bf3bdbd49b0b787076f355b1074.shtml',
    ],
    [
      '建筑形制：苏州市园林和绿化管理局 ↗',
      'https://ylj.suzhou.gov.cn/szsylj/ylys/201903/484421d38f504f5787a8f307925e3ad7.shtml',
    ],
    [
      '园林植物：苏州市园林和绿化管理局 ↗',
      'https://ylj.suzhou.gov.cn/szsylj/ylwh/201903/d978d21439a549c88244479c92ffda86.shtml',
    ],
    ['地图版权：© OpenStreetMap 贡献者 ↗', 'https://www.openstreetmap.org/copyright'],
  ],
  'daci-yan': [
    ['寺院斜侧全景与建筑介绍：杭州新闻（2026）↗', daciContent.source.url],
    [
      '地藏王大殿与洞崖关系：浙江在线（2020）↗',
      'https://hangzhou.zjol.com.cn/jrsd/bwzg/202004/t20200410_11865061.shtml',
    ],
    [
      '依崖建造方式：杭州日报（2026）↗',
      'https://hznews.hangzhou.com.cn/chengshi/content/2026-04/01/content_9199737.htm',
    ],
    [
      '景区名称与所在地：杭州市政府公报 ↗',
      'https://zfgb.hangzhou.gov.cn/18/106220253/t103220253064/528598.shtml',
    ],
    ['地貌类型：信阳师范大学野外考察记录 ↗', 'https://news.xynu.edu.cn/info/1002/2275.htm'],
    [
      '建筑样式参考：嘉兴日报《江南也有悬空寺》↗',
      'https://jxxznews.zjol.com.cn/xznews/system/2018/06/25/030970613.shtml',
    ],
  ],
  zhouzhuang: [
    ['双桥桥型、台阶与尺寸：周庄旅游官网 ↗', 'https://www.zhouzhuang.net/scenic_4/1257.html'],
    ['富安桥单孔石拱与四角桥楼：周庄旅游官网 ↗', 'https://www.zhouzhuang.net/scenic_4/1260.html'],
    ['古镇河网与保护范围：周庄旅游官网 ↗', 'https://www.zhouzhuang.net/intro_4.html'],
    ['南北市街与桥梁连接：周庄旅游官网 ↗', 'https://www.zhouzhuang.net/news_5/128.html'],
    [
      '桥位、河道与道路：OpenStreetMap局部数据 ↗',
      'https://api.openstreetmap.org/api/0.6/map?bbox=120.841,31.1095,120.851,31.1200',
    ],
    [
      '北侧街巷补充：OpenStreetMap（2026-10-22）↗',
      'https://api.openstreetmap.org/api/0.6/map?bbox=120.841,31.1095,120.851,31.1225',
    ],
    [
      '北侧外河与岛屿轮廓：OpenStreetMap关系62435 ↗',
      'https://www.openstreetmap.org/relation/62435',
    ],
    [
      '两向俯拍、街屋与桥体：乐玩日志原游记（2020）↗',
      'https://k.sina.cn/article_1733227933_674ef59d027014wgb.html?from=travel',
    ],
    [
      '近期桥头与街屋俯拍：苏州市政府（2026）↗',
      'https://www.suzhou.gov.cn/szsrmzf/tpxw/202604/d9a52c1301b04d6995dbcf36f9385224.shtml',
    ],
    [
      '双桥近景：EditQ自摄，CC BY-SA 4.0（2022）↗',
      'https://commons.wikimedia.org/wiki/File:昆山周庄双桥.jpg',
    ],
    [
      '临水转角街屋：EditQ自摄，CC BY-SA 4.0（2022）↗',
      'https://commons.wikimedia.org/wiki/File:周庄双桥.jpg',
    ],
    [
      '双桥构造：mayanming，CC BY-SA 3.0（2013）↗',
      'https://commons.wikimedia.org/wiki/File:陈逸飞的双桥_-_panoramio.jpg',
    ],
    ['地图版权：© OpenStreetMap 贡献者 ↗', 'https://www.openstreetmap.org/copyright'],
  ],
  'xuankong-si': [
    ['院落、南北楼与栈桥布局：恒山景区 ↗', xuankongContent.source.url],
    [
      '建筑与岩壁关系：浑源县人民政府 ↗',
      'https://www.hunyuan.gov.cn/hyxrmzfz/sqgllssy/202307/c225082439fa4738b9b0d9e645b96483.shtml',
    ],
    [
      '正面全景实拍：Wikimedia Commons（2019）↗',
      'https://commons.wikimedia.org/wiki/File:Hangingtemple20190929.jpg',
    ],
    [
      '斜侧全景实拍：Wikimedia Commons（2013）↗',
      'https://commons.wikimedia.org/wiki/File:Hunyuan_Xuankong_Si_2013.08.30_09-02-11.jpg',
    ],
    [
      '廊底梁柱与入岩细部实拍：Wikimedia Commons ↗',
      'https://commons.wikimedia.org/wiki/File:Hunyuan_Xuankong_Si_2013.08.30_09-21-04.jpg',
    ],
    [
      '多角度建筑实拍图集：Wikimedia Commons ↗',
      'https://commons.wikimedia.org/wiki/Category:Hanging_Temple',
    ],
    [
      '航拍视频参考：新华社（2025）↗',
      'https://www.news.cn/20250318/ad53e3e634894dd382a187e41a9ed891/c.html',
    ],
  ],
  'chengqi-lou': [
    ['建筑布局与楼层：永定区人民政府 ↗', chengqiContent.source.url],
    [
      '建筑与邻楼资料：UNESCO 福建土楼申遗文本 ↗',
      'https://whc.unesco.org/uploads/nominations/1113.pdf',
    ],
    ['建筑外观参考：厦门大学建筑与土木工程学院 ↗', 'https://archt.xmu.edu.cn/info/1161/17744.htm'],
    [
      '结构研究参考：华侨大学（尺寸口径不同，未直接采用）↗',
      'https://hdxb.hqu.edu.cn/Upload/Park/09ffe089-d086-45ec-9fa1-dab10a78afa6.pdf',
    ],
    ['承启楼位置参考：OpenStreetMap ↗', 'https://www.openstreetmap.org/relation/12305267'],
    ['侨福楼位置参考：OpenStreetMap ↗', 'https://www.openstreetmap.org/relation/12305269'],
    ['世泽楼位置参考：OpenStreetMap ↗', 'https://www.openstreetmap.org/relation/11959140'],
    ['五云楼位置参考：OpenStreetMap ↗', 'https://www.openstreetmap.org/relation/11959139'],
    ['地图版权：© OpenStreetMap 贡献者 ↗', 'https://www.openstreetmap.org/copyright'],
  ],
};
const sourceNotes = {
  huangshan: '山体由公开高程数据生成；松树、奇石与云海为艺术化表达，不具有测绘或导航精度。',
  'west-lake':
    '山体、湖岸与路线参考公开地理数据；建筑细节、植被和局部场地为艺术化近似，不用于导航。',
  'zhuozheng-garden': gardenContent.modelNote,
  'chengqi-lou': chengqiContent.modelNote,
  'xuankong-si': xuankongContent.modelNote,
  'daci-yan': daciContent.modelNote,
  zhouzhuang: zhouzhuangContent.modelNote,
  changbai: changbaiContent.modelNote,
  xingping: xingpingContent.modelNote,
};

export const PLACES = {
  huangshan: {
    view: () =>
      Promise.all([import('../landscape/exhibit.html?raw'), import('../landscape/style.css')]),
    load: () => import('../landscape/exhibit.js'),
    sources: sources['huangshan'],
    note: sourceNotes['huangshan'],
  },
  'west-lake': {
    view: () =>
      Promise.all([import('../landscape/exhibit.html?raw'), import('../landscape/style.css')]),
    load: () => import('../landscape/exhibit.js'),
    sources: sources['west-lake'],
    note: sourceNotes['west-lake'],
  },
  xingping: {
    view: () => Promise.all([import('../xingping/view.html?raw'), import('../xingping/style.css')]),
    load: () => import('../xingping/index.js'),
    sources: sources['xingping'],
    note: sourceNotes['xingping'],
  },
  changbai: {
    view: () => Promise.all([import('../changbai/view.html?raw'), import('../changbai/style.css')]),
    load: () => import('../changbai/index.js'),
    sources: sources['changbai'],
    note: sourceNotes['changbai'],
  },
  zhouzhuang: {
    view: () =>
      Promise.all([import('../zhouzhuang/view.html?raw'), import('../zhouzhuang/zhouzhuang.css')]),
    load: () => import('../zhouzhuang/index.js'),
    sources: sources['zhouzhuang'],
    note: sourceNotes['zhouzhuang'],
  },
  'daci-yan': {
    view: () => Promise.all([import('../daci-yan/view.html?raw'), import('../daci-yan/daci.css')]),
    load: () => import('../daci-yan/index.js'),
    sources: sources['daci-yan'],
    note: sourceNotes['daci-yan'],
  },
  'xuankong-si': {
    view: () =>
      Promise.all([import('../xuankong-si/view.html?raw'), import('../xuankong-si/xuankong.css')]),
    load: () => import('../xuankong-si/index.js'),
    sources: sources['xuankong-si'],
    note: sourceNotes['xuankong-si'],
  },
  'chengqi-lou': {
    view: () =>
      Promise.all([import('../chengqi-lou/view.html?raw'), import('../chengqi-lou/chengqi.css')]),
    load: () => import('../chengqi-lou/index.js'),
    sources: sources['chengqi-lou'],
    note: sourceNotes['chengqi-lou'],
  },
  'zhuozheng-garden': {
    view: () =>
      Promise.all([
        import('../zhuozheng-garden/view.html?raw'),
        import('../zhuozheng-garden/garden.css'),
      ]),
    load: () => import('../zhuozheng-garden/index.js'),
    sources: sources['zhuozheng-garden'],
    note: sourceNotes['zhuozheng-garden'],
  },
};
