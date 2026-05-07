-- 031_update_admin_credentials.sql
-- Actualiza credenciales del admin para Ferreteria El Esfuerzo.
-- Password: "Admin123" → SHA-256

UPDATE users
   SET email         = 'admin@elfuerzo.local',
       password_hash = '3b612c75a7b5048a435fb6ec81e52ff92d6d795a8b5a9c17070f6a63c97a53b2'
 WHERE id = 1;
