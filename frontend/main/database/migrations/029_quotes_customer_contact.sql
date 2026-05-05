-- 029_quotes_customer_contact.sql
-- Agrega teléfono y dirección del cliente en la cotización (snapshot, no FK).
ALTER TABLE quotes ADD COLUMN customer_phone   TEXT;
ALTER TABLE quotes ADD COLUMN customer_address TEXT;
