import { CustomerNotFoundError, CustomerValidationError } from './errors.js'

/**
 * @typedef {import('./customers.repository.js').CustomerRow} CustomerRow
 * @typedef {import('./customers.repository.js').CustomerCreateInput} CustomerCreateInput
 * @typedef {import('./customers.repository.js').CustomerUpdateInput} CustomerUpdateInput
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * @param {string} nit
 * @returns {string} NIT normalizado
 */
function normalizeNit(nit) {
  const trimmed = (nit ?? '').trim().toUpperCase()
  if (trimmed.length === 0) return 'C/F'
  return trimmed
}

/**
 * @param {string} name
 */
function assertValidName(name) {
  if (typeof name !== 'string' || name.trim().length < 2) {
    throw new CustomerValidationError('name', 'nombre requerido (minimo 2 caracteres)')
  }
}

/**
 * @param {string | null | undefined} email
 */
function assertValidEmail(email) {
  if (email == null || email === '') return
  if (!EMAIL_RE.test(email)) {
    throw new CustomerValidationError('email', 'formato de email invalido')
  }
}

/**
 * @param {ReturnType<typeof import('./customers.repository.js').createCustomersRepository>} repo
 */
export function createCustomersService(repo) {
  return {
    /**
     * @param {{ includeInactive?: boolean }} [opts]
     * @returns {CustomerRow[]}
     */
    list(opts = {}) {
      return repo.findAll(opts)
    },

    /**
     * @param {string} query
     * @param {{ includeInactive?: boolean }} [opts]
     * @returns {CustomerRow[]}
     */
    search(query, opts = {}) {
      const q = typeof query === 'string' ? query.trim() : ''
      if (q.length === 0) return repo.findAll(opts)
      return repo.search(q, opts)
    },

    /**
     * @param {number} id
     * @returns {CustomerRow | null}
     */
    getById(id) {
      if (!Number.isInteger(id) || id <= 0) {
        throw new CustomerValidationError('id', `id invalido: ${id}`)
      }
      const row = repo.findById(id)
      return row ?? null
    },

    /**
     * Version "throw on not found" usada internamente por sales.service.create
     * cuando necesita snapshot garantizado (el POS ya seleccionó un cliente).
     *
     * @param {number} id
     * @returns {CustomerRow}
     * @throws {CustomerNotFoundError}
     */
    requireById(id) {
      const row = repo.findById(id)
      if (!row) throw new CustomerNotFoundError(id)
      return row
    },

    /**
     * @param {CustomerCreateInput} input
     * @returns {CustomerRow}
     */
    create(input) {
      assertValidName(input.name)
      assertValidEmail(input.email)
      const nit = normalizeNit(input.nit)
      
      if (nit !== 'C/F') {
        const existing = repo.findByNit(nit)
        if (existing) throw new CustomerValidationError('nit', `El NIT ${nit} ya esta registrado`)
      }

      const id = repo.insert({
        nit,
        name: input.name.trim(),
        email: input.email?.trim() || null,
        phone: input.phone?.trim() || null,
        address: input.address?.trim() || null,
      })
      const numericId = typeof id === 'bigint' ? Number(id) : id
      const row = repo.findById(numericId)
      if (!row) throw new Error('Cliente recien insertado no encontrado (race imposible)')
      return row
    },

    /**
     * @param {number} id
     * @param {CustomerUpdateInput} patch
     * @returns {CustomerRow}
     */
    /** @returns {CustomerRow[]} */
    getSystemCustomers() {
      return repo.findSystemCustomers()
    },

    update(id, patch) {
      if (!Number.isInteger(id) || id <= 0) {
        throw new CustomerValidationError('id', `id invalido: ${id}`)
      }
      const existing = repo.findById(id)
      if (existing?.is_system) {
        throw new CustomerValidationError('id', 'No se puede editar un cliente del sistema')
      }
      if (patch.name !== undefined) assertValidName(patch.name)
      if (patch.email !== undefined) assertValidEmail(patch.email)

      const nit = patch.nit !== undefined ? normalizeNit(patch.nit) : undefined
      if (nit && nit !== 'C/F') {
        const existing = repo.findByNit(nit)
        if (existing && existing.id !== id) {
          throw new CustomerValidationError('nit', `El NIT ${nit} ya esta registrado en otro cliente`)
        }
      }

      /** @type {CustomerUpdateInput} */
      const safe = {}
      if (nit     !== undefined) safe.nit     = nit
      if (patch.name    !== undefined) safe.name    = patch.name.trim()
      if (patch.email   !== undefined) safe.email   = patch.email?.trim() || null
      if (patch.phone   !== undefined) safe.phone   = patch.phone?.trim() || null
      if (patch.address !== undefined) safe.address = patch.address?.trim() || null
      if (patch.active  !== undefined) safe.active  = patch.active ? 1 : 0

      const changes = repo.update(id, safe)
      if (changes === 0) throw new CustomerNotFoundError(id)
      const row = repo.findById(id)
      if (!row) throw new CustomerNotFoundError(id)
      return row
    },

    /**
     * @param {number} id
     * @param {boolean} active
     */
    setActive(id, active) {
      if (!Number.isInteger(id) || id <= 0) {
        throw new CustomerValidationError('id', `id invalido: ${id}`)
      }
      const existing = repo.findById(id)
      if (existing?.is_system) {
        throw new CustomerValidationError('id', 'No se puede desactivar un cliente del sistema')
      }
      const changes = repo.setActive(id, active)
      if (changes === 0) throw new CustomerNotFoundError(id)
      return true
    },
  }
}
