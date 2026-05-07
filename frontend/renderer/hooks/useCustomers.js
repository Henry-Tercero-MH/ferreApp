import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import * as customersService from '@/services/customersService.js'
import { customerKeys } from './queryKeys.js'
import { useDebouncedValue } from './useDebouncedValue.js'
import { getNextId } from '@/services/cloudIdService.js'

/**
 * Lista para consumo operativo (POS, etc): solo activos.
 */
export function useCustomers() {
  return useQuery({
    queryKey: customerKeys.lists,
    queryFn: () => customersService.getAll(),
    staleTime: 2 * 60_000,
  })
}

/**
 * Lista completa para gestion/admin: incluye inactivos para que se puedan
 * reactivar. Distinta queryKey para que no compita con la version operativa.
 */
export function useCustomersAdmin() {
  return useQuery({
    queryKey: [...customerKeys.lists, { includeInactive: true }],
    queryFn: () => customersService.getAll({ includeInactive: true }),
    staleTime: 60_000,
  })
}

/**
 * @param {string} query
 * @param {{ enabled?: boolean, includeInactive?: boolean }} [opts]
 */
export function useSearchCustomers(query, opts = {}) {
  const debounced = useDebouncedValue(query.trim(), 250)
  const includeInactive = !!opts.includeInactive
  return useQuery({
    queryKey: [...customerKeys.search(debounced), { includeInactive }],
    queryFn: () => customersService.search(debounced, { includeInactive }),
    staleTime: 30_000,
    enabled: opts.enabled !== false,
    placeholderData: (prev) => prev,
  })
}

/**
 * @param {number | null | undefined} id
 */
export function useCustomer(id) {
  return useQuery({
    queryKey: id != null ? customerKeys.detail(id) : ['customers', 'detail', 'none'],
    queryFn: () => customersService.getById(/** @type {number} */ (id)),
    enabled: id != null,
    staleTime: 60_000,
  })
}

/**
 * Retorna los clientes del sistema { cf, empresa }.
 * Los IDs son dinámicos — no asumir que CF=1 o Empresa=2 en el renderer.
 */
export function useSystemCustomers() {
  const { data = [] } = useQuery({
    queryKey: ['customers', 'system'],
    queryFn: () => customersService.getSystemCustomers(),
    staleTime: Infinity,
  })
  const cf      = data.find(c => c.name === 'Consumidor Final') ?? null
  const empresa = data.find(c => c.name === 'Empresa Genérica') ?? null
  return { cf, empresa }
}

export function useCreateCustomer() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input) => {
      const id = await getNextId('customers')
      return customersService.create({ id, ...input })
    },
    onSuccess: (customer) => {
      qc.invalidateQueries({ queryKey: customerKeys.all })
      toast.success(`Cliente creado: ${customer.name}`)
    },
    onError: (err) => {
      toast.error('No se pudo crear el cliente', {
        description: err instanceof Error ? err.message : 'Error desconocido',
      })
    },
  })
}

/**
 * @typedef {{ id: number, patch: import('@/types/api').CustomerUpdateInput }} UpdateArgs
 */

export function useUpdateCustomer() {
  const qc = useQueryClient()
  return useMutation({
    /** @param {UpdateArgs} args */
    mutationFn: ({ id, patch }) => customersService.update(id, patch),
    onSuccess: (customer) => {
      qc.invalidateQueries({ queryKey: customerKeys.all })
      toast.success(`Cliente actualizado: ${customer.name}`)
    },
    onError: (err) => {
      toast.error('No se pudo actualizar el cliente', {
        description: err instanceof Error ? err.message : 'Error desconocido',
      })
    },
  })
}

/**
 * @typedef {{ id: number, active: boolean }} ToggleArgs
 */

export function useToggleCustomerActive() {
  const qc = useQueryClient()
  return useMutation({
    /** @param {ToggleArgs} args */
    mutationFn: ({ id, active }) => customersService.setActive(id, active),
    onSuccess: (_res, { active }) => {
      qc.invalidateQueries({ queryKey: customerKeys.all })
      toast.success(active ? 'Cliente activado' : 'Cliente desactivado')
    },
    onError: (err) => {
      toast.error('No se pudo cambiar el estado', {
        description: err instanceof Error ? err.message : 'Error desconocido',
      })
    },
  })
}
