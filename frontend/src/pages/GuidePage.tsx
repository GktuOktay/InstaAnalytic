import { ReactNode, useEffect, useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import {
  AlertTriangle, ArrowRight, Ban, BarChart3, BookOpen, Check, ChevronRight, Copy, Download, FileArchive, FileJson, Heart,
  HelpCircle, Info, LayoutGrid, ListChecks, Loader2, MessageCircle, MousePointerClick, OctagonAlert, Puzzle, RefreshCw, Rocket,
  ShieldCheck, FolderDown, ToggleRight,
} from 'lucide-react'
import { useLang } from '../contexts/LangContext'
import {
  guideContent, SECTION_ANCHOR, SECTION_ORDER, TOOL_ANCHOR, UPDATE_ANCHOR, type GuideContent, type GuideLink, type GuideRow,
  type GuideStep, type InstallStep, type SectionId, type ToolId, type UseTool,
} from '../guide/content'
import {
  buildExtensionZip, checklistMarkdown, copyToClipboard, extensionInfo, EXTENSION_ZIP_NAME, SAMPLE_FILES, saveBlob, saveText,
} from '../guide/files'
import { Illustration, WarningIllustration } from '../guide/illustrations'

const ICONS: Record<SectionId, typeof BookOpen> = {
  start: Rocket, zip: FileArchive, bridge: Puzzle, use: MousePointerClick, results: BarChart3, safety: ShieldCheck, faq: HelpCircle, files: FolderDown,
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
                        ? 'border-purple-500 text-gray-100 bg-purple-900/30'
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
          <UseSection C={C} />
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
      <PathChips label={Z.pathLabel} path={Z.path} keys={Z.pathKey} />
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
      <div className="mt-4"><WarningCallout C={C} /></div>

      <Sub>{B.installTitle}</Sub>
      <p className="text-sm text-gray-400 mb-3">{B.installIntro}</p>
      <ol className="space-y-3">
        {B.install.map((s, i) => <InstallStepCard key={s.art} step={s} n={i + 1} C={C} idPrefix="kurulum" />)}
      </ol>
      <p className="text-xs text-gray-500 mt-3">
        {B.zipNote.text} <GLink link={B.zipNote.link} />
      </p>

      <Sub>{B.troubleTitle}</Sub>
      <p className="text-sm text-gray-400 mb-2">{B.troubleIntro}</p>
      <RowTable head={[C.faq.qCol, C.faq.aCol]} rows={B.trouble} caption={B.troubleTitle} />

      <UpdateBlock C={C} />
    </Section>
  )
}

/**
 * Eklenti uygulamanın klasöründen yüklendiği için kendiliğinden güncellenir; burada bunun nasıl göründüğü
 * (Güncelleme sekmesi) ve zip kopyasından kurulmuş eklenti için bir kerelik düzeltme var.
 */
function UpdateBlock({ C }: { C: GuideContent }) {
  const U = C.bridge.update
  return (
    <div id={UPDATE_ANCHOR} className="scroll-mt-6">
      <h3 className="font-semibold text-sm mt-5 mb-2 flex items-center gap-1.5">
        <RefreshCw size={14} className="text-gray-400" aria-hidden="true" /> {U.title}
      </h3>
      <p className="text-sm text-gray-400 mb-3">{U.intro}</p>
      <Card>
        <Steps steps={U.steps} />
        <p className="flex gap-1.5 text-xs text-gray-400 mt-3 sm:ml-9">
          <Info size={14} className="shrink-0 mt-px text-gray-500" aria-hidden="true" /> <span>{U.tip}</span>
        </p>
        <Illustration id="updateTab" ui={C.bridge.ui} alt={U.alt} caption={U.caption} className="max-w-sm mt-4 sm:ml-9" />
      </Card>

      <h4 className="font-semibold text-sm mt-4 mb-2">{U.fixTitle}</h4>
      <p className="text-sm text-gray-400 mb-3">{U.fixIntro}</p>
      <Card>
        <Steps steps={U.fixSteps} />
        <Illustration id="updateManual" ui={C.bridge.ui} alt={U.fixAlt} caption={U.fixCaption} className="max-w-md mt-4 sm:ml-9" />
      </Card>
    </div>
  )
}

/**
 * Kullanım: önce işin nereden başlatıldığı (uygulamanın Gönderiler sayfası, tek gönderi paneli, eklenti penceresi)
 * ve nasıl durdurulduğu; sonra eklentinin üç işi ayrı bloklar hâlinde (Gönderileri çek, Beğenenleri çek,
 * Yorumları çek); en sonda kendin gezerken kaydetme ve araç anahtarları. Her iş ilk bakışta ayrı görünsün diye
 * her blok kendi başlığı, simgesi ve çerçevesiyle duruyor.
 */
function UseSection({ C }: { C: GuideContent }) {
  const U = C.use
  return (
    <Section id="use" C={C}>
      <p className="text-sm text-gray-400">{U.intro}</p>
      <Sub>{U.stepsTitle}</Sub>
      <p className="text-sm text-gray-400 mb-3">{U.stepsIntro}</p>
      <ol className="space-y-3">
        {U.steps.map((s, i) => <InstallStepCard key={s.art} step={s} n={i + 1} C={C} idPrefix="kullanim" />)}
      </ol>
      <div className="mt-3"><Note kind="info" title={U.stop.title}>{U.stop.text}</Note></div>

      <Sub>{U.toolsTitle}</Sub>
      <p className="text-sm text-gray-400 mb-3">{U.toolsIntro}</p>
      <div className="space-y-4">
        {U.tools.map((t, i) => <ToolBlock key={t.id} tool={t} n={i + 1} C={C} />)}
      </div>

      <Sub>{U.passive.title}</Sub>
      <p className="text-sm text-gray-300">{U.passive.text}</p>

      <Sub>{U.off.title}</Sub>
      <Card>
        <div className="flex gap-3">
          <ToggleRight size={18} className="shrink-0 mt-0.5 text-gray-400" aria-hidden="true" />
          <p className="text-sm text-gray-300">{U.off.text}</p>
        </div>
        <Illustration id="toolOff" ui={C.bridge.ui} alt={U.off.alt} caption={U.off.caption} className="max-w-sm mt-4 sm:ml-[1.875rem]" />
      </Card>

      <Sub>{U.troubleTitle}</Sub>
      <RowTable head={[C.faq.qCol, C.faq.aCol]} rows={U.trouble} caption={U.troubleTitle} />

      <Sub>{U.afterTitle}</Sub>
      <p className="text-sm text-gray-300">{U.after}</p>
      <div className="mt-3"><Note kind="warn" title={U.limitTitle}>{U.limit}</Note></div>
    </Section>
  )
}

const TOOL_ICONS: Record<ToolId, typeof BookOpen> = { posts: LayoutGrid, likers: Heart, comments: MessageCircle }

/** Eklentinin bir işi: kendi çapası, başlığı ve ne yaptığı; altında Instagram sekmesinde ne olduğunun resmi. */
function ToolBlock({ tool, n, C }: { tool: UseTool; n: number; C: GuideContent }) {
  const anchor = TOOL_ANCHOR[tool.id]
  const Icon = TOOL_ICONS[tool.id]
  return (
    <section id={anchor} aria-labelledby={`${anchor}-h`} data-tool={tool.id}
      className="scroll-mt-6 rounded-2xl border border-purple-500/40 bg-purple-950/10 p-3 sm:p-4">
      <div className="flex items-start gap-3">
        <span aria-hidden="true"
          className="shrink-0 w-9 h-9 rounded-lg bg-purple-900/40 border border-purple-500/50 flex items-center justify-center">
          <Icon size={18} className="text-purple-300" />
        </span>
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wide text-purple-300/80">{`${C.use.toolLabel} ${n}`}</p>
          <h3 id={`${anchor}-h`} className="font-semibold text-base">{tool.title}</h3>
          <p className="text-sm text-gray-300">{tool.what}</p>
        </div>
      </div>
      <ol className="space-y-3 mt-3">
        {tool.steps.map((s, i) => <InstallStepCard key={s.art} step={s} n={i + 1} C={C} idPrefix={anchor} />)}
      </ol>
      {tool.tip && <div className="mt-3"><Note kind="info" title={tool.tip.title}>{tool.tip.text}</Note></div>}
    </section>
  )
}

function InstallStepCard({ step, n, C, idPrefix }: { step: InstallStep; n: number; C: GuideContent; idPrefix: string }) {
  const B = C.bridge
  const headingId = `${idPrefix}-${n}`
  return (
    <li aria-labelledby={headingId} className="rounded-xl border border-gray-800 bg-gray-900 p-4">
      <div className="flex items-center gap-2.5">
        <span aria-hidden="true"
          className="shrink-0 w-7 h-7 rounded-full bg-purple-600 text-white text-sm font-bold flex items-center justify-center">
          {n}
        </span>
        <h4 id={headingId} className="font-semibold text-sm">
          <span className="sr-only">{`${B.stepLabel} ${n}:`}</span> {step.title}
        </h4>
      </div>
      <div className="mt-2 sm:pl-[2.375rem] space-y-2">
        <p className="text-sm text-gray-300">{step.text}</p>
        {step.copy && <CopyText text={step.copy} labels={B.copy} />}
        {step.tip && (
          <p className="flex gap-1.5 text-xs text-gray-400">
            <Info size={14} className="shrink-0 mt-px text-gray-500" aria-hidden="true" /> <span>{step.tip}</span>
          </p>
        )}
        {step.link && <div><GLink link={step.link} /></div>}
        <Illustration id={step.art} ui={B.ui} alt={step.alt} caption={step.caption} className="max-w-lg pt-1" />
      </div>
    </li>
  )
}

/** Yanında kopyalama düğmesi olan kısa metin (ör. chrome://extensions, tıklanamadığı için). */
function CopyText({ text, labels }: { text: string; labels: GuideContent['bridge']['copy'] }) {
  const [state, setState] = useState<'idle' | 'done' | 'failed'>('idle')

  useEffect(() => {
    if (state !== 'done') return
    const t = setTimeout(() => setState('idle'), 2000)
    return () => clearTimeout(t)
  }, [state])

  const copy = async () => {
    try {
      await copyToClipboard(text)
      setState('done')
    } catch {
      setState('failed')
    }
  }

  const done = state === 'done'
  return (
    <div className="flex flex-wrap items-center gap-2">
      <code className="font-mono text-sm px-2 py-1 rounded-md bg-gray-800 border border-gray-700 select-all">{text}</code>
      <button type="button" onClick={copy} aria-label={`${labels.button}: ${text}`}
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-gray-800 hover:bg-gray-700 border border-gray-700 text-xs font-medium">
        {done ? <Check size={13} className="text-green-400" aria-hidden="true" /> : <Copy size={13} aria-hidden="true" />}
        {done ? labels.done : labels.button}
      </button>
      <span role="status" className={state === 'failed' ? 'text-xs text-amber-300' : 'sr-only'}>
        {done ? labels.done : state === 'failed' ? labels.failed : ''}
      </span>
    </div>
  )
}

/** Instagram uyarısında ne olduğu ve ne yapılacağı. Bilerek göze batan bir kutu. */
function WarningCallout({ C }: { C: GuideContent }) {
  const W = C.bridge.warning
  return (
    <div id="uyari" role="note" aria-labelledby="uyari-h"
      className="scroll-mt-6 rounded-xl border-2 border-red-500/70 bg-red-900/30 p-4">
      <div className="flex gap-3">
        <OctagonAlert size={22} className="shrink-0 mt-0.5 text-red-400" aria-hidden="true" />
        <div className="min-w-0 flex-1 space-y-3 text-sm text-gray-200">
          <h3 id="uyari-h" className="text-base font-semibold text-red-300">{W.title}</h3>
          <div>
            <p>{W.intro}</p>
            <ul className="list-disc pl-5 mt-1 space-y-0.5 marker:text-red-400">
              {W.signs.map(t => <li key={t}>{t}</li>)}
            </ul>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <p className="font-semibold">{W.effectsTitle}</p>
              <ul className="list-disc pl-5 mt-1 space-y-0.5 marker:text-red-400">
                {W.effects.map(t => <li key={t}>{t}</li>)}
              </ul>
            </div>
            <div>
              <p className="font-semibold">{W.doTitle}</p>
              <ol className="list-decimal pl-5 mt-1 space-y-0.5 marker:text-red-400">
                {W.do.map(t => <li key={t}>{t}</li>)}
              </ol>
            </div>
          </div>
          <p className="flex gap-1.5 font-semibold text-red-300">
            <Ban size={16} className="shrink-0 mt-0.5" aria-hidden="true" /> <span>{W.never}</span>
          </p>
          <WarningIllustration ui={C.bridge.ui} alt={W.alt} caption={W.caption} className="max-w-md" />
        </div>
      </div>
    </div>
  )
}

/** Instagram menüsündeki yol, kısa hâliyle. Yanlış seçilince sonucu bozan adımlar vurgulu. */
function PathChips({ label, path, keys }: { label: string; path: string[]; keys: string[] }) {
  return (
    <div className="mt-3">
      <p className="text-xs uppercase tracking-wide text-gray-500 mb-1.5">{label}</p>
      <ol aria-label={label} className="flex flex-wrap items-center gap-1.5 text-xs">
        {path.map((p, i) => (
          <li key={p} className="flex items-center gap-1.5">
            {i > 0 && <ChevronRight size={13} className="text-gray-600" aria-hidden="true" />}
            <span className={`px-2 py-1 rounded-md border text-gray-100 ${keys.includes(p)
              ? 'border-purple-500 bg-purple-900/30 font-semibold'
              : 'border-gray-700 bg-gray-800'}`}>
              {p}
            </span>
          </li>
        ))}
      </ol>
    </div>
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

function DownloadButton({ label, onClick, disabled, busy, describedBy, secondary = false }: {
  label: string; onClick: () => void; disabled?: boolean; busy?: boolean; describedBy?: string; secondary?: boolean
}) {
  return (
    <button type="button" onClick={onClick} disabled={disabled || busy} aria-describedby={describedBy} aria-busy={busy || undefined}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg disabled:opacity-40 text-sm ${secondary
        ? 'bg-gray-800 hover:bg-gray-700 disabled:hover:bg-gray-800 border border-gray-700 font-medium'
        : 'bg-purple-600 hover:bg-purple-500 disabled:hover:bg-purple-600 text-white font-semibold'}`}>
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
      saveBlob(blob, EXTENSION_ZIP_NAME)
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
            {/* Yedek yol: zip kopyası kendiliğinden güncellenmez, bu yüzden düğme bilerek ikinci planda. */}
            <DownloadButton label={building ? F.ext.building : F.ext.button} onClick={downloadExtension} secondary
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
