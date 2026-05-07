import { productListSchema, productSchema } from '@/schemas/product.schema.js'
import { unwrap } from './ipc.js'
import { isElectron, get, insert, update as webUpdate, remove as webRemove, upsert, envelope } from './webApiService.js'
import { getNextId } from './cloudIdService.js'

// ─── Adaptador Electron ──────────────────────────────────────

const ipc = {
  getAll:      ()                        => window.api.products.list(),
  getAllActive: ()                        => window.api.products.listActive(),
  search:      /** @param {string} q */  (q)         => window.api.products.search(q),
  getById:     /** @param {number} id */ (id)        => window.api.products.getById(id),
  create:      /** @param {object} input */ (input)  => window.api.products.create(input),
  update:      /** @param {number} id @param {object} patch */ (id, patch) => window.api.products.update(id, patch),
  remove:      /** @param {number} id */ (id)        => window.api.products.remove(id),
  restore:     /** @param {number} id */ (id)        => window.api.products.restore(id),
  adjustStock: /** @param {number} id @param {string} t @param {number} qty */ (id, t, qty) => window.api.products.adjustStock(id, t, qty),
};

// ─── Adaptador Web (Apps Script) ─────────────────────────────
// Los métodos que no tienen equivalente en la nube (restore, adjustStock)
// devuelven un error explícito para que la UI lo maneje.

/** @param {any} r */
function _coerce(r) {
  return {
    ...r,
    id:        Number(r.id)        || 0,
    price:     Number(r.price)     || 0,
    stock:     Number(r.stock)     || 0,
    min_stock: Number(r.min_stock) || 0,
    is_active: r.is_active === 0 || r.is_active === '0' ? 0 : 1,
    cost:      Number(r.cost)      || 0,
  }
}

const web = {
  getAll:      ()          => envelope(get("products").then(rows => (Array.isArray(rows) ? rows : []).map(_coerce))),
  getAllActive: ()          => envelope(get("products", { is_active: 1 }).then(rows => (Array.isArray(rows) ? rows : []).map(_coerce))),
  search:      (q)         => envelope(get("products", { search: q }).then(rows => (Array.isArray(rows) ? rows : []).map(_coerce))),
  getById:     (id)        => envelope(get("products", { id }).then(rows => (Array.isArray(rows) ? rows : []).map(_coerce))).then(r => ({ ...r, data: r.data?.[0] ?? null })),
  create:      (input)     => envelope(insert("products", input)),
  update:      (id, patch) => envelope(webUpdate("products", { id, ...patch })),
  remove:      (id)        => envelope(webUpdate("products", { id, is_active: 0 })),
  restore:     (id)        => envelope(webUpdate("products", { id, is_active: 1 })),
  adjustStock: ()          => Promise.resolve({ ok: false, error: { code: "NOT_SUPPORTED", message: "Ajuste de stock no disponible en modo web" } }),
};

const api = isElectron ? ipc : web;

// ─── API pública ─────────────────────────────────────────────

/** @returns {Promise<import('@/schemas/product.schema.js').ProductList>} */
export async function getAll() {
  const res = await api.getAll()
  return unwrap('products:list', res, productListSchema)
}

/** @returns {Promise<import('@/schemas/product.schema.js').ProductList>} */
export async function getAllActive() {
  const res = await api.getAllActive()
  return unwrap('products:list-active', res, productListSchema)
}

/** @param {string} query @returns {Promise<import('@/schemas/product.schema.js').ProductList>} */
export async function search(query) {
  const res = await api.search(query)
  return unwrap('products:search', res, productListSchema)
}

/** @param {number} id @returns {Promise<import('@/schemas/product.schema.js').Product | null>} */
export async function getById(id) {
  const res = await api.getById(id)
  return unwrap('products:get-by-id', res, productSchema.nullable())
}

/** @param {import('@/schemas/product.schema.js').ProductInput} input */
export async function create(input) {
  const data = /** @type {any} */ (input)
  if (!data.id) {
    data.id = await getNextId('products')
  }
  const res = await api.create(data)
  return unwrap('products:create', res, productSchema)
}

/**
 * @param {number} id
 * @param {Partial<import('@/schemas/product.schema.js').ProductInput>} patch
 */
export async function update(id, patch) {
  const res = await api.update(id, patch)
  return unwrap('products:update', res, productSchema)
}

/** @param {number} id */
export async function remove(id) {
  const res = await api.remove(id)
  return unwrap('products:remove', res, productSchema.pick({ id: true }).extend({ id: productSchema.shape.id }))
}

/** @param {number} id */
export async function restore(id) {
  const res = await api.restore(id)
  return unwrap('products:restore', res, productSchema.pick({ id: true }).extend({ id: productSchema.shape.id }))
}

/**
 * @param {number} id
 * @param {'entry'|'exit'} type
 * @param {number} qty
 */
export async function adjustStock(id, type, qty) {
  const res = await api.adjustStock(id, type, qty)
  return unwrap('products:adjust-stock', res, productSchema)
}
