import type { SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement>

const baseProps: SVGProps<SVGSVGElement> = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
}

// 基础数据：结构化词典 / 参考目录索引卡
export function ReferenceDataIcon(props: IconProps) {
  return (
    <svg {...baseProps} {...props}>
      <rect x="3" y="3.5" width="18" height="17" rx="2.5" />
      <path d="M8.5 3.5v17" />
      <path d="M5.5 8.5h.5M5.5 12h.5M5.5 15.5h.5" />
      <path d="M12 8.5h5.5M12 12h5.5M12 15.5h3.5" />
    </svg>
  )
}

// 群组：边界框内聚编组（与文件夹、用户图标完全区分）
export function GroupClusterIcon(props: IconProps) {
  return (
    <svg {...baseProps} {...props}>
      <path d="M4 8V5.5A1.5 1.5 0 0 1 5.5 4H8" />
      <path d="M16 4h2.5A1.5 1.5 0 0 1 20 5.5V8" />
      <path d="M4 16v2.5A1.5 1.5 0 0 0 5.5 20H8" />
      <path d="M16 20h2.5a1.5 1.5 0 0 0 1.5-1.5V16" />
      <rect x="7.5" y="7.75" width="9" height="3.25" rx="1" />
      <rect x="7.5" y="13" width="9" height="3.25" rx="1" />
    </svg>
  )
}

// 服务：六边形运行组件节点（中间件 / 基础服务）
export function ServiceNodeIcon(props: IconProps) {
  return (
    <svg {...baseProps} {...props}>
      <path d="M11 3.1a2 2 0 0 1 2 0l6.2 3.6a2 2 0 0 1 1 1.73v7.14a2 2 0 0 1-1 1.73L13 20.9a2 2 0 0 1-2 0l-6.2-3.6a2 2 0 0 1-1-1.73V8.43a2 2 0 0 1 1-1.73L11 3.1Z" />
      <circle cx="12" cy="12" r="2.75" />
    </svg>
  )
}

// 标签：单枚简洁圆角标签
export function TagMarkIcon(props: IconProps) {
  return (
    <svg {...baseProps} {...props}>
      <path d="M4.5 11.1V6a1.5 1.5 0 0 1 1.5-1.5h5.1a1.5 1.5 0 0 1 1.06.44l7 7a1.5 1.5 0 0 1 0 2.12l-5.1 5.1a1.5 1.5 0 0 1-2.12 0l-7-7a1.5 1.5 0 0 1-.44-1.06Z" />
      <circle cx="8.75" cy="8.75" r="1.1" fill="currentColor" stroke="none" />
    </svg>
  )
}

// 负责人：责任人工牌（与系统管理-用户管理区分）
export function OwnerBadgeIcon(props: IconProps) {
  return (
    <svg {...baseProps} {...props}>
      <rect x="3" y="4.5" width="18" height="15" rx="2.5" />
      <circle cx="8.75" cy="10.25" r="1.75" />
      <path d="M6.25 15.25c.5-1.35 1.45-2 2.5-2s2 .65 2.5 2" />
      <path d="M14 10h3.5M14 13.75h2.75" />
    </svg>
  )
}

// 运营商：通信信号塔（与 IPAM 地球图标彻底区分）
export function OperatorTowerIcon(props: IconProps) {
  return (
    <svg {...baseProps} {...props}>
      <circle cx="12" cy="9" r="1.4" fill="currentColor" stroke="none" />
      <path d="M8.8 12.1a4.4 4.4 0 0 1 0-6.2" />
      <path d="M15.2 5.9a4.4 4.4 0 0 1 0 6.2" />
      <path d="M6.1 14.8a8.2 8.2 0 0 1 0-11.6" />
      <path d="M17.9 3.2a8.2 8.2 0 0 1 0 11.6" />
      <path d="M9 20.5 12 11.5l3 9" />
      <path d="M10.1 17.5h3.8" />
    </svg>
  )
}
