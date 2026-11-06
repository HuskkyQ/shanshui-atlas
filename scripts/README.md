# 数据生成脚本

脚本只负责从公开来源的临时下载文件生成运行时数据，不属于浏览器首屏路径。

## Python 环境

```bash
python3 -m venv .venv
. .venv/bin/activate
python -m pip install -r scripts/requirements.txt
```

其中 `Pillow`、`numpy`、`Shapely` 和 `rasterio` 用于高程栅格、OSM 几何和地形裁剪；标准库依赖无需安装。每个脚本的 docstring 记录输入文件和输出路径，原始下载文件应保存在 `/tmp` 等临时目录。

## 常用入口

- `generate-terrain.py`、`generate-west-lake.py`、`generate-changbai-terrain.py`：高程与水体数据。
- `generate-xingping-terrain.py`、`generate-xingping-details.py`：兴坪地形和细节轮廓。
- `generate-zhouzhuang-layout.py`、`generate-zhouzhuang-landuse.py`：周庄布局和土地利用。
- `generate-west-lake-*.py`：西湖点位、步道、路线和实体地标。
- `generate-zhuozheng-layout.py`：拙政园布局。

生成前请保留来源快照和校验信息；运行时数据的地理精度和艺术化近似边界见 `docs/` 对应验收记录。
