import { useState, useRef, useEffect } from 'react'
import { Check, ChevronDown, Plus, Search, UserRound, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { useCustomer, useSearchCustomers, useCreateCustomer } from '@/hooks/useCustomers'
import { cn } from '@/lib/utils'

/**
 * Combobox compacto de cliente para POS y cotizaciones.
 *
 * @param {{
 *   value: number | null,
 *   onChange: (id: number | null) => void,
 *   onSelectFull?: (customer: import('@/schemas/customer.schema.js').Customer) => void,
 *   excludeIds?: number[],
 * }} props
 */
export function CustomerCombobox({ value, onChange, onSelectFull, excludeIds = [] }) {
  const [open, setOpen]       = useState(false)
  const [creating, setCreating] = useState(false)
  const [query, setQuery]     = useState('')
  const containerRef          = useRef(/** @type {HTMLDivElement|null} */ (null))

  const { data: selected } = useCustomer(value)

  // Cierra el dropdown si se hace click fuera
  useEffect(() => {
    if (!open) return
    function handler(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false)
        setCreating(false)
        setQuery('')
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  function handleSelect(id, customer) {
    onChange(id)
    if (onSelectFull && customer) onSelectFull(customer)
    setOpen(false)
    setCreating(false)
    setQuery('')
  }

  function handleClear(e) {
    e.stopPropagation()
    onChange(null)
    setQuery('')
  }

  return (
    <div ref={containerRef} className="relative">
      {/* Trigger */}
      <button
        type="button"
        onClick={() => { setOpen((o) => !o); setCreating(false) }}
        className={cn(
          'flex w-full items-center justify-between gap-2',
          'h-8 rounded-md border border-input bg-background px-2.5 text-xs',
          'hover:bg-muted/50 focus:outline-none focus:ring-1 focus:ring-ring',
          open && 'ring-1 ring-ring'
        )}
      >
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          <UserRound className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          {selected ? (
            <span className="truncate font-medium">{selected.name}</span>
          ) : (
            <span className="text-muted-foreground">Seleccionar cliente...</span>
          )}
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          {selected && (
            <span
              role="button"
              tabIndex={0}
              onClick={handleClear}
              onKeyDown={(e) => e.key === 'Enter' && handleClear(e)}
              className="flex h-4 w-4 items-center justify-center rounded hover:text-destructive"
            >
              <X className="h-3 w-3" />
            </span>
          )}
          <ChevronDown className={cn('h-3.5 w-3.5 text-muted-foreground transition-transform', open && 'rotate-180')} />
        </div>
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 rounded-md border bg-popover shadow-lg">
          {creating ? (
            <div className="p-2">
              <QuickCreateForm
                initialName={query}
                onCancel={() => setCreating(false)}
                onCreated={(newId) => handleSelect(newId)}
              />
            </div>
          ) : (
            <CustomerSearchPanel
              query={query}
              setQuery={setQuery}
              selectedId={value}
              onSelect={(id, customer) => handleSelect(id, customer)}
              onRequestCreate={() => setCreating(true)}
              excludeIds={excludeIds}
            />
          )}
        </div>
      )}
    </div>
  )
}

/**
 * @param {{
 *   query: string,
 *   setQuery: (q: string) => void,
 *   selectedId: number | null,
 *   onSelect: (id: number, customer: any) => void,
 *   onRequestCreate: () => void,
 *   excludeIds?: number[],
 * }} props
 */
function CustomerSearchPanel({ query, setQuery, selectedId, onSelect, onRequestCreate, excludeIds = [] }) {
  const { data: rawResults = [], isLoading } = useSearchCustomers(query)
  const results = rawResults.filter(c => !excludeIds.includes(c.id))

  return (
    <>
      <div className="p-1.5 border-b">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por nombre o NIT..."
            className="h-7 pl-7 text-xs"
            autoFocus
          />
        </div>
      </div>

      <div className="max-h-44 overflow-y-auto">
        {isLoading && (
          <div className="py-3 text-center text-xs text-muted-foreground">Buscando...</div>
        )}
        {!isLoading && results.length === 0 && (
          <div className="py-3 text-center text-xs text-muted-foreground">
            {query ? 'Sin coincidencias.' : 'Escribe para buscar.'}
          </div>
        )}
        {!isLoading && results.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => onSelect(c.id, c)}
            className={cn(
              'flex w-full items-center justify-between px-2.5 py-1.5 text-left',
              'hover:bg-muted/60 focus:bg-muted focus:outline-none',
              selectedId === c.id && 'bg-muted'
            )}
          >
            <div className="min-w-0">
              <p className="truncate text-xs font-medium">{c.name}</p>
              <p className="text-xs text-muted-foreground font-mono">{c.nit}</p>
            </div>
            {selectedId === c.id && <Check className="h-3.5 w-3.5 text-primary shrink-0" />}
            {c.id === 1 && selectedId !== c.id && (
              <Badge variant="secondary" className="text-xs shrink-0">C/F</Badge>
            )}
          </button>
        ))}
      </div>

      <div className="p-1.5 border-t">
        <button
          type="button"
          onClick={onRequestCreate}
          className="flex w-full items-center justify-center gap-1 rounded-md py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <Plus className="h-3.5 w-3.5" /> Nuevo cliente
        </button>
      </div>
    </>
  )
}

/**
 * @param {{
 *   initialName?: string,
 *   onCancel: () => void,
 *   onCreated: (id: number) => void,
 * }} props
 */
function QuickCreateForm({ initialName = '', onCancel, onCreated }) {
  const [name, setName]   = useState(initialName)
  const [nit, setNit]     = useState('')
  const [phone, setPhone] = useState('')

  const createMutation = useCreateCustomer()
  const disabled = createMutation.isPending || name.trim().length < 2

  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium">Nuevo cliente</p>
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Nombre *"
        className="h-7 text-xs"
        autoFocus
      />
      <Input
        value={nit}
        onChange={(e) => setNit(e.target.value)}
        placeholder="NIT (vacío = C/F)"
        className="h-7 text-xs"
      />
      <Input
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        placeholder="Teléfono (opcional)"
        className="h-7 text-xs"
      />
      <div className="flex gap-1.5 pt-0.5">
        <Button type="button" variant="outline" size="sm" className="flex-1 h-7 text-xs"
          onClick={onCancel} disabled={createMutation.isPending}>
          Cancelar
        </Button>
        <Button type="button" size="sm" className="flex-1 h-7 text-xs"
          disabled={disabled}
          onClick={() => {
            createMutation.mutate(
              { name: name.trim(), nit: nit.trim(), phone: phone.trim() || null },
              { onSuccess: (customer) => onCreated(customer.id) }
            )
          }}
        >
          {createMutation.isPending ? 'Creando...' : 'Crear'}
        </Button>
      </div>
    </div>
  )
}
