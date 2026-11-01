// Rehberin resimleri (kurulum, kullanım, güncelleme sekmesi). chrome:// sayfalarının ekran görüntüsü alınamadığı
// ve Instagram'ın gerçek ekranını göstermek istemediğimiz için Chrome'un ve Instagram'ın sadeleştirilmiş birer çizimi. Renkler temadan (CSS değişkenleri) gelir; açık ve koyu temada çalışır.
// Tıklanacak (ya da eklentinin tıkladığı) yer vurgu rengiyle çerçevelenir ve numaralanır. Resimlerin içindeki yazılar content.ts'teki
// `bridge.ui` alanından gelir; buradaki tek iş çizmek. Eklenti penceresi frontend/extension/popup.html'in aynısı.
import type { CSSProperties, ReactNode } from 'react'
import type { ArtId, ArtLabels, ToolId } from './content'

const v = (n: string) => `var(--${n})`
const K = {
  bg: v('bg'), s1: v('surface'), s2: v('surface-2'), b1: v('border'), b2: v('border-2'),
  t1: v('text'), t2: v('text-2'), t3: v('text-3'), ac: v('accent'), glow: v('accent-glow'),
}
const OK = '#22c55e'
const BAD = '#dc2626'
const AMBER = '#f59e0b'
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

/** Aç/kapa anahtarı. `small`: eklenti penceresindeki araç kartlarının küçük anahtarı. */
function Toggle({ x, y, on = true, small = false }: { x: number; y: number; on?: boolean; small?: boolean }) {
  const w = small ? 22 : 26
  const h = small ? 12 : 14
  const r = small ? 4.2 : 5
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={h / 2} style={{ fill: on ? K.ac : K.b2 }} />
      <circle cx={on ? x + w - h / 2 : x + h / 2} cy={y + h / 2} r={r} style={{ fill: on ? '#fff' : K.t2 }} />
    </g>
  )
}

/**
 * Uygulamanın logosu (frontend/extension/icons/icon.svg): kırmızımsı turuncu yuvarlak kare, yükselen üç beyaz
 * çubuk ve en yüksek çubuğun üstünde bir nokta. Aynı sayfada birçok resim olduğu için gradyan (id ister) yerine
 * düz renk.
 */
const LOGO = '#DD5F36'
const LOGO_INK = '#FFF7F2'
function Logo({ x, y, size = 16 }: { x: number; y: number; size?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${size / 128})`}>
      <rect width={128} height={128} rx={30} style={{ fill: LOGO }} />
      <rect x={27} y={70} width={18} height={32} rx={7} style={{ fill: LOGO_INK }} />
      <rect x={55} y={52} width={18} height={50} rx={7} style={{ fill: LOGO_INK }} />
      <rect x={83} y={34} width={18} height={68} rx={7} style={{ fill: LOGO_INK }} />
      <circle cx={92} cy={20} r={7} style={{ fill: LOGO_INK, opacity: 0.9 }} />
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

/** Simgenin üstündeki rozet: Instagram uyarısında kırmızı "!", elle kurulum gereken yeni sürümde turuncu "↑". */
type IconBadge = 'alert' | 'update'

/** Eklentinin simgesi: uygulamanın logosu. Araç çubuğunda, uzantılar listesinde ve eklenti kartında aynı. */
function ExtIcon({ x, y, size = 16, badge }: { x: number; y: number; size?: number; badge?: IconBadge }) {
  return (
    <g>
      <Logo x={x} y={y} size={size} />
      {badge && (
        <g>
          <circle cx={x + size} cy={y + 1} r={6} style={{ fill: badge === 'alert' ? BAD : AMBER, stroke: K.s1, strokeWidth: 1.5 }} />
          <text x={x + size} y={y + 4.2} textAnchor="middle" style={{ fill: '#fff', fontSize: 9, fontWeight: 800 }}>{badge === 'alert' ? '!' : '↑'}</text>
        </g>
      )}
    </g>
  )
}

function SmallFolder({ x, y }: { x: number; y: number }) {
  return <path transform={`translate(${x} ${y})`} d="M0 2a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2z" style={{ fill: FOLDER }} />
}

function SmallFile({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <path d="M0 0h8l4 4v11H0z" style={paint({ fill: K.s2, stroke: K.b2 })} />
      <path d="M8 0v4h4" style={paint({ stroke: K.b2 })} />
    </g>
  )
}

/** Dosya penceresindeki bir satır: klasör ya da dosya simgesi ve adı. `on` seçili satırı boyar. */
function FileRow({ x, y, w, name, folder = false, on = false, dim = false, bold = false }: {
  x: number; y: number; w: number; name: string; folder?: boolean; on?: boolean; dim?: boolean; bold?: boolean
}) {
  return (
    <g style={{ opacity: dim ? 0.55 : 1 }}>
      {on && <Box x={x - 4} y={y - 12} w={w} h={17} r={4} fill={K.glow} />}
      {folder ? <SmallFolder x={x} y={y - 10} /> : <SmallFile x={x + 3} y={y - 11} />}
      <Txt x={x + 23} y={y} size={8} weight={on || bold ? 600 : undefined}>{name}</Txt>
      {folder && <Txt x={x + w - 12} y={y} size={9} color={K.t3}>›</Txt>}
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
 * profil ve menü. İçerik alanı y=61'den başlar. `logoTab`: sekmede uygulamanın logosu (uygulamanın kendi sekmesi).
 */
function Browser({ h, url, tab, pinned = false, badge, logoTab = false, children }: {
  h: number; url?: string; tab: string; pinned?: boolean; badge?: IconBadge; logoTab?: boolean; children?: ReactNode
}) {
  return (
    <g>
      <Box x={2} y={2} w={396} h={h - 4} r={10} fill={K.s1} />
      <path d="M2 12a10 10 0 0 1 10-10h376a10 10 0 0 1 10 10v20H2z" style={{ fill: K.s2 }} />
      {[16, 28, 40].map(cx => <circle key={cx} cx={cx} cy={17} r={3.5} style={{ fill: K.t3 }} />)}
      <path d="M54 32V14a6 6 0 0 1 6-6h128a6 6 0 0 1 6 6v18z" style={{ fill: K.s1 }} />
      {logoTab ? <Logo x={61} y={15} size={10} /> : <circle cx={66} cy={20} r={5} style={{ fill: K.t3 }} />}
      <Txt x={76} y={23.5} size={9.5} color={K.t2}>{tab}</Txt>
      <Txt x={180} y={23.5} size={10} color={K.t3}>×</Txt>
      <Txt x={11} y={51} size={13} color={K.t3}>←</Txt>
      <Txt x={27} y={51} size={13} color={K.t3}>→</Txt>
      <Txt x={43} y={51} size={13} color={K.t3}>↻</Txt>
      <Box x={64} y={37} w={242} h={18} r={9} fill={K.s2} />
      <circle cx={76} cy={46} r={3} style={paint({ stroke: K.t3, sw: 1.1 })} />
      {url && <Txt x={86} y={49.5} size={9.5}>{url}</Txt>}
      {pinned && <ExtIcon x={314} y={38} badge={badge} />}
      <Puzzle x={338} y={38.5} />
      <circle cx={366} cy={46} r={6} style={{ fill: K.t3 }} />
      {[41, 46, 51].map(cy => <circle key={cy} cx={385} cy={cy} r={1.3} style={{ fill: K.t2 }} />)}
      <Line x1={2} y1={61} x2={398} y2={61} />
      {children}
      <Box x={2} y={2} w={396} h={h - 4} r={10} stroke={K.b2} />
    </g>
  )
}

/** InstaAnalytic'in sol menüsü (sadeleştirilmiş): üstte logo ve ad, altında menü satırları. */
function AppSidebar({ h, active }: { h: number; active: number }) {
  return (
    <g>
      <path d={`M3 62H71V${h - 3}H12a9 9 0 0 1-9-9z`} style={{ fill: K.bg }} />
      <Logo x={12} y={69} size={13} />
      <Box x={29} y={71} w={34} h={5} r={2.5} fill={K.t3} />
      <Box x={29} y={79} w={22} h={3} r={1.5} fill={K.b2} />
      {[0, 1, 2, 3, 4, 5].map(i => (
        <Box key={i} x={12} y={94 + i * 16} w={i === active ? 50 : 42} h={7} r={3.5}
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

/** Uygulamanın kurulduğu klasör, sütun görünümünde: InstaAnalytic → frontend → extension. */
function AppFolderArt({ ui }: { ui: ArtLabels }) {
  const h = 200
  const c1 = 12
  const c2 = 166
  const c3 = 282
  const row = (i: number) => 50 + i * 20
  return (
    <g>
      <Box x={2} y={2} w={396} h={h - 4} r={10} fill={K.s1} />
      <path d="M2 12a10 10 0 0 1 10-10h376a10 10 0 0 1 10 10v18H2z" style={{ fill: K.s2 }} />
      {[16, 28, 40].map(cx => <circle key={cx} cx={cx} cy={16} r={3.5} style={{ fill: K.t3 }} />)}
      <Txt x={200} y={20} size={10} weight={600} anchor="middle">{ui.appFolder}</Txt>
      <Line x1={2} y1={30} x2={398} y2={30} />
      <Line x1={c2 - 8} y1={30} x2={c2 - 8} y2={h - 2} />
      <Line x1={c3 - 8} y1={30} x2={c3 - 8} y2={h - 2} />

      {/* 1. sütun: InstaAnalytic klasörünün içi */}
      <FileRow x={c1} y={row(0)} w={142} name="backend" folder />
      <FileRow x={c1} y={row(1)} w={142} name="docs" folder />
      <FileRow x={c1} y={row(2)} w={142} name="frontend" folder on />
      <FileRow x={c1} y={row(3)} w={142} name={ui.installerFile} bold />
      <FileRow x={c1} y={row(4)} w={142} name="README.md" dim />
      <Focus x={c1 - 4} y={row(2) - 12} w={142} h={17} r={4} n={1} />
      <Txt x={c1} y={row(5) + 8} size={7.5} color={K.t2}>{ui.appFolderHint}</Txt>

      {/* 2. sütun: frontend */}
      <FileRow x={c2} y={row(0)} w={108} name="extension" folder on />
      <FileRow x={c2} y={row(1)} w={108} name="src" folder dim />
      <FileRow x={c2} y={row(2)} w={108} name="package.json" dim />
      <Focus x={c2 - 4} y={row(0) - 12} w={108} h={17} r={4} n={2} />

      {/* 3. sütun: extension */}
      <FileRow x={c3} y={row(0)} w={110} name="manifest.json" bold />
      <FileRow x={c3} y={row(1)} w={110} name="popup.html" />
      <FileRow x={c3} y={row(2)} w={110} name="popup.js" />
      <FileRow x={c3} y={row(3)} w={110} name="background.js" />
      <Txt x={c3} y={row(5) + 8} size={8.5} weight={600} color={OK}>✓ {ui.rightFolder}</Txt>
      <Box x={2} y={2} w={396} h={h - 4} r={10} stroke={K.b2} />
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

      {/* Klasör seçme penceresi, InstaAnalytic › frontend açık */}
      <Box x={42} y={47} w={320} h={176} r={10} fill="rgba(0,0,0,0.18)" />
      <Box x={40} y={44} w={320} h={176} r={10} fill={K.s1} stroke={K.b2} />
      <path d="M40 54a10 10 0 0 1 10-10h300a10 10 0 0 1 10 10v12H40z" style={{ fill: K.s2 }} />
      <Txt x={200} y={59} size={10} weight={600} anchor="middle">{ui.pickTitle}</Txt>
      <Line x1={40} y1={66} x2={360} y2={66} />
      <path d="M40 66H120V220H50a10 10 0 0 1-10-10z" style={{ fill: K.bg }} />
      <Txt x={52} y={88.5} size={8.5} color={K.t2}>{ui.desktop}</Txt>
      <Txt x={52} y={110} size={8.5} color={K.t2}>{ui.downloads}</Txt>
      <Txt x={52} y={130} size={8.5} color={K.t2}>{ui.documents}</Txt>

      <Txt x={132} y={82} size={8} color={K.t2}>{`${ui.appFolder} › frontend`}</Txt>
      <Line x1={120} y1={89} x2={360} y2={89} />

      <Focus x={128} y={96} w={220} h={32} n={1} />
      <FileRow x={136} y={110} w={212} name="extension" folder on />
      <Txt x={159} y={122} size={7.5} color={K.t2}>{ui.folderContents}</Txt>
      <FileRow x={136} y={148} w={212} name="src" folder dim />
      <FileRow x={136} y={168} w={212} name="package.json" dim />

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

/** Verilen genişliğe, verilen yazı boyunda kabaca kaç harf sığar. */
const fit = (width: number, size: number) => Math.max(8, Math.floor(width / (size * 0.53)))

function Lines({ x, y, lines, lh, size, color = K.t2, weight }: {
  x: number; y: number; lines: string[]; lh: number; size: number; color?: string; weight?: number
}) {
  return (
    <text x={x} y={y} style={{ fill: color, fontSize: size, fontWeight: weight }}>
      {lines.map((l, i) => <tspan key={i} x={x} dy={i ? lh : 0}>{l}</tspan>)}
    </text>
  )
}

function Para({ x, y, text, max, lh, size, color = K.t2 }: {
  x: number; y: number; text: string; max: number; lh: number; size: number; color?: string
}) {
  return <Lines x={x} y={y} lines={wrap(text, max)} lh={lh} size={size} color={color} />
}

/* ── Eklenti penceresi ───────────────────────────────────────────────────── */

const TOOLS: ToolId[] = ['posts', 'likers', 'comments']
/** Resimdeki Beğenenler çubuğunun doluluğu ("12 / 50 gönderi okundu"). */
const LIKERS_DONE = 12 / 50
const DESC_SIZE = 6.6
const DESC_LH = 8.5

/** Araç kartının simgesi; popup.html'deki çizimlerin aynısı (24'lük kutuda). */
function ToolIcon({ k, x, y, size, color = K.ac }: { k: ToolId; x: number; y: number; size: number; color?: string }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${size / 24})`}
      style={{ fill: 'none', stroke: color, strokeWidth: 2.2, strokeLinejoin: 'round' }}>
      {k === 'posts' && [[3, 3], [13.5, 3], [3, 13.5], [13.5, 13.5]].map(([rx, ry]) => (
        <rect key={`${rx}-${ry}`} x={rx} y={ry} width={7.5} height={7.5} rx={1.5} />
      ))}
      {k === 'likers' && <path d="M12 20.5s-7.5-4.6-7.5-10.1A4.4 4.4 0 0 1 12 7.6a4.4 4.4 0 0 1 7.5 2.8c0 5.5-7.5 10.1-7.5 10.1z" />}
      {k === 'comments' && <path d="M4 5.5h16v10H9.5L5 19.5v-4H4z" />}
    </g>
  )
}

/**
 * Bir araç kartının ölçüleri (kartın üstüne göre). Çizim ve pencere düzeni aynı hesabı kullanır.
 * `compact`: açıklamasız, düğmesiz küçük kart (Instagram resimlerinin yanındaki sonuç kutusu).
 */
function toolGeom(ui: ArtLabels, k: ToolId, w: number, compact: boolean) {
  const t = ui.popupTools[k]
  const desc = compact ? [] : wrap(t.desc, fit(w - 66, DESC_SIZE))
  const stat = compact ? wrap(t.stat, fit(w - 16, 7)) : [t.stat]
  const button = compact ? undefined : t.action
  let c = compact ? 30 : 26 + (desc.length - 1) * DESC_LH + 4
  let barY: number | undefined
  if (k === 'likers') { barY = c + 2; c = barY + 3 }
  const footY = c + 5
  const footH = button ? 15 : compact ? stat.length * 9 : 11
  return { desc, stat, button, barY, footY, h: footY + footH + 7 }
}

type ToolFocus = Partial<Record<'card' | 'button' | 'bar' | 'switch', number>>

/**
 * popup.html'deki araç kartı: simge, başlık, açıklama, kendi küçük anahtarı, sayı satırı ve iş düğmesi
 * (Gönderileri çek, Beğenenleri çek, Yorumları çek). Kapalı araç soluk görünür; bir iş çalışırken (`busy`)
 * düğmeler soluk görünür.
 */
function ToolCard({ x, y, w, k, ui, on = true, dim = false, busy = false, compact = false, focus = {}, fb }: {
  x: number; y: number; w: number; k: ToolId; ui: ArtLabels; on?: boolean; dim?: boolean; busy?: boolean; compact?: boolean
  focus?: ToolFocus; fb?: { bx: number; by: number }
}) {
  const g = toolGeom(ui, k, w, compact)
  const t = ui.popupTools[k]
  const R = x + w
  const btnW = g.button ? g.button.length * 3.9 + 14 : 0
  const statY = y + g.footY + (g.button ? 10.3 : 7.5)
  return (
    <g>
      <g style={{ opacity: dim ? 0.55 : 1 }}>
        <Box x={x} y={y} w={w} h={g.h} r={7} fill={K.s1} stroke={K.b1} />
        <Box x={x + 8} y={y + 8} w={18} h={18} r={5} fill={K.glow} />
        <ToolIcon k={k} x={x + 11} y={y + 11} size={12} />
        <Txt x={x + 32} y={y + 16.5} size={compact ? 8.5 : 9} weight={600}>{t.title}</Txt>
        {!compact && <Toggle x={R - 30} y={y + 8} on={on} small />}
        {g.desc.length > 0 && <Lines x={x + 32} y={y + 26} lines={g.desc} lh={DESC_LH} size={DESC_SIZE} />}
        {g.barY !== undefined && (
          <g>
            <Box x={x + 8} y={y + g.barY} w={w - 16} h={3} r={1.5} fill={K.b2} />
            <Box x={x + 8} y={y + g.barY} w={(w - 16) * LIKERS_DONE} h={3} r={1.5} fill={K.ac} />
          </g>
        )}
        <Lines x={x + 8} y={statY} lines={g.stat} lh={9} size={compact ? 7 : 7.5} color={K.t1} />
        {g.button && (
          <g style={{ opacity: busy ? 0.45 : 1 }}>
            <Box x={R - 8 - btnW} y={y + g.footY} w={btnW} h={15} r={4} stroke={K.b2} />
            <Txt x={R - 8 - btnW / 2} y={y + g.footY + 10.2} size={7.2} weight={500} anchor="middle">{g.button}</Txt>
          </g>
        )}
      </g>
      {focus.card && <Focus x={x} y={y} w={w} h={g.h} r={7} n={focus.card} bx={fb?.bx} by={fb?.by} />}
      {focus.button && g.button && <Focus x={R - 8 - btnW} y={y + g.footY} w={btnW} h={15} r={4} n={focus.button} />}
      {focus.bar && g.barY !== undefined && <Focus x={x + 8} y={y + g.barY} w={w - 16} h={3} r={1.5} n={focus.bar} bx={x + 1} by={y + g.barY + 1.5} />}
      {focus.switch && !compact && <Focus x={R - 30} y={y + 8} w={22} h={12} r={6} n={focus.switch} />}
    </g>
  )
}

const PW = 250
const PAD = 12
const IW = PW - 2 * PAD
/** Tek başına çizilen pencerenin yeri. */
const PX = (W - PW) / 2
const PY = 6

const JOB_H = 24

/**
 * Araçlar sekmesinin düzeni (pencerenin üstüne göre): giriş satırı, (iş çalışıyorsa) iş çubuğu, üç kart,
 * durum kutusu, alt düğme.
 */
function toolsLayout(ui: ArtLabels, job = false) {
  const lead = wrap(ui.popupLead, fit(IW, 7))
  let y = 72 + (lead.length - 1) * 9 + 9
  const jobY = job ? y : undefined
  if (job) y += JOB_H + 6
  const cards = {} as Record<ToolId, { top: number; h: number }>
  for (const k of TOOLS) {
    const { h } = toolGeom(ui, k, IW, false)
    cards[k] = { top: y, h }
    y += h + 6
  }
  const statusY = y + 2
  return { lead, jobY, cards, statusY, footerY: statusY + 42 + 10 }
}

/** Güncelleme sekmesinin düzeni. `manual`: zip kopyasının elle kurulum isteyen hâli. */
function updateLayout(manual: boolean) {
  const statusH = manual ? 44 : 26
  const checkY = 96 + statusH + 8
  return { statusH, checkY, footerY: checkY + 18 + 12 }
}

function popupH(ui: ArtLabels, tab: 'tools' | 'update', manual = false, job = false) {
  return (tab === 'tools' ? toolsLayout(ui, job).footerY : updateLayout(manual).footerY) + 22 + 10
}

type PopupFocus = Partial<Record<
  'master' | 'settingsTab' | 'updateTab' | 'status' | 'check' | 'tools' | 'postsBtn' | 'likersBtn' | 'commentsBtn'
  | 'likersBar' | 'commentsSwitch' | 'job',
  number
>>

/** Dönen işaret (iş çalışıyor). */
function Spinner({ cx, cy, r = 4.5 }: { cx: number; cy: number; r?: number }) {
  return (
    <g>
      <circle cx={cx} cy={cy} r={r} style={{ fill: 'none', stroke: K.b2, strokeWidth: 1.6 }} />
      <path d={`M${cx} ${cy - r}a${r} ${r} 0 0 1 ${r} ${r}`} style={{ fill: 'none', stroke: K.ac, strokeWidth: 1.6, strokeLinecap: 'round' }} />
    </g>
  )
}

/** Küçük, çerçeveli düğme; genişlik yazıdan hesaplanır. Sağ kenarı `right`. */
function Btn({ right, y, label, size = 7.2, h = 15, fill, color = K.t1, icon }: {
  right: number; y: number; label: string; size?: number; h?: number; fill?: string; color?: string; icon?: ToolId
}) {
  const iw = icon ? size + 3 : 0
  const w = btnWidth(label, size, !!icon)
  const x = right - w
  return (
    <g>
      <Box x={x} y={y} w={w} h={h} r={4} fill={fill ?? K.s2} stroke={K.b2} />
      {icon && <ToolIcon k={icon} x={x + 5} y={y + (h - size) / 2} size={size} color={K.t2} />}
      <Txt x={x + 5 + iw + (w - 10 - iw) / 2} y={y + h / 2 + size * 0.36} size={size} weight={500} color={color} anchor="middle">{label}</Txt>
    </g>
  )
}
/** Düğme genişliği: yazı (harf başına kabaca yarım yazı boyu), iki yanda boşluk ve varsa simge. */
const btnWidth = (label: string, size = 7.2, icon = false) => label.length * size * 0.48 + 10 + (icon ? size + 3 : 0)

/** Sekme şeridi: Araçlar, Ayarlar, Güncelleme; eşit genişlikte, etkin sekmenin altı çizili. */
function PopupTabs({ L, y, ui, active, focus }: { L: number; y: number; ui: ArtLabels; active: 'tools' | 'update'; focus: PopupFocus }) {
  const tw = IW / 3
  const tabs = [
    { key: 'tools', label: ui.popupTabTools, n: undefined },
    { key: 'settings', label: ui.popupTabSettings, n: focus.settingsTab },
    { key: 'update', label: ui.popupTabUpdate, n: focus.updateTab },
  ]
  return (
    <g>
      <Line x1={L} y1={y + 19} x2={L + IW} y2={y + 19} />
      {tabs.map((t, i) => {
        const cx = L + tw * (i + 0.5)
        const on = t.key === active
        const lw = t.label.length * 5
        return (
          <g key={t.key}>
            <Txt x={cx} y={y + 12} size={9} weight={on ? 600 : 500} color={on ? K.t1 : K.t2} anchor="middle">{t.label}</Txt>
            {on && <Box x={cx - tw * 0.4} y={y + 17.5} w={tw * 0.8} h={2.5} r={1.2} fill={K.ac} />}
            {t.n && <Focus x={cx - lw / 2 - 3} y={y + 2} w={lw + 6} h={14} r={4} n={t.n} />}
          </g>
        )
      })}
    </g>
  )
}

/**
 * Eklenti penceresi; frontend/extension/popup.html ile aynı düzen. Üstte logo, "InstaAnalytic", "Köprü vX" ve sağda
 * köprünün ana anahtarı; altında sekmeler ve sekmenin içi; en altta "Uygulamayı aç".
 * Araçlar sekmesi: giriş satırı, üç araç kartı (Gönderi listesi, Beğenenler, Yorumlar), durum kutusu.
 * Güncelleme sekmesi: sürümler, durum satırı ve "Şimdi denetle". `off`: kapatılmış araçlar (soluk).
 */
function PopupPanel({ x, y, ui, tab = 'tools', manual = false, master = true, off = [], job = false, focus = {} }: {
  x: number; y: number; ui: ArtLabels; tab?: 'tools' | 'update'; manual?: boolean; master?: boolean; off?: ToolId[]
  /** Bir iş çalışıyor: kartların üstünde iş çubuğu, düğmeler soluk. */
  job?: boolean
  focus?: PopupFocus
}) {
  const L = x + PAD
  const R = x + PW - PAD
  const H = popupH(ui, tab, manual, job)
  const toolFocus: Record<ToolId, ToolFocus> = {
    posts: { button: focus.postsBtn },
    likers: { button: focus.likersBtn, bar: focus.likersBar },
    comments: { button: focus.commentsBtn, switch: focus.commentsSwitch },
  }
  const T = tab === 'tools' ? toolsLayout(ui, job) : undefined
  const U = updateLayout(manual)
  const footerY = y + (T ? T.footerY : U.footerY)
  return (
    <g>
      <Box x={x + 3} y={y + 3} w={PW} h={H} r={8} fill="rgba(0,0,0,0.18)" />
      <Box x={x} y={y} w={PW} h={H} r={8} fill={K.bg} stroke={K.b2} />

      {/* Uygulama çubuğu */}
      <Logo x={L} y={y + 10} size={22} />
      <Txt x={L + 30} y={y + 20} size={10.5} weight={650}>{ui.popupBrand}</Txt>
      <Txt x={L + 30} y={y + 30.5} size={7.5} color={K.t3}>{`${ui.popupBridge} v${ui.popupVersionValue}`}</Txt>
      <Toggle x={R - 26} y={y + 14} on={master} />
      {focus.master && <Focus x={R - 26} y={y + 14} w={26} h={14} r={7} n={focus.master} bx={R - 34} by={y + 11} />}

      <PopupTabs L={L} y={y + 38} ui={ui} active={tab} focus={focus} />

      {T ? (
        <g>
          <Lines x={L} y={y + 72} lines={T.lead} lh={9} size={7} />
          {T.jobY !== undefined && (
            <g>
              <Box x={L} y={y + T.jobY} w={IW} h={JOB_H} r={6} fill={K.glow} stroke={K.ac} />
              <Spinner cx={L + 12} cy={y + T.jobY + JOB_H / 2} />
              <Txt x={L + 22} y={y + T.jobY + 15} size={8} weight={600}>{ui.popupJobText}</Txt>
              <Btn right={R - 5} y={y + T.jobY + 4.5} label={ui.popupJobStop} size={7.2} fill={K.s1} />
              {focus.job && <Focus x={L} y={y + T.jobY} w={IW} h={JOB_H} r={6} n={focus.job} bx={L - 3} by={y + T.jobY + 2} />}
            </g>
          )}
          {TOOLS.map(k => (
            <ToolCard key={k} x={L} y={y + T.cards[k].top} w={IW} k={k} ui={ui} busy={job}
              on={!off.includes(k)} dim={!master || off.includes(k)} focus={toolFocus[k]} />
          ))}
          {focus.tools && (
            <Focus x={L} y={y + T.cards.posts.top} w={IW} r={7} n={focus.tools}
              h={T.cards.comments.top + T.cards.comments.h - T.cards.posts.top} bx={L - 3} by={y + T.cards.posts.top + 34} />
          )}

          <Box x={L} y={y + T.statusY} w={IW} h={42} r={6} fill={K.s1} stroke={K.b1} />
          <circle cx={L + 11} cy={y + T.statusY + 12} r={3.5} style={{ fill: master ? OK : K.t3 }} />
          <Txt x={L + 20} y={y + T.statusY + 15.5} size={master ? 9 : 8} weight={600}>{master ? ui.popupStatus : ui.popupOff}</Txt>
          {focus.status && <Focus x={L + 4} y={y + T.statusY + 5} w={66} h={13} r={4} n={focus.status} />}
          <Txt x={L + 10} y={y + T.statusY + 29} size={7} color={K.t2}>{ui.popupToday}</Txt>
          <Txt x={L + 10} y={y + T.statusY + 38.5} size={8}>{ui.popupTodayValue}</Txt>
          <Txt x={L + 110} y={y + T.statusY + 29} size={7} color={K.t2}>{ui.popupLast}</Txt>
          <Txt x={L + 110} y={y + T.statusY + 38.5} size={8}>{ui.popupLastValue}</Txt>
        </g>
      ) : (
        <g>
          <Txt x={L} y={y + 74} size={7} color={K.t2}>{ui.popupInstalled}</Txt>
          <Txt x={L} y={y + 86} size={9} weight={600}>{ui.popupVersionValue}</Txt>
          <Txt x={L + 58} y={y + 74} size={7} color={K.t2}>{ui.popupAppVersion}</Txt>
          <Txt x={L + 58} y={y + 86} size={9} weight={600}>{manual ? ui.popupNewVersionValue : ui.popupVersionValue}</Txt>
          <Txt x={L + 144} y={y + 74} size={7} color={K.t2}>{ui.popupLastCheck}</Txt>
          <Txt x={L + 144} y={y + 86} size={9} weight={600}>{ui.popupLastCheckValue}</Txt>

          <Box x={L} y={y + 96} w={IW} h={U.statusH} r={6} fill={K.s1} stroke={manual ? AMBER : K.b1} />
          <circle cx={L + 11} cy={y + 109} r={3.5} style={{ fill: manual ? AMBER : OK }} />
          <Txt x={L + 20} y={y + 112} size={manual ? 8 : 9} weight={600}>{manual ? ui.popupManual : ui.popupUpToDate}</Txt>
          {manual && <Para x={L + 20} y={y + 124} text={ui.popupManualNote} max={fit(IW - 28, 7.5)} lh={9} size={7.5} />}
          {focus.status && (
            <Focus x={L} y={y + 96} w={IW} h={U.statusH} r={6} n={focus.status} bx={R + 3} by={y + 96 + U.statusH + 3} />
          )}

          <Box x={L} y={y + U.checkY} w={IW} h={18} r={5} stroke={K.b2} />
          <Txt x={(L + R) / 2} y={y + U.checkY + 12.3} size={8.5} weight={500} anchor="middle">{ui.popupCheckNow}</Txt>
          {focus.check && <Focus x={L} y={y + U.checkY} w={IW} h={18} r={5} n={focus.check} />}
        </g>
      )}

      <Box x={L} y={footerY} w={IW} h={22} r={5} fill={K.ac} />
      <Txt x={(L + R) / 2} y={footerY + 14.5} size={9} weight={600} color="#fff" anchor="middle">{ui.popupOpenApp}</Txt>
    </g>
  )
}

/** Kurulum: Instagram sekmesi açıkken araç çubuğundaki simgeye tıklanınca açılan pencere. */
function PopupArt({ ui }: { ui: ArtLabels }) {
  return (
    <Browser h={64 + popupH(ui, 'tools') + 12} url="instagram.com" tab="Instagram" pinned>
      <IgContent w={104} />
      <Focus x={314} y={38} w={16} h={16} r={4} n={1} bx={298} by={46} />
      <PopupPanel x={140} y={64} ui={ui} focus={{ master: 2, settingsTab: 3 }} />
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
    <Browser h={h} url="localhost:3002/settings" tab={ui.appTab} logoTab>
      <AppSidebar h={h} active={5} />
      <Txt x={88} y={86} size={12} weight={600}>{ui.settingsHeading}</Txt>
      <Box x={88} y={98} w={296} h={90} r={8} fill={K.s2} stroke={K.b1} />
      <BridgeCardHead x={100} y={118} ui={ui} focusN={1} />
      <Txt x={118} y={136} size={8} color={K.t2}>{ui.bridgeDesc}</Txt>
      <Txt x={118} y={154} size={8.5}>{ui.bridgeFound}</Txt>
      <Box x={118} y={162} w={200} h={5} r={2.5} fill={K.b2} />
      <Box x={118} y={162} w={200 * LIKERS_DONE} h={5} r={2.5} fill={K.ac} />
      <Txt x={118} y={180} size={8} color={K.t2}>{ui.bridgeProgress}</Txt>
    </Browser>
  )
}

/* ── Kullanım resimleri ──────────────────────────────────────────────────── */

/** Eklenti penceresinden iş başlatmak: her kartta iş düğmesi; üstte çalışan işin çubuğu ve "Durdur". */
function PopupJobsArt({ ui }: { ui: ArtLabels }) {
  return <PopupPanel x={PX} y={PY} ui={ui} job focus={{ postsBtn: 1, likersBtn: 2, commentsBtn: 3, job: 4 }} />
}

/** Uygulamanın Gönderiler sayfası: başlığın sağında üç iş düğmesi, altında çalışan işin kutusu. */
function AppJobsArt({ ui }: { ui: ArtLabels }) {
  const h = 250
  const right = 386
  const size = 6.1
  const order: ToolId[] = ['posts', 'likers', 'comments']
  // Düğmeler sağdan sola dizilir
  const rights: number[] = []
  let r = right
  for (const k of [...order].reverse()) { rights.unshift(r); r -= btnWidth(ui.appRun[k], size, true) + 4 }
  const btnsLeft = r + 4
  const boxY = 100
  const note = wrap(ui.appJobNote, fit(right - 96, 6.4))
  const boxH = 44 + note.length * 8.5
  const stopW = btnWidth(ui.appStop, 7)
  const tilesY = boxY + boxH + 10
  return (
    <Browser h={h} url="localhost:3002/posts" tab={ui.appTab} logoTab pinned>
      <AppSidebar h={h} active={2} />
      <Txt x={84} y={84} size={9.5} weight={700}>{ui.appPostsTitle}</Txt>
      {order.map((k, i) => <Btn key={k} right={rights[i]} y={72} label={ui.appRun[k]} size={size} h={17} icon={k} />)}
      <Focus x={btnsLeft} y={72} w={right - btnsLeft} h={17} r={4} n={1} bx={btnsLeft - 3} by={69} />

      {/* İş kutusu: yazı, ilerleme çubuğu, "Durdur" ve kısa not */}
      <Box x={84} y={boxY} w={right - 84} h={boxH} r={7} fill={K.s1} stroke={K.ac} />
      <Spinner cx={96} cy={boxY + 13} r={4} />
      <Txt x={105} y={boxY + 16} size={8.5} weight={600} color={K.ac}>{ui.appJobMsg}</Txt>
      <Focus x={89} y={boxY + 5} w={ui.appJobMsg.length * 4.6 + 22} h={15} r={4} n={2} />
      <Btn right={right - 8} y={boxY + 5} label={ui.appStop} size={7} fill={K.s2} />
      <Focus x={right - 8 - stopW} y={boxY + 5} w={stopW} h={15} r={4} n={3} />
      <Box x={94} y={boxY + 27} w={right - 104} h={4} r={2} fill={K.b2} />
      <Box x={94} y={boxY + 27} w={(right - 104) * (3 / 12)} h={4} r={2} fill={K.ac} />
      <Lines x={94} y={boxY + 44} lines={note} lh={8.5} size={6.4} color={K.t3} />

      {/* Gönderi kutucukları */}
      {[0, 1, 2].map(col => (
        <Tile key={col} x={84 + col * 102} y={tilesY} w={98} h={h - tilesY - 10} tone={col} framed />
      ))}
    </Browser>
  )
}

/** Gönderiler sayfasında bir gönderiye tıklanınca açılan panel: yalnızca bu gönderi için iki düğme. */
function PostDetailArt({ ui }: { ui: ArtLabels }) {
  const h = 230
  const x0 = 10
  const x1 = 390
  const size = 6.3
  const closeX = x1 - 14
  const cRight = closeX - 10
  const cW = btnWidth(ui.appRunCommentsOne, size, true)
  const lRight = cRight - cW - 4
  const lW = btnWidth(ui.appRunLikersOne, size, true)
  const py = 74
  return (
    <Browser h={h} url="localhost:3002/posts" tab={ui.appTab} logoTab>
      <AppSidebar h={h} active={2} />
      <path d={`M2 62H398V${h - 12}a10 10 0 0 1-10 10H12a10 10 0 0 1-10-10z`} style={{ fill: 'rgba(0,0,0,0.45)' }} />
      <Box x={x0} y={py - 6} w={x1 - x0} h={h - py - 6} r={8} fill={K.s1} stroke={K.b2} />

      {/* Üst satır: sayılar, "Instagram'da aç", iki düğme ve kapat */}
      <Heart x={x0 + 10} y={py + 4} />
      <Txt x={x0 + 26} y={py + 13} size={8} weight={600}>214</Txt>
      <path transform={`translate(${x0 + 46} ${py + 4})`} d="M1 1.5h10v6H4.5L2 10V7.5H1z" style={paint({ stroke: K.t1, sw: 1.1 })} />
      <Txt x={x0 + 60} y={py + 13} size={8} weight={600}>9</Txt>
      <Txt x={x0 + 72} y={py + 13} size={6.6} color={K.ac}>{ui.appOpenIg}</Txt>
      <Btn right={lRight} y={py + 2} label={ui.appRunLikersOne} size={size} icon="likers" />
      <Btn right={cRight} y={py + 2} label={ui.appRunCommentsOne} size={size} icon="comments" />
      <Focus x={lRight - lW} y={py + 2} w={lW} h={15} r={4} n={1} bx={lRight - lW + 4} by={py - 1} />
      <Focus x={cRight - cW} y={py + 2} w={cW} h={15} r={4} n={2} />
      <Txt x={closeX + 4} y={py + 13} size={10} color={K.t3} anchor="middle">×</Txt>
      <Line x1={x0} y1={py + 24} x2={x1} y2={py + 24} />

      {/* Açıklama, sekmeler ve liste */}
      <Box x={x0 + 12} y={py + 32} w={220} h={5} r={2.5} fill={K.b2} />
      <Box x={x0 + 12} y={py + 41} w={160} h={5} r={2.5} fill={K.b2} />
      <Line x1={x0} y1={py + 54} x2={x1} y2={py + 54} />
      <Txt x={x0 + (x1 - x0) / 4} y={py + 68} size={8} weight={600} anchor="middle">{ui.appLikesTab}</Txt>
      <Box x={x0 + 20} y={py + 74} w={(x1 - x0) / 2 - 40} h={2} r={1} fill={K.ac} />
      <Txt x={x0 + (3 * (x1 - x0)) / 4} y={py + 68} size={8} color={K.t2} anchor="middle">{ui.appCommentsTab}</Txt>
      <Line x1={x0} y1={py + 76} x2={x1} y2={py + 76} />
      {[0, 1, 2].map(i => (
        <g key={i}>
          <circle cx={x0 + 22} cy={py + 92 + i * 20} r={6.5} style={{ fill: K.s2, stroke: K.b2 }} />
          <Box x={x0 + 34} y={py + 87 + i * 20} w={i % 2 ? 60 : 84} h={5} r={2.5} fill={K.b2} />
          <Box x={x0 + 34} y={py + 95 + i * 20} w={44} h={4} r={2} fill={K.b1} />
        </g>
      ))}
    </Browser>
  )
}

/** Bir aracı kapatmak: Yorumlar kapalı ve soluk; ana anahtar hepsini birden kapatır. */
function ToolOffArt({ ui }: { ui: ArtLabels }) {
  return <PopupPanel x={PX} y={PY} ui={ui} off={['comments']} focus={{ commentsSwitch: 1, master: 2 }} />
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

/** Profil sona kadar kaydırılır; eklentinin Gönderi listesi kartında "N gönderi bulundu". */
function UseProfileArt({ ui }: { ui: ArtLabels }) {
  const h = 250
  return (
    <Browser h={h} url={`instagram.com/${ui.igHandle}`} tab="Instagram" pinned>
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

      <Txt x={274} y={172} size={7.5} color={K.t3}>{ui.extName}</Txt>
      <ToolCard x={272} y={178} w={116} k="posts" ui={ui} compact focus={{ card: 2 }} fb={{ bx: 384, by: 175 }} />
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

/** Yorumlar: eklenti gönderiyi açar, "daha fazla yorum"a basar; eklentinin Yorumlar kartında sayı artar. */
function CommentsArt({ ui }: { ui: ArtLabels }) {
  const h = 230
  return (
    <Browser h={h} url="instagram.com/p/…" tab="Instagram" pinned>
      <Box x={12} y={70} w={234} h={148} r={6} fill={K.s1} stroke={K.b1} />
      <Tile x={12} y={70} w={110} h={148} tone={2} />
      <circle cx={136} cy={84} r={6} style={{ fill: K.s2, stroke: K.ac, strokeWidth: 1.2 }} />
      <Txt x={146} y={87} size={8} weight={600}>{ui.igHandle}</Txt>
      <Line x1={122} y1={96} x2={246} y2={96} />
      {[0, 1, 2].map(i => (
        <g key={i}>
          <circle cx={136} cy={112 + i * 20} r={5.5} style={{ fill: K.s2, stroke: K.b2 }} />
          <Box x={146} y={107 + i * 20} w={28} h={4.5} r={2.2} fill={K.t3} />
          <Box x={178} y={107 + i * 20} w={i % 2 ? 40 : 56} h={4.5} r={2.2} fill={K.b2} />
          <Box x={146} y={115 + i * 20} w={i % 2 ? 60 : 44} h={4} r={2} fill={K.b1} />
        </g>
      ))}
      <Focus x={128} y={103} w={112} h={58} r={5} n={1} />
      {/* "Daha fazla yorum yükle": yuvarlak içinde artı */}
      <circle cx={136} cy={177} r={6} style={paint({ stroke: K.t1, sw: 1.2 })} />
      <path d="M133 177h6M136 174v6" style={{ stroke: K.t1, strokeWidth: 1.2, strokeLinecap: 'round' }} />
      <Txt x={146} y={179.5} size={6.6} color={K.t2}>{ui.igMoreComments}</Txt>
      <Focus x={128} y={169} w={112} h={16} r={5} n={2} bx={240} by={185} />
      <Line x1={122} y1={192} x2={246} y2={192} />
      <Heart x={132} y={199} />
      <circle cx={156} cy={204.5} r={5} style={paint({ stroke: K.t1, sw: 1.2 })} />

      <Line x1={247} y1={150} x2={251} y2={150} color={K.ac} sw={2} />
      <path d="M250 145.5l6 4.5-6 4.5z" style={{ fill: K.ac }} />
      <Txt x={260} y={116} size={7.5} color={K.t3}>{ui.extName}</Txt>
      <ToolCard x={258} y={122} w={132} k="comments" ui={ui} compact focus={{ card: 3 }} fb={{ bx: 386, by: 119 }} />
    </Browser>
  )
}

/* ── Güncelleme resimleri ────────────────────────────────────────────────── */

/** Güncelleme sekmesi, olağan hâli: iki sürüm aynı, "Güncel". */
function UpdateTabArt({ ui }: { ui: ArtLabels }) {
  return <PopupPanel x={PX} y={PY} ui={ui} tab="update" focus={{ updateTab: 1, check: 2 }} />
}

/** Zip kopyası: simgede turuncu "↑", Güncelleme sekmesinde elle kurulum uyarısı. */
function UpdateManualArt({ ui }: { ui: ArtLabels }) {
  return (
    <Browser h={64 + popupH(ui, 'update', true) + 12} url="instagram.com" tab="Instagram" pinned badge="update">
      <IgContent w={104} />
      {/* Çerçeve simgenin köşesindeki turuncu "↑"yü de içine alsın */}
      <Focus x={313} y={32} w={25} h={24} r={5} n={1} bx={298} by={46} />
      <PopupPanel x={140} y={64} ui={ui} tab="update" manual focus={{ status: 2 }} />
    </Browser>
  )
}

const WARN_H = 160

/** Uyarı sonrası: uygulamada kırmızı şerit (ara önerisi, hiçbir şey durdurulmadı), eklenti simgesinde kırmızı "!". */
function WarningArt({ ui }: { ui: ArtLabels }) {
  const title = wrap(ui.warnBanner, fit(370, 7.2)).slice(0, 2)
  const bannerH = 26 + title.length * 9
  return (
    <Browser h={WARN_H} url="localhost:3002" tab={ui.appTab} pinned badge="alert" logoTab>
      <Box x={3} y={62} w={394} h={bannerH} fill={BAD} op={0.92} />
      <circle cx={18} cy={75} r={6} style={{ fill: '#fff' }} />
      <Txt x={18} y={78.5} size={9} weight={800} color={BAD} anchor="middle">!</Txt>
      <Lines x={30} y={77} lines={title} lh={9} size={7.2} weight={600} color="#fff" />
      <Txt x={30} y={77 + title.length * 9 + 1} size={7} color="#fff">{ui.warnBannerTodo}</Txt>
      <Badge x={384} y={74} n={1} color={BAD} />
      <Focus x={314} y={38} w={16} h={16} r={4} n={2} color={BAD} bx={298} by={46} />
      <Box x={20} y={62 + bannerH + 12} w={110} h={36} r={6} fill={K.s2} />
      <Box x={140} y={62 + bannerH + 12} w={240} h={36} r={6} fill={K.s2} />
    </Browser>
  )
}

/** viewBox: x, y, genişlik, yükseklik. */
type Crop = [number, number, number, number]
type Size<T> = T | ((ui: ArtLabels) => T)
const sized = <T,>(s: Size<T>, ui: ArtLabels): T => (typeof s === 'function' ? (s as (ui: ArtLabels) => T)(ui) : s)

/**
 * `h` resmin yüksekliği, `crop` resmin yalnızca bir kısmını gösterir. Eklenti penceresinin boyu içindeki yazılara
 * göre hesaplandığı için ikisi de etiketlerden hesaplanabilir.
 */
const ARTS: Record<ArtId, { h: Size<number>; crop?: Size<Crop>; Draw: (p: { ui: ArtLabels }) => JSX.Element }> = {
  appFolder: { h: 200, Draw: AppFolderArt },
  address: { h: 160, Draw: AddressArt },
  devmode: { h: 190, Draw: DevModeArt },
  loadUnpacked: { h: 210, Draw: LoadUnpackedArt },
  pickFolder: { h: 230, Draw: PickFolderArt },
  card: { h: 220, Draw: CardArt },
  pin: { h: 210, Draw: PinArt },
  reload: { h: 180, Draw: ReloadArt },
  popup: { h: ui => 64 + popupH(ui, 'tools') + 12, Draw: PopupArt },
  connected: { h: 200, Draw: ConnectedArt },
  appJobs: { h: 250, Draw: AppJobsArt },
  postDetail: { h: 230, Draw: PostDetailArt },
  popupJobs: { h: ui => popupH(ui, 'tools', false, true) + 12, Draw: PopupJobsArt },
  useProfile: { h: 250, Draw: UseProfileArt },
  useLikes: { h: 250, Draw: UseLikesArt },
  comments: { h: 230, Draw: CommentsArt },
  toolOff: { h: ui => popupH(ui, 'tools') + 12, Draw: ToolOffArt },
  updateTab: { h: ui => popupH(ui, 'update') + 12, Draw: UpdateTabArt },
  updateManual: { h: ui => 64 + popupH(ui, 'update', true) + 12, Draw: UpdateManualArt },
}

export const ART_IDS = Object.keys(ARTS) as ArtId[]

function Figure({ h, crop, alt, caption, children, className = '' }: {
  h: number; crop?: Crop; alt: string; caption: string; children: ReactNode; className?: string
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
  return (
    <Figure h={sized(h, ui)} crop={crop && sized(crop, ui)} alt={alt} caption={caption} className={className}>
      <Draw ui={ui} />
    </Figure>
  )
}

export function WarningIllustration({ ui, alt, caption, className }: { ui: ArtLabels; alt: string; caption: string; className?: string }) {
  return <Figure h={WARN_H} alt={alt} caption={caption} className={className}><WarningArt ui={ui} /></Figure>
}
