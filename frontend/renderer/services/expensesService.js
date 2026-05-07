import { z } from 'zod'
import { unwrap } from './ipc.js'
import { isElectron, get, insert, update as webUpdate, envelope } from './webApiService.js'

const any = z.any()

function _coerce(r) {
  return { ...r, id: Number(r.id), amount: Number(r.amount ?? 0) }
}

/** @returns {any} */
const _api = () => (/** @type {any} */ (window.api)).expenses

const ipc = {
  /** @param {any} opts */
  list:       (opts)              => _api().list(opts).then((/** @type {any} */ r)        => unwrap('expenses:list',       r, any)),
  /** @param {any} id */
  get:        (id)                => _api().get(id).then((/** @type {any} */ r)            => unwrap('expenses:get',        r, any)),
  /** @param {any} input */
  create:     (input)             => _api().create(input).then((/** @type {any} */ r)      => unwrap('expenses:create',     r, any)),
  /** @param {any} id @param {any} input */
  update:     (id, input)         => _api().update(id, input).then((/** @type {any} */ r)  => unwrap('expenses:update',     r, any)),
  /** @param {any} id */
  remove:     (id)                => _api().remove(id).then((/** @type {any} */ r)         => unwrap('expenses:remove',     r, any)),
  /** @param {any} from @param {any} to */
  summary:    (from, to)          => _api().summary(from, to).then((/** @type {any} */ r)  => unwrap('expenses:summary',    r, any)),
  categories: ()                  => _api().categories().then((/** @type {any} */ r)       => unwrap('expenses:categories', r, any)),
}

const web = {
  list:       async ()      => { const rows = await get('expenses', { limit: 500 }); return (/** @type {any[]} */ (rows)).map(_coerce) },
  get:        async (id)    => { const rows = await get('expenses', { id: String(id) }); return _coerce((/** @type {any[]} */ (rows))[0]) },
  create:     async (input) => _coerce(await insert('expenses', input)),
  update:     async (id, input) => _coerce(await webUpdate('expenses', { id, ...input })),
  remove:     async ()      => true,
  summary:    async ()      => ({ total: 0, count: 0 }),
  categories: async ()      => [],
}

export const listExpenses      = isElectron ? ipc.list       : web.list
export const getExpense        = isElectron ? ipc.get        : web.get
export const createExpense     = isElectron ? ipc.create     : web.create
export const updateExpense     = isElectron ? ipc.update     : web.update
export const removeExpense     = isElectron ? ipc.remove     : web.remove
export const getExpenseSummary = isElectron ? ipc.summary    : web.summary
export const getCategories     = isElectron ? ipc.categories : web.categories
