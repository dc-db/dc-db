import { cn } from '@/lib/utils'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'

type Option = { value: string; label: string }

/** Shared single-choice control, including support for an empty value. */
export function OptionSelect({ value, onChange, options, id, label, className, size = 'default' }: {
  value: string
  onChange: (value: string) => void
  options: Option[]
  id?: string
  label?: string
  className?: string
  size?: 'sm' | 'default'
}) {
  const hasMatchedOption = options.some(option => option.value === value)
  return (
    <Select value={value || '__empty__'} onValueChange={next => onChange(next === '__empty__' ? '' : next)}>
      <SelectTrigger
        id={id}
        aria-label={label}
        size={size}
        className={cn(
          'rounded-md border-border bg-background text-sm font-normal text-foreground hover:bg-accent hover:text-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50',
          !value && !hasMatchedOption && 'text-muted-foreground',
          className
        )}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent position="popper" align="start">
        {options.map(option => (
          <SelectItem key={option.value || '__empty__'} value={option.value || '__empty__'}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
