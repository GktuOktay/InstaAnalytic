import { z } from 'zod'
import api from './client'

/**
 * Kaydedilenleri temizleme API istemcisi (SPEC-001 §7.8, §7.9). Sunucudan gelen her yanıt Zod ile doğrulanır;
 * tipler şemalardan türetilir. Hata gövdesi §7.9.1 zarfıdır: yalnız `code` metne çevrilir (i18n `cleanup.reason`).
 */

/* ── Kod kayıtları (§7.9; AC-U26: i18n.test.ts bunları okur) ─────────────────────── */

export const HTTP_ERROR_CODES = [
  'feature_off', 'session_not_found', 'not_found',
  'account_mismatch', 'viewer_unknown', 'extension_outdated', 'scan_running', 'scan_closed', 'page_out_of_order',
  'page_cap', 'no_scan', 'scan_stale', 'scan_mismatch', 'batch_active', 'plan_changed', 'not_draft', 'not_now',
  'not_startable', 'collections_closed', 'collections_unavailable', 'extension_update_required',
  'expired', 'unsupported_media_type',
  'invalid', 'invalid_selection', 'count_mismatch', 'ack_required', 'not_available',
  'scan_too_soon',
] as const

export const GATE_STATES = ['ready', 'off', 'paused', 'quiet_hours', 'limit'] as const
export const NEXT_EXTRA_REASONS = ['empty', 'stopped'] as const
export const PRECHECK_REASONS = ['off', 'paused', 'quiet_hours', 'limit', 'not_pending', 'stopped', 'too_soon', 'protected'] as const
export const STOP_REASONS = [
  'user_stop', 'limit', 'quiet_hours', 'off', 'paused', 'blocked', 'rate_limited', 'circuit_breaker',
  'account_mismatch', 'extension_outdated', 'login_required', 'tokens_missing', 'mutation_unrecognised',
  'already_streak', 'tab_closed', 'stale', 'start_failed', 'read_limit',
] as const
/** Tarama hatası ve öğe notu olarak metni olan kodlar (§7.9.5). */
export const NOTE_CODES = ['network', 'unrecognised_shape', 'in_collection', 'collections_unavailable'] as const

export const CLEANUP_CODES: readonly string[] = Array.from(new Set<string>([
  ...HTTP_ERROR_CODES, ...GATE_STATES, ...NEXT_EXTRA_REASONS, ...PRECHECK_REASONS, ...STOP_REASONS, ...NOTE_CODES,
]))

/* ── Şemalar ─────────────────────────────────────────────────────────────────── */

const ts = z.string().nullable()

export const settingsSchema = z.object({
  saved: z.object({
    enabled: z.boolean(),
    enabled_at: ts.optional(),
    collection_choice_available: z.boolean(),
  }),
  account: z.object({
    hourly: z.number(), daily: z.number(), worst_case: z.object({ hourly: z.number(), daily: z.number() }),
  }).optional(),
})
export type CleanupSettings = z.infer<typeof settingsSchema>

const dict = z.record(z.string(), z.unknown())
export const limitsSchema = z.object({
  source: z.string(),
  code: z.string().nullable().optional(),
  path: z.string(),
  loaded_at: ts,
  changed_at: ts,
  sha256: ts,
  warnings: z.array(z.object({
    key: z.string(), code: z.string(), value: z.number().optional(), used: z.union([z.number(), z.boolean()]).optional(),
  })),
  unknown_count: z.number().optional(),
  hard_caps: z.record(z.string(), z.array(z.number())),
  effective: dict,
  follow_limits_managed_here: z.boolean(),
})
export type CleanupLimits = z.infer<typeof limitsSchema>

export const activeBatchSchema = z.object({
  id: z.number(),
  status: z.string(),
  last_stop_reason: z.string().nullable(),
  run_seq: z.number(),
  total: z.number(),
  done: z.number(),
  already: z.number(),
  not_found: z.number(),
  protected: z.number(),
  failed: z.number(),
  cancelled: z.number(),
  pending: z.number(),
  requires_ext_above: z.string().nullable(),
})
export type ActiveBatch = z.infer<typeof activeBatchSchema>

export const scanViewSchema = z.object({
  id: z.number(),
  status: z.string(),
  started_at: z.string(),
  finished_at: ts,
  items: z.number(),
  partial: z.boolean(),
  stale: z.boolean(),
  collections_mode: z.string().nullable().optional(),
  note_code: z.string().nullable().optional(),
})
export type ScanView = z.infer<typeof scanViewSchema>

export const statusSchema = z.object({
  saved: z.object({
    enabled: z.boolean(),
    run_state: z.string(),
    next_allowed_at: ts,
    quiet_hours: z.boolean(),
    done_hour: z.number(),
    done_day: z.number(),
    hourly_limit: z.number(),
    daily_limit: z.number(),
    delay: z.array(z.number()),
    active_batch: activeBatchSchema.nullable(),
    paused_until: ts,
    paused_reason: ts,
    last_scan: scanViewSchema.nullable(),
    limits_source: z.string().optional(),
  }),
})
export type CleanupStatus = z.infer<typeof statusSchema>['saved']

export const inventoryItemSchema = z.object({
  ref: z.string(),
  shortcode: z.string(),
  owner_username: z.string().nullable(),
  media_type: z.string().nullable(),
  is_ad: z.boolean(),
  thumbnail_url: z.string().nullable(),
  collections: z.array(z.object({ collection_id: z.string(), name: z.string().nullable(), protected: z.boolean() })),
  position: z.number(),
  state: z.enum(['available', 'queued', 'done', 'already', 'not_found', 'protected']),
})
export type InventoryItem = z.infer<typeof inventoryItemSchema>

export const inventorySchema = z.object({
  scan: scanViewSchema.pick({ id: true, status: true, started_at: true, finished_at: true, items: true, partial: true, stale: true })
    .extend({ collections_mode: z.string().nullable().optional() }).nullable(),
  total: z.number(),
  protected_total: z.number(),
  items: z.array(inventoryItemSchema),
})
export type Inventory = z.infer<typeof inventorySchema>

export const previewSchema = z.object({
  batch_id: z.number().nullable(),
  item_count: z.number(),
  unknown_refs: z.number(),
  excluded: z.number(),
  excluded_protected: z.number(),
  in_unprotected_collections: z.number(),
  truncated: z.boolean(),
  remaining: z.number(),
  expires_at: ts,
  estimate: z.object({ hourly: z.number(), daily: z.number(), days: z.number(), starts: z.number() }),
})
export type Preview = z.infer<typeof previewSchema>

export const batchItemsSchema = z.object({
  total: z.number(),
  items: z.array(z.object({
    ref: z.string(),
    label: z.string().nullable(),
    status: z.string(),
    shortcode: z.string().nullable(),
    thumbnail_url: z.string().nullable(),
    collections: z.array(z.object({ name: z.string(), id_suffix: z.string().nullable() })),
  })),
})
export type BatchItems = z.infer<typeof batchItemsSchema>

/** `GET saved/collections` (AC-S22): `mode` null = envanter taraması yok; `id_suffix` yalnız aynı adlı satırlarda dolu. */
export const collectionRowSchema = z.object({
  collection_id: z.string(),
  name: z.string(),
  id_suffix: z.string().nullable(),
  protected: z.boolean(),
  in_last_scan: z.boolean(),
  is_new: z.boolean(),
  post_count: z.number(),
})
export type CollectionRow = z.infer<typeof collectionRowSchema>
export const collectionsSchema = z.object({
  mode: z.string().nullable(),
  scan_id: z.number().nullable(),
  items: z.array(collectionRowSchema),
})
export type Collections = z.infer<typeof collectionsSchema>
export const collectionProtectSchema = z.object({ collection_id: z.string(), protected: z.boolean() })

export const confirmSchema = z.object({ batch_id: z.number(), status: z.string(), queued: z.number() })
export const startSchema = z.object({ batch_id: z.number(), status: z.string(), run_seq: z.number(), started_at: ts })
export type StartReply = z.infer<typeof startSchema>
export const stopSchema = z.object({ batch_id: z.number(), status: z.string(), last_stop_reason: ts, applied: z.boolean() })
export const cancelSchema = z.object({ cancelled: z.boolean(), status: z.string() })

export const historySchema = z.object({
  counts: z.record(z.string(), z.number()),
  items: z.array(z.object({
    id: z.number(), action: z.string(), label: ts, status: z.string(), attempts: z.number(),
    note_code: ts, created_at: z.string(), done_at: ts,
  })),
})
export type History = z.infer<typeof historySchema>

/* ── Seçim gövdeleri (§4.4) ─────────────────────────────────────────────────── */

export interface InventoryFilter { q?: string; media_type?: 'image' | 'video' | 'carousel' | 'ad' }
export type PreviewSelection =
  | { scan_id: number; select: 'refs'; refs: string[] }
  | { scan_id: number; select: 'filter'; filter: InventoryFilter; exclude_refs: string[] }

/* ── Hata zarfı (§7.9.1) ───────────────────────────────────────────────────── */

export interface CleanupError {
  status: number | null
  code: string | null
  reason?: string
  next_allowed_at?: string
  retry_after?: number
}

/** Axios hatasından §7.9.1 zarfını çıkarır; zarf yoksa `code=null` (ağ hatası, çökmüş sunucu). */
export function cleanupError(e: unknown): CleanupError {
  const r = (e as { response?: { status?: unknown; data?: unknown } } | null)?.response
  const status = typeof r?.status === 'number' ? r.status : null
  const detail = (r?.data as { detail?: unknown } | undefined)?.detail
  if (detail && typeof detail === 'object') {
    const d = detail as Record<string, unknown>
    return {
      status,
      code: typeof d.code === 'string' ? d.code : null,
      reason: typeof d.reason === 'string' ? d.reason : undefined,
      next_allowed_at: typeof d.next_allowed_at === 'string' ? d.next_allowed_at : undefined,
      retry_after: typeof d.retry_after === 'number' ? d.retry_after : undefined,
    }
  }
  return { status, code: null }
}

/* ── Uçlar ──────────────────────────────────────────────────────────────────── */

const base = (id: string) => `/sessions/${id}/cleanup`
const saved = (id: string) => `${base(id)}/saved`

export const cleanupApi = {
  settings: (id: string) => api.get(`${base(id)}/settings`).then(r => settingsSchema.parse(r.data)),
  setEnabled: (id: string, enabled: boolean, ackIrreversible?: boolean) =>
    api.put(`${base(id)}/settings`, { saved_enabled: enabled, ...(ackIrreversible !== undefined ? { ack_irreversible: ackIrreversible } : {}) })
      .then(r => settingsSchema.parse(r.data)),
  limits: () => api.get('/cleanup/limits').then(r => limitsSchema.parse(r.data)),
  status: (id: string) => api.get(`${base(id)}/status`).then(r => statusSchema.parse(r.data).saved),
  inventory: (id: string, p: { q?: string; media_type?: string; limit?: number; offset?: number }) =>
    api.get(`${saved(id)}/inventory`, { params: p }).then(r => inventorySchema.parse(r.data)),
  collections: (id: string) => api.get(`${saved(id)}/collections`).then(r => collectionsSchema.parse(r.data)),
  /** `protected=false` için `ack_shared_risk=true` zorunlu (AC-S22); korumaya almak diyaloğsuzdur. */
  setCollectionProtected: (id: string, collectionId: string, isProtected: boolean) =>
    api.put(`${saved(id)}/collections/${encodeURIComponent(collectionId)}`,
      isProtected ? { protected: true } : { protected: false, ack_shared_risk: true })
      .then(r => collectionProtectSchema.parse(r.data)),
  preview: (id: string, body: PreviewSelection) =>
    api.post(`${saved(id)}/preview`, body).then(r => previewSchema.parse(r.data)),
  batchItems: (id: string, batchId: number, limit = 50, offset = 0) =>
    api.get(`${base(id)}/batches/${batchId}/items`, { params: { limit, offset } }).then(r => batchItemsSchema.parse(r.data)),
  confirm: (id: string, batchId: number, confirmCount: number) =>
    api.post(`${base(id)}/batches/${batchId}/confirm`, { confirm_count: confirmCount }).then(r => confirmSchema.parse(r.data)),
  start: (id: string, batchId: number, extVersion: string | null) =>
    api.post(`${base(id)}/batches/${batchId}/start`, extVersion ? { ext_version: extVersion } : {}).then(r => startSchema.parse(r.data)),
  stop: (id: string, batchId: number, body: { reason: 'user_stop' } | { reason: 'start_failed'; run_seq: number }) =>
    api.post(`${base(id)}/batches/${batchId}/stop`, body).then(r => stopSchema.parse(r.data)),
  cancel: (id: string, batchId: number) =>
    api.post(`${base(id)}/batches/${batchId}/cancel`, {}).then(r => cancelSchema.parse(r.data)),
  history: (id: string, p: { state?: string; limit?: number; offset?: number }) =>
    api.get(`${base(id)}/history`, { params: p }).then(r => historySchema.parse(r.data)),
}
