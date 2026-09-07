// Single source of truth for all design values.
// CSS color variables live in index.css; JS-side spacing/radius/type live here.

export const space = {
  1:  4,
  2:  8,
  3:  12,
  4:  16,
  5:  20,
  6:  24,
  8:  32,
  10: 40,
} as const

export const radius = {
  sm:  8,
  md:  12,
  lg:  16,
  xl:  20,
} as const

export const font = {
  xs:   10,
  sm:   11,
  base: 13,
  md:   14,
  lg:   16,
  xl:   20,
  '2xl': 24,
} as const

export const weight = {
  normal: 400,
  medium: 500,
  semi:   600,
  bold:   700,
} as const

// Palette aliases — always reference CSS vars; never hardcode hex in components.
export const color = {
  text:     'var(--text)',
  textSub:  'var(--text-2)',
  textMute: 'var(--text-3)',
  surface:  'var(--surface)',
  surface2: 'var(--surface-2)',
  border:   'var(--border)',
  border2:  'var(--border-2)',
  accent:   'var(--accent)',
  // Semantic — only for data viz, badges
  indigo:   '#818CF8',
  indigoDim: '#312E81',
  teal:     '#34D399',
  blue:     '#60A5FA',
  amber:    '#FBBF24',
  pink:     '#F472B6',
} as const

// Shared card style — import and spread into style prop
export const card = {
  background: color.surface,
  border:     `1px solid ${color.border}`,
  borderRadius: radius.lg,
  padding:    `${space[4]}px ${space[5]}px`,
} as const

export const labelStyle = {
  fontSize:      font.xs,
  fontWeight:    weight.medium,
  color:         color.textMute,
  textTransform: 'uppercase' as const,
  letterSpacing: '0.06em',
  marginBottom:  space[3],
} as const
