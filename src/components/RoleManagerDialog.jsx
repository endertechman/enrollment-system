import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import AuthToast from './AuthToast'
import ConfirmDialog from './ConfirmDialog'

const PAGE_SIZE = 10

function formatRole(role) {
  if (role === 'teacher_aide') return 'Teacher Aide'
  return role ? role[0].toUpperCase() + role.slice(1) : 'Unknown'
}

function paginationItems(currentPage, totalPages) {
  if (totalPages <= 3) return Array.from({ length: totalPages }, (_, index) => index + 1)
  if (currentPage <= 2) return [1, 2, 3, 'end-ellipsis', totalPages]
  if (currentPage >= totalPages - 1) return [1, 'start-ellipsis', totalPages - 2, totalPages - 1, totalPages]
  return [1, 'start-ellipsis', currentPage, 'end-ellipsis', totalPages]
}

function RoleManagerDialog({ onClose }) {
  const [currentUserId, setCurrentUserId] = useState(null)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [accounts, setAccounts] = useState([])
  const [totalCount, setTotalCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [notice, setNotice] = useState('')
  const [selectedAccount, setSelectedAccount] = useState(null)
  const [updatingRole, setUpdatingRole] = useState('')
  const [pendingRole, setPendingRole] = useState('')
  const [sortConfig, setSortConfig] = useState({ key: 'full_name', direction: 'asc' })

  useEffect(() => {
    const debounceTimer = window.setTimeout(() => {
      setDebouncedSearch(search.trim())
      setCurrentPage(1)
    }, 300)
    return () => window.clearTimeout(debounceTimer)
  }, [search])

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setCurrentUserId(data.user?.id || null))
  }, [])

  const loadAccounts = useCallback(async () => {
    setLoading(true)
    setMessage('')

    const { data, error } = await supabase.rpc('list_accounts_for_role_management', {
      p_page: currentPage,
      p_page_size: PAGE_SIZE,
      p_search: debouncedSearch,
    })

    if (error) {
      setMessage(error.message)
      setAccounts([])
      setTotalCount(0)
    } else {
      setAccounts(data || [])
      setTotalCount(data?.[0]?.total_count ?? 0)
    }
    setLoading(false)
  }, [currentPage, debouncedSearch])

  useEffect(() => {
    loadAccounts()
  }, [loadAccounts])

  useEffect(() => {
    function closeOnEscape(event) {
      if (event.key !== 'Escape') return
      if (pendingRole) return
      if (selectedAccount) setSelectedAccount(null)
      else onClose()
    }
    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [onClose, pendingRole, selectedAccount])

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))
  const shownStart = totalCount === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1
  const shownEnd = Math.min(currentPage * PAGE_SIZE, totalCount)

  const sortedAccounts = useMemo(() => {
    const valueFor = (account) => {
      if (sortConfig.key === 'email') return account.email || ''
      if (sortConfig.key === 'account_role') return account.account_role || ''
      return account.full_name || ''
    }

    return [...accounts].sort((first, second) => {
      const comparison = valueFor(first).localeCompare(valueFor(second), undefined, { numeric: true, sensitivity: 'base' })
      return sortConfig.direction === 'asc' ? comparison : -comparison
    })
  }, [accounts, sortConfig])

  function changeSort(key) {
    setSortConfig((current) => ({
      key,
      direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc',
    }))
  }

  function sortableHeading(key, label) {
    const active = sortConfig.key === key
    const direction = active ? sortConfig.direction : null
    return <th scope="col" aria-sort={active ? (direction === 'asc' ? 'ascending' : 'descending') : 'none'}><button type="button" className={`growth-sort-button${active ? ' active' : ''}`} onClick={() => changeSort(key)}>{label}<i className={`app-icon ${active && direction === 'desc' ? 'app-icon-sort-za' : 'app-icon-sort-az'} growth-sort-icon`} aria-hidden="true" /></button></th>
  }

  function openAccount(account) {
    setMessage('')
    setSelectedAccount({ ...account, is_self: account.user_id === currentUserId })
  }

  async function changeRole() {
    const nextRole = pendingRole
    if (!selectedAccount || !nextRole || updatingRole) return
    setUpdatingRole(nextRole)
    setMessage('')
    setNotice('')
    const { data, error } = await supabase
      .rpc('set_account_role', { p_user_id: selectedAccount.user_id, p_role: nextRole })
      .single()

    if (error) {
      setMessage(error.message)
    } else {
      setSelectedAccount((current) => ({ ...current, account_role: data.account_role }))
      setNotice(`${data.full_name}'s role was changed to ${formatRole(data.account_role)}.`)
      loadAccounts()
    }
    setUpdatingRole('')
    setPendingRole('')
  }

  const availableRoles = !selectedAccount || selectedAccount.is_self
    ? []
    : selectedAccount.account_role === 'parent'
    ? [['teacher_aide', 'Make Teacher Aide'], ['teacher', 'Make Teacher']]
    : selectedAccount.account_role === 'teacher_aide'
      ? [['parent', 'Return to Parent'], ['teacher', 'Make Teacher']]
      : selectedAccount.account_role === 'teacher'
        ? [['teacher_aide', 'Demote to Teacher Aide'], ['parent', 'Demote to Parent']]
        : []

  return (
    <div className="role-manager-overlay" role="dialog" aria-modal="true" aria-labelledby="role-manager-title" onMouseDown={(event) => { if (event.target === event.currentTarget && !pendingRole) onClose() }}>
      <AuthToast message={notice} onDismiss={() => setNotice('')} duration={5000} variant="success" />
      {pendingRole && selectedAccount && <ConfirmDialog title="Change account role?" message={`${selectedAccount.full_name} will become ${formatRole(pendingRole)}.`} confirmLabel="Change Role" tone="primary" iconClass="app-icon-user-add" busy={Boolean(updatingRole)} onConfirm={changeRole} onCancel={() => setPendingRole('')} />}

      <section className="role-manager-dialog role-manager-dialog-wide">
        <header className="role-manager-header">
          <button type="button" className="role-manager-close popup-close-button" onClick={onClose} aria-label="Close role manager"><i className="app-icon app-icon-close" aria-hidden="true" /></button>
          <span>Teacher tools</span>
          <h2 id="role-manager-title">Manage Account Roles</h2>
          <p>Click any account below to review or change its role.</p>
        </header>

        <div className="role-manager-body">
          {!selectedAccount ? (
            <>
              <div className="role-manager-toolbar">
                <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by name or email" aria-label="Search accounts" />
              </div>

              {message && <p className="role-manager-message">{message}</p>}

              {loading ? (
                <p className="growth-empty app-loading" role="status">Loading accounts...</p>
              ) : accounts.length === 0 ? (
                <p className="growth-empty">No accounts match this search.</p>
              ) : (
                <div className="records-table-shell role-manager-table-shell">
                  <table className="records-table role-manager-table">
                    <caption className="visually-hidden">All accounts and their roles</caption>
                    <thead><tr>{sortableHeading('full_name', 'Name')}{sortableHeading('email', 'Email')}{sortableHeading('account_role', 'Role')}</tr></thead>
                    <tbody>
                      {sortedAccounts.map((account) => (
                        <tr key={account.user_id} className="role-manager-row" tabIndex={0} onClick={() => openAccount(account)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openAccount(account) } }}>
                          <td data-label="Name"><strong className="records-student-name">{account.full_name}</strong>{account.user_id === currentUserId && <span className="role-manager-you-tag">You</span>}</td>
                          <td data-label="Email">{account.email}</td>
                          <td data-label="Role"><span className={`enrollment-status role-manager-role-badge role-${account.account_role}`}>{formatRole(account.account_role)}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <footer className="growth-table-footer role-manager-footer">
                <span>Showing {shownStart}–{shownEnd} of {totalCount}</span>
                <nav className="growth-pagination" aria-label="Account pages">
                  <button type="button" onClick={() => setCurrentPage((page) => Math.max(1, page - 1))} disabled={currentPage === 1} aria-label="Previous page">‹</button>
                  {paginationItems(currentPage, totalPages).map((item) => typeof item === 'number'
                    ? <button type="button" key={item} className={item === currentPage ? 'active' : ''} aria-current={item === currentPage ? 'page' : undefined} onClick={() => setCurrentPage(item)}>{item}</button>
                    : <span key={item} aria-hidden="true">…</span>)}
                  <button type="button" onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))} disabled={currentPage === totalPages} aria-label="Next page">›</button>
                </nav>
              </footer>
            </>
          ) : (
            <article className="role-manager-result">
              <button type="button" className="role-manager-back" onClick={() => { setSelectedAccount(null); setMessage('') }}><i className="app-icon app-icon-chevron-left" aria-hidden="true" /> Back to all accounts</button>

              {message && <p className="role-manager-message">{message}</p>}

              <div className="role-manager-account"><i className="app-icon app-icon-user-list" aria-hidden="true" /><div><span>Account</span><strong>{selectedAccount.full_name}</strong></div></div>
              <div><span>Email</span><strong>{selectedAccount.email}</strong></div>
              <div><span>Current role</span><strong>{formatRole(selectedAccount.account_role)}</strong></div>
              {selectedAccount.is_self ? <p>Your own teacher role cannot be changed here.</p> : <div className="role-manager-actions">{availableRoles.map(([role, label]) => <button type="button" key={role} disabled={Boolean(updatingRole)} onClick={() => setPendingRole(role)}>{label}</button>)}</div>}
            </article>
          )}

          <p className="role-manager-note">You may change another teacher&apos;s role, but you cannot change your own role.</p>
        </div>
      </section>
    </div>
  )
}

export default RoleManagerDialog
