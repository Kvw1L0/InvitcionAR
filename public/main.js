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
let emissiveMaterials = []; // Guardará EXCLUSIVAMENTE los ojos y la boca

const MODEL_PATH = 'https://firebasestorage.googleapis.com/v0/b/avatar-ia-84a80.firebasestorage.app/o/avatar-ia.glb?alt=media&token=541669a6-7baa-43d3-8f7e-4d4c2f07db8e'; 

// --- Variables de Audio VAD/WebSockets ---
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

// --- Variables de Audio Playback (Lip-sync) ---
let avatarHablando = false; 
let reproductorAnalyser; 
let dataArrayPlayback;   

// ==========================================
// SECCIÓN 1: MOTOR GRÁFICO (THREE.JS + BLOOM SELECTIVO)
// ==========================================

function initThreeJS() {
    console.log("⚙️ Inicializando Three.js para efecto Terminator...");
    const container = document.getElementById('threejs-container');

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0f18); 

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

    // RESTAURAMOS LA LUZ PARA EL METAL
    // Subimos la luz ambiental para que tu textura metálica original se vea increíble.
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7); 
    scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8); 
    directionalLight.position.set(2, 2, 5);
    scene.add(directionalLight);

    // BLOOM (Glow Sangrante)
    // Mantenemos el umbral alto (0.85) para que el metal no se contamine.
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

        // LA MAGIA: BÚSQUEDA POR LOS NOMBRES QUE PUSISTE EN BLENDER
        model.traverse((child) => {
            if (child.isMesh && child.material) {
                const materials = Array.isArray(child.material) ? child.material : [child.material];
                
                materials.forEach(mat => {
                    // Pasamos los nombres a minúsculas para evitar errores de mayúsculas
                    const meshName = child.name.toLowerCase();
                    const matName = mat.name.toLowerCase();

                    // Si la malla o el material contienen "ojo" o "boca"
                    if (meshName.includes('ojo') || meshName.includes('boca') || matName.includes('ojo') || matName.includes('boca')) {
                        // 1. Forzamos el color rojo sangre puro
                        mat.emissive.setHex(0xff0000);
                        // 2. Le damos el brillo base para el estado pasivo
                        mat.emissiveIntensity = 15.0; 
                        
                        emissiveMaterials.push(mat); 
                        console.log(`✨ LED ROJO CONECTADO en: ${mat.name} (Malla: ${child.name})`);
                    } 
                    else {
                        // SI NO ES OJO NI BOCA: Nos aseguramos de apagar su emisión
                        mat.emissive.setHex(0x000000); 
                        // NOTA: Ya no modificamos mat.color ni mat.metalness. 
                        // ¡Tu casco se verá exactamente como lo diseñaste en Blender!
                    }
                });
            }
        });

        scene.add(model);

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

    // LIP-SYNC DINÁMICO (LATIDO)
    if (avatarHablando && reproductorAnalyser && emissiveMaterials.length > 0) {
        reproductorAnalyser.getByteFrequencyData(dataArrayPlayback);
        
        let sum = 0;
        for (let i = 0; i < dataArrayPlayback.length; i++) {
            sum += dataArrayPlayback[i];
        }
        const averageVolume = sum / dataArrayPlayback.length; 
        
        // Mapeo: Base 15.0, Máximo 80.0 (Estallido rojo muy fuerte al hablar)
        const dynamicIntensity = 15.0 + (averageVolume * (65.0 / 255.0));
        
        // Aplicamos el latido SOLO a ojos y boca
        emissiveMaterials.forEach(mat => mat.emissiveIntensity = dynamicIntensity);
    }

    if (composer) {
        composer.render();
    }
}

// ==========================================
// SECCIÓN 3: MOTOR DE AUDIO Y WEBSOCKETS (IGUAL)
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

        avatarHablando = true; 
        
        const reproductorElement = new Audio();
        reproductorElement.src = `/api/speak?text=${encodeURIComponent(data.text)}`;
        reproductorElement.crossOrigin = "anonymous"; 
        
        const fuenteAudio = audioContext.createMediaElementSource(reproductorElement);
        fuenteAudio.connect(reproductorAnalyser);
        reproductorAnalyser.connect(audioContext.destination);
        
        console.log("🔥 Lip-Sync Dinámico (Latido LED) activado.");
        
        await reproductorElement.play();
        
        reproductorElement.onended = () => {
            avatarHablando = false; 
            resetearTemporizador();
            // VOLVER A LA INTENSIDAD BASE
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