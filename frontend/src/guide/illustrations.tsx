// Rehberin resimleri (kurulum, kullanım, güncelleme). chrome:// sayfalarının ekran görüntüsü alınamadığı
// ve Instagram'ın gerçek ekranını göstermek istemediğimiz için Chrome'un ve Instagram'ın sadeleştirilmiş birer çizimi. Renkler temadan (CSS değişkenleri) gelir; açık ve koyu temada çalışır.
// Tıklanacak yer vurgu rengiyle çerçevelenir ve numaralanır. Resimlerin içindeki yazılar content.ts'teki
// `bridge.ui` alanından gelir; buradaki tek iş çizmek.
import type { CSSProperties, ReactNode } from 'react'
import type { ArtId, ArtLabels } from './content'

const v = (n: string) => `var(--${n})`
const K = {
  bg: v('bg'), s1: v('surface'), s2: v('surface-2'), b1: v('border'), b2: v('border-2'),
  t1: v('text'), t2: v('text-2'), t3: v('text-3'), ac: v('accent'), glow: v('accent-glow'),
}
const OK = '#22c55e'
const BAD = '#dc2626'
const FOLDER = '#5b9bd5'
const W = 400

/* ── Temel parçalar ──────────────────────────────────────────────────────── */

type Paint = { fill?: string; stroke?: string; sw?: number; op?: number; dash?: string }
const paint = ({ fill, stroke, sw, op, dash }: Paint): CSSProperties => ({
  fill: fill ?? 'none', stroke, strokeWidth: stroke ? (sw ?? 1) : undefined, opacity: op, strokeDasharray: dash,
})

function Box({ x, y, w, h, r = 0, ...p }: { x: number; y: number; w: number; h: number; r?: number } & Paint) {
  return <rect x={x} y={y} width={w} height={h} rx={r} style={paint(p)} />
}

function Txt({ x, y, children, size = 10, color = K.t1, weight, anchor, mono }: {
  x: number; y: number; children: ReactNode; size?: number; color?: string; weight?: number
  anchor?: 'start' | 'middle' | 'end'; mono?: boolean
}) {
  return (
    <text x={x} y={y} textAnchor={anchor}
      style={{ fill: color, fontSize: size, fontWeight: weight, fontFamily: mono ? 'ui-monospace, SFMono-Regular, Menlo, monospace' : 'inherit' }}>
      {children}
    </text>
  )
}

function Line({ x1, y1, x2, y2, color = K.b1, sw = 1 }: { x1: number; y1: number; x2: number; y2: number; color?: string; sw?: number }) {
  return <line x1={x1} y1={y1} x2={x2} y2={y2} style={{ stroke: color, strokeWidth: sw, strokeLinecap: 'round' }} />
}

function Badge({ x, y, n, color = K.ac }: { x: number; y: number; n: number; color?: string }) {
  return (
    <g>
      <circle cx={x} cy={y} r={9} style={{ fill: color, stroke: K.s1, strokeWidth: 2 }} />
      <text x={x} y={y + 3.8} textAnchor="middle" style={{ fill: '#fff', fontSize: 11, fontWeight: 700 }}>{n}</text>
    </g>
  )
}

/** Tıklanacak yerin çerçevesi ve sağ üst köşesindeki numara. */
function Focus({ x, y, w, h, r = 6, n, bx, by, color = K.ac }: {
  x: number; y: number; w: number; h: number; r?: number; n: number; bx?: number; by?: number; color?: string
}) {
  return (
    <g>
      <rect x={x - 3} y={y - 3} width={w + 6} height={h + 6} rx={r + 3}
        style={{ fill: color === BAD ? 'rgba(220,38,38,0.10)' : K.glow, stroke: color, strokeWidth: 2.2 }} />
      <Badge x={bx ?? x + w + 3} y={by ?? y - 3} n={n} color={color} />
    </g>
  )
}

function Cursor({ x, y }: { x: number; y: number }) {
  return (
    <path transform={`translate(${x} ${y})`} d="M0 0V15l4-3.6 2.6 5.8 2.6-1.1-2.6-5.7H12z"
      style={{ fill: K.t1, stroke: K.s1, strokeWidth: 1.2, strokeLinejoin: 'round' }} />
  )
}

function Toggle({ x, y, on = true }: { x: number; y: number; on?: boolean }) {
  return (
    <g>
      <rect x={x} y={y} width={26} height={14} rx={7} style={{ fill: on ? K.ac : K.b2 }} />
      <circle cx={on ? x + 19 : x + 7} cy={y + 7} r={5} style={{ fill: on ? '#fff' : K.t2 }} />
    </g>
  )
}

function Puzzle({ x, y, color = K.t2 }: { x: number; y: number; color?: string }) {
  return (
    <path transform={`translate(${x} ${y})`}
      d="M1 4.5h3.2a1.8 1.8 0 1 1 3.6 0H11v3.2a1.8 1.8 0 1 1 0 3.6V14H7.8a1.8 1.8 0 1 0-3.6 0H1v-3.2a1.8 1.8 0 1 0 0-3.6z"
      style={{ fill: 'none', stroke: color, strokeWidth: 1.3, strokeLinejoin: 'round' }} />
  )
}

function PinIcon({ x, y, color = K.t2 }: { x: number; y: number; color?: string }) {
  return (
    <g transform={`translate(${x} ${y})`} style={{ fill: 'none', stroke: color, strokeWidth: 1.3, strokeLinejoin: 'round', strokeLinecap: 'round' }}>
      <path d="M4 1.5h5l-.6 4 2.3 2.3H2.3L4.6 5.5z" />
      <path d="M6.5 7.8V12.5" />
    </g>
  )
}

/** Eklentinin simgesi. manifest'te simge olmadığı için Chrome ilk harfi gri bir kare içinde gösterir. */
function ExtIcon({ x, y, size = 16, alert = false }: { x: number; y: number; size?: number; alert?: boolean }) {
  return (
    <g>
      <rect x={x} y={y} width={size} height={size} rx={size / 4} style={{ fill: K.t3 }} />
      <text x={x + size / 2} y={y + size * 0.72} textAnchor="middle" style={{ fill: K.s1, fontSize: size * 0.62, fontWeight: 700 }}>I</text>
      {alert && (
        <g>
          <circle cx={x + size} cy={y + 1} r={6} style={{ fill: BAD, stroke: K.s1, strokeWidth: 1.5 }} />
          <text x={x + size} y={y + 4.2} textAnchor="middle" style={{ fill: '#fff', fontSize: 9, fontWeight: 800 }}>!</text>
        </g>
      )}
    </g>
  )
}

function SmallFolder({ x, y }: { x: number; y: number }) {
  return <path transform={`translate(${x} ${y})`} d="M0 2a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2z" style={{ fill: FOLDER }} />
}

function SmallZip({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <path d="M0 0h8l4 4v11H0z" style={paint({ fill: K.s2, stroke: K.b2 })} />
      <rect x={5} y={2} width={2} height={2} style={{ fill: K.t3 }} />
      <rect x={5} y={6} width={2} height={2} style={{ fill: K.t3 }} />
    </g>
  )
}

function Key({ x, y, w, label }: { x: number; y: number; w: number; label: string }) {
  return (
    <g>
      <Box x={x} y={y + 3} w={w} h={30} r={6} fill={K.b2} />
      <Box x={x} y={y} w={w} h={30} r={6} fill={K.s2} stroke={K.b2} />
      <Txt x={x + w / 2} y={y + 19.5} size={11} weight={600} anchor="middle">{label}</Txt>
    </g>
  )
}

/** Basit bir Instagram görünümü: hikâye halkaları ve bir gönderi. */
function IgContent({ y = 72, w = 150 }: { y?: number; w?: number }) {
  return (
    <g>
      {[0, 1, 2, 3].map(i => (
        <circle key={i} cx={30 + i * 28} cy={y + 12} r={9} style={{ fill: K.s2, stroke: K.ac, strokeWidth: 1.5, opacity: 0.8 }} />
      ))}
      <Box x={20} y={y + 30} w={w} h={8} r={4} fill={K.s2} />
      <Box x={20} y={y + 44} w={w} h={60} r={6} fill={K.s2} />
    </g>
  )
}

/* ── Pencereler ──────────────────────────────────────────────────────────── */

/**
 * Chrome penceresi: sekme şeridi, adres çubuğu, sağda (isteğe bağlı) sabitlenmiş eklenti, yapboz parçası,
 * profil ve menü. İçerik alanı y=61'den başlar.
 */
function Browser({ h, url, tab, pinned = false, alert = false, children }: {
  h: number; url?: string; tab: string; pinned?: boolean; alert?: boolean; children?: ReactNode
}) {
  return (
    <g>
      <Box x={2} y={2} w={396} h={h - 4} r={10} fill={K.s1} />
      <path d="M2 12a10 10 0 0 1 10-10h376a10 10 0 0 1 10 10v20H2z" style={{ fill: K.s2 }} />
      {[16, 28, 40].map(cx => <circle key={cx} cx={cx} cy={17} r={3.5} style={{ fill: K.t3 }} />)}
      <path d="M54 32V14a6 6 0 0 1 6-6h128a6 6 0 0 1 6 6v18z" style={{ fill: K.s1 }} />
      <circle cx={66} cy={20} r={5} style={{ fill: K.t3 }} />
      <Txt x={76} y={23.5} size={9.5} color={K.t2}>{tab}</Txt>
      <Txt x={180} y={23.5} size={10} color={K.t3}>×</Txt>
      <Txt x={11} y={51} size={13} color={K.t3}>←</Txt>
      <Txt x={27} y={51} size={13} color={K.t3}>→</Txt>
      <Txt x={43} y={51} size={13} color={K.t3}>↻</Txt>
      <Box x={64} y={37} w={242} h={18} r={9} fill={K.s2} />
      <circle cx={76} cy={46} r={3} style={paint({ stroke: K.t3, sw: 1.1 })} />
      {url && <Txt x={86} y={49.5} size={9.5}>{url}</Txt>}
      {pinned && <ExtIcon x={314} y={38} alert={alert} />}
      <Puzzle x={338} y={38.5} />
      <circle cx={366} cy={46} r={6} style={{ fill: K.t3 }} />
      {[41, 46, 51].map(cy => <circle key={cy} cx={385} cy={cy} r={1.3} style={{ fill: K.t2 }} />)}
      <Line x1={2} y1={61} x2={398} y2={61} />
      {children}
      <Box x={2} y={2} w={396} h={h - 4} r={10} stroke={K.b2} />
    </g>
  )
}

/** InstaAnalytic'in sol menüsü (sadeleştirilmiş). */
function AppSidebar({ h, active }: { h: number; active: number }) {
  return (
    <g>
      <path d={`M3 62H71V${h - 3}H12a9 9 0 0 1-9-9z`} style={{ fill: K.bg }} />
      {[0, 1, 2, 3, 4, 5].map(i => (
        <Box key={i} x={12} y={76 + i * 18} w={i === active ? 50 : 42} h={7} r={3.5}
          fill={i === active ? K.ac : K.b2} op={i === active ? 0.7 : 1} />
      ))}
    </g>
  )
}

/** chrome://extensions sayfasının üst kısmı: başlık, arama, sağda Geliştirici modu anahtarı. */
function ExtHeader({ ui, focusDev = false, dev = true }: { ui: ArtLabels; focusDev?: boolean; dev?: boolean }) {
  return (
    <g>
      <Txt x={14} y={84} size={13} color={K.t2}>≡</Txt>
      <Txt x={30} y={84} size={12.5} weight={600}>{ui.extensionsTitle}</Txt>
      <Box x={128} y={70} w={132} h={20} r={10} fill={K.s2} />
      <circle cx={141} cy={79.5} r={3.5} style={paint({ stroke: K.t3, sw: 1.2 })} />
      <Txt x={150} y={83.5} size={8.5} color={K.t3}>{ui.searchExtensions}</Txt>
      <Txt x={346} y={83.5} size={9} color={K.t2} anchor="end">{ui.devMode}</Txt>
      <Toggle x={352} y={73} on={dev} />
      {focusDev && <Focus x={270} y={70} w={112} h={20} n={1} />}
      <Line x1={2} y1={97} x2={398} y2={97} />
    </g>
  )
}

/** Geliştirici modu açılınca çıkan düğmeler. */
function ExtButtons({ ui, focus = false }: { ui: ArtLabels; focus?: boolean }) {
  return (
    <g>
      <Box x={14} y={103} w={124} h={19} r={5} stroke={K.b2} />
      <Txt x={76} y={115.8} size={8.5} color={K.ac} weight={600} anchor="middle">{ui.loadUnpacked}</Txt>
      <Box x={146} y={103} w={84} h={19} r={5} stroke={K.b2} />
      <Txt x={188} y={115.8} size={8.5} color={K.ac} weight={600} anchor="middle">{ui.packExtension}</Txt>
      <Box x={238} y={103} w={58} h={19} r={5} stroke={K.b2} />
      <Txt x={267} y={115.8} size={8.5} color={K.ac} weight={600} anchor="middle">{ui.update}</Txt>
      {focus && <Focus x={14} y={103} w={124} h={19} n={1} />}
      <Line x1={2} y1={128} x2={398} y2={128} />
    </g>
  )
}

/** Uzantılar listesindeki başka (önemsiz) eklentiler. */
function OtherCards({ y }: { y: number }) {
  return (
    <g>
      {[14, 206].map(x => (
        <g key={x} style={{ opacity: 0.7 }}>
          <Box x={x} y={y} w={180} h={60} r={8} fill={K.s2} />
          <Box x={x + 12} y={y + 12} w={18} h={18} r={4} fill={K.b2} />
          <Box x={x + 38} y={y + 14} w={90} h={6} r={3} fill={K.b2} />
          <Box x={x + 38} y={y + 26} w={120} h={5} r={2.5} fill={K.b1} />
          <Toggle x={x + 144} y={y + 40} on={false} />
        </g>
      ))}
    </g>
  )
}

/* ── Adım resimleri ──────────────────────────────────────────────────────── */

function DownloadArt({ ui }: { ui: ArtLabels }) {
  const h = 210
  return (
    <Browser h={h} url="localhost:3002/guide#referans" tab={ui.appTab}>
      <AppSidebar h={h} active={4} />
      <Txt x={88} y={86} size={12} weight={600}>{ui.guideHeading}</Txt>
      <Box x={88} y={98} w={296} h={62} r={8} fill={K.s2} stroke={K.b1} />
      <Puzzle x={100} y={107} />
      <Txt x={120} y={118.5} size={10} weight={600}>{ui.extCardTitle}</Txt>
      <Txt x={100} y={142} size={8.5} color={K.t2}>{ui.extCardText}</Txt>
      <Box x={274} y={115} w={98} h={24} r={6} fill={K.ac} />
      <Txt x={323} y={130.5} size={9} weight={600} color="#fff" anchor="middle">{ui.extButton}</Txt>
      <Focus x={274} y={115} w={98} h={24} n={1} />
      <Cursor x={358} y={131} />
      <Box x={88} y={170} w={296} h={30} r={8} fill={K.s2} op={0.6} />
      <Txt x={100} y={189} size={9} color={K.t2}>{ui.samplesTitle}</Txt>
    </Browser>
  )
}

function UnzipArt({ ui }: { ui: ArtLabels }) {
  return (
    <g>
      <Box x={2} y={2} w={396} h={206} r={10} fill={K.s1} />
      <path d="M2 12a10 10 0 0 1 10-10h376a10 10 0 0 1 10 10v18H2z" style={{ fill: K.s2 }} />
      {[16, 28, 40].map(cx => <circle key={cx} cx={cx} cy={16} r={3.5} style={{ fill: K.t3 }} />)}
      <Txt x={200} y={20} size={10} weight={600} anchor="middle">{ui.downloads}</Txt>
      <Line x1={2} y1={30} x2={398} y2={30} />
      <path d="M2 30H96V206H12a10 10 0 0 1-10-10z" style={{ fill: K.bg }} />
      <Box x={8} y={42} w={82} h={18} r={5} fill={K.glow} />
      <Txt x={16} y={54.5} size={9} weight={600}>{ui.downloads}</Txt>
      <Txt x={16} y={76} size={9} color={K.t2}>{ui.desktop}</Txt>
      <Txt x={16} y={96} size={9} color={K.t2}>{ui.documents}</Txt>

      {/* ZIP dosyası */}
      <path d="M138 64h26l10 10v40h-36z" style={paint({ fill: K.s2, stroke: K.b2 })} />
      <path d="M164 64v10h10" style={paint({ stroke: K.b2 })} />
      {[0, 1, 2, 3, 4].map(i => <rect key={i} x={i % 2 ? 156 : 153} y={68 + i * 5} width={4} height={3} style={{ fill: K.t3 }} />)}
      <Txt x={156} y={106} size={7} weight={700} color={K.t2} anchor="middle">ZIP</Txt>
      <Txt x={156} y={134} size={8.5} anchor="middle">{ui.zipName}</Txt>
      <Focus x={132} y={60} w={48} h={60} n={1} />
      <Cursor x={160} y={92} />
      <Txt x={156} y={150} size={9} weight={600} color={K.ac} anchor="middle">{ui.doubleClick}</Txt>

      {/* Ok ve çıkan klasör */}
      <Line x1={214} y1={90} x2={240} y2={90} color={K.ac} sw={2} />
      <path d="M240 85l8 5-8 5z" style={{ fill: K.ac }} />
      <path d="M274 74a4 4 0 0 1 4-4h14l5 5h25a4 4 0 0 1 4 4v27a4 4 0 0 1-4 4h-44a4 4 0 0 1-4-4z" style={{ fill: FOLDER }} />
      <Txt x={300} y={134} size={8.5} weight={600} anchor="middle">{ui.folderName}</Txt>
      <Focus x={266} y={62} w={68} h={54} n={2} />

      <Txt x={247} y={186} size={8.5} color={K.t2} anchor="middle">{ui.winHint}</Txt>
      <Box x={2} y={2} w={396} h={206} r={10} stroke={K.b2} />
    </g>
  )
}

function AddressArt({ ui }: { ui: ArtLabels }) {
  return (
    <Browser h={160} tab={ui.newTab}>
      <Txt x={86} y={49.5} size={9.5} mono>chrome://extensions</Txt>
      <Line x1={196} y1={40} x2={196} y2={52} color={K.ac} sw={1.2} />
      <Focus x={64} y={37} w={242} h={18} r={9} n={1} />
      <path d="M112 80L100 64M95 69l5-5 5 5" style={{ fill: 'none', stroke: K.ac, strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round' }} />
      <Txt x={100} y={95} size={9.5} weight={600} color={K.ac}>{ui.typeHere}</Txt>
      <Key x={284} y={90} w={78} label={ui.enterKey} />
      <Focus x={284} y={90} w={78} h={33} n={2} />
      {[0, 1, 2, 3].map(i => <Box key={i} x={30 + i * 44} y={124} w={32} h={20} r={5} fill={K.s2} />)}
    </Browser>
  )
}

function DevModeArt({ ui }: { ui: ArtLabels }) {
  return (
    <Browser h={190} url="chrome://extensions" tab={ui.extensionsTitle}>
      <ExtHeader ui={ui} focusDev />
      <Cursor x={368} y={82} />
      <OtherCards y={110} />
    </Browser>
  )
}

function LoadUnpackedArt({ ui }: { ui: ArtLabels }) {
  return (
    <Browser h={210} url="chrome://extensions" tab={ui.extensionsTitle}>
      <ExtHeader ui={ui} />
      <ExtButtons ui={ui} focus />
      <Cursor x={126} y={115} />
      <OtherCards y={138} />
    </Browser>
  )
}

function PickFolderArt({ ui }: { ui: ArtLabels }) {
  const h = 230
  return (
    <Browser h={h} url="chrome://extensions" tab={ui.extensionsTitle}>
      <ExtHeader ui={ui} />
      <ExtButtons ui={ui} />
      <path d={`M2 62H398V${h - 12}a10 10 0 0 1-10 10H12a10 10 0 0 1-10-10z`} style={{ fill: K.bg, opacity: 0.7 }} />

      {/* Klasör seçme penceresi */}
      <Box x={42} y={47} w={320} h={176} r={10} fill="rgba(0,0,0,0.18)" />
      <Box x={40} y={44} w={320} h={176} r={10} fill={K.s1} stroke={K.b2} />
      <path d="M40 54a10 10 0 0 1 10-10h300a10 10 0 0 1 10 10v12H40z" style={{ fill: K.s2 }} />
      <Txt x={200} y={59} size={10} weight={600} anchor="middle">{ui.pickTitle}</Txt>
      <Line x1={40} y1={66} x2={360} y2={66} />
      <path d="M40 66H120V220H50a10 10 0 0 1-10-10z" style={{ fill: K.bg }} />
      <Box x={46} y={76} w={68} h={18} r={5} fill={K.glow} />
      <Txt x={52} y={88.5} size={8.5} weight={600}>{ui.downloads}</Txt>
      <Txt x={52} y={110} size={8.5} color={K.t2}>{ui.desktop}</Txt>
      <Txt x={52} y={130} size={8.5} color={K.t2}>{ui.documents}</Txt>

      <Focus x={128} y={76} w={220} h={22} n={1} />
      <SmallFolder x={136} y={80} />
      <Txt x={160} y={91} size={9} weight={600}>{ui.folderName}</Txt>
      <Txt x={160} y={113} size={7.5} color={K.t2}>{ui.folderContents}</Txt>

      <SmallZip x={139} y={124} />
      <Txt x={160} y={135} size={9} color={K.t3}>{ui.zipName}</Txt>
      <Txt x={346} y={135} size={8} weight={600} color={BAD} anchor="end">✕ {ui.notThis}</Txt>

      <Box x={212} y={188} w={62} h={22} r={6} fill={K.s1} stroke={K.b2} />
      <Txt x={243} y={202.5} size={9} color={K.t2} anchor="middle">{ui.cancel}</Txt>
      <Box x={282} y={188} w={64} h={22} r={6} fill={K.ac} />
      <Txt x={314} y={202.5} size={9} weight={600} color="#fff" anchor="middle">{ui.select}</Txt>
      <Focus x={282} y={188} w={64} h={22} n={2} />
      <Cursor x={334} y={203} />
    </Browser>
  )
}

function CardArt({ ui }: { ui: ArtLabels }) {
  return (
    <Browser h={220} url="chrome://extensions" tab={ui.extensionsTitle}>
      <ExtHeader ui={ui} />
      <ExtButtons ui={ui} />
      <Box x={14} y={138} w={200} h={70} r={8} fill={K.s2} stroke={K.b1} />
      <ExtIcon x={26} y={150} size={22} />
      <Txt x={58} y={160} size={10} weight={600}>{ui.extName}</Txt>
      <Txt x={58} y={173} size={8.5} color={K.t2}>{ui.extVersion}</Txt>
      <Txt x={26} y={198} size={8.5} weight={600} color={K.ac}>{ui.details}</Txt>
      <Txt x={84} y={198} size={8.5} weight={600} color={K.ac}>{ui.remove}</Txt>
      <Toggle x={180} y={188} />
      <Focus x={14} y={138} w={200} h={70} r={8} n={1} />

      <Box x={236} y={138} w={150} h={70} r={8} stroke={K.b2} dash="4 3" />
      <Txt x={248} y={158} size={8} color={K.t2}>{ui.errorsHint}</Txt>
      <Box x={248} y={170} w={64} h={20} r={5} fill="rgba(220,38,38,0.08)" stroke={BAD} />
      <Txt x={280} y={183.5} size={9} weight={600} color={BAD} anchor="middle">{ui.errors}</Txt>
    </Browser>
  )
}

function PinArt({ ui }: { ui: ArtLabels }) {
  return (
    <Browser h={210} url="instagram.com" tab="Instagram">
      <IgContent />
      <Focus x={336} y={37} w={18} h={18} r={5} n={1} />
      <Box x={203} y={67} w={190} h={120} r={8} fill="rgba(0,0,0,0.15)" />
      <Box x={200} y={64} w={190} h={120} r={8} fill={K.s1} stroke={K.b2} />
      <Txt x={212} y={84} size={10.5} weight={600}>{ui.extensionsTitle}</Txt>
      <Line x1={200} y1={92} x2={390} y2={92} />
      <ExtIcon x={212} y={101} />
      <Txt x={236} y={112.5} size={9}>{ui.extName}</Txt>
      <PinIcon x={355.5} y={102} />
      <Focus x={352} y={99} w={20} h={18} r={5} n={2} />
      <Cursor x={369} y={113} />
      <Line x1={200} y1={128} x2={390} y2={128} />
      <Txt x={212} y={150} size={9} weight={600} color={K.ac}>{ui.manageExtensions}</Txt>
    </Browser>
  )
}

function ReloadArt({ ui }: { ui: ArtLabels }) {
  return (
    <Browser h={180} url="instagram.com" tab="Instagram">
      <Focus x={40} y={37} w={16} h={18} r={5} n={1} />
      <Cursor x={50} y={50} />
      {[0, 1, 2, 3, 4, 5].map(i => (
        <circle key={i} cx={30 + i * 28} cy={84} r={9} style={{ fill: K.s2, stroke: K.ac, strokeWidth: 1.5, opacity: 0.8 }} />
      ))}
      <Key x={118} y={110} w={48} label="F5" />
      <Txt x={142} y={160} size={8.5} color={K.t2} anchor="middle">{ui.reloadWin}</Txt>
      <Txt x={200} y={129} size={9} color={K.t2} anchor="middle">{ui.reloadOr}</Txt>
      <Key x={234} y={110} w={60} label="⌘ R" />
      <Txt x={264} y={160} size={8.5} color={K.t2} anchor="middle">{ui.reloadMac}</Txt>
    </Browser>
  )
}

/** Uzun bir yazıyı kelime sınırından satırlara böler (SVG metni kendiliğinden kaymaz). */
function wrap(text: string, max: number): string[] {
  const lines: string[] = []
  let cur = ''
  for (const word of text.split(' ')) {
    if (cur && `${cur} ${word}`.length > max) { lines.push(cur); cur = word } else cur = cur ? `${cur} ${word}` : word
  }
  if (cur) lines.push(cur)
  return lines
}

function Para({ x, y, text, max, lh, size, color = K.t2 }: {
  x: number; y: number; text: string; max: number; lh: number; size: number; color?: string
}) {
  return (
    <text x={x} y={y} style={{ fill: color, fontSize: size }}>
      {wrap(text, max).map((l, i) => <tspan key={i} x={x} dy={i ? lh : 0}>{l}</tspan>)}
    </text>
  )
}

const POPUP_W = 230
const POPUP_H = 254

/**
 * Eklenti penceresi; frontend/extension/popup.html ile aynı düzen: başlık, kayıt anahtarı, not, durum,
 * profil, uygulama adresi ve "Uygulamayı aç". `focus` hangi parçanın kaçıncı numarayla işaretleneceğini söyler.
 */
function PopupPanel({ x, y, ui, focus }: {
  x: number; y: number; ui: ArtLabels; focus: Partial<Record<'toggle' | 'profile' | 'status', number>>
}) {
  const L = x + 14
  const R = x + POPUP_W - 14
  return (
    <g>
      <Box x={x + 3} y={y + 3} w={POPUP_W} h={POPUP_H} r={8} fill="rgba(0,0,0,0.18)" />
      <Box x={x} y={y} w={POPUP_W} h={POPUP_H} r={8} fill={K.bg} stroke={K.b2} />
      <Txt x={L} y={y + 22} size={11} weight={600}>{ui.extName}</Txt>

      <Toggle x={L} y={y + 32} />
      <Txt x={L + 32} y={y + 42.5} size={9.5} weight={500}>{ui.popupToggle}</Txt>
      {focus.toggle && <Focus x={L - 3} y={y + 29} w={186} h={20} n={focus.toggle} />}

      <Para x={L} y={y + 64} text={ui.popupNote} max={50} lh={9.5} size={7.5} />

      <Box x={L} y={y + 100} w={R - L} h={46} r={6} fill={K.s1} stroke={K.b1} />
      <circle cx={L + 11} cy={y + 112} r={3.5} style={{ fill: OK }} />
      <Txt x={L + 20} y={y + 115.5} size={9} weight={600}>{ui.popupStatus}</Txt>
      {focus.status && <Focus x={L + 4} y={y + 105} w={70} h={14} r={4} n={focus.status} />}
      <Txt x={L + 10} y={y + 129} size={7.5} color={K.t2}>{ui.popupToday}</Txt>
      <Txt x={L + 10} y={y + 139.5} size={8.5}>{ui.popupTodayValue}</Txt>
      <Txt x={L + 124} y={y + 129} size={7.5} color={K.t2}>{ui.popupLast}</Txt>
      <Txt x={L + 124} y={y + 139.5} size={8.5}>{ui.popupLastValue}</Txt>

      <Txt x={L} y={y + 166} size={8} color={K.t2}>{ui.popupProfile}</Txt>
      <Txt x={L + 32} y={y + 166} size={9.5}>{ui.popupProfileValue}</Txt>
      <Txt x={R} y={y + 166} size={9} weight={600} color={K.ac} anchor="end">{ui.popupChange}</Txt>
      {focus.profile && <Focus x={L - 3} y={y + 155} w={R - L + 6} h={15} r={5} n={focus.profile} bx={R - 2} by={y + 152} />}

      <Txt x={L} y={y + 186} size={7.5} color={K.t2}>{ui.popupAppUrl}</Txt>
      <Box x={L} y={y + 191} w={R - L} h={18} r={5} fill={K.s1} stroke={K.b1} />
      <Txt x={L + 7} y={y + 203} size={8} mono>{ui.popupAppUrlValue}</Txt>

      <Box x={L} y={y + 218} w={R - L} h={24} r={6} stroke={K.b2} />
      <Txt x={(L + R) / 2} y={y + 233.5} size={9} anchor="middle">{ui.popupOpenApp}</Txt>
    </g>
  )
}

function PopupArt({ ui }: { ui: ArtLabels }) {
  return (
    <Browser h={330} url="instagram.com" tab="Instagram" pinned>
      <IgContent w={124} />
      <Focus x={314} y={38} w={16} h={16} r={4} n={1} bx={298} by={46} />
      <PopupPanel x={160} y={64} ui={ui} focus={{ profile: 2, toggle: 3 }} />
    </Browser>
  )
}

/** Uygulamanın "Tarayıcı köprüsü" kartının başlık satırı: simge, başlık, yeşil nokta ve durum. */
function BridgeCardHead({ x, y, ui, focusN }: { x: number; y: number; ui: ArtLabels; focusN?: number }) {
  const dotX = x + 18 + ui.bridgeTitle.length * 5.5 + 8
  const statusW = 14 + ui.bridgeConnected.length * 4.8
  return (
    <g>
      <g style={{ fill: 'none', stroke: K.ac, strokeWidth: 1.3, strokeLinecap: 'round' }}>
        <rect x={x} y={y - 7} width={10} height={8} rx={2} />
        <path d={`M${x + 3} ${y - 10.5}v3.5M${x + 7} ${y - 10.5}v3.5M${x + 5} ${y + 1}v4`} />
      </g>
      <Txt x={x + 18} y={y} size={10} weight={600}>{ui.bridgeTitle}</Txt>
      <circle cx={dotX} cy={y - 3.5} r={3.5} style={{ fill: OK }} />
      <Txt x={dotX + 7} y={y} size={8.5} color={K.t2}>{ui.bridgeConnected}</Txt>
      {focusN && <Focus x={dotX - 7} y={y - 11} w={statusW} h={15} r={5} n={focusN} />}
    </g>
  )
}

function ConnectedArt({ ui }: { ui: ArtLabels }) {
  const h = 200
  return (
    <Browser h={h} url="localhost:3002/settings" tab={ui.appTab}>
      <AppSidebar h={h} active={5} />
      <Txt x={88} y={86} size={12} weight={600}>{ui.settingsHeading}</Txt>
      <Box x={88} y={98} w={296} h={90} r={8} fill={K.s2} stroke={K.b1} />
      <BridgeCardHead x={100} y={118} ui={ui} focusN={1} />
      <Txt x={118} y={136} size={8} color={K.t2}>{ui.bridgeDesc}</Txt>
      <Txt x={118} y={154} size={8.5}>{ui.bridgeFound}</Txt>
      <Box x={118} y={162} w={200} h={5} r={2.5} fill={K.b2} />
      <Box x={118} y={162} w={58} h={5} r={2.5} fill={K.ac} />
      <Txt x={118} y={180} size={8} color={K.t2}>{ui.bridgeProgress}</Txt>
    </Browser>
  )
}

/* ── Kullanım resimleri ──────────────────────────────────────────────────── */

function UseToggleArt({ ui }: { ui: ArtLabels }) {
  return (
    <g>
      <PopupPanel x={85} y={6} ui={ui} focus={{ toggle: 1, profile: 2, status: 3 }} />
    </g>
  )
}

/** Instagram profilinin üst kısmı: profil resmi, kullanıcı adı ve sayılar. */
function IgProfileHead({ ui, right = 386 }: { ui: ArtLabels; right?: number }) {
  return (
    <g>
      <circle cx={40} cy={88} r={16} style={{ fill: K.s2, stroke: K.ac, strokeWidth: 1.5 }} />
      <Txt x={66} y={85} size={10.5} weight={600}>{ui.igHandle}</Txt>
      <Txt x={66} y={101} size={8} color={K.t2}>{ui.igStats}</Txt>
      <Line x1={14} y1={113} x2={right} y2={113} />
    </g>
  )
}

/** Gönderi kutucuğu; içinde basit bir "fotoğraf" işareti. */
function Tile({ x, y, w, h, tone = 0, framed = false }: { x: number; y: number; w: number; h: number; tone?: number; framed?: boolean }) {
  const cx = x + w / 2
  const by = y + h * 0.72
  return (
    <g>
      <Box x={x} y={y} w={w} h={h} r={3} fill={framed ? K.s1 : K.s2} stroke={framed ? K.b2 : undefined} />
      <path d={`M${cx - w * 0.28} ${by}l${w * 0.17} ${-h * 0.26} ${w * 0.11} ${h * 0.14} ${w * 0.1} ${-h * 0.08} ${w * 0.18} ${h * 0.2}z`}
        style={{ fill: K.b2, opacity: 0.6 + (tone % 3) * 0.12 }} />
      <circle cx={cx + w * 0.16} cy={y + h * 0.28} r={Math.min(w, h) * 0.07} style={{ fill: K.b2 }} />
    </g>
  )
}

function UseProfileArt({ ui }: { ui: ArtLabels }) {
  const h = 250
  return (
    <Browser h={h} url={`instagram.com/${ui.igHandle}`} tab="Instagram">
      <IgProfileHead ui={ui} right={256} />
      {[0, 1].map(row => [0, 1, 2].map(col => (
        <Tile key={`${row}-${col}`} x={18 + col * 80} y={122 + row * 58} w={76} h={54} tone={row * 3 + col} />
      )))}
      {/* Kaydırma çubuğu, en altta */}
      <Box x={262} y={66} w={4} h={174} r={2} fill={K.s2} />
      <Box x={262} y={204} w={4} h={36} r={2} fill={K.t3} />

      <Txt x={330} y={84} size={9} weight={600} color={K.ac} anchor="middle">{ui.scrollToEnd}</Txt>
      <Line x1={330} y1={94} x2={330} y2={136} color={K.ac} sw={2} />
      <path d="M323 132l7 9 7-9z" style={{ fill: K.ac }} />
      <Focus x={284} y={72} w={92} h={74} n={1} />

      <Txt x={276} y={171} size={7.5} color={K.t3}>{ui.appTab}</Txt>
      <Box x={274} y={177} w={114} h={48} r={6} fill={K.s2} stroke={K.b1} />
      <Txt x={284} y={194} size={8.5} weight={600}>{ui.bridgeTitle}</Txt>
      <circle cx={288} cy={208} r={3} style={{ fill: OK }} />
      <Txt x={295} y={211} size={8}>{ui.bridgeFound}</Txt>
      <Focus x={274} y={177} w={114} h={48} n={2} bx={384} by={174} />
    </Browser>
  )
}

function UseOpenPostArt({ ui }: { ui: ArtLabels }) {
  const h = 230
  return (
    <Browser h={h} url={`instagram.com/${ui.igHandle}`} tab="Instagram">
      <IgProfileHead ui={ui} />
      {[0, 1, 2].map(col => <Tile key={col} x={18 + col * 124} y={124} w={118} h={92} tone={col} />)}
      <Focus x={142} y={124} w={118} h={92} r={3} n={1} />
      <Cursor x={206} y={166} />
      <Box x={180} y={190} w={42} h={16} r={8} fill={K.s1} op={0.9} />
      <Txt x={201} y={201.5} size={9} weight={700} color={K.ac} anchor="middle">{ui.clickHere}</Txt>
    </Browser>
  )
}

function Heart({ x, y }: { x: number; y: number }) {
  return (
    <path transform={`translate(${x} ${y})`} d="M6 10.5S0 7 0 3.3A3 3 0 0 1 6 2a3 3 0 0 1 6 1.3C12 7 6 10.5 6 10.5z"
      style={{ fill: 'none', stroke: K.t1, strokeWidth: 1.2, strokeLinejoin: 'round' }} />
  )
}

function UseLikesArt({ ui }: { ui: ArtLabels }) {
  const h = 250
  return (
    <Browser h={h} url="instagram.com/p/…" tab="Instagram">
      {/* Açık gönderi: fotoğraf ve sağında bilgiler */}
      <Box x={12} y={70} w={234} h={168} r={6} fill={K.s1} stroke={K.b1} />
      <Tile x={12} y={70} w={124} h={168} tone={1} />
      <circle cx={152} cy={84} r={6} style={{ fill: K.s2, stroke: K.ac, strokeWidth: 1.2 }} />
      <Txt x={162} y={87} size={8} weight={600}>{ui.igHandle}</Txt>
      <Line x1={136} y1={98} x2={246} y2={98} />
      {[108, 120, 132, 144].map((cy, i) => <Box key={cy} x={146} y={cy} w={i % 2 ? 66 : 86} h={5} r={2.5} fill={K.b2} />)}
      <Line x1={136} y1={168} x2={246} y2={168} />
      <Heart x={146} y={176} />
      <circle cx={170} cy={181.5} r={5} style={paint({ stroke: K.t1, sw: 1.2 })} />
      <Txt x={146} y={204} size={9} weight={700}>{ui.igLikes}</Txt>
      <Focus x={143} y={194} w={64} h={14} r={4} n={1} />
      <Cursor x={198} y={203} />

      {/* Ok ve açılan beğenenler listesi */}
      <Line x1={247} y1={150} x2={251} y2={150} color={K.ac} sw={2} />
      <path d="M250 145.5l6 4.5-6 4.5z" style={{ fill: K.ac }} />
      <Box x={261} y={73} w={130} h={166} r={8} fill="rgba(0,0,0,0.15)" />
      <Box x={258} y={70} w={130} h={166} r={8} fill={K.s1} stroke={K.b2} />
      <Txt x={323} y={86} size={9.5} weight={600} anchor="middle">{ui.igLikersTitle}</Txt>
      <Line x1={258} y1={94} x2={388} y2={94} />
      {[0, 1, 2, 3, 4].map(i => (
        <g key={i}>
          <circle cx={274} cy={108 + i * 20} r={6.5} style={{ fill: K.s2, stroke: K.b2 }} />
          <Box x={286} y={104 + i * 20} w={i % 2 ? 52 : 70} h={5} r={2.5} fill={K.b2} />
          <Box x={286} y={112 + i * 20} w={36} h={4} r={2} fill={K.b1} />
        </g>
      ))}
      <Box x={381} y={98} w={3} h={110} r={1.5} fill={K.s2} />
      <Box x={381} y={98} w={3} h={34} r={1.5} fill={K.t3} />
      <path d="M318 213l5 5 5-5" style={{ fill: 'none', stroke: K.ac, strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round' }} />
      <Txt x={323} y={230} size={8} weight={600} color={K.ac} anchor="middle">{ui.scrollList}</Txt>
      <Focus x={268} y={208} w={110} h={25} r={5} n={2} bx={380} by={205} />
    </Browser>
  )
}

function UseNextArt({ ui }: { ui: ArtLabels }) {
  const h = 240
  const linkW = Math.min(64, ui.bridgeOpenIg.length * 4)
  return (
    <Browser h={h} url="localhost:3002/cleanup" tab={ui.appTab}>
      <AppSidebar h={h} active={4} />
      <Box x={88} y={72} w={300} h={156} r={8} fill={K.s2} stroke={K.b1} />
      <BridgeCardHead x={100} y={92} ui={ui} />
      <Box x={100} y={104} w={276} h={5} r={2.5} fill={K.b2} />
      <Box x={100} y={104} w={80} h={5} r={2.5} fill={K.ac} />
      <Txt x={100} y={123} size={8} color={K.t2}>{ui.bridgeProgress}</Txt>
      <Focus x={97} y={100} w={282} h={28} r={5} n={2} bx={378} by={97} />

      <Txt x={100} y={146} size={9} weight={600}>{ui.bridgeQueue}</Txt>
      {[0, 1, 2, 3].map(i => (
        <g key={i}>
          <Tile x={100 + i * 70} y={154} w={48} h={48} tone={i} framed />
          <Txt x={100 + i * 70} y={215} size={7.5} weight={600} color={K.ac}>{ui.bridgeOpenIg}</Txt>
        </g>
      ))}
      <Focus x={98} y={206} w={linkW} h={12} r={3} n={1} bx={98 + linkW + 3} by={203} />
    </Browser>
  )
}

/* ── Güncelleme resmi ────────────────────────────────────────────────────── */

function RefreshArt({ ui }: { ui: ArtLabels }) {
  return (
    <Browser h={220} url="chrome://extensions" tab={ui.extensionsTitle}>
      <ExtHeader ui={ui} />
      <ExtButtons ui={ui} />
      <Box x={14} y={138} w={220} h={70} r={8} fill={K.s2} stroke={K.b1} />
      <ExtIcon x={26} y={150} size={22} />
      <Txt x={58} y={160} size={10} weight={600}>{ui.extName}</Txt>
      <Txt x={58} y={173} size={8.5} color={K.t2}>{ui.extVersion}</Txt>
      <Txt x={26} y={198} size={8.5} weight={600} color={K.ac}>{ui.details}</Txt>
      <Txt x={84} y={198} size={8.5} weight={600} color={K.ac}>{ui.remove}</Txt>
      {/* Yenile simgesi (yuvarlak ok) */}
      <g style={{ fill: 'none', stroke: K.t1, strokeWidth: 1.4, strokeLinecap: 'round', strokeLinejoin: 'round' }}>
        <path d="M180.5 191.5A5 5 0 1 0 182 195" />
        <path d="M181 187.5v4h-4" />
      </g>
      <Toggle x={200} y={188} />
      <Focus x={169} y={187} w={16} h={16} r={5} n={1} />
      <Cursor x={183} y={199} />
      <Txt x={250} y={198} size={9.5} weight={600} color={K.ac}>↻ = {ui.refreshHint}</Txt>
    </Browser>
  )
}

/** Uyarı sonrası: uygulamada kırmızı şerit, eklenti simgesinde kırmızı "!". */
function WarningArt({ ui }: { ui: ArtLabels }) {
  return (
    <Browser h={150} url="localhost:3002" tab={ui.appTab} pinned alert>
      <Box x={3} y={62} w={394} h={24} fill={BAD} op={0.92} />
      <circle cx={18} cy={74} r={6} style={{ fill: '#fff' }} />
      <Txt x={18} y={77.5} size={9} weight={800} color={BAD} anchor="middle">!</Txt>
      <Txt x={30} y={77.5} size={9} weight={600} color="#fff">{ui.warnBanner}</Txt>
      <Badge x={384} y={74} n={1} color={BAD} />
      <Focus x={314} y={38} w={16} h={16} r={4} n={2} color={BAD} bx={298} by={46} />
      <Box x={20} y={98} w={110} h={40} r={6} fill={K.s2} />
      <Box x={140} y={98} w={240} h={40} r={6} fill={K.s2} />
    </Browser>
  )
}

/** `crop` resmin yalnızca bir kısmını gösterir (viewBox: x, y, genişlik, yükseklik). */
const ARTS: Record<ArtId, { h: number; crop?: [number, number, number, number]; Draw: (p: { ui: ArtLabels }) => JSX.Element }> = {
  download: { h: 210, Draw: DownloadArt },
  unzip: { h: 210, Draw: UnzipArt },
  address: { h: 160, Draw: AddressArt },
  devmode: { h: 190, Draw: DevModeArt },
  loadUnpacked: { h: 210, Draw: LoadUnpackedArt },
  pickFolder: { h: 230, Draw: PickFolderArt },
  card: { h: 220, Draw: CardArt },
  pin: { h: 210, Draw: PinArt },
  reload: { h: 180, Draw: ReloadArt },
  popup: { h: 330, Draw: PopupArt },
  connected: { h: 200, Draw: ConnectedArt },
  useToggle: { h: POPUP_H + 12, Draw: UseToggleArt },
  useProfile: { h: 250, Draw: UseProfileArt },
  useOpenPost: { h: 230, Draw: UseOpenPostArt },
  useLikes: { h: 250, Draw: UseLikesArt },
  useNext: { h: 240, Draw: UseNextArt },
  // Uzantılar sayfasının yalnızca eklenti kartı; ↻ düğmesi küçük olduğu için yakından.
  refresh: { h: 220, crop: [4, 130, 330, 86], Draw: RefreshArt },
}

export const ART_IDS = Object.keys(ARTS) as ArtId[]

function Figure({ h, crop, alt, caption, children, className = '' }: {
  h: number; crop?: [number, number, number, number]; alt: string; caption: string; children: ReactNode; className?: string
}) {
  return (
    <figure className={`m-0 ${className}`}>
      <div className="rounded-lg border border-gray-800 bg-gray-950 p-2">
        <svg viewBox={crop ? crop.join(' ') : `0 0 ${W} ${h}`} role="img" aria-label={alt} className="block w-full h-auto" style={{ fontFamily: 'inherit' }}>
          {children}
        </svg>
      </div>
      <figcaption className="text-xs text-gray-500 mt-1.5 text-center">{caption}</figcaption>
    </figure>
  )
}

export function Illustration({ id, ui, alt, caption, className }: { id: ArtId; ui: ArtLabels; alt: string; caption: string; className?: string }) {
  const { h, crop, Draw } = ARTS[id]
  return <Figure h={h} crop={crop} alt={alt} caption={caption} className={className}><Draw ui={ui} /></Figure>
}

export function WarningIllustration({ ui, alt, caption, className }: { ui: ArtLabels; alt: string; caption: string; className?: string }) {
  return <Figure h={150} alt={alt} caption={caption} className={className}><WarningArt ui={ui} /></Figure>
}
