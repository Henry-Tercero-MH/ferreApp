"use strict";
const electron = require("electron");
const api = {
  settings: {
    getAll: () => electron.ipcRenderer.invoke("settings:get-all"),
    get: (key) => electron.ipcRenderer.invoke("settings:get", key),
    set: (key, value) => electron.ipcRenderer.invoke("settings:set", key, value),
    upsert: (key, value) => electron.ipcRenderer.invoke("settings:upsert", key, value),
    getByCategory: (category) => electron.ipcRenderer.invoke("settings:get-by-category", category)
  },
  categories: {
    list: () => electron.ipcRenderer.invoke("categories:list"),
    listActive: () => electron.ipcRenderer.invoke("categories:list-active"),
    create: (name) => electron.ipcRenderer.invoke("categories:create", name),
    update: (id, name) => electron.ipcRenderer.invoke("categories:update", id, name),
    setActive: (id, active) => electron.ipcRenderer.invoke("categories:set-active", id, active)
  },
  products: {
    list: () => electron.ipcRenderer.invoke("products:list"),
    listActive: () => electron.ipcRenderer.invoke("products:list-active"),
    search: (query) => electron.ipcRenderer.invoke("products:search", query),
    getById: (id) => electron.ipcRenderer.invoke("products:get-by-id", id),
    create: (input) => electron.ipcRenderer.invoke("products:create", input),
    update: (id, patch) => electron.ipcRenderer.invoke("products:update", id, patch),
    remove: (id) => electron.ipcRenderer.invoke("products:remove", id),
    restore: (id) => electron.ipcRenderer.invoke("products:restore", id),
    adjustStock: (id, type, qty) => electron.ipcRenderer.invoke("products:adjust-stock", id, type, qty)
  },
  customers: {
    list: (opts) => electron.ipcRenderer.invoke("customers:list", opts),
    search: (query, opts) => electron.ipcRenderer.invoke("customers:search", query, opts),
    getById: (id) => electron.ipcRenderer.invoke("customers:get-by-id", id),
    create: (input) => electron.ipcRenderer.invoke("customers:create", input),
    update: (id, patch) => electron.ipcRenderer.invoke("customers:update", id, patch),
    setActive: (id, active) => electron.ipcRenderer.invoke("customers:set-active", id, active),
    getSystem: () => electron.ipcRenderer.invoke("customers:get-system")
  },
  users: {
    login: (email, password) => electron.ipcRenderer.invoke("users:login", email, password),
    list: () => electron.ipcRenderer.invoke("users:list"),
    getById: (id) => electron.ipcRenderer.invoke("users:get-by-id", id),
    create: (input) => electron.ipcRenderer.invoke("users:create", input),
    update: (id, patch) => electron.ipcRenderer.invoke("users:update", id, patch),
    changePassword: (id, newPassword) => electron.ipcRenderer.invoke("users:change-password", id, newPassword),
    setActive: (id, active) => electron.ipcRenderer.invoke("users:set-active", id, active),
    updateAvatar: (id, avatar) => electron.ipcRenderer.invoke("users:update-avatar", id, avatar)
  },
  sales: {
    create: (saleData) => electron.ipcRenderer.invoke("sales:create", saleData),
    getById: (id) => electron.ipcRenderer.invoke("sales:get-by-id", id),
    list: (opts) => electron.ipcRenderer.invoke("sales:list", opts),
    listAllItems: () => electron.ipcRenderer.invoke("sales:list-all-items"),
    dailyReport: () => electron.ipcRenderer.invoke("sales:daily-report"),
    void: (input) => electron.ipcRenderer.invoke("sales:void", input),
    rangeReport: (range) => electron.ipcRenderer.invoke("sales:range-report", range)
  },
  audit: {
    list: (opts) => electron.ipcRenderer.invoke("audit:list", opts)
  },
  suppliers: {
    list: () => electron.ipcRenderer.invoke("suppliers:list"),
    get: (id) => electron.ipcRenderer.invoke("suppliers:get", id),
    create: (input, role) => electron.ipcRenderer.invoke("suppliers:create", input, role),
    update: (id, input, role) => electron.ipcRenderer.invoke("suppliers:update", id, input, role),
    setActive: (id, active, role) => electron.ipcRenderer.invoke("suppliers:set-active", id, active, role)
  },
  purchases: {
    list: () => electron.ipcRenderer.invoke("purchases:list"),
    get: (id) => electron.ipcRenderer.invoke("purchases:get", id),
    create: (input) => electron.ipcRenderer.invoke("purchases:create", input),
    markSent: (id, role) => electron.ipcRenderer.invoke("purchases:mark-sent", id, role),
    priceVariations: (input) => electron.ipcRenderer.invoke("purchases:price-variations", input),
    receive: (input) => electron.ipcRenderer.invoke("purchases:receive", input),
    cancel: (id, role) => electron.ipcRenderer.invoke("purchases:cancel", id, role)
  },
  cash: {
    getOpen: () => electron.ipcRenderer.invoke("cash:get-open"),
    list: () => electron.ipcRenderer.invoke("cash:list"),
    listAllMovements: () => electron.ipcRenderer.invoke("cash:list-all-movements"),
    getSession: (id) => electron.ipcRenderer.invoke("cash:get-session", id),
    open: (input) => electron.ipcRenderer.invoke("cash:open", input),
    close: (input) => electron.ipcRenderer.invoke("cash:close", input),
    addMovement: (input) => electron.ipcRenderer.invoke("cash:add-movement", input)
  },
  quotes: {
    list: () => electron.ipcRenderer.invoke("quotes:list"),
    get: (id) => electron.ipcRenderer.invoke("quotes:get", id),
    create: (input) => electron.ipcRenderer.invoke("quotes:create", input),
    update: (id, input) => electron.ipcRenderer.invoke("quotes:update", id, input),
    markSent: (id) => electron.ipcRenderer.invoke("quotes:mark-sent", id),
    accept: (id) => electron.ipcRenderer.invoke("quotes:accept", id),
    reject: (id) => electron.ipcRenderer.invoke("quotes:reject", id),
    convert: (input) => electron.ipcRenderer.invoke("quotes:convert", input),
    convertReceivable: (input) => electron.ipcRenderer.invoke("quotes:convert-receivable", input)
  },
  db: {
    backup: () => electron.ipcRenderer.invoke("db:backup"),
    backupNow: () => electron.ipcRenderer.invoke("db:backup-now"),
    listBackups: () => electron.ipcRenderer.invoke("db:list-backups"),
    setBackupInterval: (hours, copies) => electron.ipcRenderer.invoke("db:set-backup-interval", hours, copies),
    getPath: () => electron.ipcRenderer.invoke("db:get-path"),
    restore: (filePath) => electron.ipcRenderer.invoke("db:restore", filePath)
  },
  expenses: {
    list: (opts) => electron.ipcRenderer.invoke("expenses:list", opts),
    get: (id) => electron.ipcRenderer.invoke("expenses:get", id),
    create: (input) => electron.ipcRenderer.invoke("expenses:create", input),
    update: (id, input) => electron.ipcRenderer.invoke("expenses:update", id, input),
    remove: (id) => electron.ipcRenderer.invoke("expenses:remove", id),
    summary: (from, to) => electron.ipcRenderer.invoke("expenses:summary", from, to),
    categories: () => electron.ipcRenderer.invoke("expenses:categories")
  },
  returns: {
    list: () => electron.ipcRenderer.invoke("returns:list"),
    listBySale: (saleId) => electron.ipcRenderer.invoke("returns:list-by-sale", saleId),
    get: (id) => electron.ipcRenderer.invoke("returns:get", id),
    create: (input) => electron.ipcRenderer.invoke("returns:create", input)
  },
  inventory: {
    stock: () => electron.ipcRenderer.invoke("inventory:stock"),
    movements: (opts) => electron.ipcRenderer.invoke("inventory:movements", opts),
    adjust: (input) => electron.ipcRenderer.invoke("inventory:adjust", input)
  },
  receivables: {
    list: () => electron.ipcRenderer.invoke("receivables:list"),
    get: (id) => electron.ipcRenderer.invoke("receivables:get", id),
    summary: () => electron.ipcRenderer.invoke("receivables:summary"),
    paymentsToday: () => electron.ipcRenderer.invoke("receivables:payments-today"),
    paymentsRange: (range) => electron.ipcRenderer.invoke("receivables:payments-range", range),
    create: (input) => electron.ipcRenderer.invoke("receivables:create", input),
    applyPayment: (input) => electron.ipcRenderer.invoke("receivables:apply-payment", input),
    cancel: (id) => electron.ipcRenderer.invoke("receivables:cancel", id),
    byCustomer: (id) => electron.ipcRenderer.invoke("receivables:by-customer", id)
  },
  printer: {
    list: () => electron.ipcRenderer.invoke("printer:list"),
    print: (html, deviceName, paperSize) => electron.ipcRenderer.invoke("printer:print", html, deviceName, paperSize)
  },
  readAsset: (filename) => electron.ipcRenderer.invoke("app:read-asset", filename),
  license: {
    status: () => electron.ipcRenderer.invoke("license:status"),
    activate: (token) => electron.ipcRenderer.invoke("license:activate", token)
  },
  cloud: {
    metadata: () => electron.ipcRenderer.invoke("cloud:metadata"),
    changes: (table, sinceTimestamp) => electron.ipcRenderer.invoke("cloud:changes", table, sinceTimestamp),
    applyPull: (data) => electron.ipcRenderer.invoke("cloud:apply-pull", data),
    buildPayload: () => electron.ipcRenderer.invoke("cloud:build-payload"),
    incrementalChanges: (lastSync) => electron.ipcRenderer.invoke("cloud:incremental-changes", lastSync),
    getNextId: (tableName) => electron.ipcRenderer.invoke("cloud:get-next-id", tableName)
  }
};
electron.contextBridge.exposeInMainWorld("api", api);
