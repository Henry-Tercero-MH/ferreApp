import _electron from 'electron'
const { ipcMain } = _electron
import { wrap } from '../../ipc/response.js'

/**
 * @param {ReturnType<typeof import('./customers.service.js').createCustomersService>} service
 */
export function registerCustomersIpc(service) {
  ipcMain.handle('customers:list',       wrap((_e, opts)         => service.list(opts)))
  ipcMain.handle('customers:search',     wrap((_e, query, opts)  => service.search(query, opts)))
  ipcMain.handle('customers:get-by-id',  wrap((_e, id)           => service.getById(id)))
  ipcMain.handle('customers:create',     wrap((_e, input)        => service.create(input)))
  ipcMain.handle('customers:update',     wrap((_e, id, patch)    => service.update(id, patch)))
  ipcMain.handle('customers:set-active',    wrap((_e, id, active) => service.setActive(id, active)))
  ipcMain.handle('customers:get-system',    wrap(() => service.getSystemCustomers()))
}
