import { customerListSchema, customerSchema } from '@/schemas/customer.schema.js'
import { unwrap } from './ipc.js'
import { isElectron, get, insert, update as webUpdate, envelope } from './webApiService.js'

function _coerce(r) {
  return { ...r, id: Number(r.id), active: Number(r.active), is_system: Number(r.is_system ?? 0) }
}

const ipc = {
  getSystemCustomers: async () => {
    const res = await window.api.customers.getSystem()
    return unwrap('customers:get-system', res, customerListSchema)
  },
  getAll: async (opts) => {
    const res = await window.api.customers.list(opts)
    return unwrap('customers:list', res, customerListSchema)
  },
  search: async (query, opts) => {
    const res = await window.api.customers.search(query, opts)
    return unwrap('customers:search', res, customerListSchema)
  },
  getById: async (id) => {
    const res = await window.api.customers.getById(id)
    return unwrap('customers:get-by-id', res, customerSchema.nullable())
  },
  create: async (input) => {
    const res = await window.api.customers.create(input)
    return unwrap('customers:create', res, customerSchema)
  },
  update: async (id, patch) => {
    const res = await window.api.customers.update(id, patch)
    return unwrap('customers:update', res, customerSchema)
  },
  setActive: async (id, active) => {
    const res = await window.api.customers.setActive(id, active)
    if (!res.ok) {
      const err = /** @type {{ error: { code: string, message: string } }} */ (res).error
      throw Object.assign(new Error(err.message), { code: err.code })
    }
    return true
  },
}

const web = {
  getSystemCustomers: async () => {
    const rows = await get('customers', { limit: 500 })
    return customerListSchema.parse((/** @type {any[]} */ (rows)).map(_coerce).filter(r => r.is_system === 1))
  },
  getAll: async () => {
    const rows = await get('customers', { limit: 500 })
    return customerListSchema.parse((/** @type {any[]} */ (rows)).map(_coerce))
  },
  search: async (query) => {
    const rows = await get('customers', { search: query, limit: 100 })
    return customerListSchema.parse((/** @type {any[]} */ (rows)).map(_coerce))
  },
  getById: async (id) => {
    const rows = await get('customers', { id: String(id) })
    const row = (/** @type {any[]} */ (rows))[0]
    return row ? customerSchema.parse(_coerce(row)) : null
  },
  create: async (input) => {
    const row = await insert('customers', input)
    return customerSchema.parse(_coerce(row))
  },
  update: async (id, patch) => {
    const row = await webUpdate('customers', { id, ...patch })
    return customerSchema.parse(_coerce(row))
  },
  setActive: async () => true,
}

export const getSystemCustomers = isElectron ? ipc.getSystemCustomers : web.getSystemCustomers
export const getAll             = isElectron ? ipc.getAll             : web.getAll
export const search             = isElectron ? ipc.search             : web.search
export const getById            = isElectron ? ipc.getById            : web.getById
export const create             = isElectron ? ipc.create             : web.create
export const update             = isElectron ? ipc.update             : web.update
export const setActive          = isElectron ? ipc.setActive          : web.setActive
