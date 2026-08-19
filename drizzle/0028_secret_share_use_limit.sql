-- Límite de usos por enlace de secreto.
--
-- Un enlace ya caducaba por tiempo, pero podía resolverse infinitas veces
-- dentro de esa ventana. Los agentes que no guardan la clave la vuelven a
-- pedir al enlace, así que el TTL solo no acota la exposición.
--
-- max_uses NULL = sin límite, que es como se comportaban todos los enlaces
-- existentes: la columna nace nula y no cambia su semántica.
ALTER TABLE secret_share_links ADD COLUMN max_uses INTEGER;
ALTER TABLE secret_share_links ADD COLUMN use_count INTEGER NOT NULL DEFAULT 0;
