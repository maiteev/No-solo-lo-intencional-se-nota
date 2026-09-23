// ============================================================================
// Dos realidades — Ejercicio 02 (DPPI 2026)
//
// Una misma cámara alimenta a dos sistemas de visión artificial independientes:
//
//   SISTEMA 1 (MediaPipe Hands — Polvo de Estrellas Magnético):
//     - Fondo negro absoluto con línea divisoria blanca vertical central.
//     - Gesto de dibujo: únicamente cuando el dedo índice está extendido
//       y los dedos medio, anular y meñique están cerrados (pulgar relajado).
//     - El dedo actúa como imán que arrastra una nube de motas de polvo rojo incandescente.
//     - Física de micro-órbita y flotación en gravedad cero (sensación viva y esponjosa).
//     - Densidad reactiva a la velocidad (rápido = disperso y fino; lento = concentrado y denso).
//     - Simetría especular bilateral global (reflejo exacto en la mitad opuesta).
//     - Final mágico: desmoronamiento cinético donde las partículas pierden cohesión
//       y el viento digital se las lleva hacia arriba mientras se disuelven en la oscuridad.
//
//   SISTEMA 2 (Visión OpenCV — Bordes Térmicos y Movimiento):
//     - Video base de la cámara en blanco y negro a brillo normal.
//     - Cuando no hay movimiento: imagen limpia en blanco y negro (sin bordes).
//     - Cuando hay movimiento: extracción de siluetas y bordes (operador Sobel).
//     - Colorimetría en escala térmica continua (Azul -> Cian -> Verde -> Amarillo -> Naranja -> Rojo).
//     - Efecto resplandor (glow) con persistencia temporal suave de 0.5 segundos.
// ============================================================================

// ---------------------------------------------------------------------------
// Configuración de MediaPipe Hands (CDN y modelos oficiales)
// ---------------------------------------------------------------------------

const VISION_BUNDLE_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs";
const WASM_BASE = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm";
const HAND_MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

// ---------------------------------------------------------------------------
// Referencias DOM
// ---------------------------------------------------------------------------

const video = document.getElementById("video");
const canvasA = document.getElementById("canvasA");
const ctxA = canvasA.getContext("2d");
const canvasB = document.getElementById("canvasB");
const ctxB = canvasB.getContext("2d");

const startBtn = document.getElementById("startBtn");
const cameraBtnWrapper = document.getElementById("cameraBtnWrapper");
const statusMsg = document.getElementById("statusMsg");
const idleHintA = document.getElementById("idleHintA");
const statA = document.getElementById("statA");
const statB = document.getElementById("statB");

// ---------------------------------------------------------------------------
// Estado general
// ---------------------------------------------------------------------------

let handLandmarker = null;
let running = false;
let lastVideoTime = -1;

// ---------------------------------------------------------------------------
// Escala Térmica Continua (Lookup Table precomputada de 256 niveles)
// ---------------------------------------------------------------------------

const THERMAL_STOPS = [
  { t: 0.00, r: 11,  g: 60,  b: 191 }, // Azul profundo / Índigo (#0b3cbf)
  { t: 0.20, r: 0,   g: 212, b: 255 }, // Cian / Celeste eléctrico (#00d4ff)
  { t: 0.40, r: 0,   g: 230, b: 118 }, // Verde lima / Esmeralda (#00e676)
  { t: 0.65, r: 255, g: 214, b: 0   }, // Amarillo brillante (#ffd600)
  { t: 0.85, r: 255, g: 109, b: 0   }, // Naranja fuego (#ff6d00)
  { t: 1.00, r: 255, g: 23,  b: 68  }, // Rojo neón / Carmesí (#ff1744)
];

const THERMAL_LUT = new Uint8Array(256 * 3);
for (let i = 0; i < 256; i++) {
  const norm = i / 255;
  let r = 255, g = 23, b = 68;
  for (let s = 0; s < THERMAL_STOPS.length - 1; s++) {
    const s1 = THERMAL_STOPS[s];
    const s2 = THERMAL_STOPS[s + 1];
    if (norm >= s1.t && norm <= s2.t) {
      const f = (norm - s1.t) / (s2.t - s1.t);
      r = Math.round(s1.r + f * (s2.r - s1.r));
      g = Math.round(s1.g + f * (s2.g - s1.g));
      b = Math.round(s1.b + f * (s2.b - s1.b));
      break;
    }
  }
  THERMAL_LUT[i * 3 + 0] = r;
  THERMAL_LUT[i * 3 + 1] = g;
  THERMAL_LUT[i * 3 + 2] = b;
}

// ---------------------------------------------------------------------------
// Arranque
// ---------------------------------------------------------------------------

startBtn.addEventListener("click", start);

async function start() {
  startBtn.disabled = true;

  setStatus("Solicitando acceso a la cámara…");
  try {
    await initCamera();
  } catch (err) {
    console.error(err);
    setStatus(
      "No se pudo acceder a la cámara: " +
        (err && err.message ? err.message : "revisa los permisos de cámara y vuelve a intentarlo."),
    );
    startBtn.disabled = false;
    return;
  }

  // El Sistema 2 no depende de CDN externo, así que arrancamos el ciclo de inmediato
  running = true;
  cameraBtnWrapper.classList.add("is-live");
  requestAnimationFrame(renderLoop);

  setStatus("Cámara activa. Cargando modelo MediaPipe Hands para Sistema 1…");
  try {
    await initHand();
    setStatus("Listo. Ambos sistemas están activos.");
  } catch (err) {
    console.error(err);
    setStatus(
      "El Sistema 2 (OpenCV) está activo. El Sistema 1 no pudo cargar MediaPipe Hands " +
        "(revisa tu conexión y recarga).",
    );
    idleHintA.textContent = "modelo no disponible";
  }
}

function setStatus(text) {
  statusMsg.textContent = text;
}

async function initCamera() {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user" },
    audio: false,
  });
  video.srcObject = stream;
  await video.play();

  await new Promise((resolve) => {
    if (video.readyState >= 2) return resolve();
    video.onloadedmetadata = () => resolve();
  });

  const w = video.videoWidth || 640;
  const h = video.videoHeight || 480;
  canvasA.width = w;
  canvasA.height = h;
  canvasB.width = w;
  canvasB.height = h;
}

async function initHand() {
  const { HandLandmarker, FilesetResolver } = await import(VISION_BUNDLE_URL);
  const vision = await FilesetResolver.forVisionTasks(WASM_BASE);
  try {
    handLandmarker = await HandLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: HAND_MODEL_URL, delegate: "GPU" },
      runningMode: "VIDEO",
      numHands: 1,
    });
  } catch (err) {
    console.warn("Fallo con delegate GPU, reintentando con CPU…", err);
    handLandmarker = await HandLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: HAND_MODEL_URL, delegate: "CPU" },
      runningMode: "VIDEO",
      numHands: 1,
    });
  }
}

// ---------------------------------------------------------------------------
// Ciclo principal
// ---------------------------------------------------------------------------

function renderLoop(timestampMs) {
  if (!running) return;

  if (video.currentTime !== lastVideoTime) {
    lastVideoTime = video.currentTime;

    // Inferencia de MediaPipe Hands para Sistema 1
    const result = handLandmarker ? handLandmarker.detectForVideo(video, timestampMs) : null;
    drawSystemA(result);

    // Procesamiento visual para Sistema 2
    drawSystemB();
  }

  requestAnimationFrame(renderLoop);
}

// ---------------------------------------------------------------------------
// SISTEMA 1 — Polvo de Estrellas Magnético (MediaPipe Hands)
// ---------------------------------------------------------------------------

const DUST_COLORS = [
  "rgba(255, 23, 68, ",   // Rojo carmesí neón
  "rgba(255, 61, 0, ",    // Rojo fuego / bermellón
  "rgba(255, 82, 82, ",   // Coral ardiente
  "rgba(245, 0, 87, ",    // Rubí magenta
  "rgba(255, 225, 230, ", // Chispa blanca-rosada estelar
];

let dustParticlesA = []; // Array de motas: { x, y, anchorX, anchorY, vx, vy, radius, colorIdx, swirlRadius, swirlSpeed, phase, birth, isCrumbling, crumbleTime }
let prevPointA = null;
let smoothSpeedA = 0;
const MAX_DUST = 2400;   // Límite óptimo para 60 FPS fluidos

function isIndexPointingGesture(landmarks) {
  if (!landmarks || landmarks.length < 21) return false;

  const wrist = landmarks[0];
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

  // Índice: Landmark 8 (punta) extendido respecto a Landmark 6 (PIP)
  const dIndexTip = dist(landmarks[8], wrist);
  const dIndexPip = dist(landmarks[6], wrist);
  const indexExtended = dIndexTip > dIndexPip * 1.18;

  // Medio: Landmark 12 (punta) doblado respecto a Landmark 10 (PIP)
  const dMidTip = dist(landmarks[12], wrist);
  const dMidPip = dist(landmarks[10], wrist);
  const midFolded = dMidTip < dMidPip * 1.15;

  // Anular: Landmark 16 (punta) doblado respecto a Landmark 14 (PIP)
  const dRingTip = dist(landmarks[16], wrist);
  const dRingPip = dist(landmarks[14], wrist);
  const ringFolded = dRingTip < dRingPip * 1.15;

  // Meñique: Landmark 20 (punta) doblado respecto a Landmark 18 (PIP)
  const dPinkyTip = dist(landmarks[20], wrist);
  const dPinkyPip = dist(landmarks[18], wrist);
  const pinkyFolded = dPinkyTip < dPinkyPip * 1.15;

  // Pulgar relajado (no se evalúa estrictamente para comodidad del usuario)
  return indexExtended && midFolded && ringFolded && pinkyFolded;
}

function drawSystemA(result) {
  const w = canvasA.width;
  const h = canvasA.height;
  const now = performance.now();

  // 1. Fondo negro absoluto
  ctxA.fillStyle = "#000000";
  ctxA.fillRect(0, 0, w, h);

  // 2. Línea divisoria central blanca vertical
  ctxA.strokeStyle = "rgba(255, 255, 255, 0.85)";
  ctxA.lineWidth = 1.5;
  ctxA.beginPath();
  ctxA.moveTo(w / 2, 0);
  ctxA.lineTo(w / 2, h);
  ctxA.stroke();

  const handLandmarks = result && result.landmarks && result.landmarks[0];
  let currX = 0, currY = 0;
  let hasHand = false;
  let isDrawing = false;

  if (!handLandmarks) {
    idleHintA.style.opacity = "1";
    statA.textContent = "sin mano detectada";
    if (prevPointA) {
      // Al perder la mano, desmoronar todas las motas ancladas
      triggerCrumble(now);
      prevPointA = null;
    }
  } else {
    idleHintA.style.opacity = "0";
    hasHand = true;

    isDrawing = isIndexPointingGesture(handLandmarks);
    const tip = handLandmarks[8];
    currX = tip.x * w;
    currY = tip.y * h;

    if (isDrawing) {
      statA.textContent = "dibujando (polvo magnético activo)";

      if (prevPointA) {
        const dt = Math.max(1, now - prevPointA.time);
        const dist = Math.hypot(currX - prevPointA.x, currY - prevPointA.y);
        const instantSpeed = dist / dt; // px/ms

        // Velocidad suavizada
        smoothSpeedA = smoothSpeedA * 0.75 + instantSpeed * 0.25;

        // Densidad y dispersión reactivas a la velocidad:
        // Rápido -> menos partículas, nube estrecha
        // Lento / Pausa -> muchas partículas, nube ancha y densa
        const countPerStep = Math.max(2, Math.round(9 - smoothSpeedA * 3.2));
        const spreadRadius = Math.max(3.5, 12.5 - smoothSpeedA * 3.6);

        // Interpolación para no dejar vacíos entre fotogramas
        const steps = Math.max(1, Math.floor(dist / 3.5));

        for (let s = 0; s < steps; s++) {
          const t = s / steps;
          const ix = prevPointA.x + (currX - prevPointA.x) * t;
          const iy = prevPointA.y + (currY - prevPointA.y) * t;

          for (let k = 0; k < countPerStep; k++) {
            if (dustParticlesA.length >= MAX_DUST) break;

            const angle = Math.random() * Math.PI * 2;
            const r = Math.pow(Math.random(), 0.75) * spreadRadius;
            const ax = ix + Math.cos(angle) * r;
            const ay = iy + Math.sin(angle) * r;

            dustParticlesA.push({
              x: ax,
              y: ay,
              anchorX: ax,
              anchorY: ay,
              vx: (Math.random() - 0.5) * 0.35,
              vy: (Math.random() - 0.5) * 0.35,
              radius: 1.0 + Math.random() * 1.7,
              colorIdx: Math.random() < 0.1 ? 4 : Math.floor(Math.random() * 4),
              swirlRadius: 1.5 + Math.random() * 4.5,
              swirlSpeed: 0.002 + Math.random() * 0.003,
              phase: Math.random() * Math.PI * 2,
              birth: now,
              isCrumbling: false,
              crumbleTime: null,
            });
          }
        }
      }
      prevPointA = { x: currX, y: currY, time: now };
    } else {
      statA.textContent = "mano lista (extiende el índice)";
      if (prevPointA) {
        // Al terminar el gesto de dibujo, la figura se desmorona
        triggerCrumble(now);
        prevPointA = null;
      }
    }
  }

  // 3. Desmoronar naturalmente las partículas que superen 1.8 segundos de antigüedad
  for (let i = 0; i < dustParticlesA.length; i++) {
    const p = dustParticlesA[i];
    if (!p.isCrumbling && now - p.birth > 1800) {
      p.isCrumbling = true;
      p.crumbleTime = now;
    }
  }

  // 4. Actualizar físicas y renderizar nube de partículas en Canvas 2D
  dustParticlesA = dustParticlesA.filter((p) => {
    if (p.isCrumbling) {
      return (now - p.crumbleTime) <= 1400; // Desmoronamiento dura 1.4s
    }
    return (now - p.birth) <= 2500;
  });

  for (let i = 0; i < dustParticlesA.length; i++) {
    const p = dustParticlesA[i];
    let alpha = 1.0;

    if (!p.isCrumbling) {
      // Fase 1: Gravedad cero y flotación acuática ("sensación esponjosa")
      p.x = p.anchorX + Math.cos(p.phase + now * p.swirlSpeed) * p.swirlRadius;
      p.y = p.anchorY + Math.sin(p.phase + now * p.swirlSpeed) * p.swirlRadius;
      alpha = 0.85 + Math.sin(p.phase + now * 0.004) * 0.15;
    } else {
      // Fase 2: Desmoronamiento — Viento digital ascendente con turbulencia lateral
      const crumbleAge = now - p.crumbleTime;
      const progress = crumbleAge / 1400; // de 0 a 1

      // Brisa ascendente suave + ondulación lateral
      p.vy -= 0.038;
      p.vx += Math.sin(p.y * 0.03 + now * 0.003) * 0.08;
      p.vx *= 0.98;
      p.vy *= 0.98;

      p.x += p.vx;
      p.y += p.vy;

      alpha = Math.max(0, (1 - progress) * (0.9 + Math.sin(p.phase + now * 0.01) * 0.1));
    }

    if (alpha <= 0.01) continue;

    ctxA.fillStyle = `${DUST_COLORS[p.colorIdx]}${alpha.toFixed(3)})`;

    // Renderizar mota real
    ctxA.beginPath();
    ctxA.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
    ctxA.fill();

    // Renderizar mota reflejada simétricamente
    ctxA.beginPath();
    ctxA.arc(w - p.x, p.y, p.radius, 0, Math.PI * 2);
    ctxA.fill();
  }

  // 5. Cursor visual: El Imán de Polvo Estelar
  if (hasHand) {
    drawMagneticCursor(ctxA, currX, currY, isDrawing, w, smoothSpeedA);
  }
}

function triggerCrumble(now) {
  for (let i = 0; i < dustParticlesA.length; i++) {
    if (!dustParticlesA[i].isCrumbling) {
      dustParticlesA[i].isCrumbling = true;
      dustParticlesA[i].crumbleTime = now;
    }
  }
}

function drawMagneticCursor(ctx, x, y, isDrawing, w, speed) {
  const mx = w - x;
  if (isDrawing) {
    // Halo magnético suave
    const magRadius = Math.max(8, 16 - speed * 3.5);
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, magRadius, 0, Math.PI * 2);
    ctx.arc(mx, y, magRadius, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255, 23, 68, 0.25)";
    ctx.fill();

    // Centro del imán incandescente
    ctx.beginPath();
    ctx.arc(x, y, 3.5, 0, Math.PI * 2);
    ctx.arc(mx, y, 3.5, 0, Math.PI * 2);
    ctx.fillStyle = "#ffffff";
    ctx.shadowColor = "#ff1744";
    ctx.shadowBlur = 10;
    ctx.fill();
    ctx.restore();
  } else {
    // Cursor pasivo: anillo sutil blanco
    ctx.strokeStyle = "rgba(255, 255, 255, 0.45)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(mx, y, 4, 0, Math.PI * 2);
    ctx.stroke();
  }
}

// ---------------------------------------------------------------------------
// SISTEMA 2 — Bordes Térmicos y Movimiento (Visión OpenCV)
// ---------------------------------------------------------------------------

// Dimensiones de análisis para garantizar 60 FPS estables
const SW = 320;
const SH = 240;

const sampleCanvas = document.createElement("canvas");
sampleCanvas.width = SW;
sampleCanvas.height = SH;
const sampleCtx = sampleCanvas.getContext("2d", { willReadFrequently: true });

const edgeCanvas = document.createElement("canvas");
edgeCanvas.width = SW;
edgeCanvas.height = SH;
const edgeCtx = edgeCanvas.getContext("2d");
const edgeImgData = edgeCtx.createImageData(SW, SH);
const edgePixels = edgeImgData.data;

let prevLumaB = new Float32Array(SW * SH);
let currLumaB = new Float32Array(SW * SH);
let hasPrevLuma = false;

// Buffer de glow con persistencia temporal
let glowCanvas = null;
let glowCtx = null;

function drawSystemB() {
  const w = canvasB.width;
  const h = canvasB.height;

  if (!glowCanvas || glowCanvas.width !== w || glowCanvas.height !== h) {
    glowCanvas = document.createElement("canvas");
    glowCanvas.width = w;
    glowCanvas.height = h;
    glowCtx = glowCanvas.getContext("2d");
  }

  // 1. Dibujar video base en blanco y negro a brillo normal
  ctxB.save();
  ctxB.filter = "grayscale(100%)";
  ctxB.drawImage(video, 0, 0, w, h);
  ctxB.restore();

  // 2. Muestreo de fotograma para extracción matemática de bordes y movimiento
  sampleCtx.drawImage(video, 0, 0, SW, SH);
  const frameData = sampleCtx.getImageData(0, 0, SW, SH).data;

  for (let i = 0; i < SW * SH; i++) {
    const px = i * 4;
    currLumaB[i] = 0.299 * frameData[px] + 0.587 * frameData[px + 1] + 0.114 * frameData[px + 2];
  }

  if (!hasPrevLuma) {
    prevLumaB.set(currLumaB);
    hasPrevLuma = true;
    return;
  }

  // 3. Limpiar buffer de píxeles activos
  edgePixels.fill(0);

  let activeEdgeCount = 0;

  // 4. Convolución Sobel 3x3 + Detección de movimiento
  for (let y = 1; y < SH - 1; y++) {
    const rowOffset = y * SW;
    for (let x = 1; x < SW - 1; x++) {
      const idx = rowOffset + x;

      // Variación temporal de luminancia
      const diff = Math.abs(currLumaB[idx] - prevLumaB[idx]);

      if (diff > 8) { // Umbral de movimiento
        const p00 = currLumaB[idx - SW - 1], p01 = currLumaB[idx - SW], p02 = currLumaB[idx - SW + 1];
        const p10 = currLumaB[idx - 1],                                  p12 = currLumaB[idx + 1];
        const p20 = currLumaB[idx + SW - 1], p21 = currLumaB[idx + SW], p22 = currLumaB[idx + SW + 1];

        const gx = (p02 + 2 * p12 + p22) - (p00 + 2 * p10 + p20);
        const gy = (p20 + 2 * p21 + p22) - (p00 + 2 * p01 + p02);
        const edgeMag = Math.abs(gx) + Math.abs(gy);

        if (edgeMag > 36) { // Umbral de borde / silueta
          activeEdgeCount++;

          // Mapeo continuo en la escala térmica según intensidad
          const normMotion = Math.min(1.0, Math.max(0, (diff - 8) / 36));
          const lutIdx = Math.floor(normMotion * 255) * 3;

          const pxIdx = idx * 4;
          edgePixels[pxIdx + 0] = THERMAL_LUT[lutIdx + 0];
          edgePixels[pxIdx + 1] = THERMAL_LUT[lutIdx + 1];
          edgePixels[pxIdx + 2] = THERMAL_LUT[lutIdx + 2];
          edgePixels[pxIdx + 3] = 255;
        }
      }
    }
  }

  prevLumaB.set(currLumaB);

  // 5. Decaimiento del Glow en 0.5 segundos (~30 frames a 60 FPS)
  glowCtx.globalCompositeOperation = "destination-out";
  glowCtx.fillStyle = "rgba(0, 0, 0, 0.14)";
  glowCtx.fillRect(0, 0, w, h);

  // 6. Inyectar bordes recién activados en el buffer de glow
  edgeCtx.putImageData(edgeImgData, 0, 0);
  glowCtx.globalCompositeOperation = "source-over";
  glowCtx.drawImage(edgeCanvas, 0, 0, w, h);

  // 7. Renderizado del Glow sobre el fondo B&W
  // Halo difuminado (bloom)
  ctxB.save();
  ctxB.filter = "blur(8px)";
  ctxB.globalCompositeOperation = "screen";
  ctxB.drawImage(glowCanvas, 0, 0);
  ctxB.restore();

  // Borde nítido
  ctxB.save();
  ctxB.globalCompositeOperation = "screen";
  ctxB.drawImage(glowCanvas, 0, 0);
  ctxB.restore();

  // 8. Actualizar métrica
  if (activeEdgeCount > 25) {
    statB.textContent = "movimiento detectado (bordes activos)";
  } else {
    statB.textContent = "escena estática (sin bordes)";
  }
}
