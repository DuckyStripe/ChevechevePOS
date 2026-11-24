# certs — certificado público de la firma de OTA

Aquí va **solo** `certificado.pem` (certificado público; SÍ se sube a git). Todavía no existe: lo genera el dueño
al preparar la primera APK (guía: `docs/deploy/actualizar-app.md`).

```
openssl genrsa -out ~/.chevecheve-actualizaciones/llave-privada.pem 2048
chmod 600 ~/.chevecheve-actualizaciones/llave-privada.pem
openssl req -new -x509 -key ~/.chevecheve-actualizaciones/llave-privada.pem -out certs/certificado.pem -days 3650 -subj "/CN=Chevecheve OTA"
```

- `llave-privada.pem` vive solo en el servidor (`~/.chevecheve-actualizaciones/`, permiso 600) y se respalda fuera de él.
  **Nunca** entra al repo (`.gitignore` excluye `*.pem` salvo `certs/certificado.pem`).
- Sin `certificado.pem`, `app.config.ts` no activa la firma de manifiestos y `scripts/compilar-apk.sh` se niega a compilar.
- Perder la llave = APK nueva con certificado nuevo, instalada a mano en cada teléfono.
