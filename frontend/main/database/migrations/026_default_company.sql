-- 026_default_company.sql
-- Seed del cliente "Empresa Genérica". id=2 reservado como fallback cuando
-- el tipo de cliente es "Empresa" pero no se selecciona una empresa específica.
-- Mismo patrón que id=1 (Consumidor Final). No borrar.
INSERT OR IGNORE INTO customers (id, nit, name) VALUES (2, 'CF', 'Empresa Genérica');
