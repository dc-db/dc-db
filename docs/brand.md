# DC-DB 品牌标识

正式标志是两台完全相同的加厚 1U 服务器刀片。浅灰层向左上偏移，深灰层向右下偏移，正面使用黑色或白色，形成黑灰白单色的平面层叠效果。图形不使用第三方品牌图形，也不把颜色当作实时状态。

## 文件与用途

所有素材位于 [`web/public/brand/`](../web/public/brand/)；系统 favicon 位于 [`web/public/logo.svg`](../web/public/logo.svg)。

| 文件 | 用途 |
| --- | --- |
| [`mark.svg`](../web/public/brand/mark.svg) | 随系统主题切换背景和正面的图形母版；包含可复用的 `dc-db-symbol` |
| [`logo-light.svg`](../web/public/brand/logo-light.svg) | 整幅白底、黑色刀片与字标，用于浅色主题 |
| [`logo-dark.svg`](../web/public/brand/logo-dark.svg) | 整幅黑底、白色刀片与字标，用于暗色主题 |
| [`avatar.svg`](../web/public/brand/avatar.svg) | 纯黑底、白色刀片与灰色错位层的头像源文件 |
| [`avatar-512.png`](../web/public/brand/avatar-512.png) | 512×512 PNG，可用于 GitHub 头像上传 |
| [`social-preview.svg`](../web/public/brand/social-preview.svg) | 纯黑底、白色刀片、灰色错位层与字标的仓库分享预览源文件 |
| [`social-preview.png`](../web/public/brand/social-preview.png) | 1280×640 PNG，可用于 GitHub 仓库 Social preview |

SVG 是可缩放、可编辑的主版本。PNG 是针对上传场景的导出文件：GitHub 的[头像格式说明](https://docs.github.com/en/account-and-profile/reference/profile-reference)列出 PNG、JPG 和 GIF；[仓库分享预览](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/customizing-your-repositorys-social-media-preview)推荐 1280×640，且文件小于 1 MB。PNG 素材已经按这些尺寸导出；头像属于账号或组织，仓库分享预览则在仓库设置中配置。

## 系统与文档使用

- 登录页和左侧栏通过 `Wordmark.tsx` 组合图形和字标，图形从 `mark.svg#dc-db-symbol` 引用，保持单一几何来源；文字提供可访问名称，装饰图形对读屏隐藏。系统引用的图形由 `styles.css` 中的 `--brand-mark-bg`、`--brand-mark-front`、`--brand-mark-detail`、`--brand-mark-layer-soft`、`--brand-mark-layer-deep` 跟随用户选择的主题。
- 图形母版画布为 64×64。两片刀片位于 `x=10..54`，高为 `14`，圆角为 `3.5`，纵向起点为 `13/37`，中间间距为 `10`；每片带一个状态灯和三个散热槽。浅灰层偏移 `(-3, -2)`，深灰层偏移 `(3, 2)`，正面层不偏移。
- 浅色主题使用白底、黑色正面和白色细节，浅灰层为 `#D4D4D4`、深灰层为 `#8A8A8A`；暗色主题使用黑底、白色正面和黑色细节，浅灰层为 `#3A3A3A`、深灰层为 `#5A5A5A`。
- 主版背景使用黑／白实底，不再透明。直接打开 `mark.svg` 或 favicon `logo.svg` 时，通过 `prefers-color-scheme` 跟随系统主题；组合标使用各自固定的整幅白底或黑底，头像和分享素材固定使用纯黑底。
- GitHub README 使用 `picture` 在浅底和深底组合标之间切换，不依赖外部字体。独立 SVG 的字标已转为路径。
- 图形单独显示建议不小于 16px；系统品牌区使用约 28px，登录页约 40px。图形周围与字标之间保留清晰间隔，不拉伸、旋转或改变刀片与错位层的比例。

## 来源与许可

图形为 DC-DB 的原创设计，没有复用第三方图标。字标使用项目已有的 Geist（650）；独立 SVG 中的 `DC-DB` 已转为路径，不依赖外部字体。字体许可见 [`OFL-Geist.txt`](../web/public/brand/OFL-Geist.txt)。
