import { useRef } from 'react'
import { Laptop, Moon, Sun } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from './ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './ui/dropdown-menu'

export type ThemeMode = 'light' | 'dark' | 'system'

export const THEME_STORAGE_KEY = 'dc-db-theme'

export function readStoredThemeMode(): ThemeMode {
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY)
    if (saved === 'light' || saved === 'dark') return saved
  } catch {
    // Storage may be unavailable in private browsing.
  }
  return 'system'
}

export interface ThemeToggleProps {
  mode: ThemeMode
  onChange: (mode: ThemeMode) => void
  className?: string
}

export function ThemeToggle({ mode, onChange, className }: ThemeToggleProps) {
  const pointerOpenRef = useRef(false)

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="切换主题"
          title="切换主题"
          data-theme-mode={mode}
          onPointerDown={() => {
            pointerOpenRef.current = true
          }}
          onKeyDown={event => {
            if (
              event.key === 'Enter' ||
              event.key === ' ' ||
              event.key === 'ArrowDown' ||
              event.key === 'ArrowUp'
            ) {
              pointerOpenRef.current = false
            }
          }}
          className={cn(
            'relative rounded-md hover:bg-accent hover:text-accent-foreground data-[state=open]:bg-accent data-[state=open]:text-accent-foreground focus-visible:border-transparent focus-visible:ring-1 focus-visible:ring-ring',
            className
          )}
        >
          <Sun
            className="size-4 scale-100 rotate-0 transition-all dark:scale-0 dark:-rotate-90"
            aria-hidden="true"
          />
          <Moon
            className="absolute size-4 scale-0 rotate-90 transition-all dark:scale-100 dark:rotate-0"
            aria-hidden="true"
          />
          <span className="sr-only">切换主题</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="min-w-32"
        onCloseAutoFocus={event => {
          if (pointerOpenRef.current) {
            event.preventDefault()
            pointerOpenRef.current = false
          }
        }}
      >
        <DropdownMenuItem
          className="gap-1.5 rounded-md px-1.5 py-1 text-sm"
          onSelect={() => onChange('light')}
        >
          <Sun className="size-4" />
          <span>浅色</span>
        </DropdownMenuItem>
        <DropdownMenuItem
          className="gap-1.5 rounded-md px-1.5 py-1 text-sm"
          onSelect={() => onChange('dark')}
        >
          <Moon className="size-4" />
          <span>暗色</span>
        </DropdownMenuItem>
        <DropdownMenuItem
          className="gap-1.5 rounded-md px-1.5 py-1 text-sm"
          onSelect={() => onChange('system')}
        >
          <Laptop className="size-4" />
          <span>跟随系统</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
