/** Shared HH:mm:ss formatter for run history views. */
export function formatClock(value: Date | number): string {
  const date = value instanceof Date ? value : new Date(value)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}
