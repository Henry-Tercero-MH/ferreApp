import N from "electron";
import P, { join as pe } from "node:path";
import re from "path";
import { readFile as $e } from "fs/promises";
import Ke from "better-sqlite3";
import Le, { createHash as ze } from "node:crypto";
import U from "node:fs";
const Qe = `-- 001_init.sql
-- Preserva el esquema actual (products, sales, sale_items) y la data semilla.
-- No cambia estructura: solo mueve la creacion a una migracion versionada.
-- Los redisenios de negocio iran en migraciones posteriores.

CREATE TABLE IF NOT EXISTS products (
  id    INTEGER PRIMARY KEY AUTOINCREMENT,
  code  TEXT    NOT NULL UNIQUE,
  name  TEXT    NOT NULL,
  price REAL    NOT NULL,
  stock INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS sales (
  id    INTEGER PRIMARY KEY AUTOINCREMENT,
  total REAL    NOT NULL,
  date  TEXT    DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sale_items (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  sale_id    INTEGER NOT NULL,
  product_id INTEGER NOT NULL,
  qty        INTEGER NOT NULL,
  price      REAL    NOT NULL,
  FOREIGN KEY (sale_id)    REFERENCES sales(id),
  FOREIGN KEY (product_id) REFERENCES products(id)
);

`, Ze = `-- 002_settings.sql
-- Tabla de configuracion parametrica. \`type\` restringe los valores que el
-- service aceptara y como deserializa \`value\` (que siempre se almacena TEXT).
-- CHECK evita que la capa de datos quede en estado invalido incluso si alguien
-- escribe sin pasar por el service.

CREATE TABLE IF NOT EXISTS settings (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL,
  type        TEXT NOT NULL CHECK (type IN ('string', 'number', 'boolean', 'json')),
  category    TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_settings_category ON settings(category);

-- Valores por defecto. INSERT OR IGNORE para no sobrescribir nada que el
-- usuario haya editado antes (ej. tras reinstalar con DB preservada).
-- Booleans se almacenan como '0'/'1' por consistencia con el serializador.
INSERT OR IGNORE INTO settings (key, value, type, category, description) VALUES
  ('tax_rate',               '0.12',  'number',  'tax',      'IVA aplicado a ventas (decimal, ej. 0.12 = 12%)'),
  ('tax_included_in_price',  '0',     'boolean', 'tax',      'Si los precios ya incluyen IVA'),
  ('currency_code',          'GTQ',   'string',  'currency', 'Codigo ISO 4217 de la moneda'),
  ('currency_symbol',        'Q',     'string',  'currency', 'Simbolo que se muestra en UI/tickets'),
  ('decimal_places',         '2',     'number',  'currency', 'Decimales para mostrar importes'),
  ('allow_negative_stock',   '0',     'boolean', 'inventory','Permitir vender sin stock disponible'),
  ('business_name',          '',      'string',  'business', 'Razon social / nombre comercial'),
  ('business_nit',           '',      'string',  'business', 'NIT del emisor'),
  ('business_address',       '',      'string',  'business', 'Direccion fiscal'),
  ('business_phone',         '',      'string',  'business', 'Telefono de contacto');
`, Je = `-- 003_sales_tax_snapshot.sql
-- Snapshotea impuesto y moneda al momento de la venta. Motivo: reimprimir
-- un ticket mañana con la tasa vigente hoy da totales distintos al cobrado,
-- lo cual es legalmente y contablemente invalido. Ver Prompt 1, seccion
-- "Snapshot de impuestos en ventas".

ALTER TABLE sales ADD COLUMN subtotal         REAL NOT NULL DEFAULT 0;
ALTER TABLE sales ADD COLUMN tax_rate_applied REAL NOT NULL DEFAULT 0;
ALTER TABLE sales ADD COLUMN tax_amount       REAL NOT NULL DEFAULT 0;
ALTER TABLE sales ADD COLUMN currency_code    TEXT NOT NULL DEFAULT 'GTQ';

-- Backfill dev: filas pre-migracion no tienen desglose historico. Asumimos
-- total == subtotal con tax_amount=0 para que la suma cuadre. Esto NO es
-- fielmente historico; en una migracion de produccion habria que coordinar
-- con contabilidad un criterio acordado (ej. retro-aplicar tax_rate actual).
UPDATE sales SET subtotal = total WHERE subtotal = 0;
`, et = `-- 004_customers.sql
-- Tabla de clientes + enlace desde sales con snapshot de nombre/NIT.
--
-- Motivo snapshot: un cliente puede renombrarse o darse de baja despues de
-- emitir la venta. La reimpresion del ticket/factura debe mostrar el nombre
-- y NIT tal como estaban al momento del cobro. Misma logica que tax_rate
-- (ver migracion 003).
--
-- Sobre NIT: en Guatemala "C/F" (Consumidor Final) es un NIT valido y se
-- repite, asi que NO hay UNIQUE sobre la columna. Validacion fina queda en
-- la capa de servicio si se requiere.

CREATE TABLE IF NOT EXISTS customers (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  nit         TEXT    NOT NULL DEFAULT 'C/F',
  name        TEXT    NOT NULL,
  email       TEXT,
  phone       TEXT,
  address     TEXT,
  active      INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_customers_name ON customers(name);
CREATE INDEX IF NOT EXISTS idx_customers_nit  ON customers(nit);

-- Seed del cliente "Consumidor Final". id=1 reservado: los handlers lo
-- usan como fallback cuando el POS no identifica al cliente. Nunca
-- borrarlo; marcarlo como inactive no tiene sentido aqui.
INSERT OR IGNORE INTO customers (id, nit, name) VALUES (1, 'C/F', 'Consumidor Final');

-- Columnas en sales. Nullable a nivel DB; la capa service siempre las
-- persiste no-null (con Consumidor Final como fallback).
ALTER TABLE sales ADD COLUMN customer_id             INTEGER REFERENCES customers(id);
ALTER TABLE sales ADD COLUMN customer_name_snapshot  TEXT;
ALTER TABLE sales ADD COLUMN customer_nit_snapshot   TEXT;

-- Backfill: ventas pre-migracion se asocian a Consumidor Final.
UPDATE sales
   SET customer_id            = 1,
       customer_name_snapshot = 'Consumidor Final',
       customer_nit_snapshot  = 'C/F'
 WHERE customer_id IS NULL;
`, tt = `-- 005_products_extended.sql
-- Extiende la tabla products con los campos que usa el modulo de Inventario:
-- categoria, marca, ubicacion, condicion, stock minimo y estado activo.
--
-- Se usa ALTER TABLE ... ADD COLUMN porque la tabla ya existe con datos.
-- Todas las columnas nuevas tienen DEFAULT para que los 5 registros semilla
-- queden validos sin backfill manual.
--
-- is_active: 1=activo, 0=inactivo (soft-delete). Default 1 para no romper
-- productos existentes.

ALTER TABLE products ADD COLUMN category  TEXT    NOT NULL DEFAULT 'General';
ALTER TABLE products ADD COLUMN brand     TEXT    NOT NULL DEFAULT '';
ALTER TABLE products ADD COLUMN location  TEXT    NOT NULL DEFAULT '';
ALTER TABLE products ADD COLUMN condition TEXT    NOT NULL DEFAULT 'Nuevo';
ALTER TABLE products ADD COLUMN min_stock INTEGER NOT NULL DEFAULT 5;
ALTER TABLE products ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1));

CREATE INDEX IF NOT EXISTS idx_products_category  ON products(category);
CREATE INDEX IF NOT EXISTS idx_products_is_active ON products(is_active);
`, nt = `-- 006_users.sql
-- Tabla de usuarios del sistema con autenticacion local.
--
-- SEGURIDAD:
--   password_hash: SHA-256 hex del password. Para una app desktop offline
--   de taller con ~5 usuarios esto es suficiente. No se usa bcrypt para
--   evitar dependencias nativas adicionales (ya tenemos better-sqlite3).
--   Si en el futuro se expone a red, migrar a bcrypt/argon2.
--
-- ROLES:
--   admin        — acceso total, puede gestionar usuarios
--   cashier      — POS + historial + clientes
--   mechanic     — taller (ordenes de servicio)
--   warehouse    — inventario + movimientos de stock
--
-- 3FN: id → email, full_name, role, password_hash, active, created_at
--   No hay dependencias transitivas. role es un atributo escalar (enum
--   de 4 valores), no justifica tabla separada para este dominio.
--
-- SNAPSHOT en sales: se agrega created_by_user_id + snapshot del nombre
--   para que el historial de ventas muestre el cajero que cobró aunque
--   ese usuario sea eliminado/renombrado después.

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  email         TEXT    NOT NULL UNIQUE COLLATE NOCASE,
  full_name     TEXT    NOT NULL,
  role          TEXT    NOT NULL DEFAULT 'cashier'
                CHECK (role IN ('admin', 'cashier', 'mechanic', 'warehouse')),
  password_hash TEXT    NOT NULL,
  active        INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_users_email  ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role   ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_active ON users(active);

-- Usuario admin por defecto. Password: "admin123" → SHA-256.
-- El service fuerza el cambio de password en el primer login si
-- el setting 'require_password_change' está activo.
INSERT OR IGNORE INTO users (id, email, full_name, role, password_hash) VALUES
  (1, 'admin@taller.local', 'Administrador', 'admin',
   '240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9');

-- Snapshot del cajero en ventas: quién cobró cada venta.
-- Nullable para compatibilidad con ventas pre-migración.
ALTER TABLE sales ADD COLUMN created_by_user_id       INTEGER REFERENCES users(id);
ALTER TABLE sales ADD COLUMN created_by_user_snapshot TEXT;

-- Backfill: ventas previas se asocian al admin (id=1).
UPDATE sales
   SET created_by_user_id       = 1,
       created_by_user_snapshot = 'Administrador'
 WHERE created_by_user_id IS NULL;
`, at = `-- 007_settings_extended.sql
-- Amplía la tabla settings con configuraciones de negocio genéricas:
-- identidad visual, contacto, ticket y preferencias de app.
-- INSERT OR IGNORE: nunca pisa valores que el usuario ya haya guardado.

INSERT OR IGNORE INTO settings (key, value, type, category, description) VALUES
  -- Identidad
  ('business_email',       '',           'string',  'business',  'Correo electronico de contacto'),
  ('business_website',     '',           'string',  'business',  'Sitio web del negocio'),
  ('business_city',        '',           'string',  'business',  'Ciudad / municipio'),
  ('business_country',     'Guatemala',  'string',  'business',  'Pais'),
  ('business_logo_base64', '',           'string',  'business',  'Logo en base64 (data URL completa)'),

  -- Ticket / impresion
  ('ticket_footer_line1',  '',           'string',  'ticket',    'Primera linea del pie de ticket'),
  ('ticket_footer_line2',  '',           'string',  'ticket',    'Segunda linea del pie de ticket'),
  ('ticket_show_logo',     '1',          'boolean', 'ticket',    'Mostrar logo en el ticket impreso'),
  ('ticket_show_tax',      '1',          'boolean', 'ticket',    'Desglosar IVA en el ticket'),
  ('ticket_copies',        '1',          'number',  'ticket',    'Copias a imprimir por venta'),

  -- Apariencia / app
  ('app_name',             'SerProMec',  'string',  'app',       'Nombre que aparece en la barra lateral y titulo'),
  ('app_accent_color',     '#e5001f',    'string',  'app',       'Color de acento principal (hex)');
`, rt = `-- 008_settings_theme.sql
-- Agrega la clave app_theme para persistir la paleta de colores seleccionada.

INSERT OR IGNORE INTO settings (key, value, type, category, description) VALUES
  ('app_theme', 'crimson', 'string', 'app', 'Paleta de colores del sistema (slug de tema)');
`, st = `-- 009_sales_payment.sql
-- Agrega método de pago y tipo de cliente a la tabla de ventas.

ALTER TABLE sales ADD COLUMN payment_method TEXT NOT NULL DEFAULT 'cash'
  CHECK (payment_method IN ('cash', 'credit', 'card', 'transfer'));

ALTER TABLE sales ADD COLUMN client_type TEXT NOT NULL DEFAULT 'cf'
  CHECK (client_type IN ('cf', 'registered', 'company'));
`, ot = `-- 010_sales_void_audit.sql
-- Anulación de ventas + bitácora general de la aplicación.

-- 1. Estado de la venta (activa / anulada)
ALTER TABLE sales ADD COLUMN status TEXT NOT NULL DEFAULT 'active'
  CHECK (status IN ('active', 'voided'));

-- 2. Registro de anulaciones (quién anuló, por qué y cuándo)
CREATE TABLE IF NOT EXISTS sale_voids (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  sale_id    INTEGER NOT NULL REFERENCES sales(id),
  reason     TEXT    NOT NULL,
  voided_by  INTEGER REFERENCES users(id),
  voided_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now', 'localtime'))
);

-- 3. Bitácora general de eventos del sistema
CREATE TABLE IF NOT EXISTS audit_log (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  action       TEXT NOT NULL,           -- 'sale_voided', 'sale_created', 'settings_changed', etc.
  entity       TEXT,                    -- 'sale', 'product', 'user', ...
  entity_id    INTEGER,
  description  TEXT,                    -- texto legible del evento
  payload_json TEXT,                    -- datos extra en JSON (opcional)
  user_id      INTEGER REFERENCES users(id),
  user_name    TEXT,                    -- snapshot del nombre al momento del evento
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now', 'localtime'))
);

CREATE INDEX IF NOT EXISTS idx_audit_log_action     ON audit_log(action);
CREATE INDEX IF NOT EXISTS idx_audit_log_entity     ON audit_log(entity, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log(created_at DESC);
`, it = `ALTER TABLE users ADD COLUMN avatar TEXT;
`, ct = `-- 012_cash_sessions.sql
-- Apertura y cierre de caja con movimientos manuales.

CREATE TABLE IF NOT EXISTS cash_sessions (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  opened_by        INTEGER NOT NULL REFERENCES users(id),
  opened_by_name   TEXT    NOT NULL,
  opened_at        TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now', 'localtime')),
  opening_amount   REAL    NOT NULL DEFAULT 0,
  closed_by        INTEGER REFERENCES users(id),
  closed_by_name   TEXT,
  closed_at        TEXT,
  closing_amount   REAL,
  expected_amount  REAL,
  difference       REAL,
  notes            TEXT,
  status           TEXT    NOT NULL DEFAULT 'open'
                   CHECK (status IN ('open', 'closed'))
);

CREATE TABLE IF NOT EXISTS cash_movements (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id  INTEGER NOT NULL REFERENCES cash_sessions(id),
  type        TEXT    NOT NULL CHECK (type IN ('in', 'out')),
  amount      REAL    NOT NULL CHECK (amount > 0),
  concept     TEXT    NOT NULL,
  created_by  INTEGER REFERENCES users(id),
  created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now', 'localtime'))
);

CREATE INDEX IF NOT EXISTS idx_cash_sessions_status    ON cash_sessions(status);
CREATE INDEX IF NOT EXISTS idx_cash_sessions_opened_at ON cash_sessions(opened_at DESC);
CREATE INDEX IF NOT EXISTS idx_cash_movements_session  ON cash_movements(session_id);
`, dt = `-- 013_purchases.sql
-- Proveedores y órdenes de compra.

CREATE TABLE IF NOT EXISTS suppliers (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  name         TEXT    NOT NULL,
  contact_name TEXT,
  phone        TEXT,
  email        TEXT,
  address      TEXT,
  notes        TEXT,
  active       INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  created_at   TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now', 'localtime')),
  updated_at   TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now', 'localtime'))
);

CREATE TABLE IF NOT EXISTS purchase_orders (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  supplier_id  INTEGER NOT NULL REFERENCES suppliers(id),
  status       TEXT    NOT NULL DEFAULT 'draft'
               CHECK (status IN ('draft','sent','received','cancelled')),
  notes        TEXT,
  created_by   INTEGER REFERENCES users(id),
  created_by_name TEXT,
  created_at   TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now', 'localtime')),
  received_at  TEXT,
  total_cost   REAL    NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS purchase_items (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id     INTEGER NOT NULL REFERENCES purchase_orders(id),
  product_id   INTEGER REFERENCES products(id),
  product_name TEXT    NOT NULL,
  product_code TEXT,
  qty_ordered  REAL    NOT NULL CHECK (qty_ordered > 0),
  qty_received REAL    NOT NULL DEFAULT 0,
  unit_cost    REAL    NOT NULL DEFAULT 0
);

-- Costo de compra en productos (para calcular margen)
ALTER TABLE products ADD COLUMN cost REAL NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_purchase_orders_supplier ON purchase_orders(supplier_id);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_status   ON purchase_orders(status);
CREATE INDEX IF NOT EXISTS idx_purchase_items_order     ON purchase_items(order_id);
`, lt = `-- Cuentas por cobrar
CREATE TABLE IF NOT EXISTS receivables (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id   INTEGER,
  customer_name TEXT    NOT NULL,
  customer_nit  TEXT,
  description   TEXT    NOT NULL,
  amount        REAL    NOT NULL DEFAULT 0,
  amount_paid   REAL    NOT NULL DEFAULT 0,
  due_date      TEXT,
  status        TEXT    NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','partial','paid','cancelled')),
  notes         TEXT,
  created_by    INTEGER,
  created_by_name TEXT,
  created_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%S','now','localtime')),
  updated_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%S','now','localtime'))
);

-- Pagos aplicados a cada cuenta
CREATE TABLE IF NOT EXISTS receivable_payments (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  receivable_id   INTEGER NOT NULL REFERENCES receivables(id),
  amount          REAL    NOT NULL,
  payment_method  TEXT    NOT NULL DEFAULT 'cash',
  notes           TEXT,
  created_by      INTEGER,
  created_by_name TEXT,
  created_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%S','now','localtime'))
);
`, ut = `CREATE TABLE IF NOT EXISTS quotes (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id     INTEGER,
  customer_name   TEXT    NOT NULL,
  customer_nit    TEXT,
  status          TEXT    NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','sent','accepted','rejected','converted')),
  notes           TEXT,
  valid_until     TEXT,
  subtotal        REAL    NOT NULL DEFAULT 0,
  tax_rate        REAL    NOT NULL DEFAULT 0,
  tax_amount      REAL    NOT NULL DEFAULT 0,
  total           REAL    NOT NULL DEFAULT 0,
  created_by      INTEGER,
  created_by_name TEXT,
  sale_id         INTEGER,
  created_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%S','now','localtime')),
  updated_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%S','now','localtime'))
);

CREATE TABLE IF NOT EXISTS quote_items (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  quote_id     INTEGER NOT NULL REFERENCES quotes(id),
  product_id   INTEGER,
  product_name TEXT    NOT NULL,
  product_code TEXT,
  qty          REAL    NOT NULL DEFAULT 1,
  unit_price   REAL    NOT NULL DEFAULT 0,
  subtotal     REAL    NOT NULL DEFAULT 0
);
`, Et = `-- Descuentos en ventas
ALTER TABLE sales ADD COLUMN discount_type   TEXT NOT NULL DEFAULT 'none';
ALTER TABLE sales ADD COLUMN discount_value  REAL NOT NULL DEFAULT 0;
ALTER TABLE sales ADD COLUMN discount_amount REAL NOT NULL DEFAULT 0;
`, mt = `-- Gastos / egresos operativos
CREATE TABLE IF NOT EXISTS expenses (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  category        TEXT    NOT NULL DEFAULT 'otros',
  description     TEXT    NOT NULL,
  amount          REAL    NOT NULL DEFAULT 0,
  payment_method  TEXT    NOT NULL DEFAULT 'cash',
  expense_date    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%d','now','localtime')),
  notes           TEXT,
  created_by      INTEGER,
  created_by_name TEXT,
  created_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%S','now','localtime'))
);
`, _t = `-- Devoluciones de ventas
CREATE TABLE IF NOT EXISTS returns (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  sale_id         INTEGER NOT NULL REFERENCES sales(id),
  reason          TEXT    NOT NULL,
  notes           TEXT,
  total_refund    REAL    NOT NULL DEFAULT 0,
  created_by      INTEGER,
  created_by_name TEXT,
  created_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%S','now','localtime'))
);

CREATE TABLE IF NOT EXISTS return_items (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  return_id     INTEGER NOT NULL REFERENCES returns(id),
  sale_item_id  INTEGER NOT NULL,
  product_id    INTEGER NOT NULL,
  product_name  TEXT    NOT NULL,
  qty_returned  REAL    NOT NULL DEFAULT 0,
  unit_price    REAL    NOT NULL DEFAULT 0,
  subtotal      REAL    NOT NULL DEFAULT 0
);
`, pt = `-- Movimientos de inventario (kardex)
CREATE TABLE IF NOT EXISTS stock_movements (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id     INTEGER NOT NULL,
  product_name   TEXT    NOT NULL,
  type           TEXT    NOT NULL CHECK(type IN ('in','out','adjustment','sale','purchase','return')),
  qty            REAL    NOT NULL,
  qty_before     REAL    NOT NULL DEFAULT 0,
  qty_after      REAL    NOT NULL DEFAULT 0,
  reference_type TEXT,
  reference_id   INTEGER,
  notes          TEXT,
  created_by     INTEGER,
  created_by_name TEXT,
  created_at     TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%S','now','localtime'))
);

CREATE INDEX IF NOT EXISTS idx_stock_movements_product ON stock_movements(product_id, created_at DESC);
`, Tt = `-- Configuración del backup automático
INSERT OR IGNORE INTO settings (key, value, type, category, description) VALUES
  ('backup_interval_hours', '720',  'number', 'backup', 'Intervalo entre backups automáticos en horas (24=diario, 168=semanal, 720=mensual)'),
  ('backup_max_copies',     '10',   'number', 'backup', 'Número máximo de copias automáticas a conservar');
`, Nt = `-- 021_tax_enabled.sql
-- Agrega el interruptor global de IVA.
-- Por defecto desactivado: los precios ya incluyen IVA y no se desglosa en ningun lado.
-- INSERT OR IGNORE: no pisa el valor si el usuario ya lo cambio.

INSERT OR IGNORE INTO settings (key, value, type, category, description) VALUES
  ('tax_enabled', '0', 'boolean', 'tax', 'Habilitar calculo y visualizacion de IVA en toda la app');
`, ft = `-- 022_printer_settings.sql
-- Configuracion de impresora para recibos.
INSERT OR IGNORE INTO settings (key, value, type, category, description) VALUES
  ('receipt_printer',    '',              'string', 'ticket', 'Nombre exacto de la impresora para recibos (vacío = abre diálogo del sistema)'),
  ('receipt_paper_size', 'half-letter',   'string', 'ticket', 'Tamaño de papel: half-letter | letter | thermal-80');
`, St = `-- 023_categories.sql
-- Tabla de categorias de productos. Reemplaza el arreglo hardcodeado en ProductForm.
CREATE TABLE IF NOT EXISTS categories (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT    NOT NULL UNIQUE,
  is_active  INTEGER NOT NULL DEFAULT 1,
  created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

`, Rt = `-- 024_default_admin.sql
-- Actualiza las credenciales del admin por defecto al correo y contraseña
-- definitivos para Mangueras del Sur.
-- Password: "Manguerasdelsur*" → SHA-256

UPDATE users
   SET email         = 'manguerasdelsur@admin.local',
       password_hash = '40d07658fcb540891697c6e7a8504cce32ac1951b4c1e06f2ec830bf564ee45f'
 WHERE id = 1;
`, Ot = `-- 025_license_tokens.sql
-- Tabla de tokens de activación. Cada token puede usarse una sola vez.
-- Una vez quemado (used=1) no puede activar ninguna otra instalación.

CREATE TABLE IF NOT EXISTS license_tokens (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  token_hash TEXT    NOT NULL UNIQUE,
  used       INTEGER NOT NULL DEFAULT 0 CHECK (used IN (0,1)),
  used_at    TEXT,
  created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Token inicial para Mangueras del Sur.
-- El valor real del token lo conoce solo el desarrollador.
-- Hash SHA-256 de: MDS-TE82-A9VU-PUFP
INSERT OR IGNORE INTO license_tokens (token_hash) VALUES
  ('e75940ac91d31e64764e2a50df1033ffb1dccf8e65c09d1845d5be44982b58af');

-- Setting de estado de activación
INSERT OR IGNORE INTO settings (key, value, type, category)
VALUES ('is_activated', 'false', 'boolean', 'system');
`, It = `-- 026_default_company.sql
-- Seed del cliente "Empresa Genérica". id=2 reservado como fallback cuando
-- el tipo de cliente es "Empresa" pero no se selecciona una empresa específica.
-- Mismo patrón que id=1 (Consumidor Final). No borrar.
INSERT OR IGNORE INTO customers (id, nit, name) VALUES (2, 'CF', 'Empresa Genérica');
`, yt = `-- 027_is_system.sql
-- Agrega columna is_system para identificar clientes del sistema sin depender de IDs fijos.
-- Marca Consumidor Final (id=1) y Empresa Genérica como clientes del sistema.

ALTER TABLE customers ADD COLUMN is_system INTEGER DEFAULT 0;

UPDATE customers SET is_system = 1 WHERE id = 1;

-- Marca la Empresa Genérica si ya fue insertada por 026 (puede tener cualquier id)
UPDATE customers SET is_system = 1 WHERE name = 'Empresa Genérica';

-- Inserta Empresa Genérica solo si 026 no pudo (id=2 ya estaba ocupado)
INSERT INTO customers (nit, name, is_system)
SELECT 'CF', 'Empresa Genérica', 1
WHERE NOT EXISTS (SELECT 1 FROM customers WHERE name = 'Empresa Genérica');
`, At = `-- 028_default_category.sql
-- Seed de la categoría genérica "00-FABRICACION". id=1 reservado como categoría
-- del sistema. Mismo patrón que id=1 (Consumidor Final) en clientes. No borrar.
INSERT OR IGNORE INTO categories (id, name) VALUES (1, '00-FABRICACION');
`, Lt = `-- 029_quotes_customer_contact.sql
-- Agrega teléfono y dirección del cliente en la cotización (snapshot, no FK).
ALTER TABLE quotes ADD COLUMN customer_phone   TEXT;
ALTER TABLE quotes ADD COLUMN customer_address TEXT;
`, gt = `-- 030_nav_visibility.sql
-- Visibilidad del menú lateral por rol no-admin.
-- Admin siempre ve todo; este JSON controla los demás roles.
-- Valores iniciales = comportamiento previo al feature.
INSERT OR IGNORE INTO settings (key, value, type, category, description) VALUES (
  'nav_visibility',
  '{"pos":{"cashier":true,"mechanic":true,"warehouse":true},"history":{"cashier":true,"mechanic":true,"warehouse":true},"inventory":{"cashier":true,"mechanic":true,"warehouse":true},"clients":{"cashier":false,"mechanic":false,"warehouse":false},"reports":{"cashier":false,"mechanic":false,"warehouse":false},"cash":{"cashier":false,"mechanic":false,"warehouse":false},"purchases":{"cashier":false,"mechanic":false,"warehouse":false},"receivables":{"cashier":false,"mechanic":false,"warehouse":false},"quotes":{"cashier":false,"mechanic":false,"warehouse":false},"expenses":{"cashier":false,"mechanic":false,"warehouse":false},"suppliers":{"cashier":false,"mechanic":false,"warehouse":false}}',
  'json',
  'access',
  'Visibilidad del menú lateral por rol'
);
`, ht = `-- 031_update_admin_credentials.sql
-- Actualiza credenciales del admin para Ferreteria El Esfuerzo.
-- Password: "Admin123" → SHA-256

UPDATE users
   SET email         = 'admin@elfuerzo.local',
       password_hash = '3b612c75a7b5048a435fb6ec81e52ff92d6d795a8b5a9c17070f6a63c97a53b2'
 WHERE id = 1;
`, { app: bt } = N;
let H = null;
function X() {
  if (H) return H;
  const e = P.join(bt.getPath("userData"), "taller_pos.sqlite"), n = new Ke(e);
  return n.pragma("journal_mode = WAL"), n.pragma("foreign_keys = ON"), n.pragma("synchronous = NORMAL"), H = n, n;
}
function Ut() {
  H && (H.close(), H = null);
}
const Ct = `
  CREATE TABLE IF NOT EXISTS schema_migrations (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT    NOT NULL UNIQUE,
    checksum    TEXT    NOT NULL,
    executed_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );
`;
function vt(e) {
  const n = e.replace(/\r\n/g, `
`);
  return Le.createHash("sha256").update(n, "utf8").digest("hex");
}
function Dt(e, n) {
  e.exec(Ct);
  const t = e.prepare("SELECT checksum FROM schema_migrations WHERE name = ?"), a = e.prepare(
    "INSERT INTO schema_migrations (name, checksum) VALUES (?, ?)"
  ), r = [...n].sort((c, i) => c.name.localeCompare(i.name)), s = [], o = [];
  for (const c of r) {
    const i = vt(c.sql), d = t.get(c.name);
    if (d) {
      if (d.checksum !== i)
        throw new Error(
          `Migration tampering detected: "${c.name}" fue aplicada con checksum ${d.checksum} pero el archivo actual tiene ${i}. Nunca modifiques migraciones ya aplicadas; crea una nueva.`
        );
      o.push(c.name);
      continue;
    }
    e.transaction(() => {
      e.exec(c.sql), a.run(c.name, i);
    })(), s.push(c.name);
  }
  return { applied: s, skipped: o };
}
function wt(e) {
  const n = {
    selectAll: e.prepare("SELECT key, value, type, category, description, updated_at FROM settings"),
    selectByKey: e.prepare(
      "SELECT key, value, type, category, description, updated_at FROM settings WHERE key = ?"
    ),
    selectByCategory: e.prepare(
      "SELECT key, value, type, category, description, updated_at FROM settings WHERE category = ?"
    ),
    updateValue: e.prepare(
      `UPDATE settings
         SET value = ?,
             updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
       WHERE key = ?`
    ),
    upsertValue: e.prepare(
      `INSERT INTO settings (key, value, type, category, description)
         VALUES (?, ?, 'string', 'app', '')
       ON CONFLICT(key) DO UPDATE
         SET value = excluded.value,
             updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`
    )
  };
  return {
    /** @returns {SettingRow[]} */
    findAll() {
      return n.selectAll.all();
    },
    /**
     * @param {string} key
     * @returns {SettingRow | undefined}
     */
    findByKey(t) {
      return n.selectByKey.get(t);
    },
    /**
     * @param {string} category
     * @returns {SettingRow[]}
     */
    findByCategory(t) {
      return n.selectByCategory.all(t);
    },
    /**
     * Actualiza solo el valor (ya serializado a TEXT).
     * No inserta: la creacion de claves es responsabilidad de migraciones.
     * @param {string} key
     * @param {string} serializedValue
     * @returns {number} filas afectadas (0 si key no existe)
     */
    updateValue(t, a) {
      return n.updateValue.run(a, t).changes;
    },
    /**
     * INSERT OR UPDATE: crea la fila si no existe, actualiza si existe.
     * Solo para keys de tipo string que pueden llegar antes de que la
     * migracion las haya creado (ej. app_theme durante desarrollo).
     * @param {string} key
     * @param {string} serializedValue
     */
    upsertValue(t, a) {
      n.upsertValue.run(t, a);
    }
  };
}
class ge extends Error {
  /**
   * @param {string} code
   * @param {string} message
   */
  constructor(n, t) {
    super(t), this.name = "SettingError", this.code = n;
  }
}
class se extends ge {
  /** @param {string} key */
  constructor(n) {
    super("SETTING_NOT_FOUND", `Setting no encontrado: "${n}"`), this.name = "SettingNotFoundError", this.key = n;
  }
}
class D extends ge {
  /**
   * @param {string} key
   * @param {string} expectedType
   * @param {unknown} receivedValue
   */
  constructor(n, t, a) {
    super(
      "SETTING_INVALID_VALUE",
      `Setting "${n}" requiere tipo "${t}" pero recibio ${typeof a} (${String(
        a
      )})`
    ), this.name = "SettingValidationError", this.key = n, this.expectedType = t;
  }
}
function oe(e) {
  return { ...e, value: Mt(e.value, e.type, e.key) };
}
function Mt(e, n, t) {
  switch (n) {
    case "string":
      return e;
    case "number": {
      const a = Number(e);
      if (!Number.isFinite(a))
        throw new D(t, "number", e);
      return a;
    }
    case "boolean":
      return e === "1" || e === "true";
    case "json":
      try {
        return JSON.parse(e);
      } catch {
        throw new D(t, "json", e);
      }
    default:
      throw new D(t, n, e);
  }
}
function Ft(e, n, t) {
  switch (n) {
    case "string":
      if (typeof e != "string") throw new D(t, "string", e);
      return e;
    case "number":
      if (typeof e != "number" || !Number.isFinite(e))
        throw new D(t, "number", e);
      return String(e);
    case "boolean":
      if (typeof e != "boolean") throw new D(t, "boolean", e);
      return e ? "1" : "0";
    case "json":
      try {
        return JSON.stringify(e);
      } catch {
        throw new D(t, "json", e);
      }
    default:
      throw new D(t, n, e);
  }
}
function Bt(e) {
  const n = /* @__PURE__ */ new Map();
  let t = !1;
  function a() {
    n.clear();
    for (const s of e.findAll())
      n.set(s.key, oe(s));
    t = !0;
  }
  function r() {
    t || a();
  }
  return {
    init: a,
    /**
     * @param {string} key
     * @returns {TypedSetting['value']}
     * @throws {SettingNotFoundError}
     */
    get(s) {
      r();
      const o = n.get(s);
      if (!o) throw new se(s);
      return o.value;
    },
    /**
     * Devuelve settings agrupados por `category`:
     *   { tax: { tax_rate: 0.12, ... }, business: { ... }, ... }
     * @returns {Record<string, Record<string, TypedSetting['value']>>}
     */
    getAll() {
      r();
      const s = {};
      for (const o of n.values())
        s[o.category] || (s[o.category] = {}), s[o.category][o.key] = o.value;
      return s;
    },
    /**
     * @param {string} category
     * @returns {Record<string, TypedSetting['value']>}
     */
    getByCategory(s) {
      r();
      const o = {};
      for (const c of n.values())
        c.category === s && (o[c.key] = c.value);
      return o;
    },
    /**
     * Valida tipo, persiste y actualiza el cache. Si la key no existe en DB
     * lanza SettingNotFoundError (no creamos claves: eso va por migraciones).
     *
     * @param {string} key
     * @param {unknown} value
     * @throws {SettingNotFoundError | SettingValidationError}
     */
    set(s, o) {
      r();
      const c = n.get(s);
      if (!c) throw new se(s);
      const i = Ft(o, c.type, s);
      if (e.updateValue(s, i) === 0)
        throw n.delete(s), new se(s);
      const u = e.findByKey(s);
      n.set(s, oe(u));
    },
    /**
     * Como set() pero crea la clave si no existe (tipo string).
     * Usar solo para keys que pueden llegar antes de su migracion.
     * @param {string} key
     * @param {string} value
     */
    upsert(s, o) {
      if (typeof o != "string") throw new D(s, "string", o);
      e.upsertValue(s, o);
      const c = e.findByKey(s);
      c && n.set(s, oe(c));
    }
  };
}
function l(e) {
  return (...n) => {
    try {
      return { ok: !0, data: e(...n) };
    } catch (t) {
      const a = t && typeof t == "object" && "code" in t && typeof t.code == "string" ? t.code : "UNEXPECTED_ERROR", r = t instanceof Error ? t.message : String(t);
      return t && typeof t == "object" && "code" in t || console.error("[ipc] unexpected error:", t), { ok: !1, error: { code: a, message: r } };
    }
  };
}
const { ipcMain: $ } = N;
function qt(e) {
  $.handle("settings:get-all", l(() => e.getAll())), $.handle("settings:get", l((n, t) => e.get(t))), $.handle("settings:get-by-category", l((n, t) => e.getByCategory(t))), $.handle("settings:set", l((n, t, a) => (e.set(t, a), !0))), $.handle("settings:upsert", l((n, t, a) => (e.upsert(t, a), !0)));
}
function Pt(e) {
  const n = {
    findAll: e.prepare("SELECT id, name, is_active FROM categories ORDER BY name"),
    findActive: e.prepare("SELECT id, name FROM categories WHERE is_active = 1 ORDER BY name"),
    insert: e.prepare("INSERT INTO categories (name) VALUES (@name)"),
    update: e.prepare("UPDATE categories SET name = @name WHERE id = @id"),
    setActive: e.prepare("UPDATE categories SET is_active = @active WHERE id = @id")
  };
  return {
    /** @returns {CategoryRow[]} */
    findAll() {
      return n.findAll.all();
    },
    /** @returns {Pick<CategoryRow,'id'|'name'>[]} */
    findActive() {
      return n.findActive.all();
    },
    /** @param {string} name @returns {number} */
    create(t) {
      return Number(n.insert.run({ name: t }).lastInsertRowid);
    },
    /** @param {number} id @param {string} name */
    update(t, a) {
      n.update.run({ id: t, name: a });
    },
    /** @param {number} id @param {0|1} active */
    setActive(t, a) {
      n.setActive.run({ id: t, active: a });
    }
  };
}
function kt(e) {
  return {
    list() {
      return e.findAll();
    },
    listActive() {
      return e.findActive();
    },
    create(n) {
      const t = (n ?? "").trim();
      if (!t) throw new Error("El nombre de la categoría es requerido");
      return { id: e.create(t), name: t, is_active: 1 };
    },
    update(n, t) {
      if (n === 1) throw Object.assign(new Error("La categoría del sistema no se puede modificar"), { code: "CATEGORY_SYSTEM" });
      const a = (t ?? "").trim();
      if (!a) throw new Error("El nombre de la categoría es requerido");
      return e.update(n, a), { id: n, name: a, is_active: 1 };
    },
    setActive(n, t) {
      if (n === 1) throw Object.assign(new Error("La categoría del sistema no se puede desactivar"), { code: "CATEGORY_SYSTEM" });
      e.setActive(n, t ? 1 : 0);
    }
  };
}
const { ipcMain: K } = N;
function Ht(e) {
  K.handle("categories:list", l(() => e.list())), K.handle("categories:list-active", l(() => e.listActive())), K.handle("categories:create", l((n, t) => e.create(t))), K.handle("categories:update", l((n, t, a) => e.update(t, a))), K.handle("categories:set-active", l((n, t, a) => e.setActive(t, a)));
}
const ee = "id, code, name, price, stock, category, brand, location, condition, min_stock, is_active";
function xt(e) {
  const n = {
    selectAll: e.prepare(
      `SELECT ${ee} FROM products ORDER BY name`
    ),
    selectActive: e.prepare(
      `SELECT ${ee} FROM products WHERE is_active = 1 ORDER BY name`
    ),
    selectById: e.prepare(
      `SELECT ${ee} FROM products WHERE id = ?`
    ),
    search: e.prepare(
      `SELECT ${ee} FROM products
        WHERE (name LIKE ? OR code LIKE ? OR category LIKE ?)
        ORDER BY name`
    ),
    insert: e.prepare(
      `INSERT INTO products (code, name, price, stock, category, brand, location, condition, min_stock, is_active)
       VALUES (@code, @name, @price, @stock, @category, @brand, @location, @condition, @min_stock, 1)`
    ),
    update: e.prepare(
      `UPDATE products
          SET name      = @name,
              price     = @price,
              category  = @category,
              brand     = @brand,
              location  = @location,
              condition = @condition,
              min_stock = @min_stock
        WHERE id = @id`
    ),
    setActive: e.prepare(
      "UPDATE products SET is_active = @active WHERE id = @id"
    ),
    adjustStock: e.prepare(
      "UPDATE products SET stock = MAX(0, stock + @delta) WHERE id = @id"
    )
  };
  return {
    /** @returns {ProductRow[]} */
    findAll() {
      return n.selectAll.all();
    },
    /** @returns {ProductRow[]} */
    findActive() {
      return n.selectActive.all();
    },
    /**
     * @param {number} id
     * @returns {ProductRow | undefined}
     */
    findById(t) {
      return n.selectById.get(t);
    },
    /**
     * @param {string} query
     * @returns {ProductRow[]}
     */
    search(t) {
      const a = `%${t}%`;
      return n.search.all(a, a, a);
    },
    /**
     * @param {{ code: string, name: string, price: number, stock: number,
     *           category: string, brand: string, location: string,
     *           condition: string, min_stock: number }} data
     * @returns {number} new id
     */
    create(t) {
      const a = n.insert.run(t);
      return Number(a.lastInsertRowid);
    },
    /**
     * @param {number} id
     * @param {{ name: string, price: number, category: string, brand: string,
     *           location: string, condition: string, min_stock: number }} data
     */
    update(t, a) {
      n.update.run({ ...a, id: t });
    },
    /**
     * @param {number} id
     * @param {0|1} active
     */
    setActive(t, a) {
      n.setActive.run({ id: t, active: a });
    },
    /**
     * @param {number} id
     * @param {number} delta  positive = entrada, negative = salida
     */
    adjustStock(t, a) {
      n.adjustStock.run({ id: t, delta: a });
    }
  };
}
function Xt(e) {
  function n(a) {
    if (!Number.isInteger(a) || a <= 0)
      throw Object.assign(new Error(`product id invalido: ${a}`), {
        code: "PRODUCT_INVALID_ID"
      });
  }
  function t(a) {
    n(a);
    const r = e.findById(a);
    if (!r)
      throw Object.assign(new Error(`producto no encontrado: ${a}`), {
        code: "PRODUCT_NOT_FOUND"
      });
    return r;
  }
  return {
    /** Todos los productos (activos e inactivos). */
    list() {
      return e.findAll();
    },
    /** Solo los productos activos (para POS y búsqueda rápida). */
    listActive() {
      return e.findActive();
    },
    /** @param {string} query */
    search(a) {
      const r = typeof a == "string" ? a.trim() : "";
      return r.length === 0 ? e.findActive() : e.search(r);
    },
    /** @param {number} id */
    getById(a) {
      return n(a), e.findById(a) ?? null;
    },
    /** @param {ProductInput} input */
    create(a) {
      const r = (a.code ?? "").trim(), s = (a.name ?? "").trim();
      if (!r) throw Object.assign(new Error("code requerido"), { code: "PRODUCT_MISSING_CODE" });
      if (!s) throw Object.assign(new Error("name requerido"), { code: "PRODUCT_MISSING_NAME" });
      const o = Number(a.price);
      if (!Number.isFinite(o) || o < 0)
        throw Object.assign(new Error("price invalido"), { code: "PRODUCT_INVALID_PRICE" });
      const c = e.create({
        code: r,
        name: s,
        price: o,
        stock: Math.max(0, Math.round(Number(a.stock) || 0)),
        category: (a.category ?? "General").trim() || "General",
        brand: (a.brand ?? "").trim(),
        location: (a.location ?? "").trim(),
        condition: (a.condition ?? "Nuevo").trim() || "Nuevo",
        min_stock: Math.max(0, Math.round(Number(a.min_stock) || 5))
      });
      return e.findById(c);
    },
    /**
     * @param {number} id
     * @param {ProductPatch} patch
     */
    update(a, r) {
      const s = t(a), o = (r.name ?? s.name).trim();
      if (!o) throw Object.assign(new Error("name requerido"), { code: "PRODUCT_MISSING_NAME" });
      const c = r.price !== void 0 ? Number(r.price) : s.price;
      if (!Number.isFinite(c) || c < 0)
        throw Object.assign(new Error("price invalido"), { code: "PRODUCT_INVALID_PRICE" });
      return e.update(a, {
        name: o,
        price: c,
        category: (r.category ?? s.category ?? "General").trim() || "General",
        brand: (r.brand ?? s.brand ?? "").trim(),
        location: (r.location ?? s.location ?? "").trim(),
        condition: (r.condition ?? s.condition ?? "Nuevo").trim() || "Nuevo",
        min_stock: r.min_stock !== void 0 ? Math.max(0, Math.round(Number(r.min_stock))) : s.min_stock
      }), e.findById(a);
    },
    /** Soft-delete: marca is_active = 0. @param {number} id */
    remove(a) {
      t(a), e.setActive(a, 0);
    },
    /** Reactiva un producto. @param {number} id */
    restore(a) {
      t(a), e.setActive(a, 1);
    },
    /**
     * Registra un movimiento de stock.
     * @param {number} id
     * @param {'entry'|'exit'} type
     * @param {number} qty
     */
    adjustStock(a, r, s) {
      t(a);
      const o = Number(s);
      if (!Number.isFinite(o) || o <= 0)
        throw Object.assign(new Error("qty invalido"), { code: "PRODUCT_INVALID_QTY" });
      const c = r === "entry" ? o : -o;
      return e.adjustStock(a, c), e.findById(a);
    }
  };
}
const { ipcMain: C } = N;
function jt(e) {
  C.handle("products:list", l(() => e.list())), C.handle("products:list-active", l(() => e.listActive())), C.handle("products:search", l((n, t) => e.search(t))), C.handle("products:get-by-id", l((n, t) => e.getById(t))), C.handle("products:create", l((n, t) => e.create(t))), C.handle("products:update", l((n, t, a) => e.update(t, a))), C.handle("products:remove", l((n, t) => e.remove(t))), C.handle("products:restore", l((n, t) => e.restore(t))), C.handle("products:adjust-stock", l((n, t, a, r) => e.adjustStock(t, a, r)));
}
const M = "id, nit, name, email, phone, address, active, is_system, created_at, updated_at";
function Yt(e) {
  const n = {
    selectAllActive: e.prepare(`SELECT ${M} FROM customers WHERE active = 1 ORDER BY name`),
    selectAllAny: e.prepare(`SELECT ${M} FROM customers ORDER BY name`),
    selectById: e.prepare(`SELECT ${M} FROM customers WHERE id = ?`),
    searchActive: e.prepare(
      `SELECT ${M} FROM customers
        WHERE (name LIKE ? OR nit LIKE ?) AND active = 1
     ORDER BY name
        LIMIT 50`
    ),
    searchAny: e.prepare(
      `SELECT ${M} FROM customers
        WHERE (name LIKE ? OR nit LIKE ?)
     ORDER BY name
        LIMIT 50`
    ),
    selectByNit: e.prepare(`SELECT ${M} FROM customers WHERE nit = ?`),
    selectSystem: e.prepare(`SELECT ${M} FROM customers WHERE is_system = 1 ORDER BY id`),
    insert: e.prepare(
      `INSERT INTO customers (nit, name, email, phone, address)
       VALUES (?, ?, ?, ?, ?)`
    ),
    setActive: e.prepare(
      `UPDATE customers
          SET active = ?,
              updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        WHERE id = ?`
    )
  };
  return {
    /**
     * @param {{ includeInactive?: boolean }} [opts]
     * @returns {CustomerRow[]}
     */
    findAll(t = {}) {
      return (t.includeInactive ? n.selectAllAny : n.selectAllActive).all();
    },
    /**
     * @param {number} id
     * @returns {CustomerRow | undefined}
     */
    findById(t) {
      return n.selectById.get(t);
    },
    /**
     * @param {string} nit
     * @returns {CustomerRow | undefined}
     */
    findByNit(t) {
      return n.selectByNit.get(t);
    },
    /** @returns {CustomerRow[]} */
    findSystemCustomers() {
      return n.selectSystem.all();
    },
    /**
     * @param {string} query
     * @param {{ includeInactive?: boolean }} [opts]
     * @returns {CustomerRow[]}
     */
    search(t, a = {}) {
      const r = `%${t}%`;
      return (a.includeInactive ? n.searchAny : n.searchActive).all(r, r);
    },
    /**
     * @param {CustomerCreateInput} input
     * @returns {number|bigint} id insertado
     */
    insert(t) {
      return n.insert.run(
        t.nit,
        t.name,
        t.email ?? null,
        t.phone ?? null,
        t.address ?? null
      ).lastInsertRowid;
    },
    /**
     * UPDATE dinamico. Solo toca las columnas provistas en `patch` — evita
     * sobrescribir con undefined y requiere una unica sentencia por forma.
     *
     * @param {number} id
     * @param {CustomerUpdateInput} patch
     * @returns {number} rows affected
     */
    update(t, a) {
      const r = [], s = [];
      for (const [i, d] of Object.entries(a))
        d !== void 0 && (r.push(`${i} = ?`), s.push(d));
      if (r.length === 0) return 0;
      r.push("updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')");
      const o = `UPDATE customers SET ${r.join(", ")} WHERE id = ?`;
      return s.push(t), e.prepare(o).run(...s).changes;
    },
    /**
     * @param {number} id
     * @param {boolean} active
     * @returns {number} rows affected
     */
    setActive(t, a) {
      return n.setActive.run(a ? 1 : 0, t).changes;
    }
  };
}
class he extends Error {
  /**
   * @param {string} code
   * @param {string} message
   */
  constructor(n, t) {
    super(t), this.name = "CustomerError", this.code = n;
  }
}
class te extends he {
  /** @param {number} id */
  constructor(n) {
    super("CUSTOMER_NOT_FOUND", `Cliente no encontrado: #${n}`), this.id = n;
  }
}
class v extends he {
  /**
   * @param {string} field
   * @param {string} message
   */
  constructor(n, t) {
    super("CUSTOMER_INVALID", `${n}: ${t}`), this.field = n;
  }
}
const Vt = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function Te(e) {
  const n = (e ?? "").trim().toUpperCase();
  return n.length === 0 ? "C/F" : n;
}
function Ne(e) {
  if (typeof e != "string" || e.trim().length < 2)
    throw new v("name", "nombre requerido (minimo 2 caracteres)");
}
function fe(e) {
  if (!(e == null || e === "") && !Vt.test(e))
    throw new v("email", "formato de email invalido");
}
function Wt(e) {
  return {
    /**
     * @param {{ includeInactive?: boolean }} [opts]
     * @returns {CustomerRow[]}
     */
    list(n = {}) {
      return e.findAll(n);
    },
    /**
     * @param {string} query
     * @param {{ includeInactive?: boolean }} [opts]
     * @returns {CustomerRow[]}
     */
    search(n, t = {}) {
      const a = typeof n == "string" ? n.trim() : "";
      return a.length === 0 ? e.findAll(t) : e.search(a, t);
    },
    /**
     * @param {number} id
     * @returns {CustomerRow | null}
     */
    getById(n) {
      if (!Number.isInteger(n) || n <= 0)
        throw new v("id", `id invalido: ${n}`);
      return e.findById(n) ?? null;
    },
    /**
     * Version "throw on not found" usada internamente por sales.service.create
     * cuando necesita snapshot garantizado (el POS ya seleccionó un cliente).
     *
     * @param {number} id
     * @returns {CustomerRow}
     * @throws {CustomerNotFoundError}
     */
    requireById(n) {
      const t = e.findById(n);
      if (!t) throw new te(n);
      return t;
    },
    /**
     * @param {CustomerCreateInput} input
     * @returns {CustomerRow}
     */
    create(n) {
      var o, c, i;
      Ne(n.name), fe(n.email);
      const t = Te(n.nit);
      if (t !== "C/F" && e.findByNit(t))
        throw new v("nit", `El NIT ${t} ya esta registrado`);
      const a = e.insert({
        nit: t,
        name: n.name.trim(),
        email: ((o = n.email) == null ? void 0 : o.trim()) || null,
        phone: ((c = n.phone) == null ? void 0 : c.trim()) || null,
        address: ((i = n.address) == null ? void 0 : i.trim()) || null
      }), r = typeof a == "bigint" ? Number(a) : a, s = e.findById(r);
      if (!s) throw new Error("Cliente recien insertado no encontrado (race imposible)");
      return s;
    },
    /**
     * @param {number} id
     * @param {CustomerUpdateInput} patch
     * @returns {CustomerRow}
     */
    /** @returns {CustomerRow[]} */
    getSystemCustomers() {
      return e.findSystemCustomers();
    },
    update(n, t) {
      var i, d, u;
      if (!Number.isInteger(n) || n <= 0)
        throw new v("id", `id invalido: ${n}`);
      const a = e.findById(n);
      if (a != null && a.is_system)
        throw new v("id", "No se puede editar un cliente del sistema");
      t.name !== void 0 && Ne(t.name), t.email !== void 0 && fe(t.email);
      const r = t.nit !== void 0 ? Te(t.nit) : void 0;
      if (r && r !== "C/F") {
        const E = e.findByNit(r);
        if (E && E.id !== n)
          throw new v("nit", `El NIT ${r} ya esta registrado en otro cliente`);
      }
      const s = {};
      if (r !== void 0 && (s.nit = r), t.name !== void 0 && (s.name = t.name.trim()), t.email !== void 0 && (s.email = ((i = t.email) == null ? void 0 : i.trim()) || null), t.phone !== void 0 && (s.phone = ((d = t.phone) == null ? void 0 : d.trim()) || null), t.address !== void 0 && (s.address = ((u = t.address) == null ? void 0 : u.trim()) || null), t.active !== void 0 && (s.active = t.active ? 1 : 0), e.update(n, s) === 0) throw new te(n);
      const c = e.findById(n);
      if (!c) throw new te(n);
      return c;
    },
    /**
     * @param {number} id
     * @param {boolean} active
     */
    setActive(n, t) {
      if (!Number.isInteger(n) || n <= 0)
        throw new v("id", `id invalido: ${n}`);
      const a = e.findById(n);
      if (a != null && a.is_system)
        throw new v("id", "No se puede desactivar un cliente del sistema");
      if (e.setActive(n, t) === 0) throw new te(n);
      return !0;
    }
  };
}
const { ipcMain: F } = N;
function Gt(e) {
  F.handle("customers:list", l((n, t) => e.list(t))), F.handle("customers:search", l((n, t, a) => e.search(t, a))), F.handle("customers:get-by-id", l((n, t) => e.getById(t))), F.handle("customers:create", l((n, t) => e.create(t))), F.handle("customers:update", l((n, t, a) => e.update(t, a))), F.handle("customers:set-active", l((n, t, a) => e.setActive(t, a))), F.handle("customers:get-system", l(() => e.getSystemCustomers()));
}
const Se = `
  id, subtotal, tax_rate_applied, tax_amount, total, currency_code, date,
  customer_id, customer_name_snapshot, customer_nit_snapshot,
  payment_method, client_type, status,
  discount_type, discount_value, discount_amount
`;
function $t(e) {
  const n = {
    insertSale: e.prepare(
      `INSERT INTO sales (
         date,
         total, subtotal, tax_rate_applied, tax_amount, currency_code,
         customer_id, customer_name_snapshot, customer_nit_snapshot,
         payment_method, client_type,
         discount_type, discount_value, discount_amount,
         created_by_user_id, created_by_user_snapshot
       ) VALUES (
         strftime('%Y-%m-%d %H:%M:%S','now','localtime'),
         ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
       )`
    ),
    insertItem: e.prepare(
      "INSERT INTO sale_items (sale_id, product_id, qty, price) VALUES (?, ?, ?, ?)"
    ),
    updateStock: e.prepare("UPDATE products SET stock = stock - ? WHERE id = ?"),
    selectById: e.prepare(`SELECT ${Se} FROM sales WHERE id = ?`),
    /**
     * LEFT JOIN a products para mostrar nombre/codigo actuales. NO es
     * snapshot; para el snapshot real a nivel linea, agregar columnas
     * product_code_snapshot/product_name_snapshot a sale_items en migracion
     * futura. Hoy vive como deuda conocida.
     */
    selectItems: e.prepare(
      `SELECT si.id, si.sale_id, si.product_id, si.qty, si.price,
              p.code AS product_code, p.name AS product_name
         FROM sale_items si
    LEFT JOIN products p ON p.id = si.product_id
        WHERE si.sale_id = ?
     ORDER BY si.id ASC`
    ),
    selectAllItems: e.prepare(
      `SELECT si.id, si.sale_id, si.product_id, si.qty, si.price,
              p.code AS product_code, p.name AS product_name
         FROM sale_items si
    LEFT JOIN products p ON p.id = si.product_id
     ORDER BY si.id ASC`
    ),
    findPageFiltered: e.prepare(`
      SELECT ${Se}
        FROM sales
       WHERE (@search IS NULL
              OR lower(customer_name_snapshot) LIKE '%' || lower(@search) || '%'
              OR lower(customer_nit_snapshot)  LIKE '%' || lower(@search) || '%'
              OR CAST(id AS TEXT) LIKE '%' || @search || '%')
         AND (@from   IS NULL OR date(date) >= @from)
         AND (@to     IS NULL OR date(date) <= @to)
         AND (@status IS NULL OR status = @status)
         AND (@userId IS NULL OR created_by_user_id = @userId)
       ORDER BY id DESC
       LIMIT @limit OFFSET @offset
    `),
    countFiltered: e.prepare(`
      SELECT COUNT(*) AS total
        FROM sales
       WHERE (@search IS NULL
              OR lower(customer_name_snapshot) LIKE '%' || lower(@search) || '%'
              OR lower(customer_nit_snapshot)  LIKE '%' || lower(@search) || '%'
              OR CAST(id AS TEXT) LIKE '%' || @search || '%')
         AND (@from   IS NULL OR date(date) >= @from)
         AND (@to     IS NULL OR date(date) <= @to)
         AND (@status IS NULL OR status = @status)
         AND (@userId IS NULL OR created_by_user_id = @userId)
    `),
    dailySummary: e.prepare(`
      SELECT
        COUNT(*)                          AS sale_count,
        COALESCE(SUM(subtotal), 0)        AS subtotal,
        COALESCE(SUM(tax_amount), 0)      AS tax_amount,
        COALESCE(SUM(total), 0)           AS total,
        COALESCE(SUM(CASE WHEN COALESCE(payment_method,'cash') != 'credit' THEN total ELSE 0 END), 0) AS cash_total,
        currency_code
      FROM sales
      WHERE status = 'active'
        AND date(date) = date('now', 'localtime')
      GROUP BY currency_code
    `),
    markVoided: e.prepare(
      "UPDATE sales SET status = 'voided' WHERE id = ? AND status = 'active'"
    ),
    insertVoid: e.prepare(
      "INSERT INTO sale_voids (sale_id, reason, voided_by) VALUES (?, ?, ?)"
    ),
    restoreStock: e.prepare(
      "UPDATE products SET stock = stock + ? WHERE id = ?"
    ),
    getProductForMove: e.prepare(
      "SELECT id, name, stock FROM products WHERE id = ?"
    ),
    insertMovement: e.prepare(`
      INSERT INTO stock_movements
        (product_id, product_name, type, qty, qty_before, qty_after, reference_type, reference_id, notes, created_by, created_by_name)
      VALUES
        (@product_id, @product_name, @type, @qty, @qty_before, @qty_after, @reference_type, @reference_id, @notes, @created_by, @created_by_name)
    `),
    topProducts: e.prepare(`
      SELECT
        p.id,
        p.code,
        p.name,
        SUM(si.qty)         AS units_sold,
        SUM(si.qty * si.price) AS revenue
      FROM sale_items si
      LEFT JOIN products p ON p.id = si.product_id
      JOIN  sales s ON s.id = si.sale_id
      WHERE date(s.date) = date('now', 'localtime')
      GROUP BY si.product_id
      ORDER BY units_sold DESC
      LIMIT 5
    `),
    salesByDate: e.prepare(`
      SELECT
        date(date)              AS day,
        COUNT(*)                AS sale_count,
        COALESCE(SUM(subtotal), 0) AS subtotal,
        COALESCE(SUM(total), 0)    AS total
      FROM sales
      WHERE status = 'active'
        AND date(date) >= @from
        AND date(date) <= @to
      GROUP BY day
      ORDER BY day ASC
    `),
    topProductsRange: e.prepare(`
      SELECT
        p.id,
        p.code,
        p.name,
        SUM(si.qty)            AS units_sold,
        SUM(si.qty * si.price) AS revenue
      FROM sale_items si
      LEFT JOIN products p ON p.id = si.product_id
      JOIN sales s ON s.id = si.sale_id
      WHERE s.status = 'active'
        AND date(s.date) >= @from
        AND date(s.date) <= @to
      GROUP BY si.product_id
      ORDER BY units_sold DESC
      LIMIT 10
    `),
    salesByHour: e.prepare(`
      SELECT
        CAST(strftime('%H', date) AS INTEGER) AS hour,
        COUNT(*)                              AS sale_count,
        COALESCE(SUM(total), 0)               AS total
      FROM sales
      WHERE status = 'active'
        AND date(date) >= @from
        AND date(date) <= @to
      GROUP BY hour
      ORDER BY hour ASC
    `),
    salesByWeekday: e.prepare(`
      SELECT
        CAST(strftime('%w', date) AS INTEGER) AS weekday,
        COUNT(*)                              AS sale_count,
        COALESCE(SUM(total), 0)               AS total
      FROM sales
      WHERE status = 'active'
        AND date(date) >= @from
        AND date(date) <= @to
      GROUP BY weekday
      ORDER BY weekday ASC
    `),
    salesByPaymentMethod: e.prepare(`
      SELECT
        COALESCE(payment_method, 'cash') AS method,
        COUNT(*)                          AS sale_count,
        COALESCE(SUM(total), 0)           AS total
      FROM sales
      WHERE status = 'active'
        AND date(date) >= @from
        AND date(date) <= @to
      GROUP BY method
      ORDER BY sale_count DESC
    `),
    salesByCashier: e.prepare(`
      SELECT
        COALESCE(created_by_user_snapshot, 'Desconocido') AS cashier_name,
        created_by_user_id                                AS cashier_id,
        COUNT(*)                                          AS sale_count,
        COALESCE(SUM(subtotal),0)                         AS subtotal,
        COALESCE(SUM(tax_amount),0)                       AS tax_amount,
        COALESCE(SUM(total),0)                            AS total
      FROM sales
      WHERE status = 'active'
        AND date >= @from || ' 00:00:00'
        AND date <= @to   || ' 23:59:59'
      GROUP BY created_by_user_id, created_by_user_snapshot
      ORDER BY total DESC
    `)
  };
  return {
    insertSale: e.transaction((a) => {
      const s = n.insertSale.run(
        a.total,
        a.subtotal,
        a.taxRate,
        a.taxAmount,
        a.currencyCode,
        a.customerId,
        a.customerNameSnapshot,
        a.customerNitSnapshot,
        a.paymentMethod ?? "cash",
        a.clientType ?? "cf",
        a.discountType ?? "none",
        a.discountValue ?? 0,
        a.discountAmount ?? 0,
        a.userId ?? null,
        a.userName ?? null
      ).lastInsertRowid;
      for (const o of a.items) {
        const c = n.getProductForMove.get(o.id), i = (c == null ? void 0 : c.stock) ?? 0;
        n.insertItem.run(s, o.id, o.qty, o.price), n.updateStock.run(o.qty, o.id), n.insertMovement.run({
          product_id: o.id,
          product_name: (c == null ? void 0 : c.name) ?? "",
          type: "sale",
          qty: o.qty,
          qty_before: i,
          qty_after: i - o.qty,
          reference_type: "sale",
          reference_id: s,
          notes: null,
          created_by: null,
          created_by_name: null
        });
      }
      return s;
    }),
    /**
     * Anula una venta en transacción: marca status='voided', registra en
     * sale_voids y devuelve el stock de cada item.
     * @param {VoidInput} input
     * @param {import('../sales/sales.repository.js').SaleItemRow[]} items
     * @returns {boolean} true si se anuló, false si ya estaba anulada
     */
    voidSale: e.transaction((a, r) => {
      if (n.markVoided.run(a.saleId).changes === 0) return !1;
      n.insertVoid.run(a.saleId, a.reason, a.userId ?? null);
      for (const o of r) {
        const c = n.getProductForMove.get(o.product_id), i = (c == null ? void 0 : c.stock) ?? 0;
        n.restoreStock.run(o.qty, o.product_id), n.insertMovement.run({
          product_id: o.product_id,
          product_name: (c == null ? void 0 : c.name) ?? o.product_name ?? "",
          type: "in",
          qty: o.qty,
          qty_before: i,
          qty_after: i + o.qty,
          reference_type: "sale_void",
          reference_id: a.saleId,
          notes: `Anulación venta #${a.saleId}`,
          created_by: null,
          created_by_name: null
        });
      }
      return !0;
    }),
    /**
     * @param {number} id
     * @returns {SaleRow | undefined}
     */
    findSaleById(a) {
      return n.selectById.get(a);
    },
    /**
     * @param {number} saleId
     * @returns {SaleItemRow[]}
     */
    findSaleItems(a) {
      return n.selectItems.all(a);
    },
    findAllSaleItems() {
      return n.selectAllItems.all();
    },
    /**
     * @param {{ limit: number, offset: number, search?: string|null, from?: string|null, to?: string|null, status?: string|null, userId?: number|null }} opts
     * @returns {SaleRow[]}
     */
    findPage({ limit: a, offset: r, search: s = null, from: o = null, to: c = null, status: i = null, userId: d = null }) {
      return n.findPageFiltered.all({ limit: a, offset: r, search: s, from: o, to: c, status: i, userId: d });
    },
    /** @param {{ search?: string|null, from?: string|null, to?: string|null, status?: string|null, userId?: number|null }} [opts] */
    countAll({ search: a = null, from: r = null, to: s = null, status: o = null, userId: c = null } = {}) {
      return /** @type {{ total: number }} */ n.countFiltered.get({ search: a, from: r, to: s, status: o, userId: c }).total;
    },
    /**
     * Resumen del día actual (fecha local del servidor/electron).
     * @returns {{ sale_count: number, subtotal: number, tax_amount: number, total: number, currency_code: string } | null}
     */
    getDailySummary() {
      return (
        /** @type {any} */
        n.dailySummary.get() ?? null
      );
    },
    /**
     * Top 5 productos vendidos hoy por unidades.
     * @returns {{ id: number, code: string, name: string, units_sold: number, revenue: number }[]}
     */
    getTopProducts() {
      return (
        /** @type {any[]} */
        n.topProducts.all()
      );
    },
    /**
     * Ventas agrupadas por día en un rango de fechas.
     * @param {{ from: string, to: string }} range  Fechas en formato YYYY-MM-DD
     * @returns {{ day: string, sale_count: number, subtotal: number, total: number }[]}
     */
    getSalesByDate({ from: a, to: r }) {
      return (
        /** @type {any[]} */
        n.salesByDate.all({ from: a, to: r })
      );
    },
    /**
     * Top 10 productos por unidades vendidas en un rango.
     * @param {{ from: string, to: string }} range
     * @returns {{ id: number, code: string, name: string, units_sold: number, revenue: number }[]}
     */
    getTopProductsRange({ from: a, to: r }) {
      return (
        /** @type {any[]} */
        n.topProductsRange.all({ from: a, to: r })
      );
    },
    /**
     * Ventas agrupadas por hora del día (0-23).
     * @param {{ from: string, to: string }} range
     * @returns {{ hour: number, sale_count: number, total: number }[]}
     */
    getSalesByHour({ from: a, to: r }) {
      return (
        /** @type {any[]} */
        n.salesByHour.all({ from: a, to: r })
      );
    },
    /**
     * Ventas agrupadas por día de semana (0=Dom … 6=Sáb).
     * @param {{ from: string, to: string }} range
     * @returns {{ weekday: number, sale_count: number, total: number }[]}
     */
    getSalesByWeekday({ from: a, to: r }) {
      return (
        /** @type {any[]} */
        n.salesByWeekday.all({ from: a, to: r })
      );
    },
    /**
     * Ventas agrupadas por método de pago.
     * @param {{ from: string, to: string }} range
     * @returns {{ method: string, sale_count: number, total: number }[]}
     */
    getSalesByPaymentMethod({ from: a, to: r }) {
      return (
        /** @type {any[]} */
        n.salesByPaymentMethod.all({ from: a, to: r })
      );
    },
    /**
     * Ventas agrupadas por cajero (usuario que registró la venta).
     * @param {{ from: string, to: string }} range
     * @returns {any[]}
     */
    getSalesByCashier({ from: a, to: r }) {
      return (
        /** @type {any[]} */
        n.salesByCashier.all({ from: a, to: r })
      );
    }
  };
}
const Kt = 200, zt = 1;
function Qt(e) {
  if (!e || !Array.isArray(e.items) || e.items.length === 0)
    throw Object.assign(new Error("La venta debe contener al menos un item"), {
      code: "SALE_EMPTY"
    });
  for (const n of e.items) {
    if (!Number.isInteger(n.id) || n.id <= 0)
      throw Object.assign(new Error(`product_id invalido: ${n.id}`), {
        code: "SALE_INVALID_ITEM"
      });
    if (!Number.isFinite(n.qty) || n.qty <= 0)
      throw Object.assign(new Error(`qty invalida para producto ${n.id}`), {
        code: "SALE_INVALID_ITEM"
      });
    if (!Number.isFinite(n.price) || n.price < 0)
      throw Object.assign(new Error(`price invalido para producto ${n.id}`), {
        code: "SALE_INVALID_ITEM"
      });
  }
  if (e.customerId !== void 0 && (!Number.isInteger(e.customerId) || e.customerId <= 0))
    throw Object.assign(new Error(`customer_id invalido: ${e.customerId}`), {
      code: "SALE_INVALID_CUSTOMER"
    });
}
function Zt(e, n, t, a) {
  const r = Math.pow(10, a), s = (d) => Math.round(d * r) / r;
  if (t) {
    const d = s(e), u = s(d - d / (1 + n));
    return { subtotal: s(d - u), taxAmount: u, total: d };
  }
  const o = s(e), c = s(o * n), i = s(o + c);
  return { subtotal: o, taxAmount: c, total: i };
}
function Jt(e, n, t, a) {
  return {
    /**
     * @param {SaleInput} input
     * @returns {SaleCreatedResult}
     */
    create(r) {
      Qt(r);
      const s = (
        /** @type {number} */
        n.get("tax_rate")
      ), o = (
        /** @type {boolean} */
        n.get("tax_included_in_price")
      ), c = (
        /** @type {string} */
        n.get("currency_code")
      ), i = (
        /** @type {number} */
        n.get("decimal_places")
      );
      let d = !1;
      try {
        d = /** @type {boolean} */
        n.get("tax_enabled");
      } catch {
      }
      const u = r.customerId ?? zt, E = t.requireById(u), m = r.items.reduce((W, Z) => W + Z.price * Z.qty, 0), _ = r.discountType ?? "none", T = r.discountValue ?? 0, p = Math.pow(10, i), f = (W) => Math.round(W * p) / p;
      let O = 0;
      _ === "percent" && T > 0 ? O = f(m * (T / 100)) : _ === "fixed" && T > 0 && (O = f(Math.min(T, m)));
      const L = f(Math.max(0, m - O)), { subtotal: g, taxAmount: Q, total: Y } = d ? Zt(L, s, o, i) : { subtotal: L, taxAmount: 0, total: L }, V = e.insertSale({
        items: r.items,
        subtotal: g,
        taxRate: s,
        taxAmount: Q,
        total: Y,
        currencyCode: c,
        customerId: u,
        customerNameSnapshot: E.name,
        customerNitSnapshot: E.nit,
        paymentMethod: r.paymentMethod ?? "cash",
        clientType: r.clientType ?? "cf",
        discountType: _,
        discountValue: T,
        discountAmount: O,
        userId: r.userId,
        userName: r.userName
      });
      return {
        saleId: typeof V == "bigint" ? Number(V) : V,
        subtotal: g,
        taxRate: s,
        taxAmount: Q,
        total: Y,
        currencyCode: c,
        customerId: u,
        customerName: E.name,
        customerNit: E.nit
      };
    },
    /**
     * @param {number} id
     * @returns {SaleWithItems | null}
     */
    getById(r) {
      if (!Number.isInteger(r) || r <= 0)
        throw Object.assign(new Error(`sale id invalido: ${r}`), { code: "SALE_INVALID_ID" });
      const s = e.findSaleById(r);
      if (!s) return null;
      const o = e.findSaleItems(r);
      return { ...s, items: o };
    },
    listAllItems() {
      return e.findAllSaleItems();
    },
    /**
     * @param {{ page?: number, pageSize?: number }} [opts]
     * @returns {SaleListResult}
     */
    list(r = {}) {
      var T, p, f, O;
      const s = Number.isInteger(r.page) && /** @type {number} */
      r.page > 0 ? (
        /** @type {number} */
        r.page
      ) : 1, o = Number.isInteger(r.pageSize) && /** @type {number} */
      r.pageSize > 0 ? (
        /** @type {number} */
        r.pageSize
      ) : 50, c = Math.min(o, Kt), i = (s - 1) * c, d = ((T = r.search) == null ? void 0 : T.trim()) || null, u = ((p = r.from) == null ? void 0 : p.trim()) || null, E = ((f = r.to) == null ? void 0 : f.trim()) || null, m = ((O = r.status) == null ? void 0 : O.trim()) || null, _ = r.userId != null ? Number(r.userId) : null;
      return {
        data: e.findPage({ limit: c, offset: i, search: d, from: u, to: E, status: m, userId: _ }),
        total: e.countAll({ search: d, from: u, to: E, status: m, userId: _ }),
        page: s,
        pageSize: c
      };
    },
    /**
     * Anula una venta, restaura stock y registra en bitácora.
     * @param {{ saleId: number, reason: string, userId?: number, userName?: string }} input
     */
    voidSale(r) {
      if (!Number.isInteger(r.saleId) || r.saleId <= 0)
        throw Object.assign(new Error(`sale id invalido: ${r.saleId}`), { code: "SALE_INVALID_ID" });
      if (!r.reason || r.reason.trim().length < 5)
        throw Object.assign(new Error("El motivo debe tener al menos 5 caracteres"), { code: "VOID_REASON_REQUIRED" });
      const s = e.findSaleById(r.saleId);
      if (!s)
        throw Object.assign(new Error(`Venta ${r.saleId} no encontrada`), { code: "SALE_NOT_FOUND" });
      if (s.status === "voided")
        throw Object.assign(new Error(`La venta ${r.saleId} ya está anulada`), { code: "SALE_ALREADY_VOIDED" });
      const o = e.findSaleItems(r.saleId), c = e.voidSale(
        { saleId: r.saleId, reason: r.reason.trim(), userId: r.userId },
        o
      );
      return c && (a == null || a.log({
        action: "sale_voided",
        entity: "sale",
        entityId: r.saleId,
        description: `Venta #${r.saleId} anulada. Motivo: ${r.reason.trim()}`,
        payload: { total: s.total, customer: s.customer_name_snapshot, reason: r.reason.trim() },
        userId: r.userId,
        userName: r.userName
      })), { voided: c, saleId: r.saleId };
    },
    /** Reporte del día: totales + top 5 productos. */
    dailyReport() {
      return {
        summary: e.getDailySummary(),
        topProducts: e.getTopProducts()
      };
    },
    /**
     * Reporte de ventas por rango de fechas: serie diaria, top productos,
     * horarios concurridos, días de semana y métodos de pago.
     * @param {{ from: string, to: string }} range  Formato YYYY-MM-DD
     */
    rangeReport({ from: r, to: s }) {
      if (!r || !s || r > s)
        throw Object.assign(new Error("Rango de fechas inválido"), { code: "INVALID_DATE_RANGE" });
      return {
        series: e.getSalesByDate({ from: r, to: s }),
        topProducts: e.getTopProductsRange({ from: r, to: s }),
        byHour: e.getSalesByHour({ from: r, to: s }),
        byWeekday: e.getSalesByWeekday({ from: r, to: s }),
        byPaymentMethod: e.getSalesByPaymentMethod({ from: r, to: s }),
        byCashier: e.getSalesByCashier({ from: r, to: s })
      };
    }
  };
}
const { ipcMain: B } = N;
function en(e) {
  B.handle("sales:create", l((n, t) => e.create(t))), B.handle("sales:get-by-id", l((n, t) => e.getById(t))), B.handle("sales:list", l((n, t) => e.list(t))), B.handle("sales:list-all-items", l(() => e.listAllItems())), B.handle("sales:daily-report", l(() => e.dailyReport())), B.handle("sales:void", l((n, t) => e.voidSale(t))), B.handle("sales:range-report", l((n, t) => e.rangeReport(t)));
}
const Re = "id, email, full_name, role, active, avatar, created_at, updated_at", tn = "id, email, full_name, role, password_hash, active, avatar, created_at, updated_at";
function nn(e) {
  const n = {
    findAll: e.prepare(
      `SELECT ${Re} FROM users ORDER BY role, full_name`
    ),
    findById: e.prepare(
      `SELECT ${Re} FROM users WHERE id = ?`
    ),
    findByEmail: e.prepare(
      `SELECT ${tn} FROM users WHERE email = ? COLLATE NOCASE`
    ),
    insert: e.prepare(
      `INSERT INTO users (email, full_name, role, password_hash)
       VALUES (@email, @full_name, @role, @password_hash)`
    ),
    update: e.prepare(
      `UPDATE users
          SET full_name  = @full_name,
              role       = @role,
              updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        WHERE id = @id`
    ),
    updateAvatar: e.prepare(
      `UPDATE users
          SET avatar     = @avatar,
              updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        WHERE id = @id`
    ),
    updatePassword: e.prepare(
      `UPDATE users
          SET password_hash = @password_hash,
              updated_at    = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        WHERE id = @id`
    ),
    setActive: e.prepare(
      `UPDATE users
          SET active     = @active,
              updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        WHERE id = @id`
    )
  };
  return {
    /** @returns {Omit<UserRow, 'password_hash'>[]} */
    findAll() {
      return n.findAll.all();
    },
    /**
     * @param {number} id
     * @returns {Omit<UserRow, 'password_hash'> | undefined}
     */
    findById(t) {
      return n.findById.get(t);
    },
    /**
     * Incluye password_hash — solo para login.
     * @param {string} email
     * @returns {UserRow | undefined}
     */
    findByEmailWithHash(t) {
      return n.findByEmail.get(t);
    },
    /**
     * @param {{ email: string, full_name: string, role: string, password_hash: string }} data
     * @returns {number}
     */
    create(t) {
      return Number(n.insert.run(t).lastInsertRowid);
    },
    /**
     * @param {number} id
     * @param {{ full_name: string, role: string }} data
     */
    update(t, a) {
      n.update.run({ ...a, id: t });
    },
    /**
     * @param {number} id
     * @param {string} password_hash
     */
    updatePassword(t, a) {
      n.updatePassword.run({ id: t, password_hash: a });
    },
    /**
     * @param {number} id
     * @param {string|null} avatar  — base64 data-URL o null para borrar
     */
    updateAvatar(t, a) {
      n.updateAvatar.run({ id: t, avatar: a ?? null });
    },
    /**
     * @param {number} id
     * @param {0|1} active
     */
    setActive(t, a) {
      n.setActive.run({ id: t, active: a });
    }
  };
}
const Oe = (
  /** @type {const} */
  ["admin", "cashier", "mechanic", "warehouse"]
);
function ie(e) {
  return ze("sha256").update(e).digest("hex");
}
function an(e) {
  function n(a) {
    if (!Number.isInteger(a) || a <= 0)
      throw Object.assign(new Error(`user id invalido: ${a}`), { code: "USER_INVALID_ID" });
  }
  function t(a) {
    n(a);
    const r = e.findById(a);
    if (!r) throw Object.assign(new Error(`usuario no encontrado: ${a}`), { code: "USER_NOT_FOUND" });
    return r;
  }
  return {
    /** Lista todos los usuarios sin exponer password_hash. */
    list() {
      return e.findAll();
    },
    /** @param {number} id */
    getById(a) {
      return n(a), e.findById(a) ?? null;
    },
    /**
     * Login: valida credenciales y devuelve el usuario sin hash.
     * @param {string} email
     * @param {string} password
     */
    login(a, r) {
      if (!a || !r)
        throw Object.assign(new Error("Email y contraseña requeridos"), { code: "AUTH_MISSING_FIELDS" });
      const s = e.findByEmailWithHash(a.trim());
      if (!s)
        throw Object.assign(new Error("Credenciales incorrectas"), { code: "AUTH_INVALID" });
      if (s.active === 0)
        throw Object.assign(new Error("Usuario desactivado"), { code: "AUTH_INACTIVE" });
      if (s.password_hash !== ie(r))
        throw Object.assign(new Error("Credenciales incorrectas"), { code: "AUTH_INVALID" });
      const { password_hash: o, ...c } = s;
      return c;
    },
    /**
     * @param {{ email: string, full_name: string, role: string, password: string }} input
     */
    create(a) {
      const r = (a.email ?? "").trim().toLowerCase(), s = (a.full_name ?? "").trim(), o = a.role;
      if (!r) throw Object.assign(new Error("Email requerido"), { code: "USER_MISSING_EMAIL" });
      if (!s) throw Object.assign(new Error("Nombre requerido"), { code: "USER_MISSING_NAME" });
      if (!Oe.includes(
        /** @type {any} */
        o
      ))
        throw Object.assign(new Error(`Rol invalido: ${o}`), { code: "USER_INVALID_ROLE" });
      if (!a.password || a.password.length < 6)
        throw Object.assign(new Error("Contraseña minimo 6 caracteres"), { code: "USER_WEAK_PASSWORD" });
      if (e.findByEmailWithHash(r)) throw Object.assign(new Error("El email ya está en uso"), { code: "USER_EMAIL_TAKEN" });
      const i = e.create({ email: r, full_name: s, role: o, password_hash: ie(a.password) });
      return e.findById(i);
    },
    /**
     * @param {number} id
     * @param {{ full_name?: string, role?: string }} patch
     */
    update(a, r) {
      const s = t(a), o = (r.full_name ?? s.full_name).trim(), c = r.role ?? s.role;
      if (!o) throw Object.assign(new Error("Nombre requerido"), { code: "USER_MISSING_NAME" });
      if (!Oe.includes(
        /** @type {any} */
        c
      ))
        throw Object.assign(new Error(`Rol invalido: ${c}`), { code: "USER_INVALID_ROLE" });
      if (s.role === "admin" && c !== "admin" && e.findAll().filter((d) => d.role === "admin" && d.active === 1).length <= 1)
        throw Object.assign(new Error("Debe existir al menos un administrador activo"), { code: "USER_LAST_ADMIN" });
      return e.update(a, { full_name: o, role: c }), e.findById(a);
    },
    /**
     * @param {number} id
     * @param {string} newPassword
     */
    changePassword(a, r) {
      if (t(a), !r || r.length < 6)
        throw Object.assign(new Error("Contraseña minimo 6 caracteres"), { code: "USER_WEAK_PASSWORD" });
      return e.updatePassword(a, ie(r)), e.findById(a);
    },
    /**
     * @param {number} id
     * @param {string|null} avatar  — base64 data-URL (max ~300 KB) o null
     */
    updateAvatar(a, r) {
      if (t(a), r !== null && typeof r != "string")
        throw Object.assign(new Error("Avatar invalido"), { code: "USER_INVALID_AVATAR" });
      if (r && r.length > 4e5)
        throw Object.assign(new Error("Imagen demasiado grande (max 300 KB)"), { code: "USER_AVATAR_TOO_LARGE" });
      return e.updateAvatar(a, r), e.findById(a);
    },
    /**
     * @param {number} id
     * @param {boolean} active
     */
    setActive(a, r) {
      const s = t(a);
      if (!r && s.role === "admin" && e.findAll().filter((c) => c.role === "admin" && c.active === 1).length <= 1)
        throw Object.assign(new Error("Debe existir al menos un administrador activo"), { code: "USER_LAST_ADMIN" });
      return e.setActive(a, r ? 1 : 0), e.findById(a);
    }
  };
}
const { ipcMain: w } = N;
function rn(e) {
  w.handle("users:login", l((n, t, a) => e.login(t, a))), w.handle("users:list", l(() => e.list())), w.handle("users:get-by-id", l((n, t) => e.getById(t))), w.handle("users:create", l((n, t) => e.create(t))), w.handle("users:update", l((n, t, a) => e.update(t, a))), w.handle("users:change-password", l((n, t, a) => e.changePassword(t, a))), w.handle("users:set-active", l((n, t, a) => e.setActive(t, a))), w.handle("users:update-avatar", l((n, t, a) => e.updateAvatar(t, a)));
}
const sn = 200;
function on(e) {
  const n = {
    insert: e.prepare(`
      INSERT INTO audit_log (action, entity, entity_id, description, payload_json, user_id, user_name)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `),
    selectPage: e.prepare(`
      SELECT id, action, entity, entity_id, description, payload_json, user_id, user_name, created_at
      FROM audit_log
      WHERE (:action IS NULL OR action = :action)
        AND (:entity IS NULL OR entity = :entity)
        AND (:from   IS NULL OR created_at >= :from)
        AND (:to     IS NULL OR created_at <= :to)
      ORDER BY id DESC
      LIMIT :limit OFFSET :offset
    `),
    countFiltered: e.prepare(`
      SELECT COUNT(*) AS total FROM audit_log
      WHERE (:action IS NULL OR action = :action)
        AND (:entity IS NULL OR entity = :entity)
        AND (:from   IS NULL OR created_at >= :from)
        AND (:to     IS NULL OR created_at <= :to)
    `)
  };
  return {
    /**
     * @param {AuditEntry} entry
     */
    log(t) {
      n.insert.run(
        t.action,
        t.entity ?? null,
        t.entityId ?? null,
        t.description ?? null,
        t.payload ? JSON.stringify(t.payload) : null,
        t.userId ?? null,
        t.userName ?? null
      );
    },
    /**
     * @param {{ page?: number, pageSize?: number, action?: string, entity?: string, from?: string, to?: string }} opts
     * @returns {{ data: AuditRow[], total: number, page: number, pageSize: number }}
     */
    findPage(t = {}) {
      const a = t.page ?? 1, r = Math.min(t.pageSize ?? 50, sn), s = (a - 1) * r, o = {
        action: t.action ?? null,
        entity: t.entity ?? null,
        from: t.from ?? null,
        to: t.to ?? null,
        limit: r,
        offset: s
      }, c = (
        /** @type {AuditRow[]} */
        n.selectPage.all(o)
      ), i = (
        /** @type {{ total: number }} */
        n.countFiltered.get(o).total
      );
      return { data: c, total: i, page: a, pageSize: r };
    }
  };
}
function cn(e) {
  return {
    /**
     * @param {import('./audit.repository.js').AuditEntry} entry
     */
    log(n) {
      e.log(n);
    },
    /**
     * @param {{ page?: number, pageSize?: number, action?: string, entity?: string, from?: string, to?: string }} opts
     */
    list(n = {}) {
      return e.findPage(n);
    }
  };
}
const { ipcMain: dn } = N;
function ln(e) {
  dn.handle("audit:list", l((n, t) => e.list(t)));
}
function un(e) {
  const n = {
    findOpen: e.prepare(
      "SELECT * FROM cash_sessions WHERE status = 'open' ORDER BY opened_at DESC LIMIT 1"
    ),
    findById: e.prepare(
      "SELECT * FROM cash_sessions WHERE id = ?"
    ),
    findAll: e.prepare(
      "SELECT * FROM cash_sessions ORDER BY opened_at DESC LIMIT 100"
    ),
    insert: e.prepare(
      `INSERT INTO cash_sessions (opened_by, opened_by_name, opening_amount)
       VALUES (@opened_by, @opened_by_name, @opening_amount)`
    ),
    close: e.prepare(
      `UPDATE cash_sessions
          SET closed_by       = @closed_by,
              closed_by_name  = @closed_by_name,
              closed_at       = strftime('%Y-%m-%d %H:%M:%S', 'now', 'localtime'),
              closing_amount  = @closing_amount,
              expected_amount = @expected_amount,
              difference      = @difference,
              notes           = @notes,
              status          = 'closed'
        WHERE id = @id AND status = 'open'`
    ),
    movementsForSession: e.prepare(
      "SELECT * FROM cash_movements WHERE session_id = ? ORDER BY created_at ASC"
    ),
    findAllMovements: e.prepare(
      "SELECT * FROM cash_movements ORDER BY created_at ASC"
    ),
    insertMovement: e.prepare(
      `INSERT INTO cash_movements (session_id, type, amount, concept, created_by)
       VALUES (@session_id, @type, @amount, @concept, @created_by)`
    ),
    salesTotalForSession: e.prepare(
      `SELECT COALESCE(SUM(total), 0) AS total
         FROM sales
        WHERE status = 'active'
          AND payment_method != 'credit'
          AND date >= (SELECT opened_at FROM cash_sessions WHERE id = ?)
          AND (? IS NULL OR date < ?)`
      // closed_at o NULL si está abierta
    ),
    receivablePaymentsForSession: e.prepare(
      `SELECT COALESCE(SUM(amount), 0) AS total
         FROM receivable_payments
        WHERE created_at >= (SELECT opened_at FROM cash_sessions WHERE id = ?)
          AND (? IS NULL OR created_at < ?)`
    ),
    salesTotalToday: e.prepare(
      `SELECT COALESCE(SUM(total), 0) AS total
         FROM sales
        WHERE status = 'active'
          AND payment_method != 'credit'
          AND DATE(date, 'localtime') = DATE('now', 'localtime')`
    ),
    receivablePaymentsTotalToday: e.prepare(
      `SELECT COALESCE(SUM(amount), 0) AS total
         FROM receivable_payments
        WHERE DATE(created_at, 'localtime') = DATE('now', 'localtime')`
    )
  };
  return {
    /** @returns {CashSessionRow|undefined} */
    findOpen() {
      return n.findOpen.get();
    },
    /** @param {number} id @returns {CashSessionRow|undefined} */
    findById(t) {
      return n.findById.get(t);
    },
    /** @returns {CashSessionRow[]} */
    findAll() {
      return n.findAll.all();
    },
    /**
     * @param {{ opened_by: number, opened_by_name: string, opening_amount: number }} data
     * @returns {number}
     */
    open(t) {
      return Number(n.insert.run(t).lastInsertRowid);
    },
    /**
     * @param {{ id: number, closed_by: number, closed_by_name: string, closing_amount: number, expected_amount: number, difference: number, notes: string|null }} data
     */
    close(t) {
      n.close.run(t);
    },
    /** @param {number} sessionId @returns {CashMovementRow[]} */
    movementsForSession(t) {
      return n.movementsForSession.all(t);
    },
    /** @returns {CashMovementRow[]} */
    findAllMovements() {
      return n.findAllMovements.all();
    },
    /**
     * @param {{ session_id: number, type: 'in'|'out', amount: number, concept: string, created_by: number }} data
     * @returns {number}
     */
    insertMovement(t) {
      return Number(n.insertMovement.run(t).lastInsertRowid);
    },
    /**
     * Suma de ventas activas (no crédito) durante la sesión.
     * @param {number} sessionId
     * @param {string|null} closedAt
     * @returns {number}
     */
    salesTotal(t, a) {
      const r = (
        /** @type {{ total: number }} */
        n.salesTotalForSession.get(t, a, a)
      );
      return (r == null ? void 0 : r.total) ?? 0;
    },
    /**
     * Suma de abonos a cuentas por cobrar durante la sesión.
     * @param {number} sessionId
     * @param {string|null} closedAt
     * @returns {number}
     */
    receivablePaymentsTotal(t, a) {
      const r = (
        /** @type {{ total: number }} */
        n.receivablePaymentsForSession.get(t, a, a)
      );
      return (r == null ? void 0 : r.total) ?? 0;
    },
    /** Suma de ventas activas (no crédito) del día de hoy. */
    salesTotalToday() {
      const t = (
        /** @type {{ total: number }} */
        n.salesTotalToday.get()
      );
      return (t == null ? void 0 : t.total) ?? 0;
    },
    /** Suma de abonos CxC del día de hoy. */
    receivablePaymentsTodayTotal() {
      const t = (
        /** @type {{ total: number }} */
        n.receivablePaymentsTotalToday.get()
      );
      return (t == null ? void 0 : t.total) ?? 0;
    }
  };
}
function En(e) {
  function n(t) {
    if (t !== "admin")
      throw Object.assign(new Error("Solo el administrador puede gestionar la caja"), { code: "CASH_FORBIDDEN" });
  }
  return {
    /** Devuelve la sesión abierta o null */
    getOpenSession() {
      return e.findOpen() ?? null;
    },
    /** Lista todas las sesiones (historial) */
    listSessions() {
      return e.findAll();
    },
    /** Lista todos los movimientos de caja (para sync) */
    listAllMovements() {
      return e.findAllMovements();
    },
    /**
     * @param {number} sessionId
     */
    getSession(t) {
      const a = e.findById(t);
      if (!a) throw Object.assign(new Error("Sesión no encontrada"), { code: "CASH_NOT_FOUND" });
      const r = e.movementsForSession(t), s = e.salesTotal(t, a.closed_at), o = e.receivablePaymentsTotal(t, a.closed_at);
      if (a.status === "open") {
        const c = r.filter((d) => d.type === "in").reduce((d, u) => d + u.amount, 0), i = r.filter((d) => d.type === "out").reduce((d, u) => d + u.amount, 0);
        a.expected_amount = a.opening_amount + s + (o ?? 0) + c - i;
      }
      return { session: a, movements: r, salesTotal: s, receivablePaymentsTotal: o };
    },
    /**
     * Abre una nueva sesión de caja. Solo admin.
     * @param {{ userId: number, userName: string, role: string, openingAmount: number }} input
     */
    openSession({ userId: t, userName: a, role: r, openingAmount: s }) {
      if (n(r), e.findOpen())
        throw Object.assign(new Error("Ya hay una caja abierta"), { code: "CASH_ALREADY_OPEN" });
      if (typeof s != "number" || s < 0)
        throw Object.assign(new Error("Monto inicial inválido"), { code: "CASH_INVALID_AMOUNT" });
      const c = e.open({
        opened_by: t,
        opened_by_name: a,
        opening_amount: s
      });
      return e.findById(c);
    },
    /**
     * Cierra la sesión abierta. Solo admin.
     * @param {{ userId: number, userName: string, role: string, closingAmount: number, notes?: string }} input
     */
    closeSession({ userId: t, userName: a, role: r, closingAmount: s, notes: o }) {
      n(r);
      const c = e.findOpen();
      if (!c)
        throw Object.assign(new Error("No hay caja abierta"), { code: "CASH_NOT_OPEN" });
      if (typeof s != "number" || s < 0)
        throw Object.assign(new Error("Monto de cierre inválido"), { code: "CASH_INVALID_AMOUNT" });
      const i = e.salesTotalToday(), d = e.receivablePaymentsTodayTotal(), u = e.movementsForSession(c.id), E = u.filter((p) => p.type === "in").reduce((p, f) => p + f.amount, 0), m = u.filter((p) => p.type === "out").reduce((p, f) => p + f.amount, 0), _ = c.opening_amount + i + d + E - m, T = s - _;
      return e.close({
        id: c.id,
        closed_by: t,
        closed_by_name: a,
        closing_amount: s,
        expected_amount: _,
        difference: T,
        notes: o ?? null
      }), e.findById(c.id);
    },
    /**
     * Agrega un movimiento manual (ingreso o egreso). Solo admin.
     * @param {{ userId: number, role: string, type: 'in'|'out', amount: number, concept: string }} input
     */
    addMovement({ userId: t, role: a, type: r, amount: s, concept: o }) {
      n(a);
      const c = e.findOpen();
      if (!c)
        throw Object.assign(new Error("No hay caja abierta"), { code: "CASH_NOT_OPEN" });
      if (!["in", "out"].includes(r))
        throw Object.assign(new Error("Tipo de movimiento inválido"), { code: "CASH_INVALID_TYPE" });
      if (!s || s <= 0)
        throw Object.assign(new Error("Monto inválido"), { code: "CASH_INVALID_AMOUNT" });
      if (!(o != null && o.trim()))
        throw Object.assign(new Error("Concepto requerido"), { code: "CASH_MISSING_CONCEPT" });
      return { id: e.insertMovement({ session_id: c.id, type: r, amount: s, concept: o.trim(), created_by: t }), session_id: c.id, type: r, amount: s, concept: o, created_by: t };
    }
  };
}
const { ipcMain: q } = N;
function mn(e) {
  q.handle("cash:get-open", l(() => e.getOpenSession())), q.handle("cash:list", l(() => e.listSessions())), q.handle("cash:list-all-movements", l(() => e.listAllMovements())), q.handle("cash:get-session", l((n, t) => e.getSession(t))), q.handle("cash:open", l((n, t) => e.openSession(t))), q.handle("cash:close", l((n, t) => e.closeSession(t))), q.handle("cash:add-movement", l((n, t) => e.addMovement(t)));
}
function _n(e) {
  const n = {
    // suppliers
    findAllSuppliers: e.prepare(
      "SELECT * FROM suppliers ORDER BY name"
    ),
    findSupplierById: e.prepare(
      "SELECT * FROM suppliers WHERE id = ?"
    ),
    insertSupplier: e.prepare(
      `INSERT INTO suppliers (name, contact_name, phone, email, address, notes)
       VALUES (@name, @contact_name, @phone, @email, @address, @notes)`
    ),
    updateSupplier: e.prepare(
      `UPDATE suppliers SET name=@name, contact_name=@contact_name, phone=@phone,
       email=@email, address=@address, notes=@notes,
       updated_at=strftime('%Y-%m-%d %H:%M:%S','now','localtime')
       WHERE id=@id`
    ),
    setSupplierActive: e.prepare(
      `UPDATE suppliers SET active=@active,
       updated_at=strftime('%Y-%m-%d %H:%M:%S','now','localtime')
       WHERE id=@id`
    ),
    // purchase orders
    findAllOrders: e.prepare(
      `SELECT po.*, s.name AS supplier_name
         FROM purchase_orders po
         JOIN suppliers s ON s.id = po.supplier_id
        ORDER BY po.created_at DESC LIMIT 200`
    ),
    findOrderById: e.prepare(
      `SELECT po.*, s.name AS supplier_name
         FROM purchase_orders po
         JOIN suppliers s ON s.id = po.supplier_id
        WHERE po.id = ?`
    ),
    findOrdersBySupplier: e.prepare(
      `SELECT po.*, s.name AS supplier_name
         FROM purchase_orders po
         JOIN suppliers s ON s.id = po.supplier_id
        WHERE po.supplier_id = ?
        ORDER BY po.created_at DESC`
    ),
    insertOrder: e.prepare(
      `INSERT INTO purchase_orders (supplier_id, notes, created_by, created_by_name)
       VALUES (@supplier_id, @notes, @created_by, @created_by_name)`
    ),
    updateOrderStatus: e.prepare(
      `UPDATE purchase_orders SET status=@status, received_at=@received_at,
       total_cost=@total_cost WHERE id=@id`
    ),
    cancelOrder: e.prepare(
      "UPDATE purchase_orders SET status='cancelled' WHERE id=? AND status IN ('draft','sent')"
    ),
    // purchase items
    findItemsByOrder: e.prepare(
      "SELECT * FROM purchase_items WHERE order_id = ?"
    ),
    insertItem: e.prepare(
      `INSERT INTO purchase_items (order_id, product_id, product_name, product_code, qty_ordered, unit_cost)
       VALUES (@order_id, @product_id, @product_name, @product_code, @qty_ordered, @unit_cost)`
    ),
    updateItemReceived: e.prepare(
      "UPDATE purchase_items SET qty_received=@qty_received WHERE id=@id"
    ),
    // stock update on receive
    addStock: e.prepare(
      "UPDATE products SET stock = stock + @qty WHERE id = @id"
    ),
    updateProductCost: e.prepare(
      "UPDATE products SET cost = @cost WHERE id = @id"
    ),
    getProductForMove: e.prepare(
      "SELECT id, name, stock, cost FROM products WHERE id = ?"
    ),
    insertMovement: e.prepare(`
      INSERT INTO stock_movements
        (product_id, product_name, type, qty, qty_before, qty_after, reference_type, reference_id, notes, created_by, created_by_name)
      VALUES
        (@product_id, @product_name, @type, @qty, @qty_before, @qty_after, @reference_type, @reference_id, @notes, @created_by, @created_by_name)
    `)
  };
  return {
    // ── Suppliers ──────────────────────────────────────────────────────────
    findAllSuppliers() {
      return n.findAllSuppliers.all();
    },
    findSupplierById(t) {
      return n.findSupplierById.get(t);
    },
    createSupplier(t) {
      return Number(n.insertSupplier.run(t).lastInsertRowid);
    },
    updateSupplier(t, a) {
      n.updateSupplier.run({ ...a, id: t });
    },
    setSupplierActive(t, a) {
      n.setSupplierActive.run({ id: t, active: a });
    },
    // ── Orders ─────────────────────────────────────────────────────────────
    findAllOrders() {
      return n.findAllOrders.all();
    },
    findOrderById(t) {
      return n.findOrderById.get(t);
    },
    findOrdersBySupplier(t) {
      return n.findOrdersBySupplier.all(t);
    },
    createOrder(t) {
      return Number(n.insertOrder.run(t).lastInsertRowid);
    },
    updateOrderStatus(t, a, r, s) {
      n.updateOrderStatus.run({ id: t, status: a, received_at: r ?? null, total_cost: s });
    },
    cancelOrder(t) {
      n.cancelOrder.run(t);
    },
    // ── Items ──────────────────────────────────────────────────────────────
    findItemsByOrder(t) {
      return n.findItemsByOrder.all(t);
    },
    insertItem(t) {
      return Number(n.insertItem.run(t).lastInsertRowid);
    },
    // ── Receive (transaction) ──────────────────────────────────────────────
    /**
     * Marca orden como recibida, actualiza qty_received en items y suma al stock.
     * @param {number} orderId
     * @param {{ id: number, qty_received: number }[]} receivedItems
     * @param {boolean} updatePrices  Si true actualiza el costo del producto al costo de la orden
     */
    receiveOrder: e.transaction((t, a, r) => {
      let s = 0;
      for (const c of a) {
        n.updateItemReceived.run(c);
        const i = n.findItemsByOrder.all(t).find((d) => d.id === c.id);
        if (i != null && i.product_id && c.qty_received > 0) {
          const d = n.getProductForMove.get(i.product_id), u = (d == null ? void 0 : d.stock) ?? 0;
          n.addStock.run({ id: i.product_id, qty: c.qty_received }), r && i.unit_cost > 0 && n.updateProductCost.run({ id: i.product_id, cost: i.unit_cost }), n.insertMovement.run({
            product_id: i.product_id,
            product_name: (d == null ? void 0 : d.name) ?? i.product_name,
            type: "purchase",
            qty: c.qty_received,
            qty_before: u,
            qty_after: u + c.qty_received,
            reference_type: "purchase",
            reference_id: t,
            notes: null,
            created_by: null,
            created_by_name: null
          });
        }
        s += ((i == null ? void 0 : i.unit_cost) ?? 0) * c.qty_received;
      }
      const o = (/* @__PURE__ */ new Date()).toISOString().slice(0, 19).replace("T", " ");
      n.updateOrderStatus.run({ id: t, status: "received", received_at: o, total_cost: s });
    }),
    /**
     * Devuelve los items de una orden con el costo actual del producto en catálogo,
     * para detectar variaciones antes de confirmar recepción.
     * @param {number} orderId
     */
    priceVariations(t) {
      return n.findItemsByOrder.all(t).map((r) => {
        if (!r.product_id) return { ...r, current_cost: null, has_variation: !1 };
        const s = (
          /** @type {{ cost: number }|undefined} */
          n.getProductForMove.get(r.product_id)
        ), o = (s == null ? void 0 : s.cost) ?? 0;
        return {
          ...r,
          current_cost: o,
          has_variation: r.unit_cost > 0 && Math.abs(r.unit_cost - o) > 1e-3
        };
      });
    }
  };
}
function pn(e) {
  function n(t) {
    if (t !== "admin")
      throw Object.assign(new Error("Solo el administrador puede gestionar compras"), { code: "PURCHASES_FORBIDDEN" });
  }
  return {
    // ── Suppliers ────────────────────────────────────────────────────────
    listSuppliers() {
      return e.findAllSuppliers();
    },
    getSupplier(t) {
      return e.findSupplierById(t) ?? null;
    },
    createSupplier(t, a) {
      var o, c, i, d, u;
      n(a);
      const r = (t.name ?? "").trim();
      if (!r) throw Object.assign(new Error("Nombre del proveedor requerido"), { code: "SUPPLIER_MISSING_NAME" });
      const s = e.createSupplier({
        name: r,
        contact_name: ((o = t.contact_name) == null ? void 0 : o.trim()) || null,
        phone: ((c = t.phone) == null ? void 0 : c.trim()) || null,
        email: ((i = t.email) == null ? void 0 : i.trim()) || null,
        address: ((d = t.address) == null ? void 0 : d.trim()) || null,
        notes: ((u = t.notes) == null ? void 0 : u.trim()) || null
      });
      return e.findSupplierById(s);
    },
    updateSupplier(t, a, r) {
      var c, i, d, u, E;
      n(r);
      const s = e.findSupplierById(t);
      if (!s) throw Object.assign(new Error("Proveedor no encontrado"), { code: "SUPPLIER_NOT_FOUND" });
      const o = (a.name ?? s.name).trim();
      if (!o) throw Object.assign(new Error("Nombre requerido"), { code: "SUPPLIER_MISSING_NAME" });
      return e.updateSupplier(t, {
        name: o,
        contact_name: ((c = a.contact_name) == null ? void 0 : c.trim()) ?? s.contact_name,
        phone: ((i = a.phone) == null ? void 0 : i.trim()) ?? s.phone,
        email: ((d = a.email) == null ? void 0 : d.trim()) ?? s.email,
        address: ((u = a.address) == null ? void 0 : u.trim()) ?? s.address,
        notes: ((E = a.notes) == null ? void 0 : E.trim()) ?? s.notes
      }), e.findSupplierById(t);
    },
    setSupplierActive(t, a, r) {
      return n(r), e.setSupplierActive(t, a ? 1 : 0), e.findSupplierById(t);
    },
    // ── Purchase Orders ──────────────────────────────────────────────────
    listOrders() {
      return e.findAllOrders();
    },
    getOrder(t) {
      const a = e.findOrderById(t);
      if (!a) throw Object.assign(new Error("Orden no encontrada"), { code: "ORDER_NOT_FOUND" });
      const r = e.findItemsByOrder(t);
      return { order: a, items: r };
    },
    /**
     * @param {{ supplierId: number, notes?: string, items: { productId?: number, productName: string, productCode?: string, qtyOrdered: number, unitCost: number }[], userId: number, userName: string, role: string }} input
     */
    createOrder(t) {
      var r, s, o, c;
      if (n(t.role), !t.supplierId) throw Object.assign(new Error("Proveedor requerido"), { code: "ORDER_MISSING_SUPPLIER" });
      if (!((r = t.items) != null && r.length)) throw Object.assign(new Error("Agrega al menos un producto"), { code: "ORDER_EMPTY" });
      const a = e.createOrder({
        supplier_id: t.supplierId,
        notes: ((s = t.notes) == null ? void 0 : s.trim()) || null,
        created_by: t.userId,
        created_by_name: t.userName
      });
      for (const i of t.items) {
        if (!((o = i.productName) != null && o.trim())) throw Object.assign(new Error("Nombre de producto requerido"), { code: "ITEM_MISSING_NAME" });
        if (i.qtyOrdered <= 0) throw Object.assign(new Error("Cantidad debe ser mayor a 0"), { code: "ITEM_INVALID_QTY" });
        e.insertItem({
          order_id: a,
          product_id: i.productId ?? null,
          product_name: i.productName.trim(),
          product_code: ((c = i.productCode) == null ? void 0 : c.trim()) || null,
          qty_ordered: i.qtyOrdered,
          unit_cost: i.unitCost ?? 0
        });
      }
      return e.findOrderById(a);
    },
    markSent(t, a) {
      n(a);
      const r = e.findOrderById(t);
      if (!r) throw Object.assign(new Error("Orden no encontrada"), { code: "ORDER_NOT_FOUND" });
      if (r.status !== "draft") throw Object.assign(new Error("Solo se pueden enviar órdenes en borrador"), { code: "ORDER_INVALID_STATUS" });
      return e.updateOrderStatus(t, "sent", null, r.total_cost), e.findOrderById(t);
    },
    /**
     * Devuelve los items de la orden comparados con el costo actual en catálogo.
     * Útil para mostrar al usuario si hay variaciones de precio antes de confirmar.
     * @param {{ orderId: number, role: string }} input
     */
    priceVariations(t) {
      if (n(t.role), !e.findOrderById(t.orderId)) throw Object.assign(new Error("Orden no encontrada"), { code: "ORDER_NOT_FOUND" });
      return e.priceVariations(t.orderId);
    },
    /**
     * Recibe la orden: actualiza stock. Si updatePrices=true también actualiza el costo.
     * @param {{ orderId: number, role: string, items: { id: number, qty_received: number }[], updatePrices?: boolean }} input
     */
    receiveOrder(t) {
      var r;
      n(t.role);
      const a = e.findOrderById(t.orderId);
      if (!a) throw Object.assign(new Error("Orden no encontrada"), { code: "ORDER_NOT_FOUND" });
      if (!["draft", "sent"].includes(a.status))
        throw Object.assign(new Error("Esta orden ya fue recibida o cancelada"), { code: "ORDER_INVALID_STATUS" });
      if (!((r = t.items) != null && r.length)) throw Object.assign(new Error("Sin items para recibir"), { code: "ORDER_EMPTY" });
      return e.receiveOrder(t.orderId, t.items, t.updatePrices ?? !1), e.findOrderById(t.orderId);
    },
    cancelOrder(t, a) {
      n(a);
      const r = e.findOrderById(t);
      if (!r) throw Object.assign(new Error("Orden no encontrada"), { code: "ORDER_NOT_FOUND" });
      if (!["draft", "sent"].includes(r.status))
        throw Object.assign(new Error("No se puede cancelar esta orden"), { code: "ORDER_INVALID_STATUS" });
      return e.cancelOrder(t), e.findOrderById(t);
    }
  };
}
const { ipcMain: A } = N;
function Tn(e) {
  A.handle("suppliers:list", l(() => e.listSuppliers())), A.handle("suppliers:get", l((n, t) => e.getSupplier(t))), A.handle("suppliers:create", l((n, t, a) => e.createSupplier(t, a))), A.handle("suppliers:update", l((n, t, a, r) => e.updateSupplier(t, a, r))), A.handle("suppliers:set-active", l((n, t, a, r) => e.setSupplierActive(t, a, r))), A.handle("purchases:list", l(() => e.listOrders())), A.handle("purchases:get", l((n, t) => e.getOrder(t))), A.handle("purchases:create", l((n, t) => e.createOrder(t))), A.handle("purchases:mark-sent", l((n, t, a) => e.markSent(t, a))), A.handle("purchases:price-variations", l((n, t) => e.priceVariations(t))), A.handle("purchases:receive", l((n, t) => e.receiveOrder(t))), A.handle("purchases:cancel", l((n, t, a) => e.cancelOrder(t, a)));
}
function Nn(e) {
  const n = {
    findAll: e.prepare(`
      SELECT * FROM receivables ORDER BY
        CASE status WHEN 'pending' THEN 0 WHEN 'partial' THEN 1 ELSE 2 END,
        due_date ASC NULLS LAST, created_at DESC
    `),
    findById: e.prepare("SELECT * FROM receivables WHERE id = ?"),
    findByCustomer: e.prepare("SELECT * FROM receivables WHERE customer_id = ? ORDER BY created_at DESC"),
    insert: e.prepare(`
      INSERT INTO receivables
        (customer_id, customer_name, customer_nit, description, amount, due_date, notes, created_by, created_by_name)
      VALUES
        (@customer_id, @customer_name, @customer_nit, @description, @amount, @due_date, @notes, @created_by, @created_by_name)
    `),
    updateStatus: e.prepare(`
      UPDATE receivables
      SET status=@status, amount_paid=@amount_paid,
          updated_at=strftime('%Y-%m-%d %H:%M:%S','now','localtime')
      WHERE id=@id
    `),
    cancel: e.prepare(`
      UPDATE receivables
      SET status='cancelled', updated_at=strftime('%Y-%m-%d %H:%M:%S','now','localtime')
      WHERE id=?
    `),
    // payments
    findPayments: e.prepare("SELECT * FROM receivable_payments WHERE receivable_id = ? ORDER BY created_at"),
    insertPayment: e.prepare(`
      INSERT INTO receivable_payments
        (receivable_id, amount, payment_method, notes, created_by, created_by_name)
      VALUES
        (@receivable_id, @amount, @payment_method, @notes, @created_by, @created_by_name)
    `),
    // pagos de hoy
    paymentsToday: e.prepare(`
      SELECT
        COALESCE(SUM(amount), 0)  AS total,
        COUNT(*)                  AS count
      FROM receivable_payments
      WHERE DATE(created_at) = DATE('now', 'localtime')
    `),
    // pagos en un rango de fechas
    paymentsForRange: e.prepare(`
      SELECT
        COALESCE(SUM(amount), 0)  AS total,
        COUNT(*)                  AS count
      FROM receivable_payments
      WHERE DATE(created_at) >= @from
        AND DATE(created_at) <= @to
    `),
    // summary
    summary: e.prepare(`
      SELECT
        COUNT(*)                                         AS total_count,
        COALESCE(SUM(amount),0)                          AS total_amount,
        COALESCE(SUM(amount_paid),0)                     AS total_paid,
        COALESCE(SUM(amount - amount_paid),0)            AS total_balance,
        COALESCE(SUM(CASE WHEN status='pending'  THEN amount - amount_paid ELSE 0 END),0) AS pending_balance,
        COALESCE(SUM(CASE WHEN status='partial'  THEN amount - amount_paid ELSE 0 END),0) AS partial_balance,
        COALESCE(SUM(CASE WHEN due_date < strftime('%Y-%m-%d','now') AND status IN ('pending','partial') THEN amount - amount_paid ELSE 0 END),0) AS overdue_balance
      FROM receivables WHERE status NOT IN ('cancelled','paid')
    `)
  }, t = e.transaction((a, r) => {
    n.insertPayment.run(r);
    const s = n.findById.get(a), o = (s.amount_paid ?? 0) + r.amount, c = o >= s.amount ? "paid" : "partial";
    return n.updateStatus.run({ id: a, amount_paid: o, status: c }), n.findById.get(a);
  });
  return {
    findAll() {
      return n.findAll.all();
    },
    findById(a) {
      return n.findById.get(a) ?? null;
    },
    findByCustomer(a) {
      return n.findByCustomer.all(a);
    },
    create(a) {
      return Number(n.insert.run(a).lastInsertRowid);
    },
    cancel(a) {
      n.cancel.run(a);
    },
    findPayments(a) {
      return n.findPayments.all(a);
    },
    applyPayment: t,
    getSummary() {
      return n.summary.get();
    },
    getPaymentsToday() {
      return n.paymentsToday.get();
    },
    /** @param {{ from: string, to: string }} range */
    getPaymentsForRange({ from: a, to: r }) {
      return n.paymentsForRange.get({ from: a, to: r });
    }
  };
}
function fn(e) {
  return {
    list() {
      return e.findAll();
    },
    getDetail(n) {
      const t = e.findById(n);
      if (!t) throw Object.assign(new Error("Cuenta no encontrada"), { code: "RECV_NOT_FOUND" });
      const a = e.findPayments(n);
      return { receivable: t, payments: a };
    },
    getSummary() {
      return e.getSummary();
    },
    getPaymentsToday() {
      return e.getPaymentsToday();
    },
    /** @param {{ from: string, to: string }} range */
    getPaymentsForRange({ from: n, to: t }) {
      return e.getPaymentsForRange({ from: n, to: t });
    },
    /**
     * @param {{ customerId?: number, customerName: string, customerNit?: string, description: string, amount: number, dueDate?: string, notes?: string, userId: number, userName: string }} input
     */
    create(n) {
      var s, o, c, i;
      const t = (s = n.description) == null ? void 0 : s.trim();
      if (!t) throw Object.assign(new Error("Descripción requerida"), { code: "RECV_MISSING_DESC" });
      if (!((o = n.customerName) != null && o.trim())) throw Object.assign(new Error("Nombre del cliente requerido"), { code: "RECV_MISSING_CUSTOMER" });
      const a = Number(n.amount);
      if (isNaN(a) || a <= 0) throw Object.assign(new Error("Monto debe ser mayor a 0"), { code: "RECV_INVALID_AMOUNT" });
      const r = e.create({
        customer_id: n.customerId ?? null,
        customer_name: n.customerName.trim(),
        customer_nit: ((c = n.customerNit) == null ? void 0 : c.trim()) || null,
        description: t,
        amount: a,
        due_date: n.dueDate || null,
        notes: ((i = n.notes) == null ? void 0 : i.trim()) || null,
        created_by: n.userId,
        created_by_name: n.userName
      });
      return e.findById(r);
    },
    /**
     * @param {{ receivableId: number, amount: number, paymentMethod?: string, notes?: string, userId: number, userName: string }} input
     */
    applyPayment(n) {
      var s;
      const t = e.findById(n.receivableId);
      if (!t) throw Object.assign(new Error("Cuenta no encontrada"), { code: "RECV_NOT_FOUND" });
      if (["paid", "cancelled"].includes(t.status))
        throw Object.assign(new Error("Esta cuenta ya está cerrada"), { code: "RECV_CLOSED" });
      const a = Number(n.amount);
      if (isNaN(a) || a <= 0) throw Object.assign(new Error("Monto de pago inválido"), { code: "RECV_INVALID_PAYMENT" });
      const r = t.amount - t.amount_paid;
      if (a > r + 1e-3)
        throw Object.assign(new Error(`El pago (${a}) supera el saldo (${r.toFixed(2)})`), { code: "RECV_OVERPAYMENT" });
      return e.applyPayment(n.receivableId, {
        receivable_id: n.receivableId,
        amount: a,
        payment_method: n.paymentMethod || "cash",
        notes: ((s = n.notes) == null ? void 0 : s.trim()) || null,
        created_by: n.userId,
        created_by_name: n.userName
      });
    },
    cancel(n) {
      const t = e.findById(n);
      if (!t) throw Object.assign(new Error("Cuenta no encontrada"), { code: "RECV_NOT_FOUND" });
      if (t.status === "paid") throw Object.assign(new Error("No se puede cancelar una cuenta ya pagada"), { code: "RECV_CLOSED" });
      return e.cancel(n), e.findById(n);
    },
    byCustomer(n) {
      if (!Number.isInteger(n) || n <= 0)
        throw Object.assign(new Error("customer_id inválido"), { code: "RECV_INVALID_CUSTOMER" });
      const a = e.findByCustomer(n).filter((s) => ["pending", "partial"].includes(s.status)), r = a.reduce((s, o) => s + (o.amount - o.amount_paid), 0);
      return { rows: a, balance: r };
    }
  };
}
const { ipcMain: Sn } = N;
function Rn(e) {
  function n(t, a) {
    Sn.handle(t, async (r, ...s) => {
      try {
        return { ok: !0, data: await a(...s) };
      } catch (o) {
        return { ok: !1, error: { code: o.code ?? "RECV_ERROR", message: o.message } };
      }
    });
  }
  n("receivables:list", () => e.list()), n("receivables:get", (t) => e.getDetail(t)), n("receivables:summary", () => e.getSummary()), n("receivables:payments-today", () => e.getPaymentsToday()), n("receivables:payments-range", (t) => e.getPaymentsForRange(t)), n("receivables:create", (t) => e.create(t)), n("receivables:apply-payment", (t) => e.applyPayment(t)), n("receivables:cancel", (t) => e.cancel(t)), n("receivables:by-customer", (t) => e.byCustomer(t));
}
function On(e) {
  const n = {
    findAll: e.prepare(`
      SELECT * FROM quotes
      ORDER BY CASE status WHEN 'draft' THEN 0 WHEN 'sent' THEN 1 WHEN 'accepted' THEN 2 ELSE 3 END,
               created_at DESC
    `),
    findById: e.prepare("SELECT * FROM quotes WHERE id = ?"),
    findItems: e.prepare("SELECT * FROM quote_items WHERE quote_id = ? ORDER BY id"),
    insert: e.prepare(`
      INSERT INTO quotes (customer_id, customer_name, customer_nit, customer_phone, customer_address,
                          notes, valid_until, subtotal, tax_rate, tax_amount, total, created_by, created_by_name)
      VALUES (@customer_id, @customer_name, @customer_nit, @customer_phone, @customer_address,
              @notes, @valid_until, @subtotal, @tax_rate, @tax_amount, @total, @created_by, @created_by_name)
    `),
    insertItem: e.prepare(`
      INSERT INTO quote_items (quote_id, product_id, product_name, product_code, qty, unit_price, subtotal)
      VALUES (@quote_id, @product_id, @product_name, @product_code, @qty, @unit_price, @subtotal)
    `),
    deleteItems: e.prepare("DELETE FROM quote_items WHERE quote_id = ?"),
    updateStatus: e.prepare(`
      UPDATE quotes SET status=@status, updated_at=strftime('%Y-%m-%d %H:%M:%S','now','localtime')
      WHERE id=@id
    `),
    markConverted: e.prepare(`
      UPDATE quotes SET status='converted', sale_id=@sale_id,
        updated_at=strftime('%Y-%m-%d %H:%M:%S','now','localtime')
      WHERE id=@id
    `),
    update: e.prepare(`
      UPDATE quotes
      SET customer_id=@customer_id, customer_name=@customer_name, customer_nit=@customer_nit,
          customer_phone=@customer_phone, customer_address=@customer_address,
          notes=@notes, valid_until=@valid_until,
          subtotal=@subtotal, tax_rate=@tax_rate, tax_amount=@tax_amount, total=@total,
          updated_at=strftime('%Y-%m-%d %H:%M:%S','now','localtime')
      WHERE id=@id
    `)
  }, t = e.transaction((r, s) => {
    const o = Number(n.insert.run(r).lastInsertRowid);
    for (const c of s) n.insertItem.run({ ...c, quote_id: o });
    return o;
  }), a = e.transaction((r, s, o) => {
    n.update.run({ ...s, id: r }), n.deleteItems.run(r);
    for (const c of o) n.insertItem.run({ ...c, quote_id: r });
  });
  return {
    findAll() {
      return n.findAll.all();
    },
    findById(r) {
      return n.findById.get(r) ?? null;
    },
    findItems(r) {
      return n.findItems.all(r);
    },
    createQuote: t,
    updateQuote: a,
    updateStatus(r, s) {
      n.updateStatus.run({ id: r, status: s });
    },
    markConverted(r, s) {
      n.markConverted.run({ id: r, sale_id: s });
    }
  };
}
function In(e, n, t, a, r) {
  function s(i) {
    const d = (
      /** @type {number} */
      n.get("tax_rate") ?? 0
    ), u = (
      /** @type {boolean} */
      n.get("tax_enabled") ?? !1
    ), E = i.reduce((_, T) => _ + T.qty * T.unit_price, 0), m = u ? Math.round(E * d * 100) / 100 : 0;
    return { subtotal: E, tax_rate: d, tax_amount: m, total: E + m };
  }
  function o(i) {
    var d;
    if (!(i != null && i.length)) throw Object.assign(new Error("Agrega al menos un producto"), { code: "QUOTE_EMPTY" });
    for (const u of i) {
      if (!((d = u.productName) != null && d.trim())) throw Object.assign(new Error("Nombre de producto requerido"), { code: "QUOTE_ITEM_NAME" });
      if (u.qty <= 0) throw Object.assign(new Error("Cantidad debe ser mayor a 0"), { code: "QUOTE_ITEM_QTY" });
      if (u.unitPrice < 0) throw Object.assign(new Error("Precio no puede ser negativo"), { code: "QUOTE_ITEM_PRICE" });
    }
  }
  function c(i) {
    return i.map((d) => {
      var u;
      return {
        product_id: d.productId ?? null,
        product_name: d.productName.trim(),
        product_code: ((u = d.productCode) == null ? void 0 : u.trim()) || null,
        qty: d.qty,
        unit_price: d.unitPrice,
        subtotal: d.qty * d.unitPrice
      };
    });
  }
  return {
    list() {
      return e.findAll();
    },
    getDetail(i) {
      const d = e.findById(i);
      if (!d) throw Object.assign(new Error("Cotización no encontrada"), { code: "QUOTE_NOT_FOUND" });
      return { quote: d, items: e.findItems(i) };
    },
    /**
     * @param {{ customerId?: number, customerName: string, customerNit?: string, customerPhone?: string, customerAddress?: string, notes?: string, validUntil?: string, items: any[], userId: number, userName: string }} input
     */
    create(i) {
      var p, f, O, L, g;
      if (!((p = i.customerName) != null && p.trim())) throw Object.assign(new Error("Nombre del cliente requerido"), { code: "QUOTE_MISSING_CUSTOMER" });
      o(i.items);
      const d = c(i.items), { subtotal: u, tax_rate: E, tax_amount: m, total: _ } = s(d), T = e.createQuote({
        customer_id: i.customerId ?? null,
        customer_name: i.customerName.trim(),
        customer_nit: ((f = i.customerNit) == null ? void 0 : f.trim()) || null,
        customer_phone: ((O = i.customerPhone) == null ? void 0 : O.trim()) || null,
        customer_address: ((L = i.customerAddress) == null ? void 0 : L.trim()) || null,
        notes: ((g = i.notes) == null ? void 0 : g.trim()) || null,
        valid_until: i.validUntil || null,
        subtotal: u,
        tax_rate: E,
        tax_amount: m,
        total: _,
        created_by: i.userId,
        created_by_name: i.userName
      }, d);
      return e.findById(T);
    },
    /**
     * @param {number} id
     * @param {{ customerId?: number, customerName: string, customerNit?: string, customerPhone?: string, customerAddress?: string, notes?: string, validUntil?: string, items: any[] }} input
     */
    update(i, d) {
      var f, O, L, g;
      const u = e.findById(i);
      if (!u) throw Object.assign(new Error("Cotización no encontrada"), { code: "QUOTE_NOT_FOUND" });
      if (!["draft", "sent"].includes(u.status))
        throw Object.assign(new Error("Solo se pueden editar cotizaciones en borrador o enviadas"), { code: "QUOTE_NOT_EDITABLE" });
      o(d.items);
      const E = c(d.items), { subtotal: m, tax_rate: _, tax_amount: T, total: p } = s(E);
      return e.updateQuote(i, {
        customer_id: d.customerId ?? u.customer_id,
        customer_name: (d.customerName ?? u.customer_name).trim(),
        customer_nit: ((f = d.customerNit) == null ? void 0 : f.trim()) || u.customer_nit || null,
        customer_phone: ((O = d.customerPhone) == null ? void 0 : O.trim()) || u.customer_phone || null,
        customer_address: ((L = d.customerAddress) == null ? void 0 : L.trim()) || u.customer_address || null,
        notes: ((g = d.notes) == null ? void 0 : g.trim()) || null,
        valid_until: d.validUntil || null,
        subtotal: m,
        tax_rate: _,
        tax_amount: T,
        total: p
      }, E), e.findById(i);
    },
    markSent(i) {
      const d = e.findById(i);
      if (!d) throw Object.assign(new Error("Cotización no encontrada"), { code: "QUOTE_NOT_FOUND" });
      if (d.status !== "draft") throw Object.assign(new Error("Solo se pueden enviar cotizaciones en borrador"), { code: "QUOTE_INVALID_STATUS" });
      return e.updateStatus(i, "sent"), e.findById(i);
    },
    accept(i) {
      const d = e.findById(i);
      if (!d) throw Object.assign(new Error("Cotización no encontrada"), { code: "QUOTE_NOT_FOUND" });
      if (!["draft", "sent"].includes(d.status)) throw Object.assign(new Error("Estado inválido para aceptar"), { code: "QUOTE_INVALID_STATUS" });
      return e.updateStatus(i, "accepted"), e.findById(i);
    },
    reject(i) {
      const d = e.findById(i);
      if (!d) throw Object.assign(new Error("Cotización no encontrada"), { code: "QUOTE_NOT_FOUND" });
      if (["converted", "cancelled"].includes(d.status)) throw Object.assign(new Error("No se puede rechazar esta cotización"), { code: "QUOTE_INVALID_STATUS" });
      return e.updateStatus(i, "rejected"), e.findById(i);
    },
    /**
     * Convierte la cotización aceptada en una venta real.
     * @param {{ id: number, userId: number, userName: string }} input
     */
    convertToSale(i) {
      const d = e.findById(i.id);
      if (!d) throw Object.assign(new Error("Cotización no encontrada"), { code: "QUOTE_NOT_FOUND" });
      if (!["accepted", "sent", "draft"].includes(d.status))
        throw Object.assign(new Error("Solo se pueden convertir cotizaciones activas"), { code: "QUOTE_INVALID_STATUS" });
      const u = e.findItems(i.id);
      if (!u.length) throw Object.assign(new Error("La cotización no tiene productos"), { code: "QUOTE_EMPTY" });
      const E = u.filter((_) => _.product_id != null);
      if (!E.length)
        throw Object.assign(new Error("Para convertir a venta todos los items deben tener un producto del sistema"), { code: "QUOTE_NO_PRODUCTS" });
      const m = t.create({
        items: E.map((_) => ({
          id: _.product_id,
          qty: _.qty,
          price: _.unit_price
        })),
        customerId: d.customer_id ?? void 0
      });
      return e.markConverted(i.id, m.saleId), { quote: e.findById(i.id), sale: m };
    },
    /**
     * Crea una cuenta por cobrar desde una cotización aceptada.
     * Descuenta stock para los ítems con product_id vinculado.
     * @param {{ id: number, dueDate?: string, notes?: string, userId: number, userName: string }} input
     */
    convertToReceivable(i) {
      const d = e.findById(i.id);
      if (!d) throw Object.assign(new Error("Cotización no encontrada"), { code: "QUOTE_NOT_FOUND" });
      if (!["accepted", "sent", "draft"].includes(d.status))
        throw Object.assign(new Error("Solo se pueden convertir cotizaciones activas"), { code: "QUOTE_INVALID_STATUS" });
      const u = e.findItems(i.id);
      for (const m of u)
        if (m.product_id && m.qty > 0)
          try {
            r.adjustStock(m.product_id, "exit", m.qty);
          } catch {
            console.warn(`[quotes] no se pudo descontar stock del producto ${m.product_id}`);
          }
      const E = a.create({
        customerId: d.customer_id ?? void 0,
        customerName: d.customer_name,
        customerNit: d.customer_nit ?? void 0,
        description: `Cotización #${d.id}${d.notes ? ` · ${d.notes}` : ""}`,
        amount: d.total,
        dueDate: i.dueDate || void 0,
        notes: i.notes || void 0,
        userId: i.userId,
        userName: i.userName
      });
      return e.updateStatus(i.id, "converted"), { quote: e.findById(i.id), receivable: E };
    }
  };
}
const { ipcMain: yn } = N;
function An(e) {
  function n(t, a) {
    yn.handle(t, async (r, ...s) => {
      try {
        return { ok: !0, data: await a(...s) };
      } catch (o) {
        return { ok: !1, error: { code: o.code ?? "QUOTE_ERROR", message: o.message } };
      }
    });
  }
  n("quotes:list", () => e.list()), n("quotes:get", (t) => e.getDetail(t)), n("quotes:create", (t) => e.create(t)), n("quotes:update", (t, a) => e.update(t, a)), n("quotes:mark-sent", (t) => e.markSent(t)), n("quotes:accept", (t) => e.accept(t)), n("quotes:reject", (t) => e.reject(t)), n("quotes:convert", (t) => e.convertToSale(t)), n("quotes:convert-receivable", (t) => e.convertToReceivable(t));
}
function Ln(e) {
  const n = {
    findAll: e.prepare(`
      SELECT * FROM expenses ORDER BY expense_date DESC, created_at DESC
    `),
    findByRange: e.prepare(`
      SELECT * FROM expenses
      WHERE expense_date >= @from AND expense_date <= @to
      ORDER BY expense_date DESC, created_at DESC
    `),
    findById: e.prepare("SELECT * FROM expenses WHERE id = ?"),
    insert: e.prepare(`
      INSERT INTO expenses
        (category, description, amount, payment_method, expense_date, notes, created_by, created_by_name)
      VALUES
        (@category, @description, @amount, @payment_method, @expense_date, @notes, @created_by, @created_by_name)
    `),
    update: e.prepare(`
      UPDATE expenses
      SET category=@category, description=@description, amount=@amount,
          payment_method=@payment_method, expense_date=@expense_date, notes=@notes
      WHERE id=@id
    `),
    remove: e.prepare("DELETE FROM expenses WHERE id = ?"),
    summary: e.prepare(`
      SELECT
        COALESCE(SUM(amount),0)                                             AS total,
        COALESCE(SUM(CASE WHEN expense_date = strftime('%Y-%m-%d','now','localtime') THEN amount ELSE 0 END),0) AS today,
        COUNT(*)                                                            AS count
      FROM expenses
      WHERE expense_date >= @from AND expense_date <= @to
    `),
    byCategory: e.prepare(`
      SELECT category, COALESCE(SUM(amount),0) AS total, COUNT(*) AS count
      FROM expenses
      WHERE expense_date >= @from AND expense_date <= @to
      GROUP BY category ORDER BY total DESC
    `)
  };
  return {
    findAll() {
      return n.findAll.all();
    },
    findByRange(t, a) {
      return n.findByRange.all({ from: t, to: a });
    },
    findById(t) {
      return n.findById.get(t) ?? null;
    },
    create(t) {
      return Number(n.insert.run(t).lastInsertRowid);
    },
    update(t, a) {
      n.update.run({ ...a, id: t });
    },
    remove(t) {
      n.remove.run(t);
    },
    getSummary(t, a) {
      return n.summary.get({ from: t, to: a });
    },
    getByCategory(t, a) {
      return n.byCategory.all({ from: t, to: a });
    }
  };
}
const ce = [
  "renta",
  "servicios",
  "sueldos",
  "insumos",
  "transporte",
  "mantenimiento",
  "publicidad",
  "impuestos",
  "otros"
], Ie = ["cash", "transfer", "card", "check"];
function gn(e) {
  function n(a) {
    var r;
    if (!((r = a.description) != null && r.trim()))
      throw Object.assign(new Error("La descripción es requerida"), { code: "EXP_INVALID" });
    if (!Number.isFinite(a.amount) || a.amount <= 0)
      throw Object.assign(new Error("El monto debe ser mayor a 0"), { code: "EXP_INVALID" });
  }
  function t() {
    return (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
  }
  return {
    list(a = {}) {
      return a.from && a.to ? e.findByRange(a.from, a.to) : e.findAll();
    },
    getById(a) {
      const r = e.findById(a);
      if (!r) throw Object.assign(new Error(`Gasto ${a} no encontrado`), { code: "EXP_NOT_FOUND" });
      return r;
    },
    create(a) {
      var s;
      n(a);
      const r = e.create({
        category: ce.includes(a.category) ? a.category : "otros",
        description: a.description.trim(),
        amount: a.amount,
        payment_method: Ie.includes(a.payment_method) ? a.payment_method : "cash",
        expense_date: a.expense_date || t(),
        notes: ((s = a.notes) == null ? void 0 : s.trim()) || null,
        created_by: a.created_by ?? null,
        created_by_name: a.created_by_name ?? null
      });
      return e.findById(r);
    },
    update(a, r) {
      var o;
      n(r);
      const s = e.findById(a);
      if (!s) throw Object.assign(new Error(`Gasto ${a} no encontrado`), { code: "EXP_NOT_FOUND" });
      return e.update(a, {
        category: ce.includes(r.category) ? r.category : "otros",
        description: r.description.trim(),
        amount: r.amount,
        payment_method: Ie.includes(r.payment_method) ? r.payment_method : "cash",
        expense_date: r.expense_date || s.expense_date,
        notes: ((o = r.notes) == null ? void 0 : o.trim()) || null
      }), e.findById(a);
    },
    remove(a) {
      if (!e.findById(a)) throw Object.assign(new Error(`Gasto ${a} no encontrado`), { code: "EXP_NOT_FOUND" });
      return e.remove(a), !0;
    },
    summary(a, r) {
      const s = a || t(), o = r || t();
      return {
        ...e.getSummary(s, o),
        byCategory: e.getByCategory(s, o)
      };
    },
    categories: () => ce
  };
}
const { ipcMain: hn } = N;
function bn(e) {
  function n(t, a) {
    hn.handle(t, async (r, ...s) => {
      try {
        return { ok: !0, data: await a(...s) };
      } catch (o) {
        return { ok: !1, error: { code: o.code ?? "EXP_ERROR", message: o.message } };
      }
    });
  }
  n("expenses:list", (t) => e.list(t)), n("expenses:get", (t) => e.getById(t)), n("expenses:create", (t) => e.create(t)), n("expenses:update", (t, a) => e.update(t, a)), n("expenses:remove", (t) => e.remove(t)), n("expenses:summary", (t, a) => e.summary(t, a)), n("expenses:categories", () => e.categories());
}
function Un(e) {
  const n = {
    findAll: e.prepare("SELECT * FROM returns ORDER BY created_at DESC"),
    findBySale: e.prepare("SELECT * FROM returns WHERE sale_id = ? ORDER BY created_at DESC"),
    findById: e.prepare("SELECT * FROM returns WHERE id = ?"),
    findItems: e.prepare("SELECT * FROM return_items WHERE return_id = ?"),
    insertReturn: e.prepare(`
      INSERT INTO returns (sale_id, reason, notes, total_refund, created_by, created_by_name)
      VALUES (@sale_id, @reason, @notes, @total_refund, @created_by, @created_by_name)
    `),
    insertItem: e.prepare(`
      INSERT INTO return_items (return_id, sale_item_id, product_id, product_name, qty_returned, unit_price, subtotal)
      VALUES (@return_id, @sale_item_id, @product_id, @product_name, @qty_returned, @unit_price, @subtotal)
    `),
    restoreStock: e.prepare("UPDATE products SET stock = stock + ? WHERE id = ?")
  }, t = e.transaction((a, r) => {
    const s = Number(n.insertReturn.run(a).lastInsertRowid);
    for (const o of r)
      n.insertItem.run({ ...o, return_id: s }), n.restoreStock.run(o.qty_returned, o.product_id);
    return s;
  });
  return {
    findAll() {
      return n.findAll.all();
    },
    findBySale(a) {
      return n.findBySale.all(a);
    },
    findById(a) {
      return n.findById.get(a) ?? null;
    },
    findItems(a) {
      return n.findItems.all(a);
    },
    createReturn: t
  };
}
function Cn(e, n) {
  return {
    list() {
      return e.findAll();
    },
    listBySale(t) {
      return e.findBySale(t).map((r) => ({ ...r, items: e.findItems(r.id) }));
    },
    getById(t) {
      const a = e.findById(t);
      if (!a) throw Object.assign(new Error(`Devolución ${t} no encontrada`), { code: "RET_NOT_FOUND" });
      return { ...a, items: e.findItems(t) };
    },
    /**
     * @param {{
     *   saleId: number,
     *   reason: string,
     *   notes?: string,
     *   items: Array<{ saleItemId: number, productId: number, productName: string, qtyReturned: number, unitPrice: number }>,
     *   createdBy?: number,
     *   createdByName?: string,
     * }} input
     */
    create(t) {
      var c, i;
      if (!((c = t.reason) != null && c.trim()) || t.reason.trim().length < 3)
        throw Object.assign(new Error("El motivo debe tener al menos 3 caracteres"), { code: "RET_INVALID" });
      if (!Array.isArray(t.items) || t.items.length === 0)
        throw Object.assign(new Error("Selecciona al menos un producto a devolver"), { code: "RET_INVALID" });
      for (const d of t.items)
        if (!d.qtyReturned || d.qtyReturned <= 0)
          throw Object.assign(new Error(`Cantidad inválida para ${d.productName}`), { code: "RET_INVALID" });
      const a = n.findSaleById(t.saleId);
      if (!a) throw Object.assign(new Error(`Venta ${t.saleId} no encontrada`), { code: "RET_INVALID" });
      if (a.status === "voided") throw Object.assign(new Error("No se puede devolver una venta anulada"), { code: "RET_INVALID" });
      const r = t.items.map((d) => ({
        sale_item_id: d.saleItemId,
        product_id: d.productId,
        product_name: d.productName,
        qty_returned: d.qtyReturned,
        unit_price: d.unitPrice,
        subtotal: Math.round(d.qtyReturned * d.unitPrice * 100) / 100
      })), s = r.reduce((d, u) => d + u.subtotal, 0), o = e.createReturn({
        sale_id: t.saleId,
        reason: t.reason.trim(),
        notes: ((i = t.notes) == null ? void 0 : i.trim()) || null,
        total_refund: Math.round(s * 100) / 100,
        created_by: t.createdBy ?? null,
        created_by_name: t.createdByName ?? null
      }, r);
      return e.findById(o);
    }
  };
}
const { ipcMain: vn } = N;
function Dn(e) {
  function n(t, a) {
    vn.handle(t, async (r, ...s) => {
      try {
        return { ok: !0, data: await a(...s) };
      } catch (o) {
        return { ok: !1, error: { code: o.code ?? "RET_ERROR", message: o.message } };
      }
    });
  }
  n("returns:list", () => e.list()), n("returns:list-by-sale", (t) => e.listBySale(t)), n("returns:get", (t) => e.getById(t)), n("returns:create", (t) => e.create(t));
}
function wn(e) {
  const n = {
    findMovements: e.prepare(`
      SELECT * FROM stock_movements
      WHERE (@product_id IS NULL OR product_id = @product_id)
      ORDER BY created_at DESC
      LIMIT @limit OFFSET @offset
    `),
    countMovements: e.prepare(`
      SELECT COUNT(*) AS total FROM stock_movements
      WHERE (@product_id IS NULL OR product_id = @product_id)
    `),
    insertMovement: e.prepare(`
      INSERT INTO stock_movements
        (product_id, product_name, type, qty, qty_before, qty_after, reference_type, reference_id, notes, created_by, created_by_name)
      VALUES
        (@product_id, @product_name, @type, @qty, @qty_before, @qty_after, @reference_type, @reference_id, @notes, @created_by, @created_by_name)
    `),
    getProductStock: e.prepare("SELECT id, code, name, stock, min_stock, category, is_active FROM products WHERE is_active = 1 ORDER BY name ASC"),
    getProductById: e.prepare("SELECT id, code, name, stock FROM products WHERE id = ?"),
    adjustStock: e.prepare("UPDATE products SET stock = stock + ? WHERE id = ?")
  }, t = e.transaction((a, r, s) => {
    const o = n.getProductById.get(a);
    if (!o) throw Object.assign(new Error(`Producto ${a} no encontrado`), { code: "INV_NOT_FOUND" });
    const c = o.stock;
    n.adjustStock.run(r, a);
    const i = c + r;
    return n.insertMovement.run({
      ...s,
      product_id: a,
      product_name: o.name,
      qty: Math.abs(r),
      qty_before: c,
      qty_after: i
    }), { qtyBefore: c, qtyAfter: i, productName: o.name };
  });
  return {
    getStock() {
      return n.getProductStock.all();
    },
    findMovements({ productId: a = null, limit: r = 50, offset: s = 0 } = {}) {
      return n.findMovements.all({ product_id: a, limit: r, offset: s });
    },
    countMovements(a = null) {
      return n.countMovements.get({ product_id: a }).total;
    },
    logAdjustment: t
  };
}
function Mn(e) {
  return {
    getStock() {
      return e.getStock();
    },
    getMovements({ productId: n, page: t = 1, pageSize: a = 50 } = {}) {
      const r = Math.min(a, 200), s = (t - 1) * r;
      return {
        data: e.findMovements({ productId: n, limit: r, offset: s }),
        total: e.countMovements(n ?? null),
        page: t,
        pageSize: r
      };
    },
    /**
     * Ajuste manual de stock con registro en kardex.
     * @param {{ productId: number, type: 'in'|'out'|'adjustment', qty: number, notes?: string, createdBy?: number, createdByName?: string }} input
     */
    adjust(n) {
      const { productId: t, type: a, qty: r, notes: s, createdBy: o, createdByName: c } = n;
      if (!Number.isInteger(t) || t <= 0)
        throw Object.assign(new Error("Producto inválido"), { code: "INV_INVALID" });
      if (!["in", "out", "adjustment"].includes(a))
        throw Object.assign(new Error("Tipo de movimiento inválido"), { code: "INV_INVALID" });
      if (!Number.isFinite(r) || r <= 0)
        throw Object.assign(new Error("La cantidad debe ser mayor a 0"), { code: "INV_INVALID" });
      const i = a === "out" ? -r : r;
      return e.logAdjustment(t, i, {
        type: a,
        reference_type: "manual",
        reference_id: null,
        notes: (s == null ? void 0 : s.trim()) || null,
        created_by: o ?? null,
        created_by_name: c ?? null
      });
    }
  };
}
const { ipcMain: Fn } = N;
function Bn(e) {
  function n(t, a) {
    Fn.handle(t, async (r, ...s) => {
      try {
        return { ok: !0, data: await a(...s) };
      } catch (o) {
        return { ok: !1, error: { code: o.code ?? "INV_ERROR", message: o.message } };
      }
    });
  }
  n("inventory:stock", () => e.getStock()), n("inventory:movements", (t) => e.getMovements(t)), n("inventory:adjust", (t) => e.adjust(t));
}
function qn(e) {
  const n = {
    findToken: e.prepare(
      "SELECT id FROM license_tokens WHERE token_hash = ? AND used = 0"
    ),
    burnToken: e.prepare(
      `UPDATE license_tokens
          SET used = 1, used_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
        WHERE id = ?`
    )
  };
  return {
    findValidToken(t) {
      return n.findToken.get(t) ?? null;
    },
    burnToken(t) {
      n.burnToken.run(t);
    }
  };
}
function Pn(e, n) {
  return {
    isActivated() {
      return n.get("is_activated") === !0;
    },
    activate(t) {
      if (!(t != null && t.trim()))
        throw Object.assign(new Error("Token requerido"), { code: "LICENSE_EMPTY" });
      const a = Le.createHash("sha256").update(t.trim()).digest("hex"), r = e.findValidToken(a);
      if (!r)
        throw Object.assign(
          new Error("Token inválido o ya utilizado"),
          { code: "LICENSE_INVALID" }
        );
      return e.burnToken(r.id), n.set("is_activated", !0), { activated: !0 };
    }
  };
}
function kn(e, n) {
  e.handle("license:status", l(() => ({ activated: n.isActivated() }))), e.handle("license:activate", l((t, a) => n.activate(a)));
}
function Hn(e) {
  try {
    const a = X().prepare(`
      SELECT MAX(updated_at) as last_update FROM ${e}
    `).get();
    return (a == null ? void 0 : a.last_update) || null;
  } catch {
    return null;
  }
}
function be(e) {
  try {
    const a = X().prepare(`SELECT MAX(id) as max_id FROM ${e}`).get();
    return (a == null ? void 0 : a.max_id) || null;
  } catch {
    return null;
  }
}
function Ue(e, n = null) {
  try {
    const t = X();
    let a = `SELECT * FROM ${e}`;
    return n ? (a += " WHERE updated_at > ? ORDER BY updated_at ASC", t.prepare(a).all(n)) : t.prepare(a + " ORDER BY id ASC LIMIT 5000").all();
  } catch {
    return [];
  }
}
function xn(e, n = []) {
  if (!Array.isArray(n) || n.length === 0)
    return { inserted: 0, updated: 0, skipped: 0 };
  const t = X(), a = { inserted: 0, updated: 0, skipped: 0 };
  return n.forEach((r) => {
    if (!r.id) {
      a.skipped++;
      return;
    }
    try {
      const s = t.prepare(
        `SELECT * FROM ${e} WHERE id = ?`
      ).get(r.id);
      if (!s) {
        const d = Object.keys(r), u = d.map(() => "?").join(","), E = d.map((m) => r[m]);
        t.prepare(
          `INSERT INTO ${e} (${d.join(",")}) VALUES (${u})`
        ).run(...E), a.inserted++;
        return;
      }
      const o = new Date(s.updated_at || 0).getTime(), c = new Date(r.updated_at || 0).getTime();
      if (r.id > s.id || r.id === s.id && c > o) {
        const d = Object.keys(r).filter((m) => m !== "id"), u = d.map((m) => `${m} = ?`), E = d.map((m) => r[m]);
        t.prepare(
          `UPDATE ${e} SET ${u.join(", ")} WHERE id = ?`
        ).run(...E, r.id), a.updated++;
      } else
        a.skipped++;
    } catch (s) {
      console.error(`Error merging record id=${r.id} in ${e}:`, s), a.skipped++;
    }
  }), a;
}
function Xn(e) {
  try {
    return X().prepare(`SELECT * FROM ${e} ORDER BY id ASC LIMIT 5000`).all();
  } catch {
    return [];
  }
}
const j = [
  "products",
  "categories",
  "customers",
  "suppliers",
  "users",
  "sales",
  "sale_items",
  "purchases",
  "purchase_orders",
  "purchase_items",
  "receivables",
  "quotes",
  "quote_items",
  "expenses",
  "stock_movements",
  "cash_sessions",
  "cash_movements",
  "audit_log",
  "settings"
];
function jn() {
  const e = {};
  return j.forEach((n) => {
    try {
      e[n] = {
        maxId: be(n),
        lastUpdate: Hn(n)
      };
    } catch (t) {
      e[n] = { maxId: null, lastUpdate: null, error: t.message };
    }
  }), e;
}
function Yn(e, n = null) {
  if (!j.includes(e))
    throw new Error(`Tabla no sincronizable: ${e}`);
  return Ue(e, n);
}
function Vn(e) {
  if (!e || typeof e != "object")
    return {
      ok: !1,
      error: { code: "INVALID_PAYLOAD", message: "cloudData debe ser un objeto" }
    };
  const n = {};
  return Object.entries(e).forEach(([t, a]) => {
    if (!j.includes(t)) {
      n[t] = { skipped: !0, reason: "Tabla no sincronizable" };
      return;
    }
    try {
      n[t] = xn(t, a);
    } catch (r) {
      n[t] = {
        error: r.message
      };
    }
  }), {
    ok: !0,
    data: n
  };
}
function Wn() {
  const e = {};
  return j.forEach((n) => {
    try {
      e[n] = Xn(n);
    } catch {
      e[n] = [];
    }
  }), e;
}
function Gn(e = {}) {
  const n = {};
  return j.forEach((t) => {
    const a = e[t] || null;
    try {
      n[t] = Ue(t, a);
    } catch {
      n[t] = [];
    }
  }), n;
}
function $n(e) {
  if (!j.includes(e))
    throw new Error(`Tabla no sincronizable: ${e}`);
  try {
    return (be(e) || 0) + 1;
  } catch (n) {
    return console.error(`Error obteniendo siguiente ID para ${e}:`, n), 1;
  }
}
const { ipcMain: k } = N;
function Kn() {
  k.handle("cloud:metadata", l(() => jn())), k.handle("cloud:changes", l((e, n, t) => Yn(n, t))), k.handle("cloud:apply-pull", l((e, n) => Vn(n))), k.handle("cloud:build-payload", l(() => Wn())), k.handle("cloud:incremental-changes", l((e, n) => Gn(n))), k.handle("cloud:get-next-id", l((e, n) => $n(n)));
}
const { app: Ce } = N;
let ne = null, le = null, Ee = 10;
function ve() {
  return P.join(Ce.getPath("userData"), "backups");
}
function De() {
  const e = ve();
  return U.existsSync(e) || U.mkdirSync(e, { recursive: !0 }), e;
}
function we() {
  return (/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-").slice(0, 19);
}
function zn(e) {
  const n = U.readdirSync(e).filter((t) => t.startsWith("backup_") && t.endsWith(".sqlite")).sort();
  for (; n.length > Ee; )
    try {
      U.unlinkSync(P.join(e, n.shift()));
    } catch {
    }
}
async function ue(e) {
  const n = De(), t = `backup_${we()}.sqlite`, a = P.join(n, t);
  await e.backup(a), zn(n);
  const r = U.statSync(a).size;
  return console.log(`[backup] OK → ${t} (${(r / 1024).toFixed(1)} KB)`), { filename: t, path: a, size: r };
}
function Qn() {
  const e = ve();
  return U.existsSync(e) ? U.readdirSync(e).filter((n) => n.startsWith("backup_") && n.endsWith(".sqlite")).sort().reverse().map((n) => {
    const t = P.join(e, n), a = U.statSync(t);
    return {
      filename: n,
      path: t,
      size: a.size,
      createdAt: a.mtime.toISOString()
    };
  }) : [];
}
function Me(e, n = 720, t = 10) {
  le = e, Ee = t, ne && (clearInterval(ne), ne = null);
  const a = n * 36e5;
  setTimeout(() => ue(e).catch((s) => console.error("[backup] error inicial:", s)), 6e4);
  let r = Date.now();
  ne = setInterval(() => {
    Date.now() - r >= a && (r = Date.now(), ue(e).catch((s) => console.error("[backup] error periódico:", s)));
  }, 36e5), console.log(`[backup] scheduler activo — intervalo: ${n} h · máx: ${t} copias`);
}
async function Zn(e, n) {
  if (!U.existsSync(n)) throw new Error(`Archivo no encontrado: ${n}`);
  const t = De(), a = `pre-restore_${we()}.sqlite`, r = P.join(t, a);
  await e.backup(r);
  const s = P.join(Ce.getPath("userData"), "taller_pos.sqlite");
  return Ut(), U.copyFileSync(n, s), console.log(`[backup] restaurado desde ${n} → seguridad en ${a}`), { safetyBackup: a };
}
function Jn(e, n) {
  if (!le) {
    console.warn("[backup] updateBackupSchedule llamado antes de startBackupSchedule");
    return;
  }
  Me(le, e, n ?? Ee);
}
const { ipcMain: b, dialog: ye, app: z, BrowserWindow: Ae } = N, ea = /* @__PURE__ */ Object.assign({
  "../database/migrations/001_init.sql": Qe,
  "../database/migrations/002_settings.sql": Ze,
  "../database/migrations/003_sales_tax_snapshot.sql": Je,
  "../database/migrations/004_customers.sql": et,
  "../database/migrations/005_products_extended.sql": tt,
  "../database/migrations/006_users.sql": nt,
  "../database/migrations/007_settings_extended.sql": at,
  "../database/migrations/008_settings_theme.sql": rt,
  "../database/migrations/009_sales_payment.sql": st,
  "../database/migrations/010_sales_void_audit.sql": ot,
  "../database/migrations/011_users_avatar.sql": it,
  "../database/migrations/012_cash_sessions.sql": ct,
  "../database/migrations/013_purchases.sql": dt,
  "../database/migrations/014_receivables.sql": lt,
  "../database/migrations/015_quotes.sql": ut,
  "../database/migrations/016_sales_discount.sql": Et,
  "../database/migrations/017_expenses.sql": mt,
  "../database/migrations/018_returns.sql": _t,
  "../database/migrations/019_stock_movements.sql": pt,
  "../database/migrations/020_backup_settings.sql": Tt,
  "../database/migrations/021_tax_enabled.sql": Nt,
  "../database/migrations/022_printer_settings.sql": ft,
  "../database/migrations/023_categories.sql": St,
  "../database/migrations/024_default_admin.sql": Rt,
  "../database/migrations/025_license_tokens.sql": Ot,
  "../database/migrations/026_default_company.sql": It,
  "../database/migrations/027_is_system.sql": yt,
  "../database/migrations/028_default_category.sql": At,
  "../database/migrations/029_quotes_customer_contact.sql": Lt,
  "../database/migrations/030_nav_visibility.sql": gt,
  "../database/migrations/031_update_admin_credentials.sql": ht
});
function ta() {
  return Object.entries(ea).map(([e, n]) => ({
    name: e.split("/").pop(),
    sql: n
  }));
}
function na() {
  const e = X(), n = Dt(e, ta());
  console.log("[migrator] applied:", n.applied, "skipped:", n.skipped);
  const t = wt(e), a = Bt(t);
  a.init();
  const r = Pt(e), s = kt(r), o = xt(e), c = Xt(o), i = Yt(e), d = Wt(i), u = on(e), E = cn(u), m = $t(e), _ = Jt(m, a, d, E), T = nn(e), p = an(T), f = un(e), O = En(f), L = _n(e), g = pn(L), Q = Nn(e), Y = fn(Q), V = On(e), W = In(V, a, _, Y, c), Z = Ln(e), Pe = gn(Z), ke = Un(e), He = Cn(ke, m), xe = wn(e), Xe = Mn(xe), je = qn(e), Ye = Pn(je, a);
  qt(a), Ht(s), jt(c), Gt(d), en(_), rn(p), ln(E), mn(O), Tn(g), Rn(Y), An(W), bn(Pe), Dn(He), Bn(Xe), kn(b, Ye), Kn();
  const Ve = re.join(z.getPath("userData"), "taller_pos.sqlite");
  b.handle("db:get-path", () => ({ ok: !0, data: Ve })), b.handle("db:backup", async () => {
    try {
      const { filePath: S, canceled: R } = await ye.showSaveDialog({
        title: "Guardar respaldo de base de datos",
        defaultPath: `backup_${(/* @__PURE__ */ new Date()).toISOString().slice(0, 10)}.sqlite`,
        filters: [{ name: "SQLite", extensions: ["sqlite"] }]
      });
      return R || !S ? { ok: !0, data: null } : (await e.backup(S), { ok: !0, data: S });
    } catch (S) {
      return { ok: !1, error: { code: "BACKUP_ERROR", message: S.message } };
    }
  }), b.handle("db:backup-now", async () => {
    try {
      return { ok: !0, data: await ue(e) };
    } catch (S) {
      return { ok: !1, error: { code: "BACKUP_ERROR", message: S.message } };
    }
  }), b.handle("db:list-backups", () => {
    try {
      return { ok: !0, data: Qn() };
    } catch (S) {
      return { ok: !1, error: { code: "BACKUP_LIST_ERROR", message: S.message } };
    }
  });
  const me = Number(a.get("backup_interval_hours") ?? 720) || 720, _e = Number(a.get("backup_max_copies") ?? 10) || 10;
  b.handle("db:restore", async (S, R) => {
    try {
      let y = R;
      if (!y) {
        const { filePaths: h, canceled: J } = await ye.showOpenDialog({
          title: "Seleccionar respaldo para restaurar",
          filters: [{ name: "SQLite", extensions: ["sqlite"] }],
          properties: ["openFile"]
        });
        if (J || !h.length) return { ok: !0, data: null };
        y = h[0];
      }
      const I = await Zn(e, y);
      return setTimeout(() => {
        z.relaunch(), z.exit(0);
      }, 600), { ok: !0, data: I };
    } catch (y) {
      return { ok: !1, error: { code: "RESTORE_ERROR", message: y.message } };
    }
  }), b.handle("db:set-backup-interval", (S, R, y) => {
    try {
      const I = Math.max(1, Number(R) || me), h = Math.max(1, Number(y) || _e);
      return Jn(I, h), { ok: !0, data: { intervalHours: I, maxCopies: h } };
    } catch (I) {
      return { ok: !1, error: { code: "BACKUP_INTERVAL_ERROR", message: I.message } };
    }
  }), Me(e, me, _e), b.handle("app:read-asset", async (S, R) => {
    var y;
    try {
      const I = process.env.VITE_DEV_SERVER_URL ? re.join(z.getAppPath(), "public", R) : re.join(z.getAppPath(), "dist", R), h = await $e(I);
      return { ok: !0, data: `data:${((y = R.split(".").pop()) == null ? void 0 : y.toLowerCase()) === "png" ? "image/png" : "image/jpeg"};base64,${h.toString("base64")}` };
    } catch (I) {
      return { ok: !1, error: { code: "ASSET_READ_ERROR", message: String(I.message) } };
    }
  }), b.handle("printer:list", async (S) => {
    try {
      const R = Ae.fromWebContents(S.sender);
      return { ok: !0, data: (R ? await R.webContents.getPrintersAsync() : []).map((I) => ({ name: I.name, isDefault: I.isDefault })) };
    } catch (R) {
      return { ok: !1, error: { code: "PRINTER_LIST_ERROR", message: String(R.message) } };
    }
  }), b.handle("printer:print", async (S, R, y, I) => {
    const h = {
      "half-letter": { width: 139700, height: 215900 },
      letter: { width: 215900, height: 279400 },
      "thermal-80": { width: 8e4, height: 297e3 }
    }, J = h[I] ?? h["half-letter"], G = new Ae({ show: !1, webPreferences: { contextIsolation: !0 } });
    try {
      return await G.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(R)), await new Promise((ae) => {
        G.webContents.print(
          { silent: !0, deviceName: y || void 0, pageSize: J },
          (We, Ge) => {
            G.close(), ae(We ? { ok: !0, data: null } : { ok: !1, error: { code: "PRINT_FAILED", message: Ge } });
          }
        );
      });
    } catch (ae) {
      return G.close(), { ok: !1, error: { code: "PRINT_ERROR", message: String(ae.message) } };
    }
  });
}
const { app: x, BrowserWindow: Fe, Menu: Be } = N;
let de = null;
function qe() {
  de = new Fe({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: pe(x.getAppPath(), "dist-electron", "preload.mjs"),
      contextIsolation: !0,
      nodeIntegration: !1
    }
  }), process.env.VITE_DEV_SERVER_URL ? de.loadURL(process.env.VITE_DEV_SERVER_URL) : de.loadFile(pe(x.getAppPath(), "dist", "index.html"));
}
function aa() {
  return Be.buildFromTemplate([
    {
      label: "Archivo",
      submenu: [
        { role: "quit", label: "Salir" }
      ]
    },
    {
      label: "Vista",
      submenu: [
        { role: "reload", label: "Recargar", accelerator: "CmdOrCtrl+R" },
        { role: "forceReload", label: "Recargar (forzado)", accelerator: "CmdOrCtrl+Shift+R" },
        { role: "toggleDevTools", label: "Herramientas de dev", accelerator: "F12" },
        { type: "separator" },
        { role: "resetZoom", label: "Zoom normal", accelerator: "CmdOrCtrl+0" },
        { role: "zoomIn", label: "Acercar", accelerator: "CmdOrCtrl+=" },
        { role: "zoomOut", label: "Alejar", accelerator: "CmdOrCtrl+-" },
        { type: "separator" },
        { role: "togglefullscreen", label: "Pantalla completa", accelerator: "F11" }
      ]
    }
  ]);
}
x.whenReady().then(() => {
  Be.setApplicationMenu(aa()), na(), qe();
});
x.on("window-all-closed", () => {
  process.platform !== "darwin" && x.quit();
});
x.on("activate", () => {
  Fe.getAllWindows().length === 0 && qe();
});
