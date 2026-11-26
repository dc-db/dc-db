import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Input } from './ui/input'
import { Building2, Crosshair, Globe, History, LoaderCircle, Network, Search, Server, Tags, X } from 'lucide-react'
import { api } from '../api'
import type { SearchResult, SearchResultType } from '../api'
import { kindLabel } from '../kinds'

interface Props {
  onAsset: (assetId: number) => void
  onRoom: (roomId: number) => void
  onRack: (roomId: number, rackId: number) => void
  onIpam: () => void
  onIPAddress: () => void
  onVLAN: () => void
}

const typeMeta: Record<SearchResultType, { label: string; icon: ReactNode }> = {
  asset: { label: '资产', icon: <Server size={15} /> },
  room: { label: '数据中心', icon: <Building2 size={15} /> },
  rack: { label: '机柜', icon: <Network size={15} /> },
  subnet: { label: '网段', icon: <Globe size={15} /> },
  vlan: { label: 'VLAN', icon: <Tags size={15} /> },
  ip: { label: 'IP 地址', icon: <Crosshair size={15} /> },
}

const statusLabels: Record<string, string> = {
  online: '在线', offline: '离线', running: '运行中', stopped: '已停止', paused: '已暂停', unknown: '未知',
}

const typeOrder: SearchResultType[] = ['asset', 'ip', 'room', 'rack', 'subnet', 'vlan']

export function GlobalSearch({ onAsset, onRoom, onRack, onIpam, onIPAddress, onVLAN }: Props) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const [error, setError] = useState('')
  const [recent, setRecent] = useState<string[]>(() => {
    try {
      const parsed: unknown = JSON.parse(localStorage.getItem('dc-db-recent-searches') ?? '[]')
      return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string').slice(0, 6) : []
    } catch {
      return []
    }
  })
  const inputRef = useRef<HTMLInputElement>(null)
  const requestRef = useRef(0)

  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        inputRef.current?.focus()
        return
      }
      if (event.key === '/' && !event.ctrlKey && !event.metaKey && !event.altKey) {
        const target = event.target as HTMLElement | null
        const tag = target?.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target?.isContentEditable) return
        event.preventDefault()
        inputRef.current?.focus()
      }
    }
    window.addEventListener('keydown', shortcut)
    return () => window.removeEventListener('keydown', shortcut)
  }, [])

  useEffect(() => {
    const keyword = query.trim()
    if (keyword.length < 2) {
      requestRef.current++
      setResults([])
      setLoading(false)
      setError('')
      return
    }
    const requestId = ++requestRef.current
    setLoading(true)
    setError('')
    const timer = window.setTimeout(() => {
      void api<SearchResult[]>('/search?q=' + encodeURIComponent(keyword))
        .then(data => {
          if (requestId !== requestRef.current) return
          setResults(data)
          setActive(0)
          setOpen(true)
        })
        .catch(() => {
          if (requestId !== requestRef.current) return
          setResults([])
          setError('搜索失败，请稍后重试')
        })
        .finally(() => {
          if (requestId === requestRef.current) setLoading(false)
        })
    }, 180)
    return () => window.clearTimeout(timer)
  }, [query])

  function rememberSearch(term: string) {
    const value = term.trim()
    if (value.length < 2) return
    const next = [value, ...recent.filter(item => item.toLowerCase() !== value.toLowerCase())].slice(0, 6)
    setRecent(next)
    try {
      localStorage.setItem('dc-db-recent-searches', JSON.stringify(next))
    } catch {
      // Recent searches still work for this session.
    }
  }

  function runRecent(term: string) {
    setQuery(term)
    setOpen(true)
    inputRef.current?.focus()
  }

  function clearRecent() {
    setRecent([])
    try {
      localStorage.removeItem('dc-db-recent-searches')
    } catch {
      // Ignore unavailable storage.
    }
  }

  function choose(result: SearchResult) {
    rememberSearch(query)
    setOpen(false)
    setQuery('')
    setResults([])
    if (result.type === 'asset') onAsset(result.assetId ?? result.id)
    else if (result.type === 'room' && result.roomId) onRoom(result.roomId)
    else if (result.type === 'rack' && result.roomId && result.rackId) onRack(result.roomId, result.rackId)
    else if (result.type === 'vlan') onVLAN()
    else if (result.type === 'ip') onIPAddress()
    else onIpam()
  }

  function handleKeyDown(event: React.KeyboardEvent) {
    if (event.key === 'Escape') {
      setOpen(false)
      inputRef.current?.blur()
      return
    }
    if (!flat.length) return
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActive(index => Math.min(flat.length - 1, index + 1))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActive(index => Math.max(0, index - 1))
    } else if (event.key === 'Enter') {
      event.preventDefault()
      const result = flat[active]
      if (result) choose(result)
    }
  }

  function resultDetail(result: SearchResult) {
    if (result.type === 'asset') {
      return [result.kind ? kindLabel(result.kind) : '', statusLabels[result.status ?? ''] ?? result.status, result.detail]
        .filter(Boolean).join(' · ')
    }
    return result.detail
  }

  const visible = open && (query.trim().length >= 2 || (!query.trim() && recent.length > 0))
  const grouped = typeOrder
    .map(type => ({ type, items: results.filter(result => result.type === type) }))
    .filter(group => group.items.length > 0)
  const flat = grouped.flatMap(group => group.items)

  return (
    <div className="global-search relative">
      <div className="relative flex items-center">
        <Search size={14} className="pointer-events-none absolute left-2.5 text-muted-foreground" />
        <Input
          ref={inputRef}
          className="h-8 bg-background pl-8 pr-12 text-sm shadow-none"
          aria-label="全局搜索"
          placeholder="全局搜索"
          value={query}
          autoComplete="off"
          onChange={event => {
            const value = event.target.value
            setQuery(value)
            setOpen(value.trim().length >= 2 || value.trim().length === 0)
          }}
          onFocus={() => setOpen(true)}
          onClick={() => setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 120)}
          onKeyDown={handleKeyDown}
        />
        {query ? (
          <button
            type="button"
            className="absolute right-2 inline-flex size-5 items-center justify-center rounded text-muted-foreground transition-colors hover:text-foreground"
            aria-label="清除搜索"
            onMouseDown={event => event.preventDefault()}
            onClick={() => { setQuery(''); inputRef.current?.focus() }}
          >
            <X size={14} />
          </button>
        ) : (
          <kbd
            aria-hidden="true"
            className="pointer-events-none absolute right-2 hidden h-5 select-none items-center gap-0.5 rounded border border-border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground sm:inline-flex"
          >
            ⌘K
          </kbd>
        )}
      </div>
      {visible && (
        <div
          className="global-search-panel rounded-lg border border-border bg-popover text-popover-foreground shadow-lg"
          onMouseDown={event => event.preventDefault()}
        >
          {!query.trim() ? (
            <>
              <div className="global-search-group">
                <div className="global-search-group-title text-muted-foreground">最近搜索</div>
                {recent.map(term => (
                  <button
                    key={term}
                    type="button"
                    className="global-search-recent text-foreground hover:bg-accent"
                    onClick={() => runRecent(term)}
                  >
                    <History size={14} className="text-muted-foreground" />
                    <span>{term}</span>
                  </button>
                ))}
              </div>
              <button
                type="button"
                className="global-search-clear text-muted-foreground hover:text-foreground"
                onClick={clearRecent}
              >
                清空最近搜索
              </button>
            </>
          ) : (
            <>
              {loading && <div className="global-search-state text-muted-foreground"><LoaderCircle size={14} className="animate-spin" /> 搜索中…</div>}
              {!loading && error && <div className="global-search-state text-muted-foreground">{error}</div>}
              {!loading && !error && results.length === 0 && <div className="global-search-state text-muted-foreground">没有匹配结果</div>}
              {!loading && !error && grouped.map(group => (
                <div key={group.type} className="global-search-group">
                  <div className="global-search-group-title text-muted-foreground">{typeMeta[group.type].label}</div>
                  {group.items.map(result => {
                    const index = flat.findIndex(item => item.type === result.type && item.id === result.id)
                    return (
                      <button
                        key={`${result.type}-${result.id}`} type="button"
                        className={`global-search-result transition-colors${index === active ? ' active bg-accent text-accent-foreground' : ' hover:bg-accent/60'}`}
                        onMouseEnter={() => setActive(index)}
                        onClick={() => choose(result)}
                      >
                        <span className="global-search-icon inline-flex size-7 shrink-0 items-center justify-center rounded-md border border-border bg-muted/60 text-muted-foreground">
                          {typeMeta[result.type].icon}
                        </span>
                        <span className="global-search-copy">
                          <strong className="text-foreground">{result.label}</strong>
                          <span className="text-muted-foreground">{resultDetail(result)}</span>
                        </span>
                        <span className="global-search-type rounded border border-border bg-muted/50 px-1.5 py-0.5 text-[11px] text-muted-foreground">
                          {typeMeta[result.type].label}
                        </span>
                      </button>
                    )
                  })}
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  )
}
