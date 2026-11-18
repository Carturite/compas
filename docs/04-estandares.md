# Estándares

> Estado: borrador para revisión.

## Lenguaje y build

- **TypeScript** en modo `strict`, compilado con `tsc` a módulos ES (sin bundler).
  `scripts/build.mjs` compila y copia HTML/CSS/íconos a `dist/` y genera `dist-firefox/` (mismo código, otro manifiesto).
  Se descartó Vite: MV3 carga módulos ES nativos y así la única dependencia de desarrollo es TypeScript.
- Tipos de `chrome.*` mínimos en `src/types/chrome.d.ts`; se pueden cambiar por `@types/chrome` sin tocar el código.
- Sin frameworks de UI en la etapa 1: HTML + CSS + TS. Las pantallas son pocas y simples.
- Gestor de paquetes: **npm**.

## Estructura

```
compaz/
  CLAUDE.md
  README.md
  docs/
  src/
    core/        # lógica pura + tests
    platform/    # adaptadores a chrome.*
    background/
    popup/
    blocked/
    options/
    shared/      # estilos, textos, snapshot y helpers de UI
    types/       # tipos mínimos de chrome.*
  public/
    manifest.json
    icons/       # generados con scripts/icons.mjs
  scripts/       # build e íconos
  tests/
```

## Código

- Funciones pequeñas y puras en `core/`. Efectos solo en `platform/` y `background/`.
- Nombres en inglés en el código; textos de interfaz en español, centralizados en `shared/strings`.
- Sin `any`. Tipos para estados y mensajes como uniones discriminadas.
- **ESLint** + **Prettier** con configuración por defecto; el formato no se discute.
- Sin dependencias en tiempo de ejecución salvo justificación escrita.

## Tests

- Test runner nativo de Node (`node:test`) para `core/`. Toda regla de tiempos o de estados tiene test (`npm test`).
- El tiempo se inyecta (reloj falso), nunca se usa `Date.now()` directo en `core/`.

## Git

- **Conventional Commits** (`feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`).
- Rama principal `main`; trabajo en ramas cortas `feat/...`, `fix/...`.
- Versionado **SemVer** en `manifest.json` y `package.json`.

## Interfaz

- Ancho del popup ≤ 320 px. Una acción principal por pantalla.
- Accesibilidad: contraste AA, foco visible, todo usable con teclado, respeta `prefers-reduced-motion`.
- Animaciones cortas (≤ 200 ms) y suaves.
- Modo claro/oscuro según el sistema.

## Privacidad

- Cero llamadas de red propias. La única salida de datos es `chrome.storage.sync`, que gestiona el navegador con la cuenta
  de la persona y se puede apagar. Cualquier otra excepción se discute en `docs/03-solucion.md` primero.
- El enlace de donación abre una página externa; la extensión no procesa pagos.
