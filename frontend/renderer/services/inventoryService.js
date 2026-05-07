import { z } from 'zod'
import { unwrap } from './ipc.js'
import { isElectron } from './webApiService.js'

const any = z.any()

const ipc = {
  getStock:     () => (/** @type {any} */ (window.api)).inventory.stock().then((/** @type {any} */ r) => unwrap('inventory:stock', r, any)),
  getMovements: (/** @type {any} */ opts) => (/** @type {any} */ (window.api)).inventory.movements(opts).then((/** @type {any} */ r) => unwrap('inventory:movements', r, any)),
  adjustStock:  (/** @type {any} */ input) => (/** @type {any} */ (window.api)).inventory.adjust(input).then((/** @type {any} */ r) => unwrap('inventory:adjust', r, any)),
}

const web = {
  getStock:     async () => [],
  getMovements: async () => [],
  adjustStock:  async () => ({}),
}

export const getStock     = isElectron ? ipc.getStock     : web.getStock
export const getMovements = isElectron ? ipc.getMovements : web.getMovements
export const adjustStock  = isElectron ? ipc.adjustStock  : web.adjustStock
