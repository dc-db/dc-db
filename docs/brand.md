# DC-DB 品牌标识

正式标志使用蓝色渐变外环包住三层等距服务器图形：外环表示数据中心的整体环境，三层服务器表示机房设备与数据库层级。该 SVG 为定版图形，后续不再使用之前的灰度服务器刀片方案。

## 文件与用途

所有素材位于 [`web/public/brand/`](../web/public/brand/)；系统 favicon 位于 [`web/public/logo.svg`](../web/public/logo.svg)。

| 文件 | 用途 |
| --- | --- |
| [`mark.svg`](../web/public/brand/mark.svg) | 透明底图形母版；包含供 `Wordmark` 复用的 `dc-db-symbol` |
| [`logo-light.svg`](../web/public/brand/logo-light.svg) | 白底、黑色字标的组合标，用于浅色主题 |
| [`logo-dark.svg`](../web/public/brand/logo-dark.svg) | 黑底、白色字标的组合标，用于暗色主题 |
| [`avatar.svg`](../web/public/brand/avatar.svg) | 纯黑底头像源文件 |
| [`avatar-512.png`](../web/public/brand/avatar-512.png) | 512×512 PNG，可用于 GitHub 头像上传 |
| [`social-preview.svg`](../web/public/brand/social-preview.svg) | 纯黑底、图形与字标的仓库分享预览源文件 |
| [`social-preview.png`](../web/public/brand/social-preview.png) | 1280×640 PNG，可用于 GitHub 仓库 Social preview |

## 系统与文档使用

- 登录页和左侧栏通过 `Wordmark.tsx` 组合图形和字标，图形从 `mark.svg#dc-db-symbol` 引用；左侧栏图形左边缘与菜单图标列对齐。
- 图形母版保留原始 768×768 坐标；应用内使用裁剪视口 `121 29 596 724`，去掉四周空白但保留完整图形和渐变。
- 外环使用青色到深蓝的渐变：`#26C8EB → #0071F1 → #0836E9`；服务器侧面和顶面使用独立的浅蓝/白色渐变，保持等距立体关系。
- 图形本身透明，适合放在白色或黑色背景上；组合标和头像使用固定背景，不依赖主题切换。favicon 也使用透明图形。
- 图标单独显示建议不小于 16px；登录页和品牌区域使用约 40px。不要拉伸、旋转、裁剪服务器层或改变外环开口方向。

## 来源与许可

图形为 DC-DB 提供的定版 SVG，提交时保留原始路径和渐变结构。字标使用项目已有的 Geist（650）；独立 SVG 中的 `DC-DB` 已转为路径，不依赖外部字体。字体许可见 [`OFL-Geist.txt`](../web/public/brand/OFL-Geist.txt)。
