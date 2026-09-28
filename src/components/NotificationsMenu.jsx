import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { getEnrollmentWindow } from '../lib/enrollmentWindow'
import { getPhilippineDateValue as localDateValue } from '../lib/philippineDate'
import useRealtimeRefresh from '../hooks/useRealtimeRefresh'

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

function isUnreadNotification(item, readReceipts) {
  const readAt = readReceipts[item.id]
  if (!readAt) return true
  return item.type === 'application' && new Date(item.timestamp).getTime() > new Date(readAt).getTime()
}

function NotificationsMenu({ user, role }) {
  const navigate = useNavigate()
  const panelId = useId()
  const headingId = `${panelId}-heading`
  const menuRef = useRef(null)
  const panelRef = useRef(null)
  const triggerRef = useRef(null)
  const loadSequenceRef = useRef(0)
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [readReceipts, setReadReceipts] = useState({})
  const [eligible, setEligible] = useState(role === 'parent' || role === 'teacher' || role === 'teacher_aide')

  const loadNotifications = useCallback(async () => {
    const loadSequence = ++loadSequenceRef.current
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
      const requestNotificationId = `enrollment-requests-${currentBatchId}`
      const enrollmentQuery = role === 'parent'
        ? supabase.from('enrollments').select('id, child_first_name, child_last_name, status, student_state, submitted_at, resubmitted_at, reviewed_at').eq('parent_id', user.id).eq('batch_id', currentBatchId).order('submitted_at', { ascending: false })
        : Promise.resolve({ data: [], error: null })

      let staffRequestQuery = Promise.resolve({ data: [], error: null })
      if (staffRole) {
        staffRequestQuery = supabase
          .from('enrollments')
          .select('id, submitted_at', { count: 'exact' })
          .eq('batch_id', currentBatchId)
          .eq('status', 'pending')
          .order('submitted_at', { ascending: false })
          .limit(1)

      }

      const [enrollmentResult, requestResult, activeBatchResult, archivedBatchResult, requestReadResult] = await Promise.all([
        enrollmentQuery,
        staffRequestQuery,
        supabase.from('enrollment_batches').select('id, name').eq('id', currentBatchId).single(),
        supabase.from('enrollment_batches').select('id, archived_at').not('archived_at', 'is', null).order('archived_at', { ascending: false }).limit(1).maybeSingle(),
        staffRole
          ? supabase.from('notification_reads').select('read_at').eq('user_id', user.id).eq('notification_id', requestNotificationId).maybeSingle()
          : Promise.resolve({ data: null, error: null }),
      ])
      if (loadSequence !== loadSequenceRef.current) return

      if (enrollmentResult.error || requestResult.error || activeBatchResult.error || archivedBatchResult.error || requestReadResult.error) {
        throw enrollmentResult.error || requestResult.error || activeBatchResult.error || archivedBatchResult.error || requestReadResult.error
      }

      const requestReadAt = requestReadResult.data?.read_at
      const newRequestResult = staffRole && requestReadAt && requestResult.count
        ? await supabase.from('enrollments').select('id', { count: 'exact', head: true }).eq('batch_id', currentBatchId).eq('status', 'pending').gt('submitted_at', requestReadAt)
        : { count: requestResult.count || 0, error: null }

      const enrollments = enrollmentResult.data || []
      const activeEnrollments = enrollments.filter((enrollment) => enrollment.status === 'approved' && (enrollment.student_state || 'enrolled') === 'enrolled')
      const canReceiveSchoolUpdates = staffRole || activeEnrollments.length > 0

      setEligible(true)

      const attendanceEnrollmentIds = role === 'parent'
        ? activeEnrollments.map((enrollment) => enrollment.id)
        : []
      const [announcementResult, eventResult, attendanceResult, nonSchoolResult] = await Promise.all([
        canReceiveSchoolUpdates
          ? supabase.from('announcements').select('id, title, published_at').order('published_at', { ascending: false }).limit(12)
          : Promise.resolve({ data: [], error: null }),
        canReceiveSchoolUpdates
          ? supabase.from('calendar_events').select('id, title, event_date, created_at').eq('event_date', today).order('created_at', { ascending: false })
          : Promise.resolve({ data: [], error: null }),
        attendanceEnrollmentIds.length
          ? supabase.from('attendance_records').select('id, enrollment_id, status, attendance_date, updated_at').in('enrollment_id', attendanceEnrollmentIds).order('updated_at', { ascending: false }).limit(20)
          : Promise.resolve({ data: [], error: null }),
        supabase.from('attendance_non_school_days').select('attendance_date').eq('batch_id', currentBatchId),
      ])
      if (loadSequence !== loadSequenceRef.current) return

      const partialError = [announcementResult, eventResult, attendanceResult, nonSchoolResult, newRequestResult]
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
        nextItems.push({ id: `event-${event.id}`, type: 'event', title: event.title, detail: 'Scheduled for today', timestamp: event.created_at, eventDate: event.event_date, sortAt: `${event.event_date}T23:59:59+08:00` })
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
              id: `submitted-${enrollment.id}-${enrollment.submitted_at}`,
              type: 'status',
              enrollmentId: enrollment.id,
              title: `${childName}'s enrollment was ${enrollment.resubmitted_at ? 'resubmitted' : 'submitted'} successfully`,
              detail: 'View this child’s enrollment in the Parent Dashboard',
              timestamp: enrollment.submitted_at,
            })
          }

          if (enrollment.reviewed_at && ['approved', 'rejected'].includes(enrollment.status)) {
            const accepted = enrollment.status === 'approved'
            nextItems.push({
              id: `status-${enrollment.id}-${enrollment.reviewed_at}`,
              type: 'status',
              enrollmentId: enrollment.id,
              title: accepted ? `${childName}'s enrollment was accepted` : `${childName}'s application needs changes`,
              detail: accepted ? 'View the child’s enrollment in the Parent Dashboard' : 'View the teacher’s note and resubmit from the Parent Dashboard',
              timestamp: enrollment.reviewed_at,
            })
          }
        }
      }

      if (staffRole) {
        const latestRequest = requestResult.data?.[0]
        const pendingCount = requestResult.count || 0
        const newCount = newRequestResult.count ?? pendingCount

        if (latestRequest?.submitted_at) {
          nextItems.push({
            id: requestNotificationId,
            type: 'application',
            title: newCount > 0
              ? `${newCount} new enrollment ${newCount === 1 ? 'request' : 'requests'}`
              : `${pendingCount} enrollment ${pendingCount === 1 ? 'request' : 'requests'} pending`,
            detail: 'Open enrollment requests to review them',
            timestamp: latestRequest.submitted_at,
          })
        }
      }

      nextItems.sort((a, b) => new Date(b.sortAt || b.timestamp).getTime() - new Date(a.sortAt || a.timestamp).getTime())
      const visibleItems = nextItems.slice(0, 30)
      const readResult = visibleItems.length > 0
        ? await supabase.from('notification_reads').select('notification_id, read_at').eq('user_id', user.id).in('notification_id', visibleItems.map((item) => item.id))
        : { data: [], error: null }
      if (loadSequence !== loadSequenceRef.current) return
      if (readResult.error) throw readResult.error

      const remoteReceipts = Object.fromEntries((readResult.data || []).map((row) => [row.notification_id, row.read_at]))
      setReadReceipts((current) => Object.fromEntries(visibleItems.flatMap((item) => {
        const remoteTime = remoteReceipts[item.id]
        const localTime = current[item.id]
        const latestTime = remoteTime && localTime
          ? (new Date(remoteTime) > new Date(localTime) ? remoteTime : localTime)
          : remoteTime || localTime
        return latestTime ? [[item.id, latestTime]] : []
      })))
      setItems(visibleItems)

      if (partialError) {
        setError('Some notifications could not be loaded. Please try again.')
      }
    } catch {
      if (loadSequence === loadSequenceRef.current) setError('Notifications could not be loaded. Please try again.')
    } finally {
      if (loadSequence === loadSequenceRef.current) setLoading(false)
    }
  }, [role, user.id])

  const markNotificationsRead = useCallback(async (notificationIds) => {
    const uniqueIds = [...new Set(notificationIds)].filter(Boolean)
    if (uniqueIds.length === 0) return

    const now = new Date().toISOString()
    const previousReceipts = Object.fromEntries(uniqueIds.map((notificationId) => [notificationId, readReceipts[notificationId] || null]))
    const receiptTimes = Object.fromEntries(uniqueIds.map((notificationId) => {
      const item = items.find((entry) => entry.id === notificationId)
      return [notificationId, item?.type === 'application' ? item.timestamp : now]
    }))
    setReadReceipts((current) => Object.fromEntries([
      ...Object.entries(current),
      ...Object.entries(receiptTimes),
    ]))
    const { error: readError } = await supabase
      .from('notification_reads')
      .upsert(
        uniqueIds.map((notificationId) => ({
          user_id: user.id,
          notification_id: notificationId,
          read_at: receiptTimes[notificationId],
        })),
        { onConflict: 'user_id,notification_id' },
      )

    if (readError) {
      setError('Notifications could not be marked as read. Please try again.')
      setReadReceipts((current) => {
        const next = { ...current }
        for (const notificationId of uniqueIds) {
          if (next[notificationId] !== receiptTimes[notificationId]) continue
          if (previousReceipts[notificationId]) next[notificationId] = previousReceipts[notificationId]
          else delete next[notificationId]
        }
        return next
      })
      return false
    }
    return true
  }, [items, readReceipts, user.id])

  useEffect(() => {
    const initialLoad = window.setTimeout(loadNotifications, 0)
    return () => {
      window.clearTimeout(initialLoad)
    }
  }, [loadNotifications])

  useEffect(() => {
    let midnightTimer
    const scheduleNextDay = () => {
      const philippineOffsetMs = 8 * 60 * 60 * 1000
      const dayMs = 24 * 60 * 60 * 1000
      const waitMs = dayMs - ((Date.now() + philippineOffsetMs) % dayMs) + 1000
      midnightTimer = window.setTimeout(() => {
        void loadNotifications()
        scheduleNextDay()
      }, waitMs)
    }
    scheduleNextDay()
    return () => window.clearTimeout(midnightTimer)
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
      .filter((item) => isUnreadNotification(item, readReceipts))
      .map((item) => item.id)
    if (unreadIds.length > 0) {
      void markNotificationsRead(unreadIds).then((saved) => { if (saved) void loadNotifications() })
    } else {
      void loadNotifications()
    }
  }

  async function markNotificationRead(item) {
    if (!isUnreadNotification(item, readReceipts)) return
    await markNotificationsRead([item.id])
  }

  function openNotification(item) {
    void markNotificationRead(item)

    if (item.type === 'semester' && role === 'parent') {
      setOpen(false)
      navigate('/')
      return
    }

    let dashboard
    let tab

    if (role === 'parent') {
      dashboard = 'parent'
      tab = item.type === 'announcement' ? 'announcements' : item.type === 'event' ? 'calendar' : item.type === 'attendance' ? 'attendance' : 'overview'
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

  const unreadCount = items.filter((item) => isUnreadNotification(item, readReceipts)).length
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
              const unread = isUnreadNotification(item, readReceipts)

              return <button type="button" key={item.id} className={`notification-item${unread ? ' unread' : ''}`} aria-label={`${type.label}: ${item.title}${unread ? ', unread' : ''}`} onClick={() => openNotification(item)}>
                <span className="notification-item-copy">
                  <span className="notification-meta">
                    <span className={`notification-category ${item.type}`}><i className={`app-icon ${type.icon}`} aria-hidden="true" /><span>{type.label}</span></span>
                    <time dateTime={item.eventDate || item.timestamp}>{item.eventDate ? 'Today' : new Date(item.timestamp).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Manila' })}</time>
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
