// ==========================================
// SECCIÓN 0: VARIABLES GLOBALES (3D, AUDIO Y ANIMACIÓN)
// ==========================================

function generarNuevoId() {
    return 'totem_user_' + Math.random().toString(36).substr(2, 9);
}

let userId = generarNuevoId();
let temporizadorInactividad;
const TIEMPO_ESPERA_MS = 45000; 

// --- Variables 3D ---
let scene, camera, renderer, model, mixer, composer, bloomPass; 
let controls, clock = new THREE.Clock(); 
let emissiveMaterials = []; 

// --- Variables de Animación y Estados (NUEVO) ---
let iaPensando = false; 
let avatarHablando = false; 

// Interpoladores (LERP) para movimientos fluidos
let currentMouthScale = 1.0;
let targetMouthScale = 1.0;
let currentRotationX = 0;
let targetRotationX = 0;
let currentRotationY = 0;
let targetRotationY = 0;
const LERP_FACTOR = 0.2; // Controla la suavidad de la boca y la luz
const LERP_ROTATION = 0.05; // Controla la suavidad del giro de cabeza

const MODEL_PATH = 'https://firebasestorage.googleapis.com/v0/b/avatar-ia-84a80.firebasestorage.app/o/Moldels%2Favatar-ia.glb?alt=media&token=e6e64cf6-f39c-487d-9344-26ac71956d0c'; 

// --- Variables de Audio VAD/WebSockets ---
let audioContext, analyser, reproductorAnalyser, microphone, globalStream, mediaRecorder;
let isUserSpeaking = false; 
let silenceTimer = null;
let isCalibrating = false;
let baseNoiseFloor = 0; 
let dynamicVolumeThreshold = 15; 
const SIGNAL_TO_NOISE_MARGIN = 10; 
const SILENCE_DURATION = 600; 
let deepgramSocket, keepAliveInterval;
let transcripcionAcumulada = "";
let dataArrayPlayback;   

// ==========================================
// SECCIÓN 1: MOTOR GRÁFICO (NÚCLEO RADIACTIVO)
// ==========================================

function initThreeJS() {
    console.log("⚙️ SECCIÓN 1: Inicializando Motor - HDR y Efecto Plasma...");
    const container = document.getElementById('threejs-container');

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x05080c); 

    camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 0, 3.8); 

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setClearColor( 0x000000, 1 ); 

    // ACESFilmic oscurece los tonos base y permite que los emisores altos brillen como fuego
    renderer.outputEncoding = THREE.sRGBEncoding; 
    renderer.toneMapping = THREE.ACESFilmicToneMapping; 
    renderer.toneMappingExposure = 1.0;
    container.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0xffffff, 1.0)); 
    const directionalLight = new THREE.DirectionalLight(0xffffff, 2.5); 
    directionalLight.position.set(0, 2, 5);
    scene.add(directionalLight);

    const fillLight = new THREE.DirectionalLight(0xddddff, 0.8); 
    fillLight.position.set(-5, 3, -5);
    scene.add(fillLight);

    // BLOOM CALIBRADO: Threshold en 0.85 asegura que solo el "núcleo" de la luz genere resplandor
    bloomPass = new THREE.UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 2.5, 1.2, 0.85);
    
    composer = new THREE.EffectComposer(renderer);
    composer.addPass(new THREE.RenderPass(scene, camera));
    composer.addPass(bloomPass);

    window.addEventListener('resize', onWindowResize, false);
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    if (composer) composer.setSize( window.innerWidth, window.innerHeight );
}

// ==========================================
// SECCIÓN 2: CARGADOR DE MODELO (TEXTURAS)
// ==========================================

function loadModel() {
    console.log("⚙️ SECCIÓN 2: Cargando Modelo 3D...");
    const loader = new THREE.GLTFLoader();
    loader.setCrossOrigin('anonymous');

    loader.load(MODEL_PATH, (gltf) => {
        model = gltf.scene;
        model.scale.set(1, 1, 1); 
        model.position.set(0, 0, 0); 
        emissiveMaterials = [];

        model.traverse((child) => {
            if (child.isMesh && child.material) {
                const materials = Array.isArray(child.material) ? child.material : [child.material];
                materials.forEach(mat => {
                    const name = child.name.toLowerCase();
                    
                    // OJOS Y BOCA -> NÚCLEO RADIACTIVO
                    if (name.includes('ojo') || name.includes('boca')) {
                        mat.color.setHex(0x000000); // Base negra para contraste extremo
                        mat.emissive.setHex(0xff0000); // Rojo puro
                        mat.emissiveIntensity = 2.0;   // Intensidad base
                        mat.metalness = 0.0;           
                        mat.roughness = 1.0;           
                        // Añadimos una propiedad custom para guardar su intensidad objetivo para el LERP
                        mat.userData.targetIntensity = 2.0; 
                        emissiveMaterials.push(mat); 
                    } 
                    // CASCO -> METAL PULIDO (Cero contaminación de luz)
                    else {
                        mat.emissive.setHex(0x000000); 
                        mat.emissiveIntensity = 0;
                        mat.metalness = 1.0;  
                        mat.roughness = 0.15; 
                        mat.color.setHex(0x555555); // Titanio
                    }
                });
            }
        });

        scene.add(model);
        console.log("✅ Modelo cargado. Materiales aislados.");
        document.getElementById('overlay').style.display = 'none';
        animate(); 
    });
}

// ==========================================
// SECCIÓN 3: MOTOR DE AUDIO (UNIFICADO)
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

    globalStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    microphone = audioContext.createMediaStreamSource(globalStream);
    microphone.connect(analyser);
    
    await conectarDeepgramYGrabar(); 
    calibrarRuidoAmbiente();
}

// ==========================================
// SECCIÓN 4: DEEPGRAM WEBSOCKET
// ==========================================

async function conectarDeepgramYGrabar() {
    try {
        console.log("⚡ SECCIÓN 4: Conectando a Deepgram...");
        const res = await fetch('/api/deepgram-token');
        const data = await res.json();
        const url = 'wss://api.deepgram.com/v1/listen?language=es&model=nova-2&smart_format=true&mimetype=audio/webm';
        
        deepgramSocket = new WebSocket(url, ['token', data.key]);
        deepgramSocket.onopen = () => {
            console.log("✅ Deepgram en vivo.");
            mediaRecorder = new MediaRecorder(globalStream, { mimeType: 'audio/webm' });
            mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0 && deepgramSocket.readyState === 1) {
                    deepgramSocket.send(event.data); 
                }
            };
            mediaRecorder.start(250); 
            keepAliveInterval = setInterval(() => {
                if (deepgramSocket.readyState === 1) deepgramSocket.send(JSON.stringify({ type: "KeepAlive" }));
            }, 8000);
        };
        deepgramSocket.onmessage = (message) => {
            const respuesta = JSON.parse(message.data);
            if (respuesta.is_final && respuesta.channel && respuesta.channel.alternatives[0].transcript) {
                const texto = respuesta.channel.alternatives[0].transcript.trim();
                if (texto !== "" && !avatarHablando && !iaPensando) {
                    transcripcionAcumulada += texto + " ";
                    console.log("📝 Escuchando:", transcripcionAcumulada);
                }
            }
        };
        deepgramSocket.onclose = () => {
            clearInterval(keepAliveInterval);
            if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop();
            setTimeout(conectarDeepgramYGrabar, 1000); 
        };
    } catch (error) { console.error("Error Deepgram:", error); }
}

// ==========================================
// SECCIÓN 5: CALIBRACIÓN Y VAD
// ==========================================

function calibrarRuidoAmbiente() {
    isCalibrating = true;
    console.log("⚙️ SECCIÓN 5: Calibrando ruido...");
    let totalVolume = 0; let sampleCount = 0;
    const calibracionInterval = setInterval(() => {
        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(dataArray);
        let sum = 0; for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
        totalVolume += (sum / dataArray.length); sampleCount++;
    }, 100); 
    
    setTimeout(() => {
        clearInterval(calibracionInterval);
        baseNoiseFloor = totalVolume / sampleCount;
        dynamicVolumeThreshold = baseNoiseFloor + SIGNAL_TO_NOISE_MARGIN;
        isCalibrating = false;
        console.log(`✅ Umbral seteado en: ${dynamicVolumeThreshold.toFixed(2)}`);
        monitorearVolumen();
    }, 3000);
}

function monitorearVolumen() {
    if (isCalibrating || avatarHablando || iaPensando) {
        requestAnimationFrame(monitorearVolumen); return; 
    }
    
    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(dataArray);
    let sum = 0; for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
    const averageVolume = sum / dataArray.length;
    
    if (averageVolume > dynamicVolumeThreshold) {
        clearTimeout(temporizadorInactividad); 
        if (!isUserSpeaking) {
            console.log(`🎙️ Voz detectada...`);
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
// SECCIÓN 6: ESTADOS IA Y PLAYBACK (BYPASS)
// ==========================================

async function enviarTextoAlCerebro(textoUsuario) {
    try {
        // --- ESTADO: PENSANDO (Activa la animación de latencia) ---
        iaPensando = true;
        console.log("🧠 SECCIÓN 6: Pensando respuesta para:", textoUsuario);
        
        const respuestaChat = await fetch(`/api/chat?userId=${userId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: textoUsuario.trim() })
        });
        const data = await respuestaChat.json();
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
        avatarHablando = true; 
        console.log("🔥 Lip-Sync y Animación Facial activada.");
        
        source.start(0);
        
        source.onended = () => {
            avatarHablando = false; 
            temporizadorInactividad = setTimeout(reiniciarSesionTotem, TIEMPO_ESPERA_MS);
            console.log("⏹️ Avatar en silencio. Escuchando ambiente...");
        };
    } catch (error) {
        console.error("Error comunicando:", error);
        iaPensando = false;
        avatarHablando = false;
    }
}

function reiniciarSesionTotem() {
    userId = generarNuevoId();
    console.log("🔄 Sesión reiniciada. Tótem libre.");
    calibrarRuidoAmbiente(); 
}

// ==========================================
// SECCIÓN 7: MOTOR DE ANIMACIÓN (LERP + SINCRO MÁXIMA)
// ==========================================

function animate() {
    requestAnimationFrame(animate);
    const time = clock.getElapsedTime();
    
    // 1. GESTIÓN DE ESTADOS (MÁQUINA DE ANIMACIÓN)
    if (iaPensando) {
        // Gira la cabeza buscando información en la nube
        targetRotationY = Math.sin(time * 2.0) * 0.3; // Lados
        targetRotationX = Math.cos(time * 1.5) * 0.15 - 0.05; // Arriba/Abajo
        targetMouthScale = 1.0; // Boca cerrada
        
        // Ojos palpitan como si estuviera procesando datos
        emissiveMaterials.forEach(mat => mat.userData.targetIntensity = 2.0 + Math.sin(time * 8.0) * 4.0);
        
    } else if (avatarHablando && reproductorAnalyser) {
        // Mira fijamente al usuario mientras habla
        targetRotationY = 0; 
        targetRotationX = 0;
        
        reproductorAnalyser.getByteFrequencyData(dataArrayPlayback);
        let maxVolume = 0;
        for (let i = 0; i < dataArrayPlayback.length; i++) {
            if (dataArrayPlayback[i] > maxVolume) maxVolume = dataArrayPlayback[i];
        }
        
        const volumeRatio = maxVolume / 255.0;
        
        // Mapeo a apertura de boca (Escala Y)
        targetMouthScale = 1.0 + (volumeRatio * 0.45); // Se abre hasta 45% más
        
        // Mapeo a intensidad lumínica (Picos altos queman en blanco, bajos quedan rojos)
        const reactIntensity = 2.0 + (volumeRatio * volumeRatio) * 35.0; 
        emissiveMaterials.forEach(mat => mat.userData.targetIntensity = reactIntensity);
        
    } else {
        // Estado Reposo: Micro movimientos orgánicos
        targetRotationY = Math.sin(time * 0.5) * 0.05; 
        targetRotationX = 0;
        targetMouthScale = 1.0;
        // Respiración suave tipo lava
        emissiveMaterials.forEach(mat => mat.userData.targetIntensity = 2.0 + Math.sin(time * 3.0) * 1.0);
    }

    // 2. APLICACIÓN DE MATEMÁTICA FLUIDA (LERP)
    currentRotationX += (targetRotationX - currentRotationX) * LERP_ROTATION;
    currentRotationY += (targetRotationY - currentRotationY) * LERP_ROTATION;
    currentMouthScale += (targetMouthScale - currentMouthScale) * LERP_FACTOR;

    // 3. APLICACIÓN A LA MALLA (3D)
    if (model) {
        // Movimiento de cabeza y flotación
        model.rotation.x = currentRotationX;
        model.rotation.y = currentRotationY;
        model.position.y = Math.sin(time) * 0.1; 

        // Modificación de geometría (Boca)
        model.traverse((child) => {
            if (child.name.toLowerCase().includes('boca')) {
                child.scale.set(1, currentMouthScale, 1); 
            }
        });
    }

    // 4. APLICACIÓN DE LUZ FLUIDA
    emissiveMaterials.forEach(mat => {
        mat.emissiveIntensity += (mat.userData.targetIntensity - mat.emissiveIntensity) * LERP_FACTOR;
    });

    if (composer) composer.render();
}

// ==========================================
// SECCIÓN 8: ARRANQUE DE SISTEMA
// ==========================================

document.addEventListener('DOMContentLoaded', () => {
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