import { useState, useRef, useEffect } from 'react'
import { Check, ChevronDown, Package, Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

/**
 * Combobox buscador de productos.
 *
 * Estrategia de posicionamiento:
 *   El DialogContent de Radix tiene `transform: translate(-50%,-50%)`, lo que
 *   convierte ese elemento en el "containing block" de cualquier hijo con
 *   `position: fixed`.  Aprovechamos esto para renderizar el dropdown con
 *   `position: fixed` DENTRO del árbol DOM del diálogo (sin portal): escapa
 *   el `overflow-y: auto` de `.qt-items-list` y Radix no bloquea sus eventos.
 *
 * @param {{
 *   value: number | null,
 *   onChange: (product: any) => void,
 *   products: any[],
 *   placeholder?: string,
 * }} props
 */
export function ProductCombobox({ value, onChange, products = [], placeholder = 'Seleccionar producto...' }) {
  const [open, setOpen]   = useState(false)
  const [query, setQuery] = useState('')
  const [pos, setPos]     = useState({ top: 0, left: 0, width: 0 })

  const triggerRef  = useRef(/** @type {HTMLButtonElement|null} */ (null))
  const dropdownRef = useRef(/** @type {HTMLDivElement|null} */ (null))
  const inputRef    = useRef(/** @type {HTMLInputElement|null} */ (null))

  const selected = products.find(p => p.id === value) ?? null

  const filtered = query.trim()
    ? products.filter(p =>
        p.name?.toLowerCase().includes(query.toLowerCase()) ||
        p.code?.toLowerCase().includes(query.toLowerCase())
      )
    : products

  // Cierra el dropdown al hacer click fuera
  useEffect(() => {
    if (!open) return
    function handler(/** @type {MouseEvent} */ e) {
      const t = /** @type {Node|null} */ (e.target)
      if (triggerRef.current?.contains(t) || dropdownRef.current?.contains(t)) return
      setOpen(false)
      setQuery('')
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  // Autoenfoca el buscador al abrir
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 0)
  }, [open])

  function handleOpen() {
    const triggerEl = triggerRef.current
    if (triggerEl) {
      const triggerRect = triggerEl.getBoundingClientRect()
      // El containing block de position:fixed es el DialogContent (tiene transform).
      // Buscamos el elemento [role="dialog"] para restar sus coordenadas.
      const dialogEl = triggerEl.closest('[role="dialog"]')
      const dialogRect = dialogEl?.getBoundingClientRect() ?? { top: 0, left: 0 }
      setPos({
        top:   triggerRect.bottom - dialogRect.top + 4,
        left:  triggerRect.left  - dialogRect.left,
        width: triggerRect.width,
      })
    }
    setOpen(o => !o)
  }

  function handleSelect(/** @type {any} */ product) {
    onChange(product)
    setOpen(false)
    setQuery('')
  }

  return (
    <div>
      {/* Trigger */}
      <button
        ref={triggerRef}
        type="button"
        onClick={handleOpen}
        className={cn(
          'flex w-full items-center justify-between gap-2',
          'h-8 rounded-md border border-input bg-background px-2.5 text-xs',
          'hover:bg-muted/50 focus:outline-none focus:ring-1 focus:ring-ring',
          open && 'ring-1 ring-ring'
        )}
      >
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          <Package className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          {selected ? (
            <span className="truncate font-medium">{selected.name}</span>
          ) : (
            <span className="text-muted-foreground">{placeholder}</span>
          )}
        </div>
        <ChevronDown className={cn('h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')} />
      </button>

      {/*
        Dropdown con position:fixed.
        - Escapa el overflow-y:auto de .qt-items-list
        - El containing block es el DialogContent (transform), no el viewport
        - Está dentro del DOM del diálogo → Radix no bloquea los eventos
      */}
      {open && (
        <div
          ref={dropdownRef}
          style={{
            position: 'fixed',
            top:   pos.top,
            left:  pos.left,
            width: pos.width,
            zIndex: 200,
          }}
          className="rounded-md border bg-popover shadow-lg"
        >
          {/* Buscador */}
          <div className="p-1.5 border-b">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                ref={inputRef}
                type="text"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Buscar por nombre o código..."
                className="h-7 pl-7 text-xs"
              />
            </div>
          </div>

          {/* Resultados */}
          <div className="max-h-44 overflow-y-auto">
            {filtered.length === 0 && (
              <div className="py-3 text-center text-xs text-muted-foreground">
                {query ? 'Sin coincidencias.' : 'No hay productos disponibles.'}
              </div>
            )}
            {filtered.map(p => (
              <button
                key={p.id}
                type="button"
                onClick={() => handleSelect(p)}
                className={cn(
                  'flex w-full items-center justify-between px-2.5 py-1.5 text-left',
                  'hover:bg-muted/60 focus:bg-muted focus:outline-none',
                  value === p.id && 'bg-muted'
                )}
              >
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium">{p.name}</p>
                  {p.code && (
                    <p className="text-xs text-muted-foreground font-mono">{p.code}</p>
                  )}
                </div>
                {value === p.id && <Check className="h-3.5 w-3.5 text-primary shrink-0" />}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
