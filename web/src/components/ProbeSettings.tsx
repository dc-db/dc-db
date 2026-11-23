import { useEffect, useState } from 'react'
import { api, APIError } from '../api'
import { Button } from './ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import { Input } from './ui/input'

export function ProbeSettings({ onSessionError }: { onSessionError: (error: unknown) => void }) {
  const [interval, setInterval] = useState('300')
  const [loading, setLoading] = useState(true)
  const [loaded, setLoaded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  useEffect(() => {
    let active = true
    api<{ intervalSeconds: number }>('/probe-settings').then(value => { if (active) { setInterval(String(value.intervalSeconds)); setLoaded(true) } })
      .catch(err => { if (active) { if (err instanceof APIError && err.status === 401) onSessionError(err); else setError(err instanceof Error ? err.message : '读取设置失败') } })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])
  async function save(event: React.FormEvent) {
    event.preventDefault()
    const seconds = Number(interval)
    if (!Number.isInteger(seconds) || seconds < 10 || seconds > 86400) { setError('请输入 10–86400 秒的整数'); return }
    setSaving(true); setError(''); setSaved(false)
    try { await api('/probe-settings', 'PUT', { intervalSeconds: seconds }); setSaved(true) }
    catch (err) { if (err instanceof APIError && err.status === 401) onSessionError(err); else setError(err instanceof Error ? err.message : '保存失败') }
    finally { setSaving(false) }
  }
  return <Card className="max-w-xl">
    <CardHeader><CardTitle>存活探测设置</CardTitle><CardDescription>由应用所在主机使用 Ping 探测已启用的资产。</CardDescription></CardHeader>
    <CardContent><form className="grid gap-4" onSubmit={event => void save(event)}>
      <label className="grid gap-2">探测间隔（秒）<Input type="number" min={10} max={86400} step={1} required value={interval} disabled={loading || saving} onChange={event => { setInterval(event.target.value); setSaved(false) }} /></label>
      <p className="text-sm text-muted-foreground">允许 10–86400 秒；探测较多设备时，实际完成时间可能较长。</p>
      {error && <p role="alert" className="text-destructive">{error}</p>}
      {saved && <p role="status" className="text-success">设置已保存</p>}
      <div><Button type="submit" disabled={loading || saving || !loaded}>{saving ? '保存中…' : '保存设置'}</Button></div>
    </form></CardContent>
  </Card>
}
