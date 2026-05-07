import _electron from 'electron'
const { ipcMain } = _electron
import { wrap } from '../../ipc/response.js'

/** @param {ReturnType<typeof import('./cash.service.js').createCashService>} service */
export function registerCashIpc(service) {
  ipcMain.handle('cash:get-open',           wrap(() => service.getOpenSession()))
  ipcMain.handle('cash:list',               wrap(() => service.listSessions()))
  ipcMain.handle('cash:list-all-movements', wrap(() => service.listAllMovements()))
  ipcMain.handle('cash:get-session',        wrap((_e, id) => service.getSession(id)))
  ipcMain.handle('cash:open',               wrap((_e, input) => service.openSession(input)))
  ipcMain.handle('cash:close',              wrap((_e, input) => service.closeSession(input)))
  ipcMain.handle('cash:add-movement',       wrap((_e, input) => service.addMovement(input)))
}
