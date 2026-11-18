# Compaz

Extensión de navegador minimalista para concentrarte un rato y descansar sin culpa.

Lee `docs/` antes de contribuir.

## Probar en local

Funciona igual en Windows, macOS y Linux. Necesitas [Node.js](https://nodejs.org) 22 o superior.
`dist/` no viene en el repositorio: se compila una vez al clonar.

```bash
npm install
npm run build
```

1. Abre `chrome://extensions` (o `edge://extensions`).
2. Activa **Modo de desarrollador**.
3. **Cargar descomprimida** → elige la carpeta `compaz/dist`.
4. Fija el ícono en la barra y haz clic.

Tras cambiar código: `npm run build` y luego el botón ⟳ de la extensión en `chrome://extensions`.

### En Firefox (128 o superior)

1. `npm run build` (crea `dist-firefox/`).
2. Abre `about:debugging#/runtime/this-firefox`.
3. **Cargar complemento temporal…** → elige `compaz/dist-firefox/manifest.json`.
4. Para bloquear sitios, en `about:addons` → compaz → **Permisos**, revisa que los sitios estén permitidos.

Es temporal: Firefox la quita al cerrarse. Para dejarla fija hay que firmarla (gratis) en addons.mozilla.org.
La sincronización usa la cuenta de Firefox: Firefox ↔ Firefox sí, Chrome ↔ Firefox no.

## Desarrollo

```bash
npm install
npm run build      # compila a dist/ (Chrome) y dist-firefox/
npm test           # tests del núcleo
npm run typecheck
```

Escenas: cada una vive en `img/escenas/<id>/` (fondo, hojas de personajes y `escena.json`).
Para agregar o ajustar una: `python scripts/escenas.py --calibrar` (necesita `python -m pip install pillow`;
en macOS es `python3`, y si pip se niega a instalar, crea antes un entorno: `python3 -m venv .venv && source .venv/bin/activate`)
abre el calibrador en el navegador; "Guardar y regenerar" deja todo listo. Cómo pedir las imágenes: `docs/05-escenas.md`.

## Probar rápido sin esperar 25 minutos

En `chrome://extensions` → compaz → "service worker" (consola), pega:

```js
const d = (await chrome.storage.local.get('compaz')).compaz;
d.state.endsAt = Date.now() + 5000;
await chrome.storage.local.set({ compaz: d });
await chrome.alarms.create('transition', { when: Date.now() + 5000 });
```

La fase actual (enfoque, recreo o espera) termina en 5 segundos.
