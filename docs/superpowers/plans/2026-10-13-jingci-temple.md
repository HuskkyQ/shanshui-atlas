# 净慈寺核心场景实现计划

**目标：** 在西湖全景中增加净慈寺，可进入独立核心建筑场景，保留连续视角、四处热点、对应实拍图与返回动画。

**架构：** 沿用现有景点注册、SceneSession、ScenicUI 和相机交接；不重构其他场景。全景与单景共用净慈寺建筑核心，仅细部精度不同。未知古井、侧殿与后殿不补造；占地与尺寸为照片关系的艺术化近似。

**技术：** Three.js、Vite、Node tests、浏览器交互验收。

1. 建筑模型：新增 `src/west-lake/jingci-temple/model.js`；测试单层重檐主殿、两层三檐钟楼、朝北入口及全景/单景核心边界一致。核对实拍外形与 draw calls。
2. 全景接入：修改 `src/data/west-lake-attractions.json`、`src/west-lake/pois.js`、`src/west-lake/scene.js`；新增 `jingci-temple/overview.js`。使用寺院代表点，地形采样平台与接地边坡；测试支撑面与相机交接投影一致。
3. 单景与内容：新增 `jingci-temple/scene.js`、`src/content/jingci-temple.json`；更新注册与内容出口。四热点 `gate/daxiong/bell/courtyard` 各用不同照片，保存许可。
4. 验证：更新四场景注册、POI、UI 配图测试；运行全量测试、生产构建、变更检查。浏览器核对桌面和手机的全景入口、两向渐变、四热点照片、旋转缩放、Shift 拖拽、沉浸模式与旧景点回归。

本轮不提交、推送或发布；已发布版本保持为上一轮成果。
