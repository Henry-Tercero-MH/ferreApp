import { z } from 'zod'
import { unwrap } from './ipc.js'
import { isElectron } from './webApiService.js'

const any = z.any()

const ipc = {
  list:       () => (/** @type {any} */ (window.api)).returns.list().then((/** @type {any} */ r) => unwrap('returns:list', r, any)),
  listBySale: (/** @type {any} */ saleId) => (/** @type {any} */ (window.api)).returns.listBySale(saleId).then((/** @type {any} */ r) => unwrap('returns:list-by-sale', r, any)),
  get:        (/** @type {any} */ id) => (/** @type {any} */ (window.api)).returns.get(id).then((/** @type {any} */ r) => unwrap('returns:get', r, any)),
  create:     (/** @type {any} */ input) => (/** @type {any} */ (window.api)).returns.create(input).then((/** @type {any} */ r) => unwrap('returns:create', r, any)),
}

const web = {
  list:       async () => [],
  listBySale: async () => [],
  get:        async () => null,
  create:     async () => { throw new Error('No disponible en versión web') },
}

export const listReturns       = isElectron ? ipc.list       : web.list
export const listReturnsBySale = isElectron ? ipc.listBySale : web.listBySale
export const getReturn         = isElectron ? ipc.get        : web.get
export const createReturn      = isElectron ? ipc.create     : web.create
