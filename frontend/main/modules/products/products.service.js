/**
 * @typedef {Object} ProductInput
 * @property {string} code
 * @property {string} name
 * @property {number} price
 * @property {number} stock
 * @property {string} [category]
 * @property {string} [brand]
 * @property {string} [location]
 * @property {string} [condition]
 * @property {number} [min_stock]
 */

/**
 * @typedef {Object} ProductPatch
 * @property {string} [name]
 * @property {number} [price]
 * @property {string} [category]
 * @property {string} [brand]
 * @property {string} [location]
 * @property {string} [condition]
 * @property {number} [min_stock]
 */

/**
 * @param {ReturnType<typeof import('./products.repository.js').createProductsRepository>} repo
 */
export function createProductsService(repo) {
  function assertId(id) {
    if (!Number.isInteger(id) || id <= 0) {
      throw Object.assign(new Error(`product id invalido: ${id}`), {
        code: 'PRODUCT_INVALID_ID',
      })
    }
  }

  function assertExists(id) {
    assertId(id)
    const row = repo.findById(id)
    if (!row) {
      throw Object.assign(new Error(`producto no encontrado: ${id}`), {
        code: 'PRODUCT_NOT_FOUND',
      })
    }
    return row
  }

  return {
    /** Todos los productos (activos e inactivos). */
    list() {
      return repo.findAll()
    },

    /** Solo los productos activos (para POS y búsqueda rápida). */
    listActive() {
      return repo.findActive()
    },

    /** @param {string} query */
    search(query) {
      const q = typeof query === 'string' ? query.trim() : ''
      if (q.length === 0) return repo.findActive()
      return repo.search(q)
    },

    /** @param {number} id */
    getById(id) {
      assertId(id)
      return repo.findById(id) ?? null
    },

    /** @param {ProductInput} input */
    create(input) {
      const code = (input.code ?? '').trim()
      const name = (input.name ?? '').trim()
      if (!code) throw Object.assign(new Error('code requerido'), { code: 'PRODUCT_MISSING_CODE' })
      if (!name) throw Object.assign(new Error('name requerido'), { code: 'PRODUCT_MISSING_NAME' })
      const price = Number(input.price)
      if (!Number.isFinite(price) || price < 0) {
        throw Object.assign(new Error('price invalido'), { code: 'PRODUCT_INVALID_PRICE' })
      }

      const id = repo.create({
        code,
        name,
        price,
        stock:     Math.max(0, Math.round(Number(input.stock) || 0)),
        category:  (input.category  ?? 'General').trim() || 'General',
        brand:     (input.brand     ?? '').trim(),
        location:  (input.location  ?? '').trim(),
        condition: (input.condition ?? 'Nuevo').trim() || 'Nuevo',
        min_stock: Math.max(0, Math.round(Number(input.min_stock) || 5)),
      })

      return repo.findById(id)
    },

    /**
     * @param {number} id
     * @param {ProductPatch} patch
     */
    update(id, patch) {
      const row = assertExists(id)
      const name = (patch.name ?? row.name).trim()
      if (!name) throw Object.assign(new Error('name requerido'), { code: 'PRODUCT_MISSING_NAME' })
      const price = patch.price !== undefined ? Number(patch.price) : row.price
      if (!Number.isFinite(price) || price < 0) {
        throw Object.assign(new Error('price invalido'), { code: 'PRODUCT_INVALID_PRICE' })
      }

      repo.update(id, {
        name,
        price,
        category:  ((patch.category  ?? row.category)  ?? 'General').trim() || 'General',
        brand:     ((patch.brand     ?? row.brand)      ?? '').trim(),
        location:  ((patch.location  ?? row.location)   ?? '').trim(),
        condition: ((patch.condition ?? row.condition)  ?? 'Nuevo').trim() || 'Nuevo',
        min_stock: patch.min_stock !== undefined
          ? Math.max(0, Math.round(Number(patch.min_stock)))
          : row.min_stock,
      })

      return repo.findById(id)
    },

    /** Soft-delete: marca is_active = 0. @param {number} id */
    remove(id) {
      assertExists(id)
      repo.setActive(id, 0)
    },

    /** Reactiva un producto. @param {number} id */
    restore(id) {
      assertExists(id)
      repo.setActive(id, 1)
    },

    /**
     * Registra un movimiento de stock.
     * @param {number} id
     * @param {'entry'|'exit'} type
     * @param {number} qty
     */
    adjustStock(id, type, qty) {
      assertExists(id)
      const numQty = Number(qty)
      if (!Number.isFinite(numQty) || numQty <= 0) {
        throw Object.assign(new Error('qty invalido'), { code: 'PRODUCT_INVALID_QTY' })
      }
      const delta = type === 'entry' ? numQty : -numQty
      repo.adjustStock(id, delta)
      return repo.findById(id)
    },
  }
}
