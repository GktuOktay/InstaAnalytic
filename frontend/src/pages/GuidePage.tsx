import { ReactNode, useEffect, useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import {
  AlertTriangle, ArrowRight, BarChart3, BookOpen, Download, FileArchive, FileJson, HelpCircle, Info,
  ListChecks, Loader2, Puzzle, Rocket, ShieldCheck, FolderDown,
} from 'lucide-react'
import { useLang } from '../contexts/LangContext'
import {
  guideContent, SECTION_ANCHOR, SECTION_ORDER, type GuideContent, type GuideLink, type GuideRow, type GuideStep,
  type SectionId,
} from '../guide/content'
import { buildExtensionZip, checklistMarkdown, extensionInfo, SAMPLE_FILES, saveBlob, saveText } from '../guide/files'

const ICONS: Record<SectionId, typeof BookOpen> = {
  start: Rocket, zip: FileArchive, bridge: Puzzle, results: BarChart3, safety: ShieldCheck, faq: HelpCircle, files: FolderDown,
}

const scrollToAnchor = (anchor: string) => {
  const el = document.getElementById(anchor)
  el?.scrollIntoView?.({ behavior: 'smooth', block: 'start' })
}

export default function GuidePage() {
  const { lang } = useLang()
  const C = useMemo(() => guideContent(lang), [lang])
  const { hash } = useLocation()
  const [active, setActive] = useState<string>(SECTION_ANCHOR.start)

  // /guide#kopru gibi doğrudan bağlantılar
  useEffect(() => {
    if (hash) requestAnimationFrame(() => scrollToAnchor(decodeURIComponent(hash.slice(1))))
  }, [hash])

  // İçindekiler listesinde bulunulan bölümü vurgula
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(entries => {
      const top = entries.filter(e => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0]
      if (top) setActive(top.target.id)
    }, { rootMargin: '0px 0px -70% 0px' })
    SECTION_ORDER.forEach(id => { const el = document.getElementById(SECTION_ANCHOR[id]); if (el) io.observe(el) })
    return () => io.disconnect()
  }, [])

  return (
    <div className="max-w-4xl">
      <header className="mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2"><BookOpen size={22} className="text-purple-400" /> {C.title}</h1>
        <p className="text-sm text-gray-500">{C.subtitle}</p>
      </header>

      <div className="lg:grid lg:grid-cols-[11rem_minmax(0,1fr)] lg:gap-8">
        <nav aria-label={C.tocLabel} className="hidden lg:block">
          <div className="sticky top-4">
            <p className="text-xs uppercase tracking-wide text-gray-500 mb-2">{C.tocLabel}</p>
            <ul className="space-y-0.5 text-sm">
              {SECTION_ORDER.map(id => {
                const anchor = SECTION_ANCHOR[id]
                const on = active === anchor
                return (
                  <li key={id}>
                    <a href={`#${anchor}`} aria-current={on ? 'location' : undefined}
                      onClick={e => { e.preventDefault(); setActive(anchor); scrollToAnchor(anchor); history.replaceState(null, '', `#${anchor}`) }}
                      className={`block px-2 py-1 rounded-md border-l-2 ${on
                        ? 'border-purple-500 text-purple-100 bg-purple-900/30'
                        : 'border-transparent text-gray-400 hover:text-gray-200 hover:bg-gray-900'}`}>
                      {C.sections[id]}
                    </a>
                  </li>
                )
              })}
            </ul>
          </div>
        </nav>

        <div className="min-w-0 space-y-10">
          <StartSection C={C} />
          <ZipSection C={C} />
          <BridgeSection C={C} />
          <ResultsSection C={C} />
          <SafetySection C={C} />
          <FaqSection C={C} />
          <FilesSection C={C} />
        </div>
      </div>
    </div>
  )
}

/* ── Yapı taşları ─────────────────────────────────────────────────────────── */

function Section({ id, C, children }: { id: SectionId; C: GuideContent; children: ReactNode }) {
  const Icon = ICONS[id]
  const anchor = SECTION_ANCHOR[id]
  return (
    <section id={anchor} aria-labelledby={`${anchor}-h`} className="scroll-mt-6">
      <h2 id={`${anchor}-h`} className="text-lg font-semibold mb-3 flex items-center gap-2">
        <Icon size={18} className="text-purple-400" aria-hidden="true" /> {C.sections[id]}
      </h2>
      {children}
    </section>
  )
}

function Sub({ children }: { children: ReactNode }) {
  return <h3 className="font-semibold text-sm mt-5 mb-2">{children}</h3>
}

function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-xl border border-gray-800 bg-gray-900 p-4 ${className}`}>{children}</div>
}

function GLink({ link }: { link: GuideLink }) {
  const cls = 'inline-flex items-center gap-1 text-sm text-purple-400 hover:underline'
  if (link.to.startsWith('#')) {
    const anchor = link.to.slice(1)
    return (
      <a href={link.to} className={cls} onClick={e => { e.preventDefault(); scrollToAnchor(anchor); history.replaceState(null, '', link.to) }}>
        {link.label} <ArrowRight size={13} aria-hidden="true" />
      </a>
    )
  }
  return <Link to={link.to} className={cls}>{link.label} <ArrowRight size={13} aria-hidden="true" /></Link>
}

function Steps({ steps }: { steps: GuideStep[] }) {
  return (
    <ol className="space-y-2">
      {steps.map((s, i) => (
        <li key={i} className="flex gap-3">
          <span aria-hidden="true"
            className="shrink-0 w-6 h-6 rounded-full bg-purple-900/40 border border-purple-500/60 text-purple-100 text-xs font-semibold flex items-center justify-center mt-0.5">
            {i + 1}
          </span>
          <div className="text-sm text-gray-300 min-w-0">
            {s.title && <p className="font-medium text-gray-100">{s.title}</p>}
            <p>{s.text}</p>
            {s.link && <div className="mt-0.5"><GLink link={s.link} /></div>}
          </div>
        </li>
      ))}
    </ol>
  )
}

function Bullets({ items }: { items: string[] }) {
  return (
    <ul className="list-disc pl-5 space-y-1 text-sm text-gray-300 marker:text-gray-600">
      {items.map((t, i) => <li key={i}>{t}</li>)}
    </ul>
  )
}

function Note({ kind, title, children }: { kind: 'warn' | 'info'; title?: string; children: ReactNode }) {
  const warn = kind === 'warn'
  const Icon = warn ? AlertTriangle : Info
  return (
    <div className={`flex gap-2 rounded-lg border px-3 py-2.5 text-sm ${warn
      ? 'text-amber-200 bg-amber-950/30 border-amber-900/50'
      : 'text-gray-300 bg-gray-900 border-gray-800'}`}>
      <Icon size={16} className={`shrink-0 mt-0.5 ${warn ? 'text-amber-400' : 'text-gray-500'}`} aria-hidden="true" />
      <div>
        {title && <p className="font-semibold">{title}</p>}
        <p>{children}</p>
      </div>
    </div>
  )
}

function RowTable({ head, rows, caption }: { head: [string, string]; rows: GuideRow[]; caption: string }) {
  return (
    <div className="rounded-xl border border-gray-800 overflow-hidden">
      <table className="w-full text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead className="bg-gray-900 text-xs text-gray-500 text-left">
          <tr>
            <th scope="col" className="px-3 py-2 font-medium w-2/5">{head[0]}</th>
            <th scope="col" className="px-3 py-2 font-medium">{head[1]}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-gray-800 align-top">
              <th scope="row" className="px-3 py-2.5 text-left font-medium text-gray-100">{r.term}</th>
              <td className="px-3 py-2.5 text-gray-300">
                {r.text}
                {r.link && <> <GLink link={r.link} /></>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/* ── Bölümler ─────────────────────────────────────────────────────────────── */

function StartSection({ C }: { C: GuideContent }) {
  return (
    <Section id="start" C={C}>
      <p className="text-sm text-gray-400 mb-3">{C.start.intro}</p>
      <Card><Steps steps={C.start.steps} /></Card>
    </Section>
  )
}

function ZipSection({ C }: { C: GuideContent }) {
  const Z = C.zip
  return (
    <Section id="zip" C={C}>
      <p className="text-sm text-gray-400">{Z.intro}</p>
      <Sub>{Z.requestTitle}</Sub>
      <Card><Steps steps={Z.request} /></Card>
      <div className="mt-3"><Note kind="warn" title={Z.warningTitle}>{Z.warning}</Note></div>
      <Sub>{Z.uploadTitle}</Sub>
      <Card><Steps steps={Z.upload} /></Card>
      <Sub>{Z.filesTitle}</Sub>
      <RowTable head={[Z.fileCol, Z.descCol]} rows={Z.files} caption={Z.filesTitle} />
      <div className="mt-3"><Note kind="info">{Z.noLikes}</Note></div>
    </Section>
  )
}

function BridgeSection({ C }: { C: GuideContent }) {
  const B = C.bridge
  return (
    <Section id="bridge" C={C}>
      <p className="text-sm text-gray-400">{B.intro}</p>
      <Sub>{B.howTitle}</Sub>
      <p className="text-sm text-gray-300">{B.how}</p>
      <Sub>{B.rulesTitle}</Sub>
      <Card><Bullets items={B.rules} /></Card>
      <Sub>{B.installTitle}</Sub>
      <Card><Steps steps={B.install} /></Card>
      <Sub>{B.afterTitle}</Sub>
      <p className="text-sm text-gray-300">{B.after}</p>
      <div className="mt-3"><Note kind="warn" title={B.limitTitle}>{B.limit}</Note></div>
    </Section>
  )
}

function ResultsSection({ C }: { C: GuideContent }) {
  const R = C.results
  return (
    <Section id="results" C={C}>
      <p className="text-sm text-gray-400">{R.intro}</p>
      <Sub>{R.pagesTitle}</Sub>
      <RowTable head={[R.pagesTitle, C.zip.descCol]} rows={R.pages} caption={R.pagesTitle} />
      <Sub>{R.groupsTitle}</Sub>
      <p className="text-sm text-gray-400 mb-2">{R.groupsNote}</p>
      <div className="grid sm:grid-cols-2 gap-2">
        {R.groups.map(g => (
          <Card key={g.term} className="!p-3">
            <p className="font-medium text-sm">{g.term}</p>
            <p className="text-sm text-gray-400">{g.text}</p>
          </Card>
        ))}
      </div>
      <Sub>{R.decideTitle}</Sub>
      <Card><Bullets items={R.decide} /></Card>
    </Section>
  )
}

function SafetySection({ C }: { C: GuideContent }) {
  const S = C.safety
  return (
    <Section id="safety" C={C}>
      <p className="text-sm text-gray-400 mb-3">{S.intro}</p>
      <RowTable head={[S.topicCol, S.ruleCol]} rows={S.rows} caption={C.sections.safety} />
      <Sub>{S.riskTitle}</Sub>
      <p className="text-sm text-gray-300">{S.risk}</p>
      <Sub>{S.limitsTitle}</Sub>
      <Card><Bullets items={S.limits} /></Card>
    </Section>
  )
}

function FaqSection({ C }: { C: GuideContent }) {
  const F = C.faq
  return (
    <Section id="faq" C={C}>
      <p className="text-sm text-gray-400 mb-3">{F.intro}</p>
      <RowTable head={[F.qCol, F.aCol]} rows={F.items} caption={C.sections.faq} />
    </Section>
  )
}

function DownloadButton({ label, onClick, disabled, busy, describedBy }: {
  label: string; onClick: () => void; disabled?: boolean; busy?: boolean; describedBy?: string
}) {
  return (
    <button type="button" onClick={onClick} disabled={disabled || busy} aria-describedby={describedBy} aria-busy={busy || undefined}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 disabled:opacity-40 disabled:hover:bg-purple-600 text-white text-sm font-semibold">
      {busy ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <Download size={14} aria-hidden="true" />} {label}
    </button>
  )
}

function FilesSection({ C }: { C: GuideContent }) {
  const F = C.files
  const ext = useMemo(extensionInfo, [])
  const [building, setBuilding] = useState(false)
  const [failed, setFailed] = useState(false)

  const downloadExtension = async () => {
    setBuilding(true); setFailed(false)
    try {
      const blob = await buildExtensionZip()
      saveBlob(blob, `instaanalytic-kopru${ext.version ? `-${ext.version}` : ''}.zip`)
    } catch {
      setFailed(true)
    } finally {
      setBuilding(false)
    }
  }

  return (
    <Section id="files" C={C}>
      <p className="text-sm text-gray-400 mb-3">{F.intro}</p>
      <div className="space-y-3">
        <Card>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="font-semibold text-sm flex items-center gap-2"><Puzzle size={15} className="text-gray-400" aria-hidden="true" /> {F.ext.title}</h3>
              <p className="text-sm text-gray-400">{F.ext.text}</p>
              {ext.available && (
                <p className="text-xs text-gray-500 mt-1">
                  {ext.version ? `v${ext.version} · ` : ''}{F.ext.count.replace('{n}', String(ext.count))}
                </p>
              )}
            </div>
            <DownloadButton label={building ? F.ext.building : F.ext.button} onClick={downloadExtension}
              disabled={!ext.available} busy={building} describedBy={!ext.available ? 'ext-unavailable' : undefined} />
          </div>
          {!ext.available && <p id="ext-unavailable" className="text-xs text-amber-300 mt-2">{F.ext.unavailable}</p>}
          {failed && <p role="alert" className="text-xs text-red-400 mt-2">{F.ext.error}</p>}
        </Card>

        <Card>
          <h3 className="font-semibold text-sm flex items-center gap-2"><FileJson size={15} className="text-gray-400" aria-hidden="true" /> {F.samples.title}</h3>
          <p className="text-sm text-gray-400">{F.samples.text}</p>
          <p className="text-sm text-gray-400 mt-1">{F.samples.tryIt}</p>
          <div className="flex flex-wrap gap-2 mt-3">
            {SAMPLE_FILES.map(f => (
              <button key={f.name} type="button" onClick={() => saveText(f.text, f.name, 'application/json')}
                aria-label={`${F.samples.button}: ${f.name}`}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-sm">
                <Download size={14} aria-hidden="true" /> <span className="font-mono text-xs">{f.name}</span>
              </button>
            ))}
          </div>
        </Card>

        <Card>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="font-semibold text-sm flex items-center gap-2"><ListChecks size={15} className="text-gray-400" aria-hidden="true" /> {F.checklist.title}</h3>
              <p className="text-sm text-gray-400">{F.checklist.text}</p>
              <p className="text-xs text-gray-500 mt-1 font-mono">{C.checklistDoc.fileName}</p>
            </div>
            <DownloadButton label={F.checklist.button}
              onClick={() => saveText(checklistMarkdown(C), C.checklistDoc.fileName, 'text/markdown')} />
          </div>
        </Card>
      </div>
    </Section>
  )
}
