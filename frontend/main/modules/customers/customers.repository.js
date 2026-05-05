/**
 * @typedef {Object} CustomerRow
 * @property {number} id
 * @property {string} nit
 * @property {string} name
 * @property {string | null} email
 * @property {string | null} phone
 * @property {string | null} address
 * @property {number} active      0 | 1
 * @property {number} is_system   0 | 1
 * @property {string} created_at
 * @property {string} updated_at
 */

/**
 * @typedef {Object} CustomerCreateInput
 * @property {string} nit
 * @property {string} name
 * @property {string | null} [email]
 * @property {string | null} [phone]
 * @property {string | null} [address]
 */

/**
 * @typedef {Object} CustomerUpdateInput
 * @property {string} [nit]
 * @property {string} [name]
 * @property {string | null} [email]
 * @property {string | null} [phone]
 * @property {string | null} [address]
 * @property {number} [active]
 */

const COLUMNS = 'id, nit, name, email, phone, address, active, is_system, created_at, updated_at'

/**
 * @param {import('better-sqlite3').Database} db
 */
export function createCustomersRepository(db) {
  const stmts = {
    selectAllActive: db.prepare(`SELECT ${COLUMNS} FROM customers WHERE active = 1 ORDER BY name`),
    selectAllAny:    db.prepare(`SELECT ${COLUMNS} FROM customers ORDER BY name`),
    selectById:      db.prepare(`SELECT ${COLUMNS} FROM customers WHERE id = ?`),
    searchActive:    db.prepare(
      `SELECT ${COLUMNS} FROM customers
        WHERE (name LIKE ? OR nit LIKE ?) AND active = 1
     ORDER BY name
        LIMIT 50`
    ),
    searchAny:       db.prepare(
      `SELECT ${COLUMNS} FROM customers
        WHERE (name LIKE ? OR nit LIKE ?)
     ORDER BY name
        LIMIT 50`
    ),
    selectByNit:     db.prepare(`SELECT ${COLUMNS} FROM customers WHERE nit = ?`),
    selectSystem:    db.prepare(`SELECT ${COLUMNS} FROM customers WHERE is_system = 1 ORDER BY id`),
    insert: db.prepare(
      `INSERT INTO customers (nit, name, email, phone, address)
       VALUES (?, ?, ?, ?, ?)`
    ),
    setActive: db.prepare(
      `UPDATE customers
          SET active = ?,
              updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        WHERE id = ?`
    ),
  }

  return {
    /**
     * @param {{ includeInactive?: boolean }} [opts]
     * @returns {CustomerRow[]}
     */
    findAll(opts = {}) {
      const stmt = opts.includeInactive ? stmts.selectAllAny : stmts.selectAllActive
      return stmt.all()
    },

    /**
     * @param {number} id
     * @returns {CustomerRow | undefined}
     */
    findById(id) {
      return stmts.selectById.get(id)
    },

    /**
     * @param {string} nit
     * @returns {CustomerRow | undefined}
     */
    findByNit(nit) {
      return stmts.selectByNit.get(nit)
    },

    /** @returns {CustomerRow[]} */
    findSystemCustomers() {
      return stmts.selectSystem.all()
    },

    /**
     * @param {string} query
     * @param {{ includeInactive?: boolean }} [opts]
     * @returns {CustomerRow[]}
     */
    search(query, opts = {}) {
      const like = `%${query}%`
      const stmt = opts.includeInactive ? stmts.searchAny : stmts.searchActive
      return stmt.all(like, like)
    },

    /**
     * @param {CustomerCreateInput} input
     * @returns {number|bigint} id insertado
     */
    insert(input) {
      const info = stmts.insert.run(
        input.nit,
        input.name,
        input.email ?? null,
        input.phone ?? null,
        input.address ?? null
      )
      return info.lastInsertRowid
    },

    /**
     * UPDATE dinamico. Solo toca las columnas provistas en `patch` — evita
     * sobrescribir con undefined y requiere una unica sentencia por forma.
     *
     * @param {number} id
     * @param {CustomerUpdateInput} patch
     * @returns {number} rows affected
     */
    update(id, patch) {
      const fields = []
      const values = []
      for (const [key, value] of Object.entries(patch)) {
        if (value === undefined) continue
        fields.push(`${key} = ?`)
        values.push(value)
      }
      if (fields.length === 0) return 0
      fields.push(`updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`)
      const sql = `UPDATE customers SET ${fields.join(', ')} WHERE id = ?`
      values.push(id)
      const info = db.prepare(sql).run(...values)
      return info.changes
    },

    /**
     * @param {number} id
     * @param {boolean} active
     * @returns {number} rows affected
     */
    setActive(id, active) {
      const info = stmts.setActive.run(active ? 1 : 0, id)
      return info.changes
    },
  }
}
