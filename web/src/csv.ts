/**
 * Shared CSV helpers. Cells are always quoted and values that could be read as
 * formulas are prefixed with an apostrophe, so exported files open safely in
 * Excel and remain valid for re-import.
 */

export type CsvCell = string | number

export function csvCell(input: CsvCell): string {
  const text = String(input ?? '')
  const safe = /^[\s\uFEFF]*[=+\-@]|^[\t\r\n]/.test(text) ? `'${text}` : text
  return `"${safe.replaceAll('"', '""')}"`
}

export function csvText(rows: CsvCell[][]): string {
  return '\uFEFF' + rows.map(row => row.map(csvCell).join(',')).join('\r\n')
}

export function downloadCSV(filename: string, rows: CsvCell[][]) {
  const url = URL.createObjectURL(new Blob([csvText(rows)], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
