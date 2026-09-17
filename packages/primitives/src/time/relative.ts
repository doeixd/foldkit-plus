/**
 * Relative time as a pure function: picks the unit (seconds through years)
 * and delegates the wording to `Intl.RelativeTimeFormat`, so locales come
 * from the platform, not a phrase table. `from` is the earlier moment;
 * swap the arguments for future phrasing ("in 3 days").
 */
export const formatRelativeTime = (from: Date, to: Date, locale = 'en'): string => {
  const format = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })
  const seconds = Math.round((to.getTime() - from.getTime()) / 1000)
  const abs = Math.abs(seconds)
  if (abs < 60) return format.format(-seconds, 'second')
  const minutes = Math.round(seconds / 60)
  if (abs < 60 * 60) return format.format(-minutes, 'minute')
  const hours = Math.round(seconds / (60 * 60))
  if (abs < 24 * 60 * 60) return format.format(-hours, 'hour')
  const days = Math.round(seconds / (24 * 60 * 60))
  if (abs < 7 * 24 * 60 * 60) return format.format(-days, 'day')
  const weeks = Math.round(seconds / (7 * 24 * 60 * 60))
  if (abs < 30 * 24 * 60 * 60) return format.format(-weeks, 'week')
  const months = Math.round(seconds / (30 * 24 * 60 * 60))
  if (abs < 365 * 24 * 60 * 60) return format.format(-months, 'month')
  return format.format(-Math.round(seconds / (365 * 24 * 60 * 60)), 'year')
}
