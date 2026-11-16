import { useState } from 'react'
import { Button } from './ui/button'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Input } from './ui/input'

interface Props {
  onSubmit: (currentPassword: string, newPassword: string) => Promise<void>
}

export function ChangePassword({ onSubmit }: Props) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (newPassword.length < 12 || newPassword.length > 512) {
      setError('新密码长度须为 12–512 个字符')
      return
    }
    if (newPassword !== confirmPassword) {
      setError('两次输入的新密码不一致')
      return
    }
    setBusy(true)
    setError('')
    try {
      await onSubmit(currentPassword, newPassword)
    } catch (e) {
      setError(e instanceof Error ? e.message : '密码修改失败')
      setBusy(false)
    }
  }

  return (
    <Card className="password-card">
      <CardHeader><CardTitle>修改登录密码</CardTitle></CardHeader>
      <CardContent>
        <p className="muted password-hint">修改成功后，当前账号的所有登录会话都会失效，需要使用新密码重新登录。</p>
        {error && <p role="alert" className="password-alert text-destructive">{error}</p>}
        <form className="grid gap-4" onSubmit={event => void submit(event)} onReset={() => {
          setCurrentPassword(''); setNewPassword(''); setConfirmPassword(''); setError('')
        }}>
          <label className="grid gap-2">当前密码
            <Input type="password" autoComplete="current-password" maxLength={512} required value={currentPassword} onChange={event => setCurrentPassword(event.target.value)} />
          </label>
          <label className="grid gap-2">新密码
            <Input type="password" autoComplete="new-password" maxLength={512} required value={newPassword} onChange={event => setNewPassword(event.target.value)} />
          </label>
          <label className="grid gap-2">确认新密码
            <Input type="password" autoComplete="new-password" maxLength={512} required value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} />
          </label>
          <div className="flex gap-2">
            <Button type="submit" disabled={busy}>{busy ? '修改中…' : '修改密码'}</Button>
            <Button type="reset" variant="outline" disabled={busy}>重置</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
