# DC-DB 品牌标识

正式标志基于数据中心栏目已有的 Lucide `Building2` 图形；当前依赖中该名称是 [`building-complex`](https://lucide.dev/icons/building-complex) 的别名。保留中央体块和圆角，移除两侧建筑条形，把中央体块解释为服务器机箱；机箱内三条横线等长、等距，以黑、灰、浅灰（暗色主题为白、浅灰、灰）表示服务器插槽和层级。该图形是 Lucide 的修改版，不作为项目原创图形声明；与大写 `DC-DB` 字标组成标识。

## 文件与用途

所有素材位于 [`web/public/brand/`](../web/public/brand/)；系统 favicon 位于 [`web/public/logo.svg`](../web/public/logo.svg)。

| 文件 | 用途 |
| --- | --- |
| [`mark.svg`](../web/public/brand/mark.svg) | 随系统主题切换黑白实底和外框的图形母版；包含可复用的 `dc-db-symbol` |
| [`logo-light.svg`](../web/public/brand/logo-light.svg) | 整幅白底、黑色服务器轮廓与字标、三条灰阶横线，用于浅色主题 |
| [`logo-dark.svg`](../web/public/brand/logo-dark.svg) | 整幅黑底、白色服务器轮廓与字标、三条灰阶横线，用于暗色主题 |
| [`avatar.svg`](../web/public/brand/avatar.svg) | 纯黑底（`#000000`）、白色服务器轮廓与三条灰阶横线的头像源文件 |
| [`avatar-512.png`](../web/public/brand/avatar-512.png) | 512×512 PNG，可用于 GitHub 头像上传 |
| [`social-preview.svg`](../web/public/brand/social-preview.svg) | 纯黑底、白色服务器轮廓与字标、三条灰阶横线的仓库分享预览源文件 |
| [`social-preview.png`](../web/public/brand/social-preview.png) | 1280×640 PNG，可用于 GitHub 仓库 Social preview |

SVG 是可缩放、可编辑的主版本。PNG 是针对上传场景的导出文件：GitHub 的[头像格式说明](https://docs.github.com/en/account-and-profile/reference/profile-reference)列出 PNG、JPG 和 GIF；[仓库分享预览](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/customizing-your-repositorys-social-media-preview)推荐 1280×640，且文件小于 1 MB。PNG 素材已经按这些尺寸导出；头像属于账号或组织，仓库分享预览则在仓库设置中配置。

## 系统与文档使用

- 登录页和左侧栏通过 `Wordmark.tsx` 组合图形和字标，图形从 `mark.svg#dc-db-symbol` 引用，保持单一几何来源；文字提供可访问名称，装饰图形对读屏隐藏。系统引用的图形由 `styles.css` 中的 `--brand-mark-bg`、`--brand-mark-mid`、`--brand-mark-soft` 三个变量跟随用户选择的主题，外框和顶部横线使用 `currentColor`。
- 图形母版画布为 64×64，原 Lucide 的 24×24 坐标统一缩放 `64/24`；外框线宽为 `1.5`，内部三条横杠线宽为 `2.5`（均为 24×24 坐标），圆头和圆角连接保持不变。服务器机箱使用 `x=3`、`y=3`、`width=18`、`height=18`、`rx=2` 的圆角矩形；三条横线分别位于 `y=8/12/16`，均从 `x=8` 延伸至 `x=16`。
- 品牌只使用中性色，灰阶差异仅用于中间三条横线。浅色主题为白底、黑色外框，三条横线由上到下为 `currentColor`、`#808080`、`#b3b3b3`；暗色主题为黑底、白色外框，横线依次为 `currentColor`、`#b3b3b3`、`#808080`。独立 SVG 的外框和字标使用深色 `#171717` 或白色 `#fafafa`；系统中跟随 `--text`，当前分别为 `#0a0a0a` 和 `#fafafa`。
- 主版背景使用黑／白实底，不再透明。直接打开 `mark.svg` 或 favicon `logo.svg` 时，通过 `prefers-color-scheme` 跟随系统主题；组合标使用各自固定的整幅白底或黑底，头像和分享素材固定使用纯黑底。
- GitHub README 使用 `picture` 在浅底和深底组合标之间切换，不依赖外部字体。独立 SVG 的字标已转为路径。
- 图形单独显示建议不小于 16px；系统品牌区使用约 28px，登录页约 40px。图形周围与字标之间保留清晰间隔，不拉伸、旋转、添加阴影或改变三条横线的比例。

## 来源与许可

Lucide 图形采用 ISC 许可，版权与许可声明保留在 [`LICENSE-Lucide.txt`](../web/public/brand/LICENSE-Lucide.txt) 及 SVG 注释中，说明见 [Lucide 官方许可](https://lucide.dev/license)。将建筑中央体块改为服务器并移除两侧建筑条形，不改变原图形的许可要求，分发时保留对应声明。声明不会显示在 Logo 画面中。

字标使用项目已有的 Geist（650）；独立 SVG 中的 `DC-DB` 已转为路径，不依赖外部字体。字体许可见 [`OFL-Geist.txt`](../web/public/brand/OFL-Geist.txt)。
