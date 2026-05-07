import {
  getTableLastUpdate,
  getTableMaxId,
  getTableChanges,
  mergeRecords,
  getTableForSync,
} from './cloud.repository.js'

/**
 * Lista de tablas sincronizables.
 * Todas las tablas de la app se sincronizan.
 */
const SYNCABLE_TABLES = [
  'products',
  'categories',
  'customers',
  'suppliers',
  'users',
  'sales',
  'sale_items',
  'purchases',
  'purchase_orders',
  'purchase_items',
  'receivables',
  'quotes',
  'quote_items',
  'expenses',
  'stock_movements',
  'cash_sessions',
  'cash_movements',
  'audit_log',
  'settings',
]

/**
 * Obtiene metadata de sincronización para cada tabla.
 * Retorna: { tableName: { maxId, lastUpdate }, ... }
 */
export function getSyncMetadata() {
  const metadata = {}

  SYNCABLE_TABLES.forEach((table) => {
    try {
      metadata[table] = {
        maxId: getTableMaxId(table),
        lastUpdate: getTableLastUpdate(table),
      }
    } catch (err) {
      metadata[table] = { maxId: null, lastUpdate: null, error: err.message }
    }
  })

  return metadata
}

/**
 * Obtiene cambios desde un timestamp específico.
 * @param {string} table
 * @param {string|null} sinceTimestamp
 * @returns {any[]}
 */
export function getChanges(table, sinceTimestamp = null) {
  if (!SYNCABLE_TABLES.includes(table)) {
    throw new Error(`Tabla no sincronizable: ${table}`)
  }
  return getTableChanges(table, sinceTimestamp)
}

/**
 * Aplica pull desde Google Sheets.
 * Recibe registros de Sheets y hace merge inteligente en SQLite.
 * @param {{ [tableName]: any[] }} cloudData
 * @returns {{ ok: boolean, results: { [table]: { inserted, updated, skipped } } }}
 */
export function applyPull(cloudData) {
  if (!cloudData || typeof cloudData !== 'object') {
    return {
      ok: false,
      error: { code: 'INVALID_PAYLOAD', message: 'cloudData debe ser un objeto' },
    }
  }

  const results = {}

  Object.entries(cloudData).forEach(([tableName, records]) => {
    if (!SYNCABLE_TABLES.includes(tableName)) {
      results[tableName] = { skipped: true, reason: 'Tabla no sincronizable' }
      return
    }

    try {
      results[tableName] = mergeRecords(tableName, records)
    } catch (err) {
      results[tableName] = {
        error: err.message,
      }
    }
  })

  return {
    ok: true,
    data: results,
  }
}

/**
 * Obtiene todas las tablas para hacer push a Google Sheets.
 * @returns {{ [tableName]: any[] }}
 */
export function buildSyncPayload() {
  const payload = {}

  SYNCABLE_TABLES.forEach((table) => {
    try {
      payload[table] = getTableForSync(table)
    } catch (err) {
      payload[table] = []
    }
  })

  return payload
}

/**
 * Obtiene cambios incrementales desde el último timestamp conocido.
 * Usado para sync optimizado sin traer todo cada vez.
 * @param {{ [table]: string|null }} lastSync - { tableName: lastTimestamp }
 * @returns {{ [table]: any[] }}
 */
export function getIncrementalChanges(lastSync = {}) {
  const changes = {}

  SYNCABLE_TABLES.forEach((table) => {
    const sinceTimestamp = lastSync[table] || null
    try {
      changes[table] = getTableChanges(table, sinceTimestamp)
    } catch (err) {
      changes[table] = []
    }
  })

  return changes
}

/**
 * Obtiene el siguiente ID para una tabla (maxId + 1).
 * Sincronización de IDs a demanda: consulta el máximo ID localmente.
 * El siguiente ciclo auto-sync traerá IDs de Sheets y aplicará merge.
 * @param {string} tableName
 * @returns {number} siguiente ID disponible
 */
export function getNextId(tableName) {
  if (!SYNCABLE_TABLES.includes(tableName)) {
    throw new Error(`Tabla no sincronizable: ${tableName}`)
  }

  try {
    const maxId = getTableMaxId(tableName)
    return (maxId || 0) + 1
  } catch (err) {
    console.error(`Error obteniendo siguiente ID para ${tableName}:`, err)
    return 1
  }
}
