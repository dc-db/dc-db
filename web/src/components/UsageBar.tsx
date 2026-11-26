import { Progress } from './ui/progress'
import { cn } from '../lib/utils'

type UsageBarProps = {
  value: number
  label: string
  className?: string
  barClassName?: string
}

/** Shared utilization display; the label describes the resource for screen readers. */
export function UsageBar({ value, label, className, barClassName }: UsageBarProps) {
  const progress = Math.min(100, Math.max(0, value))
  return (
    <span className={cn('inline-flex min-w-0 items-center gap-2', className)}>
      <Progress value={progress} aria-label={label} className={cn('w-[84px] shrink-0 [&>div]:bg-primary', barClassName)} />
      <span className="whitespace-nowrap text-xs text-muted-foreground tabular-nums">{value}%</span>
    </span>
  )
}
