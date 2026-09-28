import { supabase } from './supabase'

export async function getEnrollmentWindow() {
  return supabase
    .from('enrollment_settings')
    .select('opens_at, closes_at, updated_at, current_batch_id')
    .eq('id', true)
    .single()
}

export function toDateTimeLocalValue(value) {
  if (!value) return ''
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const localTime = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
  return localTime.toISOString().slice(0, 16)
}

export function isEnrollmentOpen(schedule) {
  if (!schedule?.opens_at || !schedule?.closes_at) return false
  const now = Date.now()
  return now >= new Date(schedule.opens_at).getTime() && now <= new Date(schedule.closes_at).getTime()
}

export function getEnrollmentWindowStatus(schedule) {
  if (!schedule?.opens_at || !schedule?.closes_at) return 'closed'
  const now = Date.now()
  if (now < new Date(schedule.opens_at).getTime()) return 'scheduled'
  if (now > new Date(schedule.closes_at).getTime()) return 'closed'
  return 'open'
}

export function getEnrollmentWindowStatusLabel(schedule) {
  const status = getEnrollmentWindowStatus(schedule)
  if (status === 'open') return 'Active schedule (open)'
  if (status === 'scheduled') return 'Upcoming schedule'
  return 'Schedule closed'
}
