/**
 * Servicio de sincronización de IDs a demanda.
 * Consulta el siguiente ID disponible sin esperar 15 minutos.
 *
 * Funciona en Electron (SQLite local) y Web (Google Sheets).
 *
 * Uso:
 *   const id = await getNextId('quotes')
 *   // Crear registro con ese ID
 *   await api.quotes.create({ id, ... })
 */

import { isElectron, get } from './webApiService.js'

/**
 * Obtiene el siguiente ID disponible para un módulo.
 * - Electron: consulta SQLite localmente
 * - Web: consulta Google Sheets vía Apps Script
 * @param {string} tableName - 'quotes', 'products', 'sales', etc.
 * @returns {Promise<number>} siguiente ID disponible
 */
export async function getNextId(tableName) {
  try {
    if (isElectron) {
      // Electron: IPC a cloud.service.js
      if (!window?.api?.cloud) {
        throw new Error('cloud:get-next-id no disponible')
      }
      return await window.api.cloud.getNextId(tableName)
    } else {
      // Web: consulta Google Sheets vía Apps Script
      const rows = await get(tableName, { limit: 5000 }).catch(() => [])
      const maxId = (/** @type {any[]} */ (rows)).reduce((m, r) => Math.max(m, Number(r.id) || 0), 0)
      return (maxId || 0) + 1
    }
  } catch (err) {
    console.error(`Error obteniendo siguiente ID para ${tableName}:`, err)
    // Fallback: retorna timestamp como ID (para emergencias)
    return Date.now()
  }
}

/**
 * Obtiene metadatos de sincronización (maxId, lastUpdate) por tabla.
 * @returns {Promise<{ [table]: { maxId, lastUpdate } }>}
 */
export async function getSyncMetadata() {
  if (!window?.api?.cloud) {
    return {}
  }

  try {
    return await window.api.cloud.metadata()
  } catch (err) {
    console.error('Error obteniendo metadata:', err)
    return {}
  }
}
