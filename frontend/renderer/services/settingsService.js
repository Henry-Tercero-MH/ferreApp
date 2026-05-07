import { z } from 'zod'
import { unwrap } from './ipc.js'
import { isElectron, get, envelope } from './webApiService.js'

const settingsShapeSchema = z.record(z.string(), z.record(z.string(), z.unknown()))

/** @typedef {z.infer<typeof settingsShapeSchema>} SettingsByCategory */

const ipc = {
  /** @returns {Promise<SettingsByCategory>} */
  getAll: async () => {
    const res = await window.api.settings.getAll()
    return unwrap('settings:get-all', res, settingsShapeSchema)
  },
  /** @param {string} key @param {unknown} value */
  set: async (key, value) => {
    const res = await window.api.settings.set(key, value)
    return unwrap('settings:set', res, z.literal(true))
  },
  /** @param {string} key @param {string} value */
  upsert: async (key, value) => {
    const res = await window.api.settings.upsert(key, value)
    return unwrap('settings:upsert', res, z.literal(true))
  },
}

const web = {
  /** @returns {Promise<SettingsByCategory>} */
  getAll: async () => {
    // En web, settings se leen desde la hoja "settings" de Sheets
    const rows = await get('settings').catch(() => [])
    const out = /** @type {SettingsByCategory} */ ({})
    for (const row of (/** @type {any[]} */ (rows))) {
      const cat = row.category || 'general'
      if (!out[cat]) out[cat] = {}
      out[cat][row.key] = /** @type {import('@/types/api').SettingValue} */ (row.value)
    }
    return out
  },
  // Escritura no disponible en web (solo lectura desde Sheets)
  set:    async () => /** @type {true} */ (true),
  upsert: async () => /** @type {true} */ (true),
}

export const getAll  = isElectron ? ipc.getAll  : web.getAll
export const set     = isElectron ? ipc.set     : web.set
export const upsert  = isElectron ? ipc.upsert  : web.upsert
