// ==========================================
// SECCIÓN 0: VARIABLES GLOBALES (3D + AUDIO)
// ==========================================

function generarNuevoId() {
    return 'totem_user_' + Math.random().toString(36).substr(2, 9);
}

let userId = generarNuevoId();
let temporizadorInactividad;
const TIEMPO_ESPERA_MS = 45000; // 45s para resetear

// --- Variables 3D (Three.js + Bloom) ---
let scene, camera, renderer, model, mixer, composer, bloomPass; 
let controls, clock = new THREE.Clock(); 
// Colección global para almacenar las partes que brillan (ojos y boca)
let emissiveMeshes = [];

// RUTA FIREBASE BLINDADA (Tu modelo verificado en Storage)
const MODEL_PATH = 'https://firebasestorage.googleapis.com/v0/b/avatar-ia-84a80.firebasestorage.app/o/avatar-ia.glb?alt=media&token=541669a6-7baa-43d3-8f7e-4d4c2f07db8e'; 

// --- Variables de Audio VAD/WebSockets (El motor rápido que funciona) ---
let audioContext, analyser, microphone, globalStream, mediaRecorder;
let isUserSpeaking = false; 
let silenceTimer = null;
let isCalibrating = false;
let avatarHablando = false; // ¡IMPORTANTE! Para el Glow dinámico
let baseNoiseFloor = 0; 
let dynamicVolumeThreshold = 15; 
const SIGNAL_TO_NOISE_MARGIN = 10; 
const SILENCE_DURATION = 600; // Ultra baja latencia: 600ms
let deepgramSocket, keepAliveInterval;
let transcripcionAcumulada = "";

// ==========================================
// SECCIÓN 1: MOTOR GRÁFICO (THREE.JS + BLOOM)
// ==========================================

function initThreeJS() {
    console.log("⚙️ Inicializando Three.js con HDR y Post-processing...");
    const container = document.getElementById('threejs-container');

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x111827); // Fondo negro jungle suave

    // Cámara centrada y más cercana para la cabeza robótica (Ver imagen)
    camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 0, 3.8); // Acercamos un poco más para ver detalles (Ver imagen)

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setClearColor( 0x000000, 1 ); // Fondo negro absoluto para el glow

    // Activar renderizado HDR vital para materiales emisivos (Glow)
    renderer.outputEncoding = THREE.sRGBEncoding; 
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    container.appendChild(renderer.domElement);

    const ambientLight = new THREE.AmbientLight(0x404040, 1.2); 
    scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.5);
    directionalLight.position.set(2, 2, 5);
    scene.add(directionalLight);

    // CONFIGURACIÓN POST-PROCESAMIENTO: MOTOR DE BLOOM (LED Glow Intenso)
    //bloomPass = new THREE.UnrealBloomPass( resolución, fuerza, radio, umbral )
    //strength (2.0): Mucha fuerza para ese efecto "sangrante".
    //radius (0.8): Radio amplio de dispersión de luz.
    //threshold (0.15): Umbral bajo para que cualquier color rojo brillante se ilumine.
    bloomPass = new THREE.UnrealBloomPass( new THREE.Vector2( window.innerWidth, window.innerHeight ), 2.0, 0.8, 0.15 );
    
    composer = new THREE.EffectComposer( renderer );
    composer.addPass( new THREE.RenderPass( scene, camera ) );
    composer.addPass( bloomPass );

    if (typeof THREE.OrbitControls !== 'undefined') {
        controls = new THREE.OrbitControls(camera, renderer.domElement);
        controls.enablePan = false; 
        controls.target.set(0, 0, 0); 
        controls.update();
    }

    window.addEventListener('resize', onWindowResize, false);
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    if (composer) composer.setSize( window.innerWidth, window.innerHeight );
}

// ==========================================
// SECCIÓN 2: CARGADOR DE MODELO Y ANIMACIÓN
// ==========================================

function loadModel() {
    console.log(`⚙️ Cargando modelo 3D desde Firebase Storage...`);
    const loader = new THREE.GLTFLoader();

    // Necesario para texturas remotas de Firebase
    loader.setCrossOrigin('anonymous');

    loader.load(MODEL_PATH, (gltf) => {
        model = gltf.scene;
        
        // Ajustes de posición y escala (Ver imagen)
        model.scale.set(1, 1, 1); 
        model.position.set(0, 0, 0); // En el suelo/centro (Ver imagen)

        // Limpiamos la colección global por si acaso
        emissiveMeshes = [];

        // REINTEGRACIÓN MEJORADA 1: AJUSTE DE MATERIALES LED ROJOS (Glow Base)
        // Travesamos el modelo de forma robótica buscando los materiales emisivos (ojos, boca)
        model.traverse((child) => {
            if (child.isMesh && child.material) {
                // Forzamos el escaneo manejando Arrays de Materiales (muy común en cabezas de robots)
                const materials = Array.isArray(child.material) ? child.material : [child.material];
                
                materials.forEach(mat => {
                    // Si el material tiene textura emisiva (brillo de ojos/boca rojos)
                    if (mat.emissive) {
                        // Multiplicamos la intensidad base (5.0 a 10.0) para que brillen todo el tiempo (Idle).
                        // Esto hace que el BloomShader los reconozca como LEDs Neón.
                        mat.emissiveIntensity = 10.0; // AJUSTA ESTO (10.0 es glow base fuerte)
                        emissiveMeshes.push(mat); // Almacenamos la referencia para el glow dinámico
                        console.log(`✨ Encendido material LED en: ${child.name} | Intensidad Base: ${mat.emissiveIntensity}`);
                    }
                });
            }
        });

        scene.add(model);
        console.log(`✅ Modelo loaded con texturas y Glow encendido (${emissiveMeshes.length} mallas LED detectadas).`);

        // Encender animaciones internas del GLB si existen
        if (gltf.animations && gltf.animations.length > 0) {
            mixer = new THREE.AnimationMixer(model);
            gltf.animations.forEach((clip) => {
                mixer.clipAction(clip).play();
            });
        }

        const overlay = document.getElementById('overlay');
        if(overlay) overlay.style.display = 'none';

        animate(); 
    }, undefined, (error) => {
        console.error("❌ Error cargando el modelo GLTF:", error);
    });
}

function animate() {
    requestAnimationFrame(animate);
    
    const delta = clock.getDelta();
    if (mixer) mixer.update(delta); // Reproducir animación interna
    if (controls) controls.update(); 
    
    // Efecto de flotación suave y contínua (como en la imagen)
    if (model) {
        const time = Date.now() * 0.002;
        model.position.y = Math.sin(time) * 0.15; // Sube y baja suavemente
    }

    // Renderizar a través del composer (con Bloom)
    if (composer) {
        composer.render();
    }
}

// ==========================================
// SECCIÓN 3: MOTOR DE AUDIO Y WEBSOCKETS (IGUAL QUE ANTES, CON GLOW INTEGRADO)
// ==========================================

function reiniciarSesionTotem() {
    userId = generarNuevoId();
    console.log("🔄 Sesión reiniciada. Tótem listo para una nueva persona: " + userId);
    calibrarRuidoAmbiente(); 
}

function resetearTemporizador() {
    clearTimeout(temporizadorInactividad);
    temporizadorInactividad = setTimeout(reiniciarSesionTotem, TIEMPO_ESPERA_MS);
}

async function conectarDeepgramYGrabar() {
    try {
        const res = await fetch('/api/deepgram-token');
        const data = await res.json();
        const url = 'wss://api.deepgram.com/v1/listen?language=es&model=nova-2&smart_format=true&mimetype=audio/webm';
        deepgramSocket = new WebSocket(url, ['token', data.key]);
        deepgramSocket.onopen = () => {
            console.log("⚡ Conexión en vivo con Deepgram establecida.");
            mediaRecorder = new MediaRecorder(globalStream, { mimeType: 'audio/webm' });
            mediaRecorder.ondataavailable = (event) => {
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
            if (respuesta.is_final && respuesta.channel && respuesta.channel.alternatives[0].transcript) {
                const texto = respuesta.channel.alternatives[0].transcript.trim();
                // FIX Blindado: Si el avatar está hablando, ignoramos el texto de Deepgram (evitamos eco).
                if (texto !== "" && !avatarHablando) {
                    transcripcionAcumulada += texto + " ";
                    console.log("📝 Escuchando:", transcripcionAcumulada);
                }
            }
        };
        deepgramSocket.onclose = () => {
            console.log("⚠️ Deepgram desconectado. Limpiando y reconectando...");
            clearInterval(keepAliveInterval);
            if (mediaRecorder && mediaRecorder.state !== 'inactive') {
                mediaRecorder.stop();
            }
            setTimeout(conectarDeepgramYGrabar, 1000); 
        };
    } catch (error) {
        console.error("Error conectando a Deepgram:", error);
    }
}

async function inicializarMicrofonoVAD() {
    try {
        globalStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 512;
        analyser.smoothingTimeConstant = 0.2;
        microphone = audioContext.createMediaStreamSource(globalStream);
        microphone.connect(analyser);
        await conectarDeepgramYGrabar(); 
        console.log("🎤 Micrófono encendido y conectado en tiempo real.");
        calibrarRuidoAmbiente();
    } catch (err) {
        console.error("Error micrófono:", err);
    }
}

function calibrarRuidoAmbiente() {
    isCalibrating = true;
    console.log("⚙️ Calibrando ruido de fondo...");
    let totalVolume = 0;
    let sampleCount = 0;
    const calibracionInterval = setInterval(() => {
        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) { sum += dataArray[i]; }
        totalVolume += (sum / dataArray.length);
        sampleCount++;
    }, 100); 
    setTimeout(() => {
        clearInterval(calibracionInterval);
        baseNoiseFloor = totalVolume / sampleCount;
        dynamicVolumeThreshold = baseNoiseFloor + SIGNAL_TO_NOISE_MARGIN;
        isCalibrating = false;
        console.log(`✅ Calibración lista. Umbral: ${dynamicVolumeThreshold.toFixed(2)}`);
        monitorearVolumen();
    }, 3000);
}

function monitorearVolumen() {
    if (isCalibrating || avatarHablando) {
        requestAnimationFrame(monitorearVolumen);
        return; 
    }
    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(dataArray);
    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) { sum += dataArray[i]; }
    const averageVolume = sum / dataArray.length;
    if (averageVolume > dynamicVolumeThreshold) {
        resetearTemporizador(); 
        if (!isUserSpeaking) {
            console.log(`🎙️ Voz detectada. Capturando frase...`);
            isUserSpeaking = true;
        }
        if (silenceTimer) { clearTimeout(silenceTimer); silenceTimer = null; }
    } else {
        if (isUserSpeaking && !silenceTimer) {
            silenceTimer = setTimeout(() => {
                isUserSpeaking = false;
                silenceTimer = null;
                setTimeout(() => {
                    if (!isUserSpeaking && transcripcionAcumulada.trim() !== "") {
                        console.log("🚀 Frase terminada. Enviando:", transcripcionAcumulada);
                        enviarTextoAlCerebro(transcripcionAcumulada);
                        transcripcionAcumulada = ""; 
                    }
                }, 400);
            }, SILENCE_DURATION); 
        }
    }
    requestAnimationFrame(monitorearVolumen);
}

async function enviarTextoAlCerebro(textoUsuario) {
    try {
        console.log("🧠 Pensando respuesta para:", textoUsuario);
        const respuestaChat = await fetch(`/api/chat?userId=${userId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: textoUsuario.trim() })
        });
        if (!respuestaChat.ok) throw new Error("Error en el servidor de IA");
        const data = await respuestaChat.json();
        console.log("🤖 IA responde:", data.text);
        
        avatarHablando = true; // El avatar comienza a hablar
        const reproductor = new Audio();
        reproductor.src = `/api/speak?text=${encodeURIComponent(data.text)}`;
        
        // REINTEGRACIÓN MEJORADA 2: LIP-SYNC VISUAL (Glow al hablar)
        // Justo antes de reproducir, aumentamos el glow LED intenso (Talking Glow).
        // Recorremos la colección emissiveMeshes que poblamos en el load.
        emissiveMeshes.forEach(mat => {
            mat.emissiveIntensity = 30.0; // Multiplicamos brillo (30.0 es neón intenso al hablar)
        });
        console.log(`🔥 Lip-Sync Visual activado (Intensidad Talking: 30.0)`);
        
        await reproductor.play();
        
        reproductor.onended = () => {
            avatarHablando = false; // El avatar termina de hablar
            resetearTemporizador();
            
            // VOLVEMOS AL GLOW BASE (Idle Glow).
            emissiveMeshes.forEach(mat => {
                mat.emissiveIntensity = 10.0; // Volvemos al brillo base
            });
            console.log("⏹️ Avatar en silencio. Escuchando ambiente... (Intensidad Idle: 10.0)");
        };
    } catch (error) {
        console.error("Error comunicando con Vercel:", error);
        avatarHablando = false;
        // Si hay error, también reseteamos el glow para no quedar pegado encendido.
        emissiveMeshes.forEach(mat => mat.emissiveIntensity = 10.0);
    }
}

// ==========================================
// SECCIÓN 4: ARRANQUE DEL SISTEMA (IGUAL)
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    const btnIniciar = document.getElementById('btnIniciar');
    if (btnIniciar) {
        btnIniciar.addEventListener('click', () => {
            btnIniciar.style.display = 'none'; 
            console.log("🚀 Iniciando sistema Jungle...");
            initThreeJS();
            loadModel();
            inicializarMicrofonoVAD();
            resetearTemporizador();
        });
    }
});