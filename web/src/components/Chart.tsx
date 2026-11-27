import { useEffect, useRef } from 'react'
import * as echarts from 'echarts'
import type { EChartsOption } from 'echarts'

export function Chart({
  option,
  height = 240,
  dark = false,
  onClick,
}: {
  option: EChartsOption
  height?: number
  dark?: boolean
  onClick?: (params: { name?: string; dataIndex?: number; seriesName?: string }) => void
}) {
  const holder = useRef<HTMLDivElement>(null)
  const chart = useRef<echarts.ECharts | null>(null)
  const onClickRef = useRef(onClick)

  useEffect(() => {
    onClickRef.current = onClick
  }, [onClick])

  useEffect(() => {
    if (!holder.current) return
    const instance = echarts.init(holder.current, dark ? 'dark' : undefined)
    chart.current = instance
    instance.on('click', (params) => {
      onClickRef.current?.({
        name: typeof params.name === 'string' ? params.name : undefined,
        dataIndex: typeof params.dataIndex === 'number' ? params.dataIndex : undefined,
        seriesName: typeof params.seriesName === 'string' ? params.seriesName : undefined,
      })
    })
    const observer = new ResizeObserver(() => chart.current?.resize())
    observer.observe(holder.current)
    return () => {
      observer.disconnect()
      instance.dispose()
      chart.current = null
    }
  }, [dark])

  useEffect(() => {
    chart.current?.setOption({
      ...option,
      backgroundColor: 'transparent',
      textStyle: {
        color: dark ? '#fafafa' : '#0a0a0a',
        fontFamily: '"Geist Variable", "Geist", -apple-system, BlinkMacSystemFont, "Noto Sans SC", "PingFang SC", sans-serif',
        ...(option.textStyle ?? {}),
      },
    }, true)
  }, [option, dark])

  return <div ref={holder} style={{ width: '100%', height }} />
}
