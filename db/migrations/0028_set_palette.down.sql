-- Rollback de 0028. No se pierde nada que no se pueda recalcular: la paleta
-- deriva de las imagenes con `npm run sobres:paleta`.
ALTER TABLE sets DROP COLUMN palette;
