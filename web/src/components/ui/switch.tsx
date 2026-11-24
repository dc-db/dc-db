import * as React from 'react'
import { Switch as SwitchPrimitive } from 'radix-ui'
import { cn } from '@/lib/utils'

function Switch({ className, ...props }: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return <SwitchPrimitive.Root
    data-slot="switch"
    className={cn('ui-switch', className)}
    {...props}
  ><SwitchPrimitive.Thumb className="ui-switch-thumb" /></SwitchPrimitive.Root>
}

export { Switch }
