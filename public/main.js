// ==========================================
// SECCIÓN 0: IMPORTACIONES (ES MODULES) Y VARIABLES GLOBALES
// ==========================================
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

const sfxPensando = new Audio('https://firebasestorage.googleapis.com/v0/b/avatar-ia-84a80.firebasestorage.app/o/Moldels%2Frobot%20pensando.MP3?alt=media&token=c2aad6d4-579f-4801-8b87-07010baa129b');
sfxPensando.loop = true;
sfxPensando.volume = 0.4;

function generarNuevoId() {
    return 'totem_user_' + Math.random().toString(36).substring(2, 11);
}

let userId = generarNuevoId();
let temporizadorInactividad;
let attractTimer;
const TIEMPO_ESPERA_MS = 45000;
const TIEMPO_ATTRACT_MS = 20000;

// --- Configuración Dinámica desde el Panel de Administrador (/admin.html) ---
let totemConfig = {
    mostrarSubtitulos: false,
    mostrarHudEstado: true,
    modoAttractLoop: true,
    coloresDinamicos: true
};

// --- Variables 3D ---
let scene, camera, renderer, model, composer, bloomPass;
let clock = new THREE.Clock();
let emissiveMaterials = [];
let eyeMaterials = [];
let mouthMaterials = [];

// --- Variables de Animación, Parpadeo y Estados ---
let iaPensando = false;
let avatarHablando = false;
let enAttractLoop = false;
let nextBlinkTime = 3.0;
let blinkEndTime = 0;

// Paleta de colores por estado (Diferenciación Cromática)
const COLOR_IDLE = new THREE.Color(0x10b981);      // Verde Jungle tranquilo
const COLOR_LISTENING = new THREE.Color(0x00e5ff); // Cian reactivo al escuchar al usuario
const COLOR_THINKING = new THREE.Color(0xf59e0b);  // Ámbar/Naranja de cómputo
const COLOR_SPEAKING = new THREE.Color(0xff1e00);  // Rojo/Lava energética al hablar
const COLOR_CLASSIC_RED = new THREE.Color(0xff0000);

// Interpoladores (LERP) para movimientos fluidos
let currentRotationX = 0;
let targetRotationX = 0;
let currentRotationY = 0;
let targetRotationY = 0;
const LERP_ROTATION = 0.06;
const LERP_LIGHT = 0.18;
const LERP_COLOR = 0.08;

const MODEL_PATH = 'https://firebasestorage.googleapis.com/v0/b/avatar-ia-84a80.firebasestorage.app/o/Moldels%2Favatar-ia.glb?alt=media&token=e6e64cf6-f39c-487d-9344-26ac71956d0c';

// --- Variables de Audio VAD/WebSockets ---
let audioContext, analyser, reproductorAnalyser, microphone, globalStream, mediaRecorder;
let isUserSpeaking = false;
let currentMicVolume = 0;
let silenceTimer = null;
let fallbackSpeechTimer = null;
let isCalibrating = false;
let monitoreandoActivo = false; // Evita loops duplicados de requestAnimationFrame
let ignorarMicHasta = 0;        // Ventana de enfriamiento post-habla para evitar eco de los parlantes
let ultimoTextoEnviado = "";
let ultimoEnvioTimestamp = 0;
let baseNoiseFloor = 0;
let dynamicVolumeThreshold = 12;
const SIGNAL_TO_NOISE_MARGIN = 7;
const MAX_VOLUME_THRESHOLD = 35; // Tope máximo para que un ruido fuerte en calibración no deje sordo al tótem
const SILENCE_DURATION = 750;
let deepgramSocket, keepAliveInterval;
let transcripcionAcumulada = "";
let transcripcionInterina = "";
let enviandoACerebro = false;
let dataArrayPlayback;

// --- Referencias DOM (HUD y Subtítulos) ---
const hudElement = document.getElementById('totem-hud');
const hudDot = document.getElementById('hud-dot');
const hudStatusText = document.getElementById('hud-status-text');
const hudMeterBar = document.getElementById('hud-meter-bar');
const subtitlesContainer = document.getElementById('subtitles-container');
const subtitleUserEl = document.getElementById('subtitle-user');
const subtitleAiEl = document.getElementById('subtitle-ai');
const attractBanner = document.getElementById('attract-banner');

// ==========================================
// SECCIÓN 0.5: SINCRONIZACIÓN CON PANEL DE ADMINISTRADOR
// ==========================================

async function sincronizarConfigAdmin() {
    try {
        // Primero revisamos si hay cambios locales inmediatos en el mismo navegador
        const localRaw = localStorage.getItem('jungle_totem_config');
        if (localRaw) {
            const parsed = JSON.parse(localRaw);
            totemConfig = { ...totemConfig, ...parsed };
        }
        // Luego consultamos Firestore vía /api/config
        const res = await fetch('/api/config');
        if (res.ok) {
            const remoteConfig = await res.json();
            totemConfig = { ...totemConfig, ...remoteConfig };
        }
    } catch (err) {
        // Fallback silencioso a configuración actual
    }
    aplicarConfigVisual();
}

function aplicarConfigVisual() {
    if (subtitlesContainer) {
        subtitlesContainer.style.display = totemConfig.mostrarSubtitulos ? 'flex' : 'none';
    }
    if (hudElement) {
        hudElement.style.display = totemConfig.mostrarHudEstado ? 'flex' : 'none';
    }
    if (!totemConfig.modoAttractLoop && attractBanner) {
        attractBanner.classList.remove('visible');
        enAttractLoop = false;
    }
}

// Escuchar cambios en vivo si el admin está abierto en otra pestaña del mismo equipo
window.addEventListener('storage', (e) => {
    if (e.key === 'jungle_totem_config' && e.newValue) {
        try {
            totemConfig = { ...totemConfig, ...JSON.parse(e.newValue) };
            aplicarConfigVisual();
        } catch (_) {}
    }
});

function actualizarHUD(estado, texto, colorHex, porcentajeBarra = 0) {
    if (!hudElement) return;
    hudElement.style.opacity = '1';
    if (hudStatusText) hudStatusText.innerText = texto;
    if (hudDot) {
        hudDot.style.background = colorHex;
        hudDot.style.boxShadow = `0 0 12px ${colorHex}`;
    }
    if (hudMeterBar) {
        hudMeterBar.style.background = colorHex;
        hudMeterBar.style.width = `${Math.min(100, Math.max(0, porcentajeBarra))}%`;
    }
}

function mostrarSubtituloUsuario(texto) {
    if (!subtitleUserEl) return;
    if (!texto || texto.trim() === "") {
        subtitleUserEl.style.display = 'none';
        subtitleUserEl.innerText = '';
    } else {
        subtitleUserEl.style.display = 'inline-block';
        subtitleUserEl.innerText = `🎙️ "${texto.trim()}"`;
    }
}

function mostrarSubtituloIA(texto) {
    if (!subtitleAiEl) return;
    if (!texto || texto.trim() === "") {
        subtitleAiEl.style.display = 'none';
        subtitleAiEl.innerText = '';
    } else {
        subtitleAiEl.style.display = 'inline-block';
        subtitleAiEl.innerText = `🤖 ${texto.trim()}`;
    }
}

function programarAttractLoop() {
    clearTimeout(attractTimer);
    enAttractLoop = false;
    if (attractBanner) attractBanner.classList.remove('visible');

    attractTimer = setTimeout(() => {
        if (!isUserSpeaking && !iaPensando && !avatarHablando && totemConfig.modoAttractLoop) {
            enAttractLoop = true;
            if (attractBanner) attractBanner.classList.add('visible');
        }
    }, TIEMPO_ATTRACT_MS);
}

// ==========================================
// SECCIÓN 1: MOTOR GRÁFICO (NÚCLEO RADIACTIVO CONTENIDO)
// ==========================================

function initThreeJS() {
    console.log("⚙️ SECCIÓN 1: Inicializando Motor Three.js Moderno - HDR Dinámico...");
    const container = document.getElementById('threejs-container');

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x05080c);

    camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 0, 3.8);

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setClearColor(0x000000, 1);

    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    container.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0xffffff, 1.1));
    const directionalLight = new THREE.DirectionalLight(0xffffff, 2.5);
    directionalLight.position.set(0, 2, 5);
    scene.add(directionalLight);

    const fillLight = new THREE.DirectionalLight(0xddddff, 0.9);
    fillLight.position.set(-5, 3, -5);
    scene.add(fillLight);

    bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 2.2, 1.2, 0.82);

    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    composer.addPass(bloomPass);

    window.addEventListener('resize', onWindowResize, false);
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    if (composer) composer.setSize(window.innerWidth, window.innerHeight);
}

// ==========================================
// SECCIÓN 2: CARGADOR DE MODELO (TEXTURAS + PROGRESO + OJOS/BOCA SEPARADOS)
// ==========================================

function loadModel() {
    console.log("⚙️ SECCIÓN 2: Cargando Modelo 3D...");
    const loader = new GLTFLoader();
    loader.setCrossOrigin('anonymous');

    const loadingBox = document.getElementById('loading-box');
    const progressBar = document.getElementById('progress-bar');
    const loadingText = document.getElementById('loading-text');
    if (loadingBox) loadingBox.style.display = 'flex';

    loader.load(
        MODEL_PATH,
        (gltf) => {
            model = gltf.scene;
            model.scale.set(1.3, 1.3, 1.3);
            model.position.set(0, -0.8, 0);
            emissiveMaterials = [];
            eyeMaterials = [];
            mouthMaterials = [];

            model.traverse((child) => {
                if (child.isMesh && child.material) {
                    const materials = Array.isArray(child.material) ? child.material : [child.material];
                    const meshName = child.name.toLowerCase();

                    materials.forEach((origMat) => {
                        const matName = (origMat.name || '').toLowerCase();
                        const fullName = `${meshName} ${matName}`;

                        if (fullName.includes('ojo') || fullName.includes('eye') || fullName.includes('boca') || fullName.includes('mouth')) {
                            // Clonamos el material para que ojos y boca puedan tener intensidades independientes
                            const mat = origMat.clone();
                            child.material = mat;

                            mat.color.setHex(0x000000);
                            mat.emissive.copy(totemConfig.coloresDinamicos ? COLOR_IDLE : COLOR_CLASSIC_RED);
                            mat.emissiveIntensity = 2.0;
                            mat.metalness = 0.0;
                            mat.roughness = 1.0;
                            mat.userData.targetIntensity = 2.0;
                            mat.userData.targetColor = (totemConfig.coloresDinamicos ? COLOR_IDLE : COLOR_CLASSIC_RED).clone();

                            emissiveMaterials.push(mat);

                            if (fullName.includes('ojo') || fullName.includes('eye')) {
                                eyeMaterials.push(mat);
                            } else {
                                mouthMaterials.push(mat);
                            }
                        } else {
                            // CASCO -> ACERO HÚMEDO
                            origMat.emissive.setHex(0x000000);
                            origMat.emissiveIntensity = 0;
                            origMat.metalness = 1.0;
                            origMat.roughness = 0.15;
                            origMat.color.setHex(0xaaaaaa);
                        }
                    });
                }
            });

            // Si por nombres en el GLB todos quedaron en una sola lista, aseguramos fallback
            if (mouthMaterials.length === 0 && emissiveMaterials.length > 0) {
                mouthMaterials = [...emissiveMaterials];
            }
            if (eyeMaterials.length === 0 && emissiveMaterials.length > 0) {
                eyeMaterials = [...emissiveMaterials];
            }

            scene.add(model);
            console.log(`✅ Modelo cargado (${eyeMaterials.length} ojos, ${mouthMaterials.length} boca).`);

            const overlay = document.getElementById('overlay');
            if (overlay) {
                overlay.style.opacity = '0';
                setTimeout(() => { overlay.style.display = 'none'; }, 600);
            }
            animate();
        },
        (xhr) => {
            if (xhr.lengthComputable) {
                const percent = Math.round((xhr.loaded / xhr.total) * 100);
                if (progressBar) progressBar.style.width = `${percent}%`;
                if (loadingText) loadingText.innerText = `Descargando modelo 3D (${percent}%)...`;
            } else {
                const mb = (xhr.loaded / (1024 * 1024)).toFixed(1);
                if (progressBar) progressBar.style.width = `75%`;
                if (loadingText) loadingText.innerText = `Descargando modelo 3D (${mb} MB)...`;
            }
        },
        (error) => {
            console.error("Error cargando el modelo 3D:", error);
            if (loadingText) {
                loadingText.style.color = '#ef4444';
                loadingText.innerText = "Error cargando el modelo 3D. Revisa la conexión.";
            }
        }
    );
}

// ==========================================
// SECCIÓN 3: MOTOR DE AUDIO (UNIFICADO + FILTRO DE VOZ HUMANA)
// ==========================================

async function iniciarSistemaDeAudio() {
    console.log("⚙️ SECCIÓN 3: Despertando AudioContext...");
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    if (audioContext.state === 'suspended') await audioContext.resume();

    reproductorAnalyser = audioContext.createAnalyser();
    reproductorAnalyser.fftSize = 256;
    dataArrayPlayback = new Uint8Array(reproductorAnalyser.frequencyBinCount);

    analyser = audioContext.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.2;

    globalStream = await navigator.mediaDevices.getUserMedia({
        audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
        }
    });
    microphone = audioContext.createMediaStreamSource(globalStream);
    microphone.connect(analyser);

    await conectarDeepgramYGrabar();
    calibrarRuidoAmbiente();
}

// Calcula el volumen promedio enfocándose únicamente en las frecuencias de la voz humana (300 Hz - 3400 Hz)
function obtenerVolumenFrecuenciaVoz() {
    if (!analyser || !audioContext) return 0;
    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(dataArray);

    const nyquist = audioContext.sampleRate / 2;
    const binHz = nyquist / analyser.frequencyBinCount;
    const startBin = Math.max(1, Math.floor(280 / binHz));
    const endBin = Math.min(analyser.frequencyBinCount - 1, Math.ceil(3400 / binHz));

    let sum = 0;
    let count = 0;
    for (let i = startBin; i <= endBin; i++) {
        sum += dataArray[i];
        count++;
    }
    return count > 0 ? (sum / count) : 0;
}

// ==========================================
// SECCIÓN 4: DEEPGRAM WEBSOCKET (CON INTERIM RESULTS + PAUSA EN PLAYBACK)
// ==========================================

async function conectarDeepgramYGrabar() {
    try {
        console.log("⚡ SECCIÓN 4: Conectando a Deepgram...");
        const res = await fetch('/api/deepgram-token');
        if (!res.ok) {
            throw new Error(`Error HTTP ${res.status} obteniendo token de Deepgram`);
        }
        const data = await res.json();
        if (!data || !data.key) {
            throw new Error("Token de Deepgram vacío o inválido");
        }
        const url = 'wss://api.deepgram.com/v1/listen?language=es&model=nova-2&smart_format=true&interim_results=true&endpointing=550&utterance_end_ms=1000&mimetype=audio/webm';

        deepgramSocket = new WebSocket(url, ['token', data.key]);
        deepgramSocket.onopen = () => {
            console.log("✅ Deepgram en vivo.");
            mediaRecorder = new MediaRecorder(globalStream, { mimeType: 'audio/webm' });
            mediaRecorder.ondataavailable = (event) => {
                // NOTA CRÍTICA: MediaRecorder en formato audio/webm necesita enviar un flujo continuo
                // a Deepgram porque solo el primer chunk contiene el encabezado EBML/WebM.
                // Si se omiten chunks intermedios, el decodificador de Deepgram se corrompe.
                if (event.data.size > 0 && deepgramSocket.readyState === 1) {
                    deepgramSocket.send(event.data);
                }
            };
            mediaRecorder.start(250);
            keepAliveInterval = setInterval(() => {
                if (deepgramSocket.readyState === 1) {
                    deepgramSocket.send(JSON.stringify({ type: "KeepAlive" }));
                }
            }, 8000);
        };

        deepgramSocket.onmessage = (message) => {
            const respuesta = JSON.parse(message.data);

            // Ignorar cualquier transcripción si el avatar está hablando, pensando, calibrando
            // o dentro de la ventana de enfriamiento post-respuesta (evita eco de parlantes)
            if (avatarHablando || iaPensando || isCalibrating || Date.now() < ignorarMicHasta) {
                transcripcionAcumulada = "";
                transcripcionInterina = "";
                return;
            }

            if (respuesta.type === 'UtteranceEnd') {
                const pendiente = `${transcripcionAcumulada} ${transcripcionInterina}`.trim();
                if (pendiente !== "" && !isUserSpeaking) {
                    dispararEnvioAlCerebro();
                }
                return;
            }

            if (!respuesta.channel || !respuesta.channel.alternatives[0]) return;

            const transcript = respuesta.channel.alternatives[0].transcript.trim();
            if (transcript === "") return;

            // Si Deepgram detecta palabras reales del usuario (incluso si habló suave),
            // reiniciamos timers de inactividad y programamos envío seguro
            clearTimeout(temporizadorInactividad);
            programarAttractLoop();
            if (fallbackSpeechTimer) clearTimeout(fallbackSpeechTimer);

            if (respuesta.is_final) {
                transcripcionAcumulada += transcript + " ";
                transcripcionInterina = "";
                console.log("📝 Final acumulado:", transcripcionAcumulada);
            } else {
                transcripcionInterina = transcript;
            }

            const textoVisible = `${transcripcionAcumulada}${transcripcionInterina}`.trim();
            mostrarSubtituloUsuario(textoVisible);

            // Si Deepgram marca speech_final, disparamos tras un breve margen o de inmediato si ya hay silencio
            if (respuesta.speech_final && textoVisible !== "") {
                if (!isUserSpeaking) {
                    dispararEnvioAlCerebro();
                } else {
                    fallbackSpeechTimer = setTimeout(() => {
                        isUserSpeaking = false;
                        dispararEnvioAlCerebro();
                    }, 450);
                }
            } else if (textoVisible !== "") {
                // Respaldo por si el usuario habló más bajo que el umbral VAD pero Deepgram sí lo escuchó
                fallbackSpeechTimer = setTimeout(() => {
                    if (!isUserSpeaking && !avatarHablando && !iaPensando) {
                        dispararEnvioAlCerebro();
                    }
                }, 1100);
            }
        };

        deepgramSocket.onclose = () => {
            clearInterval(keepAliveInterval);
            if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop();
            setTimeout(conectarDeepgramYGrabar, 1500);
        };
    } catch (error) {
        console.error("Error Deepgram:", error);
    }
}

function dispararEnvioAlCerebro() {
    if (fallbackSpeechTimer) {
        clearTimeout(fallbackSpeechTimer);
        fallbackSpeechTimer = null;
    }
    if (silenceTimer) {
        clearTimeout(silenceTimer);
        silenceTimer = null;
    }

    if (enviandoACerebro || iaPensando || avatarHablando || Date.now() < ignorarMicHasta) {
        transcripcionAcumulada = "";
        transcripcionInterina = "";
        return;
    }

    const textoCompleto = `${transcripcionAcumulada} ${transcripcionInterina}`.trim();
    transcripcionAcumulada = "";
    transcripcionInterina = "";

    // Ignorar ruidos sueltos de 1 sola letra
    if (textoCompleto.length < 2) return;

    // Evitar que se reenvíe exactamente la misma frase en menos de 4 segundos por paquetes tardíos
    if (textoCompleto.toLowerCase() === ultimoTextoEnviado.toLowerCase() && (Date.now() - ultimoEnvioTimestamp) < 4000) {
        console.log("🛡️ Evitado envío duplicado:", textoCompleto);
        return;
    }

    ultimoTextoEnviado = textoCompleto;
    ultimoEnvioTimestamp = Date.now();
    enviandoACerebro = true;

    enviarTextoAlCerebro(textoCompleto).finally(() => {
        enviandoACerebro = false;
    });
}

// ==========================================
// SECCIÓN 5: CALIBRACIÓN INTELIGENTE Y VAD
// ==========================================

function calibrarRuidoAmbiente() {
    isCalibrating = true;
    console.log("⚙️ SECCIÓN 5: Calibrando ruido ambiente en banda de voz...");
    actualizarHUD('calibrating', 'Calibrando micrófono...', '#f59e0b', 50);

    let samples = [];
    const calibracionInterval = setInterval(() => {
        samples.push(obtenerVolumenFrecuenciaVoz());
    }, 100);

    setTimeout(() => {
        clearInterval(calibracionInterval);
        // Ordenamos muestras y descartamos el 25% más alto por si hubo ruido puntual durante la calibración
        samples.sort((a, b) => a - b);
        const validSamples = samples.slice(0, Math.max(1, Math.floor(samples.length * 0.75)));
        const avg = validSamples.reduce((acc, v) => acc + v, 0) / validSamples.length;

        baseNoiseFloor = avg;
        dynamicVolumeThreshold = Math.min(MAX_VOLUME_THRESHOLD, Math.max(9, baseNoiseFloor + SIGNAL_TO_NOISE_MARGIN));
        isCalibrating = false;
        console.log(`✅ Umbral inteligente seteado en: ${dynamicVolumeThreshold.toFixed(2)}`);

        actualizarHUD('idle', 'Acércate y háblame', '#10b981', 5);
        programarAttractLoop();
        if (!monitoreandoActivo) {
            monitoreandoActivo = true;
            monitorearVolumen();
        }
    }, 2400);
}

function monitorearVolumen() {
    if (isCalibrating || avatarHablando || iaPensando || Date.now() < ignorarMicHasta) {
        isUserSpeaking = false;
        if (silenceTimer) {
            clearTimeout(silenceTimer);
            silenceTimer = null;
        }
        requestAnimationFrame(monitorearVolumen);
        return;
    }

    const averageVolume = obtenerVolumenFrecuenciaVoz();
    currentMicVolume = averageVolume;
    const meterPercent = Math.min(100, (averageVolume / (dynamicVolumeThreshold * 1.8)) * 100);

    if (averageVolume > dynamicVolumeThreshold) {
        clearTimeout(temporizadorInactividad);
        programarAttractLoop();

        if (!isUserSpeaking) {
            console.log(`🎙️ Voz detectada...`);
            isUserSpeaking = true;
            mostrarSubtituloIA("");
        }
        actualizarHUD('listening', 'Escuchando...', '#00e5ff', meterPercent);

        if (silenceTimer) {
            clearTimeout(silenceTimer);
            silenceTimer = null;
        }
    } else {
        if (!isUserSpeaking) {
            actualizarHUD('idle', 'Acércate y háblame', '#10b981', meterPercent * 0.5);
        }

        if (isUserSpeaking && !silenceTimer) {
            silenceTimer = setTimeout(() => {
                isUserSpeaking = false;
                silenceTimer = null;
                setTimeout(() => {
                    if (!isUserSpeaking && !avatarHablando && !iaPensando) {
                        dispararEnvioAlCerebro();
                    }
                }, 400);
            }, SILENCE_DURATION);
        }
    }
    requestAnimationFrame(monitorearVolumen);
}

// ==========================================
// SECCIÓN 6: ESTADOS IA Y PLAYBACK (CON SUBTÍTULOS Y STREAMING RÁPIDO)
// ==========================================

async function enviarTextoAlCerebro(textoUsuario) {
    try {
        iaPensando = true;
        isUserSpeaking = false;
        enAttractLoop = false;
        transcripcionAcumulada = "";
        transcripcionInterina = "";
        if (attractBanner) attractBanner.classList.remove('visible');

        // Silenciamos la pista del micrófono mientras el avatar piensa y habla
        // para que el flujo WebM siga vivo con silencio puro y NUNCA capte la voz del propio avatar
        if (globalStream) {
            globalStream.getAudioTracks().forEach(track => { track.enabled = false; });
        }

        mostrarSubtituloUsuario(textoUsuario);
        actualizarHUD('thinking', 'Pensando respuesta...', '#f59e0b', 65);
        sfxPensando.play().catch(() => {});
        console.log("🧠 SECCIÓN 6: Pensando respuesta para:", textoUsuario);

        const respuestaChat = await fetch(`/api/chat?userId=${userId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: textoUsuario.trim() })
        });
        const data = await respuestaChat.json();
        if (!data.text) throw new Error("Respuesta vacía del servidor");
        console.log("🤖 IA responde:", data.text);

        if (audioContext.state === 'suspended') await audioContext.resume();

        const audioResponse = await fetch(`/api/speak?text=${encodeURIComponent(data.text)}`);
        const arrayBuffer = await audioResponse.arrayBuffer();
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

        const source = audioContext.createBufferSource();
        source.buffer = audioBuffer;

        source.connect(reproductorAnalyser);
        reproductorAnalyser.connect(audioContext.destination);

        // --- ESTADO: HABLANDO ---
        iaPensando = false;
        sfxPensando.pause();
        sfxPensando.currentTime = 0;
        avatarHablando = true;

        mostrarSubtituloIA(data.text);
        actualizarHUD('speaking', 'Sandy hablando...', '#ff1e00', 80);
        console.log("🔥 Lip-Sync Fotónico Diferenciado activado.");

        source.start(0);

        source.onended = () => {
            // Limpiamos cualquier residuo y damos 900ms de enfriamiento antes de reabrir el micrófono
            // para evitar que la reverberación del salón vuelva a disparar la misma pregunta
            transcripcionAcumulada = "";
            transcripcionInterina = "";
            isUserSpeaking = false;
            ignorarMicHasta = Date.now() + 900;
            avatarHablando = false;

            setTimeout(() => {
                if (globalStream && !iaPensando && !avatarHablando) {
                    globalStream.getAudioTracks().forEach(track => { track.enabled = true; });
                }
            }, 600);

            actualizarHUD('idle', 'Acércate y háblame', '#10b981', 5);
            temporizadorInactividad = setTimeout(reiniciarSesionTotem, TIEMPO_ESPERA_MS);
            programarAttractLoop();
            setTimeout(() => {
                if (!isUserSpeaking && !avatarHablando) {
                    mostrarSubtituloUsuario("");
                }
            }, 3000);
            console.log("⏹️ Avatar en silencio. Escuchando ambiente...");
        };
    } catch (error) {
        console.error("Error comunicando:", error);
        iaPensando = false;
        avatarHablando = false;
        ignorarMicHasta = Date.now() + 500;
        if (globalStream) {
            globalStream.getAudioTracks().forEach(track => { track.enabled = true; });
        }
        sfxPensando.pause();
        sfxPensando.currentTime = 0;
        actualizarHUD('idle', 'Acércate y háblame', '#10b981', 0);
    }
}

function reiniciarSesionTotem() {
    userId = generarNuevoId();
    mostrarSubtituloUsuario("");
    mostrarSubtituloIA("");
    console.log("🔄 Sesión reiniciada. Tótem libre.");
    sincronizarConfigAdmin();
    calibrarRuidoAmbiente();
}

// ==========================================
// SECCIÓN 7: MOTOR DE ANIMACIÓN (OJOS/BOCA INDEPENDIENTES + COLORES + PARPADEO)
// ==========================================

function animate() {
    requestAnimationFrame(animate);
    const time = clock.getElapsedTime();

    // Determinamos si ocurre un parpadeo natural de los ojos (110ms cada 3.5 a 6.5 segs)
    if (time > nextBlinkTime) {
        blinkEndTime = time + 0.11;
        nextBlinkTime = time + 3.5 + Math.random() * 3.0;
    }
    const isBlinking = time < blinkEndTime;

    // 1. GESTIÓN DE ESTADOS (MÁQUINA DE ANIMACIÓN Y COLOR)
    if (iaPensando) {
        // Movimientos de cómputo
        targetRotationY = Math.sin(time * 3.1) * 0.25 + Math.cos(time * 5.7) * 0.1;
        targetRotationX = Math.cos(time * 2.2) * 0.15 - 0.12 + Math.sin(time * 4.3) * 0.08;

        const targetColor = totemConfig.coloresDinamicos ? COLOR_THINKING : COLOR_CLASSIC_RED;
        const pulse = 2.5 + Math.sin(time * 12.0) * 4.5;

        eyeMaterials.forEach(mat => {
            mat.userData.targetColor.copy(targetColor);
            mat.userData.targetIntensity = pulse;
        });
        mouthMaterials.forEach(mat => {
            mat.userData.targetColor.copy(targetColor);
            mat.userData.targetIntensity = 1.2 + Math.sin(time * 6.0) * 0.8;
        });

    } else if (avatarHablando && reproductorAnalyser) {
        reproductorAnalyser.getByteFrequencyData(dataArrayPlayback);
        let maxVolume = 0;
        for (let i = 0; i < dataArrayPlayback.length; i++) {
            if (dataArrayPlayback[i] > maxVolume) maxVolume = dataArrayPlayback[i];
        }

        const volumeRatio = maxVolume / 255.0;
        if (hudMeterBar) {
            hudMeterBar.style.width = `${Math.min(100, volumeRatio * 100)}%`;
        }

        // Micro-movimientos orgánicos de cabeza y asentimiento enfático al hablar
        targetRotationY = Math.sin(time * 1.7) * 0.04;
        targetRotationX = -volumeRatio * 0.09 + Math.sin(time * 2.3) * 0.02;

        const targetColor = totemConfig.coloresDinamicos ? COLOR_SPEAKING : COLOR_CLASSIC_RED;
        const mouthIntensity = 1.8 + (volumeRatio * volumeRatio) * 36.0;
        const eyeIntensity = isBlinking ? 0.15 : (3.2 + volumeRatio * 3.5);

        // Ojos mantienen atención firme con parpadeo ocasional; Boca hace el Lip-Sync fotónico puro
        eyeMaterials.forEach(mat => {
            mat.userData.targetColor.copy(targetColor);
            mat.userData.targetIntensity = eyeIntensity;
        });
        mouthMaterials.forEach(mat => {
            mat.userData.targetColor.copy(targetColor);
            mat.userData.targetIntensity = mouthIntensity;
        });

    } else if (isUserSpeaking) {
        // Estado Escuchando: inclina levemente la cabeza con atención y reacciona en color Cian
        targetRotationY = Math.sin(time * 0.8) * 0.03;
        targetRotationX = 0.05;

        const targetColor = totemConfig.coloresDinamicos ? COLOR_LISTENING : COLOR_CLASSIC_RED;
        const micRatio = Math.min(1.0, currentMicVolume / 60.0);

        eyeMaterials.forEach(mat => {
            mat.userData.targetColor.copy(targetColor);
            mat.userData.targetIntensity = isBlinking ? 0.15 : (3.5 + micRatio * 6.0);
        });
        mouthMaterials.forEach(mat => {
            mat.userData.targetColor.copy(targetColor);
            mat.userData.targetIntensity = 1.5 + micRatio * 2.5;
        });

    } else if (enAttractLoop && totemConfig.modoAttractLoop) {
        // Modo Attract Loop: busca personas mirando alrededor y lanza pulsos llamativos
        targetRotationY = Math.sin(time * 1.1) * 0.35;
        targetRotationX = Math.sin(time * 0.7) * 0.08;

        const targetColor = totemConfig.coloresDinamicos ? COLOR_IDLE : COLOR_CLASSIC_RED;
        const attractPulse = isBlinking ? 0.15 : (3.0 + Math.sin(time * 4.0) * 2.0);

        emissiveMaterials.forEach(mat => {
            mat.userData.targetColor.copy(targetColor);
            mat.userData.targetIntensity = attractPulse;
        });

    } else {
        // Estado Reposo: Micro movimientos orgánicos y respiración suave
        targetRotationY = Math.sin(time * 0.5) * 0.06;
        targetRotationX = 0;

        const targetColor = totemConfig.coloresDinamicos ? COLOR_IDLE : COLOR_CLASSIC_RED;
        const idleIntensity = isBlinking ? 0.15 : (2.0 + Math.sin(time * 3.0) * 1.0);

        eyeMaterials.forEach(mat => {
            mat.userData.targetColor.copy(targetColor);
            mat.userData.targetIntensity = idleIntensity;
        });
        mouthMaterials.forEach(mat => {
            mat.userData.targetColor.copy(targetColor);
            mat.userData.targetIntensity = 1.8 + Math.sin(time * 3.0) * 0.8;
        });
    }

    // 2. APLICACIÓN DE MATEMÁTICA FLUIDA (LERP ROTACIÓN)
    currentRotationX += (targetRotationX - currentRotationX) * LERP_ROTATION;
    currentRotationY += (targetRotationY - currentRotationY) * LERP_ROTATION;

    // 3. APLICACIÓN A LA MALLA (3D)
    if (model) {
        model.rotation.x = currentRotationX;
        model.rotation.y = currentRotationY;
        model.position.y = -0.8 + Math.sin(time) * 0.1;
    }

    // 4. APLICACIÓN DE LUZ Y COLOR FLUIDO (LERP LIGHT & COLOR)
    emissiveMaterials.forEach(mat => {
        mat.emissiveIntensity += (mat.userData.targetIntensity - mat.emissiveIntensity) * LERP_LIGHT;
        if (mat.userData.targetColor) {
            mat.emissive.lerp(mat.userData.targetColor, LERP_COLOR);
        }
    });

    if (composer) composer.render();
}

// ==========================================
// SECCIÓN 8: ARRANQUE DE SISTEMA
// ==========================================

document.addEventListener('DOMContentLoaded', () => {
    sincronizarConfigAdmin();
    // Sincronizar periódicamente cada 15 segundos por si se cambian ajustes desde /admin.html en otro dispositivo
    setInterval(sincronizarConfigAdmin, 15000);

    const btnIniciar = document.getElementById('btnIniciar');
    if (btnIniciar) {
        btnIniciar.addEventListener('click', () => {
            btnIniciar.style.display = 'none';
            initThreeJS();
            loadModel();
            iniciarSistemaDeAudio();
        });
    }
});
