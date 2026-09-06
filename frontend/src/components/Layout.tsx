import { Outlet, NavLink } from 'react-router-dom'
import { Users, BarChart2, Image, Network, History, MonitorDot, FileBarChart2 } from 'lucide-react'
import { useLang } from '../contexts/LangContext'

export default function Layout() {
  const { T, lang, setLang } = useLang()

  const nav = [
    { to: '/',          label: T.nav.dashboard,  icon: BarChart2     },
    { to: '/session',   label: T.nav.session,    icon: Users         },
    { to: '/followers', label: T.nav.followers,  icon: Users         },
    { to: '/posts',     label: T.nav.posts,      icon: Image         },
    { to: '/report',    label: T.nav.report,     icon: FileBarChart2 },
    { to: '/users',     label: T.nav.users,      icon: Network       },
    { to: '/monitor',   label: T.nav.monitor,    icon: MonitorDot    },
    { to: '/actions',   label: T.nav.actions,    icon: History       },
  ]

  return (
    <div className="flex h-screen">
      <aside className="w-56 bg-gray-900 border-r border-gray-800 flex flex-col">
        <div className="p-4 border-b border-gray-800 flex items-center justify-between">
          <span className="text-lg font-bold text-purple-400">Instapp</span>
          {/* Dil / Language toggle */}
          <button
            onClick={() => setLang(lang === 'tr' ? 'en' : 'tr')}
            title={lang === 'tr' ? 'Switch to English' : 'Türkçeye geç'}
            style={{
              fontSize: 11, fontWeight: 700, letterSpacing: '0.04em',
              padding: '3px 7px', borderRadius: 6,
              background: '#1e2230', border: '1px solid #2d3350',
              color: '#9b8fe0', cursor: 'pointer',
            }}
          >
            {lang === 'tr' ? 'EN' : 'TR'}
          </button>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {nav.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                  isActive
                    ? 'bg-purple-600 text-white'
                    : 'text-gray-400 hover:bg-gray-800 hover:text-gray-100'
                }`
              }
            >
              <Icon size={16} />
              {label}
            </NavLink>
          ))}
        </nav>
        <div style={{ padding: '8px 16px', borderTop: '1px solid #1e2230', fontSize: 10, color: '#3a3f55' }}>
          Instapp © 2025 · MIT
        </div>
      </aside>
      <main className="flex-1 overflow-auto p-6">
        <Outlet />
      </main>
    </div>
  )
}
