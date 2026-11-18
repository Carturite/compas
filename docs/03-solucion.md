# Solución

> Estado: borrador para revisión.

## Plataforma

- **Chrome Manifest V3**, compatible con navegadores Chromium.
- **Firefox 128+** con el mismo código: `npm run build` genera además `dist-firefox/`, que solo cambia el manifiesto
  (`background.scripts` en vez de `service_worker`, `browser_specific_settings.gecko.id` en vez de `key`,
  y `data_collection_permissions: none`). Las APIs `chrome.*` que usamos existen en Firefox con el mismo nombre.

## Piezas

| Pieza | Responsabilidad |
|---|---|
| `core/` | Lógica pura: máquina de estados, cálculo de tiempos y recompensas. Sin APIs del navegador. |
| `background/` | Service worker: alarmas (`chrome.alarms`), reglas de bloqueo (`declarativeNetRequest`), ícono. |
| `popup/` | La pantalla principal: estado + un botón. |
| `blocked/` | Pantalla que se ve al entrar a un sitio bloqueado. |
| `options/` | Ajustes: tiempo diario, lista de sitios, modo estricto. |
| `platform/` | Adaptadores a APIs del navegador (storage, alarms, reglas). Permite testear `core/` y reutilizarlo en la etapa 2. |

`core/` no conoce el navegador. Eso permite testearlo sin navegador y llevarlo a la app de escritorio.

## Estados

```
inactivo ──empezar──▶ enfoque ──termina──▶ recreo ──termina──▶ inactivo
              ▲          │                    │
              │       cancelar            (usar recompensa
              │          ▼                 cuando quiera)
              └── espera (solo modo estricto)
```

- `inactivo`: nada bloqueado.
- `enfoque`: sitios bloqueados, cuenta regresiva.
- `recreo`: sitios desbloqueados durante el tiempo ganado.
- `espera`: solo con modo estricto al cancelar; termina sola y vuelve a `inactivo`.

Posponer = mover la sesión a más tarde sin penalización.

## Tiempos por defecto (ajustables)

Basados en ciclos conocidos de concentración (Pomodoro y bloques largos), siempre con descanso:

| Perfil | Enfoque | Recreo ganado |
|---|---|---|
| Suave (por defecto) | 25 min | 5 min |
| Medio | 50 min | 10 min |
| Profundo | 90 min | 20 min (máximo de enfoque continuo) |

- El tiempo diario se reparte en sesiones del perfil elegido.
- **Ajuste gradual:** si la persona cancela seguido, se sugiere bajar de perfil;
  si completa varias seguidas sin problema, se sugiere subir. Siempre como sugerencia, nunca automático.

## Escenas y personajes (tablero de piezas)

- **Escenas y colección:** cada fondo es una escena dibujada con su elenco (el jardín con gatitos, el circo con pájaros,
  el teatro con músicos y utilería…), pero las piezas son una sola colección y se pueden poner en cualquier escena.
  **Cada pieza se pone una vez en cada escena:** guarda un lugar por escena (`Piece.spots`), y la bandeja de cada escena
  muestra las piezas que aún no están en ella. Ponerla en el teatro no la saca del jardín.
- **Premios:** cada sesión completa sortea primero el tipo, con la misma probabilidad (objeto, personaje o personaje que
  parpadea; `tipo` en `escena.json`) y luego una pieza de ese tipo. Pueden repetirse: cada repetida es una pieza más.
  Llega a la escena elegida como fondo en ajustes (`Settings.scene`, sincronizado); si no hay lugar, espera en su bandeja.
- **Fondos desbloqueables:** cada escena dice con cuántos personajes ganados se abre (`desbloqueo` en su `escena.json`;
  el jardín 0, el circo 15). Se cuentan los ganados en total, que nunca bajan, así un fondo abierto no se cierra.
  El popup avisa en una esquina cuántos faltan ("Fondo nuevo en 7") y, en el recreo en que se abre, lo anuncia una vez.
  Ajustes muestra lo mismo. En la versión de desarrollo todas las escenas están abiertas para probarlas.
- **Una carpeta por escena** en `img/escenas/<id>/`: `fondo.png`, una o más hojas de personajes y `escena.json`:
  - `nombre`, `orden`, `desbloqueo` (personajes ganados que abren este fondo), `fondo`, `hojas` (cada una con `archivo` y `celda`: cuántos píxeles de la hoja mide un cuadrito,
    así los personajes de una hoja mantienen su tamaño relativo). Opcionales por hoja: `papel` (hoja dibujada sobre
    pergamino, con marco y figuras juntas: si sigue opaca el script borra el pergamino, las líneas de la cuadrícula y el
    borde blanco tipo sticker, y separa las figuras más fino), `borrar` (rectángulos de la hoja que se limpian antes de
    recortar, como un adorno del marco pegado a una figura) y `cerrados` (la misma hoja con los ojos cerrados, para el
    parpadeo). Una hoja con pergamino se puede retocar a mano: se guarda transparente y el original queda en `originales/`.
  - `pisos`: superficies donde se paran los personajes, cada una con `cols` × `rows` celdas y sus 4 `esquinas` sobre el
    fondo (fondo-izquierda, fondo-derecha, frente-derecha, frente-izquierda, en píxeles de 1280 de ancho). El primero es
    el suelo principal. `bloqueadas`: celdas ocupadas por el decorado. `sobre`: el objeto que lo sostiene.
    Un `punto` (`[x, y]`) es un piso de 1 cuadrito: un gancho del árbol, del perchero, un nudo de cuerda. `suelo` es la fila
    de la imagen donde su objeto toca el suelo (la base del árbol, de la cuerda): de ahí salen su tamaño (el ancho de un
    cuadrito del piso principal a esa profundidad, igual hacia arriba) y su orden de dibujo. Con `piso` (id de otro piso,
    por ejemplo la plataforma bajo una cuerda) toma el tamaño exacto de ese piso. `celda` en px lo fuerza.
    `colgar`: los personajes que cuelgan (`cuelga`, como el perico) cuelgan de ahí en vez de pararse.
  - `objetos`: decorado recortado del fondo (polígono, `base` = fila donde toca el suelo, `llave` para quitar pasto
    y piedras por color) que se vuelve a dibujar entre los personajes para tapar a los que están detrás.
  - `personajes`: id → `recorte` (`hoja.png#n`), `ancho` (1 a 3 cuadritos) y `nombre`; opcional `encima` (altura de su
    dibujo, 0 = arriba, donde puede pararse otro personaje: mesa, tambor, sombrero), `cuelga`, `escala` (si en la hoja
    lo dibujaron más grande o más chico que el resto, como la bailarina del jardín, 0,75), `tipo: "objeto"` (para el
    sorteo de premios), `capa` (`detras` o `delante`: no ocupa lugar, ver abajo) y `apoyo` (altura del dibujo que
    descansa sobre su casilla, 0 = arriba, 1 = abajo por defecto: las alfombras, 0,5, se apoyan en su mitad).
- **`scripts/escenas.py`** (herramienta, necesita Pillow; la extensión no tiene dependencias) recorta los personajes,
  limpia el halo casi invisible del recorte de fondo, recorta los objetos, achica todo a WebP en `public/escenas/<id>/`
  y genera `src/core/scenes.gen.ts`. Con `--check` deja `_recortes.png` (recortes numerados) y `_vista.png` (pisos y
  objetos dibujados sobre el fondo). Una escena sin pisos se recorta pero no entra a la extensión.
- **Calibrador** (`python scripts/escenas.py --calibrar`, `scripts/calibrador.html`, solo en 127.0.0.1): clic en las
  esquinas de cada piso, contorno de los objetos, nombre y ancho de cada recorte, y "Probar" para ver el tamaño real sobre
  los pisos. "Guardar" escribe `escena.json` y regenera todo. Cómo pedir las imágenes: `05-escenas.md`.
- **Núcleo:** `core/scenes.ts` lee los datos generados. `core/board.ts` valida y ubica cada pieza en un piso de una escena
  (`Placement.scene`, sin `scene` = jardín; `Placement.floor`, sin `floor` = suelo principal; ambos viajan en la
  sincronización). Casi todo trabaja sobre una escena a la vez: `viewOf` muestra las piezas como están en esa escena
  (`Placed`, con su lugar o `null` = bandeja) y `withView` guarda la vista de vuelta. Una pieza ocupa 1 a 3 cuadritos a lo
  ancho y una fila de fondo; su alto sale del dibujo (`sw`, `sh` en anchos de cuadrito), así un gatito que se estira ocupa
  una celda pero se ve alto. No se gira, se voltea (`flip`). Hoy casi todas ocupan 1 cuadrito; el tambor, el cañón y el
  trono 2, el arco del teatro 3.
- **No ocupa lugar** (`capa`): alfombras, arco, farol y atril con libro (`detras`), macetero y atril para hablar (`delante`).
  Otros pueden ponerse en sus celdas; solo chocan con piezas de su misma capa. A la misma profundidad, las de `detras`
  se dibujan antes que todos y las de `delante` después; entre filas distintas sigue mandando la perspectiva, así el arco
  tapa solo a quienes están más atrás. Nadie se sube a ellas.
- **Uno encima de otro:** `Placement.on` = id de la pieza que lo sostiene (una sola por pieza, sin bucles). No ocupa celdas:
  se dibuja parado a la altura `encima` de la base, a su escala, y se mueve con ella; si la base va a la bandeja, también él.
- **Perspectiva:** cada piso se proyecta sobre el fondo con una homografía desde sus 4 esquinas (`core/perspective.ts`),
  así sirve igual para uno o dos puntos de fuga. Cada personaje se para cerca del borde delantero de sus celdas, con el
  ancho que esas celdas tienen a esa distancia, y todo (personajes y objetos) se dibuja de atrás hacia adelante según la
  fila donde toca el suelo. Un personaje sobre un piso elevado va justo después del objeto que lo sostiene.
  **El último dejado queda adelante:** a la misma profundidad (misma fila, mismo árbol, cuerda o perchero) manda el orden
  en que se dejaron (`Placement.z`, que también sincroniza); entre filas distintas sigue mandando la perspectiva.
- **Dibujo:** `shared/scene.ts` + `shared/board.ts` pintan la escena actual como SVG en una capa fija detrás de cada página
  (popup, bloqueo y ajustes), difuminada y con baja opacidad; de fondo llena la pantalla (`slice`), al editar se ve entera
  (`meet`) con la cuadrícula de cada piso.
- **Parpadeo:** los personajes con hoja `cerrados` (los del teatro) llevan encima un parche con sus ojos cerrados
  (`<id>-ojos.webp`, solo el rectángulo que cambia; `blink` = dónde va, en fracciones del dibujo). Lo muestra solo CSS
  (`base.css`): invisible casi todo el ciclo y visible un instante (~150 ms) al final; cada uno con su ritmo (35 a 55 s)
  y su desfase sacados de su id, y uno de cada tres parpadea dos veces seguidas. Sin temporizadores en JavaScript; con
  "reducir movimiento" no se anima. En la bandeja no parpadean.
- **Editor (álbum):** solo en ajustes, con selector de fondo. Pestañas por cada escena abierta y la bandeja de esa escena; mouse (clic en el dibujo para tomar, clic para
  dejar, clic derecho o R para voltear) y teclado (flechas, F para cambiar de piso, Enter, R, Supr para la bandeja, Esc).
  Los movimientos son un borrador de todas las escenas; "Guardar" manda la disposición de cada escena abierta al
  background (`saveBoard`, por id de escena), que lo valida entero con `core/` (o no aplica nada) y lo guarda y
  sincroniza. "Cancelar" descarta.
- Sin borrado ni pérdidas: cancelar o posponer no quita personajes. Las piezas de cuatro bloques de antes se convierten
  en gatitos del jardín al cargar o al sincronizar (mismo id, mismo gatito en todos los equipos).

## Sincronización entre equipos

- Usa `chrome.storage.sync`: gratis, viaja con la cuenta de Chrome de la persona y no pasa por servidores nuestros.
  Si la sincronización de Chrome está apagada, se comporta como almacenamiento local.
- Se comparte: ajustes (menos el propio switch), historial (los tiempos) y piezas con su posición.
  El estado del reloj (sesión en curso) queda en cada equipo.
- Se escribe solo cuando lo compartido cambia: al **guardar el tablero**, al **guardar ajustes** y al **terminar una sesión**
  (recompensa + historial). Mover piezas en el editor es un borrador local hasta tocar "Guardar".
- Mezcla (`core/sync.ts`): historial y piezas se unen (nada ganado se pierde); ajustes y posiciones siguen la edición más reciente
  (`stamps`). Si al mezclar ambos lados aportaron algo, el resultado se comparte como edición nueva y los equipos convergen.
- Solo escribe cuando este equipo trae algo nuevo (una edición más reciente, piezas o sesiones que la copia compartida
  no tiene): diferencias de forma, como otro equipo con una versión anterior, nunca provocan escrituras en bucle.
- Formato compacto (v3: cada pieza con sus lugares, uno por escena; lee también v1 y v2) en trozos de ≤ 8 KB
  (`compaz:meta` + `compaz:0..n`); el total queda muy por debajo de los 100 KB del navegador.
- El manifiesto lleva `key` para que el ID de la extensión sea el mismo en todos los equipos: sin eso, cada carpeta
  descomprimida recibe otro ID y Chrome no comparte sus datos. Al publicar en la Chrome Web Store se usa el ID de la tienda
  (quitar `key` o reemplazarla por la de la tienda).
- Solo sincroniza entre navegadores con la misma cuenta y el mismo sistema de sincronización: Chrome ↔ Chrome
  (o Edge ↔ Edge). Brave usa su propia cadena de sincronización, que no es la cuenta de Google, así que Chrome ↔ Brave no comparte.

## Herramientas de desarrollo

- Con la extensión cargada descomprimida (sin `update_url` en el manifiesto) están abiertas todas las escenas y la
  bandeja tiene una pieza de cada tipo (`withCatalog`, ids `dev-…`). Esas piezas no se sincronizan ni cuentan para
  abrir fondos. Ya no hay botón para completar sesiones.

## Datos

- `chrome.storage.local` para todo. Sin red, sin servidores de Compaz.
- `chrome.storage.sync` (opcional, activado por defecto, se apaga en ajustes) para compartir entre equipos; ver "Sincronización".
- Se guarda: configuración, estado actual, historial mínimo (sesiones completadas/canceladas por día) para el ajuste gradual,
  y las piezas ganadas con su posición. Datos anteriores al tablero reciben una pieza por cada sesión ya completada.
- El estado debe sobrevivir a que el service worker se duerma: todo tiempo se calcula desde timestamps guardados, nunca desde contadores en memoria.

## Bloqueo

- `declarativeNetRequest` con reglas dinámicas que redirigen a `blocked/`, guardando la URL original tras `#`.
- Se activan al entrar en `enfoque` (también en `espera`) y se quitan en `recreo`/`inactivo`.
- Las pestañas ya abiertas en un sitio bloqueado se mandan a la pantalla de bloqueo al empezar.
- Al terminar la sesión, la pantalla de bloqueo vuelve sola a la URL original.

## Ícono

- Gris: inactivo. Color: enfoque. Otro tono suave: recreo. Badge con minutos restantes y una "m" (p. ej. `12m`), que baja cada minuto.

## Avisos

- Fin de sesión, fin de recreo y recordatorio al posponer.
- Tocar un aviso abre el popup (`chrome.action.openPopup`, Chrome 127+).
  Si no se puede (versión anterior o sin ventana abierta), abre el mismo popup en una ventana pequeña.

## Comunicación con la etapa 2

- **Native Messaging** de Chrome: la app de escritorio registra un host nativo y la extensión
  intercambia mensajes JSON con ella.
- Se define desde ya un **protocolo de mensajes** versionado (`{ v: 1, type, payload }`) que `core/` emite y entiende,
  aunque en la etapa 1 nadie lo escuche.

## Permisos mínimos

- `storage`, `alarms`, `notifications` (avisos de fin de sesión, fin de recreo y recordatorio al posponer).
- `declarativeNetRequestWithHostAccess`: redirigir requiere acceso al sitio.
- `host_permissions` solo para los cuatro sitios iniciales. Para sitios nuevos se pide permiso
  (`optional_host_permissions`) al guardar en ajustes; si la persona lo niega, ese sitio no se bloquea.
- `nativeMessaging` se agrega recién en la etapa 2.
