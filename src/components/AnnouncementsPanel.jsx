import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import LoadingSpinner from './LoadingSpinner'
import AuthToast from './AuthToast'
import ConfirmDialog from './ConfirmDialog'
import useRealtimeRefresh from '../hooks/useRealtimeRefresh'

const TITLE_LIMIT = 100
const BODY_LIMIT = 500

function AnnouncementsPanel({ canManage = false }) {
  const [announcements, setAnnouncements] = useState([])
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState(null)
  const [message, setMessage] = useState('')
  const [notice, setNotice] = useState('')
  const [composerOpen, setComposerOpen] = useState(false)
  const [pendingDelete, setPendingDelete] = useState(null)

  const loadAnnouncements = useCallback(async () => {
    const { data, error } = await supabase
      .from('announcements')
      .select('id, title, body, published_at')
      .order('published_at', { ascending: false })

    if (error) {
      setMessage('Announcements are unavailable until the Supabase migration is applied.')
    } else {
      setAnnouncements(data || [])
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    const loadTimer = window.setTimeout(loadAnnouncements, 0)
    return () => window.clearTimeout(loadTimer)
  }, [loadAnnouncements])

  useRealtimeRefresh(loadAnnouncements, {
    channelName: 'announcements-panel',
    tables: ['announcements'],
  })

  async function publishAnnouncement(event) {
    event.preventDefault()
    const cleanTitle = title.trim()
    const cleanBody = body.trim()
    if (!cleanTitle || !cleanBody) return

    setSaving(true)
    setMessage('')
    setNotice('')
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      setMessage('You must be logged in to publish an announcement.')
      setSaving(false)
      return
    }

    const { data, error } = await supabase
      .from('announcements')
      .insert({ title: cleanTitle, body: cleanBody, author_id: user.id })
      .select('id, title, body, published_at')
      .single()

    if (error) {
      setMessage(error.message)
    } else {
      setAnnouncements((current) => [data, ...current])
      setTitle('')
      setBody('')
      setComposerOpen(false)
      setNotice('Announcement published.')
    }
    setSaving(false)
  }

  async function deleteAnnouncement() {
    const id = pendingDelete?.id
    if (!id) return
    setDeletingId(id)
    setMessage('')
    setNotice('')
    const { error } = await supabase.from('announcements').delete().eq('id', id)

    if (error) {
      setMessage(error.message)
    } else {
      setAnnouncements((current) => current.filter((announcement) => announcement.id !== id))
      setNotice('Announcement deleted.')
    }
    setDeletingId(null)
    setPendingDelete(null)
  }

  function formatDate(value) {
    return new Date(value).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })
  }

  return (
    <section className="announcements-panel">
      <AuthToast message={notice} onDismiss={() => setNotice('')} duration={5000} variant="success" />
      {pendingDelete && <ConfirmDialog title="Delete announcement?" message={`“${pendingDelete.title}” will be permanently removed.`} confirmLabel="Delete" busy={deletingId === pendingDelete.id} onConfirm={deleteAnnouncement} onCancel={() => setPendingDelete(null)} />}
      <header className="announcements-header">
        <div>
          <h2>Announcements</h2>
        </div>
        <div className="announcements-header-actions">
          <span>{announcements.length} posted</span>
          {canManage && <button type="button" className="announcement-compose-toggle" aria-expanded={composerOpen} onClick={() => setComposerOpen((open) => !open)}><i className="app-icon app-icon-pen" aria-hidden="true" /><span>{composerOpen ? 'Close' : 'Add announcement'}</span></button>}
        </div>
      </header>

      {canManage && composerOpen && (
        <form className="announcement-form" onSubmit={publishAnnouncement}>
          <label>
            Title
            <input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={TITLE_LIMIT} placeholder="Announcement title" required />
            <small>{title.length}/{TITLE_LIMIT}</small>
          </label>
          <label>
            Message
            <textarea value={body} onChange={(event) => setBody(event.target.value)} maxLength={BODY_LIMIT} rows="5" placeholder="Write the announcement clearly and briefly." required />
            <small>{body.length}/{BODY_LIMIT}</small>
          </label>
          <button type="submit" disabled={saving || !title.trim() || !body.trim()}>{saving ? <LoadingSpinner label="Publishing..." inline /> : <><i className="app-icon app-icon-mail" aria-hidden="true" /><span>Publish Announcement</span></>}</button>
        </form>
      )}

      {message && <p className="announcement-message">{message}</p>}

      {loading ? (
        <div className="announcement-empty"><LoadingSpinner label="Loading announcements..." compact /></div>
      ) : announcements.length === 0 ? (
        <p className="announcement-empty">No announcements have been posted yet.</p>
      ) : (
        <div className="announcement-list">
          {announcements.map((announcement) => (
            <article className="announcement-card" key={announcement.id}>
              <div className="announcement-card-heading">
                <div>
                  <h3>{announcement.title}</h3>
                  <time dateTime={announcement.published_at}>{formatDate(announcement.published_at)}</time>
                </div>
                {canManage && <button type="button" disabled={deletingId === announcement.id} onClick={() => setPendingDelete(announcement)} aria-label={`Delete announcement: ${announcement.title}`} title="Delete announcement"><i className="app-icon app-icon-trash" aria-hidden="true" /></button>}
              </div>
              <p>{announcement.body}</p>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}

export default AnnouncementsPanel
