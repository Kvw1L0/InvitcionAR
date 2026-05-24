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

// ÚNICA colección global: Solo para el color neón sangrante (Ojos/Boca)
// Hemos eliminado "glowingMeshes" porque ya no deformaremos la geometría física.
let emissiveMaterials = []; 

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

// --- Variables de Audio Playback (Lip-sync lumínico) ---
let reproductorAnalyser; 
let dataArrayPlayback;   

// ==========================================
// SECCIÓN 1: MOTOR GRÁFICO (THREE.JS + BLOOM SELECTIVO HDR)
// ==========================================

function initThreeJS() {
    console.log("⚙️ Inicializando Three.js: Casco Fijo y Luces Dinámicas...");
    const container = document.getElementById('threejs-container');

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0f18); 

    camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 0, 3.8); 

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setClearColor( 0x000000, 1 ); 

    // NO TONE MAPPING: Mantiene el rojo profundo sin volverlo blanco
    renderer.outputEncoding = THREE.sRGBEncoding; 
    renderer.toneMapping = THREE.NoToneMapping; 
    container.appendChild(renderer.domElement);

    // ILUMINACIÓN NATURAL METÁLICA
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.2); 
    scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.5); 
    directionalLight.position.set(2, 2, 5);
    scene.add(directionalLight);

    const fillLight = new THREE.DirectionalLight(0xddddff, 1.0); 
    fillLight.position.set(-5, 3, -5);
    scene.add(fillLight);

    // BLOOM (Glow Sangrante) - Threshold alto (1.5) para no teñir el metal
    bloomPass = new THREE.UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 2.8, 1.2, 1.5);
    
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
// SECCIÓN 2: CARGADOR DE MODELO (TARGETING POR NOMBRE)
// ==========================================

function loadModel() {
    console.log(`⚙️ Cargando modelo 3D desde Firebase...`);
    const loader = new THREE.GLTFLoader();
    loader.setCrossOrigin('anonymous');

    loader.load(MODEL_PATH, (gltf) => {
        model = gltf.scene;
        model.scale.set(1, 1, 1); 
        model.position.set(0, 0, 0); 

        emissiveMaterials = [];

        // TRAVERSAL QUIRÚRGICO
        model.traverse((child) => {
            if (child.isMesh && child.material) {
                const materials = Array.isArray(child.material) ? child.material : [child.material];
                
                materials.forEach(mat => {
                    const matName = mat.name.toLowerCase();
                    const meshName = child.name.toLowerCase();

                    // Ojos o Boca -> FULGOR ROJO
                    if (matName.includes('ojo') || meshName.includes('ojo') || matName.includes('boca') || meshName.includes('boca')) {
                        mat.emissive.setHex(0xff0000);
                        mat.color.setHex(0x220000); 
                        mat.emissiveIntensity = 15.0; // Glow pasivo base
                        
                        emissiveMaterials.push(mat); 
                        console.log(`✨ Luz Neón asignada a: ${child.name}`);
                    } 
                    // Casco/Resto -> GRIS METÁLICO PURO
                    else {
                        mat.emissive.setHex(0x000000); 
                        mat.emissiveIntensity = 0;
                        mat.metalness = 1.0;  
                        mat.roughness = 0.35; 
                        mat.color.setHex(0xffffff); // Gris neutro para no contaminar
                        console.log(`🛡️ Metal Gris configurado en: ${child.name}`);
                    }
                });
            }
        });

        scene.add(model);
        console.log("✅ Modelo 3D cargado: Texturas metálicas y LEDs rojos listos.");

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
    
    if (model) {
        const time = Date.now() * 0.002;
        model.position.y = Math.sin(time) * 0.15; 
    }

    // LIP-SYNC LUMÍNICO PURAMENTE INTENSIVO (Cero deformación de escala)
    if (avatarHablando && reproductorAnalyser && emissiveMaterials.length > 0) {
        reproductorAnalyser.getByteFrequencyData(dataArrayPlayback);
        
        let sum = 0;
        for (let i = 0; i < dataArrayPlayback.length; i++) {
            sum += dataArrayPlayback[i];
        }
        const averageVolume = sum / dataArrayPlayback.length; 
        
        // El rojo sangrante late desde 15.0 (silencio) hasta 60.0 (hablando fuerte)
        const dynamicIntensity = 15.0 + (averageVolume * (45.0 / 255.0));
        
        emissiveMaterials.forEach(mat => mat.emissiveIntensity = dynamicIntensity);
    }

    if (composer) {
        composer.render();
    }
}

// ==========================================
// SECCIÓN 3: MOTOR DE AUDIO Y WEBSOCKETS (IGUAL QUE ANTES)
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
        
        reproductorAnalyser = audioContext.createAnalyser();
        reproductorAnalyser.fftSize = 256; 
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
// SECCIÓN 3.5: LÓGICA DE PLAYBACK (SOLO LUZ)
// ==========================================

async function enviarTextoAlCerebro(textoUsuario) {
    try {
        console.log("🧠 Pensando respuesta...");
        const respuestaChat = await fetch(`/api/chat?userId=${userId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: textoUsuario.trim() })
        });
        if (!respuestaChat.ok) throw new Error("Error en el servidor de IA");
        const data = await respuestaChat.json();
        
        avatarHablando = true; 
        const reproductor = new Audio();
        reproductor.src = `/api/speak?text=${encodeURIComponent(data.text)}`;
        reproductor.crossOrigin = "anonymous"; 
        
        const fuenteAudio = audioContext.createMediaElementSource(reproductor);
        fuenteAudio.connect(reproductorAnalyser);
        reproductorAnalyser.connect(audioContext.destination);
        
        console.log("🔥 Latido lumínico de voz activado.");
        
        await reproductor.play();
        
        reproductor.onended = () => {
            avatarHablando = false; 
            resetearTemporizador();
            
            // VOLVEMOS AL GLOW BASE PASIVO
            emissiveMaterials.forEach(mat => mat.emissiveIntensity = 15.0);
            console.log("⏹️ Avatar en silencio.");
        };
    } catch (error) {
        console.error("Error comunicando:", error);
        avatarHablando = false;
        emissiveMaterials.forEach(mat => mat.emissiveIntensity = 15.0);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const btnIniciar = document.getElementById('btnIniciar');
    if (btnIniciar) {
        btnIniciar.addEventListener('click', () => {
            btnIniciar.style.display = 'none'; 
            initThreeJS();
            loadModel();
            inicializarMicrofonoVAD(); 
            resetearTemporizador();
        });
    }
});