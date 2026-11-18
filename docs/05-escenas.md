# Escenas: cómo pedir y preparar las imágenes

Guía para sumar fondos y personajes que queden bien en perspectiva. El cómo está construido
vive en `03-solucion.md` ("Escenas y personajes").

## Qué entregar

Una carpeta por escena en `img/escenas/<nombre>/`:

- `fondo.png`: la ilustración.
- Una o más hojas de personajes en PNG transparente (cualquier nombre, por ejemplo `pajaritos1.png`).

Luego `python scripts/escenas.py --calibrar` abre el calibrador y el resto se hace con clics.

## Fondos

- 16:9, de al menos 1672 × 941.
- Una sola perspectiva: cámara un poco elevada, mirando de frente.
- Una zona grande de suelo despejada al centro.
- Superficies planas y claras donde pueda pararse alguien (tarimas, bancos, repisas, trapecios), sin cosas encima.
- Mismo estilo pixel-art y luz que sus personajes.

## Hojas de personajes

- Fondo transparente real (PNG con alfa), no un cuadriculado gris dibujado.
- Cuadrícula de 4 × 4 casillas iguales, un personaje por casilla, con espacio de sobra entre ellos: nunca se tocan.
- Todos a la misma escala dentro de la hoja, de cuerpo entero, sin cortar.
- Apoyados en el borde de abajo de su casilla, como parados en el suelo.
- Mirando hacia la derecha (la extensión los voltea).
- Sin sombra en el suelo. Siluetas claras que se lean en chico.

### Prompt de ejemplo

> Hoja de personajes pixel-art, fondo transparente real (PNG con alfa). Cuadrícula de 4 × 4 casillas iguales,
> un personaje por casilla, separados con margen amplio, sin tocarse. Todos a la misma escala, cuerpo completo,
> apoyados en el borde inferior de su casilla, mirando a la derecha, sin sombra en el suelo.
> Estilo y luz iguales a [describe el fondo]. Personajes: [lista].

### Hojas sobre pergamino

Si la hoja viene con fondo de pergamino, marco y figuras juntas, en `escena.json` se marca con `"papel": true` y el
script borra el pergamino. Revisa `_recortes.png`. Si quedan puntos del fondo, retócalos ahí mismo pintándolos del verde
del fondo, o repíntalos con su color. Luego pídele a la IA que pase los retoques a la hoja: queda transparente y el
original se guarda en `originales/`.

### Personajes que parpadean

Se pide una segunda hoja igual con los ojos cerrados y se pone en la hoja abierta como `"cerrados": "cerrados.png"`.
No se genera de nuevo: se edita la hoja abierta con una herramienta que cambie solo una zona (inpainting), así todo lo
demás queda idéntico y solo se guardan los ojos (un parche chiquito por personaje).

> Cierra los ojos de todos los personajes, como si estuvieran parpadeando: una línea curva suave del mismo color del
> contorno. No cambies nada más: misma pose, mismos colores, mismo tamaño y posición, mismo fondo.

Mismo tamaño en píxeles que la hoja abierta, sin recortar ni mover nada. Si la hoja cerrada se redibuja entera, el
parche termina siendo el personaje completo: pesa más y en cada parpadeo se nota un saltito.

## En el calibrador

1. **Escena:** nombre, orden, con cuántos personajes ganados se abre y, por hoja, la `celda` (cuántos píxeles de la hoja mide un cuadrito; más grande = personajes más chicos).
2. **Pisos:** "+ Punto" y un clic para un lugar de 1 cuadrito (gancho, nudo, barra; marca "colgar" si algo puede colgar de ahí).
   Arrastra su línea punteada hasta donde su objeto toca el suelo: así toma el tamaño de la malla a esa profundidad.
   Si su objeto se apoya en otro piso (una cuerda sobre una plataforma), elige ese piso y toma su mismo tamaño.
   "+ Piso nuevo" y clic en las 4 esquinas (fondo-izquierda, fondo-derecha, frente-derecha, frente-izquierda).
   El primero es el suelo principal. Ajusta columnas y filas; "Bloquear" marca celdas ocupadas por el decorado.
3. **Objetos:** contorno de lo que debe tapar a los personajes de atrás (bancos, arbustos del frente) y su línea de base.
   Un piso que está encima de un objeto se marca con "objeto" para que quien se sube se dibuje sobre él.
4. **Personajes:** marca "usar", ponle nombre y ancho (1 a 3 cuadritos). "objeto" si es una cosa (cuenta así en el
   sorteo de premios); "capa" detrás o delante si no ocupa lugar (alfombra, arco; macetero). "encima" (0 = borde de arriba de su dibujo)
   si otro puede pararse sobre él; "cuelga" si cuelga de sus patitas en los lugares para colgar; "escala" si en la hoja
   quedó más grande o más chico que los demás (con "Probar" lo comparas). "Probar" lo muestra sobre los pisos con su tamaño real.
5. **Guardar y regenerar:** escribe `escena.json`, recorta y achica todo y regenera los datos. Recarga la extensión para verlo.
