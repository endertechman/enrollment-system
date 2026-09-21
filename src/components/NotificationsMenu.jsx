import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { getEnrollmentWindow } from '../lib/enrollmentWindow'
import useRealtimeRefresh from '../hooks/useRealtimeRefresh'

function localDateValue() {
  const now = new Date()
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset())
  return now.toISOString().slice(0, 10)
}

function getChildName(enrollment) {
  return [enrollment?.child_first_name, enrollment?.child_last_name].filter(Boolean).join(' ') || 'a student'
}

const notificationTypes = {
  announcement: { label: 'Announcement', icon: 'app-icon-bell' },
  application: { label: 'Enrollment request', icon: 'app-icon-inbox' },
  attendance: { label: 'Attendance', icon: 'app-icon-check-o' },
  event: { label: 'School calendar', icon: 'app-icon-calendar-dates' },
  semester: { label: 'Semester update', icon: 'app-icon-calendar-due' },
  status: { label: 'Enrollment status', icon: 'app-icon-clipboard' },
}

function NotificationsMenu({ user, role }) {
  const navigate = useNavigate()
  const panelId = useId()
  const headingId = `${panelId}-heading`
  const menuRef = useRef(null)
  const panelRef = useRef(null)
  const triggerRef = useRef(null)
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [readIds, setReadIds] = useState([])
  const [eligible, setEligible] = useState(role === 'parent' || role === 'teacher' || role === 'teacher_aide')

  const loadNotifications = useCallback(async () => {
    const today = localDateValue()
    const staffRole = role === 'teacher' || role === 'teacher_aide'

    if (role !== 'parent' && !staffRole) {
      setItems([])
      setEligible(false)
      setLoading(false)
      return
    }

    setLoading(true)
    setError('')

    try {
      const windowResult = await getEnrollmentWindow()
      if (windowResult.error || !windowResult.data?.current_batch_id) throw windowResult.error || new Error('The current enrollment batch is unavailable.')
      const currentBatchId = windowResult.data.current_batch_id
      const enrollmentQuery = role === 'parent'
        ? supabase.from('enrollments').select('id, child_first_name, child_last_name, status, submitted_at, reviewed_at').eq('parent_id', user.id).eq('batch_id', currentBatchId).order('submitted_at', { ascending: false })
        : supabase.from('enrollments').select('id, child_first_name, child_last_name, status, submitted_at, reviewed_at').eq('batch_id', currentBatchId).order('submitted_at', { ascending: false }).limit(100)

      let staffRequestQuery = Promise.resolve({ data: [], error: null })
      if (staffRole) {
        staffRequestQuery = supabase
          .from('enrollments')
          .select('id, submitted_at')
          .eq('batch_id', currentBatchId)
          .order('submitted_at', { ascending: false })
          .limit(1)

      }

      const [enrollmentResult, requestResult, activeBatchResult, archivedBatchResult, readResult] = await Promise.all([
        enrollmentQuery,
        staffRequestQuery,
        supabase.from('enrollment_batches').select('id, name').eq('id', currentBatchId).single(),
        supabase.from('enrollment_batches').select('id, archived_at').not('archived_at', 'is', null).order('archived_at', { ascending: false }).limit(1).maybeSingle(),
        supabase.from('notification_reads').select('notification_id').eq('user_id', user.id).order('read_at', { ascending: false }).limit(200),
      ])

      if (enrollmentResult.error || requestResult.error || activeBatchResult.error || archivedBatchResult.error || readResult.error) {
        throw enrollmentResult.error || requestResult.error || activeBatchResult.error || archivedBatchResult.error || readResult.error
      }

      setReadIds((readResult.data || []).map((row) => row.notification_id))

      const enrollments = enrollmentResult.data || []
      const approvedEnrollments = enrollments.filter((enrollment) => enrollment.status === 'approved')
      const canReceiveSchoolUpdates = staffRole || approvedEnrollments.length > 0

      setEligible(true)

      const attendanceEnrollmentIds = role === 'parent'
        ? approvedEnrollments.map((enrollment) => enrollment.id)
        : []
      const [announcementResult, eventResult, attendanceResult, nonSchoolResult] = await Promise.all([
        canReceiveSchoolUpdates
          ? supabase.from('announcements').select('id, title, published_at').order('published_at', { ascending: false }).limit(12)
          : Promise.resolve({ data: [], error: null }),
        supabase.from('calendar_events').select('id, title, event_date, created_at').eq('event_date', today).order('created_at', { ascending: false }),
        attendanceEnrollmentIds.length
          ? supabase.from('attendance_records').select('id, enrollment_id, status, attendance_date, updated_at').in('enrollment_id', attendanceEnrollmentIds).order('updated_at', { ascending: false }).limit(20)
          : Promise.resolve({ data: [], error: null }),
        supabase.from('attendance_non_school_days').select('attendance_date').eq('batch_id', currentBatchId),
      ])

      const partialError = [announcementResult, eventResult, attendanceResult, nonSchoolResult]
        .find((result) => result.error)?.error

      const enrollmentMap = new Map(enrollments.map((enrollment) => [enrollment.id, enrollment]))
      const nextItems = []

      if (archivedBatchResult.data?.archived_at && activeBatchResult.data) {
        nextItems.push({
          id: `semester-${activeBatchResult.data.id}-${archivedBatchResult.data.archived_at}`,
          type: 'semester',
          title: `${activeBatchResult.data.name} is now active`,
          detail: 'Previous semester records have been archived.',
          timestamp: archivedBatchResult.data.archived_at,
        })
      }

      for (const announcement of announcementResult.data || []) {
        nextItems.push({ id: `announcement-${announcement.id}`, type: 'announcement', title: announcement.title, detail: 'New BCDC announcement', timestamp: announcement.published_at })
      }

      for (const event of eventResult.data || []) {
        nextItems.push({ id: `event-${event.id}`, type: 'event', title: event.title, detail: 'Scheduled for today', timestamp: event.created_at })
      }

      const nonSchoolDates = new Set((nonSchoolResult.data || []).map((row) => row.attendance_date))
      for (const record of attendanceResult.data || []) {
        if (nonSchoolDates.has(record.attendance_date)) continue
        const student = enrollmentMap.get(record.enrollment_id)
        const childName = getChildName(student)
        const attendanceStatus = record.status === 'present' ? 'present' : 'absent'
        nextItems.push({ id: `attendance-${record.id}-${record.updated_at}`, type: 'attendance', enrollmentId: record.enrollment_id, title: `${childName}'s attendance was marked ${attendanceStatus}`, detail: new Date(`${record.attendance_date}T00:00:00`).toLocaleDateString('en-PH', { dateStyle: 'medium' }), timestamp: record.updated_at })
      }

      for (const enrollment of enrollments) {
        if (role === 'parent') {
          const childName = getChildName(enrollment)

          if (enrollment.submitted_at) {
            nextItems.push({
              id: `submitted-${enrollment.id}`,
              type: 'status',
              enrollmentId: enrollment.id,
              enrollmentStatus: enrollment.status,
              title: `${childName}'s enrollment was submitted successfully`,
              detail: 'Application sent to BCDC',
              timestamp: enrollment.submitted_at,
            })
          }

          if (enrollment.reviewed_at && ['approved', 'rejected'].includes(enrollment.status)) {
            const accepted = enrollment.status === 'approved'
            nextItems.push({
              id: `status-${enrollment.id}-${enrollment.reviewed_at}`,
              type: 'status',
              enrollmentId: enrollment.id,
              enrollmentStatus: enrollment.status,
              title: accepted ? `${childName}'s enrollment was accepted` : `${childName}'s application needs changes`,
              detail: accepted ? 'Application review completed' : 'Open the application to review the teacher’s note and resubmit',
              timestamp: enrollment.reviewed_at,
            })
          }
        }
      }

      if (staffRole) {
        const latestRequest = requestResult.data?.[0]

        if (latestRequest?.submitted_at) {
          nextItems.push({
            id: `enrollment-request-${latestRequest.id}`,
            type: 'application',
            title: 'New student enrollment request',
            detail: 'Open enrollment requests to review it',
            timestamp: latestRequest.submitted_at,
          })
        }
      }

      nextItems.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      setItems(nextItems.slice(0, 30))

      if (partialError) {
        setError('Some notifications could not be loaded. Please try again.')
      }
    } catch {
      setError('Notifications could not be loaded. Please try again.')
    } finally {
      setLoading(false)
    }
  }, [role, user.id])

  const markNotificationsRead = useCallback(async (notificationIds) => {
    const uniqueIds = [...new Set(notificationIds)].filter(Boolean)
    if (uniqueIds.length === 0) return

    setReadIds((currentIds) => [...new Set([...currentIds, ...uniqueIds])])
    const readAt = new Date().toISOString()
    const { error: readError } = await supabase
      .from('notification_reads')
      .upsert(
        uniqueIds.map((notificationId) => ({
          user_id: user.id,
          notification_id: notificationId,
          read_at: readAt,
        })),
        { onConflict: 'user_id,notification_id' },
      )

    if (readError) {
      setError('Notifications could not be marked as read. Please try again.')
    }
  }, [user.id])

  useEffect(() => {
    const initialLoad = window.setTimeout(loadNotifications, 0)
    return () => {
      window.clearTimeout(initialLoad)
    }
  }, [loadNotifications])

  useRealtimeRefresh(loadNotifications, {
    channelName: `notifications-${role}-${user.id}`,
    tables: ['enrollments', 'enrollment_settings', 'enrollment_batches', 'attendance_records', 'attendance_non_school_days', 'announcements', 'calendar_events', 'notification_reads'],
  })

  useEffect(() => {
    if (!open) return undefined
    panelRef.current?.focus()

    function handlePointerDown(event) {
      if (!menuRef.current?.contains(event.target)) setOpen(false)
    }

    function handleKeyDown(event) {
      if (event.key !== 'Escape') return
      event.preventDefault()
      setOpen(false)
      triggerRef.current?.focus()
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  function toggleMenu() {
    if (open) {
      setOpen(false)
      return
    }

    setOpen(true)
    const unreadIds = items
      .filter((item) => !readIds.includes(item.id))
      .map((item) => item.id)
    if (unreadIds.length > 0) void markNotificationsRead(unreadIds)
    loadNotifications()
  }

  async function markNotificationRead(notificationId) {
    if (readIds.includes(notificationId)) return
    await markNotificationsRead([notificationId])
  }

  function openNotification(item) {
    void markNotificationRead(item.id)

    if (item.type === 'semester' && role === 'parent') {
      setOpen(false)
      navigate('/')
      return
    }

    if (role === 'parent' && item.type === 'status' && item.enrollmentStatus !== 'approved') {
      setOpen(false)
      navigate('/')
      return
    }

    let dashboard
    let tab

    if (role === 'parent') {
      dashboard = 'parent'
      tab = item.type === 'announcement' ? 'announcements' : item.type === 'event' ? 'calendar' : 'overview'
    } else if (role === 'teacher') {
      dashboard = 'teacher'
      tab = item.type === 'application' ? 'approvals' : item.type === 'announcement' ? 'announcements' : item.type === 'event' ? 'calendar' : item.type === 'semester' ? 'enrollment-window' : 'students'
    } else {
      dashboard = 'teacher-aide'
      tab = item.type === 'application' ? 'approvals' : item.type === 'announcement' ? 'announcements' : item.type === 'event' ? 'calendar' : item.type === 'semester' ? 'enrollment-window' : 'students'
    }

    const params = new URLSearchParams({ tab })
    if (item.enrollmentId) params.set('child', item.enrollmentId)

    setOpen(false)
    navigate(`/${dashboard}?${params.toString()}`)
    window.dispatchEvent(new CustomEvent('bcdc:notification-navigation', {
      detail: { dashboard, tab, childId: item.enrollmentId || null },
    }))
  }

  const unreadCount = items.filter((item) => !readIds.includes(item.id)).length
  const hasUnread = unreadCount > 0
  const unreadBadgeLabel = unreadCount > 99 ? '99+' : String(unreadCount)
  const emptyMessage = role === 'parent'
    ? 'No updates yet. Enrollment updates will appear here, followed by school updates after acceptance.'
    : 'No updates yet. Enrollment requests, announcements, and today’s events will appear here.'

  if (!eligible) return null

  return (
    <div className="notifications-menu" ref={menuRef}>
      <button ref={triggerRef} type="button" className={`notification-toggle${hasUnread ? ' has-unread' : ''}`} aria-label={hasUnread ? `Notifications, ${unreadCount} unread` : 'Notifications'} aria-expanded={open} aria-controls={panelId} aria-haspopup="dialog" onClick={toggleMenu}>
        <i className="app-icon app-icon-bell" aria-hidden="true" />
        {hasUnread && <span className="notification-badge" aria-hidden="true">{unreadBadgeLabel}</span>}
      </button>

      {open && <section ref={panelRef} id={panelId} className="notifications-dropdown" role="dialog" aria-modal="false" aria-labelledby={headingId} tabIndex="-1">
        <header>
          <div><h2 id={headingId}>Notifications</h2><p>{role === 'parent' ? 'Updates for your enrolled children' : 'Latest BCDC activity'}</p></div>
        </header>
        <div className="notifications-content" aria-live="polite">
          {error && <div className="notifications-error" role="alert"><p>{error}</p><button type="button" disabled={loading} onClick={loadNotifications}>Try again</button></div>}
          {loading && items.length === 0 ? <p className="notifications-empty app-loading" role="status">Loading notifications...</p> : items.length === 0 && !error ? <p className="notifications-empty">{emptyMessage}</p> : items.length > 0 ? <div className="notification-list">
            {items.map((item) => {
              const type = notificationTypes[item.type] || notificationTypes.status
              const unread = !readIds.includes(item.id)

              return <button type="button" key={item.id} className={`notification-item${unread ? ' unread' : ''}`} aria-label={`${type.label}: ${item.title}${unread ? ', unread' : ''}`} onClick={() => openNotification(item)}>
                <span className="notification-item-copy">
                  <span className="notification-meta">
                    <span className={`notification-category ${item.type}`}><i className={`app-icon ${type.icon}`} aria-hidden="true" /><span>{type.label}</span></span>
                    <time dateTime={item.timestamp}>{new Date(item.timestamp).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })}</time>
                  </span>
                  <strong>{item.title}</strong>
                  <span className="notification-detail">{item.detail}</span>
                </span>
                {unread && <span className="notification-unread" aria-hidden="true" />}
              </button>
            })}
          </div> : null}
        </div>
      </section>}
    </div>
  )
}

export default NotificationsMenu
