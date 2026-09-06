import { Outlet, NavLink } from 'react-router-dom'
import { Users, BarChart2, Image, Network, History, MonitorDot, FileBarChart2 } from 'lucide-react'

const nav = [
  { to: '/',          label: 'Dashboard',           icon: BarChart2     },
  { to: '/session',   label: 'Session',              icon: Users         },
  { to: '/followers', label: 'Takipçi Analizi',      icon: Users         },
  { to: '/posts',     label: 'Gönderiler',           icon: Image         },
  { to: '/report',    label: 'Etkileşim Raporu',     icon: FileBarChart2 },
  { to: '/users',     label: 'Kullanıcı Havuzu',     icon: Network       },
  { to: '/monitor',   label: 'Kuyruk Monitörü',      icon: MonitorDot    },
  { to: '/actions',   label: 'Aksiyon Geçmişi',      icon: History       },
]

export default function Layout() {
  return (
    <div className="flex h-screen">
      <aside className="w-56 bg-gray-900 border-r border-gray-800 flex flex-col">
        <div className="p-4 border-b border-gray-800">
          <span className="text-lg font-bold text-purple-400">Instapp</span>
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
      </aside>
      <main className="flex-1 overflow-auto p-6">
        <Outlet />
      </main>
    </div>
  )
}
