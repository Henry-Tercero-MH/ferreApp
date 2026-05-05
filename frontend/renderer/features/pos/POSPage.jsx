import { useState, useEffect } from 'react'
import { Minus, Plus, Pencil, Search, ShoppingCart, Trash2, X, Lock } from 'lucide-react'
import { toast } from 'sonner'
import { useNavigate } from 'react-router-dom'
import { useOpenSession } from '@/hooks/useCash'
import { ROUTES } from '@/lib/constants'

import { Button }   from '@/components/ui/button'
import { Input }    from '@/components/ui/input'
import { Badge }    from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'

import { LoadingSpinner }   from '@/components/shared/LoadingSpinner'
import { EmptyState }       from '@/components/shared/EmptyState'
import { MoneyDisplay }     from '@/components/shared/MoneyDisplay'
import { CustomerCombobox } from '@/components/shared/CustomerCombobox'

import { useSearchProducts, useCreateSale } from '@/hooks/useProducts'
import { useTaxSettings, useCurrencySettings, useBusinessSettings } from '@/hooks/useSettings'
import { useCreateReceivable, useCustomerBalance } from '@/hooks/useReceivables'
import { useSystemCustomers } from '@/hooks/useCustomers'
import { useAuthContext } from '@/features/auth/AuthContext'
import { ReceiptModal } from './ReceiptModal'
import { useCartStore, selectSubtotal, selectItemCount, selectDiscount } from '@/stores/cartStore'
import { computeBreakdown } from '@/lib/pricing'

const DEFAULT_CUSTOMER_ID = 1

/** @type {{ value: 'cash'|'credit', label: string }[]} */
const PAYMENT_METHODS = [
  { value: 'cash',   label: 'Efectivo' },
  { value: 'credit', label: 'Crédito'  },
]

/** @type {{ value: 'cf'|'registered'|'company', label: string }[]} */
const CLIENT_TYPES = [
  { value: 'cf',         label: 'C/F' },
  { value: 'registered', label: 'Cliente Registrado' },
  { value: 'company',    label: 'Empresa' },
]

/** Guard: verifica que haya caja abierta antes de renderizar el POS */
export default function POSPage() {
  const navigate = useNavigate()
  const { data: openSession, isLoading: loadingSession } = useOpenSession()

  if (loadingSession) {
    return (
      <div className="cx-pos-block-wrap">
        <div className="cx-pos-block">
          <div className="cx-pos-block-spinner" />
          <p className="cx-pos-block-text">Verificando estado de caja...</p>
        </div>
      </div>
    )
  }

  if (!openSession) {
    return (
      <div className="cx-pos-block-wrap">
        <div className="cx-pos-block">
          <Lock className="cx-pos-block-icon" />
          <h2 className="cx-pos-block-title">Caja cerrada</h2>
          <p className="cx-pos-block-text">Para facturar, el administrador debe abrir la caja primero.</p>
          <button className="cx-pos-block-btn" onClick={() => navigate(ROUTES.CASH)}>
            Ir a caja
          </button>
        </div>
      </div>
    )
  }

  return <POSInner />
}

function POSInner() {
  const [query,         setQuery]         = useState('')
  const [category,      setCategory]      = useState('all')
  const [customerId,    setCustomerId]     = useState(/** @type {number|null} */ (DEFAULT_CUSTOMER_ID))
  const [paymentMethod, setPaymentMethod] = useState(/** @type {'cash'|'credit'|'card'|'transfer'} */ ('cash'))
  const [clientType,    setClientType]    = useState(/** @type {'cf'|'registered'|'company'} */ ('cf'))
  const [editingQtyId,  setEditingQtyId]  = useState(/** @type {number|null} */ (null))
  const [editingQtyVal, setEditingQtyVal] = useState('')

  const { data: products = [], isLoading, isError, error, refetch } = useSearchProducts(query)

  const items       = useCartStore((s) => s.items)
  const addItem     = useCartStore((s) => s.addItem)
  const removeItem  = useCartStore((s) => s.removeItem)
  const updateQty   = useCartStore((s) => s.updateQuantity)
  const updatePrice = useCartStore((s) => s.updatePrice)
  const clearCart   = useCartStore((s) => s.clear)
  const setDiscount = useCartStore((s) => s.setDiscount)
  const itemCount   = useCartStore(selectItemCount)
  const rawSum      = useCartStore(selectSubtotal)
  const discount    = useCartStore(selectDiscount)

  const { rate: taxRate, included: taxIncluded, enabled: taxEnabled } = useTaxSettings()
  const { decimals } = useCurrencySettings()
  const breakdown = computeBreakdown(rawSum, taxRate, taxIncluded, decimals, discount.type, discount.value, taxEnabled)
  const businessSettings = useBusinessSettings()
  const { user } = useAuthContext()

  const [receiptData, setReceiptData] = useState(/** @type {any} */ (null))

  const createSale       = useCreateSale()
  const createReceivable = useCreateReceivable()

  const { data: customerBalance } = useCustomerBalance(customerId)
  const { empresa: empresaDefault } = useSystemCustomers()

  // Al cambiar tipo de cliente, asignar el ID por defecto correspondiente
  useEffect(() => {
    if (clientType === 'cf')      setCustomerId(DEFAULT_CUSTOMER_ID)
    if (clientType === 'company') setCustomerId(empresaDefault?.id ?? null)
  }, [clientType, empresaDefault?.id])

  // Al seleccionar crédito, quitar CF y limpiar el cliente seleccionado
  useEffect(() => {
    if (paymentMethod === 'credit' && clientType === 'cf') {
      setClientType('registered')
      setCustomerId(null)
    }
  }, [paymentMethod])

  // Categorías únicas de los productos cargados
  const categories = ['all', ...new Set(products.map(p => p.category).filter(Boolean))]

  const filtered = category === 'all'
    ? products
    : products.filter(p => p.category === category)

  function handleConfirm() {
    const systemIds = [DEFAULT_CUSTOMER_ID, empresaDefault?.id].filter(Boolean)
    if (clientType === 'registered' && (customerId === null || systemIds.includes(/** @type {number} */ (customerId)))) {
      toast.error('Selecciona un cliente válido para factura con cliente registrado.')
      return
    }
    if (paymentMethod === 'credit' && clientType === 'cf') {
      toast.error('No se puede facturar a Consumidor Final con crédito')
      return
    }
    createSale.mutate(
      {
        items: items.map((i) => ({ id: i.productId, qty: i.qty, price: i.price })),
        customerId:    customerId ?? DEFAULT_CUSTOMER_ID,
        paymentMethod: /** @type {'cash'|'credit'|'card'|'transfer'} */ (paymentMethod),
        clientType:    /** @type {'cf'|'registered'|'company'} */ (clientType),
        discountType:  discount.type,
        discountValue: discount.value,
        userId:        user?.id,
        userName:      user?.full_name,
      },
      {
        onSuccess: (result) => {
          setReceiptData({
            saleId:        result.saleId,
            date:          new Date(),
            items:         items.map(i => ({ name: i.name, qty: i.qty, price: i.price })),
            customerName:  result.customerName,
            customerNit:   result.customerNit,
            paymentMethod,
            discount,
            subtotal:      result.subtotal,
            taxAmount:     result.taxAmount,
            total:         result.total,
            taxRate:       result.taxRate,
            discountAmount: breakdown.discountAmount,
          })
          if (paymentMethod === 'credit') {
            createReceivable.mutate({
              customerId:   result.customerId > 1 ? result.customerId : undefined,
              customerName: result.customerName,
              customerNit:  result.customerNit || undefined,
              description:  `Venta #${String(result.saleId).padStart(6, '0')}`,
              amount:       result.total,
              userId:       user?.id ?? 0,
              userName:     user?.full_name ?? 'Sistema',
            })
          }
          clearCart()
          toast.success('Venta registrada')
        },
      }
    )
  }

  return (
    <>
    <div className="pos-shell">
      {/* ── Panel izquierdo: catálogo ── */}
      <div className="pos-catalog">
        {/* Barra de búsqueda + filtro */}
        <div className="pos-search-bar">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar por código o nombre del producto/servicio..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-8 h-8 text-xs"
            />
          </div>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="h-8 rounded-md border border-input bg-background px-2 text-xs"
          >
            {categories.map(c => (
              <option key={c} value={c}>{c === 'all' ? 'Categoría' : c}</option>
            ))}
          </select>
        </div>

        {/* Tabla de productos */}
        <div className="pos-table-wrap">
          {isLoading ? (
            <div className="flex h-32 items-center justify-center">
              <LoadingSpinner />
            </div>
          ) : isError ? (
            <EmptyState
              title="No se pudo cargar el catálogo"
              description={error instanceof Error ? error.message : 'Error desconocido'}
              action={<Button variant="outline" size="sm" onClick={() => refetch()}>Reintentar</Button>}
            />
          ) : filtered.length === 0 ? (
            <EmptyState title="Sin resultados" description="Ajusta los términos de búsqueda." />
          ) : (
            <table className="pos-table">
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Descripción</th>
                  <th>Precio</th>
                  <th>Stock</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => (
                  <tr key={p.id}>
                    <td><span className="pos-code">{p.code}</span></td>
                    <td className="pos-name">{p.name}</td>
                    <td><MoneyDisplay amount={p.price} /></td>
                    <td>
                      {p.stock > 100 ? (
                        <span className="pos-stock-inf">ilimitado ∞</span>
                      ) : p.stock > 0 ? (
                        <span className={p.stock <= 3 ? 'pos-stock-low' : ''}>{p.stock}</span>
                      ) : (
                        <Badge variant="destructive" className="text-xs">Sin stock</Badge>
                      )}
                    </td>
                    <td className="text-right">
                      <Button
                        size="sm"
                        className="h-7 px-2 text-xs"
                        disabled={p.stock <= 0 || createSale.isPending}
                        onClick={() => { addItem(p); toast.success(`${p.name}`) }}
                      >
                        <Plus className="mr-1 h-3 w-3" /> Agregar
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

      </div>

      {/* ── Panel derecho: carrito + pago ── */}
      <div className="pos-cart">
        {/* Header */}
        <div className="pos-cart-header">
          <ShoppingCart className="h-4 w-4" />
          <span className="font-semibold text-sm">Detalle de Factura</span>
          {itemCount > 0 && (
            <Badge variant="secondary" className="ml-auto text-xs">{itemCount}</Badge>
          )}
        </div>

        {/* Items */}
        <div className="pos-cart-items">
          {items.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
              <ShoppingCart className="h-8 w-8 opacity-30" />
              <p className="text-xs text-center">Carrito vacío<br/>Agrega productos desde el panel izquierdo.</p>
            </div>
          ) : (
            <ul className="space-y-1.5">
              {items.map((it) => (
                <li key={it.productId} className="pos-cart-item">
                  <div className="flex items-start justify-between gap-1 mb-1">
                    <p className="text-xs font-medium leading-tight truncate flex-1">{it.name}</p>
                    <MoneyDisplay amount={it.price * it.qty} className="text-xs font-bold text-primary shrink-0" />
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={it.price}
                        onChange={e => updatePrice(it.productId, parseFloat(e.target.value) || 0)}
                        className="w-16 bg-transparent border-b border-dashed border-muted-foreground/40 focus:border-primary focus:outline-none text-xs text-right pr-0.5"
                      />
                      <span>c/u</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <div className="flex items-center gap-0.5 rounded border bg-muted/40 px-0.5">
                        <button
                          className="flex h-5 w-5 items-center justify-center text-muted-foreground hover:text-foreground"
                          onClick={() => updateQty(it.productId, it.qty - 1)}
                        >
                          <Minus className="h-2.5 w-2.5" />
                        </button>
                        {editingQtyId === it.productId ? (
                          <input
                            type="number"
                            min="0.01"
                            step="0.01"
                            autoFocus
                            value={editingQtyVal}
                            onChange={e => setEditingQtyVal(e.target.value)}
                            onBlur={() => {
                              const v = parseFloat(editingQtyVal)
                              updateQty(it.productId, v > 0 ? v : it.qty)
                              setEditingQtyId(null)
                            }}
                            onKeyDown={e => {
                              if (e.key === 'Enter') e.target.blur()
                              if (e.key === 'Escape') { setEditingQtyId(null) }
                            }}
                            className="w-12 bg-transparent text-center text-xs focus:outline-none"
                          />
                        ) : (
                          <span className="w-6 text-center text-xs">{it.qty}</span>
                        )}
                        <button
                          className="flex h-5 w-5 items-center justify-center text-muted-foreground hover:text-foreground"
                          onClick={() => updateQty(it.productId, it.qty + 1)}
                        >
                          <Plus className="h-2.5 w-2.5" />
                        </button>
                      </div>
                      <button
                        className="flex h-5 w-5 items-center justify-center text-blue-500 hover:bg-blue-500/10 rounded"
                        title="Editar cantidad"
                        onClick={() => { setEditingQtyId(it.productId); setEditingQtyVal(String(it.qty)) }}
                      >
                        <Pencil className="h-3 w-3" />
                      </button>
                      <button
                        className="flex h-5 w-5 items-center justify-center text-destructive hover:bg-destructive/10 rounded"
                        onClick={() => removeItem(it.productId)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Descuento */}
        <Separator />
        <div className="pos-discount">
          <span className="text-xs font-medium text-muted-foreground">Descuento</span>
          <div className="flex gap-1 mt-1">
            {[
              { v: 'none',    l: 'Ninguno' },
              { v: 'percent', l: '%' },
              { v: 'fixed',   l: 'Q fijo' },
            ].map(({ v, l }) => (
              <button
                key={v}
                type="button"
                onClick={() => setDiscount(v, v === 'none' ? 0 : discount.value)}
                className={[
                  'flex-1 rounded border py-1 text-xs font-medium transition-colors',
                  discount.type === v ? 'border-primary bg-primary text-white' : 'border-border hover:bg-muted',
                ].join(' ')}
              >{l}</button>
            ))}
          </div>
          {discount.type !== 'none' && (
            <input
              type="number"
              min="0"
              step={discount.type === 'percent' ? '1' : '0.01'}
              max={discount.type === 'percent' ? '100' : undefined}
              placeholder={discount.type === 'percent' ? 'Ej. 10 (%)' : 'Ej. 25.00'}
              value={discount.value || ''}
              onChange={e => setDiscount(discount.type, parseFloat(e.target.value) || 0)}
              className="mt-1 w-full rounded-md border border-input bg-background px-2 py-1 text-xs"
            />
          )}
        </div>

        {/* Totales */}
        <Separator />
        <div className="pos-totals">
          <div className="pos-total-row text-xs text-muted-foreground">
            <span>Bruto</span>
            <MoneyDisplay amount={rawSum} />
          </div>
          {breakdown.discountAmount > 0 && (
            <div className="pos-total-row text-xs text-emerald-600">
              <span>Descuento</span>
              <span>- <MoneyDisplay amount={breakdown.discountAmount} /></span>
            </div>
          )}
          <div className="pos-total-row">
            <span>Subtotal</span>
            <MoneyDisplay amount={breakdown.subtotal} />
          </div>
          {taxEnabled && (
            <div className="pos-total-row">
              <span>IVA ({Math.round(taxRate * 100)}%)</span>
              <MoneyDisplay amount={breakdown.taxAmount} />
            </div>
          )}
          <div className="pos-total-row pos-total-main">
            <span>Total</span>
            <MoneyDisplay amount={breakdown.total} />
          </div>
        </div>

        {/* Cliente + método de pago */}
        <Separator />
        <div className="pos-payment">
          <div className="grid gap-1">
            <label className="text-xs font-medium text-muted-foreground">Cliente</label>
            {clientType === 'cf' ? (
              <div className="h-9 rounded-md border border-input bg-muted/40 px-3 flex items-center text-xs text-muted-foreground select-none">
                Consumidor Final (C/F)
              </div>
            ) : clientType === 'company' ? (
              <div className="h-9 rounded-md border border-input bg-muted/40 px-3 flex items-center text-xs text-muted-foreground select-none">
                Empresa Genérica
              </div>
            ) : (
              <CustomerCombobox value={customerId} onChange={setCustomerId} excludeIds={/** @type {number[]} */ ([DEFAULT_CUSTOMER_ID, empresaDefault?.id].filter(id => id != null))} />
            )}
            {clientType !== 'cf' && customerBalance && customerBalance.balance > 0 && (
              <div className="flex items-center gap-1.5 rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-xs text-amber-800 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                <span className="font-semibold">⚠ Deuda pendiente:</span>
                <span>{new Intl.NumberFormat('es-GT', { style: 'currency', currency: 'GTQ' }).format(customerBalance.balance)}</span>
                <span className="ml-auto text-amber-600 dark:text-amber-400">({customerBalance.rows.length} cuenta{customerBalance.rows.length !== 1 ? 's' : ''})</span>
              </div>
            )}
          </div>
          <div className="grid gap-1">
            <label className="text-xs font-medium text-muted-foreground">Método de pago</label>
            <div className="flex gap-1.5">
              {PAYMENT_METHODS.map((m) => (
                <button
                  key={m.value}
                  type="button"
                  onClick={() => setPaymentMethod(m.value)}
                  className={[
                    'flex-1 rounded-md border py-1.5 text-xs font-medium transition-colors',
                    paymentMethod === m.value
                      ? 'border-primary bg-primary text-white'
                      : 'border-border hover:bg-muted',
                  ].join(' ')}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>
          <div className="grid gap-1">
            <label className="text-xs font-medium text-muted-foreground">Tipo de cliente</label>
            <div className="flex gap-1.5">
              {CLIENT_TYPES.filter(t => paymentMethod !== 'credit' || t.value !== 'cf').map((t) => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setClientType(t.value)}
                  className={[
                    'flex-1 rounded-md border py-1.5 text-xs font-medium transition-colors',
                    clientType === t.value
                      ? 'border-primary bg-primary text-white'
                      : 'border-border hover:bg-muted',
                  ].join(' ')}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Acciones */}
        <div className="flex gap-2 px-3 pb-2 pt-1">
          <Button
            variant="outline"
            size="sm"
            className="flex-1 h-8 text-xs"
            disabled={items.length === 0 || createSale.isPending}
            onClick={clearCart}
          >
            <X className="mr-1 h-3 w-3" /> Limpiar
          </Button>
          <Button
            size="sm"
            className="flex-[2] h-8 text-xs"
            disabled={items.length === 0 || createSale.isPending || customerId == null}
            onClick={handleConfirm}
          >
            {createSale.isPending ? 'Procesando...' : 'Procesar pago'}
          </Button>
        </div>
      </div>
    </div>

    <ReceiptModal
      data={receiptData}
      business={businessSettings}
      taxEnabled={taxEnabled}
      onClose={() => setReceiptData(null)}
    />
    </>
  )
}
