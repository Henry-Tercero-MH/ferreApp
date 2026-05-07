import { isElectron, get, envelope } from './webApiService.js'

/**
 * @typedef {{ action?: string, entity?: string, from?: string, to?: string, page?: number, pageSize?: number }} AuditListOpts
 */

function _coerceRow(r) {
  return { ...r, id: Number(r.id), entity_id: r.entity_id ? Number(r.entity_id) : null }
}

const ipc = {
  /** @param {AuditListOpts} opts */
  list: (opts) => window.api.audit.list(opts),
}

const web = {
  /** @param {AuditListOpts} opts */
  list: (opts) => envelope(
    get('audit_log', {
      search: opts?.action || '',
      limit:  opts?.pageSize || 100,
    }).then(rows => ({
      data:     rows.map(_coerceRow),
      total:    rows.length,
      page:     opts?.page || 1,
      pageSize: opts?.pageSize || 100,
    }))
  ),
}

export const auditService = isElectron ? ipc : web
