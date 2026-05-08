import ExcelJS from 'exceljs'
import { app } from 'electron'
import { join } from 'node:path'
import { writeFileSync, readFileSync, unlinkSync } from 'node:fs'
import { getDb } from '../database/db.js'

/**
 * Exporta datos de SQLite a Excel (sin usuarios) y sube a Google Drive
 * Reemplaza el archivo anterior en Drive
 * @returns {Promise<{filePath: string, driveUrl: string, message: string}>}
 */
export async function exportAndUploadToDrive() {
  const db = getDb()
  const workbook = new ExcelJS.Workbook()

  // Tablas a exportar (EXCEPTO users y settings)
  const tables = [
    'products', 'categories', 'customers', 'suppliers',
    'sales', 'sale_items', 'purchases', 'purchase_items',
    'quotes', 'quote_items', 'receivables', 'expenses',
    'cash_sessions', 'cash_movements', 'stock_movements',
    'audit_log'
  ]

  // Exportar cada tabla
  tables.forEach(tableName => {
    try {
      const rows = db.prepare(`SELECT * FROM ${tableName} ORDER BY id DESC LIMIT 5000`).all()

      if (rows.length === 0) {
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

      // Estilos
      worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }
      worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0070C0' } }
      worksheet.getRow(1).alignment = { horizontal: 'center', vertical: 'center' }

      // Datos
      worksheet.addRows(rows)

      // Auto-fit
      worksheet.columns.forEach(column => {
        const lengths = rows.map(r => String(r[column.key] || '').length)
        const maxLength = Math.max(...lengths, column.header.length)
        column.width = Math.min(maxLength + 2, 50)
      })

      worksheet.freezePane = 'A2'
    } catch (err) {
      console.error(`Error exportando tabla ${tableName}:`, err.message)
      const worksheet = workbook.addWorksheet(tableName)
      worksheet.addRow([`Error: ${err.message}`])
    }
  })

  // Hoja de resumen
  const summarySheet = workbook.addWorksheet('RESUMEN', { sheetState: 'visible' })
  summarySheet.columns = [
    { header: 'Tabla', key: 'table', width: 25 },
    { header: 'Registros', key: 'count', width: 15 },
    { header: 'Último ID', key: 'lastId', width: 15 },
    { header: 'Última actualización', key: 'lastTimestamp', width: 25 }
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

  // Guardar en temp
  const timestamp = new Date().toISOString().split('T')[0]
  const tempPath = join(app.getPath('temp'), `backup-${timestamp}.xlsx`)
  await workbook.xlsx.writeFile(tempPath)

  // Subir a Google Drive
  const uploadRes = await uploadFileToGoogleDrive(tempPath, `ferreteria-backup-${timestamp}.xlsx`)

  // Limpiar archivo temp
  try { unlinkSync(tempPath) } catch (e) { /* ignore */ }

  if (!uploadRes.ok) {
    throw new Error(uploadRes.error || 'Error al subir a Google Drive')
  }

  return {
    filePath: tempPath,
    driveUrl: uploadRes.driveUrl,
    message: `✅ Datos exportados a Google Drive: ${uploadRes.fileName}`
  }
}

/**
 * Sube archivo a Google Drive (reemplaza si existe)
 */
async function uploadFileToGoogleDrive(filePath, fileName) {
  const SCRIPT_URL = process.env.VITE_APPS_SCRIPT_URL || ''
  if (!SCRIPT_URL) {
    return { ok: false, error: 'VITE_APPS_SCRIPT_URL no configurado' }
  }

  try {
    const fileData = readFileSync(filePath)
    const base64 = fileData.toString('base64')

    const res = await fetch(SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({
        action: 'drive.upload',
        filename: fileName,
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        base64
      })
    })

    const json = await res.json()
    if (!json.ok) {
      return { ok: false, error: json.error?.message }
    }

    return {
      ok: true,
      fileName: json.data.filename,
      driveUrl: json.data.url,
      fileId: json.data.fileId
    }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Error desconocido' }
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
