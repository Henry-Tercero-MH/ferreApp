import { customerListSchema, customerSchema } from '@/schemas/customer.schema.js'
import { unwrap } from './ipc.js'

/**
 * Retorna los clientes del sistema (Consumidor Final, Empresa Genérica).
 * @returns {Promise<import('@/schemas/customer.schema.js').CustomerList>}
 */
export async function getSystemCustomers() {
  const res = await window.api.customers.getSystem()
  return unwrap('customers:get-system', res, customerListSchema)
}

/**
 * @param {{ includeInactive?: boolean }} [opts]
 * @returns {Promise<import('@/schemas/customer.schema.js').CustomerList>}
 */
export async function getAll(opts) {
  const res = await window.api.customers.list(opts)
  return unwrap('customers:list', res, customerListSchema)
}

/**
 * @param {string} query
 * @param {{ includeInactive?: boolean }} [opts]
 * @returns {Promise<import('@/schemas/customer.schema.js').CustomerList>}
 */
export async function search(query, opts) {
  const res = await window.api.customers.search(query, opts)
  return unwrap('customers:search', res, customerListSchema)
}

/**
 * @param {number} id
 * @returns {Promise<import('@/schemas/customer.schema.js').Customer | null>}
 */
export async function getById(id) {
  const res = await window.api.customers.getById(id)
  return unwrap('customers:get-by-id', res, customerSchema.nullable())
}

/**
 * @param {import('@/types/api').CustomerCreateInput} input
 * @returns {Promise<import('@/schemas/customer.schema.js').Customer>}
 */
export async function create(input) {
  const res = await window.api.customers.create(input)
  return unwrap('customers:create', res, customerSchema)
}

/**
 * @param {number} id
 * @param {import('@/types/api').CustomerUpdateInput} patch
 * @returns {Promise<import('@/schemas/customer.schema.js').Customer>}
 */
export async function update(id, patch) {
  const res = await window.api.customers.update(id, patch)
  return unwrap('customers:update', res, customerSchema)
}

/**
 * @param {number} id
 * @param {boolean} active
 */
export async function setActive(id, active) {
  const res = await window.api.customers.setActive(id, active)
  if (!res.ok) {
    const err = /** @type {{ error: { code: string, message: string } }} */ (res).error
    throw Object.assign(new Error(err.message), { code: err.code })
  }
  return true
}
