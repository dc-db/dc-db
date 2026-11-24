/** Memory is stored as whole MiB. G and M use binary units (1024 MiB per G). */
export function formatMemory(memoryMiB: number): string {
  if (!memoryMiB) return ''
  return memoryMiB % 1024 === 0 ? `${memoryMiB / 1024}G` : `${memoryMiB}M`
}

export function parseMemory(value: string): number | null {
  const input = value.trim()
  if (!input) return 0
  const match = /^(\d+(?:\.\d+)?|\.\d+)\s*([GM])$/i.exec(input)
  if (!match) return null
  const amount = Number(match[1]) * (match[2].toUpperCase() === 'G' ? 1024 : 1)
  const rounded = Math.round(amount)
  if (!Number.isFinite(amount) || (amount > 0 && rounded === 0) || amount > 1073741824) return null
  return rounded
}
