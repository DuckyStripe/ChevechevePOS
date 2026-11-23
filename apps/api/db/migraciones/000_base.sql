-- Base: esquema de la aplicacion y extensiones. Sin tablas de negocio.
create schema if not exists app;

-- citext: correos/usuarios sin distinguir mayusculas sin tener que hacer lower() en cada consulta.
create extension if not exists citext;
-- pgcrypto: gen_random_uuid() y digest() para folios/hashes desde SQL.
create extension if not exists pgcrypto;
