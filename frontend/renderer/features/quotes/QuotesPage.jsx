import { useState } from 'react'
import logoCotizacionSrc from '@/assets/logoCotizacion.jpeg'
import { toast } from 'sonner'
import {
  Plus, Eye, Send, Check, X, ShoppingCart,
  Pencil, RefreshCw, FileText, Printer, Wallet,
} from 'lucide-react'

import { PageHeader }       from '@/components/shared/PageHeader'
import { LoadingSpinner }   from '@/components/shared/LoadingSpinner'
import { EmptyState }       from '@/components/shared/EmptyState'
import { ProductCombobox }  from '@/components/shared/ProductCombobox'
import { Button }         from '@/components/ui/button'
import { Input }          from '@/components/ui/input'
import { Label }          from '@/components/ui/label'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog'

import {
  useQuotes, useQuote,
  useCreateQuote, useUpdateQuote,
  useMarkSentQuote, useAcceptQuote, useRejectQuote, useConvertQuote,
  useConvertQuoteToReceivable,
} from '@/hooks/useQuotes'
import { useProducts }          from '@/hooks/useProducts'
import { useAuthContext }       from '@/features/auth/AuthContext'
import { useBusinessSettings, useTaxSettings }  from '@/hooks/useSettings'
import { CustomerCombobox }     from '@/components/shared/CustomerCombobox'

const fmtDate  = (s) => s ? new Intl.DateTimeFormat('es-GT', { dateStyle: 'medium' }).format(new Date(s + 'T00:00:00')) : '—'
const fmtMoney = (n) => new Intl.NumberFormat('es-GT', { style: 'currency', currency: 'GTQ' }).format(n ?? 0)

const STATUS_LABEL = {
  draft:     'Borrador',
  sent:      'Enviada',
  accepted:  'Aceptada',
  rejected:  'Rechazada',
  converted: 'Convertida',
}
const STATUS_CLASS = {
  draft:     'po-badge-draft',
  sent:      'po-badge-sent',
  accepted:  'qt-badge-accepted',
  rejected:  'qt-badge-rejected',
  converted: 'qt-badge-converted',
}

const EDITABLE_STATUSES = ['draft', 'sent']
const ACTIVE_STATUSES   = ['draft', 'sent', 'accepted']

export default function QuotesPage() {
  const { enabled: taxEnabled } = useTaxSettings()
  const { user }  = useAuthContext()
  const [search, setSearch]       = useState('')
  const [statusFilter, setStatus] = useState('active')
  const [newModal, setNewModal]   = useState(false)
  const [editId, setEditId]       = useState(/** @type {number|null} */ (null))
  const [detailId, setDetailId]   = useState(/** @type {number|null} */ (null))
  const [printId, setPrintId]     = useState(/** @type {number|null} */ (null))

  const { data: quotes = [], isLoading, refetch, isFetching } = useQuotes()
  const markSentMut   = useMarkSentQuote()
  const acceptMut     = useAcceptQuote()
  const rejectMut     = useRejectQuote()
  const convertMut    = useConvertQuote()
  const toRecvMut     = useConvertQuoteToReceivable()

  const filtered = quotes.filter(q => {
    const matchStatus = statusFilter === 'active'
      ? ACTIVE_STATUSES.includes(q.status)
      : statusFilter === 'all' ? true : q.status === statusFilter
    const term = search.toLowerCase()
    const matchSearch = !term || q.customer_name.toLowerCase().includes(term)
    return matchStatus && matchSearch
  })

  async function handleMarkSent(id) {
    try { await markSentMut.mutateAsync(id); toast.success('Cotización enviada') }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Error') }
  }
  async function handleAccept(id) {
    try { await acceptMut.mutateAsync(id); toast.success('Cotización aceptada') }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Error') }
  }
  async function handleReject(id) {
    if (!confirm('¿Rechazar esta cotización?')) return
    try { await rejectMut.mutateAsync(id); toast.success('Cotización rechazada') }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Error') }
  }
  async function handleConvert(id) {
    if (!confirm('¿Convertir esta cotización en venta? Se descontará el stock.')) return
    try {
      await convertMut.mutateAsync({ id, userId: user.id, userName: user.full_name })
      toast.success('Cotización convertida a venta')
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Error') }
  }

  async function handleToReceivable(id) {
    if (!confirm('¿Crear una cuenta por cobrar desde esta cotización?')) return
    try {
      await toRecvMut.mutateAsync({ id, userId: user.id, userName: user.full_name })
      toast.success('Cuenta por cobrar creada')
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Error') }
  }

  return (
    <div className="p-6">
      <PageHeader title="Cotizaciones" subtitle="Crea y gestiona cotizaciones para tus clientes" />

      {/* Toolbar */}
      <div className="po-toolbar">
        <div className="po-toolbar-left">
          <input
            className="po-search"
            placeholder="Buscar cliente..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <select className="rv-filter-select" value={statusFilter} onChange={e => setStatus(e.target.value)}>
            <option value="active">Activas</option>
            <option value="all">Todas</option>
            <option value="draft">Borrador</option>
            <option value="sent">Enviadas</option>
            <option value="accepted">Aceptadas</option>
            <option value="rejected">Rechazadas</option>
            <option value="converted">Convertidas</option>
          </select>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />
          </Button>
          <Button size="sm" onClick={() => setNewModal(true)}>
            <Plus className="mr-1 h-4 w-4" /> Nueva cotización
          </Button>
        </div>
      </div>

      {isLoading
        ? <LoadingSpinner label="Cargando cotizaciones..." className="py-10" />
        : filtered.length === 0
          ? <EmptyState title="Sin cotizaciones" description="Crea tu primera cotización." />
          : (
            <div className="sh-table-card">
              <div className="sh-table-scroll">
                <table className="sh-table">
                  <thead>
                    <tr>
                      <th className="sh-th w-14">#</th>
                      <th className="sh-th">Cliente</th>
                      <th className="sh-th w-28">Estado</th>
                      <th className="sh-th sh-num w-32">Total</th>
                      <th className="sh-th">Válida hasta</th>
                      <th className="sh-th">Creada por</th>
                      <th className="sh-th w-44 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((q, i) => (
                      <tr key={q.id} className={i % 2 === 0 ? 'sh-tr-even' : 'sh-tr-odd'}>
                        <td className="sh-td sh-nit">{q.id}</td>
                        <td className="sh-td">
                          <div className="font-medium">{q.customer_name}</div>
                          {q.customer_nit && <div className="text-xs text-muted-foreground">NIT: {q.customer_nit}</div>}
                        </td>
                        <td className="sh-td">
                          <span className={`po-badge ${STATUS_CLASS[q.status]}`}>{STATUS_LABEL[q.status]}</span>
                        </td>
                        <td className="sh-td sh-num sh-total">{fmtMoney(q.total)}</td>
                        <td className="sh-td sh-muted">{fmtDate(q.valid_until)}</td>
                        <td className="sh-td sh-muted">{q.created_by_name ?? '—'}</td>
                        <td className="sh-td">
                          <div className="sh-actions">
                            <button className="sh-action-btn" title="Ver detalle" onClick={() => setDetailId(q.id)}>
                              <Eye className="h-3.5 w-3.5" />
                            </button>
                            <button className="sh-action-btn" title="Imprimir" onClick={() => setPrintId(q.id)}>
                              <Printer className="h-3.5 w-3.5" />
                            </button>
                            {EDITABLE_STATUSES.includes(q.status) && (
                              <button className="sh-action-btn" title="Editar" onClick={() => setEditId(q.id)}>
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                            )}
                            {q.status === 'draft' && (
                              <button className="sh-action-btn" title="Marcar enviada" onClick={() => handleMarkSent(q.id)}>
                                <Send className="h-3.5 w-3.5" />
                              </button>
                            )}
                            {['draft', 'sent'].includes(q.status) && (
                              <button className="sh-action-btn success" title="Aceptar" onClick={() => handleAccept(q.id)}>
                                <Check className="h-3.5 w-3.5" />
                              </button>
                            )}
                            {['draft', 'sent', 'accepted'].includes(q.status) && (
                              <button className="sh-action-btn sh-void-btn" title="Rechazar" onClick={() => handleReject(q.id)}>
                                <X className="h-3.5 w-3.5" />
                              </button>
                            )}
                            {q.status === 'accepted' && (
                              <button className="sh-action-btn" title="Convertir a venta" onClick={() => handleConvert(q.id)}>
                                <ShoppingCart className="h-3.5 w-3.5" />
                              </button>
                            )}
                            {['accepted', 'sent', 'draft'].includes(q.status) && (
                              <button className="sh-action-btn" title="Crear cuenta por cobrar" onClick={() => handleToReceivable(q.id)}>
                                <Wallet className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )
      }

      <QuoteFormModal open={newModal} onClose={() => setNewModal(false)} user={user} />
      <QuoteFormModal open={!!editId} editId={editId} onClose={() => setEditId(null)} user={user} />
      <QuoteDetailModal id={detailId} onClose={() => setDetailId(null)} />
      <QuotePrintDialog id={printId} onClose={() => setPrintId(null)} />
    </div>
  )
}

// ── Modal: Crear / Editar cotización ─────────────────────────────────────────

function QuoteFormModal({ open, editId = null, onClose, user }) {
  const isEdit = !!editId
  const { data: existing, isLoading: loadingExisting } = useQuote(editId)

  const [customerId,   setCustomerId]   = useState(/** @type {number|null} */ (null))
  const [form, setForm] = useState({
    customerName:    '',
    customerNit:     '',
    customerPhone:   '',
    customerAddress: '',
    notes:           '',
    validUntil:      '',
  })
  const [items, setItems] = useState(/** @type {{ productId?: number, productName: string, productCode: string, qty: number, unitPrice: number }[]} */ ([]))
  const [initialized, setInitialized] = useState(false)
  const [editingQtyIdx, setEditingQtyIdx] = useState(/** @type {number|null} */ (null))
  const [editingQtyVal, setEditingQtyVal] = useState('')

  // Inicializar form cuando se carga la cotización existente
  if (isEdit && existing && !initialized) {
    setCustomerId(existing.quote.customer_id ?? null)
    setForm({
      customerName:    existing.quote.customer_name,
      customerNit:     existing.quote.customer_nit     ?? '',
      customerPhone:   /** @type {any} */ (existing.quote).customer_phone   ?? '',
      customerAddress: /** @type {any} */ (existing.quote).customer_address ?? '',
      notes:           existing.quote.notes            ?? '',
      validUntil:      existing.quote.valid_until      ?? '',
    })
    setItems(existing.items.map(it => ({
      productId:   it.product_id   ?? undefined,
      productName: it.product_name,
      productCode: it.product_code ?? '',
      qty:         it.qty,
      unitPrice:   it.unit_price,
    })))
    setInitialized(true)
  }

  function handleClose() {
    setCustomerId(null)
    setForm({ customerName: '', customerNit: '', customerPhone: '', customerAddress: '', notes: '', validUntil: '' })
    setItems([])
    setInitialized(false)
    setEditingQtyIdx(null)
    onClose()
  }

  const { data: products = [] } = useProducts()
  const createMut = useCreateQuote()
  const updateMut = useUpdateQuote()

  const set = (f) => (e) => setForm(prev => ({ ...prev, [f]: e.target.value }))

  function addItem() {
    setItems(prev => [...prev, { productName: '', productCode: '', qty: 1, unitPrice: 0 }])
  }
  function removeItem(idx) {
    setItems(prev => prev.filter((_, i) => i !== idx))
  }
  function updateItem(idx, field, value) {
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, [field]: value } : it))
  }
  function selectProduct(idx, prod) {
    if (!prod) return
    setItems(prev => {
      const updated = prev.map((it, i) => i === idx
        ? { ...it, productId: prod.id, productName: prod.name, productCode: prod.code ?? '', unitPrice: prod.price }
        : it
      )
      // Si se seleccionó en la última línea, agrega una nueva vacía automáticamente
      if (idx === prev.length - 1) {
        updated.push({ productName: '', productCode: '', qty: 1, unitPrice: 0 })
      }
      return updated
    })
  }

  const subtotal = items.reduce((s, it) => s + it.qty * it.unitPrice, 0)

  async function handleSubmit(e) {
    e.preventDefault()
    const payload = {
      customerId:      customerId    || undefined,
      customerName:    form.customerName,
      customerNit:     form.customerNit     || undefined,
      customerPhone:   form.customerPhone   || undefined,
      customerAddress: form.customerAddress || undefined,
      notes:           form.notes           || undefined,
      validUntil:      form.validUntil      || undefined,
      userId:          user.id,
      userName:        user.full_name,
      items: items.map(it => ({
        productId:   it.productId,
        productName: it.productName,
        productCode: it.productCode || undefined,
        qty:         it.qty,
        unitPrice:   it.unitPrice,
      })),
    }
    try {
      if (isEdit) {
        await updateMut.mutateAsync({ id: editId, input: payload })
        toast.success('Cotización actualizada')
      } else {
        await createMut.mutateAsync(payload)
        toast.success('Cotización creada')
      }
      handleClose()
    } catch (err) { toast.error(err instanceof Error ? err.message : 'Error') }
  }

  const isPending = createMut.isPending || updateMut.isPending

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose() }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            {isEdit ? 'Editar cotización' : 'Nueva cotización'}
          </DialogTitle>
        </DialogHeader>

        {isEdit && loadingExisting
          ? <LoadingSpinner label="Cargando..." />
          : (
            <form onSubmit={handleSubmit} className="space-y-4 pt-1">
              {/* Selector de cliente registrado */}
              <div className="grid gap-1.5">
                <Label>Cliente registrado (opcional)</Label>
                <CustomerCombobox
                  value={customerId}
                  onChange={setCustomerId}
                  onSelectFull={(c) => {
                    setCustomerId(c.id)
                    setForm(prev => ({
                      ...prev,
                      customerName:    c.name,
                      customerNit:     c.nit  ?? '',
                      customerPhone:   c.phone   ?? '',
                      customerAddress: c.address ?? '',
                    }))
                  }}
                />
              </div>

              {/* Nombre y NIT */}
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <Label>Nombre del cliente *</Label>
                  <Input value={form.customerName} onChange={set('customerName')} placeholder="Juan García" required />
                </div>
                <div className="grid gap-1.5">
                  <Label>NIT</Label>
                  <Input value={form.customerNit} onChange={set('customerNit')} placeholder="123456-7" />
                </div>
              </div>

              {/* Teléfono y Dirección */}
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <Label>Teléfono</Label>
                  <Input value={form.customerPhone} onChange={set('customerPhone')} placeholder="5555-1234" />
                </div>
                <div className="grid gap-1.5">
                  <Label>Dirección</Label>
                  <Input value={form.customerAddress} onChange={set('customerAddress')} placeholder="Ciudad de Guatemala" />
                </div>
              </div>

              {/* Vigencia y notas */}
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <Label>Válida hasta</Label>
                  <Input type="date" value={form.validUntil} onChange={set('validUntil')} />
                </div>
                <div className="grid gap-1.5">
                  <Label>Notas</Label>
                  <Input value={form.notes} onChange={set('notes')} placeholder="Observaciones..." />
                </div>
              </div>

              {/* Productos */}
              <div>
                <div className="po-items-header">
                  <span className="text-sm font-semibold">Productos / Servicios</span>
                  <button type="button" className="po-add-item-btn" onClick={addItem}>
                    <Plus className="h-3.5 w-3.5" /> Agregar
                  </button>
                </div>
                {items.length === 0
                  ? <p className="po-items-empty">Agrega productos a la cotización.</p>
                  : (
                    <div className="qt-items-list">
                      <div className="qt-items-header">
                        <span>Producto del sistema</span>
                        <span>Descripción</span>
                        <span className="text-center">Cant.</span>
                        <span className="text-center">Precio unit.</span>
                        <span className="text-right">Subtotal</span>
                        <span />
                      </div>
                      {items.map((item, idx) => (
                        <div key={idx} className="qt-item-row">
                          <ProductCombobox
                            value={item.productId ?? null}
                            onChange={prod => selectProduct(idx, prod)}
                            products={products.filter(p => p.is_active === 1)}
                          />
                          <Input placeholder="Descripción / nombre"
                            value={item.productName}
                            onChange={e => updateItem(idx, 'productName', e.target.value)} />
                          <div className="flex items-center gap-1 justify-center">
                            {editingQtyIdx === idx ? (
                              <input
                                type="text"
                                inputMode="decimal"
                                autoFocus
                                value={editingQtyVal}
                                onChange={e => setEditingQtyVal(e.target.value)}
                                onBlur={() => {
                                  const v = parseFloat(editingQtyVal.replace(',', '.'))
                                  updateItem(idx, 'qty', v > 0 ? v : item.qty)
                                  setEditingQtyIdx(null)
                                }}
                                onKeyDown={e => {
                                  if (e.key === 'Enter') e.currentTarget.blur()
                                  if (e.key === 'Escape') setEditingQtyIdx(null)
                                }}
                                className="w-14 text-center text-xs border rounded px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-ring"
                              />
                            ) : (
                              <span className="text-xs w-8 text-center">{item.qty}</span>
                            )}
                            <button
                              type="button"
                              title="Editar cantidad"
                              onClick={() => { setEditingQtyIdx(idx); setEditingQtyVal(String(item.qty)) }}
                              className="text-blue-500 hover:text-blue-700"
                            >
                              <Pencil className="h-3 w-3" />
                            </button>
                          </div>
                          <Input type="number" min="0" step="0.01" placeholder="0.00"
                            value={item.unitPrice}
                            onChange={e => updateItem(idx, 'unitPrice', parseFloat(e.target.value) || 0)} />
                          <span className="qt-item-subtotal">{fmtMoney(item.qty * item.unitPrice)}</span>
                          <button type="button" className="po-item-remove" onClick={() => removeItem(idx)}>
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                      <div className="qt-totals-row">
                        <span className="text-muted-foreground text-sm">Subtotal:</span>
                        <strong>{fmtMoney(subtotal)}</strong>
                      </div>
                    </div>
                  )
                }
              </div>

              <DialogFooter className="gap-2">
                <Button type="button" variant="outline" onClick={handleClose}>Cancelar</Button>
                <Button type="submit" disabled={isPending}>
                  {isPending ? 'Guardando...' : isEdit ? 'Actualizar' : 'Crear cotización'}
                </Button>
              </DialogFooter>
            </form>
          )
        }
      </DialogContent>
    </Dialog>
  )
}

// ── Modal: Detalle de cotización ─────────────────────────────────────────────

function QuoteDetailModal({ id, onClose }) {
  const { data, isLoading } = useQuote(id)
  const { enabled: taxEnabled } = useTaxSettings()
  const q = data?.quote

  return (
    <Dialog open={!!id} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Cotización #{id}</DialogTitle>
          {q && (
            <DialogDescription>
              {q.customer_name}{q.customer_nit ? ` · NIT: ${q.customer_nit}` : ''} ·{' '}
              <span className={`po-badge ${STATUS_CLASS[q.status]}`}>{STATUS_LABEL[q.status]}</span>
            </DialogDescription>
          )}
        </DialogHeader>
        {isLoading
          ? <LoadingSpinner label="Cargando..." />
          : q && (
            <div className="space-y-4">
              {/* Resumen */}
              <div className="qt-detail-grid">
                <div>
                  <div className="rv-detail-label">Creada por</div>
                  <div className="rv-detail-value">{q.created_by_name ?? '—'}</div>
                </div>
                <div>
                  <div className="rv-detail-label">Fecha</div>
                  <div className="rv-detail-value">{new Intl.DateTimeFormat('es-GT', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(q.created_at))}</div>
                </div>
                <div>
                  <div className="rv-detail-label">Válida hasta</div>
                  <div className="rv-detail-value">{fmtDate(q.valid_until)}</div>
                </div>
                {q.sale_id && (
                  <div>
                    <div className="rv-detail-label">Venta generada</div>
                    <div className="rv-detail-value font-semibold text-emerald-600">#{q.sale_id}</div>
                  </div>
                )}
                {q.notes && (
                  <div className="col-span-2">
                    <div className="rv-detail-label">Notas</div>
                    <div className="rv-detail-value">{q.notes}</div>
                  </div>
                )}
              </div>

              {/* Items */}
              <table className="sh-table">
                <thead>
                  <tr>
                    <th className="sh-th">Producto / Servicio</th>
                    <th className="sh-th sh-num w-20">Cant.</th>
                    <th className="sh-th sh-num w-28">Precio unit.</th>
                    <th className="sh-th sh-num w-28">Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((it, i) => (
                    <tr key={it.id} className={i % 2 === 0 ? 'sh-tr-even' : 'sh-tr-odd'}>
                      <td className="sh-td">
                        {it.product_code && <span className="inv-code mr-2">{it.product_code}</span>}
                        {it.product_name}
                      </td>
                      <td className="sh-td sh-num">{it.qty}</td>
                      <td className="sh-td sh-num">{fmtMoney(it.unit_price)}</td>
                      <td className="sh-td sh-num sh-total">{fmtMoney(it.subtotal)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={3} className="sh-td text-right text-muted-foreground text-sm">Subtotal:</td>
                    <td className="sh-td sh-num">{fmtMoney(q.subtotal)}</td>
                  </tr>
                  {taxEnabled && (
                    <tr>
                      <td colSpan={3} className="sh-td text-right text-muted-foreground text-sm">IVA ({(q.tax_rate * 100).toFixed(0)}%):</td>
                      <td className="sh-td sh-num">{fmtMoney(q.tax_amount)}</td>
                    </tr>
                  )}
                  <tr className="font-bold">
                    <td colSpan={3} className="sh-td text-right">Total:</td>
                    <td className="sh-td sh-num sh-total">{fmtMoney(q.total)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )
        }
      </DialogContent>
    </Dialog>
  )
}

// ── Dialog: Imprimir cotización ───────────────────────────────────────────────

/**
 * Genera HTML autocontenido (tamaño carta) para la cotización.
 * @param {{ q: any, items: any[], bizName: string, taxEnabled: boolean }} opts
 */
/** @param {{ q: any, items: any[], bizName: string, taxEnabled: boolean, logoDataUrl?: string }} _ */
function buildQuoteHtml({ q, items, bizName, taxEnabled, logoDataUrl = '' }) {
  const fmtM = (n) => new Intl.NumberFormat('es-GT', { style: 'currency', currency: 'GTQ' }).format(n ?? 0)
  const fmtD = (s) => s ? new Intl.DateTimeFormat('es-GT', { dateStyle: 'long' }).format(new Date(s + 'T00:00:00')) : '—'

  const itemRows = items.map((it) => `
    <tr>
      <td>${it.product_code ? `<span style="color:#888;font-size:11px">${it.product_code} · </span>` : ''}${it.product_name}</td>
      <td style="text-align:right">${it.qty}</td>
      <td style="text-align:right">${fmtM(it.unit_price)}</td>
      <td style="text-align:right;font-weight:600">${fmtM(it.subtotal)}</td>
    </tr>`).join('')

  const taxRow = taxEnabled
    ? `<tr><td colspan="3" style="text-align:right;padding:2px 8px;color:#555">IVA (${(q.tax_rate * 100).toFixed(0)}%)</td><td style="text-align:right;padding:2px 8px">${fmtM(q.tax_amount)}</td></tr>`
    : ''

  return `<!DOCTYPE html><html><head><meta charset="utf-8">
  <title>Cotización #${q.id}</title>
  <style>
    @page { size: letter; margin: 18mm 18mm 20mm; }
    body { font-family: Arial, sans-serif; font-size: 12px; color: #111; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #111; padding-bottom: 10px; margin-bottom: 14px; }
    .biz-name { font-size: 15px; font-weight: bold; }
    .doc-title { font-size: 20px; font-weight: bold; text-align: right; }
    .doc-num { font-size: 13px; color: #444; text-align: right; }
    .meta { display: flex; justify-content: space-between; margin-bottom: 18px; font-size: 11.5px; }
    .meta-label { color: #666; font-size: 10px; text-transform: uppercase; letter-spacing: .5px; }
    .meta-value { font-weight: 600; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 14px; }
    thead tr { background: #222; color: #fff; }
    th { padding: 6px 8px; font-size: 11px; }
    td { padding: 5px 8px; border-bottom: 1px solid #eee; font-size: 12px; }
    tr:nth-child(even) td { background: #f7f7f7; }
    .totals { margin-left: auto; width: 280px; border-top: 1px solid #ccc; padding-top: 8px; }
    .totals tr td { border: none; padding: 3px 8px; }
    .total-final td { font-size: 14px; font-weight: bold; border-top: 2px solid #111; padding-top: 6px; }
    .notes { margin-top: 16px; font-size: 11px; color: #444; border-top: 1px dashed #ccc; padding-top: 8px; }
    .footer { margin-top: 30px; text-align: center; font-size: 10px; color: #888; border-top: 1px solid #eee; padding-top: 8px; }
  </style></head><body>
  <div class="header">
    ${logoDataUrl
      ? `<img src="${logoDataUrl}" alt="Logo" style="height:110px;max-width:45%;object-fit:contain;" />`
      : `<div class="biz-name">${bizName}</div>`
    }
    <div>
      <div class="doc-title">COTIZACIÓN</div>
      <div class="doc-num"># ${q.id}</div>
    </div>
  </div>
  <div class="meta">
    <div>
      <div class="meta-label">Cliente</div>
      <div class="meta-value">${q.customer_name}</div>
      ${q.customer_nit ? `<div style="font-size:11px;color:#555">NIT: ${q.customer_nit}</div>` : ''}
    </div>
    <div style="text-align:right">
      <div class="meta-label">Fecha</div>
      <div class="meta-value">${fmtD(q.created_at?.slice(0,10))}</div>
      ${q.valid_until ? `<div class="meta-label" style="margin-top:6px">Válida hasta</div><div class="meta-value">${fmtD(q.valid_until)}</div>` : ''}
    </div>
  </div>
  <table>
    <thead><tr>
      <th style="text-align:left">Descripción</th>
      <th style="text-align:right;width:60px">Cant.</th>
      <th style="text-align:right;width:110px">Precio unit.</th>
      <th style="text-align:right;width:110px">Subtotal</th>
    </tr></thead>
    <tbody>${itemRows}</tbody>
  </table>
  <table class="totals">
    <tbody>
      <tr><td colspan="3" style="text-align:right;color:#555">Subtotal</td><td style="text-align:right">${fmtM(q.subtotal)}</td></tr>
      ${taxRow}
      <tr class="total-final"><td colspan="3" style="text-align:right">TOTAL</td><td style="text-align:right">${fmtM(q.total)}</td></tr>
    </tbody>
  </table>
  ${q.notes ? `<div class="notes"><strong>Notas:</strong> ${q.notes}</div>` : ''}
  <div class="footer">Gracias por su preferencia · ${bizName} · Generado el ${new Date().toLocaleDateString('es-GT')}</div>
  </body></html>`
}

function QuotePrintDialog({ id, onClose }) {
  const { data, isLoading } = useQuote(id)
  const { name: bizName } = useBusinessSettings()
  const { enabled: taxEnabled } = useTaxSettings()
  const [printing, setPrinting] = useState(false)
  const logoDataUrl = logoCotizacionSrc
  const q = data?.quote

  async function handlePrint() {
    if (!q || !data) return
    setPrinting(true)
    try {
      const anyApi = /** @type {any} */ (window.api)
      const settingsRes = await anyApi.settings.getAll()
      const printer = settingsRes?.data?.default_printer ?? ''

      const html = buildQuoteHtml({ q, items: data.items, bizName, taxEnabled, logoDataUrl })
      const res = await anyApi.printer.print(html, printer, 'letter')
      if (res?.ok) {
        toast.success('Cotización enviada a imprimir')
        onClose()
      } else {
        toast.error('Error al imprimir: ' + (res?.error?.message ?? 'desconocido'))
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al imprimir')
    } finally {
      setPrinting(false)
    }
  }

  return (
    <Dialog open={!!id} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Printer className="h-5 w-5" /> Imprimir cotización #{id}
          </DialogTitle>
          <DialogDescription>
            Vista previa · Tamaño carta · Se enviará a la impresora configurada
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto border rounded-md p-4 bg-white text-sm">
          {isLoading
            ? <LoadingSpinner label="Cargando..." />
            : q && (
              <div>
                {/* Encabezado */}
                <div className="flex justify-between items-start border-b-2 border-black pb-3 mb-4">
                  {logoDataUrl
                    ? <img src={logoDataUrl} alt="Logo" className="w-auto object-contain" style={{ height: '130px', maxWidth: '65%' }} />
                    : <div style={{ height: '130px', maxWidth: '65%' }} />
                  }
                  <div className="text-right">
                    <div className="text-xl font-bold">COTIZACIÓN</div>
                    <div className="text-sm text-muted-foreground"># {q.id}</div>
                  </div>
                </div>

                {/* Meta */}
                <div className="flex justify-between mb-4 text-xs">
                  <div>
                    <div className="text-gray-500 uppercase tracking-wide">Cliente</div>
                    <div className="font-semibold">{q.customer_name}</div>
                    {q.customer_nit && <div className="text-gray-500">NIT: {q.customer_nit}</div>}
                  </div>
                  <div className="text-right">
                    <div className="text-gray-500 uppercase tracking-wide">Fecha</div>
                    <div className="font-semibold">{fmtDate(q.created_at?.slice(0,10))}</div>
                    {q.valid_until && (
                      <>
                        <div className="text-gray-500 uppercase tracking-wide mt-1">Válida hasta</div>
                        <div className="font-semibold">{fmtDate(q.valid_until)}</div>
                      </>
                    )}
                  </div>
                </div>

                {/* Items */}
                <table className="w-full text-xs border-collapse mb-3">
                  <thead>
                    <tr className="bg-gray-800 text-white">
                      <th className="text-left p-1.5">Descripción</th>
                      <th className="text-right p-1.5 w-12">Cant.</th>
                      <th className="text-right p-1.5 w-24">Precio unit.</th>
                      <th className="text-right p-1.5 w-24">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.items.map((it, i) => (
                      <tr key={it.id} className={i % 2 === 0 ? 'bg-gray-50' : ''}>
                        <td className="p-1.5">
                          {it.product_code && <span className="text-gray-400 mr-1">{it.product_code} ·</span>}
                          {it.product_name}
                        </td>
                        <td className="text-right p-1.5">{it.qty}</td>
                        <td className="text-right p-1.5">{fmtMoney(it.unit_price)}</td>
                        <td className="text-right p-1.5 font-semibold">{fmtMoney(it.subtotal)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {/* Totales */}
                <div className="ml-auto w-60 border-t pt-2 text-xs space-y-1">
                  <div className="flex justify-between"><span className="text-gray-500">Subtotal</span><span>{fmtMoney(q.subtotal)}</span></div>
                  {taxEnabled && (
                    <div className="flex justify-between"><span className="text-gray-500">IVA ({(q.tax_rate * 100).toFixed(0)}%)</span><span>{fmtMoney(q.tax_amount)}</span></div>
                  )}
                  <div className="flex justify-between font-bold text-sm border-t pt-1"><span>TOTAL</span><span>{fmtMoney(q.total)}</span></div>
                </div>

                {q.notes && (
                  <div className="mt-3 text-xs text-gray-600 border-t border-dashed pt-2">
                    <span className="font-semibold">Notas: </span>{q.notes}
                  </div>
                )}
              </div>
            )
          }
        </div>

        <DialogFooter className="gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>Cerrar</Button>
          <Button type="button" disabled={!q || printing} onClick={handlePrint}>
            <Printer className="mr-1 h-4 w-4" />
            {printing ? 'Imprimiendo...' : 'Imprimir (carta)'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
