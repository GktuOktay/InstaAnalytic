import { Outlet, NavLink } from 'react-router-dom'
import { BarChart2, Image, Network, History, MonitorDot, FileBarChart2, Users } from 'lucide-react'
import { useLang } from '../contexts/LangContext'

export default function Layout() {
  const { T, lang, setLang } = useLang()

  const nav = [
    { to: '/',          label: T.nav.dashboard,  icon: BarChart2     },
    { to: '/followers', label: T.nav.followers,  icon: Users         },
    { to: '/posts',     label: T.nav.posts,      icon: Image         },
    { to: '/report',    label: T.nav.report,     icon: FileBarChart2 },
    { to: '/users',     label: T.nav.users,      icon: Network       },
    { to: '/monitor',   label: T.nav.monitor,    icon: MonitorDot    },
    { to: '/actions',   label: T.nav.actions,    icon: History       },
  ]

  return (
    <div className="flex h-screen bg-gray-950">
      <aside className="w-56 bg-gray-900 border-r border-gray-800 flex flex-col shrink-0">
        {/* Brand */}
        <div className="px-4 py-5 border-b border-gray-800">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-base font-bold text-white tracking-tight">InstaAnalytic</span>
              <div className="flex items-center gap-1 mt-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-purple-500" />
                <span className="text-xs text-gray-500">Analytics</span>
              </div>
            </div>
            <button
              onClick={() => setLang(lang === 'tr' ? 'en' : 'tr')}
              title={lang === 'tr' ? 'Switch to English' : 'Türkçeye geç'}
              className="text-xs font-bold px-2 py-1 rounded-md bg-gray-800 border border-gray-700 text-purple-400 hover:border-purple-600 transition-colors"
            >
              {lang === 'tr' ? 'EN' : 'TR'}
            </button>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
          {nav.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                  isActive
                    ? 'bg-purple-600/20 text-purple-300 border border-purple-700/40'
                    : 'text-gray-400 hover:bg-gray-800 hover:text-gray-100 border border-transparent'
                }`
              }
            >
              <Icon size={16} />
              {label}
            </NavLink>
          ))}
        </nav>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-gray-800">
          <p className="text-xs text-gray-600">InstaAnalytic · MIT</p>
          <p className="text-xs text-gray-700">© 2026</p>
        </div>
      </aside>

      <main className="flex-1 overflow-auto p-6 bg-gray-950">
        <Outlet />
      </main>
    </div>
  )
}
