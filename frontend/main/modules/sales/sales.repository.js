/**
 * @typedef {Object} SaleItemInput
 * @property {number} id     product_id
 * @property {number} qty
 * @property {number} price
 */

/**
 * @typedef {Object} SaleRecord
 * @property {SaleItemInput[]} items
 * @property {number} subtotal
 * @property {number} taxRate
 * @property {number} taxAmount
 * @property {number} total
 * @property {string} currencyCode
 * @property {number} customerId
 * @property {string} customerNameSnapshot
 * @property {string} customerNitSnapshot
 * @property {string} [paymentMethod]
 * @property {string} [clientType]
 * @property {number} [userId]
 * @property {string} [userName]
 */

/**
 * @typedef {Object} SaleRow
 * @property {number} id
 * @property {number} subtotal
 * @property {number} tax_rate_applied
 * @property {number} tax_amount
 * @property {number} total
 * @property {string} currency_code
 * @property {string} date
 * @property {number | null} customer_id
 * @property {string | null} customer_name_snapshot
 * @property {string | null} customer_nit_snapshot
 * @property {string} status
 * @property {string | null} payment_method
 * @property {string | null} client_type
 */

/**
 * @typedef {Object} VoidInput
 * @property {number} saleId
 * @property {string} reason
 * @property {number} [userId]
 * @property {string} [userName]
 */

/**
 * @typedef {Object} SaleItemRow
 * @property {number} id
 * @property {number} sale_id
 * @property {number} product_id
 * @property {number} qty
 * @property {number} price
 * @property {string | null} product_code
 * @property {string | null} product_name
 */

/**
 * @typedef {Object} PageOptions
 * @property {number} limit
 * @property {number} offset
 */

const SALE_COLUMNS = `
  id, subtotal, tax_rate_applied, tax_amount, total, currency_code, date,
  customer_id, customer_name_snapshot, customer_nit_snapshot,
  payment_method, client_type, status,
  discount_type, discount_value, discount_amount
`

/**
 * @param {import('better-sqlite3').Database} db
 */
export function createSalesRepository(db) {
  const stmts = {
    insertSale: db.prepare(
      `INSERT INTO sales (
         date,
         total, subtotal, tax_rate_applied, tax_amount, currency_code,
         customer_id, customer_name_snapshot, customer_nit_snapshot,
         payment_method, client_type,
         discount_type, discount_value, discount_amount,
         created_by_user_id, created_by_user_snapshot
       ) VALUES (
         strftime('%Y-%m-%d %H:%M:%S','now','localtime'),
         ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
       )`
    ),
    insertItem: db.prepare(
      'INSERT INTO sale_items (sale_id, product_id, qty, price) VALUES (?, ?, ?, ?)'
    ),
    updateStock: db.prepare('UPDATE products SET stock = stock - ? WHERE id = ?'),

    selectById: db.prepare(`SELECT ${SALE_COLUMNS} FROM sales WHERE id = ?`),

    /**
     * LEFT JOIN a products para mostrar nombre/codigo actuales. NO es
     * snapshot; para el snapshot real a nivel linea, agregar columnas
     * product_code_snapshot/product_name_snapshot a sale_items en migracion
     * futura. Hoy vive como deuda conocida.
     */
    selectItems: db.prepare(
      `SELECT si.id, si.sale_id, si.product_id, si.qty, si.price,
              p.code AS product_code, p.name AS product_name
         FROM sale_items si
    LEFT JOIN products p ON p.id = si.product_id
        WHERE si.sale_id = ?
     ORDER BY si.id ASC`
    ),
    selectAllItems: db.prepare(
      `SELECT si.id, si.sale_id, si.product_id, si.qty, si.price,
              p.code AS product_code, p.name AS product_name
         FROM sale_items si
    LEFT JOIN products p ON p.id = si.product_id
     ORDER BY si.id ASC`
    ),
    findPageFiltered: db.prepare(`
      SELECT ${SALE_COLUMNS}
        FROM sales
       WHERE (@search IS NULL
              OR lower(customer_name_snapshot) LIKE '%' || lower(@search) || '%'
              OR lower(customer_nit_snapshot)  LIKE '%' || lower(@search) || '%'
              OR CAST(id AS TEXT) LIKE '%' || @search || '%')
         AND (@from   IS NULL OR date(date) >= @from)
         AND (@to     IS NULL OR date(date) <= @to)
         AND (@status IS NULL OR status = @status)
         AND (@userId IS NULL OR created_by_user_id = @userId)
       ORDER BY id DESC
       LIMIT @limit OFFSET @offset
    `),
    countFiltered: db.prepare(`
      SELECT COUNT(*) AS total
        FROM sales
       WHERE (@search IS NULL
              OR lower(customer_name_snapshot) LIKE '%' || lower(@search) || '%'
              OR lower(customer_nit_snapshot)  LIKE '%' || lower(@search) || '%'
              OR CAST(id AS TEXT) LIKE '%' || @search || '%')
         AND (@from   IS NULL OR date(date) >= @from)
         AND (@to     IS NULL OR date(date) <= @to)
         AND (@status IS NULL OR status = @status)
         AND (@userId IS NULL OR created_by_user_id = @userId)
    `),

    dailySummary: db.prepare(`
      SELECT
        COUNT(*)                          AS sale_count,
        COALESCE(SUM(subtotal), 0)        AS subtotal,
        COALESCE(SUM(tax_amount), 0)      AS tax_amount,
        COALESCE(SUM(total), 0)           AS total,
        COALESCE(SUM(CASE WHEN COALESCE(payment_method,'cash') != 'credit' THEN total ELSE 0 END), 0) AS cash_total,
        currency_code
      FROM sales
      WHERE status = 'active'
        AND date(date) = date('now', 'localtime')
      GROUP BY currency_code
    `),

    markVoided: db.prepare(
      `UPDATE sales SET status = 'voided' WHERE id = ? AND status = 'active'`
    ),
    insertVoid: db.prepare(
      `INSERT INTO sale_voids (sale_id, reason, voided_by) VALUES (?, ?, ?)`
    ),
    restoreStock: db.prepare(
      `UPDATE products SET stock = stock + ? WHERE id = ?`
    ),
    getProductForMove: db.prepare(
      `SELECT id, name, stock FROM products WHERE id = ?`
    ),
    insertMovement: db.prepare(`
      INSERT INTO stock_movements
        (product_id, product_name, type, qty, qty_before, qty_after, reference_type, reference_id, notes, created_by, created_by_name)
      VALUES
        (@product_id, @product_name, @type, @qty, @qty_before, @qty_after, @reference_type, @reference_id, @notes, @created_by, @created_by_name)
    `),

    topProducts: db.prepare(`
      SELECT
        p.id,
        p.code,
        p.name,
        SUM(si.qty)         AS units_sold,
        SUM(si.qty * si.price) AS revenue
      FROM sale_items si
      LEFT JOIN products p ON p.id = si.product_id
      JOIN  sales s ON s.id = si.sale_id
      WHERE date(s.date) = date('now', 'localtime')
      GROUP BY si.product_id
      ORDER BY units_sold DESC
      LIMIT 5
    `),

    salesByDate: db.prepare(`
      SELECT
        date(date)              AS day,
        COUNT(*)                AS sale_count,
        COALESCE(SUM(subtotal), 0) AS subtotal,
        COALESCE(SUM(total), 0)    AS total
      FROM sales
      WHERE status = 'active'
        AND date(date) >= @from
        AND date(date) <= @to
      GROUP BY day
      ORDER BY day ASC
    `),

    topProductsRange: db.prepare(`
      SELECT
        p.id,
        p.code,
        p.name,
        SUM(si.qty)            AS units_sold,
        SUM(si.qty * si.price) AS revenue
      FROM sale_items si
      LEFT JOIN products p ON p.id = si.product_id
      JOIN sales s ON s.id = si.sale_id
      WHERE s.status = 'active'
        AND date(s.date) >= @from
        AND date(s.date) <= @to
      GROUP BY si.product_id
      ORDER BY units_sold DESC
      LIMIT 10
    `),

    salesByHour: db.prepare(`
      SELECT
        CAST(strftime('%H', date) AS INTEGER) AS hour,
        COUNT(*)                              AS sale_count,
        COALESCE(SUM(total), 0)               AS total
      FROM sales
      WHERE status = 'active'
        AND date(date) >= @from
        AND date(date) <= @to
      GROUP BY hour
      ORDER BY hour ASC
    `),

    salesByWeekday: db.prepare(`
      SELECT
        CAST(strftime('%w', date) AS INTEGER) AS weekday,
        COUNT(*)                              AS sale_count,
        COALESCE(SUM(total), 0)               AS total
      FROM sales
      WHERE status = 'active'
        AND date(date) >= @from
        AND date(date) <= @to
      GROUP BY weekday
      ORDER BY weekday ASC
    `),

    salesByPaymentMethod: db.prepare(`
      SELECT
        COALESCE(payment_method, 'cash') AS method,
        COUNT(*)                          AS sale_count,
        COALESCE(SUM(total), 0)           AS total
      FROM sales
      WHERE status = 'active'
        AND date(date) >= @from
        AND date(date) <= @to
      GROUP BY method
      ORDER BY sale_count DESC
    `),

    salesByCashier: db.prepare(`
      SELECT
        COALESCE(created_by_user_snapshot, 'Desconocido') AS cashier_name,
        created_by_user_id                                AS cashier_id,
        COUNT(*)                                          AS sale_count,
        COALESCE(SUM(subtotal),0)                         AS subtotal,
        COALESCE(SUM(tax_amount),0)                       AS tax_amount,
        COALESCE(SUM(total),0)                            AS total
      FROM sales
      WHERE status = 'active'
        AND date >= @from || ' 00:00:00'
        AND date <= @to   || ' 23:59:59'
      GROUP BY created_by_user_id, created_by_user_snapshot
      ORDER BY total DESC
    `),
  }

  /**
   * @param {SaleRecord} record
   * @returns {number|bigint}
   */
  const insertSale = db.transaction((record) => {
    const info = stmts.insertSale.run(
      record.total,
      record.subtotal,
      record.taxRate,
      record.taxAmount,
      record.currencyCode,
      record.customerId,
      record.customerNameSnapshot,
      record.customerNitSnapshot,
      record.paymentMethod  ?? 'cash',
      record.clientType     ?? 'cf',
      record.discountType   ?? 'none',
      record.discountValue  ?? 0,
      record.discountAmount ?? 0,
      record.userId         ?? null,
      record.userName       ?? null
    )
    const saleId = info.lastInsertRowid
    for (const item of record.items) {
      const prod       = stmts.getProductForMove.get(item.id)
      const qtyBefore  = prod?.stock ?? 0
      stmts.insertItem.run(saleId, item.id, item.qty, item.price)
      stmts.updateStock.run(item.qty, item.id)
      stmts.insertMovement.run({
        product_id:      item.id,
        product_name:    prod?.name ?? '',
        type:            'sale',
        qty:             item.qty,
        qty_before:      qtyBefore,
        qty_after:       qtyBefore - item.qty,
        reference_type:  'sale',
        reference_id:    saleId,
        notes:           null,
        created_by:      null,
        created_by_name: null,
      })
    }
    return saleId
  })

  return {
    insertSale,

    /**
     * Anula una venta en transacción: marca status='voided', registra en
     * sale_voids y devuelve el stock de cada item.
     * @param {VoidInput} input
     * @param {import('../sales/sales.repository.js').SaleItemRow[]} items
     * @returns {boolean} true si se anuló, false si ya estaba anulada
     */
    voidSale: db.transaction((input, items) => {
      const info = stmts.markVoided.run(input.saleId)
      if (info.changes === 0) return false
      stmts.insertVoid.run(input.saleId, input.reason, input.userId ?? null)
      for (const item of items) {
        const prod      = stmts.getProductForMove.get(item.product_id)
        const qtyBefore = prod?.stock ?? 0
        stmts.restoreStock.run(item.qty, item.product_id)
        stmts.insertMovement.run({
          product_id:      item.product_id,
          product_name:    prod?.name ?? item.product_name ?? '',
          type:            'in',
          qty:             item.qty,
          qty_before:      qtyBefore,
          qty_after:       qtyBefore + item.qty,
          reference_type:  'sale_void',
          reference_id:    input.saleId,
          notes:           `Anulación venta #${input.saleId}`,
          created_by:      null,
          created_by_name: null,
        })
      }
      return true
    }),

    /**
     * @param {number} id
     * @returns {SaleRow | undefined}
     */
    findSaleById(id) {
      return stmts.selectById.get(id)
    },

    /**
     * @param {number} saleId
     * @returns {SaleItemRow[]}
     */
    findSaleItems(saleId) {
      return stmts.selectItems.all(saleId)
    },

    findAllSaleItems() {
      return stmts.selectAllItems.all()
    },

    /**
     * @param {{ limit: number, offset: number, search?: string|null, from?: string|null, to?: string|null, status?: string|null, userId?: number|null }} opts
     * @returns {SaleRow[]}
     */
    findPage({ limit, offset, search = null, from = null, to = null, status = null, userId = null }) {
      return stmts.findPageFiltered.all({ limit, offset, search, from, to, status, userId })
    },

    /** @param {{ search?: string|null, from?: string|null, to?: string|null, status?: string|null, userId?: number|null }} [opts] */
    countAll({ search = null, from = null, to = null, status = null, userId = null } = {}) {
      const row = /** @type {{ total: number }} */ (stmts.countFiltered.get({ search, from, to, status, userId }))
      return row.total
    },

    /**
     * Resumen del día actual (fecha local del servidor/electron).
     * @returns {{ sale_count: number, subtotal: number, tax_amount: number, total: number, currency_code: string } | null}
     */
    getDailySummary() {
      return /** @type {any} */ (stmts.dailySummary.get()) ?? null
    },

    /**
     * Top 5 productos vendidos hoy por unidades.
     * @returns {{ id: number, code: string, name: string, units_sold: number, revenue: number }[]}
     */
    getTopProducts() {
      return /** @type {any[]} */ (stmts.topProducts.all())
    },

    /**
     * Ventas agrupadas por día en un rango de fechas.
     * @param {{ from: string, to: string }} range  Fechas en formato YYYY-MM-DD
     * @returns {{ day: string, sale_count: number, subtotal: number, total: number }[]}
     */
    getSalesByDate({ from, to }) {
      return /** @type {any[]} */ (stmts.salesByDate.all({ from, to }))
    },

    /**
     * Top 10 productos por unidades vendidas en un rango.
     * @param {{ from: string, to: string }} range
     * @returns {{ id: number, code: string, name: string, units_sold: number, revenue: number }[]}
     */
    getTopProductsRange({ from, to }) {
      return /** @type {any[]} */ (stmts.topProductsRange.all({ from, to }))
    },

    /**
     * Ventas agrupadas por hora del día (0-23).
     * @param {{ from: string, to: string }} range
     * @returns {{ hour: number, sale_count: number, total: number }[]}
     */
    getSalesByHour({ from, to }) {
      return /** @type {any[]} */ (stmts.salesByHour.all({ from, to }))
    },

    /**
     * Ventas agrupadas por día de semana (0=Dom … 6=Sáb).
     * @param {{ from: string, to: string }} range
     * @returns {{ weekday: number, sale_count: number, total: number }[]}
     */
    getSalesByWeekday({ from, to }) {
      return /** @type {any[]} */ (stmts.salesByWeekday.all({ from, to }))
    },

    /**
     * Ventas agrupadas por método de pago.
     * @param {{ from: string, to: string }} range
     * @returns {{ method: string, sale_count: number, total: number }[]}
     */
    getSalesByPaymentMethod({ from, to }) {
      return /** @type {any[]} */ (stmts.salesByPaymentMethod.all({ from, to }))
    },

    /**
     * Ventas agrupadas por cajero (usuario que registró la venta).
     * @param {{ from: string, to: string }} range
     * @returns {any[]}
     */
    getSalesByCashier({ from, to }) {
      return /** @type {any[]} */ (stmts.salesByCashier.all({ from, to }))
    },
  }
}
