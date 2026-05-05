-- 030_nav_visibility.sql
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
