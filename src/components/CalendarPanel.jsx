import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import LoadingSpinner from './LoadingSpinner'
import AuthToast from './AuthToast'
import ConfirmDialog from './ConfirmDialog'
import useRealtimeRefresh from '../hooks/useRealtimeRefresh'
import { getEnrollmentWindow } from '../lib/enrollmentWindow'

const TITLE_LIMIT = 100
const DESCRIPTION_LIMIT = 500
const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

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
  return `${new Date(value).toLocaleTimeString('en-PH', {
    hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Manila',
  })} PHT`
}

function CalendarPanel({ canManage = false, listView = false, showEnrollmentMilestones = false }) {
  const today = toDateValue(new Date())
  const [visibleMonth, setVisibleMonth] = useState(() => {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), 1)
  })
  const [selectedDate, setSelectedDate] = useState(today)
  const [events, setEvents] = useState([])
  const [enrollmentMilestones, setEnrollmentMilestones] = useState([])
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState(null)
  const [message, setMessage] = useState('')
  const [notice, setNotice] = useState('')
  const [pendingDelete, setPendingDelete] = useState(null)
  const [calendarVisible, setCalendarVisible] = useState(!listView)

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
      setMessage('School calendar events are unavailable until the Supabase migration is applied.')
    } else {
      setEvents(data || [])
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
          { id: `semester-${batch.id}-opens`, title: 'Enrollment opens', description: `${batch.name} enrollment opens at ${formatPhilippineTime(batch.opens_at)}.`, event_date: toPhilippineDateValue(batch.opens_at), system: true },
          { id: `semester-${batch.id}-closes`, title: 'Enrollment closes', description: `${batch.name} enrollment closes at ${formatPhilippineTime(batch.closes_at)}.`, event_date: toPhilippineDateValue(batch.closes_at), system: true },
          { id: `semester-${batch.id}-starts`, title: 'Semester starts', description: `${batch.name} begins.`, event_date: batch.starts_on, system: true },
          { id: `semester-${batch.id}-ends`, title: 'Semester ends', description: `${batch.name} ends.`, event_date: batch.ends_on, system: true },
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
  const visibleEvents = listView && !calendarVisible
    ? displayedEvents.filter((item) => item.event_date.startsWith(monthKey))
    : selectedEvents

  return (
    <section className={`calendar-panel${listView ? ' calendar-list-view' : ''}`}>
      <AuthToast message={notice} onDismiss={() => setNotice('')} duration={5000} variant="success" />
      {pendingDelete && <ConfirmDialog title="Delete school calendar event?" message={`“${pendingDelete.title}” will be permanently removed from the school calendar.`} confirmLabel="Delete" busy={deletingId === pendingDelete.id} onConfirm={deleteEvent} onCancel={() => setPendingDelete(null)} />}
      <header className="calendar-header">
        <h2>School Calendar</h2>
        <span className="dashboard-header-detail">{displayedEvents.filter((item) => item.event_date.startsWith(monthKey)).length} events</span>
      </header>
      {listView && <div className="calendar-toolbar"><button type="button" className="calendar-view-toggle" aria-expanded={calendarVisible} onClick={() => setCalendarVisible((visible) => !visible)}>{calendarVisible ? 'Hide calendar' : 'Show calendar'}</button></div>}

      <div className="calendar-layout">
        {(!listView || calendarVisible) && <div className="calendar-main">
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
                className={`${cell.value === selectedDate ? 'selected ' : ''}${cell.value === today ? 'today ' : ''}${displayedEvents.some((item) => item.event_date === cell.value) ? 'has-event' : ''}`.trim()}
                onClick={() => setSelectedDate(cell.value)}
                aria-label={new Date(`${cell.value}T00:00:00`).toLocaleDateString('en-PH', { dateStyle: 'full' })}
              >{cell.day}</button>
            ) : <span key={cell.key} />)}
          </div>
        </div>}

        <aside className="calendar-day-panel">
          {listView && !calendarVisible ? <div className="calendar-list-month-controls">
            <button type="button" onClick={() => changeMonth(-1)} aria-label="Previous month">‹</button>
            <div><span>Events in</span><strong>{visibleMonth.toLocaleDateString('en-PH', { month: 'long', year: 'numeric' })}</strong></div>
            <button type="button" onClick={() => changeMonth(1)} aria-label="Next month">›</button>
          </div> : <div className="calendar-selected-heading">
            <div><span>Selected day</span><strong>{new Date(`${selectedDate}T00:00:00`).toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' })}</strong></div>
          </div>}

          {canManage && (
            <form className="calendar-event-form" onSubmit={createEvent}>
              {listView && !calendarVisible && <label>Event date<input type="date" value={selectedDate} min={`${monthKey}-01`} max={toDateValue(new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 0))} onChange={(event) => setSelectedDate(event.target.value)} required /></label>}
              <label>Event title<input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={TITLE_LIMIT} placeholder="School event" required /><small>{title.length}/{TITLE_LIMIT}</small></label>
              <label>Details <span>(optional)</span><textarea value={description} onChange={(event) => setDescription(event.target.value)} maxLength={DESCRIPTION_LIMIT} rows="3" placeholder="Add helpful details." /><small>{description.length}/{DESCRIPTION_LIMIT}</small></label>
              <button type="submit" disabled={saving || !title.trim()}>{saving ? <LoadingSpinner label="Adding..." inline /> : 'Add Event'}</button>
            </form>
          )}

          {message && <p className="calendar-message">{message}</p>}
          {loading ? <div className="calendar-empty"><LoadingSpinner label="Loading events..." compact /></div> : visibleEvents.length === 0 ? <p className="calendar-empty">{listView && !calendarVisible ? 'No events this month.' : 'No events for this day.'}</p> : <div className="calendar-event-list">
            {visibleEvents.map((item) => <article key={item.id} className={item.system ? 'calendar-system-event' : undefined}><div>{listView && !calendarVisible && <time dateTime={item.event_date}>{new Date(`${item.event_date}T00:00:00`).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}</time>}<h4>{item.title}</h4>{item.description && <p>{item.description}</p>}</div>{canManage && !item.system && <button type="button" disabled={deletingId === item.id} onClick={() => setPendingDelete(item)} aria-label={`Delete school calendar event: ${item.title}`} title="Delete school calendar event"><i className="app-icon app-icon-trash" aria-hidden="true" /></button>}</article>)}
          </div>}
        </aside>
      </div>
    </section>
  )
}

export default CalendarPanel
