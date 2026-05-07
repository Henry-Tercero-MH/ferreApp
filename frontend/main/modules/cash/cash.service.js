/** @param {ReturnType<typeof import('./cash.repository.js').createCashRepository>} repo */
export function createCashService(repo) {

  function assertAdmin(role) {
    if (role !== 'admin') {
      throw Object.assign(new Error('Solo el administrador puede gestionar la caja'), { code: 'CASH_FORBIDDEN' })
    }
  }

  return {
    /** Devuelve la sesión abierta o null */
    getOpenSession() {
      return repo.findOpen() ?? null
    },

    /** Lista todas las sesiones (historial) */
    listSessions() {
      return repo.findAll()
    },

    /** Lista todos los movimientos de caja (para sync) */
    listAllMovements() {
      return repo.findAllMovements()
    },

    /**
     * @param {number} sessionId
     */
    getSession(sessionId) {
      const session = repo.findById(sessionId)
      if (!session) throw Object.assign(new Error('Sesión no encontrada'), { code: 'CASH_NOT_FOUND' })
      const movements = repo.movementsForSession(sessionId)
      const salesTotal             = repo.salesTotal(sessionId, session.closed_at)
      const receivablePaymentsTotal = repo.receivablePaymentsTotal(sessionId, session.closed_at)
      // Para sesiones abiertas, calcular expected_amount en tiempo real (aún no guardado en DB)
      if (session.status === 'open') {
        const movIn  = movements.filter(m => m.type === 'in').reduce((s, m) => s + m.amount, 0)
        const movOut = movements.filter(m => m.type === 'out').reduce((s, m) => s + m.amount, 0)
        session.expected_amount = session.opening_amount + salesTotal + (receivablePaymentsTotal ?? 0) + movIn - movOut
      }
      return { session, movements, salesTotal, receivablePaymentsTotal }
    },

    /**
     * Abre una nueva sesión de caja. Solo admin.
     * @param {{ userId: number, userName: string, role: string, openingAmount: number }} input
     */
    openSession({ userId, userName, role, openingAmount }) {
      assertAdmin(role)

      const existing = repo.findOpen()
      if (existing) {
        throw Object.assign(new Error('Ya hay una caja abierta'), { code: 'CASH_ALREADY_OPEN' })
      }

      if (typeof openingAmount !== 'number' || openingAmount < 0) {
        throw Object.assign(new Error('Monto inicial inválido'), { code: 'CASH_INVALID_AMOUNT' })
      }

      const id = repo.open({
        opened_by:      userId,
        opened_by_name: userName,
        opening_amount: openingAmount,
      })
      return repo.findById(id)
    },

    /**
     * Cierra la sesión abierta. Solo admin.
     * @param {{ userId: number, userName: string, role: string, closingAmount: number, notes?: string }} input
     */
    closeSession({ userId, userName, role, closingAmount, notes }) {
      assertAdmin(role)

      const session = repo.findOpen()
      if (!session) {
        throw Object.assign(new Error('No hay caja abierta'), { code: 'CASH_NOT_OPEN' })
      }

      if (typeof closingAmount !== 'number' || closingAmount < 0) {
        throw Object.assign(new Error('Monto de cierre inválido'), { code: 'CASH_INVALID_AMOUNT' })
      }

      const salesTotal              = repo.salesTotalToday()
      const receivablePaymentsTotal = repo.receivablePaymentsTodayTotal()
      const movements   = repo.movementsForSession(session.id)
      const movIn       = movements.filter(m => m.type === 'in').reduce((s, m) => s + m.amount, 0)
      const movOut      = movements.filter(m => m.type === 'out').reduce((s, m) => s + m.amount, 0)
      const expected    = session.opening_amount + salesTotal + receivablePaymentsTotal + movIn - movOut
      const difference  = closingAmount - expected

      repo.close({
        id:              session.id,
        closed_by:       userId,
        closed_by_name:  userName,
        closing_amount:  closingAmount,
        expected_amount: expected,
        difference,
        notes:           notes ?? null,
      })

      return repo.findById(session.id)
    },

    /**
     * Agrega un movimiento manual (ingreso o egreso). Solo admin.
     * @param {{ userId: number, role: string, type: 'in'|'out', amount: number, concept: string }} input
     */
    addMovement({ userId, role, type, amount, concept }) {
      assertAdmin(role)

      const session = repo.findOpen()
      if (!session) {
        throw Object.assign(new Error('No hay caja abierta'), { code: 'CASH_NOT_OPEN' })
      }
      if (!['in', 'out'].includes(type)) {
        throw Object.assign(new Error('Tipo de movimiento inválido'), { code: 'CASH_INVALID_TYPE' })
      }
      if (!amount || amount <= 0) {
        throw Object.assign(new Error('Monto inválido'), { code: 'CASH_INVALID_AMOUNT' })
      }
      if (!concept?.trim()) {
        throw Object.assign(new Error('Concepto requerido'), { code: 'CASH_MISSING_CONCEPT' })
      }

      const id = repo.insertMovement({ session_id: session.id, type, amount, concept: concept.trim(), created_by: userId })
      return { id, session_id: session.id, type, amount, concept, created_by: userId }
    },
  }
}
