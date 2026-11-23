# Progreso del desarrollo

Registro para retomar el trabajo. Cada fase: brief (opus) → B base → C API ∥ D web → revisor (opus) → validación → commit + push.
Reglas del dueño: sin builds hasta terminar todo el plan (solo lint, typecheck y pruebas); push a `main` autorizado (sin Dokploy aún); no dar resúmenes al dueño.

| Fase | Estado | Commit |
|---|---|---|
| Reestructura + diseño | Hecho | `84c3801` |
| F1 A infra | Hecho | `d0947eb` |
| F1 B 001_auth | Hecho | `dc54318` |
| F1 C/D + revisión (12 hallazgos corregidos) | Hecho, 114 pruebas | `dac9d30` |
| F2 | En curso: B (002–003) y D (pantallas) corriendo; C espera a B | — |

## Pendientes conocidos
- `apps/web` no tiene pruebas automáticas del BFF (Origin, cookies, 204, `..`): cubrir antes de la validación final.
- Bloqueo de usuarios inexistentes es en memoria por proceso (`shortcut` en el código).
- Respaldos (`infra/respaldo`) sin probar: requiere build y destino rclone.
- F4: compilar APK y llaves de firma quedan para la validación final.
- Importar Eleventa: falta el archivo real.
- Decisiones de contrato de F2 a revisar con el dueño: `GET /catalogo-venta` pasa a F3; `v_por_caducar` cuenta líneas sin caducidad; dependencia nueva `@fastify/multipart`.
