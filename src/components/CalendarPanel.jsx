import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import LoadingSpinner from './LoadingSpinner'
import AuthToast from './AuthToast'
import ConfirmDialog from './ConfirmDialog'
import useRealtimeRefresh from '../hooks/useRealtimeRefresh'

const TITLE_LIMIT = 100
const DESCRIPTION_LIMIT = 500
const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function toDateValue(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function CalendarPanel({ canManage = false }) {
  const today = toDateValue(new Date())
  const [visibleMonth, setVisibleMonth] = useState(() => {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), 1)
  })
  const [selectedDate, setSelectedDate] = useState(today)
  const [events, setEvents] = useState([])
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
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
    const { data, error } = await supabase
      .from('calendar_events')
      .select('id, title, description, event_date, created_at')
      .gte('event_date', firstDay)
      .lte('event_date', lastDay)
      .order('event_date', { ascending: true })
      .order('created_at', { ascending: true })

    if (error) {
      setEvents([])
      setMessage('Calendar events are unavailable until the Supabase migration is applied.')
    } else {
      setEvents(data || [])
    }
    setLoading(false)
  }, [monthKey, visibleMonth])

  useEffect(() => {
    const loadTimer = window.setTimeout(loadEvents, 0)
    return () => window.clearTimeout(loadTimer)
  }, [loadEvents])

  useRealtimeRefresh(() => loadEvents({ silent: true }), {
    channelName: 'calendar-panel',
    tables: ['calendar_events'],
  })

  function changeMonth(amount) {
    const nextMonth = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + amount, 1)
    setVisibleMonth(nextMonth)
    setSelectedDate(toDateValue(nextMonth))
  }

  function chooseDate(value) {
    const chosen = new Date(`${value}T00:00:00`)
    setSelectedDate(value)
    if (chosen.getFullYear() !== visibleMonth.getFullYear() || chosen.getMonth() !== visibleMonth.getMonth()) {
      setVisibleMonth(new Date(chosen.getFullYear(), chosen.getMonth(), 1))
    }
  }

  async function createEvent(event) {
    event.preventDefault()
    const cleanTitle = title.trim()
    const cleanDescription = description.trim()
    if (!cleanTitle || !selectedDate) return

    setSaving(true)
    setMessage('')
    setNotice('')
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setMessage('You must be logged in to create an event.')
      setSaving(false)
      return
    }

    const { data, error } = await supabase
      .from('calendar_events')
      .insert({
        title: cleanTitle,
        description: cleanDescription || null,
        event_date: selectedDate,
        created_by: user.id,
      })
      .select('id, title, description, event_date, created_at')
      .single()

    if (error) {
      setMessage(error.message)
    } else {
      setEvents((current) => [...current, data].sort((a, b) => a.event_date.localeCompare(b.event_date)))
      setTitle('')
      setDescription('')
      setNotice('Calendar event added.')
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
      setNotice('Calendar event deleted.')
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
  const selectedEvents = events.filter((item) => item.event_date === selectedDate)

  return (
    <section className="calendar-panel">
      <AuthToast message={notice} onDismiss={() => setNotice('')} duration={5000} variant="success" />
      {pendingDelete && <ConfirmDialog title="Delete calendar event?" message={`“${pendingDelete.title}” will be permanently removed from the calendar.`} confirmLabel="Delete" busy={deletingId === pendingDelete.id} onConfirm={deleteEvent} onCancel={() => setPendingDelete(null)} />}
      <header className="calendar-header">
        <div><h2>Calendar</h2></div>
      </header>

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
                className={`${cell.value === selectedDate ? 'selected ' : ''}${cell.value === today ? 'today ' : ''}${events.some((item) => item.event_date === cell.value) ? 'has-event' : ''}`.trim()}
                onClick={() => setSelectedDate(cell.value)}
                aria-label={new Date(`${cell.value}T00:00:00`).toLocaleDateString('en-PH', { dateStyle: 'full' })}
              >{cell.day}</button>
            ) : <span key={cell.key} />)}
          </div>
        </div>

        <aside className="calendar-day-panel">
          <div className="calendar-selected-heading">
            <div><span>Selected day</span><strong>{new Date(`${selectedDate}T00:00:00`).toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' })}</strong></div>
            <input type="date" value={selectedDate} onChange={(event) => chooseDate(event.target.value)} aria-label="Select event date" />
          </div>

          {canManage && (
            <form className="calendar-event-form" onSubmit={createEvent}>
              <label>Event title<input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={TITLE_LIMIT} placeholder="School event" required /><small>{title.length}/{TITLE_LIMIT}</small></label>
              <label>Details <span>(optional)</span><textarea value={description} onChange={(event) => setDescription(event.target.value)} maxLength={DESCRIPTION_LIMIT} rows="3" placeholder="Add helpful details." /><small>{description.length}/{DESCRIPTION_LIMIT}</small></label>
              <button type="submit" disabled={saving || !title.trim()}>{saving ? <LoadingSpinner label="Adding..." inline /> : 'Add Event'}</button>
            </form>
          )}

          {message && <p className="calendar-message">{message}</p>}
          {loading ? <div className="calendar-empty"><LoadingSpinner label="Loading events..." compact /></div> : selectedEvents.length === 0 ? <p className="calendar-empty">No events for this day.</p> : <div className="calendar-event-list">
            {selectedEvents.map((item) => <article key={item.id}><div><h4>{item.title}</h4>{item.description && <p>{item.description}</p>}</div>{canManage && <button type="button" disabled={deletingId === item.id} onClick={() => setPendingDelete(item)} aria-label={`Delete calendar event: ${item.title}`} title="Delete calendar event"><i className="app-icon app-icon-trash" aria-hidden="true" /></button>}</article>)}
          </div>}
        </aside>
      </div>
    </section>
  )
}

export default CalendarPanel
