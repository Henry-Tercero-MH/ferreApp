import { getDb } from '../../database/connection.js'

/**
 * Obtiene el timestamp de la última modificación de una tabla.
 * @param {string} tableName
 * @returns {string|null} ISO timestamp o null si tabla vacía
 */
export function getTableLastUpdate(tableName) {
  try {
    const db = getDb()
    const stmt = db.prepare(`
      SELECT MAX(updated_at) as last_update FROM ${tableName}
    `)
    const result = stmt.get()
    return result?.last_update || null
  } catch (err) {
    return null
  }
}

/**
 * Obtiene el ID más alto de una tabla.
 * @param {string} tableName
 * @returns {number|null}
 */
export function getTableMaxId(tableName) {
  try {
    const db = getDb()
    const stmt = db.prepare(`SELECT MAX(id) as max_id FROM ${tableName}`)
    const result = stmt.get()
    return result?.max_id || null
  } catch (err) {
    return null
  }
}

/**
 * Obtiene registros de una tabla más recientes que un timestamp dado.
 * @param {string} tableName
 * @param {string|null} sinceTimestamp - ISO timestamp o null para traer todo
 * @returns {any[]}
 */
export function getTableChanges(tableName, sinceTimestamp = null) {
  try {
    const db = getDb()
    let sql = `SELECT * FROM ${tableName}`

    if (sinceTimestamp) {
      sql += ` WHERE updated_at > ? ORDER BY updated_at ASC`
      const stmt = db.prepare(sql)
      return stmt.all(sinceTimestamp)
    }

    const stmt = db.prepare(sql + ` ORDER BY id ASC LIMIT 5000`)
    return stmt.all()
  } catch (err) {
    return []
  }
}

/**
 * Inserta o actualiza registros con lógica de conflictos.
 * Criterio: ID más alto + timestamp más reciente gana.
 * @param {string} tableName
 * @param {any[]} remoteRecords - registros de Sheets
 * @returns {{ inserted: number, updated: number, skipped: number }}
 */
export function mergeRecords(tableName, remoteRecords = []) {
  if (!Array.isArray(remoteRecords) || remoteRecords.length === 0) {
    return { inserted: 0, updated: 0, skipped: 0 }
  }

  const db = getDb()
  const stats = { inserted: 0, updated: 0, skipped: 0 }

  // Deshabilitar FK constraints temporalmente para permite sincronización flexible
  db.prepare('PRAGMA foreign_keys = OFF').run()

  try {
    remoteRecords.forEach((remote) => {
    if (!remote.id) {
      stats.skipped++
      return
    }

    try {
      const local = db.prepare(
        `SELECT * FROM ${tableName} WHERE id = ?`
      ).get(remote.id)

      if (!local) {
        // No existe localmente → insertar
        const columns = Object.keys(remote)
        const placeholders = columns.map(() => '?').join(',')
        const values = columns.map(c => remote[c])

        db.prepare(
          `INSERT INTO ${tableName} (${columns.join(',')}) VALUES (${placeholders})`
        ).run(...values)

        stats.inserted++
        return
      }

      // Existe localmente → comparar por ID + timestamp
      const localTimestamp = new Date(local.updated_at || 0).getTime()
      const remoteTimestamp = new Date(remote.updated_at || 0).getTime()

      // ID más alto siempre gana; si mismo ID, timestamp gana
      const remoteWins =
        remote.id > local.id ||
        (remote.id === local.id && remoteTimestamp > localTimestamp)

      if (remoteWins) {
        const columns = Object.keys(remote).filter(c => c !== 'id')
        const setClauses = columns.map(c => `${c} = ?`)
        const values = columns.map(c => remote[c])

        db.prepare(
          `UPDATE ${tableName} SET ${setClauses.join(', ')} WHERE id = ?`
        ).run(...values, remote.id)

        stats.updated++
      } else {
        stats.skipped++
      }
    } catch (err) {
      console.error(`Error merging record id=${remote.id} in ${tableName}:`, err)
      stats.skipped++
    }
    })
  } finally {
    // Rehabilitar FK constraints
    db.prepare('PRAGMA foreign_keys = ON').run()
  }

  return stats
}

/**
 * Obtiene una tabla completa para sincronizar hacia Sheets.
 * @param {string} tableName
 * @returns {any[]}
 */
export function getTableForSync(tableName) {
  try {
    const db = getDb()
    const stmt = db.prepare(`SELECT * FROM ${tableName} ORDER BY id ASC LIMIT 5000`)
    return stmt.all()
  } catch (err) {
    return []
  }
}
