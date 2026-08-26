import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

function AppHeader({ loggedOutAction = 'home' }) {
  const navigate = useNavigate()
  const menuRef = useRef(null)
  const [user, setUser] = useState(null)
  const [fullName, setFullName] = useState('')
  const [loading, setLoading] = useState(true)
  const [menuOpen, setMenuOpen] = useState(false)

  const loadAccount = useCallback(async () => {
    const { data: { user: currentUser } } = await supabase.auth.getUser()
    setUser(currentUser || null)

    if (currentUser) {
      const { data } = await supabase.from('profiles').select('full_name').eq('id', currentUser.id).single()
      setFullName(data?.full_name || 'User')
    } else {
      setFullName('')
      setMenuOpen(false)
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
    <nav className="landing-nav">
      <div className="landing-nav-inner">
        <div className="landing-brand" onClick={() => navigate('/')} role="button" tabIndex={0} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') navigate('/') }}>
          <img src="/bcdc-logo.png" alt="Binuangan Child Development Center logo" className="landing-logo" />
          <span>Binuangan Child Development Center</span>
        </div>

        <div className="landing-nav-actions">
          {!loading && (user ? (
            <div className="account-menu" ref={menuRef}>
              <button type="button" className="account-menu-toggle" aria-label="Open account menu" aria-expanded={menuOpen} onClick={() => setMenuOpen((open) => !open)}>
                <i className="gg-menu" aria-hidden="true" />
              </button>
              {menuOpen && (
                <div className="account-menu-dropdown">
                  <div className="account-menu-name"><span>Signed in as</span><strong>{fullName}</strong></div>
                  <button type="button" onClick={() => { setMenuOpen(false); navigate('/') }}><i className="gg-home" aria-hidden="true" /><span>Home</span></button>
                  <button type="button" className="account-menu-logout" onClick={handleLogout}><i className="gg-log-out" aria-hidden="true" /><span>Log out</span></button>
                </div>
              )}
            </div>
          ) : (
            <button type="button" className="nav-login" onClick={() => navigate(actionIsLogin ? '/login' : '/')}>
              <i className={actionIsLogin ? 'gg-log-in' : 'gg-home'} aria-hidden="true" />
              <span>{actionIsLogin ? 'Login' : 'Home'}</span>
            </button>
          ))}
        </div>
      </div>
    </nav>
  )
}

export default AppHeader
