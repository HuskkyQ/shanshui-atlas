# 可复用中式民居

```js
import { createHouseModel } from './src/models/house/model.js';

const house = createHouseModel();
house.group.position.set(x, groundY, z);
house.group.rotation.y = heading;
scene.add(house.group);
// 移除实例后释放它自己的几何与材质。
house.group.removeFromParent();
house.dispose();
```

主体约宽 10 m、深 7 m、高 5.8 m；实际 `footprint` 为宽 10.2 m、深 7.875 m，包含石基座和入口台阶，排除屋檐悬挑。基座中心为原点，`Y=0` 为地面，入口朝 `+Z`。`anchors` 提供基座、入口和屋脊的本地坐标；地图负责位置、朝向和地形贴合。

这是用于地图展示的艺术化近似，不是测绘或施工模型；瓦垄、门窗格栅和台阶为适量简化。模型不包含地面、树木、灯光和相机。

独立预览：<http://localhost:571/?model=house>
