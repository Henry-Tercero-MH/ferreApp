// ─── Sync Service ────────────────────────────────────────────
// Maneja sincronización bidireccional entre SQLite (Electron) y Google Sheets.
// Solo funciona en Electron (tiene window.api).

const SCRIPT_URL = import.meta.env.VITE_APPS_SCRIPT_URL || ''

// Hojas que se descargan desde Sheets hacia SQLite en el pull bidireccional
const PULL_SHEETS = ['products', 'customers', 'categories']

/** @param {any} p @returns {any[]} */
const _safe = (p) => p.then((/** @type {any} */ r) => r.ok ? (r.data?.data ?? r.data ?? []) : []).catch(() => [])

async function _buildPayload() {
  const api = /** @type {any} */ (window.api)

  const [
    products,
    categories,
    customers,
    users,
    expenses,
    auditRaw,
    suppliers,
    salesRaw,
    saleItemsRaw,
    purchasesRaw,
    cashSessionsRaw,
    cashMovementsRaw,
    receivablesRaw,
    quotesRaw,
    stockMovementsRaw,
  ] = await Promise.all([
    _safe(api.products.list()),
    _safe(api.categories.list()),
    _safe(api.customers.list()),
    _safe(api.users.list()),
    _safe(api.expenses.list()),
    _safe(api.audit.list({ pageSize: 5000 })),
    _safe(api.suppliers.list()),
    _safe(api.sales.list({ pageSize: 5000 })),
    _safe(api.sales.listAllItems()),
    _safe(api.purchases.list()),
    _safe(api.cash.list()),
    _safe(api.cash.listAllMovements()),
    _safe(api.receivables.list()),
    _safe(api.quotes.list()),
    _safe(api.inventory.movements({ pageSize: 5000 })),
  ])

  // Extraer items de órdenes de compra
  const purchaseItems = (/** @type {any[]} */ (purchasesRaw)).flatMap(
    (/** @type {any} */ o) => (o.items ?? []).map((/** @type {any} */ i) => ({ ...i, order_id: o.id }))
  )

  const sales = (/** @type {any[]} */ (salesRaw)).map((/** @type {any} */ s) => {
    const { items: _i, ...rest } = s
    return rest
  })

  const safeUsers = (/** @type {any[]} */ (users)).map((/** @type {any} */ u) => {
    const { password_hash: _ph, ...rest } = u
    return rest
  })

  return {
    products,
    categories,
    customers,
    users:           safeUsers,
    expenses,
    audit_log:       auditRaw,
    suppliers,
    sales,
    sale_items:      saleItemsRaw,
    purchase_orders: purchasesRaw.map((/** @type {any} */ o) => { const { items: _i, ...rest } = o; return rest }),
    purchase_items:  purchaseItems,
    cash_sessions:   cashSessionsRaw,
    cash_movements:  cashMovementsRaw,
    receivables:     receivablesRaw,
    quotes:          quotesRaw,
    stock_movements: Array.isArray(stockMovementsRaw) ? stockMovementsRaw : [],
  }
}

/**
 * Sube datos SQLite → Google Sheets.
 * @returns {Promise<{ ok: boolean, results?: object, error?: string }>}
 */
export async function syncToCloud() {
  if (!SCRIPT_URL) return { ok: false, error: 'VITE_APPS_SCRIPT_URL no configurado' }
  if (!window?.api) return { ok: false, error: 'Solo disponible en Electron' }

  const payload = await _buildPayload()

  const res  = await fetch(SCRIPT_URL, {
    method : 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body   : JSON.stringify({ action: 'sync', payload }),
  })

  const json = await res.json()
  if (!json.ok) throw new Error(json.error?.message || 'Error al sincronizar')
  return json.data
}

/**
 * Descarga datos Google Sheets → SQLite (solo tablas editables).
 * @returns {Promise<{ ok: boolean, results?: object, error?: string }>}
 */
export async function pullFromCloud() {
  if (!SCRIPT_URL) return { ok: false, error: 'VITE_APPS_SCRIPT_URL no configurado' }
  if (!window?.api) return { ok: false, error: 'Solo disponible en Electron' }

  const res = await fetch(SCRIPT_URL, {
    method : 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body   : JSON.stringify({ action: 'pull', sheets: PULL_SHEETS }),
  })

  const json = await res.json()
  if (!json.ok) throw new Error(json.error?.message || 'Error al descargar desde la nube')

  // Aplica los datos descargados en SQLite via IPC
  const result = await (/** @type {any} */ (window.api)).cloud.applyPull(json.data)
  if (!result.ok) throw new Error(result.error?.message || 'Error al aplicar cambios locales')

  return result.data
}

/**
 * Sincronización completa bidireccional:
 *   1. Sube SQLite → Sheets (push)
 *   2. Descarga Sheets → SQLite (pull) para tablas editables
 * @returns {Promise<{ pushed: object, pulled: object }>}
 */
export async function syncBidirectional() {
  if (!SCRIPT_URL) throw new Error('VITE_APPS_SCRIPT_URL no configurado')
  if (!window?.api) throw new Error('Solo disponible en Electron')

  const [pushResult, pullResult] = await Promise.allSettled([
    syncToCloud(),
    pullFromCloud(),
  ])

  return {
    pushed: pushResult.status === 'fulfilled' ? pushResult.value : { error: pushResult.reason?.message },
    pulled: pullResult.status === 'fulfilled' ? pullResult.value : { error: pullResult.reason?.message },
  }
}

// ─── Auto-sync ────────────────────────────────────────────────
// Intervalo de sincronización automática en milisegundos

const AUTO_SYNC_INTERVAL_MS = 15 * 60 * 1000 // 15 minutos

/** @type {ReturnType<typeof setInterval> | null} */
let _autoSyncTimer = null

/**
 * Inicia el ciclo de sync automático.
 * Ejecuta una sync inmediata y luego repite cada AUTO_SYNC_INTERVAL_MS.
 * @param {(status: { syncing: boolean, lastSync: string|null, error: string|null }) => void} onStatus
 */
export function startAutoSync(onStatus) {
  if (!SCRIPT_URL || !window?.api) return () => {}

  async function runSync() {
    onStatus({ syncing: true, lastSync: null, error: null })
    try {
      await syncBidirectional()
      const now = new Date().toISOString()
      localStorage.setItem('last_cloud_sync', now)
      onStatus({ syncing: false, lastSync: now, error: null })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      onStatus({ syncing: false, lastSync: localStorage.getItem('last_cloud_sync') ?? null, error: msg })
    }
  }

  // Sync inmediata al arrancar (con pequeño delay para que la UI esté lista)
  const firstRun = setTimeout(runSync, 3000)
  // Sync periódica
  _autoSyncTimer = setInterval(runSync, AUTO_SYNC_INTERVAL_MS)

  const timer = _autoSyncTimer
  return () => {
    clearTimeout(firstRun)
    if (timer !== null) clearInterval(timer)
    _autoSyncTimer = null
  }
}
