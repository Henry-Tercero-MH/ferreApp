// ============================================================
//  GestorERP — Google Apps Script Backend
//  Sheets como base de datos + Drive para imágenes.
//
//  PERMISOS REQUERIDOS (se solicitan automáticamente al hacer deploy):
//    - https://www.googleapis.com/auth/spreadsheets        (leer/escribir hojas)
//    - https://www.googleapis.com/auth/drive               (subir imágenes a Drive)
//    - https://www.googleapis.com/auth/drive.file          (acceso a archivos creados por el script)
//    - https://www.googleapis.com/auth/script.external_request (fetch externo si se necesita)
//
//  CONFIGURACIÓN EN Script Properties (Proyecto → Configuración → Variables):
//    API_KEY          → clave secreta para proteger los endpoints (opcional en dev)
//    DRIVE_FOLDER_ID  → ID de la carpeta de Drive donde se guardan imágenes
//                       (si no se configura, se crea automáticamente "GestorERP_Images")
//
//  CÓMO AGREGAR UNA NUEVA HOJA EN EL FUTURO:
//    1. Llama registerSheet({ name, columns }) desde el editor
//    2. NO modifiques doGet / doPost ni el router
//    3. Re-ejecuta setupSheets() una sola vez
// ============================================================

// ─── REGISTRO DE HOJAS ──────────────────────────────────────
const SHEET_REGISTRY = [
  {
    name: "products",
    columns: [
      "id", "code", "name", "price", "cost", "stock",
      "min_stock", "category", "brand", "location",
      "condition", "is_active", "image_url", "created_at", "updated_at"
    ]
  },
  {
    name: "categories",
    columns: ["id", "name", "is_active", "created_at"]
  },
  {
    name: "customers",
    columns: [
      "id", "nit", "name", "email", "phone",
      "address", "active", "created_at", "updated_at"
    ]
  },
  {
    name: "suppliers",
    columns: [
      "id", "name", "contact_name", "phone", "email",
      "address", "notes", "active", "created_at", "updated_at"
    ]
  },
  {
    name: "settings",
    columns: ["key", "value", "type", "category", "description", "updated_at"]
  },
  {
    name: "users",
    columns: [
      "id", "email", "full_name", "role",
      "active", "created_at", "updated_at"
    ]
    // password_hash omitido intencionalmente — nunca exponer credenciales
  },
  {
    name: "expenses",
    columns: [
      "id", "category", "description", "amount",
      "payment_method", "expense_date", "notes",
      "created_by_name", "created_at"
    ]
  },
  {
    name: "sales",
    columns: [
      "id", "date", "total", "subtotal", "tax_rate", "tax_amount",
      "currency_code", "customer_id", "customer_name_snapshot",
      "customer_nit_snapshot", "payment_method", "client_type",
      "discount_type", "discount_value", "discount_amount",
      "status", "created_by_user_id", "created_by_user_snapshot"
    ]
  },
  {
    name: "sale_items",
    columns: [
      "id", "sale_id", "product_id", "qty", "price",
      "product_code", "product_name"
    ]
  },
  {
    name: "purchase_orders",
    columns: [
      "id", "supplier_id", "supplier_name", "status",
      "notes", "created_by_name", "total_cost",
      "created_at", "received_at"
    ]
  },
  {
    name: "purchase_items",
    columns: [
      "id", "order_id", "product_id", "product_code",
      "product_name", "qty_ordered", "qty_received", "unit_cost"
    ]
  },
  {
    name: "receivables",
    columns: [
      "id", "customer_id", "customer_name", "customer_nit",
      "description", "amount", "amount_paid", "due_date",
      "status", "notes", "created_by_name", "created_at", "updated_at"
    ]
  },
  {
    name: "quotes",
    columns: [
      "id", "customer_id", "customer_name", "customer_nit", "customer_phone",
      "customer_address", "status", "notes", "valid_until",
      "subtotal", "tax_rate", "tax_amount", "total",
      "created_by", "created_by_name", "sale_id", "created_at", "updated_at"
    ]
  },
  {
    name: "quote_items",
    columns: [
      "id", "quote_id", "product_id", "product_name", "product_code",
      "qty", "unit_price", "subtotal"
    ]
  },
  {
    name: "stock_movements",
    columns: [
      "id", "product_id", "product_name", "type",
      "qty", "qty_before", "qty_after", "reference_type",
      "reference_id", "notes", "created_by_name", "created_at"
    ]
  },
  {
    name: "price_updates",
    columns: [
      "id", "product_id", "product_code", "product_name",
      "old_price", "new_price", "old_cost", "new_cost",
      "changed_by", "changed_at", "notes"
    ]
  },
  {
    name: "audit_log",
    columns: [
      "id", "action", "entity", "entity_id",
      "description", "user_name", "created_at"
    ]
  },
  {
    name: "cash_sessions",
    columns: [
      "id", "opened_by", "opened_by_name", "opened_at",
      "opening_amount", "closed_by", "closed_by_name", "closed_at",
      "closing_amount", "expected_amount", "difference", "notes", "status"
    ]
  },
  {
    name: "cash_movements",
    columns: [
      "id", "session_id", "type", "amount",
      "concept", "created_by", "created_at"
    ]
  }
];

// ============================================================
//  PUNTOS DE ENTRADA HTTP
// ============================================================

// GET  ?sheet=products
// GET  ?sheet=products&id=5
// GET  ?sheet=products&search=tornillo&limit=100
// GET  ?action=drive.list                          → lista imágenes en la carpeta
// GET  ?action=drive.folder                        → devuelve el ID de la carpeta
function doGet(e) {
  return _handleRequest(e, "GET");
}

// POST body JSON:
//   { action: "insert"|"update"|"delete"|"upsert"|"bulk", sheet, data, rows }
//   { action: "drive.upload",   filename, mimeType, base64 }
//   { action: "drive.delete",   fileId }
//   { action: "drive.rename",   fileId, filename }
function doPost(e) {
  return _handleRequest(e, "POST");
}

// ============================================================
//  ROUTER CENTRAL
// ============================================================
function _handleRequest(e, method) {
  try {
    _validateOrigin(e);

    // ── GET ──────────────────────────────────────────────────
    if (method === "GET") {
      const action = _param(e, "action");

      if (action === "drive.list")   return _ok(driveListImages());
      if (action === "drive.folder") return _ok({ folderId: _getDriveFolderId() });
      if (action === "setup")        { setupSheets(); return _ok({ initialized: true }); }

      const sheetName = _param(e, "sheet");
      if (!sheetName) return _error(400, "Parámetro 'sheet' requerido");

      const id     = _param(e, "id");
      const search = _param(e, "search");
      const limit  = parseInt(_param(e, "limit") || "500");

      return _ok(_readSheet(sheetName, { id, search, limit }));
    }

    // ── POST ─────────────────────────────────────────────────
    if (method === "POST") {
      const body   = JSON.parse(e.postData.contents);
      const action = body.action;

      // Acciones que NO necesitan 'sheet'
      if (action === "login")        return _ok(_loginUser(body.email, body.password));
      if (action === "sync")         return _ok(_syncAll(body.payload));
      if (action === "pull")         return _ok(_pullAll(body.sheets));
      if (action === "drive.upload") return _ok(driveUpload(body));
      if (action === "drive.delete") return _ok(driveDelete(body.fileId));
      if (action === "drive.rename") return _ok(driveRename(body.fileId, body.filename));

      // Acciones que SÍ necesitan 'sheet'
      const sheet = body.sheet;
      const data  = body.data;
      if (!sheet) return _error(400, "Campo 'sheet' requerido");

      if (action === "insert") return _ok(_insertRow(sheet, data));
      if (action === "update") return _ok(_updateRow(sheet, data));
      if (action === "delete") return _ok(_deleteRow(sheet, data.id));
      if (action === "upsert") return _ok(_upsertRow(sheet, data));
      if (action === "bulk")   return _ok(_bulkUpsert(sheet, body.rows));

      return _error(400, `Acción desconocida: ${action}`);
    }

    return _error(405, "Método no permitido");

  } catch (err) {
    return _error(500, err.message || "Error interno");
  }
}

// ============================================================
//  MÓDULO DRIVE — imágenes de productos / logos
// ============================================================

/**
 * Sube una imagen a Drive y devuelve la URL pública.
 * body: { filename, mimeType, base64 }
 *   - filename : nombre del archivo, ej "product_42.jpg"
 *   - mimeType : "image/jpeg" | "image/png" | "image/webp"
 *   - base64   : contenido del archivo codificado en base64 (sin prefijo data:...)
 */
function driveUpload(body) {
  const base64   = body.base64;
  const nombre   = body.filename || ("imagen_" + Date.now() + ".jpg");
  const tipo     = body.mimeType || "image/jpeg";

  if (!base64) throw new Error("drive.upload requiere base64");

  const folder = _getDriveFolder();
  const bytes  = Utilities.base64Decode(base64);
  const blob   = Utilities.newBlob(bytes, tipo, nombre);
  const file   = folder.createFile(blob);

  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  const fileId = file.getId();
  const url    = "https://drive.google.com/uc?export=view&id=" + fileId;

  return { fileId, url, filename: file.getName() };
}

/**
 * Elimina un archivo de Drive por su fileId.
 */
function driveDelete(fileId) {
  if (!fileId) throw new Error("drive.delete requiere fileId");
  DriveApp.getFileById(fileId).setTrashed(true);
  return { fileId, deleted: true };
}

/**
 * Renombra un archivo de Drive.
 */
function driveRename(fileId, filename) {
  if (!fileId || !filename) throw new Error("drive.rename requiere fileId y filename");
  DriveApp.getFileById(fileId).setName(filename);
  return { fileId, filename, renamed: true };
}

/**
 * Lista todas las imágenes en la carpeta de Drive.
 * Devuelve: [{ fileId, filename, url, mimeType, createdAt }]
 */
function driveListImages() {
  const folder = _getDriveFolder();
  const files  = folder.getFiles();
  const result = [];

  while (files.hasNext()) {
    const file = files.next();
    result.push({
      fileId   : file.getId(),
      filename : file.getName(),
      url      : `https://drive.google.com/uc?export=view&id=${file.getId()}`,
      mimeType : file.getMimeType(),
      createdAt: file.getDateCreated().toISOString()
    });
  }

  return result;
}

// ── Helpers de Drive ─────────────────────────────────────────

function _getDriveFolderId() {
  const props    = PropertiesService.getScriptProperties();
  let   folderId = props.getProperty("DRIVE_FOLDER_ID");

  if (!folderId) {
    // Crea la carpeta automáticamente si no está configurada
    const folder = DriveApp.createFolder("GestorERP_Images");
    folder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    folderId = folder.getId();
    props.setProperty("DRIVE_FOLDER_ID", folderId);
    Logger.log(`📁 Carpeta creada automáticamente: ${folderId}`);
  }

  return folderId;
}

function _getDriveFolder() {
  return DriveApp.getFolderById(_getDriveFolderId());
}

// ============================================================
//  FUNCIÓN PÚBLICA: REGISTRAR NUEVA HOJA
// ============================================================
// Úsala desde el editor de Apps Script para agregar hojas futuras
// sin tocar el router ni los endpoints.
//
// Ejemplo:
//   registerSheet({ name: "workshops", columns: ["id","title","status","created_at"] })
//
function registerSheet(definition) {
  if (!definition || !definition.name || !Array.isArray(definition.columns)) {
    throw new Error("Definición inválida. Requiere { name, columns[] }");
  }
  if (SHEET_REGISTRY.find(s => s.name === definition.name)) {
    Logger.log(`⚠️  La hoja '${definition.name}' ya existe en el registro.`);
    return;
  }
  SHEET_REGISTRY.push(definition);
  _createSheetIfNeeded(definition);
  Logger.log(`✅ Hoja '${definition.name}' registrada y creada.`);
}

// ============================================================
//  SETUP INICIAL — ejecutar UNA VEZ desde el editor
// ============================================================
function setupSheets() {
  SHEET_REGISTRY.forEach(_createSheetIfNeeded);
  _seedAdminUser();
  const folderId = _getDriveFolderId();
  Logger.log("✅ Setup completado.");
  Logger.log("   Hojas: " + SHEET_REGISTRY.map(s => s.name).join(", "));
  Logger.log("   Drive folder ID: " + folderId);
}

// Siembra el usuario admin por defecto si la hoja users está vacía
function _seedAdminUser() {
  const sheet   = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("users");
  if (!sheet) return;
  // Solo siembra si no hay filas de datos
  if (sheet.getLastRow() > 1) return;

  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const now     = new Date().toISOString();
  const admin   = {
    id:         1,
    email:      "admin@elfuerzo.local",
    full_name:  "Administrador",
    role:       "admin",
    active:     1,
    created_at: now,
    updated_at: now,
  };
  sheet.appendRow(headers.map(h => admin[h] !== undefined ? admin[h] : ""));
  Logger.log("  👤 Usuario admin sembrado: admin@elfuerzo.local");
}

function _createSheetIfNeeded({ name, columns }) {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  let   sheet = ss.getSheetByName(name);

  if (!sheet) {
    sheet = ss.insertSheet(name);
    Logger.log(`  ➕ Creada hoja: ${name}`);
  }

  if (sheet.getLastRow() === 0) {
    sheet.appendRow(columns);
    sheet.getRange(1, 1, 1, columns.length)
         .setFontWeight("bold")
         .setBackground("#e5001f")
         .setFontColor("#ffffff");
    sheet.setFrozenRows(1);
    Logger.log(`  📋 Cabeceras: ${columns.join(", ")}`);
  }
}

// ============================================================
//  NORMALIZACIÓN DE TIPOS
// ============================================================

/**
 * Campos que siempre deben ser strings (evita problemas de sincronización)
 * Google Sheets almacena números como números, esto fuerza string
 */
const STRING_FIELDS = [
  'nit', 'code', 'phone', 'email', 'address', 'name', 'full_name',
  'customer_nit_snapshot', 'customer_name_snapshot',
  'product_code', 'product_name', 'category', 'brand', 'location',
  'contact_name', 'supplier_name', 'customer_name',
  'created_by_user_snapshot', 'created_by_name', 'opened_by_name',
  'closed_by_name', 'concept', 'notes', 'description',
]

/**
 * Campos de fecha que deben convertirse a string ISO (YYYY-MM-DD)
 */
const DATE_FIELDS = [
  'created_at', 'updated_at', 'valid_until', 'due_date',
  'expense_date', 'received_at',
]

/**
 * Convierte una fecha (Date, número o string) a formato ISO YYYY-MM-DD
 */
function _toISODate(value) {
  if (!value) return null
  if (typeof value === 'string') {
    value = value.trim()
    if (value.match(/^\d{4}-\d{2}-\d{2}/)) return value.slice(0, 10)
    if (value.match(/^\d{1,2}\/\d{1,2}\/\d{4}/)) {
      const [d, m, y] = value.split('/').map(x => parseInt(x))
      const date = new Date(y, m - 1, d)
      return isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10)
    }
    return null
  }
  if (value instanceof Date) {
    return isNaN(value.getTime()) ? null : value.toISOString().slice(0, 10)
  }
  if (typeof value === 'number' && !isNaN(value)) {
    const date = new Date((value - 25567) * 86400 * 1000)
    return isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10)
  }
  return null
}

/**
 * Normaliza tipos de datos después de leer desde Sheets
 * Convierte campos específicos a string para evitar inconsistencias
 */
function _normalizeRecord(record) {
  const normalized = { ...record }

  STRING_FIELDS.forEach(field => {
    if (field in normalized && normalized[field] != null && normalized[field] !== '') {
      normalized[field] = String(normalized[field])
    }
  })

  DATE_FIELDS.forEach(field => {
    if (field in normalized && normalized[field] != null) {
      normalized[field] = _toISODate(normalized[field])
    }
  })

  return normalized
}

// ============================================================
//  OPERACIONES CRUD SHEETS
// ============================================================

function _readSheet(sheetName, { id, search, limit }) {
  const sheet = _getSheet(sheetName);
  const [headers, ...rows] = sheet.getDataRange().getValues();

  let records = rows
    .filter(r => r.some(cell => cell !== "" && cell !== null))
    .map(r => _normalizeRecord(_rowToObject(headers, r)));

  if (id)     records = records.filter(r => String(r.id) === String(id));
  if (search) {
    const q = search.toLowerCase();
    records = records.filter(r =>
      Object.values(r).some(v => String(v).toLowerCase().includes(q))
    );
  }

  return records.slice(0, limit);
}

function _insertRow(sheetName, data) {
  const sheet   = _getSheet(sheetName);
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];

  data.id         = data.id         || _nextId(sheet, headers);
  data.created_at = data.created_at || _now();
  data.updated_at = _now();

  sheet.appendRow(headers.map(h => (data[h] !== undefined ? data[h] : "")));
  return { id: data.id };
}

function _updateRow(sheetName, data) {
  const sheet = _getSheet(sheetName);
  const [headers, ...rows] = sheet.getDataRange().getValues();
  const idIdx = headers.indexOf("id");

  if (idIdx === -1) throw new Error(`Hoja '${sheetName}' no tiene columna 'id'`);

  const rowIndex = rows.findIndex(r => String(r[idIdx]) === String(data.id));
  if (rowIndex === -1) throw new Error(`Registro id=${data.id} no encontrado`);

  data.updated_at = _now();
  const sheetRow  = rowIndex + 2;

  headers.forEach((h, colIdx) => {
    if (data[h] !== undefined) sheet.getRange(sheetRow, colIdx + 1).setValue(data[h]);
  });

  return { id: data.id, updated: true };
}

function _deleteRow(sheetName, id) {
  const sheet = _getSheet(sheetName);
  const [headers, ...rows] = sheet.getDataRange().getValues();
  const idIdx = headers.indexOf("id");

  const rowIndex = rows.findIndex(r => String(r[idIdx]) === String(id));
  if (rowIndex === -1) throw new Error(`Registro id=${id} no encontrado`);

  sheet.deleteRow(rowIndex + 2);
  return { id, deleted: true };
}

function _upsertRow(sheetName, data) {
  const sheet = _getSheet(sheetName);
  const [headers, ...rows] = sheet.getDataRange().getValues();
  const idIdx   = headers.indexOf("id");
  const codeIdx = headers.indexOf("code");

  let rowIndex = -1;
  if (data.id)
    rowIndex = rows.findIndex(r => String(r[idIdx]) === String(data.id));
  if (rowIndex === -1 && data.code && codeIdx !== -1)
    rowIndex = rows.findIndex(r => String(r[codeIdx]) === String(data.code));

  if (rowIndex !== -1) {
    data.id = rows[rowIndex][idIdx];
    return _updateRow(sheetName, data);
  }
  return _insertRow(sheetName, data);
}

function _bulkUpsert(sheetName, rows) {
  if (!Array.isArray(rows)) return { processed: 0 };
  const results = rows.map(row => _upsertRow(sheetName, row));
  return { processed: results.length, results };
}

// ============================================================
//  UTILIDADES INTERNAS
// ============================================================

function _getSheet(name) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if (!sheet) throw new Error(`Hoja '${name}' no encontrada. Ejecuta setupSheets() primero.`);
  return sheet;
}

function _rowToObject(headers, row) {
  return headers.reduce((obj, h, i) => {
    obj[h] = row[i] !== undefined ? row[i] : "";
    return obj;
  }, {});
}

function _nextId(sheet, headers) {
  const idIdx = headers.indexOf("id");
  if (idIdx === -1) return _uuid();

  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return 1;

  const ids = sheet.getRange(2, idIdx + 1, lastRow - 1, 1)
                   .getValues().flat()
                   .filter(v => v !== "" && !isNaN(v))
                   .map(Number);

  return ids.length ? Math.max(...ids) + 1 : 1;
}

function _now()  { return new Date().toISOString(); }
function _uuid() { return Utilities.getUuid(); }

function _param(e, key) {
  return e && e.parameter ? (e.parameter[key] || "") : "";
}

function _validateOrigin(e) {
  const apiKey = PropertiesService.getScriptProperties().getProperty("API_KEY");
  if (!apiKey) return;

  const provided = _param(e, "apiKey") ||
    (e.postData ? (JSON.parse(e.postData.contents || "{}").apiKey || "") : "");

  if (provided !== apiKey) throw new Error("API key inválida");
}

// Login: busca usuario por email y compara password guardado en Script Properties
// Las contraseñas se guardan como: WEB_PWD_<EMAIL_NORMALIZADO> = "password"
// Para cambiar la contraseña del admin ve a: Proyecto → Configuración → Variables
// y agrega: WEB_PWD_admin_elfuerzo_local = "TuNuevaContraseña"
// Por defecto si no está configurada acepta "Admin123"
function _loginUser(email, password) {
  if (!email || !password) throw new Error("Email y contraseña requeridos");

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("users");
  if (!sheet) throw new Error("Hoja 'users' no encontrada. Ejecuta setupSheets() primero.");

  const [headers, ...rows] = sheet.getDataRange().getValues();
  const emailIdx = headers.indexOf("email");
  const activeIdx = headers.indexOf("active");

  const row = rows.find(r => String(r[emailIdx]).toLowerCase() === email.toLowerCase());
  if (!row) throw new Error("Credenciales inválidas");
  if (activeIdx !== -1 && String(row[activeIdx]) === "0") throw new Error("Usuario inactivo");

  // Busca la contraseña en Script Properties
  const propKey     = "WEB_PWD_" + email.toLowerCase().replace(/[@.]/g, "_");
  const props       = PropertiesService.getScriptProperties();
  const storedPwd   = props.getProperty(propKey) || "Admin123"; // fallback por defecto

  if (password !== storedPwd) throw new Error("Credenciales inválidas");

  return _rowToObject(headers, row);
}

// Descarga datos de hojas seleccionadas hacia Electron (pull bidireccional).
// body.sheets: array de nombres de hojas a traer, ej. ["products","customers","categories"]
// Si no se especifica, devuelve las hojas editables por defecto.
function _pullAll(sheets) {
  const DEFAULT_PULL_SHEETS = [
    "products", "categories", "customers", "suppliers",
    "sales", "sale_items", "purchase_orders", "purchase_items",
    "quotes", "quote_items", "receivables", "expenses",
    "cash_sessions", "cash_movements", "stock_movements",
    "users", "audit_log"
  ];
  const targets = Array.isArray(sheets) && sheets.length > 0 ? sheets : DEFAULT_PULL_SHEETS;

  const result = {};
  targets.forEach(function(name) {
    try {
      result[name] = _readSheet(name, { limit: 5000 });
    } catch(err) {
      result[name] = [];
    }
  });

  return result;
}

// Sincronización bulk desde Electron.
// payload: { products: [...], customers: [...], sales: [...], ... }
// Cada clave es el nombre de una hoja y su valor es un array de filas.
// Reemplaza TODOS los datos de cada hoja recibida (limpia y re-inserta).
function _syncAll(payload) {
  if (!payload || typeof payload !== "object") throw new Error("payload requerido");

  const results = {};

  Object.entries(payload).forEach(function(entry) {
    const sheetName = entry[0];
    const rows      = entry[1];

    if (!Array.isArray(rows)) { results[sheetName] = { skipped: true }; return; }

    try {
      const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
      if (!sheet) { results[sheetName] = { error: "hoja no encontrada" }; return; }

      const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];

      // Limpia datos previos (mantiene cabecera)
      const lastRow = sheet.getLastRow();
      if (lastRow > 1) sheet.deleteRows(2, lastRow - 1);

      if (rows.length === 0) { results[sheetName] = { synced: 0 }; return; }

      // Construye matriz de valores en el orden de los headers
      const matrix = rows.map(function(row) {
        return headers.map(function(h) {
          return row[h] !== undefined && row[h] !== null ? row[h] : "";
        });
      });

      sheet.getRange(2, 1, matrix.length, headers.length).setValues(matrix);
      results[sheetName] = { synced: rows.length };

    } catch(err) {
      results[sheetName] = { error: err.message };
    }
  });

  return { ok: true, results };
}

function _ok(data) {
  return ContentService
    .createTextOutput(JSON.stringify({ ok: true, data }))
    .setMimeType(ContentService.MimeType.JSON);
}

function _error(code, message) {
  return ContentService
    .createTextOutput(JSON.stringify({ ok: false, error: { code, message } }))
    .setMimeType(ContentService.MimeType.JSON);
}
