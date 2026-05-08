import { useState } from 'react'
import { toast } from 'sonner'
import {
  LockOpen, Lock, Plus, Minus, RefreshCw, TrendingUp, TrendingDown,
  DollarSign, ClipboardList, ChevronDown, ChevronUp, Printer, BarChart2,
} from 'lucide-react'

import { PageHeader }     from '@/components/shared/PageHeader'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import { Button }         from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Input }  from '@/components/ui/input'
import { Label }  from '@/components/ui/label'

import {
  useOpenSession, useCashSessions, useCashSession,
  useOpenCash, useCloseCash, useAddMovement,
} from '@/hooks/useCash'
import { useAuthContext } from '@/features/auth/AuthContext'

/** @param {string|null|undefined} s */
const fmtDate = (s) => s ? new Intl.DateTimeFormat('es-GT', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(s)) : '—'
/** @param {number|null|undefined} n */
const fmtMoney = (n) => new Intl.NumberFormat('es-GT', { style: 'currency', currency: 'GTQ' }).format(n ?? 0)

/** @param {any} detail */
function buildSessionHtml(detail) {
  const s = detail.session
  const movRows = (/** @type {any[]} */ (detail.movements)).map((m) => `
    <tr>
      <td>${m.type === 'in' ? 'Ingreso' : 'Egreso'}</td>
      <td>${m.concept}</td>
      <td style="text-align:right">${fmtMoney(m.amount)}</td>
      <td>${String(m.created_at).slice(11, 16)}</td>
    </tr>`).join('')
  return `<!DOCTYPE html><html><head><meta charset="utf-8">
  <title>Cierre de caja</title>
  <style>
    body { font-family: Arial, sans-serif; font-size: 12px; margin: 24px; color: #111; }
    h1 { font-size: 16px; margin-bottom: 4px; }
    h2 { font-size: 13px; margin: 16px 0 6px; border-bottom: 1px solid #ccc; padding-bottom: 4px; }
    .meta { color: #555; margin-bottom: 16px; }
    .kpis { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 16px; }
    .kpi { background: #f5f5f5; border-radius: 4px; padding: 8px 12px; }
    .kpi-label { font-size: 10px; color: #666; }
    .kpi-value { font-size: 14px; font-weight: bold; }
    table { width: 100%; border-collapse: collapse; }
    th { background: #eee; text-align: left; padding: 4px 6px; font-size: 11px; }
    td { padding: 4px 6px; border-bottom: 1px solid #f0f0f0; }
    .diff-neg { color: #c00; }
    .diff-pos { color: #060; }
    .footer { margin-top: 20px; font-size: 10px; color: #888; text-align: center; }
  </style></head><body>
  <h1>Reporte de cierre de caja</h1>
  <div class="meta">
    Apertura: ${fmtDate(s.opened_at)} · Por: ${s.opened_by_name}<br>
    ${s.closed_at ? `Cierre: ${fmtDate(s.closed_at)} · Por: ${s.closed_by_name}` : 'Sesión abierta'}
    ${s.notes ? `<br>Notas: ${s.notes}` : ''}
  </div>
  <div class="kpis">
    <div class="kpi"><div class="kpi-label">Monto inicial</div><div class="kpi-value">${fmtMoney(s.opening_amount)}</div></div>
    <div class="kpi"><div class="kpi-label">Ventas del turno</div><div class="kpi-value">${fmtMoney(detail.salesTotal)}</div></div>
    ${(detail.receivablePaymentsTotal ?? 0) > 0 ? `<div class="kpi"><div class="kpi-label">Cobros CxC</div><div class="kpi-value">${fmtMoney(detail.receivablePaymentsTotal)}</div></div>` : ''}
    <div class="kpi"><div class="kpi-label">Monto esperado</div><div class="kpi-value">${fmtMoney(s.expected_amount)}</div></div>
    ${s.closing_amount != null ? `<div class="kpi"><div class="kpi-label">Monto contado</div><div class="kpi-value">${fmtMoney(s.closing_amount)}</div></div>` : ''}
    ${s.difference != null ? `<div class="kpi"><div class="kpi-label">Diferencia</div><div class="kpi-value ${s.difference < 0 ? 'diff-neg' : s.difference > 0 ? 'diff-pos' : ''}">${s.difference >= 0 ? '+' : ''}${fmtMoney(s.difference)}</div></div>` : ''}
  </div>
  ${detail.movements.length > 0 ? `
  <h2>Movimientos manuales</h2>
  <table><thead><tr><th>Tipo</th><th>Concepto</th><th>Monto</th><th>Hora</th></tr></thead>
  <tbody>${movRows}</tbody></table>` : ''}
  <div class="footer">Ferreteria El Esfuerzo · ${new Date().toLocaleString('es-GT')}</div>
  </body></html>`
}

export default function CashRegisterPage() {
  const { user } = useAuthContext()
  const [openModal, setOpenModal]   = useState(false)
  const [closeModal, setCloseModal] = useState(false)
  const [movModal, setMovModal]     = useState(/** @type {'in'|'out'|null} */ (null))
  const [expandedId, setExpandedId] = useState(/** @type {number|null} */ (null))

  const { data: openSession, isLoading: loadingOpen, refetch } = useOpenSession()
  const { data: sessions = [], isLoading: loadingList } = useCashSessions()

  const isOpen = !!openSession

  return (
    <div className="p-6">
      <PageHeader
        title="Caja"
        subtitle="Control de apertura, cierre y movimientos de efectivo"
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
            {!isOpen ? (
              <Button size="sm" onClick={() => setOpenModal(true)}>
                <LockOpen className="mr-1.5 h-4 w-4" /> Abrir caja
              </Button>
            ) : (
              <>
                <Button size="sm" variant="outline" onClick={() => setMovModal('in')}>
                  <Plus className="mr-1 h-3.5 w-3.5" /> Ingreso
                </Button>
                <Button size="sm" variant="outline" onClick={() => setMovModal('out')}>
                  <Minus className="mr-1 h-3.5 w-3.5" /> Egreso
                </Button>
                <Button size="sm" variant="destructive" onClick={() => setCloseModal(true)}>
                  <Lock className="mr-1.5 h-4 w-4" /> Cerrar caja
                </Button>
              </>
            )}
          </div>
        }
      />

      {/* ── Estado actual ── */}
      {loadingOpen
        ? <LoadingSpinner label="Cargando..." className="py-10" />
        : (
          <div className={`cx-status-banner ${isOpen ? 'cx-status-open' : 'cx-status-closed'}`}>
            {isOpen ? <LockOpen className="h-5 w-5" /> : <Lock className="h-5 w-5" />}
            <div className="cx-status-info">
              <span className="cx-status-title">{isOpen ? 'Caja abierta' : 'Caja cerrada'}</span>
              {isOpen && (
                <span className="cx-status-sub">
                  Apertura: {fmtDate(openSession.opened_at)} · Por: {openSession.opened_by_name} · Monto inicial: {fmtMoney(openSession.opening_amount)}
                </span>
              )}
            </div>
          </div>
        )
      }

      {/* ── Card de reportes ── */}
      <div className="cx-reports-card">
        <div className="cx-reports-header">
          <BarChart2 className="h-4 w-4" />
          <span>Reportes de caja</span>
        </div>
        <p className="cx-reports-desc">
          Expande cualquier sesión cerrada y usa el botón <Printer className="inline h-3.5 w-3.5 mx-0.5" /> para imprimir su resumen.
          Para reportes completos de ventas, visita el módulo de <strong>Reportes</strong>.
        </p>
      </div>

      {/* ── Historial de sesiones ── */}
      <div className="cx-section-title">
        <ClipboardList className="h-4 w-4" />
        <span>Historial de sesiones</span>
      </div>

      {loadingList
        ? <LoadingSpinner label="Cargando historial..." className="py-6" />
        : sessions.length === 0
          ? <p className="cx-empty">No hay sesiones registradas.</p>
          : (
            <div className="cx-sessions-list">
              {sessions.map(s => (
                <SessionRow
                  key={s.id}
                  session={s}
                  expanded={expandedId === s.id}
                  onToggle={() => setExpandedId(expandedId === s.id ? null : s.id)}
                />
              ))}
            </div>
          )
      }

      {/* ── Modales ── */}
      <OpenCashModal
        open={openModal}
        onClose={() => setOpenModal(false)}
        user={user}
      />
      <CloseCashModal
        open={closeModal}
        onClose={() => setCloseModal(false)}
        session={openSession}
        user={user}
      />
      <MovementModal
        type={movModal}
        onClose={() => setMovModal(null)}
        user={user}
      />
    </div>
  )
}

// ── Fila de sesión expandible ────────────────────────────────────────────────

/** @param {{ session: any, expanded: boolean, onToggle: () => void }} props */
function SessionRow({ session, expanded, onToggle }) {
  const { data: detail } = useCashSession(expanded ? session.id : null)

  const isOpen = session.status === 'open'

  async function handlePrint() {
    if (!detail) return
    try {
      const anyApi = /** @type {any} */ (window.api)
      const settingsRes = await anyApi.settings.getAll()
      const paperSize = settingsRes?.data?.paper_size ?? 'letter'
      const printer   = settingsRes?.data?.default_printer ?? ''
      const html = buildSessionHtml(detail)
      const res = await anyApi.printer.print(html, printer, paperSize)
      if (!res?.ok) toast.error('Error al imprimir: ' + (res?.error?.message ?? ''))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al imprimir')
    }
  }

  return (
    <div className={`cx-session-card ${isOpen ? 'cx-session-open' : ''}`}>
      <div className="cx-session-header" onClick={onToggle}>
        <div className="cx-session-left">
          <span className={`cx-session-badge ${isOpen ? 'cx-badge-open' : 'cx-badge-closed'}`}>
            {isOpen ? 'Abierta' : 'Cerrada'}
          </span>
          <span className="cx-session-date">{fmtDate(session.opened_at)}</span>
          <span className="cx-session-by">{session.opened_by_name}</span>
        </div>
        <div className="cx-session-right">
          <span className="cx-session-amount">{fmtMoney(session.opening_amount)}</span>
          {!isOpen && session.difference != null && (
            <span className={`cx-session-diff ${session.difference < 0 ? 'cx-diff-neg' : session.difference > 0 ? 'cx-diff-pos' : ''}`}>
              {session.difference >= 0 ? '+' : ''}{fmtMoney(session.difference)}
            </span>
          )}
          {!isOpen && expanded && detail && (
            <button
              className="sh-action-btn cx-print-btn"
              title="Imprimir cierre de caja"
              onClick={(e) => { e.stopPropagation(); handlePrint() }}
            >
              <Printer className="h-3.5 w-3.5" />
            </button>
          )}
          {expanded ? <ChevronUp className="h-4 w-4 cx-chevron" /> : <ChevronDown className="h-4 w-4 cx-chevron" />}
        </div>
      </div>

      {expanded && (
        <div className="cx-session-detail">
          {!detail
            ? <LoadingSpinner label="Cargando detalle..." />
            : (
              <>
                <div className="cx-detail-grid">
                  <CxKpi label="Monto inicial"    value={fmtMoney(detail.session.opening_amount)} />
                  <CxKpi label="Ventas del turno" value={fmtMoney(detail.salesTotal)} accent="green" />
                  {(detail.receivablePaymentsTotal ?? 0) > 0 && (
                    <CxKpi label="Cobros CxC"     value={fmtMoney(detail.receivablePaymentsTotal)} accent="green" />
                  )}
                  <CxKpi label="Monto esperado"   value={fmtMoney(detail.session.expected_amount)} />
                  {detail.session.closing_amount != null && (
                    <CxKpi label="Monto contado"  value={fmtMoney(detail.session.closing_amount)} />
                  )}
                  {detail.session.difference != null && (
                    <CxKpi
                      label="Diferencia"
                      value={`${detail.session.difference >= 0 ? '+' : ''}${fmtMoney(detail.session.difference)}`}
                      accent={detail.session.difference < 0 ? 'red' : detail.session.difference > 0 ? 'green' : ''}
                    />
                  )}
                </div>

                {detail.session.notes && (
                  <p className="cx-detail-notes">📝 {detail.session.notes}</p>
                )}

                {detail.movements.length > 0 && (
                  <div className="cx-movements">
                    <div className="cx-movements-title">Movimientos manuales</div>
                    <table className="sh-table">
                      <thead>
                        <tr>
                          <th className="sh-th">Tipo</th>
                          <th className="sh-th">Concepto</th>
                          <th className="sh-th sh-num">Monto</th>
                          <th className="sh-th">Hora</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detail.movements.map((m, i) => (
                          <tr key={m.id} className={i % 2 === 0 ? 'sh-tr-even' : 'sh-tr-odd'}>
                            <td className="sh-td">
                              <span className={`cx-mov-type ${m.type === 'in' ? 'cx-mov-in' : 'cx-mov-out'}`}>
                                {m.type === 'in' ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                                {m.type === 'in' ? 'Ingreso' : 'Egreso'}
                              </span>
                            </td>
                            <td className="sh-td">{m.concept}</td>
                            <td className="sh-td sh-num sh-total">{fmtMoney(m.amount)}</td>
                            <td className="sh-td sh-muted">{m.created_at.slice(11, 16)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {detail.session.closed_at && (
                  <p className="cx-detail-close-info">
                    Cerrada: {fmtDate(detail.session.closed_at)} · Por: {detail.session.closed_by_name}
                  </p>
                )}
              </>
            )
          }
        </div>
      )}
    </div>
  )
}

/** @param {{ label: string, value: string, accent?: string }} props */
function CxKpi({ label, value, accent = '' }) {
  return (
    <div className={`cx-kpi ${accent ? `cx-kpi-${accent}` : ''}`}>
      <span className="cx-kpi-label">{label}</span>
      <span className="cx-kpi-value">{value}</span>
    </div>
  )
}

// ── Modal: Abrir caja ────────────────────────────────────────────────────────

/** @param {{ open: boolean, onClose: () => void, user: any }} props */
function OpenCashModal({ open, onClose, user }) {
  const [amount, setAmount] = useState('')
  const mut = useOpenCash()

  /** @param {Event & { preventDefault(): void }} e */
  async function handleSubmit(e) {
    e.preventDefault()
    const val = parseFloat(amount)
    if (isNaN(val) || val < 0) { toast.error('Ingresa un monto válido'); return }
    try {
      await mut.mutateAsync({
        userId:        user.id,
        userName:      user.full_name,
        role:          user.role,
        openingAmount: val,
      })
      toast.success('Caja abierta')
      setAmount('')
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al abrir caja')
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <LockOpen className="h-5 w-5 text-emerald-600" /> Abrir caja
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          <div className="grid gap-1.5">
            <Label>Monto inicial en caja (Q)</Label>
            <Input
              type="number"
              min="0"
              step="0.01"
              placeholder="0.00"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              autoFocus
            />
            <p className="text-xs text-muted-foreground">Ingresa el efectivo con el que inicia el turno.</p>
          </div>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
            <Button type="submit" disabled={mut.isPending}>
              {mut.isPending ? 'Abriendo...' : 'Abrir caja'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ── Modal: Cerrar caja ───────────────────────────────────────────────────────

/** @param {{ open: boolean, onClose: () => void, session: any, user: any }} props */
function CloseCashModal({ open, onClose, session, user }) {
  const [amount, setAmount] = useState('')
  const [notes, setNotes]   = useState('')
  const mut = useCloseCash()

  /** @param {Event & { preventDefault(): void }} e */
  async function handleSubmit(e) {
    e.preventDefault()
    const val = parseFloat(amount)
    if (isNaN(val) || val < 0) { toast.error('Ingresa un monto válido'); return }
    try {
      await mut.mutateAsync({
        id:            session.id,
        userId:        user.id,
        userName:      user.full_name,
        role:          user.role,
        closingAmount: val,
        notes:         notes.trim() || undefined,
      })
      toast.success('Caja cerrada correctamente')
      setAmount('')
      setNotes('')
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al cerrar caja')
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Lock className="h-5 w-5 text-red-600" /> Cerrar caja
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          <div className="cx-close-info">
            <DollarSign className="h-4 w-4" />
            <span>Monto de apertura: <strong>{fmtMoney(session?.opening_amount)}</strong></span>
          </div>
          <div className="grid gap-1.5">
            <Label>Efectivo contado al cierre (Q)</Label>
            <Input
              type="number"
              min="0"
              step="0.01"
              placeholder="0.00"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              autoFocus
            />
          </div>
          <div className="grid gap-1.5">
            <Label>Notas (opcional)</Label>
            <Input
              placeholder="Observaciones del cierre..."
              value={notes}
              onChange={e => setNotes(e.target.value)}
            />
          </div>
          <div className="cx-close-warning">
            ⚠️ Esta acción cerrará el turno actual. El sistema calculará la diferencia automáticamente.
          </div>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
            <Button type="submit" variant="destructive" disabled={mut.isPending}>
              {mut.isPending ? 'Cerrando...' : 'Cerrar caja'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ── Modal: Movimiento manual ─────────────────────────────────────────────────

/** @param {{ type: 'in'|'out'|null, onClose: () => void, user: any }} props */
function MovementModal({ type, onClose, user }) {
  const [amount, setAmount]   = useState('')
  const [concept, setConcept] = useState('')
  const mut = useAddMovement()

  /** @param {Event & { preventDefault(): void }} e */
  async function handleSubmit(e) {
    e.preventDefault()
    const val = parseFloat(amount)
    if (isNaN(val) || val <= 0) { toast.error('Monto inválido'); return }
    if (!concept.trim()) { toast.error('Escribe el concepto'); return }
    try {
      await mut.mutateAsync({
        userId:  user.id,
        role:    user.role,
        type,
        amount:  val,
        concept: concept.trim(),
      })
      toast.success(type === 'in' ? 'Ingreso registrado' : 'Egreso registrado')
      setAmount('')
      setConcept('')
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al registrar movimiento')
    }
  }

  const isIn = type === 'in'

  return (
    <Dialog open={!!type} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isIn
              ? <TrendingUp className="h-5 w-5 text-emerald-600" />
              : <TrendingDown className="h-5 w-5 text-red-600" />
            }
            {isIn ? 'Registrar ingreso' : 'Registrar egreso'}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          <div className="grid gap-1.5">
            <Label>Monto (Q)</Label>
            <Input
              type="number"
              min="0.01"
              step="0.01"
              placeholder="0.00"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              autoFocus
            />
          </div>
          <div className="grid gap-1.5">
            <Label>Concepto</Label>
            <Input
              placeholder={isIn ? 'Ej: Fondo adicional, cobro externo...' : 'Ej: Pago proveedor, gasto operativo...'}
              value={concept}
              onChange={e => setConcept(e.target.value)}
            />
          </div>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
            <Button type="submit" disabled={mut.isPending}
              className={isIn ? 'bg-emerald-600 hover:bg-emerald-700' : ''}
              variant={isIn ? 'default' : 'destructive'}
            >
              {mut.isPending ? 'Guardando...' : 'Guardar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
