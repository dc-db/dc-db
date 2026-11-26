import { useState } from 'react'
import { Lock } from 'lucide-react'
import { Button } from './ui/button'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog'
import { Input } from './ui/input'

interface Props {
  onSubmit: (currentPassword: string, newPassword: string) => Promise<void>
}

export function ChangePassword({ onSubmit }: Props) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  function onOpenChange(next: boolean) {
    if (busy) return
    setOpen(next)
    if (!next) {
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setError('')
    }
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm"><Lock />更改密码</Button>
      </DialogTrigger>
      <DialogContent showCloseButton={!busy}>
        <DialogHeader>
          <DialogTitle>更改密码</DialogTitle>
          <DialogDescription>更改成功后，当前账号的所有登录会话都会失效，请使用新密码重新登录。</DialogDescription>
        </DialogHeader>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <form className="grid gap-4" onSubmit={event => void submit(event)}>
          <label className="grid gap-2 text-sm font-medium">当前密码
            <Input type="password" autoComplete="current-password" maxLength={512} required disabled={busy} value={currentPassword} onChange={event => setCurrentPassword(event.target.value)} />
          </label>
          <label className="grid gap-2 text-sm font-medium">新密码
            <Input type="password" autoComplete="new-password" placeholder="至少 12 个字符" maxLength={512} required disabled={busy} value={newPassword} onChange={event => setNewPassword(event.target.value)} />
          </label>
          <label className="grid gap-2 text-sm font-medium">确认新密码
            <Input type="password" autoComplete="new-password" maxLength={512} required disabled={busy} value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} />
          </label>
          <DialogFooter>
            <DialogClose asChild><Button type="button" variant="outline" disabled={busy}>取消</Button></DialogClose>
            <Button type="submit" disabled={busy}>{busy ? '更改中…' : '保存新密码'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
