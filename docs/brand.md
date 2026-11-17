# DC-DB 品牌标识

标志采用选定的「端口」造型：直角 RJ45 外框、三枚抽象触点和左右对称的指示灯。蓝色端口配合左侧绿色、右侧琥珀色指示灯，表达 IT 基础设施的连接与运行；图形可以独立用于头像和 favicon，也可以与大写 `DC-DB` 字标组合。

双灯取网口链路与活动指示的意象，位置、颜色固定，不反映应用或资产的实时状态；真实设备的灯位、颜色和亮灭含义以其型号说明书为准。三枚触点是为小尺寸识别保留的图形抽象。

## 文件与用途

所有素材位于 [`web/public/brand/`](../web/public/brand/)；系统 favicon 位于 [`web/public/logo.svg`](../web/public/logo.svg)。

| 文件 | 用途 |
| --- | --- |
| [`mark.svg`](../web/public/brand/mark.svg) | 透明背景图形母版，64×64 坐标系；包含可复用的 `dc-db-symbol` |
| [`mark-mono.svg`](../web/public/brand/mark-mono.svg) | 单色端口和双灯图形，适用于印刷和单色用途 |
| [`logo-light.svg`](../web/public/brand/logo-light.svg) | 浅色背景的图形与字标组合 |
| [`logo-dark.svg`](../web/public/brand/logo-dark.svg) | 深色背景的图形与字标组合 |
| [`avatar.svg`](../web/public/brand/avatar.svg) | 纯黑底（`#000000`）、彩色图形的头像源文件 |
| [`avatar-512.png`](../web/public/brand/avatar-512.png) | 512×512 PNG，可用于 GitHub 头像上传 |
| [`social-preview.svg`](../web/public/brand/social-preview.svg) | 仓库分享预览的矢量源文件 |
| [`social-preview.png`](../web/public/brand/social-preview.png) | 1280×640 PNG，可用于 GitHub 仓库 Social preview |

SVG 是可缩放、可编辑的主版本。PNG 是针对上传场景的导出文件：GitHub 的[头像格式说明](https://docs.github.com/en/account-and-profile/reference/profile-reference)列出 PNG、JPG 和 GIF；[仓库分享预览](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/customizing-your-repositorys-social-media-preview)推荐 1280×640，且文件小于 1 MB。PNG 素材已经按这些尺寸导出；头像属于账号或组织，仓库分享预览则在仓库设置中配置。

## 系统与文档使用

- 登录页和左侧栏通过 `Wordmark.tsx` 组合图形和字标，图形从 `mark.svg#dc-db-symbol` 引用，保持单一几何来源；文字提供可访问名称，装饰图形对读屏隐藏。
- 品牌图形使用固定的蓝 `#4778f5`、绿 `#4eba87`、琥珀 `#d58a4b`，保持跨主题的一致身份；业务状态色仍遵循界面设计规范。系统字标使用 `--text`，随主题切换；头像与分享 PNG 使用纯黑底（`#000000`），favicon 使用透明背景。
- GitHub README 使用 `picture` 在浅底和深底组合标之间切换，不依赖外部字体。独立 SVG 的字标已转为路径。
- 图形单独显示建议不小于 16px；系统品牌区使用约 28px，登录页约 40px。64×64 母版内已留出四周空间，在其外部再保留至少 4px（按比例缩放）的间距；文字与图形之间保留清晰间隔。
- 黑白印刷或单色用途使用 `mark-mono.svg`，通过其根元素的 `color` 设置黑色或白色，选择与背景对比清楚的一种；端口内部和灯下间隙保持透明。不要拉伸、旋转、添加阴影或改变触点与双灯的比例。

字标使用项目已有的 Geist（650），字体许可见 [`OFL-Geist.txt`](../web/public/brand/OFL-Geist.txt)。素材保留在本仓库现有许可范围内；该设计没有借用第三方品牌图形。
