# Notas de seguridad

## Content-Security-Policy: por qué lleva `'unsafe-inline'` en `script-src`

La CSP de `vercel.json` permite scripts inline. No es descuido; es la consecuencia
de dos requisitos del proyecto:

1. **El script anti-FOUC del tema tiene que ser inline y bloqueante.** Debe
   ejecutarse antes del primer paint para aplicar la clase `.dark`. Si se mueve a
   un archivo externo, deja de ser sincrónico y el usuario con tema oscuro ve un
   destello blanco en cada carga.
2. **La landing es estática (SSG).** La alternativa correcta a `'unsafe-inline'`
   es un `nonce` distinto por respuesta, y un nonce exige generar la página en
   cada petición. Eso es incompatible con el requisito de que `/` sea HTML
   inmutable servido desde CDN.

La otra vía —hashes SHA en lugar de nonces— sí funciona con SSG, pero el hash
cambia en cada build en el que Astro reordene o recompile un script, así que
habría que regenerar `vercel.json` como paso de build. Es viable si el proyecto
adopta más adelante un pipeline de CSP automatizado; hoy añadiría un modo de
fallo silencioso (una CSP desactualizada rompe la página en producción sin
avisar en el build).

**Qué mitiga la CSP tal como está:** `default-src 'self'`, `connect-src 'self'`
y `object-src 'none'` impiden exfiltrar datos o cargar código de terceros;
`frame-ancestors 'none'` y `X-Frame-Options: DENY` bloquean el clickjacking;
`base-uri 'self'` y `form-action 'self'` evitan que un XSS redirija formularios
o reescriba rutas relativas. Un XSS inyectado seguiría ejecutándose, pero no
podría sacar los datos del origen.

**Qué NO cubre `'unsafe-inline'`:** un XSS que ejecute código en la página. La
defensa real ahí es que todo el contenido se renderiza como texto por Astro
(sin `set:html` sobre datos de usuario) y que el único `set:html` del proyecto
recibe JSON serializado por `JSON.stringify`, no entrada libre.

## `0.0.0.0/0` en Atlas

Vercel no publica rangos de IP fijos para funciones serverless, así que el acceso
de red tiene que estar abierto. Mitigaciones en su lugar:

- El usuario de base de datos tiene rol `readWrite` sobre **una sola** base, no
  permisos de cluster.
- La contraseña debe ser larga y aleatoria (32+ caracteres).
- `MONGODB_URI` nunca lleva prefijo `PUBLIC_`, así que no llega al navegador
  (verificado con un grep del bundle en cada Tanda).

Si se necesita cerrarlo: Vercel ofrece IP estáticas con Secure Compute en planes
Enterprise, o se puede poner un proxy propio con IP fija delante de Atlas.

## Rate limiting

Configurado en `src/lib/auth.ts`: 10 peticiones por minuto, con
`storage: 'database'`. El almacenamiento en base es **obligatorio** en
serverless: la memoria no se comparte entre instancias, así que un límite en
memoria no limita nada — cada invocación empezaría su propia cuenta.
