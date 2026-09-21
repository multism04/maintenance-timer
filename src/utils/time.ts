export type IntervalUnit = 'hour' | 'day' | 'month' | 'year'

export const UNIT_LABELS: Record<IntervalUnit, string> = {
  hour: '時間',
  day: '日',
  month: 'ヶ月',
  year: '年',
}

export const UNIT_OPTIONS: IntervalUnit[] = ['hour', 'day', 'month', 'year']

export function addInterval(date: Date, value: number, unit: IntervalUnit): Date {
  const result = new Date(date)
  switch (unit) {
    case 'hour':
      result.setHours(result.getHours() + value)
      break
    case 'day':
      result.setDate(result.getDate() + value)
      break
    case 'month':
      result.setMonth(result.getMonth() + value)
      break
    case 'year':
      result.setFullYear(result.getFullYear() + value)
      break
  }
  return result
}

export function formatRemaining(ms: number): string {
  const overdue = ms < 0
  const abs = Math.abs(ms)

  const minutes = Math.floor(abs / 60_000)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)
  const months = Math.floor(days / 30.44)
  const years = Math.floor(days / 365.25)

  let text: string
  if (years >= 1) {
    const remMonths = Math.floor((days - years * 365.25) / 30.44)
    text = remMonths > 0 ? `${years}年${remMonths}ヶ月` : `${years}年`
  } else if (months >= 1) {
    const remDays = days - Math.floor(months * 30.44)
    text = remDays > 0 ? `${months}ヶ月${remDays}日` : `${months}ヶ月`
  } else if (days >= 1) {
    const remHours = hours - days * 24
    text = remHours > 0 ? `${days}日${remHours}時間` : `${days}日`
  } else if (hours >= 1) {
    const remMinutes = minutes - hours * 60
    text = remMinutes > 0 ? `${hours}時間${remMinutes}分` : `${hours}時間`
  } else {
    text = `${minutes}分`
  }

  return overdue ? `${text}経過` : `あと${text}`
}

export function formatDateTime(date: Date): string {
  return date.toLocaleString('ja-JP', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}
