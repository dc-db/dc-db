"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

function Table({
  className,
  containerClassName,
  containerRef,
  bare = false,
  ...props
}: React.ComponentProps<"table"> & {
  containerClassName?: string
  containerRef?: React.Ref<HTMLDivElement>
  bare?: boolean
}) {
  return (
    <div
      ref={containerRef}
      data-slot="table-container"
      data-bare={bare ? "true" : undefined}
      className={cn(
        bare
          ? "table-frame-scroll w-full"
          : "relative isolate w-full max-h-[var(--table-max-height)] overflow-auto rounded-md border border-border bg-background",
        containerClassName
      )}
    >
      <table
        data-slot="table"
        className={cn("w-full border-collapse caption-bottom text-sm", className)}
        {...props}
      />
    </div>
  )
}

function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return (
    <thead
      data-slot="table-header"
      className={cn(
        "bg-background [&_tr]:border-b-0 [&_th]:sticky [&_th]:top-0 [&_th:not([data-pinned])]:z-20 [&_th]:bg-background [&_th:not([data-pinned])]:[box-shadow:inset_0_-1px_0_var(--border)] [&_th]:transition-colors [&_tr:hover_th]:bg-[var(--table-header-hover-opaque)]",
        className
      )}
      {...props}
    />
  )
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return (
    <tbody
      data-slot="table-body"
      className={cn(
        "[&_td:not([data-pinned])]:[box-shadow:inset_0_-1px_0_var(--table-divider)] [&_td[data-pinned=left]]:[box-shadow:inset_-1px_0_0_var(--border),inset_0_-1px_0_var(--table-divider)]",
        className
      )}
      {...props}
    />
  )
}

function TableFooter({ className, ...props }: React.ComponentProps<"tfoot">) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn(
        "border-t border-border bg-muted/50 font-medium [&>tr]:last:border-b-0",
        className
      )}
      {...props}
    />
  )
}

function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return (
    <tr
      data-slot="table-row"
      className={cn(
        "group/row border-b-0 transition-colors hover:bg-muted/50 has-aria-expanded:bg-muted/50 data-[state=selected]:bg-muted data-[state=selected]:hover:bg-muted data-[state=selected]:has-aria-expanded:bg-muted hover:[&_td[data-pinned=left]]:bg-[var(--table-header-hover-opaque)] has-aria-expanded:[&_td[data-pinned=left]]:bg-[var(--table-header-hover-opaque)] data-[state=selected]:[&_td[data-pinned=left]]:bg-[var(--table-row-selected)] data-[state=selected]:hover:[&_td[data-pinned=left]]:bg-[var(--table-row-selected)] data-[state=selected]:has-aria-expanded:[&_td[data-pinned=left]]:bg-[var(--table-row-selected)]",
        className
      )}
      {...props}
    />
  )
}

function TableHead({ className, ...props }: React.ComponentProps<"th">) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        "h-10 px-3 text-left align-middle text-sm font-medium whitespace-nowrap text-foreground",
        className
      )}
      {...props}
    />
  )
}

function TableCell({ className, ...props }: React.ComponentProps<"td">) {
  return (
    <td
      data-slot="table-cell"
      className={cn(
        "px-3 py-2 align-middle text-sm whitespace-nowrap text-foreground",
        className
      )}
      {...props}
    />
  )
}

function TableCaption({
  className,
  ...props
}: React.ComponentProps<"caption">) {
  return (
    <caption
      data-slot="table-caption"
      className={cn("mt-4 text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
}
