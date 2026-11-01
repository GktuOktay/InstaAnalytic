import { AlertOctagon, AlertTriangle, Info } from 'lucide-react'
import { useLang } from '../contexts/LangContext'
import { explainProblem, ProblemKind } from '../lib/problems'

const TONE: Record<'danger' | 'warn' | 'info', string> = {
  danger: 'text-red-100 bg-red-950/60 border-red-700',
  warn:   'text-amber-100 bg-amber-950/40 border-amber-800',
  info:   'text-gray-200 bg-gray-900 border-gray-700',
}

const DANGER: ProblemKind[] = ['rate_limit', 'action_blocked', 'verify', 'logged_out', 'repeated_failures']

/** Teknik bir hata/uyarı metnini son kullanıcı diliyle gösterir; asıl metin "Teknik ayrıntı"nın altında. */
export default function ProblemNote({ raw, extra, compact = false }: { raw: string | null | undefined; extra?: string; compact?: boolean }) {
  const { T } = useLang()
  const p = explainProblem(raw, T)
  const tone = DANGER.includes(p.kind) ? 'danger' : p.kind === 'budget' ? 'info' : 'warn'
  const Icon = tone === 'danger' ? AlertOctagon : tone === 'info' ? Info : AlertTriangle
  return (
    <div role={tone === 'info' ? 'status' : 'alert'} className={`rounded-lg border px-3 py-2 text-xs ${TONE[tone]}`}>
      <div className="flex items-start gap-2">
        <Icon size={15} className="shrink-0 mt-0.5" />
        <div className="min-w-0">
          <p className="font-semibold text-sm">{p.title}</p>
          {extra && <p className="mt-0.5">{extra}</p>}
          {!compact && <p className="mt-1 opacity-90">{p.body}</p>}
          {!compact && p.todo.length > 0 && (
            <>
              <p className="mt-2 font-medium">{T.problems.whatToDo}</p>
              <ul className="list-disc pl-4 mt-0.5 space-y-0.5">{p.todo.map(t => <li key={t}>{t}</li>)}</ul>
            </>
          )}
          {p.detail && (
            <details className="mt-1.5 opacity-75">
              <summary className="cursor-pointer select-none">{T.problems.detail}</summary>
              <code className="block mt-1 break-all whitespace-pre-wrap">{p.detail}</code>
            </details>
          )}
        </div>
      </div>
    </div>
  )
}
