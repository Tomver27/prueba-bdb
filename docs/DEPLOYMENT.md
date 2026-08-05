# DEPLOYMENT.md — Despliegue en AWS (EC2 + Docker)

## Instancia

- **Tipo**: `t3.micro` o `t3.small` (Ubuntu 24.04 LTS). Suficiente para un monolito Next.js con
  tráfico de demo/evaluación; no se necesita autoescalado para este reto.
- **Elastic IP**: asociar una para tener una dirección estable (necesaria si se configura un
  dominio para TLS con Let's Encrypt).
- **Security Group**:
  - `22/tcp` (SSH) — restringido a la IP del desarrollador, no `0.0.0.0/0`.
  - `80/tcp` y `443/tcp` (HTTP/HTTPS) — abiertos al público.
  - Ningún otro puerto expuesto (el contenedor de Next.js escucha en `3000` internamente, solo
    accesible dentro de la red de Docker, nunca publicado directamente al host).

## Software en la instancia

- Docker Engine + Docker Compose plugin.
- (Opcional pero recomendado) `certbot` en modo standalone o el contenedor `nginx` con un volumen
  compartido para los certificados, si se configura un dominio propio.

## `docker-compose.yml` — servicios esperados

| Servicio | Imagen/build | Responsabilidad | Puertos publicados |
|---|---|---|---|
| `nginx` | `nginx:alpine` + `docker/nginx.conf` | Termina TLS, sirve como proxy inverso hacia `app:3000`, redirige `http → https` | `80:80`, `443:443` |
| `app` | build desde `docker/Dockerfile` | Next.js (`node server.js`, salida `output: "standalone"` — ver más abajo) | ninguno publicado al host; solo accesible desde `nginx` vía red interna de Docker |

- `app` lee sus variables de entorno desde `env_file: .env` (el `.env` real vive solo en el
  servidor, nunca en el repo).
- `nginx` monta `docker/nginx.conf` como solo lectura y, si aplica, el volumen de certificados de
  Let's Encrypt.
- Ambos servicios en la misma red de Docker (`bridge` por defecto de compose); `nginx` referencia
  al servicio `app` por su nombre DNS interno (`app:3000`), no por IP.

## `docker/Dockerfile` — spec del build

- Multi-stage: `deps` (`npm ci`), `builder` (`next build`), `runner` (imagen final mínima,
  `node:20-alpine`, usuario no-root, `HEALTHCHECK` apuntando a `/api/health`).
- **Corrección (fase f, implementación real):** en vez de copiar `.next` + `public` +
  `package.json` + `node_modules` de producción completos como describe el punto anterior en su
  versión original, `next.config.ts` declara `output: "standalone"`. Esto genera
  `.next/standalone` con un `server.js` mínimo que ya trae solo los módulos de `node_modules`
  que realmente se usan — el `runner` copia `public`, `.next/standalone` y `.next/static`, sin
  necesitar `npm ci --omit=dev` en ese stage. Imagen final verificada: **~201MB**. Se corre con
  `CMD ["node", "server.js"]`, no `next start`.
- **`.dockerignore` agregado** (no estaba en el árbol original de `docs/STRUCTURE.md`): excluye
  `.env`/`.env.*`, `node_modules`, `.next`, `.git`. Importante por seguridad — sin esto, `COPY . .`
  en el stage `builder` horneé `.env` (con las keys reales) en una capa de la imagen, aunque el
  `runner` final no la copie explícitamente; las capas intermedias igual quedan en el historial
  de build/caché local.
- **Hallazgo al construir la imagen por primera vez:** `npm ci` fallaba (`EUSAGE`, lockfile
  desincronizado — entradas de dependencias opcionales nativas de Tailwind/lightningcss,
  `@emnapi/*`, con versiones distintas a las resueltas localmente). Se corrigió regenerando
  `package-lock.json` desde cero (`rm -rf node_modules package-lock.json && npm install`). Si
  esto reaparece al desplegar en el servidor real, aplicar la misma corrección antes de
  `docker compose up -d --build` — `npm ci` es estricto y no tolera un lockfile desactualizado.
- **Verificado end-to-end en local** (no solo escrito): `docker build`, `docker compose up -d`,
  contenedor `app` en estado `healthy`, `GET /api/health` y `POST /api/agent` respondiendo
  correctamente a través de `nginx` en el puerto 80.

## TLS

- **Con dominio propio**: Let's Encrypt vía certbot (webroot o el plugin de nginx), renovación
  automática con un cron/systemd timer en el host.
- **Sin dominio (demo rápida)**: documentar como limitación conocida y servir solo por HTTP para
  la evaluación, o usar un certificado autofirmado — nunca enviar `CROMA_API_KEY`/`GEMINI_API_KEY`
  reales a través de un canal sin cifrar en un entorno que no sea estrictamente de demo controlada.

## Variables de entorno en producción

- `.env` se crea manualmente en el servidor (`scp` o edición directa por SSH), **nunca** se
  commitea. `.env.example` en el repo documenta las claves sin valores reales.
- Verificar con `docker compose config` que las variables se están inyectando antes de
  `docker compose up -d`.

## Costos estimados frente a los 100 USD de crédito

- `t3.micro`/`t3.small` on-demand: bajo costo mensual (varía por región); si la cuenta es
  elegible para el Free Tier de AWS, `t3.micro` puede tener horas gratuitas.
- Elastic IP: gratis mientras esté asociada a una instancia en ejecución; genera costo si se
  libera y queda huérfana — liberar la IP si se apaga la instancia al terminar la evaluación.
- Transferencia de datos saliente: irrelevante para el volumen de una demo.
- El costo dominante real no es AWS sino el uso de la API de Gemini si se excede el tier gratuito
  — monitorear cuota en Google AI Studio, no en AWS.

## Pasos de despliegue (resumen operativo)

1. Lanzar la instancia EC2 con el Security Group descrito arriba.
2. Instalar Docker + Compose.
3. Clonar el repositorio en el servidor.
4. Crear `.env` a partir de `.env.example` con las keys reales.
5. `docker compose up -d --build`.
6. Verificar `GET /api/health` desde fuera de la instancia.
7. (Si aplica) emitir certificado TLS y confirmar `https://` funciona.
8. Probar el flujo completo end-to-end antes de grabar el video de la entrega.
