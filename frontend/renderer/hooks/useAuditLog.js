import { useQuery } from '@tanstack/react-query'
import { auditKeys } from './queryKeys.js'
import { auditService } from '@/services/auditService.js'

/**
 * @param {import('@/services/auditService.js').AuditListOpts} [opts]
 */
export function useAuditLog(opts = {}) {
  return useQuery({
    queryKey: auditKeys.list(opts),
    queryFn: async () => {
      const env = await auditService.list(opts)
      if (!env.ok) throw new Error(env.error?.message ?? 'Error al cargar bitácora')
      return env.data
    },
    staleTime: 15_000,
    placeholderData: (prev) => prev,
  })
}
