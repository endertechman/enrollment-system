import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import LoadingSpinner from './LoadingSpinner'

function localDateValue() {
  const now = new Date()
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset())
  return now.toISOString().slice(0, 10)
}

function getChildName(enrollment) {
  return [enrollment?.child_first_name, enrollment?.child_last_name].filter(Boolean).join(' ') || 'a student'
}

function NotificationsMenu({ user, role }) {
  const menuRef = useRef(null)
  const storageKey = `bcdc-notifications-seen:${user.id}`
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [lastSeen, setLastSeen] = useState(() => Number(window.localStorage.getItem(storageKey)) || 0)
  const [eligible, setEligible] = useState(role !== 'parent')

  const loadNotifications = useCallback(async () => {
    const today = localDateValue()
    const staffRole = role === 'teacher' || role === 'teacher_aide'

    if (role !== 'parent' && !staffRole) {
      setItems([])
      setEligible(false)
      setLoading(false)
      return
    }

    const enrollmentQuery = role === 'parent'
      ? supabase.from('enrollments').select('id, child_first_name, child_last_name, status, submitted_at, reviewed_at').eq('parent_id', user.id).order('submitted_at', { ascending: false })
      : supabase.from('enrollments').select('id, child_first_name, child_last_name, status, submitted_at, reviewed_at').order('submitted_at', { ascending: false }).limit(100)

    const enrollmentResult = await enrollmentQuery
    const enrollments = enrollmentResult.data || []
    const approvedEnrollments = enrollments.filter((enrollment) => enrollment.status === 'approved')
    const canReceiveNotifications = staffRole || approvedEnrollments.length > 0

    setEligible(canReceiveNotifications)

    if (enrollmentResult.error || !canReceiveNotifications) {
      setItems([])
      setLoading(false)
      return
    }

    const attendanceEnrollmentIds = approvedEnrollments.map((enrollment) => enrollment.id)
    const [announcementResult, eventResult, attendanceResult] = await Promise.all([
      supabase.from('announcements').select('id, title, published_at').order('published_at', { ascending: false }).limit(12),
      supabase.from('calendar_events').select('id, title, event_date, created_at').eq('event_date', today).order('created_at', { ascending: false }),
      attendanceEnrollmentIds.length
        ? supabase.from('attendance_records').select('id, enrollment_id, status, attendance_date, updated_at').in('enrollment_id', attendanceEnrollmentIds).order('updated_at', { ascending: false }).limit(20)
        : Promise.resolve({ data: [] }),
    ])

    const enrollmentMap = new Map(enrollments.map((enrollment) => [enrollment.id, enrollment]))
    const nextItems = []

    for (const announcement of announcementResult.data || []) {
      nextItems.push({ id: `announcement-${announcement.id}`, type: 'announcement', title: announcement.title, detail: 'New BCDC announcement', timestamp: announcement.published_at })
    }

    for (const event of eventResult.data || []) {
      nextItems.push({ id: `event-${event.id}`, type: 'event', title: event.title, detail: 'Scheduled for today', timestamp: event.created_at })
    }

    for (const record of attendanceResult.data || []) {
      const student = enrollmentMap.get(record.enrollment_id)
      nextItems.push({ id: `attendance-${record.id}`, type: 'attendance', title: `${getChildName(student)}: ${record.status}`, detail: `Attendance for ${new Date(`${record.attendance_date}T00:00:00`).toLocaleDateString('en-PH', { dateStyle: 'medium' })}`, timestamp: record.updated_at })
    }

    for (const enrollment of enrollments) {
      if (role === 'parent') {
        if (enrollment.reviewed_at) {
          const status = enrollment.status === 'approved' ? 'accepted' : enrollment.status
          nextItems.push({ id: `status-${enrollment.id}-${enrollment.reviewed_at}`, type: 'status', title: `${getChildName(enrollment)}: ${status}`, detail: 'Enrollment status updated', timestamp: enrollment.reviewed_at })
        } else if (enrollment.status === 'pending') {
          nextItems.push({ id: `submitted-${enrollment.id}`, type: 'status', title: `${getChildName(enrollment)}: pending`, detail: 'Enrollment application received', timestamp: enrollment.submitted_at })
        }
      } else if (enrollment.status === 'pending') {
        nextItems.push({ id: `application-${enrollment.id}`, type: 'application', title: `New application: ${getChildName(enrollment)}`, detail: 'Waiting for teacher review', timestamp: enrollment.submitted_at })
      } else if (enrollment.reviewed_at) {
        const status = enrollment.status === 'approved' ? 'accepted' : enrollment.status
        nextItems.push({ id: `staff-status-${enrollment.id}-${enrollment.reviewed_at}`, type: 'status', title: `${getChildName(enrollment)}: ${status}`, detail: 'Enrollment status updated', timestamp: enrollment.reviewed_at })
      }
    }

    nextItems.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    setItems(nextItems.slice(0, 30))
    setLoading(false)
  }, [role, user.id])

  useEffect(() => {
    const initialLoad = window.setTimeout(loadNotifications, 0)
    const refreshTimer = window.setInterval(loadNotifications, 60000)
    return () => {
      window.clearTimeout(initialLoad)
      window.clearInterval(refreshTimer)
    }
  }, [loadNotifications])

  useEffect(() => {
    if (!open) return undefined
    function closeMenu(event) {
      if (!menuRef.current?.contains(event.target)) setOpen(false)
    }
    document.addEventListener('pointerdown', closeMenu)
    return () => document.removeEventListener('pointerdown', closeMenu)
  }, [open])

  function toggleMenu() {
    const opening = !open
    setOpen(opening)
    if (opening) {
      loadNotifications()
      const seenAt = Date.now()
      window.localStorage.setItem(storageKey, String(seenAt))
      setLastSeen(seenAt)
    }
  }

  const unreadCount = items.filter((item) => new Date(item.timestamp).getTime() > lastSeen).length

  if (!eligible) return null

  return (
    <div className="notifications-menu" ref={menuRef}>
      <button type="button" className="notification-toggle" aria-label={unreadCount ? `Notifications, ${unreadCount} unread` : 'Notifications'} aria-expanded={open} onClick={toggleMenu}>
        <i className="app-icon app-icon-bell" aria-hidden="true" />
        {unreadCount > 0 && <span className="notification-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>}
      </button>

      {open && <section className="notifications-dropdown">
        <header><div><h2>Notifications</h2><p>{role === 'parent' ? 'Updates for your enrolled children' : 'Latest BCDC activity'}</p></div><button type="button" className="notifications-refresh" onClick={loadNotifications} aria-label="Refresh notifications" title="Refresh notifications"><i className="app-icon app-icon-redo" aria-hidden="true" /></button></header>
        {loading ? <div className="notifications-empty"><LoadingSpinner label="Loading notifications..." compact /></div> : items.length === 0 ? <p className="notifications-empty">You’re all caught up.</p> : <div className="notification-list">
          {items.map((item) => <article key={item.id} className={new Date(item.timestamp).getTime() > lastSeen ? 'unread' : ''}>
            <span className={`notification-type ${item.type}`} aria-hidden="true" />
            <div><strong>{item.title}</strong><p>{item.detail}</p><time dateTime={item.timestamp}>{new Date(item.timestamp).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })}</time></div>
          </article>)}
        </div>}
      </section>}
    </div>
  )
}

export default NotificationsMenu
