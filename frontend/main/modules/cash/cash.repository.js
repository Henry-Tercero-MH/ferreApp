/**
 * @typedef {Object} CashSessionRow
 * @property {number}      id
 * @property {number}      opened_by
 * @property {string}      opened_by_name
 * @property {string}      opened_at
 * @property {number}      opening_amount
 * @property {number|null} closed_by
 * @property {string|null} closed_by_name
 * @property {string|null} closed_at
 * @property {number|null} closing_amount
 * @property {number|null} expected_amount
 * @property {number|null} difference
 * @property {string|null} notes
 * @property {'open'|'closed'} status
 */

/**
 * @typedef {Object} CashMovementRow
 * @property {number} id
 * @property {number} session_id
 * @property {'in'|'out'} type
 * @property {number} amount
 * @property {string} concept
 * @property {number|null} created_by
 * @property {string} created_at
 */

/** @param {import('better-sqlite3').Database} db */
export function createCashRepository(db) {
  const stmts = {
    findOpen: db.prepare(
      `SELECT * FROM cash_sessions WHERE status = 'open' ORDER BY opened_at DESC LIMIT 1`
    ),
    findById: db.prepare(
      `SELECT * FROM cash_sessions WHERE id = ?`
    ),
    findAll: db.prepare(
      `SELECT * FROM cash_sessions ORDER BY opened_at DESC LIMIT 100`
    ),
    insert: db.prepare(
      `INSERT INTO cash_sessions (opened_by, opened_by_name, opening_amount)
       VALUES (@opened_by, @opened_by_name, @opening_amount)`
    ),
    close: db.prepare(
      `UPDATE cash_sessions
          SET closed_by       = @closed_by,
              closed_by_name  = @closed_by_name,
              closed_at       = strftime('%Y-%m-%d %H:%M:%S', 'now', 'localtime'),
              closing_amount  = @closing_amount,
              expected_amount = @expected_amount,
              difference      = @difference,
              notes           = @notes,
              status          = 'closed'
        WHERE id = @id AND status = 'open'`
    ),
    movementsForSession: db.prepare(
      `SELECT * FROM cash_movements WHERE session_id = ? ORDER BY created_at ASC`
    ),
    findAllMovements: db.prepare(
      `SELECT * FROM cash_movements ORDER BY created_at ASC`
    ),
    insertMovement: db.prepare(
      `INSERT INTO cash_movements (session_id, type, amount, concept, created_by)
       VALUES (@session_id, @type, @amount, @concept, @created_by)`
    ),
    salesTotalForSession: db.prepare(
      `SELECT COALESCE(SUM(total), 0) AS total
         FROM sales
        WHERE status = 'active'
          AND payment_method != 'credit'
          AND date >= (SELECT opened_at FROM cash_sessions WHERE id = ?)
          AND (? IS NULL OR date < ?)` // closed_at o NULL si está abierta
    ),
    receivablePaymentsForSession: db.prepare(
      `SELECT COALESCE(SUM(amount), 0) AS total
         FROM receivable_payments
        WHERE created_at >= (SELECT opened_at FROM cash_sessions WHERE id = ?)
          AND (? IS NULL OR created_at < ?)`
    ),
    salesTotalToday: db.prepare(
      `SELECT COALESCE(SUM(total), 0) AS total
         FROM sales
        WHERE status = 'active'
          AND payment_method != 'credit'
          AND DATE(date, 'localtime') = DATE('now', 'localtime')`
    ),
    receivablePaymentsTotalToday: db.prepare(
      `SELECT COALESCE(SUM(amount), 0) AS total
         FROM receivable_payments
        WHERE DATE(created_at, 'localtime') = DATE('now', 'localtime')`
    ),
  }

  return {
    /** @returns {CashSessionRow|undefined} */
    findOpen() {
      return stmts.findOpen.get()
    },

    /** @param {number} id @returns {CashSessionRow|undefined} */
    findById(id) {
      return stmts.findById.get(id)
    },

    /** @returns {CashSessionRow[]} */
    findAll() {
      return stmts.findAll.all()
    },

    /**
     * @param {{ opened_by: number, opened_by_name: string, opening_amount: number }} data
     * @returns {number}
     */
    open(data) {
      return Number(stmts.insert.run(data).lastInsertRowid)
    },

    /**
     * @param {{ id: number, closed_by: number, closed_by_name: string, closing_amount: number, expected_amount: number, difference: number, notes: string|null }} data
     */
    close(data) {
      stmts.close.run(data)
    },

    /** @param {number} sessionId @returns {CashMovementRow[]} */
    movementsForSession(sessionId) {
      return stmts.movementsForSession.all(sessionId)
    },

    /** @returns {CashMovementRow[]} */
    findAllMovements() {
      return stmts.findAllMovements.all()
    },

    /**
     * @param {{ session_id: number, type: 'in'|'out', amount: number, concept: string, created_by: number }} data
     * @returns {number}
     */
    insertMovement(data) {
      return Number(stmts.insertMovement.run(data).lastInsertRowid)
    },

    /**
     * Suma de ventas activas (no crédito) durante la sesión.
     * @param {number} sessionId
     * @param {string|null} closedAt
     * @returns {number}
     */
    salesTotal(sessionId, closedAt) {
      const row = /** @type {{ total: number }} */ (stmts.salesTotalForSession.get(sessionId, closedAt, closedAt))
      return row?.total ?? 0
    },

    /**
     * Suma de abonos a cuentas por cobrar durante la sesión.
     * @param {number} sessionId
     * @param {string|null} closedAt
     * @returns {number}
     */
    receivablePaymentsTotal(sessionId, closedAt) {
      const row = /** @type {{ total: number }} */ (stmts.receivablePaymentsForSession.get(sessionId, closedAt, closedAt))
      return row?.total ?? 0
    },

    /** Suma de ventas activas (no crédito) del día de hoy. */
    salesTotalToday() {
      const row = /** @type {{ total: number }} */ (stmts.salesTotalToday.get())
      return row?.total ?? 0
    },

    /** Suma de abonos CxC del día de hoy. */
    receivablePaymentsTodayTotal() {
      const row = /** @type {{ total: number }} */ (stmts.receivablePaymentsTotalToday.get())
      return row?.total ?? 0
    },
  }
}
