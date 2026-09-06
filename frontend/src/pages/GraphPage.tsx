import { useCallback, useEffect, useRef, useState } from 'react'
import ForceGraph2D, { ForceGraphMethods } from 'react-force-graph-2d'
import { sessionsApi, Session } from '../api/sessions'
import api from '../api/client'
import { RefreshCw, ZoomIn, ZoomOut, Maximize2, SlidersHorizontal } from 'lucide-react'

interface GraphNode {
  id: number
  username: string
  full_name: string | null
  follower_count: number
  is_verified: boolean
  is_private: boolean
  engagement_score: number
  node_type: 'owner' | 'mutual' | 'follower' | 'following'
  // force-graph eklediği alanlar
  x?: number; y?: number; vx?: number; vy?: number; fx?: number; fy?: number
}

interface GraphLink {
  source: number | GraphNode
  target: number | GraphNode
  type: 'mutual' | 'following' | 'follower'
}

interface GraphData {
  owner_id: number
  nodes: GraphNode[]
  links: GraphLink[]
  stats: { total_nodes: number; total_links: number }
}

const NODE_COLORS: Record<string, string> = {
  owner:     '#a855f7',   // mor  — hesap sahibi
  mutual:    '#22c55e',   // yeşil — karşılıklı
  following: '#f97316',   // turuncu — biz takip ediyoruz
  follower:  '#3b82f6',   // mavi — bizi takip ediyor
}
const LINK_COLORS: Record<string, string> = {
  mutual:    '#22c55e88',
  following: '#f9731688',
  follower:  '#3b82f688',
}

export default function GraphPage() {
  const [sessions,      setSessions]      = useState<Session[]>([])
  const [activeSession, setActiveSession] = useState<string>('')
  const [graphData,     setGraphData]     = useState<GraphData | null>(null)
  const [loading,       setLoading]       = useState(false)
  const [error,         setError]         = useState<string | null>(null)
  const [hovered,       setHovered]       = useState<GraphNode | null>(null)
  const [minEngagement, setMinEngagement] = useState(0)
  const [nodeLimit,     setNodeLimit]     = useState(500)
  const [showFilters,   setShowFilters]   = useState(false)

  const fgRef = useRef<ForceGraphMethods<GraphNode, GraphLink>>()

  useEffect(() => {
    sessionsApi.list().then(s => {
      setSessions(s)
      if (s.length > 0) setActiveSession(s[0].id)
    }).catch(() => setError('Sessionlar yüklenemedi'))
  }, [])

  const load = useCallback(async () => {
    if (!activeSession) return
    setLoading(true)
    setError(null)
    try {
      const r = await api.get(`/sessions/${activeSession}/graph`, {
        params: { min_engagement: minEngagement, limit: nodeLimit }
      })
      setGraphData(r.data)
    } catch (e: any) {
      setError(e?.response?.data?.detail ?? 'Graf yüklenemedi')
    } finally {
      setLoading(false)
    }
  }, [activeSession, minEngagement, nodeLimit])

  useEffect(() => { if (activeSession) load() }, [activeSession])

  const nodeCanvasObject = useCallback((node: GraphNode, ctx: CanvasRenderingContext2D, globalScale: number) => {
    const isOwner = node.node_type === 'owner'
    const base   = isOwner ? 10 : Math.max(4, Math.min(8, 4 + Math.log1p(node.engagement_score) * 1.5))
    const r      = base / globalScale * 2

    // Çember
    ctx.beginPath()
    ctx.arc(node.x!, node.y!, r, 0, 2 * Math.PI)
    ctx.fillStyle = NODE_COLORS[node.node_type] ?? '#888'
    ctx.fill()

    if (isOwner) {
      ctx.strokeStyle = '#fff'
      ctx.lineWidth = 1.5 / globalScale
      ctx.stroke()
    }

    // Etiket — yeterince yakın veya owner ise göster
    const labelThreshold = isOwner ? 0 : 1.5
    if (globalScale >= labelThreshold) {
      const fontSize = Math.max(8, 11 / globalScale)
      ctx.font = `${isOwner ? 'bold ' : ''}${fontSize}px sans-serif`
      ctx.fillStyle = '#e5e7eb'
      ctx.textAlign = 'center'
      ctx.fillText(`@${node.username}`, node.x!, node.y! + r + fontSize * 1.1)
    }
  }, [])

  const nodePaint = useCallback((node: GraphNode) => (NODE_COLORS[node.node_type] ?? '#888'), [])

  return (
    <div className="flex flex-col h-full" style={{ height: 'calc(100vh - 48px)' }}>
      {/* Üst çubuk */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <h1 className="text-2xl font-bold">İlişki Ağı</h1>

        {sessions.length > 1 && (
          <select value={activeSession} onChange={e => setActiveSession(e.target.value)}
            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm">
            {sessions.map(s => <option key={s.id} value={s.id}>@{s.ig_username}</option>)}
          </select>
        )}

        <button onClick={load} disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 disabled:opacity-50 rounded-lg text-xs">
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Yenile
        </button>

        <button onClick={() => setShowFilters(p => !p)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border transition-colors ${showFilters ? 'border-purple-600 bg-purple-900/30 text-purple-300' : 'border-gray-700 bg-gray-800 text-gray-400'}`}>
          <SlidersHorizontal size={13} /> Filtre
        </button>

        {/* Zoom butonları */}
        <div className="flex gap-1 ml-auto">
          <button onClick={() => fgRef.current?.zoom(1.3)} title="Yakınlaştır"
            className="p-2 bg-gray-800 hover:bg-gray-700 rounded-lg"><ZoomIn size={14} /></button>
          <button onClick={() => fgRef.current?.zoom(0.7)} title="Uzaklaştır"
            className="p-2 bg-gray-800 hover:bg-gray-700 rounded-lg"><ZoomOut size={14} /></button>
          <button onClick={() => fgRef.current?.zoomToFit(400)} title="Tümüne Sığdır"
            className="p-2 bg-gray-800 hover:bg-gray-700 rounded-lg"><Maximize2 size={14} /></button>
        </div>

        {/* İstatistik */}
        {graphData && (
          <span className="text-xs text-gray-500">
            {graphData.stats.total_nodes} düğüm · {graphData.stats.total_links} kenar
          </span>
        )}
      </div>

      {/* Filtre paneli */}
      {showFilters && (
        <div className="flex items-end gap-6 bg-gray-900 border border-gray-800 rounded-xl px-5 py-4 mb-4">
          <div>
            <label className="block text-xs text-gray-400 mb-1">Min Etkileşim Skoru</label>
            <input type="number" value={minEngagement} min={0}
              onChange={e => setMinEngagement(+e.target.value)}
              className="w-28 bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm" />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Maks Düğüm</label>
            <input type="number" value={nodeLimit} min={10} max={2000} step={50}
              onChange={e => setNodeLimit(+e.target.value)}
              className="w-28 bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm" />
          </div>
          <button onClick={load}
            className="px-4 py-1.5 bg-purple-700 hover:bg-purple-600 rounded-lg text-sm font-medium">
            Uygula
          </button>
        </div>
      )}

      {/* Hata */}
      {error && (
        <div className="bg-red-900/30 border border-red-700 rounded-xl px-4 py-3 text-sm text-red-300 mb-4">
          {error}
        </div>
      )}

      {/* Graf alanı */}
      <div className="flex-1 relative bg-gray-950 rounded-2xl border border-gray-800 overflow-hidden">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center z-10 bg-gray-950/70">
            <RefreshCw size={28} className="animate-spin text-purple-400" />
          </div>
        )}

        {!graphData && !loading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-600 text-sm">
            <p>Veri yok.</p>
            <p className="text-xs mt-1">Önce takipçi/takip sync'i çalıştır.</p>
          </div>
        )}

        {graphData && graphData.nodes.length > 0 && (
          <ForceGraph2D
            ref={fgRef as any}
            graphData={graphData}
            nodeId="id"
            backgroundColor="#030712"
            linkColor={(link: GraphLink) => LINK_COLORS[(link as any).type] ?? '#ffffff22'}
            linkDirectionalArrowLength={4}
            linkDirectionalArrowRelPos={1}
            linkWidth={1}
            nodeCanvasObject={nodeCanvasObject}
            nodePointerAreaPaint={(node: GraphNode, color, ctx) => {
              const r = node.node_type === 'owner' ? 12 : 8
              ctx.fillStyle = color
              ctx.beginPath()
              ctx.arc(node.x!, node.y!, r, 0, 2 * Math.PI)
              ctx.fill()
            }}
            onNodeHover={(node) => setHovered(node as GraphNode | null)}
            onNodeClick={(node: GraphNode) => {
              fgRef.current?.centerAt(node.x!, node.y!, 500)
              fgRef.current?.zoom(3, 500)
            }}
            cooldownTicks={120}
            onEngineStop={() => fgRef.current?.zoomToFit(300, 40)}
          />
        )}

        {/* Hover tooltip */}
        {hovered && (
          <div className="absolute top-4 right-4 bg-gray-900 border border-gray-700 rounded-xl px-4 py-3 text-sm pointer-events-none z-20 max-w-xs">
            <p className="font-semibold">@{hovered.username}</p>
            {hovered.full_name && <p className="text-xs text-gray-400">{hovered.full_name}</p>}
            <div className="mt-2 space-y-0.5 text-xs text-gray-400">
              <p>Takipçi: {hovered.follower_count?.toLocaleString('tr-TR') ?? '—'}</p>
              <p>Etkileşim Skoru: <span className="text-amber-400 font-semibold">{hovered.engagement_score}</span></p>
              <p>Tür: <span style={{ color: NODE_COLORS[hovered.node_type] }}>
                {{ owner: 'Hesap sahibi', mutual: 'Karşılıklı', following: 'Takip edilen', follower: 'Takipçi' }[hovered.node_type]}
              </span></p>
            </div>
          </div>
        )}

        {/* Renk açıklaması */}
        <div className="absolute bottom-4 left-4 flex flex-col gap-1.5 pointer-events-none">
          {[
            { color: NODE_COLORS.owner,     label: 'Hesap Sahibi'   },
            { color: NODE_COLORS.mutual,    label: 'Karşılıklı'     },
            { color: NODE_COLORS.following, label: 'Takip Edilen'   },
            { color: NODE_COLORS.follower,  label: 'Takipçi'        },
          ].map(({ color, label }) => (
            <div key={label} className="flex items-center gap-2 bg-gray-950/80 rounded-lg px-2.5 py-1">
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
              <span className="text-xs text-gray-400">{label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
