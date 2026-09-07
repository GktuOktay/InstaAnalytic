import { Outlet, NavLink, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, Users, Image, Network,
  History, MonitorDot, FileBarChart2, Moon, Sun,
} from 'lucide-react'
import { useLang } from '../contexts/LangContext'
import { useTheme } from '../contexts/ThemeContext'

export default function Layout() {
  const { T, lang, setLang } = useLang()
  const { theme, toggleTheme } = useTheme()
  const location = useLocation()

  const nav = [
    { to: '/',          label: T.nav.dashboard,  icon: LayoutDashboard },
    { to: '/followers', label: T.nav.followers,  icon: Users           },
    { to: '/posts',     label: T.nav.posts,      icon: Image           },
    { to: '/report',    label: T.nav.report,     icon: FileBarChart2   },
    { to: '/users',     label: T.nav.users,      icon: Network         },
    { to: '/monitor',   label: T.nav.monitor,    icon: MonitorDot      },
    { to: '/actions',   label: T.nav.actions,    icon: History         },
  ]

  return (
    <div style={{ display: 'flex', height: '100vh', background: 'var(--bg)' }}>

      {/* ── Sidebar ─────────────────────────────────────────────── */}
      <aside style={{
        width: 220,
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--surface)',
        borderRight: '1px solid var(--border)',
      }}>

        {/* Brand */}
        <div style={{ padding: '20px 16px 16px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{
                fontSize: 15,
                fontWeight: 700,
                letterSpacing: '-0.02em',
                background: 'linear-gradient(135deg, #6366F1, #A78BFA)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}>
                InstaAnalytic
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>
                {lang === 'tr' ? 'Analitik Platformu' : 'Analytics Platform'}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 6 }}>
              {/* Theme toggle */}
              <button
                onClick={toggleTheme}
                title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
                style={{
                  width: 30, height: 30,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  borderRadius: 8,
                  background: 'var(--surface-2)',
                  border: '1px solid var(--border)',
                  color: 'var(--text-2)',
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
              >
                {theme === 'dark'
                  ? <Sun size={13} />
                  : <Moon size={13} />}
              </button>

              {/* Lang toggle */}
              <button
                onClick={() => setLang(lang === 'tr' ? 'en' : 'tr')}
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: '0.06em',
                  padding: '4px 8px',
                  borderRadius: 8,
                  background: 'var(--surface-2)',
                  border: '1px solid var(--border)',
                  color: 'var(--text-2)',
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
              >
                {lang === 'tr' ? 'EN' : 'TR'}
              </button>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: '10px 8px', overflowY: 'auto' }}>
          {nav.map(({ to, label, icon: Icon }) => {
            const isActive = to === '/'
              ? location.pathname === '/'
              : location.pathname.startsWith(to)

            return (
              <NavLink
                key={to}
                to={to}
                end={to === '/'}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '9px 12px',
                  borderRadius: 10,
                  marginBottom: 2,
                  fontSize: 13,
                  fontWeight: isActive ? 600 : 400,
                  color: isActive ? '#fff' : 'var(--text-2)',
                  textDecoration: 'none',
                  transition: 'all 0.12s',
                  background: isActive
                    ? 'linear-gradient(135deg, rgba(99,102,241,0.25), rgba(139,92,246,0.15))'
                    : 'transparent',
                  border: isActive
                    ? '1px solid rgba(99,102,241,0.3)'
                    : '1px solid transparent',
                  position: 'relative',
                }}
                onMouseEnter={e => {
                  if (!isActive) {
                    (e.currentTarget as HTMLElement).style.background = 'var(--surface-2)'
                    ;(e.currentTarget as HTMLElement).style.color = 'var(--text)'
                  }
                }}
                onMouseLeave={e => {
                  if (!isActive) {
                    (e.currentTarget as HTMLElement).style.background = 'transparent'
                    ;(e.currentTarget as HTMLElement).style.color = 'var(--text-2)'
                  }
                }}
              >
                <Icon size={15} style={{ opacity: isActive ? 1 : 0.6, flexShrink: 0 }} />
                {label}
              </NavLink>
            )
          })}
        </nav>

        {/* Footer */}
        <div style={{
          padding: '12px 16px',
          borderTop: '1px solid var(--border)',
          fontSize: 10,
          color: 'var(--text-3)',
        }}>
          InstaAnalytic · MIT © 2026
        </div>
      </aside>

      {/* ── Main content ────────────────────────────────────────── */}
      <main style={{
        flex: 1,
        minWidth: 0,
        overflow: 'auto',
        display: 'flex',
        flexDirection: 'column',
      }}>
        <div style={{ flex: 1, padding: '28px 32px' }}>
          <Outlet />
        </div>
      </main>
    </div>
  )
}
