import { useCallback, useEffect, useState } from 'react'
import type { ChangeEvent } from 'react'
import { Plus } from 'lucide-react'
import { api } from '../api'
import type { Asset, InterfaceFields, NetworkInterface } from '../api'
import { Alert, Button, Input, Modal, Select, Space, Table, Tag } from './AppControls'
import type { TableColumnsType } from './AppControls'
import { RowActionsMenu } from './RowActionsMenu'
import { DataTableViewOptions } from './TableColumnControls'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from './ui/alert-dialog'

interface Props {
  assetId: number
  assets: Asset[]
  editable: boolean
}

const mediumOptions = [
  { value: 'copper', label: '电口' },
  { value: 'fiber', label: '光口' },
  { value: 'virtual', label: '虚拟' },
]

const statusOptions = [
  { value: 'up', label: '启用' },
  { value: 'down', label: '停用' },
  { value: 'disabled', label: '禁用' },
]

const emptyFields: InterfaceFields = {
  name: '', medium: 'copper', speedMbps: 1000, mac: '', status: 'up', description: '',
}

const interfaceColumnKeys = ['name', 'medium', 'speed', 'mac', 'status', 'peer'] as const
type InterfaceColumnKey = typeof interfaceColumnKeys[number]
const defaultInterfaceColumns: InterfaceColumnKey[] = [...interfaceColumnKeys]

function mediumLabel(medium: string) {
  return mediumOptions.find(option => option.value === medium)?.label ?? medium
}

function statusLabel(status: string) {
  return statusOptions.find(option => option.value === status)?.label ?? status
}

function peerLabel(item: NetworkInterface) {
  return item.peerId ? `${item.peerAssetName ?? ''} / ${item.peerName ?? ''}` : ''
}

function message(e: unknown, fallback: string) {
  return e instanceof Error && e.message ? e.message : fallback
}

function speedLabel(mbps: number) {
  if (!mbps) return '—'
  return mbps >= 1000 ? `${Number((mbps / 1000).toFixed(1))} Gbps` : `${mbps} Mbps`
}

function statusColor(status: string) {
  return status === 'up' ? 'green' : status === 'disabled' ? 'red' : 'orange'
}

export function AssetInterfaces({ assetId, assets, editable }: Props) {
  const [items, setItems] = useState<NetworkInterface[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [draft, setDraft] = useState<{ id: number; version: number; fields: InterfaceFields } | null>(null)
  const [connecting, setConnecting] = useState<NetworkInterface | null>(null)
  const [peerAssetId, setPeerAssetId] = useState<number | null>(null)
  const [peerItems, setPeerItems] = useState<NetworkInterface[]>([])
  const [peerId, setPeerId] = useState<number | null>(null)
  const [pendingDelete, setPendingDelete] = useState<NetworkInterface | null>(null)
  const [visibleColumns, setVisibleColumns] = useState<InterfaceColumnKey[]>(defaultInterfaceColumns)

  const load = useCallback(async () => {
    setError('')
    try {
      setItems(await api<NetworkInterface[]>(`/assets/${assetId}/interfaces`))
    } catch (e) {
      setError(message(e, '接口加载失败'))
    }
  }, [assetId])

  useEffect(() => { void load() }, [load])

  function startCreate() {
    setDraft({ id: 0, version: 0, fields: { ...emptyFields } })
  }

  function startEdit(item: NetworkInterface) {
    setDraft({
      id: item.id,
      version: item.version,
      fields: {
        name: item.name, medium: item.medium, speedMbps: item.speedMbps,
        mac: item.mac, status: item.status, description: item.description,
      },
    })
  }

  function update<K extends keyof InterfaceFields>(key: K, value: InterfaceFields[K]) {
    setDraft(current => current && { ...current, fields: { ...current.fields, [key]: value } })
  }

  async function save() {
    if (!draft) return
    setBusy(true)
    setError('')
    try {
      if (draft.id) {
        await api(`/assets/${assetId}/interfaces/${draft.id}`, 'PUT', { ...draft.fields, version: draft.version })
      } else {
        await api(`/assets/${assetId}/interfaces`, 'POST', draft.fields)
      }
      setDraft(null)
      await load()
    } catch (e) {
      setError(message(e, '保存失败'))
    } finally {
      setBusy(false)
    }
  }

  async function remove(item: NetworkInterface) {
    setBusy(true)
    setError('')
    try {
      await api(`/assets/${assetId}/interfaces/${item.id}`, 'DELETE')
      await load()
    } catch (e) {
      setError(message(e, '删除失败'))
    } finally {
      setBusy(false)
    }
  }

  async function openConnect(item: NetworkInterface) {
    setConnecting(item)
    setPeerAssetId(null)
    setPeerId(null)
    setPeerItems([])
  }

  async function choosePeerAsset(id: number | null) {
    setPeerAssetId(id)
    setPeerId(null)
    setPeerItems([])
    if (!id) return
    try {
      const list = await api<NetworkInterface[]>(`/assets/${id}/interfaces`)
      setPeerItems(list.filter(entry => !entry.peerId))
    } catch (e) {
      setError(message(e, '对端接口加载失败'))
    }
  }

  async function connect() {
    if (!connecting || !peerId) return
    setBusy(true)
    setError('')
    try {
      await api(`/interfaces/${connecting.id}/connect`, 'POST', { peerId })
      setConnecting(null)
      await load()
    } catch (e) {
      setError(message(e, '连接失败'))
    } finally {
      setBusy(false)
    }
  }

  async function disconnect(item: NetworkInterface) {
    setBusy(true)
    setError('')
    try {
      await api(`/interfaces/${item.id}/disconnect`, 'POST', {})
      await load()
    } catch (e) {
      setError(message(e, '断开失败'))
    } finally {
      setBusy(false)
    }
  }

  function updateVisibleColumns(next: InterfaceColumnKey[]) {
    const ordered = interfaceColumnKeys.filter(key => next.includes(key))
    if (!ordered.length) return
    setVisibleColumns(ordered)
  }

  function toggleColumn(columnId: string, nextVisible: boolean) {
    const key = columnId as InterfaceColumnKey
    if (!interfaceColumnKeys.includes(key)) return
    const next = nextVisible
      ? [...visibleColumns, key]
      : visibleColumns.filter(item => item !== key)
    updateVisibleColumns(next)
  }

  function hideColumn(columnId: string) {
    if (visibleColumns.length <= 1) return
    toggleColumn(columnId, false)
  }

  const dataColumns: { key: InterfaceColumnKey; label: string; column: TableColumnsType<NetworkInterface>[number] }[] = [
    {
      key: 'name',
      label: '名称',
      column: {
        title: '名称',
        dataIndex: 'name',
        key: 'name',
        sorter: (left, right) => left.name.localeCompare(right.name, 'zh-CN', { numeric: true }),
      },
    },
    {
      key: 'medium',
      label: '介质',
      column: {
        title: '介质',
        key: 'medium',
        sorter: (left, right) => mediumLabel(left.medium).localeCompare(mediumLabel(right.medium), 'zh-CN'),
        render: (_: unknown, item: NetworkInterface) => <Tag>{mediumLabel(item.medium)}</Tag>,
      },
    },
    {
      key: 'speed',
      label: '速率',
      column: {
        title: '速率',
        key: 'speed',
        sorter: (left, right) => (left.speedMbps ?? 0) - (right.speedMbps ?? 0),
        render: (_: unknown, item: NetworkInterface) => speedLabel(item.speedMbps),
      },
    },
    {
      key: 'mac',
      label: 'MAC',
      column: {
        title: 'MAC',
        key: 'mac',
        sorter: (left, right) => (left.mac || '').localeCompare(right.mac || '', 'zh-CN'),
        render: (_: unknown, item: NetworkInterface) => item.mac || '—',
      },
    },
    {
      key: 'status',
      label: '状态',
      column: {
        title: '状态',
        key: 'status',
        sorter: (left, right) => statusLabel(left.status).localeCompare(statusLabel(right.status), 'zh-CN'),
        render: (_: unknown, item: NetworkInterface) => (
          <Tag color={statusColor(item.status)}>{statusLabel(item.status)}</Tag>
        ),
      },
    },
    {
      key: 'peer',
      label: '对端',
      column: {
        title: '对端',
        key: 'peer',
        sorter: (left, right) => peerLabel(left).localeCompare(peerLabel(right), 'zh-CN'),
        render: (_: unknown, item: NetworkInterface) => item.peerId
          ? peerLabel(item)
          : <span className="muted">未连接</span>,
      },
    },
  ]

  const canHideColumn = visibleColumns.length > 1
  const columns: TableColumnsType<NetworkInterface> = [
    ...dataColumns
      .filter(item => visibleColumns.includes(item.key))
      .map(item => ({ ...item.column, hideable: canHideColumn })),
    ...(editable ? [{
      title: <span className="sr-only">操作</span>,
      key: 'actions',
      width: 48,
      hideable: false,
      render: (_: unknown, item: NetworkInterface) => (
        <div className="flex justify-end">
          <RowActionsMenu
            ariaLabel={`更多操作：${item.name}`}
            onEdit={() => startEdit(item)}
            editDisabled={busy}
            extraItems={[
              item.peerId
                ? {
                    key: 'disconnect',
                    label: '断开连接',
                    disabled: busy,
                    onSelect: () => void disconnect(item),
                  }
                : {
                    key: 'connect',
                    label: '连接对端',
                    disabled: busy,
                    onSelect: () => void openConnect(item),
                  },
            ]}
            onDelete={() => setPendingDelete(item)}
            deleteDisabled={busy}
          />
        </div>
      ),
    }] : []),
  ]

  return (
    <div className="asset-interfaces">
      {error && <Alert type="error" showIcon message={error} className="drawer-alert" />}
      <div className="asset-interfaces-head">
        <span className="muted">记录设备的网口与上联关系，连接后两端都会显示对端设备。</span>
        <Space>
          <DataTableViewOptions
            columns={dataColumns.map(item => ({
              id: item.key,
              label: item.label,
              visible: visibleColumns.includes(item.key),
            }))}
            onToggle={toggleColumn}
          />
          {editable && <Button size="small" icon={<Plus size={14} />} onClick={startCreate}>添加接口</Button>}
        </Space>
      </div>
      <Table<NetworkInterface>
        rowKey="id" columns={columns} dataSource={items} loading={busy} size="small"
        onHideColumn={hideColumn}
        pagination={false} locale={{ emptyText: '暂无接口，点击「添加接口」开始记录' }}
      />

      <Modal
        open={draft !== null} title={draft?.id ? '编辑接口' : '添加接口'} width={520}
        onCancel={() => setDraft(null)}
        footer={(
          <Space>
            <Button type="primary" loading={busy} onClick={() => void save()}>保存</Button>
            <Button onClick={() => setDraft(null)}>取消</Button>
          </Space>
        )}
      >
        {draft && (
          <div className="interface-form">
            <label>名称<Input value={draft.fields.name} maxLength={64} placeholder="例如：eth0、Gi0/1" onChange={(event: ChangeEvent<HTMLInputElement>) => update('name', event.target.value)} /></label>
            <label>介质<Select value={draft.fields.medium} options={mediumOptions} onChange={value => update('medium', value as InterfaceFields['medium'])} /></label>
            <label>速率（Mbps）<Input type="number" min={0} max={1600000} value={draft.fields.speedMbps} onChange={(event: ChangeEvent<HTMLInputElement>) => update('speedMbps', Number(event.target.value))} /></label>
            <label>MAC 地址<Input value={draft.fields.mac} maxLength={17} placeholder="aa:bb:cc:dd:ee:ff" onChange={(event: ChangeEvent<HTMLInputElement>) => update('mac', event.target.value)} /></label>
            <label>状态<Select value={draft.fields.status} options={statusOptions} onChange={value => update('status', value as InterfaceFields['status'])} /></label>
            <label>描述<Input value={draft.fields.description} maxLength={200} onChange={(event: ChangeEvent<HTMLInputElement>) => update('description', event.target.value)} /></label>
          </div>
        )}
      </Modal>

      <Modal
        open={connecting !== null} title={`连接「${connecting?.name ?? ''}」`} width={520}
        onCancel={() => setConnecting(null)}
        footer={(
          <Space>
            <Button type="primary" loading={busy} disabled={!peerId} onClick={() => void connect()}>连接</Button>
            <Button onClick={() => setConnecting(null)}>取消</Button>
          </Space>
        )}
      >
        <div className="interface-form">
          <label>对端设备
            <Select
              value={peerAssetId} placeholder="选择设备"
              options={assets.filter(asset => asset.id !== assetId).map(asset => ({ value: asset.id, label: asset.name }))}
              onChange={value => void choosePeerAsset(value as number)}
            />
          </label>
          <label>对端接口
            <Select
              value={peerId} placeholder={peerAssetId ? '选择接口' : '请先选择设备'} disabled={!peerAssetId}
              options={peerItems.map(item => ({ value: item.id, label: item.name }))}
              onChange={value => setPeerId(value as number)}
            />
          </label>
          {peerAssetId && peerItems.length === 0 && <p className="muted">该设备没有空闲接口。</p>}
        </div>
      </Modal>

      <AlertDialog open={pendingDelete !== null} onOpenChange={open => { if (!open) setPendingDelete(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除接口「{pendingDelete?.name}」？</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete?.peerId
                ? `该操作将同时断开与「${pendingDelete.peerAssetName ?? ''} / ${pendingDelete.peerName ?? ''}」的连接，删除后无法恢复。`
                : '删除后该接口记录将无法恢复，此操作无法撤销。'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (pendingDelete) {
                  const target = pendingDelete
                  setPendingDelete(null)
                  void remove(target)
                }
              }}
            >
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
