import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import AuthToast from './AuthToast'
import ConfirmDialog from './ConfirmDialog'
import useRealtimeRefresh from '../hooks/useRealtimeRefresh'
import { getEnrollmentWindow } from '../lib/enrollmentWindow'

const TITLE_LIMIT = 100
const MAX_EVENTS_PER_DAY = 5
const DEFAULT_EVENT_COLOR = '#35c8d0'
const EVENT_COLORS = [
  { name: 'Aqua', hex: '#35c8d0' },
  { name: 'Pink', hex: '#ef92b3' },
  { name: 'Purple', hex: '#8d75c8' },
  { name: 'Orange', hex: '#de9b55' },
  { name: 'Blue', hex: '#5d9dda' },
  { name: 'Green', hex: '#62ae83' },
  { name: 'Red', hex: '#d95864' },
  { name: 'Slate', hex: '#78889d' },
]
const MILESTONE_COLORS = {
  opens: '#35c8d0',
  closes: '#ef92b3',
  starts: '#8d75c8',
  ends: '#de9b55',
}
const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function eventColor(item) {
  return /^#[0-9a-f]{6}$/i.test(item?.color_hex || '') ? item.color_hex : DEFAULT_EVENT_COLOR
}

function isMissingColorColumn(error) {
  return error?.code === '42703' || error?.code === 'PGRST204'
}

function toDateValue(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function toPhilippineDateValue(value) {
  if (!value) return ''
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date(value))
  const part = (type) => parts.find((item) => item.type === type)?.value || ''
  return `${part('year')}-${part('month')}-${part('day')}`
}

function formatPhilippineTime(value) {
  if (!value) return ''
  return new Date(value).toLocaleTimeString('en-PH', {
    hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Manila',
  })
}

function CalendarPanel({ canManage = false, showEnrollmentMilestones = true }) {
  const today = toDateValue(new Date())
  const [visibleMonth, setVisibleMonth] = useState(() => {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), 1)
  })
  const [selectedDate, setSelectedDate] = useState(today)
  const [events, setEvents] = useState([])
  const [enrollmentMilestones, setEnrollmentMilestones] = useState([])
  const [title, setTitle] = useState('')
  const [eventColorHex, setEventColorHex] = useState(DEFAULT_EVENT_COLOR)
  const [colorPaletteOpen, setColorPaletteOpen] = useState(false)
  const [customColorsAvailable, setCustomColorsAvailable] = useState(true)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState(null)
  const [message, setMessage] = useState('')
  const [notice, setNotice] = useState('')
  const [pendingDelete, setPendingDelete] = useState(null)

  const monthKey = `${visibleMonth.getFullYear()}-${String(visibleMonth.getMonth() + 1).padStart(2, '0')}`

  const loadEvents = useCallback(async ({ silent = false } = {}) => {
    if (!silent) {
      setLoading(true)
      setMessage('')
    }
    const firstDay = `${monthKey}-01`
    const lastDay = toDateValue(new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 0))
    const colorResult = await supabase
      .from('calendar_events')
      .select('id, title, event_date, created_at, color_hex')
      .gte('event_date', firstDay)
      .lte('event_date', lastDay)
      .order('event_date', { ascending: true })
      .order('created_at', { ascending: true })
    const result = isMissingColorColumn(colorResult.error)
      ? await supabase.from('calendar_events')
        .select('id, title, event_date, created_at')
        .gte('event_date', firstDay)
        .lte('event_date', lastDay)
        .order('event_date', { ascending: true })
        .order('created_at', { ascending: true })
      : colorResult
    setCustomColorsAvailable(!isMissingColorColumn(colorResult.error))

    if (result.error) {
      setEvents([])
      setMessage('School calendar events are temporarily unavailable.')
    } else {
      setEvents(result.data || [])
    }

    if (showEnrollmentMilestones) {
      const windowResult = await getEnrollmentWindow()
      const activeBatchId = windowResult.data?.current_batch_id
      const batchResult = activeBatchId
        ? await supabase
          .from('enrollment_batches')
          .select('id, name, starts_on, ends_on, opens_at, closes_at')
          .eq('id', activeBatchId)
          .maybeSingle()
        : { data: null, error: null }

      if (!windowResult.error && !batchResult.error && batchResult.data) {
        const batch = batchResult.data
        const milestones = [
          { id: `semester-${batch.id}-opens`, title: 'Enrollment opens', description: formatPhilippineTime(batch.opens_at), event_date: toPhilippineDateValue(batch.opens_at), color_hex: MILESTONE_COLORS.opens, system: true },
          { id: `semester-${batch.id}-closes`, title: 'Enrollment closes', description: formatPhilippineTime(batch.closes_at), event_date: toPhilippineDateValue(batch.closes_at), color_hex: MILESTONE_COLORS.closes, system: true },
          { id: `semester-${batch.id}-starts`, title: `${batch.name} begins`, event_date: batch.starts_on, color_hex: MILESTONE_COLORS.starts, system: true },
          { id: `semester-${batch.id}-ends`, title: `${batch.name} ends`, event_date: batch.ends_on, color_hex: MILESTONE_COLORS.ends, system: true },
        ].filter((item) => item.event_date)
        setEnrollmentMilestones(milestones)
      } else {
        setEnrollmentMilestones([])
      }
    } else {
      setEnrollmentMilestones([])
    }
    setLoading(false)
  }, [monthKey, showEnrollmentMilestones, visibleMonth])

  useEffect(() => {
    const loadTimer = window.setTimeout(loadEvents, 0)
    return () => window.clearTimeout(loadTimer)
  }, [loadEvents])

  useRealtimeRefresh(() => loadEvents({ silent: true }), {
    channelName: 'calendar-panel',
    tables: showEnrollmentMilestones ? ['calendar_events', 'enrollment_settings', 'enrollment_batches'] : ['calendar_events'],
  })

  function changeMonth(amount) {
    const nextMonth = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + amount, 1)
    setVisibleMonth(nextMonth)
    setSelectedDate(toDateValue(nextMonth))
  }

  async function createEvent(event) {
    event.preventDefault()
    const cleanTitle = title.trim()
    if (!cleanTitle || !selectedDate) return
    if (events.filter((item) => item.event_date === selectedDate).length >= MAX_EVENTS_PER_DAY) {
      setMessage(`A maximum of ${MAX_EVENTS_PER_DAY} events can be added to one day.`)
      return
    }

    setSaving(true)
    setMessage('')
    setNotice('')
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setMessage('You must be logged in to create an event.')
      setSaving(false)
      return
    }

    const payload = {
      title: cleanTitle,
      event_date: selectedDate,
      created_by: user.id,
      ...(customColorsAvailable ? { color_hex: eventColorHex } : {}),
    }
    const { data, error } = await supabase
      .from('calendar_events')
      .insert(payload)
      .select(customColorsAvailable ? 'id, title, event_date, created_at, color_hex' : 'id, title, event_date, created_at')
      .single()

    if (error) {
      setMessage(error.message)
    } else {
      setEvents((current) => [...current, data].sort((a, b) => a.event_date.localeCompare(b.event_date)))
      setTitle('')
      setNotice('School calendar event added.')
    }
    setSaving(false)
  }

  async function deleteEvent() {
    const id = pendingDelete?.id
    if (!id) return
    setDeletingId(id)
    setMessage('')
    setNotice('')
    const { error } = await supabase.from('calendar_events').delete().eq('id', id)
    if (error) setMessage(error.message)
    else {
      setEvents((current) => current.filter((item) => item.id !== id))
      setNotice('School calendar event deleted.')
    }
    setDeletingId(null)
    setPendingDelete(null)
  }

  const daysInMonth = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 0).getDate()
  const startingDay = visibleMonth.getDay()
  const calendarCells = [
    ...Array.from({ length: startingDay }, (_, index) => ({ key: `blank-${index}` })),
    ...Array.from({ length: daysInMonth }, (_, index) => {
      const value = toDateValue(new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), index + 1))
      return { key: value, value, day: index + 1 }
    }),
  ]
  const displayedEvents = [...events, ...enrollmentMilestones].sort((a, b) => a.event_date.localeCompare(b.event_date))
  const selectedEvents = displayedEvents.filter((item) => item.event_date === selectedDate)
  const visibleEvents = selectedEvents
  const selectedCreatedEventCount = events.filter((item) => item.event_date === selectedDate).length
  const selectedDayIsFull = selectedCreatedEventCount >= MAX_EVENTS_PER_DAY
  const eventsByDate = displayedEvents.reduce((groups, item) => {
    if (!groups.has(item.event_date)) groups.set(item.event_date, [])
    groups.get(item.event_date).push(item)
    return groups
  }, new Map())

  return (
    <section className="calendar-panel">
      <AuthToast message={notice} onDismiss={() => setNotice('')} duration={5000} variant="success" />
      {pendingDelete && <ConfirmDialog title="Delete school calendar event?" message={`“${pendingDelete.title}” will be permanently removed from the school calendar.`} confirmLabel="Delete" busy={deletingId === pendingDelete.id} onConfirm={deleteEvent} onCancel={() => setPendingDelete(null)} />}
      <header className="calendar-header">
        <h2>School Calendar</h2>
      </header>
      <div className="calendar-directory-heading">
        <div><span>BCDC Event Calendar</span><p>Select a date to view school activities and important events.</p></div>
        <div className="calendar-directory-actions">
          <strong>{displayedEvents.filter((item) => item.event_date.startsWith(monthKey)).length} events</strong>
        </div>
      </div>

      <div className="calendar-layout">
        <div className="calendar-main">
          <div className="calendar-month-controls">
            <button type="button" onClick={() => changeMonth(-1)} aria-label="Previous month">‹</button>
            <h3>{visibleMonth.toLocaleDateString('en-PH', { month: 'long', year: 'numeric' })}</h3>
            <button type="button" onClick={() => changeMonth(1)} aria-label="Next month">›</button>
          </div>
          <div className="calendar-weekdays">{weekdays.map((day) => <span key={day}>{day}</span>)}</div>
          <div className="calendar-grid">
            {calendarCells.map((cell) => cell.value ? (
              <button
                type="button"
                key={cell.key}
                className={`${cell.value === selectedDate ? 'selected ' : ''}${eventsByDate.has(cell.value) ? 'has-event' : ''}`.trim()}
                onClick={() => setSelectedDate(cell.value)}
                aria-label={`${new Date(`${cell.value}T00:00:00`).toLocaleDateString('en-PH', { dateStyle: 'full' })}, ${eventsByDate.get(cell.value)?.length || 0} events`}
              ><span className="calendar-day-number">{cell.day}</span>{eventsByDate.has(cell.value) && <span className="calendar-date-markers" aria-hidden="true">{eventsByDate.get(cell.value).map((item) => <span key={item.id} style={{ '--event-color': eventColor(item) }} />)}</span>}</button>
            ) : <span key={cell.key} />)}
          </div>
        </div>

        <aside className="calendar-day-panel">
          <div className="calendar-selected-heading">
            <div><span>Selected day</span><strong>{new Date(`${selectedDate}T00:00:00`).toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' })}</strong></div>
            {canManage && <small>{selectedCreatedEventCount}/{MAX_EVENTS_PER_DAY} events</small>}
          </div>

          {canManage && (
            <form className="calendar-event-form" onSubmit={createEvent}>
              <div className="calendar-event-title">
                <label htmlFor="calendar-event-title-input">Event title</label>
                <small>{title.length}/{TITLE_LIMIT}</small>
                <div className="calendar-event-input-row">
                  <input id="calendar-event-title-input" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={TITLE_LIMIT} placeholder="Name of the event" required />
                  <div className="calendar-color-control" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setColorPaletteOpen(false) }} onKeyDown={(event) => { if (event.key === 'Escape') setColorPaletteOpen(false) }}>
                    <button type="button" className="calendar-color-trigger" onClick={() => setColorPaletteOpen((open) => !open)} disabled={!customColorsAvailable} aria-label="Choose event color" aria-expanded={colorPaletteOpen} title={customColorsAvailable ? 'Choose event color' : 'Apply the calendar color migration to enable custom colors'}><span style={{ backgroundColor: eventColorHex }} /></button>
                    {colorPaletteOpen && <div className="calendar-color-palette" role="group" aria-label="Event colors">{EVENT_COLORS.map((color) => <button key={color.hex} type="button" className={eventColorHex === color.hex ? 'selected' : ''} style={{ '--swatch-color': color.hex }} onClick={() => { setEventColorHex(color.hex); setColorPaletteOpen(false) }} aria-label={color.name} aria-pressed={eventColorHex === color.hex} title={color.name}><span /></button>)}</div>}
                  </div>
                </div>
              </div>
              <button type="submit" className="calendar-submit-event" disabled={saving || !title.trim() || selectedDayIsFull}>Add Event</button>
            </form>
          )}

          {canManage && !customColorsAvailable && <p className="calendar-color-note">Apply the calendar color migration to enable custom event colors.</p>}
          {message && <p className="calendar-message">{message}</p>}
          {loading ? <p className="calendar-empty app-loading" role="status">Loading events...</p> : visibleEvents.length === 0 ? <p className="calendar-empty">No events for this day.</p> : <div className="calendar-event-list">
            {visibleEvents.map((item) => <article key={item.id} className={item.system ? 'calendar-system-event' : undefined} style={{ '--event-color': eventColor(item) }}><div><h4>{item.title}</h4>{item.description && <p>{item.description}</p>}</div>{canManage && !item.system && <button type="button" className="icon-delete-button" disabled={deletingId === item.id} onClick={() => setPendingDelete(item)} aria-label={`Delete school calendar event: ${item.title}`} title="Delete school calendar event"><i className="app-icon app-icon-trash" aria-hidden="true" /></button>}</article>)}
          </div>}
        </aside>
      </div>
    </section>
  )
}

export default CalendarPanel
