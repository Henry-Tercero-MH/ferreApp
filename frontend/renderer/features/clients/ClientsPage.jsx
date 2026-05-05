import { useState } from 'react'
import { Pencil, Plus, Power, PowerOff, Search, UserRound, Users } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input }  from '@/components/ui/input'

import { PageHeader }     from '@/components/shared/PageHeader'
import { EmptyState }     from '@/components/shared/EmptyState'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'

import { useSearchCustomers, useToggleCustomerActive } from '@/hooks/useCustomers'
import { CustomerFormDialog } from './CustomerFormDialog'


export default function ClientsPage() {
  const [query,    setQuery]    = useState('')
  const [editing,  setEditing]  = useState(/** @type {import('@/schemas/customer.schema').Customer | null} */ (null))
  const [creating, setCreating] = useState(false)

  const { data: customers = [], isLoading, isError, error, refetch } =
    useSearchCustomers(query, { includeInactive: true })

  const toggleActive = useToggleCustomerActive()

  const activeCount   = customers.filter(c => c.active === 1).length
  const inactiveCount = customers.filter(c => c.active === 0).length

  return (
    <div className="sh-shell">
      <div className="sh-header-row">
        <PageHeader
          title="Clientes"
          subtitle="Directorio de clientes para facturación y órdenes de trabajo"
        />
        <Button size="sm" onClick={() => setCreating(true)} className="shrink-0 self-start mt-1">
          <Plus className="mr-1.5 h-4 w-4" /> Nuevo cliente
        </Button>
      </div>

      {/* Stat chips */}
      <div className="cl-stats">
        <div className="cl-stat">
          <Users className="h-4 w-4 text-primary" />
          <span className="cl-stat-num">{customers.length}</span>
          <span className="cl-stat-label">total</span>
        </div>
        <div className="cl-stat-sep" />
        <div className="cl-stat">
          <span className="cl-stat-dot cl-dot-green" />
          <span className="cl-stat-num">{activeCount}</span>
          <span className="cl-stat-label">activos</span>
        </div>
        {inactiveCount > 0 && (
          <>
            <div className="cl-stat-sep" />
            <div className="cl-stat">
              <span className="cl-stat-dot cl-dot-gray" />
              <span className="cl-stat-num">{inactiveCount}</span>
              <span className="cl-stat-label">inactivos</span>
            </div>
          </>
        )}
      </div>

      {/* Buscador */}
      <div className="cl-search-row">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Buscar por nombre o NIT..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-8 h-8 text-xs w-72"
          />
        </div>
      </div>

      {/* Cuerpo */}
      {isLoading && <LoadingSpinner label="Cargando clientes..." className="justify-center py-16" />}

      {isError && (
        <EmptyState
          title="No se pudo cargar el directorio"
          description={error instanceof Error ? error.message : 'Error desconocido'}
          action={<Button variant="outline" size="sm" onClick={() => refetch()}>Reintentar</Button>}
        />
      )}

      {!isLoading && !isError && customers.length === 0 && (
        <EmptyState
          title={query ? 'Sin coincidencias' : 'No hay clientes todavía'}
          description={query ? 'Prueba con otro nombre o NIT.' : 'Crea el primer cliente con el botón superior.'}
          icon={<Users className="h-10 w-10 opacity-25" />}
        />
      )}

      {!isLoading && !isError && customers.length > 0 && (
        <div className="sh-table-card">
          <div className="sh-table-scroll">
            <table className="sh-table">
              <thead>
                <tr>
                  <th className="sh-th">Cliente</th>
                  <th className="sh-th w-32">NIT</th>
                  <th className="sh-th w-48">Email</th>
                  <th className="sh-th w-32">Teléfono</th>
                  <th className="sh-th w-20">Estado</th>
                  <th className="sh-th w-48 text-right" />
                </tr>
              </thead>
              <tbody>
                {customers.map((c, idx) => {
                  const isProtected = c.is_system === 1
                  const inactive    = c.active === 0
                  const rowCls = inactive
                    ? 'sh-tr-voided'
                    : idx % 2 === 0 ? 'sh-tr-even' : 'sh-tr-odd'
                  return (
                    <tr key={c.id} className={rowCls}>
                      <td className="sh-td">
                        <div className="flex items-center gap-2">
                          <UserRound className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                          <div className="min-w-0">
                            <span className="inv-name">{c.name}</span>
                            {isProtected && (
                              <span className="cl-sys-badge">Sistema</span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="sh-td sh-nit">{c.nit}</td>
                      <td className="sh-td sh-client-type" style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {c.email || <span className="sh-nit italic">—</span>}
                      </td>
                      <td className="sh-td sh-nit">{c.phone || '—'}</td>
                      <td className="sh-td">
                        {c.active === 1
                          ? <span className="cl-badge-active">Activo</span>
                          : <span className="cl-badge-inactive">Inactivo</span>
                        }
                      </td>
                      <td className="sh-td">
                        <div className="inv-actions">
                          <button
                            className="inv-btn"
                            onClick={() => setEditing(c)}
                            disabled={isProtected}
                            title={isProtected ? 'Cliente del sistema' : 'Editar'}
                          >
                            <Pencil className="h-3 w-3" /> Editar
                          </button>
                          {c.active === 1 ? (
                            <button
                              className="inv-btn inv-btn-danger"
                              onClick={() => toggleActive.mutate({ id: c.id, active: false })}
                              disabled={isProtected || toggleActive.isPending}
                              title={isProtected ? 'Cliente del sistema' : 'Desactivar'}
                            >
                              <PowerOff className="h-3 w-3" /> Desactivar
                            </button>
                          ) : (
                            <button
                              className="inv-btn inv-btn-restore"
                              onClick={() => toggleActive.mutate({ id: c.id, active: true })}
                              disabled={toggleActive.isPending}
                            >
                              <Power className="h-3 w-3" /> Activar
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div className="sh-pagination">
            <div className="sh-pag-info">
              <Users className="h-3.5 w-3.5 text-muted-foreground" />
              <span><strong>{customers.length}</strong> cliente{customers.length === 1 ? '' : 's'}{query && ' encontrados'}</span>
            </div>
          </div>
        </div>
      )}

      <CustomerFormDialog open={creating} onOpenChange={setCreating} />
      <CustomerFormDialog
        open={editing != null}
        onOpenChange={(open) => { if (!open) setEditing(null) }}
        initial={editing}
      />
    </div>
  )
}
