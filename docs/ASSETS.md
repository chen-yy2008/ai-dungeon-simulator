# 美术资源审计（v0.7）

2026-10-14 从作者官方 Ninja Adventure 免费游客下载取得素材；同包 README 与 LICENSE.txt 确认 CC0-1.0。未使用第三方镜像或未核实素材。完整 94022790 字节 ZIP 与筛选候选只在忽略目录，不进入 Git 或 Pages。

## 实际选用
- Pixel-Boy / AAA：[Ninja Adventure](https://pixel-boy.itch.io/ninja-adventure-asset-pack)。选择草地/土路、针叶/阔叶树、西式木构和茅草屋、岩洞入口、地砖、墙面、宝箱、骑士/猎人/巫师/骷髅和村民。刻意不选鸟居、忍者、武士、音乐与 Godot 工程。
- Kenney：[Fantasy UI Borders](https://kenney.nl/assets/fantasy-ui-borders)。只取 Double/Transparent center/panel-transparent-center-013.png 的窗框，保留 alpha 并统一为棕色（RGB 99/64/41），以 32px 九宫格切片显示。不使用样例字体。

许可允许使用、修改、再分发和商业使用；CC0 无强制署名义务，本项目主动致谢。许可原文保存在 assets/licenses；各图精确原始包路径、部署 SHA-256 和改动记录见 assets/manifest.json。除窗框着色外，PNG 保持原包字节；Canvas 只选源矩形，不生成冒充原作者的新图片。

| 本地文件 | 原包路径 | 修改 |
| --- | --- | --- |
| assets/field.png | Ninja Adventure - Asset Pack/Backgrounds/Tilesets/TilesetField.png | 无，保持原 PNG |
| assets/nature.png | Ninja Adventure - Asset Pack/Backgrounds/Tilesets/TilesetNature.png | 无，保持原 PNG |
| assets/town.png | Ninja Adventure - Asset Pack/Backgrounds/Tilesets/TilesetHouse.png | 无，保持原 PNG |
| assets/stone-floor.png | Ninja Adventure - Asset Pack/Backgrounds/Tilesets/Interior/TilesetInteriorFloor.png | 无，保持原 PNG |
| assets/stone-wall.png | Ninja Adventure - Asset Pack/Backgrounds/Tilesets/Interior/TilesetWallSimple.png | 无，保持原 PNG |
| assets/props.png | Ninja Adventure - Asset Pack/Backgrounds/Tilesets/TilesetElement.png | 无，保持原 PNG |
| assets/coin.png | Ninja Adventure - Asset Pack/Items/Object/MoneyBag.png | 无，保持原 PNG |
| assets/potion.png | Ninja Adventure - Asset Pack/Items/Potion/LifePot.png | 无，保持原 PNG |
| assets/book.png | Ninja Adventure - Asset Pack/Items/Object/Book.png | 无，保持原 PNG |
| assets/bag.png | Ninja Adventure - Asset Pack/Items/Object/Bag.png | 无，保持原 PNG |
| assets/dice.png | Ninja Adventure - Asset Pack/Items/Object/Dice 20.png | 无，保持原 PNG |
| assets/knight.png | Ninja Adventure - Asset Pack/Actor/Character/Knight/SpriteSheet.png | 无，保持原 PNG |
| assets/hunter.png | Ninja Adventure - Asset Pack/Actor/Character/Hunter/SpriteSheet.png | 无，保持原 PNG |
| assets/sorcererblack.png | Ninja Adventure - Asset Pack/Actor/Character/SorcererBlack/SpriteSheet.png | 无，保持原 PNG |
| assets/skeleton.png | Ninja Adventure - Asset Pack/Actor/Character/Skeleton/SpriteSheet.png | 无，保持原 PNG |
| assets/villager.png | Ninja Adventure - Asset Pack/Actor/Character/Villager/SpriteSheet.png | 无，保持原 PNG |
| assets/noble.png | Ninja Adventure - Asset Pack/Actor/Character/Noble/SpriteSheet.png | 无，保持原 PNG |
| assets/woman.png | Ninja Adventure - Asset Pack/Actor/Character/Woman/SpriteSheet.png | 无，保持原 PNG |
| assets/knight-portrait.png | Ninja Adventure - Asset Pack/Actor/Character/Knight/Faceset.png | 无，保持原 PNG |
| assets/hunter-portrait.png | Ninja Adventure - Asset Pack/Actor/Character/Hunter/Faceset.png | 无，保持原 PNG |
| assets/sorcererblack-portrait.png | Ninja Adventure - Asset Pack/Actor/Character/SorcererBlack/Faceset.png | 无，保持原 PNG |
| assets/card-frame.png | PNG/Double/Transparent center/panel-transparent-center-013.png | 保留 alpha，RGB 改为 99/64/41，九宫格裁片由 CSS 完成 |

## 包体与运行
22 张实际 PNG 共 190156 字节（185.7 KiB）；连两份许可证 197672 字节。当前运行文件约 345222 字节/36 项，不含文档、比较截图、资料清单、完整 ZIP、浏览器资料或下载游客会话；最终代码微调可能小幅变化，Pages 白名单构建器再次统计。原包内少量图集未用格仍随小 PNG 保留，避免复制全包。

图像一次缓存，关闭平滑；32px 绘制 16px 游戏瓦片，Retina 1～3x，角色四方向行走两帧与站立帧。世界底图、地牢已知底图缓存，镜头13×13跟随/25×25全图均不改变规则地图。黑色迷雾在实体之后覆盖；素材失败清楚提示并使用旧版程序图形后备。
