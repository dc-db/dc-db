import { useEffect, useRef } from 'react'
import * as echarts from 'echarts'
import type { EChartsOption } from 'echarts'

export function Chart({ option, height = 240, dark = false }: { option: EChartsOption; height?: number; dark?: boolean }) {
  const holder = useRef<HTMLDivElement>(null)
  const chart = useRef<echarts.ECharts | null>(null)

  useEffect(() => {
    if (!holder.current) return
    chart.current = echarts.init(holder.current, dark ? 'dark' : undefined)
    const observer = new ResizeObserver(() => chart.current?.resize())
    observer.observe(holder.current)
    return () => {
      observer.disconnect()
      chart.current?.dispose()
      chart.current = null
    }
  }, [dark])

  useEffect(() => {
    chart.current?.setOption({
      ...option,
      backgroundColor: 'transparent',
      textStyle: { color: dark ? '#fafafa' : '#0a0a0a', ...(option.textStyle ?? {}) },
    }, true)
  }, [option, dark])

  return <div ref={holder} style={{ width: '100%', height }} />
}
