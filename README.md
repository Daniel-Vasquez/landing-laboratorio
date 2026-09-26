# Landing Laboratorio Clínico — Hospital Cristal

Landing page estática (SSG) alimentada desde MongoDB en tiempo de compilación,
con un gestor de contenido propio protegido por autenticación. Al guardar un
cambio, el backend dispara un Deploy Hook de Vercel y la landing se redesplega
consumiendo la data actualizada.

- **Landing** (`/`): 100 % estática. En producción no hace ninguna query.
- **Panel** (`/admin`): SSR, protegido. Edita las 11 secciones de la landing.

## Stack

| Pieza | Elección |
|---|---|
| Framework | Astro 7 · `output: 'static'` + `prerender = false` por ruta |
| UI | React **solo** en el panel · Tailwind CSS v4 |
| Base de datos | MongoDB Atlas (driver nativo, sin ODM) |
| Validación | Zod — única fuente de verdad de la forma del contenido |
| Autenticación | Better Auth (email + contraseña) |
| Despliegue | Vercel (runtime Node, **no** Edge) |

## Puesta en marcha local

```bash
npm install
cp .env.example .env     # rellena los valores (SIN comillas)
npm run db:indexes       # crea índices en Atlas
npm run db:seed          # carga el contenido de copy.md (idempotente)
npm run preflight        # verifica que todo esté coherente
npm run dev
```

## Comandos

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo |
| `npm run build` | Build de producción |
| `npm run check` | Type-check de Astro/TS |
| `npm run preflight` | Verifica entorno, Atlas, índices, contenido y cuentas |
| `npm run preflight -- --prod` | Ídem, exigiendo lo que producción necesita |
| `npm run db:indexes` | Crea los índices (idempotente) |
| `npm run db:seed` | Carga el contenido semilla (`$setOnInsert`: no pisa ediciones) |
| `npm run a11y:contrast` | Ratios WCAG de los 9 tokens en ambos temas |
| `npm run a11y:html` | 15 comprobaciones estructurales sobre el HTML generado |

## Despliegue a producción — orden exacto

El orden importa: el Deploy Hook no puede existir antes del proyecto, y las
cuentas no pueden crearse antes de que haya un dominio que sirva `/registro`.

1. **Atlas**: cluster, usuario con rol `readWrite` sobre una sola base,
   Network Access `0.0.0.0/0` (Vercel no tiene IP fija para serverless).
2. `npm run db:indexes && npm run db:seed` desde local.
3. **Cargar las variables en Vercel** (tabla abajo), con
   `ALLOW_PUBLIC_SIGNUP=true` y **sin** `VERCEL_DEPLOY_HOOK_URL` todavía.
4. Deploy. Verifica que `/` muestra el contenido de tu base, no el semilla:
   busca `[content]` en el log del build — si aparece, cayó al semilla.
5. Asigna el subdominio y confirma que el SSL está activo.
6. Registra las cuentas del equipo en `/registro`.
7. **`ALLOW_PUBLIC_SIGNUP=false`** y redeploy. Verifica que `/registro` da 404.
8. Crea el Deploy Hook: **Settings → Git → Deploy Hooks**, nombre
   `cms-content-update`, branch `main`. Copia la URL a
   `VERCEL_DEPLOY_HOOK_URL` **solo en Production**.
9. Redeploy. Ejecuta el QA de abajo.

### Variables de entorno por entorno

| Variable | Production | Preview | Local |
|---|---|---|---|
| `MONGODB_URI` | cluster prod | cluster prod | Atlas dev |
| `MONGODB_DB_NAME` | `laboratorio` | `laboratorio_preview` | `laboratorio_dev` |
| `BETTER_AUTH_SECRET` | secreto real | el mismo | cualquiera |
| `BETTER_AUTH_URL` | `https://<dominio>` | `https://$VERCEL_URL` | `http://localhost:4321` |
| `PUBLIC_SITE_URL` | **idéntica a la anterior** | idem | `http://localhost:4321` |
| `VERCEL_DEPLOY_HOOK_URL` | la URL del hook | **vacía** | vacía |
| `ALLOW_PUBLIC_SIGNUP` | `false` | `true` | `true` |
| `CONTENT_FALLBACK_TO_SEED` | `true` | `true` | `true` |
| `CRON_SECRET` | `openssl rand -hex 32` | — | — |

Tres trampas que cuestan horas:

- **Los valores van sin comillas.** Copiarlas desde `.env` arrastra las comillas
  y el build muere con `Invalid URL`. El código las tolera y lo avisa en el log,
  pero no las pongas.
- **`PUBLIC_SITE_URL` y `BETTER_AUTH_URL` deben ser idénticas**, con `https://`
  y sin slash final. Un mismatch rechaza las cookies y produce un login en bucle
  sin ningún mensaje útil. `npm run preflight` lo detecta.
- **`VERCEL_DEPLOY_HOOK_URL` vacía en Preview.** El hook apunta a `main`: un
  preview de otra rama publicaría producción. Es el fallo más caro del diseño.

## QA en producción

Ejecuta `npm run preflight -- --prod` con las variables de producción cargadas, y
después esto en el navegador:

- [ ] `/` carga y muestra el contenido de tu base.
- [ ] **View source** de `/` contiene los textos (confirma SSG real, no hidratación).
- [ ] El toggle de tema funciona, persiste al recargar y **no hay destello blanco**.
- [ ] Móvil real (iOS Safari + Android Chrome): menú, acordeón FAQ, tap targets ≥ 44px.
- [ ] `/registro` da 404.
- [ ] Login con credenciales válidas entra al panel; con inválidas da un mensaje
      genérico (nunca distingue "correo no existe" de "contraseña incorrecta").
- [ ] Editar el titular del hero → guardar → aparece un deployment en Vercel en
      menos de 10 s → al terminar el build, `/` muestra el texto nuevo.
- [ ] Guardar 3 secciones seguidas → **un solo** deployment + aviso de
      "cambios pendientes" en el panel.
- [ ] `/admin/usuarios` muestra tu nombre como último editor.
- [ ] Cerrar sesión deja `/admin` inaccesible.
- [ ] securityheaders.com sobre el dominio → grado A o superior.
- [ ] Lighthouse mobile en `/`: Performance ≥ 95, Accessibility 100, SEO 100.
- [ ] axe DevTools en `/` y en `/admin/contenido/hero`: 0 violaciones serias.
- [ ] Navegar y editar una sección **usando solo el teclado**.

## Si el panel falla con `_jsxDEV is not a function`

Es un desajuste del optimizador de dependencias de Vite en **desarrollo**
(`jsxDEV` es el runtime de dev; producción no lo usa). Ocurría porque los islands
del panel solo se cargan al entrar a `/admin/contenido/...`: Vite descubría ahí
dependencias nuevas, re-optimizaba, rotaba el `browserHash`, y los módulos ya
servidos quedaban pidiendo el hash viejo y recibían un 504.

Está resuelto declarando esas dependencias en `optimizeDeps.include`
(`astro.config.mjs`). Si vuelve a aparecer tras añadir una librería de cliente:

```bash
npx astro dev stop
rm -rf node_modules/.vite .astro
npx astro dev
```

y recarga el navegador con caché forzada. Si persiste, añade la dependencia
nueva a `optimizeDeps.include`.

## Documentos

- `planificacion.md` — hoja de ruta por Tandas, con las desviaciones y los 30
  riesgos identificados.
- `NOTAS-SEGURIDAD.md` — por qué la CSP conserva `'unsafe-inline'`, el
  `0.0.0.0/0` de Atlas y el rate limiting.
- `copy.md` — copy original del cliente.

## Pendientes conocidos

- **El CTA final apunta a `#agendar`, su propia sección**: enlace muerto. Falta
  el WhatsApp o el teléfono. Es editable desde el panel, sin tocar código.
- **Faltan los 7 thumbnails de Instagram.** Se muestra un placeholder con el
  mismo `aspect-ratio` que la imagen real, así sustituirlo no provoca reflow.
  Súbelos a `/public/videos/` y rellena el campo desde el panel.
- **El JSON-LD omite `telephone` y `openingHours`** a propósito: no se
  inventaron. Un teléfono incorrecto en datos estructurados llega a Google Maps.
- **La paleta entregada se ajustó por WCAG AA.** Ver el comentario en
  `src/styles/global.css` con los ratios medidos.
