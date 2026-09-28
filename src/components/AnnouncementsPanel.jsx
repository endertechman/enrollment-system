import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import AuthToast from './AuthToast'
import ConfirmDialog from './ConfirmDialog'
import TablePagination from './TablePagination'
import useRealtimeRefresh from '../hooks/useRealtimeRefresh'
import { PHILIPPINE_TIME_ZONE } from '../lib/philippineDate'

const TITLE_LIMIT = 100
const BODY_LIMIT = 500
const PAGE_SIZE = 5

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
  const [viewer, setViewer] = useState(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [search, setSearch] = useState('')
  const [selectedAnnouncement, setSelectedAnnouncement] = useState(null)

  const loadAnnouncements = useCallback(async () => {
    const { data, error } = await supabase
      .from('announcements')
      .select('id, title, body, author_id, published_at')
      .order('published_at', { ascending: false })

    if (error) {
      setMessage('Announcements are unavailable until the Supabase migration is applied.')
    } else {
      setAnnouncements(data || [])
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data: profile } = await supabase.from('profiles').select('full_name, role').eq('id', user.id).maybeSingle()
        setViewer({ id: user.id, fullName: profile?.full_name || '', role: profile?.role || '' })
      }
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    const loadTimer = window.setTimeout(loadAnnouncements, 0)
    return () => window.clearTimeout(loadTimer)
  }, [loadAnnouncements])

  useEffect(() => {
    if (!composerOpen) return undefined
    function closeOnEscape(event) {
      if (event.key === 'Escape' && !saving) setComposerOpen(false)
    }
    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [composerOpen, saving])

  useEffect(() => {
    if (!selectedAnnouncement) return undefined
    function closeOnEscape(event) {
      if (event.key === 'Escape') setSelectedAnnouncement(null)
    }
    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [selectedAnnouncement])

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
      .select('id, title, body, author_id, published_at')
      .single()

    if (error) {
      setMessage(error.message)
    } else {
      setAnnouncements((current) => [data, ...current])
      setTitle('')
      setBody('')
      setComposerOpen(false)
      setCurrentPage(1)
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
    return new Date(value).toLocaleDateString('en-PH', { dateStyle: 'medium', timeZone: PHILIPPINE_TIME_ZONE })
  }

  function formatTime(value) {
    return new Date(value).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: PHILIPPINE_TIME_ZONE })
  }

  function authorName(announcement) {
    return announcement.author_id === viewer?.id && viewer.fullName ? viewer.fullName : 'BCDC Teacher'
  }

  const searchTerm = search.trim().toLocaleLowerCase()
  const filteredAnnouncements = searchTerm
    ? announcements.filter((announcement) => [authorName(announcement), announcement.title, announcement.body]
      .some((value) => String(value || '').toLocaleLowerCase().includes(searchTerm)))
    : announcements
  const totalPages = Math.max(1, Math.ceil(filteredAnnouncements.length / PAGE_SIZE))
  const safePage = Math.min(currentPage, totalPages)
  const visibleAnnouncements = filteredAnnouncements.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  return (
    <section className="announcements-panel">
      <AuthToast message={notice} onDismiss={() => setNotice('')} duration={5000} variant="success" />
      {pendingDelete && <ConfirmDialog title="Delete announcement?" message={`“${pendingDelete.title}” will be permanently removed.`} confirmLabel="Delete" busy={deletingId === pendingDelete.id} onConfirm={deleteAnnouncement} onCancel={() => setPendingDelete(null)} />}
      {canManage && composerOpen && <div className="semester-dialog-overlay announcement-compose-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setComposerOpen(false) }}>
        <section className="semester-dialog announcement-compose-dialog" role="dialog" aria-modal="true" aria-labelledby="announcement-compose-title">
          <header className="semester-dialog-header">
            <div><h2 id="announcement-compose-title">New announcement</h2><p>Share a clear update or important notice with BCDC families and staff.</p></div>
            <button type="button" className="popup-close-button" onClick={() => setComposerOpen(false)} disabled={saving} aria-label="Close announcement form"><i className="app-icon app-icon-close" aria-hidden="true" /></button>
          </header>
          <form className="announcement-form announcement-dialog-form" onSubmit={publishAnnouncement}>
            <label>
              Title
              <input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={TITLE_LIMIT} placeholder="Announcement title" required autoFocus />
              <small>{title.length}/{TITLE_LIMIT}</small>
            </label>
            <label>
              Contents
              <textarea value={body} onChange={(event) => setBody(event.target.value)} maxLength={BODY_LIMIT} rows="6" placeholder="Write the announcement clearly and briefly." required />
              <small>{body.length}/{BODY_LIMIT}</small>
            </label>
            <div className="semester-dialog-actions announcement-dialog-actions"><button type="button" className="button-secondary" onClick={() => setComposerOpen(false)} disabled={saving}>Cancel</button><button type="submit" className="approve-button" disabled={saving || !title.trim() || !body.trim()}>Post Announcement</button></div>
          </form>
        </section>
      </div>}
      {selectedAnnouncement && <div className="semester-dialog-overlay announcement-detail-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedAnnouncement(null) }}>
        <section className="semester-dialog announcement-detail-dialog" role="dialog" aria-modal="true" aria-labelledby="announcement-detail-title">
          <header className="semester-dialog-header">
            <div><h2 id="announcement-detail-title">Announcement Details</h2><p>View the complete announcement information.</p></div>
            <button type="button" className="popup-close-button" onClick={() => setSelectedAnnouncement(null)} aria-label="Close announcement details"><i className="app-icon app-icon-close" aria-hidden="true" /></button>
          </header>
          <div className="announcement-detail-content">
            <section className="announcement-detail-author">
              <strong>{authorName(selectedAnnouncement)}</strong>
              <div><span>BCDC Teacher</span><time dateTime={selectedAnnouncement.published_at}>{formatDate(selectedAnnouncement.published_at)}</time><time dateTime={selectedAnnouncement.published_at}>{formatTime(selectedAnnouncement.published_at)}</time></div>
            </section>
            <section className="announcement-detail-message">
              <h3>{selectedAnnouncement.title}</h3>
              <p>{selectedAnnouncement.body}</p>
            </section>
          </div>
        </section>
      </div>}
      <header className="announcements-header">
        <h2>Announcements</h2>
      </header>
      <div className="growth-directory-heading announcement-directory-heading">
        <span>BCDC Announcements</span>
        <strong>{filteredAnnouncements.length} {filteredAnnouncements.length === 1 ? 'announcement' : 'announcements'}</strong>
      </div>
      <p className="growth-directory-instruction">View the latest updates and important notices from BCDC.</p>
      <div className="announcement-composer-bar">
        <div className={`announcement-search-row${canManage ? '' : ' readonly'}`}>
          <label className="announcement-composer-search"><span className="visually-hidden">Search announcements</span><input type="search" value={search} onChange={(event) => { setSearch(event.target.value); setCurrentPage(1) }} placeholder="Search by author or announcement words" /></label>
          {canManage && <button type="button" className="announcement-compose-toggle" aria-expanded={composerOpen} onClick={() => setComposerOpen(true)}>New Announcement</button>}
        </div>
      </div>

      {message && <p className="announcement-message">{message}</p>}

      {loading ? (
        <p className="announcement-empty app-loading" role="status">Loading announcements...</p>
      ) : filteredAnnouncements.length === 0 ? (
        <p className="announcement-empty">{searchTerm ? 'No announcements match your search.' : 'No announcements have been posted yet.'}</p>
      ) : (
        <div className="announcement-list">
          {visibleAnnouncements.map((announcement) => (
            <article className="announcement-card" key={announcement.id}>
              <div className="announcement-card-open" role="button" tabIndex="0" onClick={() => setSelectedAnnouncement(announcement)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelectedAnnouncement(announcement) } }} aria-label={`Open announcement: ${announcement.title}`}>
                <div className="announcement-card-heading">
                  <div className="announcement-author"><strong>{authorName(announcement)}</strong><span>BCDC Teacher</span></div>
                  <div className="announcement-date"><time dateTime={announcement.published_at}>{formatDate(announcement.published_at)}</time><time dateTime={announcement.published_at}>{formatTime(announcement.published_at)}</time></div>
                </div>
                <div className="announcement-card-content"><h3>{announcement.title}</h3><p>{announcement.body}</p></div>
              </div>
              {canManage && <button type="button" className="icon-delete-button announcement-card-delete" disabled={deletingId === announcement.id} onClick={() => setPendingDelete(announcement)} aria-label={`Delete announcement: ${announcement.title}`} title="Delete announcement"><i className="app-icon app-icon-trash" aria-hidden="true" /></button>}
            </article>
          ))}
        </div>
      )}
      <TablePagination currentPage={safePage} totalItems={filteredAnnouncements.length} onPageChange={setCurrentPage} pageSize={PAGE_SIZE} ariaLabel="Announcement pages" />
    </section>
  )
}

export default AnnouncementsPanel
