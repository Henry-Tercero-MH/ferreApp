import { contextBridge, ipcRenderer } from 'electron'

/**
 * API expuesta al renderer, agrupada por dominio. Todas las llamadas devuelven
 * el envelope estandar `{ ok, data } | { ok, error: { code, message } }`.
 *
 * Seguridad: contextIsolation esta activo y nodeIntegration desactivado, por
 * lo que este es el unico puente hacia el main process. No exponer ipcRenderer
 * crudo.
 */
const api = {
  settings: {
    getAll:        ()             => ipcRenderer.invoke('settings:get-all'),
    get:           (key)          => ipcRenderer.invoke('settings:get', key),
    set:           (key, value)   => ipcRenderer.invoke('settings:set',    key, value),
    upsert:        (key, value)   => ipcRenderer.invoke('settings:upsert', key, value),
    getByCategory: (category)     => ipcRenderer.invoke('settings:get-by-category', category),
  },

  categories: {
    list:      ()           => ipcRenderer.invoke('categories:list'),
    listActive:()           => ipcRenderer.invoke('categories:list-active'),
    create:    (name)       => ipcRenderer.invoke('categories:create', name),
    update:    (id, name)   => ipcRenderer.invoke('categories:update', id, name),
    setActive: (id, active) => ipcRenderer.invoke('categories:set-active', id, active),
  },

  products: {
    list:        ()               => ipcRenderer.invoke('products:list'),
    listActive:  ()               => ipcRenderer.invoke('products:list-active'),
    search:      (query)          => ipcRenderer.invoke('products:search', query),
    getById:     (id)             => ipcRenderer.invoke('products:get-by-id', id),
    create:      (input)          => ipcRenderer.invoke('products:create', input),
    update:      (id, patch)      => ipcRenderer.invoke('products:update', id, patch),
    remove:      (id)             => ipcRenderer.invoke('products:remove', id),
    restore:     (id)             => ipcRenderer.invoke('products:restore', id),
    adjustStock: (id, type, qty)  => ipcRenderer.invoke('products:adjust-stock', id, type, qty),
  },

  customers: {
    list:       (opts)           => ipcRenderer.invoke('customers:list', opts),
    search:     (query, opts)    => ipcRenderer.invoke('customers:search', query, opts),
    getById:    (id)             => ipcRenderer.invoke('customers:get-by-id', id),
    create:     (input)          => ipcRenderer.invoke('customers:create', input),
    update:     (id, patch)      => ipcRenderer.invoke('customers:update', id, patch),
    setActive:  (id, active)     => ipcRenderer.invoke('customers:set-active', id, active),
    getSystem:  ()               => ipcRenderer.invoke('customers:get-system'),
  },

  users: {
    login:          (email, password)  => ipcRenderer.invoke('users:login', email, password),
    list:           ()                 => ipcRenderer.invoke('users:list'),
    getById:        (id)               => ipcRenderer.invoke('users:get-by-id', id),
    create:         (input)            => ipcRenderer.invoke('users:create', input),
    update:         (id, patch)        => ipcRenderer.invoke('users:update', id, patch),
    changePassword: (id, newPassword)  => ipcRenderer.invoke('users:change-password', id, newPassword),
    setActive:      (id, active)       => ipcRenderer.invoke('users:set-active', id, active),
    updateAvatar:   (id, avatar)       => ipcRenderer.invoke('users:update-avatar', id, avatar),
  },

  sales: {
    create:      (saleData) => ipcRenderer.invoke('sales:create', saleData),
    getById:     (id)       => ipcRenderer.invoke('sales:get-by-id', id),
    list:        (opts)     => ipcRenderer.invoke('sales:list', opts),
    dailyReport: ()         => ipcRenderer.invoke('sales:daily-report'),
    void:        (input)    => ipcRenderer.invoke('sales:void', input),
    rangeReport: (range)    => ipcRenderer.invoke('sales:range-report', range),
  },

  audit: {
    list: (opts) => ipcRenderer.invoke('audit:list', opts),
  },

  suppliers: {
    list:       ()                      => ipcRenderer.invoke('suppliers:list'),
    get:        (id)                    => ipcRenderer.invoke('suppliers:get', id),
    create:     (input, role)           => ipcRenderer.invoke('suppliers:create', input, role),
    update:     (id, input, role)       => ipcRenderer.invoke('suppliers:update', id, input, role),
    setActive:  (id, active, role)      => ipcRenderer.invoke('suppliers:set-active', id, active, role),
  },

  purchases: {
    list:            ()          => ipcRenderer.invoke('purchases:list'),
    get:             (id)        => ipcRenderer.invoke('purchases:get', id),
    create:          (input)     => ipcRenderer.invoke('purchases:create', input),
    markSent:        (id, role)  => ipcRenderer.invoke('purchases:mark-sent', id, role),
    priceVariations: (input)     => ipcRenderer.invoke('purchases:price-variations', input),
    receive:         (input)     => ipcRenderer.invoke('purchases:receive', input),
    cancel:          (id, role)  => ipcRenderer.invoke('purchases:cancel', id, role),
  },

  cash: {
    getOpen:      ()       => ipcRenderer.invoke('cash:get-open'),
    list:         ()       => ipcRenderer.invoke('cash:list'),
    getSession:   (id)     => ipcRenderer.invoke('cash:get-session', id),
    open:         (input)  => ipcRenderer.invoke('cash:open', input),
    close:        (input)  => ipcRenderer.invoke('cash:close', input),
    addMovement:  (input)  => ipcRenderer.invoke('cash:add-movement', input),
  },

  quotes: {
    list:       ()          => ipcRenderer.invoke('quotes:list'),
    get:        (id)        => ipcRenderer.invoke('quotes:get', id),
    create:     (input)     => ipcRenderer.invoke('quotes:create', input),
    update:     (id, input) => ipcRenderer.invoke('quotes:update', id, input),
    markSent:   (id)        => ipcRenderer.invoke('quotes:mark-sent', id),
    accept:     (id)        => ipcRenderer.invoke('quotes:accept', id),
    reject:     (id)        => ipcRenderer.invoke('quotes:reject', id),
    convert:            (input) => ipcRenderer.invoke('quotes:convert', input),
    convertReceivable:  (input) => ipcRenderer.invoke('quotes:convert-receivable', input),
  },

  db: {
    backup:             () => ipcRenderer.invoke('db:backup'),
    backupNow:          () => ipcRenderer.invoke('db:backup-now'),
    listBackups:        () => ipcRenderer.invoke('db:list-backups'),
    setBackupInterval:  (hours, copies) => ipcRenderer.invoke('db:set-backup-interval', hours, copies),
    getPath:            () => ipcRenderer.invoke('db:get-path'),
    restore:            (filePath) => ipcRenderer.invoke('db:restore', filePath),
  },

  expenses: {
    list:       (opts)        => ipcRenderer.invoke('expenses:list', opts),
    get:        (id)          => ipcRenderer.invoke('expenses:get', id),
    create:     (input)       => ipcRenderer.invoke('expenses:create', input),
    update:     (id, input)   => ipcRenderer.invoke('expenses:update', id, input),
    remove:     (id)          => ipcRenderer.invoke('expenses:remove', id),
    summary:    (from, to)    => ipcRenderer.invoke('expenses:summary', from, to),
    categories: ()            => ipcRenderer.invoke('expenses:categories'),
  },

  returns: {
    list:       ()        => ipcRenderer.invoke('returns:list'),
    listBySale: (saleId)  => ipcRenderer.invoke('returns:list-by-sale', saleId),
    get:        (id)      => ipcRenderer.invoke('returns:get', id),
    create:     (input)   => ipcRenderer.invoke('returns:create', input),
  },

  inventory: {
    stock:     ()      => ipcRenderer.invoke('inventory:stock'),
    movements: (opts)  => ipcRenderer.invoke('inventory:movements', opts),
    adjust:    (input) => ipcRenderer.invoke('inventory:adjust', input),
  },

  receivables: {
    list:          ()       => ipcRenderer.invoke('receivables:list'),
    get:           (id)     => ipcRenderer.invoke('receivables:get', id),
    summary:       ()       => ipcRenderer.invoke('receivables:summary'),
    paymentsToday:  ()       => ipcRenderer.invoke('receivables:payments-today'),
    paymentsRange:  (range)  => ipcRenderer.invoke('receivables:payments-range', range),
    create:        (input)  => ipcRenderer.invoke('receivables:create', input),
    applyPayment:  (input)  => ipcRenderer.invoke('receivables:apply-payment', input),
    cancel:        (id)     => ipcRenderer.invoke('receivables:cancel', id),
    byCustomer:    (id)     => ipcRenderer.invoke('receivables:by-customer', id),
  },

  printer: {
    list:  ()                            => ipcRenderer.invoke('printer:list'),
    print: (html, deviceName, paperSize) => ipcRenderer.invoke('printer:print', html, deviceName, paperSize),
  },

  readAsset: (filename) => ipcRenderer.invoke('app:read-asset', filename),
  license: {
    status:   ()      => ipcRenderer.invoke('license:status'),
    activate: (token) => ipcRenderer.invoke('license:activate', token),
  },
}

contextBridge.exposeInMainWorld('api', api)
