CREATE EXTENSION IF NOT EXISTS vector;
CREATE SCHEMA IF NOT EXISTS auth;

ALTER ROLE soundvault IN DATABASE soundvault
SET search_path TO auth, public;
