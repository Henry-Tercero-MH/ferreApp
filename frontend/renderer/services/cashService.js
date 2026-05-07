import { unwrap } from './ipc.js'
import { isElectron, get, insert, update as webUpdate } from './webApiService.js'
import {
  cashSessionSchema,
  cashSessionListSchema,
  cashSessionDetailSchema,
  cashMovementSchema,
} from '@/schemas/cash.schema.js'

/** @returns {any} */
const _api = () => (/** @type {any} */ (window.api)).cash

// ─── Coerciones ──────────────────────────────────────────────

/** @param {any} r */
function _coerceSession(r) {
  return {
    ...r,
    id:              Number(r.id)              || 0,
    opened_by:       Number(r.opened_by)       || 0,
    opened_by_name:  r.opened_by_name  ?? '',
    opened_at:       r.opened_at       ?? '',
    opening_amount:  Number(r.opening_amount)  || 0,
    closed_by:       r.closed_by  !== '' && r.closed_by  != null ? Number(r.closed_by)  : null,
    closed_by_name:  r.closed_by_name  !== '' ? (r.closed_by_name  ?? null) : null,
    closed_at:       r.closed_at       !== '' ? (r.closed_at       ?? null) : null,
    closing_amount:  r.closing_amount  !== '' && r.closing_amount  != null ? Number(r.closing_amount)  : null,
    expected_amount: r.expected_amount !== '' && r.expected_amount != null ? Number(r.expected_amount) : null,
    difference:      r.difference      !== '' && r.difference      != null ? Number(r.difference)      : null,
    notes:           r.notes           !== '' ? (r.notes           ?? null) : null,
    status:          r.status === 'closed' ? 'closed' : 'open',
  }
}

/** @param {any} r */
function _coerceMovement(r) {
  return {
    ...r,
    id:         Number(r.id)         || 0,
    session_id: Number(r.session_id) || 0,
    type:       r.type === 'out' ? 'out' : 'in',
    amount:     Number(r.amount)     || 0,
    concept:    r.concept    ?? '',
    created_by: r.created_by !== '' && r.created_by != null ? Number(r.created_by) : null,
    created_at: r.created_at ?? '',
  }
}

// ─── Adaptador Electron ──────────────────────────────────────

const ipc = {
  getOpenSession: () => _api().getOpen().then((/** @type {any} */ r) => unwrap('cash:get-open', r, cashSessionSchema.nullable())),
  listSessions:   () => _api().list().then((/** @type {any} */ r) => unwrap('cash:list', r, cashSessionListSchema)),
  getSession:     (/** @type {any} */ id) => _api().getSession(id).then((/** @type {any} */ r) => unwrap('cash:get-session', r, cashSessionDetailSchema)),
  openSession:    (/** @type {any} */ input) => _api().open(input).then((/** @type {any} */ r) => unwrap('cash:open', r, cashSessionSchema)),
  closeSession:   (/** @type {any} */ input) => _api().close(input).then((/** @type {any} */ r) => unwrap('cash:close', r, cashSessionSchema)),
  addMovement:    (/** @type {any} */ input) => _api().addMovement(input).then((/** @type {any} */ r) => unwrap('cash:add-movement', r, cashMovementSchema)),
}

// ─── Adaptador Web (Apps Script) ─────────────────────────────

const web = {
  getOpenSession: async () => {
    const rows = await get('cash_sessions', { limit: 500 })
    const open = (/** @type {any[]} */ (rows)).map(_coerceSession).find(s => s.status === 'open')
    return open ?? null
  },

  listSessions: async () => {
    const rows = await get('cash_sessions', { limit: 500 })
    return cashSessionListSchema.parse((/** @type {any[]} */ (rows)).map(_coerceSession))
  },

  getSession: async (/** @type {any} */ id) => {
    const [sessRows, movRows] = await Promise.all([
      get('cash_sessions', { id: String(id) }),
      get('cash_movements', { limit: 1000 }),
    ])
    const session = _coerceSession((/** @type {any[]} */ (sessRows))[0])
    const movements = (/** @type {any[]} */ (movRows))
      .map(_coerceMovement)
      .filter(m => m.session_id === session.id)
    return cashSessionDetailSchema.parse({ session, movements, salesTotal: 0 })
  },

  openSession: async (/** @type {any} */ input) => {
    // Obtenemos el id máximo actual para asignarlo explícitamente
    const existing = await get('cash_sessions', { limit: 5000 }).catch(() => [])
    const maxId = (/** @type {any[]} */ (existing)).reduce((m, r) => Math.max(m, Number(r.id) || 0), 0)
    const newId = maxId + 1

    await insert('cash_sessions', {
      id:             newId,
      opened_by:      input.opened_by      ?? 0,
      opened_by_name: input.opened_by_name ?? '',
      opened_at:      new Date().toISOString(),
      opening_amount: input.opening_amount ?? 0,
      closed_by:      '',
      closed_by_name: '',
      closed_at:      '',
      closing_amount: '',
      expected_amount:'',
      difference:     '',
      notes:          input.notes ?? '',
      status:         'open',
    })
    const rows = await get('cash_sessions', { id: String(newId) })
    return cashSessionSchema.parse(_coerceSession((/** @type {any[]} */ (rows))[0]))
  },

  closeSession: async (/** @type {any} */ input) => {
    const id = Number(input.id)
    if (!id) throw new Error('ID de sesión inválido')
    await webUpdate('cash_sessions', {
      id,
      closed_by:      input.closed_by      ?? 0,
      closed_by_name: input.closed_by_name ?? '',
      closed_at:      new Date().toISOString(),
      closing_amount: input.closing_amount ?? 0,
      expected_amount:input.expected_amount ?? 0,
      difference:     (input.closing_amount ?? 0) - (input.expected_amount ?? 0),
      notes:          input.notes ?? '',
      status:         'closed',
    })
    const rows = await get('cash_sessions', { id: String(id) })
    return cashSessionSchema.parse(_coerceSession((/** @type {any[]} */ (rows))[0]))
  },

  addMovement: async (/** @type {any} */ input) => {
    const row = await insert('cash_movements', {
      session_id: input.session_id,
      type:       input.type,
      amount:     input.amount,
      concept:    input.concept ?? '',
      created_by: input.created_by ?? '',
      created_at: new Date().toISOString(),
    })
    const rows = await get('cash_movements', { id: String(row.id) })
    return cashMovementSchema.parse(_coerceMovement((/** @type {any[]} */ (rows))[0]))
  },
}

export const getOpenSession = isElectron ? ipc.getOpenSession : web.getOpenSession
export const listSessions   = isElectron ? ipc.listSessions   : web.listSessions
export const getSession     = isElectron ? ipc.getSession     : web.getSession
export const openSession    = isElectron ? ipc.openSession    : web.openSession
export const closeSession   = isElectron ? ipc.closeSession   : web.closeSession
export const addMovement    = isElectron ? ipc.addMovement    : web.addMovement
