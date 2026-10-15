/** "utest1abc…xyz789": enough to recognise an address without showing all of it. */
export function shortAddress(address: string): string {
  return address.length <= 20 ? address : `${address.slice(0, 10)}…${address.slice(-6)}`
}

const pad = (n: number) => String(n).padStart(2, '0')

/** Value for <input type="datetime-local" step="1"> in the person's own time zone. */
export function toLocalInput(ms: number): string {
  const d = new Date(ms)
  return `${String(d.getFullYear())}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

/** Reads a datetime-local value as local time. Returns NaN if it is empty or invalid. */
export function fromLocalInput(value: string): number {
  return value === '' ? Number.NaN : new Date(value).getTime()
}

export function formatDateTime(ms: number): string {
  return new Date(ms).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'medium' })
}
