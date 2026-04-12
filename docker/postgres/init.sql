CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "unaccent";

-- Banco dedicado ao Keycloak (mesmo cluster Postgres em host network).
-- Se o volume já existia antes deste script, crie manualmente: CREATE DATABASE keycloak;
CREATE DATABASE keycloak;
