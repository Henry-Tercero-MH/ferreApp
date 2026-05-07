import _electron from 'electron'
const { ipcMain } = _electron
import { wrap } from '../../ipc/response.js'

/**
 * @param {ReturnType<typeof import('./sales.service.js').createSalesService>} service
 */
export function registerSalesIpc(service) {
  ipcMain.handle('sales:create',        wrap((_e, saleData) => service.create(saleData)))
  ipcMain.handle('sales:get-by-id',     wrap((_e, id)       => service.getById(id)))
  ipcMain.handle('sales:list',          wrap((_e, opts)     => service.list(opts)))
  ipcMain.handle('sales:list-all-items',wrap(()             => service.listAllItems()))
  ipcMain.handle('sales:daily-report',  wrap(()             => service.dailyReport()))
  ipcMain.handle('sales:void',          wrap((_e, input)    => service.voidSale(input)))
  ipcMain.handle('sales:range-report',  wrap((_e, range)    => service.rangeReport(range)))
}
