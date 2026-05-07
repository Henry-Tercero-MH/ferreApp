import _electron from 'electron'
const { ipcMain } = _electron
import { wrap } from '../../ipc/response.js'
import {
  getSyncMetadata,
  getChanges,
  applyPull,
  buildSyncPayload,
  getIncrementalChanges,
  getNextId,
} from './cloud.service.js'

/**
 * Registra los handlers IPC del módulo cloud.
 * Los canales siguen la convención `cloud:<accion>`.
 */
export function registerCloudIpc() {
  ipcMain.handle('cloud:metadata', wrap(() => getSyncMetadata()))

  ipcMain.handle('cloud:changes', wrap((_e, table, sinceTimestamp) => {
    return getChanges(table, sinceTimestamp)
  }))

  ipcMain.handle('cloud:apply-pull', wrap((_e, cloudData) => {
    return applyPull(cloudData)
  }))

  ipcMain.handle('cloud:build-payload', wrap(() => {
    return buildSyncPayload()
  }))

  ipcMain.handle('cloud:incremental-changes', wrap((_e, lastSync) => {
    return getIncrementalChanges(lastSync)
  }))

  ipcMain.handle('cloud:get-next-id', wrap((_e, tableName) => {
    return getNextId(tableName)
  }))
}
