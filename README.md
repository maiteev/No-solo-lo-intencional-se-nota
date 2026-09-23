# Dos realidades

Ejercicio 02 del curso (DPPI 2026), sobre visión artificial y representación. La idea es tomar una sola cámara y usarla para armar dos maneras completamente distintas de "ver" e interactuar con lo mismo.

**Demo:**  https://maiteev.github.io/No-solo-lo-intencional-se-nota/

**Repo:** https://github.com/maiteev/No-solo-lo-intencional-se-nota

## De qué se trata

Hay dos sistemas corriendo al mismo tiempo, alimentados por la misma cámara web:

**Sistema 1 — Polvo de Estrellas Magnético (MediaPipe Hands).**  
Aísla la intención del cuerpo humano a través de un gesto manual específico: el sistema únicamente dibuja cuando el **dedo índice está extendido** y los demás dedos (medio, anular y meñique) permanecen cerrados, con el pulgar relajado. En la punta del índice nace un **imán que arrastra miles de pequeñas motas de polvo rojo incandescente** en tonos carmesí, rubí y destellos estelares. Las partículas se mantienen en **flotación y micro-órbita fluida en gravedad cero**, logrando que el trazo se sienta esponjoso, suave y vivo. La densidad responde a la velocidad: movimientos rápidos generan una nube fina y dispersa, mientras que movimientos lentos concentran una masa densa y brillante. El espacio está dividido por una **línea vertical blanca central** con **simetría especular bilateral global**. Al finalizar la interacción o alcanzar los 1.8 segundos, las partículas pierden cohesión y la figura se **desmorona como polvo que se lleva un viento digital ascendente** hasta desvanecerse en el vacío.

**Sistema 2 — Bordes Térmicos (Visión OpenCV).**  
Observa el espacio físico completo en video en **blanco y negro a brillo normal**. Mientras la escena permanece estática, no se dibuja ninguna línea artificial, mostrando la realidad monocromática limpia. Sin embargo, en cuanto una persona, parte del cuerpo o cualquier objeto se mueve, el sistema detecta sus **siluetas y bordes** mediante convolución espacial (operador Sobel) y los ilumina en una **escala cromática térmica continua** basada en la intensidad de la velocidad:
* *Movimiento sutil:* Azul profundo e Índigo.
* *Movimiento lento:* Cian y Celeste eléctrico.
* *Movimiento moderado:* Verde lima y Esmeralda.
* *Movimiento ágil:* Amarillo brillante.
* *Movimiento rápido:* Naranja fuego.
* *Movimiento brusco / Máximo:* Rojo neón y Carmesí.

Al frenar o detenerse, los bordes coloreados no desaparecen en seco: dejan un **resplandor (*glow*) fosforescente** que se apaga suavemente durante **medio segundo (0.5 s)**.

## Cómo probarlo

El archivo `index.html` utiliza módulos nativos de JavaScript y llamadas de visión artificial. Para ejecutarlo localmente sin bloqueos de CORS, levanta un servidor local en la carpeta del proyecto:

```bash
python -m http.server 8000
```

Luego abre en el navegador:
`http://localhost:8000`

Acepta los permisos de cámara web y presiona el botón **"Cámara"**.

## Reflexión

Frente a la cámara ocurre una sola escena, pero cada lado de la pantalla extrae una verdad totalmente distinta sobre la tensión entre lo voluntario y lo involuntario de nuestro cuerpo.

Por un lado, se responde a lo voluntario: aísla la intención de la mente a través de un gesto consciente, reconociendo solamente el dedo índice para transformar el espacio en un lienzo interactivo. Aquí la máquina nos trata como creadores de significado, personas capaces de usar su cuerpo de forma libre y ordenada para comunicarse, diseñar formas o simplemente jugar.

Por el otro, se expone lo involuntario: nos muestra como materia viva, un cuerpo biológico que emite calor, se mueve de forma caótica y jamás se puede quedar quieto. Aunque intentemos no movernos, el sistema delata la energía con sus micro-movimientos que se escapan por completo de nuestro control, donde demuestra que siempre seremos seres en constante movimiento.
## Tecnologías

* **MediaPipe Hand Landmarker** (cargado dinámicamente vía CDN desde `@mediapipe/tasks-vision`) con aceleración por GPU (WebGL) y fallback a CPU.
* **Procesamiento de imagen matricial tipo OpenCV** (convolución Sobel 3x3, diferencia temporal de luminancia, mapas LUT térmicos y buffers de glow con *bloom*).
* **HTML5 Canvas 2D & Vanilla JavaScript**, sin frameworks pesados ni etapas de build.

---
Felipe · Ejercicio 02 — Dos realidades · DPPI 2026 · Escuela de Diseño UDP
