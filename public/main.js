// ==========================================
// SECCIÓN 0: VARIABLES GLOBALES (3D + AUDIO)
// ==========================================

function generarNuevoId() {
    return 'totem_user_' + Math.random().toString(36).substr(2, 9);
}

let userId = generarNuevoId();
let temporizadorInactividad;
const TIEMPO_ESPERA_MS = 45000; 

// --- Variables 3D (Three.js + Bloom) ---
let scene, camera, renderer, model, mixer, composer, bloomPass; 
let controls, clock = new THREE.Clock(); 
// Colección global para almacenar solo los materiales que brillan
let emissiveMaterials = []; 

// RUTA FIREBASE BLINDADA
const MODEL_PATH = 'https://firebasestorage.googleapis.com/v0/b/avatar-ia-84a80.firebasestorage.app/o/Moldels%2Favatar-ia.glb?alt=media&token=e6e64cf6-f39c-487d-9344-26ac71956d0c'; 

// --- Variables de Audio VAD/WebSockets (Entrada de micrófono - IGUAL QUE ANTES) ---
let audioContext, analyser, microphone, globalStream, mediaRecorder;
let isUserSpeaking = false; 
let silenceTimer = null;
let isCalibrating = false;
let baseNoiseFloor = 0; 
let dynamicVolumeThreshold = 15; 
const SIGNAL_TO_NOISE_MARGIN = 10; 
const SILENCE_DURATION = 600; 
let deepgramSocket, keepAliveInterval;
let transcripcionAcumulada = "";

// --- Variables de Audio Playback (Salida de voz del avatar - NUEVO PARA LATIDO) ---
let avatarHablando = false; 
let reproductorAnalyser; // Analizador para medir el volumen de ElevenLabs
let dataArrayPlayback;   // Array para guardar los datos de frecuencia del playback

// ==========================================
// SECCIÓN 1: MOTOR GRÁFICO (THREE.JS + BLOOM SELECTIVO)
// ==========================================

function initThreeJS() {
    console.log("⚙️ Inicializando Three.js para efecto Terminator...");
    const container = document.getElementById('threejs-container');

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0f18); // Negro Jungle muy oscuro

    camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 0, 3.8); 

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setClearColor( 0x000000, 1 ); 

    renderer.outputEncoding = THREE.sRGBEncoding; 
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    container.appendChild(renderer.domElement);

    // FIX 1: ILUMINACIÓN DE ESTUDIO OSCURO
    // Para que SOLO brillen los LEDs, necesitamos que el ambiente esté oscuro. 
    // Bajamos mucho las luces del casco.
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.15); // Luz base muy tenue
    scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.3); // Foco suave para texturas
    directionalLight.position.set(2, 2, 5);
    scene.add(directionalLight);

    // FIX 2: BLOOM SELECTIVO EXTREMO (Glow Sangrante)
    // UnrealBloomPass( resolución, fuerza, radio, umbral )
    // Subimos el umbral a 0.85. Esto ignora los reflejos del casco y SOLO aplica glow 
    // a los materiales que configuraremos con intensidad extrema (15.0 - 80.0).
    // El radio (1.0) asegura que la luz se disperse mucho ("sangre").
    bloomPass = new THREE.UnrealBloomPass( new THREE.Vector2( window.innerWidth, window.innerHeight ), 2.5, 1.0, 0.85 );
    
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
// SECCIÓN 2: CARGADOR DE MODELO (TARGETING POR NOMBRE)
// ==========================================

function loadModel() {
    console.log(`⚙️ Cargando modelo 3D y buscando materiales de Blender...`);
    const loader = new THREE.GLTFLoader();
    loader.setCrossOrigin('anonymous');

    loader.load(MODEL_PATH, (gltf) => {
        model = gltf.scene;
        model.scale.set(1, 1, 1); 
        model.position.set(0, 0, 0); 

        emissiveMaterials = [];

        // FIX 3: TRAVERSAL SELECTIVO USANDO TUS NOMBRES DE BLENDER
        model.traverse((child) => {
            if (child.isMesh && child.material) {
                const materials = Array.isArray(child.material) ? child.material : [child.material];
                
                materials.forEach(mat => {
                    // Pasamos los nombres a minúsculas para evitar errores
                    const matName = mat.name.toLowerCase();
                    const meshName = child.name.toLowerCase();

                    // Si el nombre del material (o la malla) contiene "ojo" o "boca" (Tus nombres de Blender)
                    if (matName.includes('ojo') || matName.includes('boca') || meshName.includes('ojo') || meshName.includes('boca')) {
                        // Forzamos el color rojo sangre puro
                        mat.emissive.setHex(0xff0000);
                        // Intensidad base estable (sangrante pero pasiva)
                        mat.emissiveIntensity = 15.0; 
                        
                        emissiveMaterials.push(mat); // Lo guardamos para el latido dinámico
                        console.log(`✨ LED ROJO CONECTADO en malla: ${child.name} (Material: ${mat.name})`);
                    } 
                    else {
                        // SI NO ES OJO NI BOCA: Nos aseguramos de apagar su emisión
                        mat.emissive.setHex(0x000000); 
                    }
                });
            }
        });

        scene.add(model);

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
    if (mixer) mixer.update(delta); 
    if (controls) controls.update(); 
    
    if (model) {
        const time = Date.now() * 0.002;
        model.position.y = Math.sin(time) * 0.15; // Flotación suave
    }

    // FIX 4: LIP-SYNC DINÁMICO (EL LATIDO VISUAL)
    // Si el avatar está hablando, calculamos la intensidad del brillo en tiempo real.
    if (avatarHablando && reproductorAnalyser && emissiveMaterials.length > 0) {
        reproductorAnalyser.getByteFrequencyData(dataArrayPlayback);
        
        // Calculamos el volumen promedio (Intensidad)
        let sum = 0;
        for (let i = 0; i < dataArrayPlayback.length; i++) {
            sum += dataArrayPlayback[i];
        }
        const averageVolume = sum / dataArrayPlayback.length; // Valor entre 0 y 255
        
        // MAPEADO: Convertimos el volumen (0-255) a intensidad emisiva (15.0 - 80.0)
        // 15.0 es el brillo base (sangrado pasivo).
        // 80.0 es el brillo máximo (estallido sangrante en picos de voz).
        const dynamicIntensity = 15.0 + (averageVolume * (65.0 / 255.0));
        
        // Aplicamos el latido a SOLO ojos y boca
        emissiveMaterials.forEach(mat => mat.emissiveIntensity = dynamicIntensity);
    }

    if (composer) {
        composer.render();
    }
}

// ==========================================
// SECCIÓN 3: MOTOR DE AUDIO Y WEBSOCKETS (ENTRADA MICRÓFONO - IGUAL QUE ANTES)
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
                if (texto !== "" && !avatarHablando) {
                    transcripcionAcumulada += texto + " ";
                    console.log("📝 Escuchando:", transcripcionAcumulada);
                }
            }
        };
        deepgramSocket.onclose = () => {
            console.log("⚠️ Deepgram desconectado. Limpiando y reconectando...");
            clearInterval(keepAliveInterval);
            if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop();
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
        
        // FIX 5: PREPARAR EL ANALIZADOR DE PLAYBACK (LIP-SYNC)
        reproductorAnalyser = audioContext.createAnalyser();
        reproductorAnalyser.fftSize = 256; // Pequeño para velocidad fotograma a fotograma
        dataArrayPlayback = new Uint8Array(reproductorAnalyser.frequencyBinCount);

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

// ==========================================
// SECCIÓN 3.5: LÓGICA DE PLAYBACK Y LIP-SYNC VISUAL (HDR)
// ==========================================

async function enviarTextoAlCerebro(textoUsuario) {
    try {
        console.log("🧠 Pensando respuesta...");
        const respuestaChat = await fetch(`/api/chat?userId=${userId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: textoUsuario.trim() })
        });
        if (!respuestaChat.ok) throw new Error("Error en IA");
        const data = await respuestaChat.json();
        
        console.log("🤖 IA responde:", data.text);

        // FIX 6: CONECTAR EL AUDIO AL ANALIZADOR
        avatarHablando = true; 
        
        // Creamos el elemento Audio nativo
        const reproductorElement = new Audio();
        reproductorElement.src = `/api/speak?text=${encodeURIComponent(data.text)}`;
        reproductorElement.crossOrigin = "anonymous"; // Vital para Firebase
        
        // Creamos el nodo de fuente de audio en el contexto existente
        const fuenteAudio = audioContext.createMediaElementSource(reproductorElement);
        
        // CONEXIÓN CLAVE: fuente -> analizador playback -> parlantes
        fuenteAudio.connect(reproductorAnalyser);
        reproductorAnalyser.connect(audioContext.destination);
        
        console.log("🔥 Lip-Sync Dinámico (Latido LED) activado.");
        
        await reproductorElement.play();
        
        reproductorElement.onended = () => {
            avatarHablando = false; // El avatar termina de hablar
            resetearTemporizador();
            // VOLVEMOS AL GLOW BASE AL CALLAR
            if (emissiveMaterials.length > 0) {
                emissiveMaterials.forEach(mat => mat.emissiveIntensity = 15.0);
            }
            console.log("⏹️ Avatar en silencio. Intensidad base restablecida.");
        };
    } catch (error) {
        console.error("Error comunicando:", error);
        avatarHablando = false;
        if (emissiveMaterials.length > 0) {
            emissiveMaterials.forEach(mat => mat.emissiveIntensity = 15.0);
        }
    }
}

// ==========================================
// SECCIÓN 4: ARRANQUE DEL SISTEMA (IGUAL QUE ANTES)
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