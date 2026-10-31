import { Component, ReactNode } from 'react'
import { RefreshCw } from 'lucide-react'

interface Props { children: ReactNode; lang?: 'tr' | 'en' }
interface State { failed: boolean }

/** Yakalanmamış render hatasında boş ekran yerine toparlayıcı bir arayüz gösterir. */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { failed: false }

  static getDerivedStateFromError(): State { return { failed: true } }

  componentDidCatch(error: unknown) { console.error('UI error:', error) }

  render() {
    if (!this.state.failed) return this.props.children
    const en = this.props.lang === 'en'
    return (
      <div role="alert" className="max-w-md mx-auto text-center py-16">
        <p className="text-lg font-semibold mb-1">{en ? 'Something went wrong' : 'Bir şeyler ters gitti'}</p>
        <p className="text-sm text-gray-400 mb-4">
          {en ? 'Your data is safe. Reload the page to continue.' : 'Verilerin güvende. Devam etmek için sayfayı yenile.'}
        </p>
        <button onClick={() => { this.setState({ failed: false }); location.reload() }}
          className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-500 rounded-xl text-sm font-semibold">
          <RefreshCw size={14} /> {en ? 'Reload' : 'Yenile'}
        </button>
      </div>
    )
  }
}
