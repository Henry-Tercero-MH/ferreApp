import ExcelJS from 'exceljs'
import { app } from 'electron'
import { join } from 'node:path'
import { writeFileSync, readFileSync, unlinkSync } from 'node:fs'
import { getDb } from '../../database/connection.js'

/**
 * Sincroniza datos de SQLite a Google Sheets (reemplaza todo menos usuarios)
 * Construye payload sin usuarios y envía al Apps Script
 * @returns {Promise<{message: string}>}
 */
export async function pushDataToSheets() {
  const db = getDb()
  const SCRIPT_URL = process.env.VITE_APPS_SCRIPT_URL || ''

  if (!SCRIPT_URL) {
    throw new Error('VITE_APPS_SCRIPT_URL no configurado')
  }

  // Tablas a sincronizar (EXCEPTO users y settings)
  const tables = [
    'products', 'categories', 'customers', 'suppliers',
    'sales', 'sale_items', 'purchases', 'purchase_items',
    'quotes', 'quote_items', 'receivables', 'expenses',
    'cash_sessions', 'cash_movements', 'stock_movements',
    'audit_log'
  ]

  const payload = {}

  tables.forEach(tableName => {
    try {
      const rows = db.prepare(`SELECT * FROM ${tableName} ORDER BY id ASC LIMIT 5000`).all()
      payload[tableName] = rows
    } catch (err) {
      console.error(`Error leyendo ${tableName}:`, err.message)
      payload[tableName] = []
    }
  })

  // Enviar a Google Sheets
  const res = await fetch(SCRIPT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify({ action: 'sync', payload })
  })

  const json = await res.json()
  if (!json.ok) {
    throw new Error(json.error?.message || 'Error al sincronizar')
  }

  return {
    message: '✅ Datos sincronizados a Google Sheets (usuarios excluidos)'
  }
}

/**
 * Exporta todos los datos de SQLite a un archivo Excel (LOCAL)
 * Útil para validar datos y detectar conflictos entre sincronizaciones
 * @returns {Promise<string>} ruta del archivo exportado
 */
export async function exportAllDataToExcel() {
  const db = getDb()
  const workbook = new ExcelJS.Workbook()

  // Tablas principales a exportar
  const tables = [
    'products', 'categories', 'customers', 'suppliers',
    'sales', 'sale_items', 'purchases', 'purchase_items',
    'quotes', 'quote_items', 'receivables', 'expenses',
    'cash_sessions', 'cash_movements', 'stock_movements',
    'users', 'audit_log'
  ]

  // Exportar cada tabla como una hoja
  tables.forEach(tableName => {
    try {
      const rows = db.prepare(`SELECT * FROM ${tableName} ORDER BY id DESC LIMIT 1000`).all()

      if (rows.length === 0) {
        // Crear hoja vacía si no hay datos
        workbook.addWorksheet(tableName)
        return
      }

      const worksheet = workbook.addWorksheet(tableName)

      // Encabezados
      const columns = Object.keys(rows[0])
      worksheet.columns = columns.map(col => ({
        header: col,
        key: col,
        width: 20
      }))

      // Estilos para encabezados
      worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }
      worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0070C0' } }
      worksheet.getRow(1).alignment = { horizontal: 'center', vertical: 'center' }

      // Agregar datos
      worksheet.addRows(rows)

      // Auto-fit de columnas
      worksheet.columns.forEach(column => {
        const lengths = rows.map(r => String(r[column.key] || '').length)
        const maxLength = Math.max(...lengths, column.header.length)
        column.width = Math.min(maxLength + 2, 50)
      })

      // Freezear primera fila
      worksheet.freezePane = 'A2'
    } catch (err) {
      console.error(`Error exportando tabla ${tableName}:`, err.message)
      const worksheet = workbook.addWorksheet(tableName)
      worksheet.addRow([`Error: ${err.message}`])
    }
  })

  // Agregar hoja de resumen
  const summarySheet = workbook.addWorksheet('RESUMEN', { sheetState: 'visible' })
  summarySheet.columns = [
    { header: 'Tabla', key: 'table', width: 25 },
    { header: 'Registros', key: 'count', width: 15 },
    { header: 'Último ID', key: 'lastId', width: 15 },
    { header: 'Último Timestamp', key: 'lastTimestamp', width: 25 }
  ]

  summarySheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }
  summarySheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF00B050' } }

  tables.forEach(tableName => {
    try {
      const countResult = db.prepare(`SELECT COUNT(*) as count FROM ${tableName}`).get()
      const maxIdResult = db.prepare(`SELECT MAX(id) as maxId FROM ${tableName}`).get()
      const lastResult = db.prepare(`SELECT updated_at FROM ${tableName} ORDER BY updated_at DESC LIMIT 1`).get()

      summarySheet.addRow({
        table: tableName,
        count: countResult?.count || 0,
        lastId: maxIdResult?.maxId || 'N/A',
        lastTimestamp: lastResult?.updated_at || 'N/A'
      })
    } catch (err) {
      summarySheet.addRow({
        table: tableName,
        count: 'ERROR',
        lastId: 'ERROR',
        lastTimestamp: err.message
      })
    }
  })

  // Guardar archivo en Descargas
  const downloadsPath = join(app.getPath('downloads'), `backup-electron-${new Date().toISOString().split('T')[0]}.xlsx`)
  await workbook.xlsx.writeFile(downloadsPath)

  console.log(`✅ Datos exportados a: ${downloadsPath}`)
  return downloadsPath
}
