import { userSchema, userListSchema } from '@/schemas/user.schema.js'
import { unwrap } from './ipc.js'
import { isElectron, get, insert, update as webUpdate, envelope } from './webApiService.js'

const SCRIPT_URL = import.meta.env.VITE_APPS_SCRIPT_URL || ''

// ─── Login web via endpoint dedicado en el Apps Script ───────
/** Convierte campos numéricos que Sheets devuelve como string */
function _coerceUserRow(u) {
  if (!u) return u
  return { ...u, id: Number(u.id), active: Number(u.active) }
}

/** @param {string} email @param {string} password */
async function _webLogin(email, password) {
  const res  = await fetch(SCRIPT_URL, {
    method : 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body   : JSON.stringify({ action: 'login', email, password }),
  })
  const json = await res.json()
  if (!json.ok) throw new Error(json.error?.message || 'Credenciales inválidas')
  return { ok: true, data: _coerceUserRow(json.data) }
}

// ─── Adaptadores ─────────────────────────────────────────────
const ipc = {
  /** @param {string} email @param {string} pwd */
  login:          (email, pwd)    => window.api.users.login(email, pwd),
  list:           ()              => window.api.users.list(),
  /** @param {number} id */
  getById:        (id)            => window.api.users.getById(id),
  /** @param {object} input */
  create:         (input)         => window.api.users.create(input),
  /** @param {number} id @param {object} patch */
  update:         (id, patch)     => window.api.users.update(id, patch),
  /** @param {number} id @param {string} pwd */
  changePassword: (id, pwd)       => window.api.users.changePassword(id, pwd),
  /** @param {number} id @param {number} active */
  setActive:      (id, active)    => window.api.users.setActive(id, active),
  /** @param {number} id @param {string} avatar */
  updateAvatar:   (id, avatar)    => window.api.users.updateAvatar(id, avatar),
}

const web = {
  /** @param {string} email @param {string} password */
  login:          (email, password) => _webLogin(email, password).catch(err => ({ ok: false, error: { code: 'AUTH_ERROR', message: err.message } })),
  list:           ()                => envelope(get('users').then(rows => rows.map(_coerceUserRow))),
  /** @param {number} id */
  getById:        (id)              => envelope(get('users', { id }).then(r => _coerceUserRow(r[0] ?? null))),
  /** @param {import('../types/api').UserCreateInput} input */
  create:         (input)           => envelope(insert('users', /** @type {object} */(input))),
  /** @param {number} id @param {import('../types/api').UserPatchInput} patch */
  update:         (id, patch)       => envelope(webUpdate('users', { id, ...patch })),
  /** @param {number} _id @param {string} _pwd */
  changePassword: (_id, _pwd)       => Promise.resolve({ ok: false, error: { code: 'NOT_SUPPORTED', message: 'Cambio de contraseña no disponible en modo web' } }),
  /** @param {number} id @param {boolean} active */
  setActive:      (id, active)      => envelope(webUpdate('users', { id, active: active ? 1 : 0 })),
  /** @param {number} id @param {string} avatar */
  updateAvatar:   (id, avatar)      => envelope(webUpdate('users', { id, avatar })),
}

const api = isElectron ? ipc : web

// ─── API pública ─────────────────────────────────────────────

/** @param {string} email @param {string} password */
export async function login(email, password) {
  const res = await api.login(email, password)
  return unwrap('users:login', res, userSchema)
}

export async function list() {
  const res = await api.list()
  return unwrap('users:list', res, userListSchema)
}

/** @param {number} id */
export async function getById(id) {
  const res = await api.getById(id)
  return unwrap('users:get-by-id', res, userSchema.nullable())
}

/** @param {object} input */
export async function create(input) {
  const res = await api.create(input)
  return unwrap('users:create', res, userSchema)
}

/** @param {number} id @param {object} patch */
export async function update(id, patch) {
  const res = await api.update(id, patch)
  return unwrap('users:update', res, userSchema)
}

/** @param {number} id @param {string} newPassword */
export async function changePassword(id, newPassword) {
  const res = await api.changePassword(id, newPassword)
  return unwrap('users:change-password', res, userSchema)
}

/** @param {number} id @param {number} active */
export async function setActive(id, active) {
  const res = await api.setActive(id, active)
  return unwrap('users:set-active', res, userSchema)
}

/** @param {number} id @param {string} avatar */
export async function updateAvatar(id, avatar) {
  const res = await api.updateAvatar(id, avatar)
  return unwrap('users:update-avatar', res, userSchema)
}
