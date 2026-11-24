-- 012: respaldo manual. Si no hay copia remota (rclone), el dueño descarga el respaldo desde Configuración
-- y esa descarga cuenta como copia fuera del servidor (CONTRATOS §3.2). Solo la escribe GET /configuracion/respaldo.
-- Semilla sin auditar (como 011): no es un cambio de nadie.
alter table app.configuracion disable trigger trg_auditar;
insert into app.configuracion (clave, valor) values ('respaldo_ultima_descarga', 'null')
on conflict (clave) do nothing;
alter table app.configuracion enable trigger trg_auditar;
