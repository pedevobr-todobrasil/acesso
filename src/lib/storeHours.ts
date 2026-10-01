import type { OpeningHours } from '../types'

const weekdayMap: Record<string, keyof OpeningHours> = {
  Sun: 'sun', Mon: 'mon', Tue: 'tue', Wed: 'wed', Thu: 'thu', Fri: 'fri', Sat: 'sat',
}
const week: Array<keyof OpeningHours> = ['sun','mon','tue','wed','thu','fri','sat']

function minutes(value?: string) {
  if (!value || !/^\d{2}:\d{2}$/.test(value)) return null
  const [h,m] = value.split(':').map(Number)
  return h * 60 + m
}

function localParts(timeZone: string, date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  const day = weekdayMap[values.weekday] || 'sun'
  return { day, minuteOfDay: Number(values.hour || 0) * 60 + Number(values.minute || 0) }
}

export function isStoreOpenNow(manualOpen: boolean, openingHours?: OpeningHours, timeZone = 'America/Sao_Paulo') {
  if (!manualOpen) return false
  if (!openingHours || Object.keys(openingHours).length === 0) return true

  const { day, minuteOfDay } = localParts(timeZone)
  const today = openingHours[day]
  if (today?.enabled) {
    const open = minutes(today.open)
    const close = minutes(today.close)
    if (open != null && close != null) {
      if (open === close) return true
      if (open < close && minuteOfDay >= open && minuteOfDay < close) return true
      if (open > close && minuteOfDay >= open) return true
    }
  }

  const dayIndex = week.indexOf(day)
  const previousDay = week[(dayIndex + 6) % 7]
  const previous = openingHours[previousDay]
  if (previous?.enabled) {
    const open = minutes(previous.open)
    const close = minutes(previous.close)
    if (open != null && close != null && open > close && minuteOfDay < close) return true
  }
  return false
}

export function todayStoreHours(openingHours?: OpeningHours, timeZone = 'America/Sao_Paulo') {
  if (!openingHours || Object.keys(openingHours).length === 0) return 'Horário não informado'
  const { day } = localParts(timeZone)
  const hours = openingHours[day]
  if (!hours?.enabled) return 'Fechado hoje'
  return `Hoje: ${hours.open}–${hours.close}`
}
