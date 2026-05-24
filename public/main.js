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

let emissiveMaterials = []; // Para el color
let glowingMeshes = [];     // NUEVO: Para la deformación (escala) de ojos y boca

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
    console.log("⚙️ Inicializando Three.js: Iluminación Natural y Rojo Saturado...");
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

    // FIX 1: ILUMINACIÓN NATURAL Y REFLEJOS METÁLICOS
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.2); // Luz base fuerte
    scene.add(ambientLight);
    
    const mainLight = new THREE.DirectionalLight(0xffffff, 1.5); // Foco principal
    mainLight.position.set(2, 4, 5);
    scene.add(mainLight);

    const backLight = new THREE.DirectionalLight(0x88bbff, 1.0); // Relleno azulado cinematográfico
    backLight.position.set(-5, 3, -5);
    scene.add(backLight);

    // FIX 2: BLOOM SELECTIVO (Umbral = 1.0)
    // El umbral en 1.0 asegura que la luz natural del metal NUNCA brille.
    // Solo lo que tenga emisividad mayor a 1.0 (nuestros LEDs) activará el neón.
    bloomPass = new THREE.UnrealBloomPass( new THREE.Vector2( window.innerWidth, window.innerHeight ), 2.5, 0.8, 1.0 );
    
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
    console.log(`⚙️ Cargando modelo 3D...`);
    const loader = new THREE.GLTFLoader();
    loader.setCrossOrigin('anonymous');

    loader.load(MODEL_PATH, (gltf) => {
        model = gltf.scene;
        model.scale.set(1, 1, 1); 
        model.position.set(0, 0, 0); 

        emissiveMaterials = [];
        glowingMeshes = [];

        model.traverse((child) => {
            if (child.isMesh && child.material) {
                const materials = Array.isArray(child.material) ? child.material : [child.material];
                
                materials.forEach(mat => {
                    const matName = mat.name.toLowerCase();
                    const meshName = child.name.toLowerCase();

                    // IDENTIFICAMOS OJOS Y BOCA
                    if (matName.includes('ojo') || matName.includes('boca') || meshName.includes('ojo') || meshName.includes('boca')) {
                        
                        // FIX 3: EL ROJO SATURADO
                        mat.emissive.setHex(0xff0000);
                        mat.color.setHex(0x550000); // Color base oscuro para evitar quemado blanco
                        mat.emissiveIntensity = 2.0; // Intensidad base controlada
                        
                        emissiveMaterials.push(mat); 
                        glowingMeshes.push(child); // Guardamos la malla para deformarla luego
                        
                        // Centramos el punto de anclaje de la malla para que al escalar lo haga desde su propio centro
                        child.geometry.computeBoundingBox();
                    } 
                    else {
                        // FIX 4: METALES REALISTAS
                        // Solo apagamos la emisión de luz, pero forzamos el brillo metálico.
                        mat.emissive.setHex(0x000000); 
                        mat.metalness = 0.9;
                        mat.roughness = 0.2; // Muy pulido para reflejar el entorno
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

    // FIX 5: DEFORMACIÓN Y LIP-SYNC ORGÁNICO
    if (avatarHablando && reproductorAnalyser && emissiveMaterials.length > 0) {
        reproductorAnalyser.getByteFrequencyData(dataArrayPlayback);
        
        let sum = 0;
        for (let i = 0; i < dataArrayPlayback.length; i++) {
            sum += dataArrayPlayback[i];
        }
        const averageVolume = sum / dataArrayPlayback.length; 
        
        // 1. Color/Glow: Mantenemos el multiplicador bajo (máx 8.0) para que el rojo no se vuelva blanco.
        const dynamicIntensity = 2.0 + (averageVolume * (6.0 / 255.0));
        emissiveMaterials.forEach(mat => mat.emissiveIntensity = dynamicIntensity);

        // 2. Deformación Procedural (Escala de mallas)
        glowingMeshes.forEach(mesh => {
            const name = mesh.name.toLowerCase();
            if (name.includes('boca')) {
                // Abre la boca (estira el eje Y) hasta el doble de su tamaño según el volumen
                const scaleY = 1.0 + (averageVolume * (1.2 / 255.0)); 
                mesh.scale.y = scaleY;
            } else if (name.includes('ojo')) {
                // Los ojos laten creciendo un poco en todos sus ejes
                const scaleAll = 1.0 + (averageVolume * (0.2 / 255.0));
                mesh.scale.set(scaleAll, scaleAll, scaleAll);
            }
        });

    } else if (glowingMeshes.length > 0) {
        // Cuando no habla, restauramos la forma original
        glowingMeshes.forEach(mesh => mesh.scale.set(1, 1, 1));
    }

    if (composer) {
        composer.render();
    }
}

// ==========================================
// SECCIÓN 3: MOTOR DE AUDIO Y WEBSOCKETS (ENTRADA MICRÓFONO - IGUAL)
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
        
        console.log("🔥 Lip-Sync y Deformación activados.");
        
        await reproductorElement.play();
        
        reproductorElement.onended = () => {
            avatarHablando = false; 
            resetearTemporizador();
            if (emissiveMaterials.length > 0) {
                emissiveMaterials.forEach(mat => mat.emissiveIntensity = 2.0);
            }
        };
    } catch (error) {
        console.error("Error comunicando:", error);
        avatarHablando = false;
        if (emissiveMaterials.length > 0) {
            emissiveMaterials.forEach(mat => mat.emissiveIntensity = 2.0);
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