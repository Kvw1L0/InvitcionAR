// ==========================================
// SECCIÓN 0: VARIABLES GLOBALES (3D + AUDIO)
// ==========================================

function generarNuevoId() {
    return 'totem_user_' + Math.random().toString(36).substr(2, 9);
}

let userId = generarNuevoId();
let temporizadorInactividad;
const TIEMPO_ESPERA_MS = 45000; // 45s de inactividad para resetear

// --- Variables 3D (Three.js + Bloom Dinámico) ---
let scene, camera, renderer, model, mixer, controls; 
let clock = new THREE.Clock(); 

// Colección para almacenar SOLO los materiales que brillarán
let emissiveMaterials = []; 

// ¡TOKEN ACTUALIZADO INTEGRADO!
const MODEL_PATH = 'https://firebasestorage.googleapis.com/v0/b/avatar-ia-84a80.firebasestorage.app/o/Moldels%2Favatar-ia.glb?alt=media&token=e6e64cf6-f39c-487d-9344-26ac71956d0c'; 

// --- Variables de Audio VAD/WebSockets (Entrada de micrófono) ---
let audioContext, analyser, microphone, globalStream, mediaRecorder;
// ... variables VAD iguales que antes ...
let isUserSpeaking = false; 
let silenceTimer = null;
let isCalibrating = false;
let baseNoiseFloor = 0; 
let dynamicVolumeThreshold = 15; 
const SIGNAL_TO_NOISE_MARGIN = 10; 
const SILENCE_DURATION = 600; 
let deepgramSocket, keepAliveInterval;
let transcripcionAcumulada = "";

// --- Variables de Audio Playback (Salida de voz del avatar - NUEVO PARA LUZ) ---
let avatarHablando = false; 
let reproductorAnalyser; // Analizador para medir el volumen de ElevenLabs en tiempo real
let dataArrayPlayback;   // Array para guardar los datos de frecuencia del playback

// --- Variables de Post-Procesamiento (Glow Selectivo) ---
let composer, renderPass, bloomPass;

// ==========================================
// SECCIÓN 1: MOTOR GRÁFICO (THREE.JS + BLOOM SELECTIVO HDR)
// ==========================================

function initThreeJS() {
    console.log("⚙️ Inicializando Three.js con HDR Dinámico...");
    const container = document.getElementById('threejs-container');

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0f18); // Negro Jungle muy oscuro

    camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 0, 3.8); // Ajustar según el tamaño del modelo (Ver imagen)

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setClearColor( 0x000000, 1 ); // Fondo negro absoluto para mayor contraste del glow

    // Activar renderizado HDR vital para materiales emisivos (Glow)
    renderer.outputEncoding = THREE.sRGBEncoding; 
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    container.appendChild(renderer.domElement);

    // CONFIGURACIÓN DE ILUMINACIÓN DE ESTUDIO (Mantenemos metalizado espectacular)
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.2); // Más luz general
    scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.5); 
    directionalLight.position.set(2, 2, 5);
    scene.add(directionalLight);

    const fillLight = new THREE.DirectionalLight(0xddddff, 1.0); // Luz azulada cinematográfica
    fillLight.position.set(-5, 3, -5);
    scene.add(fillLight);

    // CONFIGURACIÓN POST-PROCESAMIENTO: MOTOR DE BLOOM (LED Glow Reactivo)
    renderPass = new THREE.RenderPass(scene, camera);
    
    // bloomPass = new THREE.UnrealBloomPass( resolución, fuerza, radio, umbral )
    // strength (2.8): Mucha fuerza para ese efecto "sangrante".
    // radius (1.2): Radio amplio de dispersión de luz.
    // threshold (0.9): Umbral bajo para que los ojos y boca (que pondremos a 15.0) activen el neón.
    bloomPass = new THREE.UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 2.8, 1.2, 0.9);
    
    composer = new THREE.EffectComposer(renderer);
    composer.addPass(renderPass);
    composer.addPass(bloomPass);

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
// SECCIÓN 2: CARGADOR DE MODELO (SEPARACIÓN DE MATERIALES)
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

        // Limpiamos la colección global
        emissiveMaterials = [];

        // REINTEGRACIÓN MEJORADA: AJUSTE DE MATERIALES LED ROJOS (Glow Reactivo)
        // Travesamos el modelo de forma robótica buscando los materiales emisivos (ojos, boca)
        model.traverse((child) => {
            if (child.isMesh && child.material) {
                const materials = Array.isArray(child.material) ? child.material : [child.material];
                
                materials.forEach(mat => {
                    // Si el material tiene textura emisiva (brillo de ojos/boca rojos)
                    if (mat.emissive && (mat.emissive.r > 0 || mat.emissive.g > 0 || mat.emissive.b > 0)) {
                        // FIX: ROJO PROFUNDO Y SATURADO (HAL 9000)
                        mat.emissive.setHex(0xff0000);
                        mat.color.setHex(0x220000); // Oscurecemos el color base para evitar el blanco al brillar
                        
                        mat.emissiveIntensity = 15.0; // Intensidad base estable (sangrante pero estable)
                        emissiveMaterials.push(mat); 
                        console.log(`✨ LED Neón Sangrante Aislado en: ${child.name} (Material: ${mat.name})`);
                    } 
                    else {
                        // SI NO ES OJO NI BOCA: Nos aseguramos de apagar su emisión
                        mat.emissive.setHex(0x000000); 
                    }
                });
            }
        });

        scene.add(model);
        console.log("✅ Modelo 3D cargado correctamente con Ojos encendidos.");

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

    // FIX CLAVE: LATIDO LUMÍNICO ORGÁNICO
    // Si el avatar está hablando, calculamos la intensidad del brillo en tiempo real.
    if (avatarHablando && reproductorAnalyser && emissiveMaterials.length > 0) {
        reproductorAnalyser.getByteFrequencyData(dataArrayPlayback);
        
        // Calculamos el volumen promedio (Intensidad)
        let sum = 0;
        for (let i = 0; i < dataArrayPlayback.length; i++) {
            sum += dataArrayPlayback[i];
        }
        const averageVolume = sum / dataArrayPlayback.length; // Valor entre 0 y 255
        
        // Mapeo: Base 15.0, estalla hasta un máximo de 60.0 según volumen
        const dynamicIntensity = 15.0 + (averageVolume * (45.0 / 255.0));
        
        // Aplicamos el latido directamente a SOLO ojos y boca (SIN DEFORMACIÓN FÍSICA)
        emissiveMaterials.forEach(mat => mat.emissiveIntensity = dynamicIntensity);

    }

    // Renderizar a través del composer (con Bloom dinámico)
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
        
        // PREPARAR EL ANALIZADOR DE PLAYBACK (LIP-SYNC)
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
                        console.log("🚀 Frase terminada. Enviando al cerebro:", transcripcionAcumulada);
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
// SECCIÓN 3.5: LÓGICA DE PLAYBACK Y LIP-SYNC ORGÁNICO
// ==========================================

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
        
        // Creamos el elemento Audio nativo
        const reproductorElement = new Audio();
        reproductorElement.src = `/api/speak?text=${encodeURIComponent(data.text)}`;
        reproductorElement.crossOrigin = "anonymous"; // Vital para Firebase/CORS
        
        // Creamos el nodo de fuente de audio en el contexto existente
        const fuenteAudio = audioContext.createMediaElementSource(reproductorElement);
        
        // CONEXIÓN CLAVE: fuente -> analizador playback -> parlantes
        fuenteAudio.connect(reproductorAnalyser);
        reproductorAnalyser.connect(audioContext.destination);
        
        console.log("🔥 Lip-Sync Orgánico (Glow HDR) activado.");
        
        await reproductorElement.play();
        
        reproductorElement.onended = () => {
            avatarHablando = false; // El avatar termina de hablar
            resetearTemporizador();
            
            // VOLVEMOS AL GLOW BASE PASIVO (SIN DEFORMAR LA MALLA)
            emissiveMaterials.forEach(mat => {
                mat.emissiveIntensity = 15.0; // Volvemos al brillo base
            });
            console.log("⏹️ Avatar en silencio. Escuchando ambiente...");
        };
    } catch (error) {
        console.error("Error comunicando con Vercel:", error);
        avatarHablando = false;
        // Si hay error, también reseteamos el glow para no quedar pegado encendido.
        emissiveMaterials.forEach(mat => mat.emissiveIntensity = 15.0);
    }
}

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