-- 028_default_category.sql
-- Seed de la categoría genérica "00-FABRICACION". id=1 reservado como categoría
-- del sistema. Mismo patrón que id=1 (Consumidor Final) en clientes. No borrar.
INSERT OR IGNORE INTO categories (id, name) VALUES (1, '00-FABRICACION');
