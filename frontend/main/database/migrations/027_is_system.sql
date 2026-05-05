-- 027_is_system.sql
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
