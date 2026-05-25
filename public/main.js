// ==========================================
// SECCIÓN 0: VARIABLES GLOBALES (3D + AUDIO)
// ==========================================

function generarNuevoId() {
    return 'totem_user_' + Math.random().toString(36).substr(2, 9);
}

let userId = generarNuevoId();
let temporizadorInactividad;
const TIEMPO_ESPERA_MS = 45000; 

// --- Variables 3D (Three.js + Bloom Dinámico) ---
let scene, camera, renderer, model, mixer, composer, bloomPass; 
let controls, clock = new THREE.Clock(); 

// ÚNICA colección global: Solo para la luz de Ojos/Boca (Cero deformación)
let emissiveMaterials = []; 

// TOKEN DE FIREBASE ACTUALIZADO
const MODEL_PATH = 'https://firebasestorage.googleapis.com/v0/b/avatar-ia-84a80.firebasestorage.app/o/Moldels%2Favatar-ia.glb?alt=media&token=e6e64cf6-f39c-487d-9344-26ac71956d0c'; 

// --- Variables de Audio VAD/WebSockets ---
let audioContext, analyser, microphone, globalStream, mediaRecorder;
let isUserSpeaking = false; 
let silenceTimer = null;
let isCalibrating = false;
let avatarHablando = false; 
let baseNoiseFloor = 0; 
let dynamicVolumeThreshold = 15; 
const SIGNAL_TO_NOISE_MARGIN = 10; 
const SILENCE_DURATION = 600; 
let deepgramSocket, keepAliveInterval;
let transcripcionAcumulada = "";

// --- Variables de Audio Playback (Lip-sync Fotónico) ---
let reproductorAnalyser; 
let dataArrayPlayback;   

// ==========================================
// SECCIÓN 1: MOTOR GRÁFICO (BLOOM SELECTIVO HDR)
// ==========================================

function initThreeJS() {
    console.log("⚙️ Inicializando Three.js con HDR Dinámico (Efecto Plasma)...");
    const container = document.getElementById('threejs-container');

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x05080c); 

    camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 0, 3.8); 

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setClearColor( 0x000000, 1 ); 

    // Activar renderizado HDR vital para materiales emisivos (Glow)
    renderer.outputEncoding = THREE.sRGBEncoding; 
    renderer.toneMapping = THREE.NoToneMapping; 
    renderer.toneMappingExposure = 1.0;
    container.appendChild(renderer.domElement);

    // ILUMINACIÓN METÁLICA (Húmeda)
    scene.add(new THREE.AmbientLight(0xffffff, 1.2)); 
    const directionalLight = new THREE.DirectionalLight(0xffffff, 2.0); 
    directionalLight.position.set(0, 2, 5);
    scene.add(directionalLight);

    const fillLight = new THREE.DirectionalLight(0xddddff, 1.0); 
    fillLight.position.set(-5, 3, -5);
    scene.add(fillLight);

    // BLOOM (Glow LED)
    // Fuerza(3.0), Radio(1.5), Umbral(0.9) -> Contenido, no desparramado
    bloomPass = new THREE.UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 3.0, 1.5, 0.9);
    
    composer = new THREE.EffectComposer(renderer);
    composer.addPass(new THREE.RenderPass(scene, camera));
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
// SECCIÓN 2: CARGADOR DE MODELO (SEPARACIÓN QUIRÚRGICA)
// ==========================================

function loadModel() {
    console.log(`⚙️ Cargando nuevo modelo 3D desde Firebase...`);
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
                    const matName = mat.name.toLowerCase();
                    const meshName = child.name.toLowerCase();

                    // OJOS Y BOCA -> FUEGO ROJO PURO (Efecto Plasma)
                    if (matName.includes('ojo') || meshName.includes('ojo') || matName.includes('boca') || meshName.includes('boca')) {
                        mat.color.setHex(0x000000); // Base negra pura para contraste
                        mat.emissive.setHex(0xff0000); // Emisión roja máxima
                        mat.emissiveIntensity = 3.0;   // Intensidad idle base
                        mat.metalness = 0.0;           
                        mat.roughness = 1.0;           
                        
                        emissiveMaterials.push(mat); 
                        console.log(`🔥 Fuego Fotónico inyectado en: ${child.name}`);
                    } 
                    // CASCO Y CABEZA -> ACERO OSCURO Y BRILLANTE
                    else {
                        mat.emissive.setHex(0x000000); 
                        mat.emissiveIntensity = 0;
                        mat.metalness = 1.0;  
                        mat.roughness = 0.15; 
                        mat.color.setHex(0xaaaaaa); // Gris plata pulido
                        console.log(`🛡️ Acero Húmedo configurado en: ${child.name}`);
                    }
                });
            }
        });

        scene.add(model);
        console.log("✅ Modelo 3D cargado: Acero Húmedo y Fuego Rojo listos.");

        if (gltf.animations && gltf.animations.length > 0) {
            mixer = new THREE.AnimationMixer(model);
            gltf.animations.forEach((clip) => mixer.clipAction(clip).play());
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
    
    const time = Date.now() * 0.002;
    if (model) {
        model.position.y = Math.sin(time) * 0.15; // Flotación suave
    }

    // ==========================================
    // CORAZÓN FOTÓNICO (LIP-SYNC 100% LUZ, LECTURA DE PICOS AGRESIVA)
    // ==========================================
    if (emissiveMaterials.length > 0) {
        
        // ESTADO 1: HABLANDO
        if (avatarHablando && reproductorAnalyser) {
            reproductorAnalyser.getByteFrequencyData(dataArrayPlayback);
            
            // Buscar el pico máximo de volumen (0 a 255)
            let maxVolume = 0;
            for (let i = 0; i < dataArrayPlayback.length; i++) {
                if (dataArrayPlayback[i] > maxVolume) {
                    maxVolume = dataArrayPlayback[i];
                }
            }
            
            // Curva de escalado exponencial: Intensidad extrema (Volumen al cuadrado)
            const volumeRatio = maxVolume / 255.0;
            const dynamicIntensity = 3.0 + (volumeRatio * volumeRatio) * 120.0;
            
            emissiveMaterials.forEach(mat => {
                mat.emissiveIntensity = dynamicIntensity;
            });
        } 
        
        // ESTADO 2: SILENCIO (Respiración de lava)
        else {
            const idlePulse = 3.0 + Math.sin(time * 3.0) * 1.5; // Respiración sutil
            emissiveMaterials.forEach(mat => {
                mat.emissiveIntensity = idlePulse;
            });
        }
    }

    if (composer) {
        composer.render();
    }
}

// ==========================================
// SECCIÓN 3: MOTOR DE AUDIO Y WEBSOCKETS (INTACTO)
// ==========================================

function reiniciarSesionTotem() {
    userId = generarNuevoId();
    console.log("🔄 Sesión reiniciada. Tótem listo para: " + userId);
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
            clearInterval(keepAliveInterval);
            if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop();
            setTimeout(conectarDeepgramYGrabar, 1000); 
        };
    } catch (error) {
        console.error("Error conectando a Deepgram:", error);
    }
}

// --- CREACIÓN FORZADA DEL CONTEXTO DE AUDIO AL CLIC ---
async function inicializarAudioYMicrofono() {
    try {
        // Obligatorio crear el contexto DENTRO de la función disparada por el botón
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        if (audioContext.state === 'suspended') {
            await audioContext.resume();
        }

        reproductorAnalyser = audioContext.createAnalyser();
        reproductorAnalyser.fftSize = 256; 
        dataArrayPlayback = new Uint8Array(reproductorAnalyser.frequencyBinCount);

        globalStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 512;
        analyser.smoothingTimeConstant = 0.2;
        microphone = audioContext.createMediaStreamSource(globalStream);
        microphone.connect(analyser);
        
        await conectarDeepgramYGrabar(); 
        console.log("🎤 Micrófono y Analizador conectados correctamente.");
        calibrarRuidoAmbiente();
    } catch (err) {
        console.error("Error inicializando audio:", err);
    }
}

function calibrarRuidoAmbiente() {
    isCalibrating = true;
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
        if (!isUserSpeaking) isUserSpeaking = true;
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
// SECCIÓN 3.5: LÓGICA DE PLAYBACK (BYPASS CORS)
// ==========================================

async function enviarTextoAlCerebro(textoUsuario) {
    try {
        console.log("🧠 Pensando respuesta para:", textoUsuario);
        const respuestaChat = await fetch(`/api/chat?userId=${userId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: textoUsuario.trim() })
        });
        if (!respuestaChat.ok) throw new Error("Error IA");
        const data = await respuestaChat.json();
        
        console.log("🤖 IA responde:", data.text);
        
        // VITAL: Asegurar que el contexto está despierto antes de inyectar audio
        if (audioContext && audioContext.state === 'suspended') {
            await audioContext.resume();
        }
        
        const audioResponse = await fetch(`/api/speak?text=${encodeURIComponent(data.text)}`);
        const arrayBuffer = await audioResponse.arrayBuffer();
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
        
        const source = audioContext.createBufferSource();
        source.buffer = audioBuffer;
        
        // CONECTAR AL ANALIZADOR Y A LOS PARLANTES
        source.connect(reproductorAnalyser);
        reproductorAnalyser.connect(audioContext.destination);
        
        avatarHablando = true; 
        console.log("🔥 Destellos reactivos activados.");
        
        source.start(0);
        
        source.onended = () => {
            avatarHablando = false; 
            resetearTemporizador();
            console.log("⏹️ Avatar en silencio. Escuchando ambiente...");
        };
    } catch (error) {
        console.error("Error comunicando:", error);
        avatarHablando = false;
    }
}

// ==========================================
// ARRANQUE DEL SISTEMA
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    const btnIniciar = document.getElementById('btnIniciar');
    if (btnIniciar) {
        btnIniciar.addEventListener('click', () => {
            btnIniciar.style.display = 'none'; 
            initThreeJS();
            loadModel();
            // LA CLAVE: Inicializar todo el motor de audio exactamente aquí
            inicializarAudioYMicrofono(); 
            resetearTemporizador();
        });
    }
});