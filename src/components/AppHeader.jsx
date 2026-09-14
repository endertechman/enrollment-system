import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import RoleManagerDialog from './RoleManagerDialog'
import NotificationsMenu from './NotificationsMenu'
import AccountSettingsDialog from './AccountSettingsDialog'
import useAutoRefresh from '../hooks/useAutoRefresh'

function AppHeader({ loggedOutAction = 'home' }) {
  const navigate = useNavigate()
  const menuRef = useRef(null)
  const [user, setUser] = useState(null)
  const [fullName, setFullName] = useState('')
  const [role, setRole] = useState(null)
  const [loading, setLoading] = useState(true)
  const [menuOpen, setMenuOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [roleManagerOpen, setRoleManagerOpen] = useState(false)

  const loadAccount = useCallback(async () => {
    const { data: { user: currentUser } } = await supabase.auth.getUser()
    setUser(currentUser || null)

    if (currentUser) {
      const { data } = await supabase.from('profiles').select('full_name, role').eq('id', currentUser.id).single()
      setFullName(data?.full_name || 'User')
      setRole(data?.role || null)
    } else {
      setFullName('')
      setRole(null)
      setMenuOpen(false)
      setSettingsOpen(false)
      setRoleManagerOpen(false)
    }

    setLoading(false)
  }, [])

  useEffect(() => {
    const initialLoad = window.setTimeout(loadAccount, 0)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(loadAccount)
    return () => {
      window.clearTimeout(initialLoad)
      subscription.unsubscribe()
    }
  }, [loadAccount])

  useAutoRefresh(loadAccount)

  useEffect(() => {
    if (!menuOpen) return undefined

    function closeMenu(event) {
      if (!menuRef.current?.contains(event.target)) setMenuOpen(false)
    }

    document.addEventListener('pointerdown', closeMenu)
    return () => document.removeEventListener('pointerdown', closeMenu)
  }, [menuOpen])

  async function handleLogout() {
    await supabase.auth.signOut()
    setMenuOpen(false)
    navigate('/')
  }

  const actionIsLogin = loggedOutAction === 'login'

  return (
    <>
    <nav className="landing-nav">
      <div className="landing-nav-inner">
        <div className="landing-brand" onClick={() => navigate('/')} role="button" tabIndex={0} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') navigate('/') }}>
          <img src="/bcdc-logo.png" alt="Binuangan Child Development Center logo" className="landing-logo" />
          <span>Binuangan Child Development Center</span>
        </div>

        <div className="landing-nav-actions">
          {!loading && (user ? (
            <div className="signed-in-header-actions">
            {['parent', 'teacher', 'teacher_aide'].includes(role) && <NotificationsMenu user={user} role={role} />}
            <div className="account-menu" ref={menuRef}>
              <button type="button" className="account-menu-toggle" aria-label="Open account menu" aria-expanded={menuOpen} onClick={() => setMenuOpen((open) => !open)}>
                <span className="header-icon-slot"><i className="app-icon app-icon-menu" aria-hidden="true" /></span>
              </button>
              {menuOpen && (
                <div className="account-menu-dropdown">
                  <div className="account-menu-name"><span>Signed in as</span><strong>{fullName}</strong></div>
                  <button type="button" onClick={() => { setMenuOpen(false); navigate('/') }}><span className="header-icon-slot"><i className="app-icon app-icon-home" aria-hidden="true" /></span><span>Home</span></button>
                  <button type="button" onClick={() => { setMenuOpen(false); setSettingsOpen(true) }}><span className="header-icon-slot"><i className="app-icon app-icon-options" aria-hidden="true" /></span><span>Settings</span></button>
                  {role === 'teacher' && <button type="button" onClick={() => { setMenuOpen(false); setRoleManagerOpen(true) }}><span className="header-icon-slot"><i className="app-icon app-icon-user-add" aria-hidden="true" /></span><span>Manage Roles</span></button>}
                  <button type="button" className="account-menu-logout" onClick={handleLogout}><span className="header-icon-slot"><i className="app-icon app-icon-log-out" aria-hidden="true" /></span><span>Log out</span></button>
                </div>
              )}
            </div>
            </div>
          ) : (
            <button type="button" className="nav-login" aria-label={actionIsLogin ? 'Login' : 'Home'} onClick={() => navigate(actionIsLogin ? '/login' : '/')}>
              <span className="header-icon-slot"><i className={`app-icon ${actionIsLogin ? 'app-icon-log-in' : 'app-icon-home'}`} aria-hidden="true" /></span>
              <span>{actionIsLogin ? 'Login' : 'Home'}</span>
            </button>
          ))}
        </div>
      </div>
    </nav>
    {user && settingsOpen && <AccountSettingsDialog user={user} fullName={fullName} role={role} onClose={() => setSettingsOpen(false)} />}
    {role === 'teacher' && roleManagerOpen && <RoleManagerDialog onClose={() => setRoleManagerOpen(false)} />}
    </>
  )
}

export default AppHeader
