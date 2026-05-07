import { unwrap } from './ipc.js'
import { isElectron } from './webApiService.js'
import {
  receivableSchema, receivableListSchema,
  receivableDetailSchema, receivableSummarySchema, customerBalanceSchema,
} from '@/schemas/receivables.schema.js'

/** @returns {any} */
const _api = () => (/** @type {any} */ (window.api)).receivables

const ipc = {
  listReceivables:     () => _api().list().then((/** @type {any} */ r) => unwrap('receivables:list', r, receivableListSchema)),
  getReceivable:       (/** @type {any} */ id) => _api().get(id).then((/** @type {any} */ r) => unwrap('receivables:get', r, receivableDetailSchema)),
  getSummary:          () => _api().summary().then((/** @type {any} */ r) => unwrap('receivables:summary', r, receivableSummarySchema)),
  getPaymentsToday:    () => _api().paymentsToday().then((/** @type {any} */ r) => { if (!r.ok) throw new Error(r.error?.message); return /** @type {{ total: number, count: number }} */ (r.data) }),
  getPaymentsForRange: (/** @type {any} */ range) => _api().paymentsRange(range).then((/** @type {any} */ r) => { if (!r.ok) throw new Error(r.error?.message); return /** @type {{ total: number, count: number }} */ (r.data) }),
  createReceivable:    (/** @type {any} */ input) => _api().create(input).then((/** @type {any} */ r) => unwrap('receivables:create', r, receivableSchema)),
  applyPayment:        (/** @type {any} */ input) => _api().applyPayment(input).then((/** @type {any} */ r) => unwrap('receivables:apply-payment', r, receivableSchema)),
  cancelReceivable:    (/** @type {any} */ id) => _api().cancel(id).then((/** @type {any} */ r) => unwrap('receivables:cancel', r, receivableSchema)),
  getCustomerBalance:  (/** @type {any} */ id) => _api().byCustomer(id).then((/** @type {any} */ r) => unwrap('receivables:by-customer', r, customerBalanceSchema)),
}

const web = {
  listReceivables:     async () => [],
  getReceivable:       async () => { throw new Error('No disponible en versión web') },
  getSummary:          async () => ({ total_count: 0, total_amount: 0, total_paid: 0, total_balance: 0, pending_balance: 0, partial_balance: 0, overdue_balance: 0 }),
  getPaymentsToday:    async () => ({ total: 0, count: 0 }),
  getPaymentsForRange: async () => ({ total: 0, count: 0 }),
  createReceivable:    async () => { throw new Error('No disponible en versión web') },
  applyPayment:        async () => { throw new Error('No disponible en versión web') },
  cancelReceivable:    async () => { throw new Error('No disponible en versión web') },
  getCustomerBalance:  async () => ({ rows: [], balance: 0 }),
}

export const listReceivables     = isElectron ? ipc.listReceivables     : web.listReceivables
export const getReceivable       = isElectron ? ipc.getReceivable       : web.getReceivable
export const getSummary          = isElectron ? ipc.getSummary          : web.getSummary
export const getPaymentsToday    = isElectron ? ipc.getPaymentsToday    : web.getPaymentsToday
export const getPaymentsForRange = isElectron ? ipc.getPaymentsForRange : web.getPaymentsForRange
export const createReceivable    = isElectron ? ipc.createReceivable    : web.createReceivable
export const applyPayment        = isElectron ? ipc.applyPayment        : web.applyPayment
export const cancelReceivable    = isElectron ? ipc.cancelReceivable    : web.cancelReceivable
export const getCustomerBalance  = isElectron ? ipc.getCustomerBalance  : web.getCustomerBalance
