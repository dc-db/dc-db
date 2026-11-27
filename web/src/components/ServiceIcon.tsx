import type { CSSProperties, ReactNode } from 'react'
import {
  Activity, Box, Database, Globe, HardDrive, Layers,
  MessageSquare, Search, Wrench, Zap,
} from 'lucide-react'
import { resolveServiceIcon } from '../serviceIcons'

const categoryFallbackIcons: Record<string, typeof Box> = {
  'Web 服务': Globe,
  '数据库': Database,
  '缓存': Zap,
  '消息队列': MessageSquare,
  '搜索': Search,
  '监控': Activity,
  '存储': HardDrive,
  '研发工具': Wrench,
  '基础设施': Layers,
}

export function RowIconBox({ children, title }: { children: ReactNode; title?: string }) {
  return (
    <span className="row-icon-box" title={title} aria-hidden={title ? undefined : true}>
      {children}
    </span>
  )
}

export function ServiceIcon({ name, category }: { name: string; category?: string }) {
  const brand = resolveServiceIcon(name)
  if (brand) {
    const style = {
      '--brand-light': brand.lightColor,
      '--brand-dark': brand.darkColor,
    } as CSSProperties
    return (
      <span className="service-icon is-brand" title={brand.title} style={style}>
        <svg viewBox="0 0 24 24" className="service-brand-svg text-current" aria-hidden="true">
          <path d={brand.path} fill="currentColor" />
        </svg>
      </span>
    )
  }
  const Fallback = (category && categoryFallbackIcons[category]) || Box
  return (
    <span className="service-icon" title={category || '服务'}>
      <Fallback className="size-3.5 text-muted-foreground" aria-hidden="true" />
    </span>
  )
}
