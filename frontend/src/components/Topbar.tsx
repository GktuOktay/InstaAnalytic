import { useLocation } from 'react-router-dom'
import { Link } from 'react-router-dom'
import { Loader2, Moon, Sun } from 'lucide-react'
import { useExtension } from '../lib/extensionBridge'
import { useLang } from '../contexts/LangContext'
import { useTheme } from '../contexts/ThemeContext'
import NotificationBell, { iconBtn } from './NotificationBell'
import ProfileMenu from './ProfileMenu'

/** Sayfa başlığı solda; bildirim, tema, dil ve hesap menüsü sağda. */
export default function Topbar() {
  const { T, lang, setLang } = useLang()
  const { theme, toggleTheme } = useTheme()
  const { pathname } = useLocation()
  const ext = useExtension()
  const running = ext.job?.state === 'running' ? ext.job : null

  const titles: Record<string, string> = {
    '/': T.nav.dashboard, '/followers': T.nav.followers, '/posts': T.nav.posts, '/report': T.nav.report, '/fans': T.nav.fans,
    '/users': T.nav.users, '/monitor': T.nav.monitor, '/actions': T.nav.actions, '/settings': T.nav.settings, '/guide': T.nav.guide,
    '/start': T.wizard.title,
  }
  const title = titles[pathname] ?? titles['/' + pathname.split('/')[1]] ?? ''

  return (
    <header style={{ height: 56, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
      padding: '0 32px', background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
        <span style={{ fontSize: 13, color: 'var(--text-2)', fontWeight: 600 }}>{title}</span>
        {running && (
          <Link to={running.kind === 'actions' ? '/users' : '/posts'} role="status" title={running.message}
            style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, maxWidth: 360, padding: '4px 10px', borderRadius: 14, fontSize: 11,
              background: 'rgba(155,143,224,0.15)', border: '1px solid rgba(155,143,224,0.35)', color: '#b9aef0', textDecoration: 'none' }}>
            <Loader2 size={12} className="animate-spin" style={{ flexShrink: 0 }} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{running.message.split('\n')[0]}</span>
          </Link>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <NotificationBell />
        <button onClick={toggleTheme} title={theme === 'dark' ? T.common.lightMode : T.common.darkMode}
          aria-label={theme === 'dark' ? T.common.lightMode : T.common.darkMode} style={iconBtn}>
          {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
        </button>
        <button onClick={() => setLang(lang === 'tr' ? 'en' : 'tr')} aria-label={lang === 'tr' ? 'English' : 'Türkçe'}
          style={{ ...iconBtn, width: 'auto', padding: '0 10px', fontSize: 11, fontWeight: 700, letterSpacing: '0.06em' }}>
          {lang === 'tr' ? 'EN' : 'TR'}
        </button>
        <ProfileMenu />
      </div>
    </header>
  )
}
