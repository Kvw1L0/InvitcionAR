// ==========================================
// SECCIÓN 0: VARIABLES GLOBALES (3D + AUDIO)
// ==========================================

// --- Variables del Tótem/BTL ---
let userId = generarNuevoId();
let temporizadorInactividad;
const TIEMPO_ESPERA_MS = 45000; // 45s de inactividad para resetear

// --- Variables 3D (Three.js) ---
let scene, camera, renderer, model, mixer; // mixer es para las animaciones futuras
let controls;
// BUSCA ESTA LÍNEA Y AJUSTA LA RUTA DE TU MODELO GLTF/GLB
const MODEL_PATH = 'https://firebasestorage.googleapis.com/v0/b/avatar-ia-84a80.firebasestorage.app/o/avatar-ia.glb?alt=media&token=541669a6-7baa-43d3-8f7e-4d4c2f07db8e';
// --- Variables de Audio VAD/WebSockets (El motor que ya funciona) ---
let audioContext, analyser, microphone, globalStream, mediaRecorder;
let isUserSpeaking = false; 
let silenceTimer = null;
let isCalibrating = false;
let avatarHablando = false; 
let baseNoiseFloor = 0; 
let dynamicVolumeThreshold = 15; 
const SIGNAL_TO_NOISE_MARGIN = 10; 
const SILENCE_DURATION = 600; // Latencia extrema: 600ms de silencio
let deepgramSocket, keepAliveInterval;
let transcripcionAcumulada = "";

// ==========================================
// SECCIÓN 1: MOTOR GRÁFICO (THREE.JS setup)
// ==========================================

function initThreeJS() {
    console.log("⚙️ Inicializando Three.js...");
    const container = document.getElementById('threejs-container');

    // 1. Escena y Fondo (coincidiendo con el CSS)
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x111827); 

    // 2. Cámara (Perspectiva estándar para BTL)
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 1.6, 3); // Posición a altura de los ojos (1.6m)

    // 3. Renderizado (con suavizado de bordes/antialias)
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.outputEncoding = THREE.sRGBEncoding; // Colores correctos para GLTF
    container.appendChild(renderer.domElement);

    // 4. Luces (Asegurando que el modelo se vea bien)
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
    scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    directionalLight.position.set(1, 2, 3);
    scene.add(directionalLight);

    // 5. Controles (Para testeo, permite rotar con el mouse)
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enablePan = false; // Solo rotar y zoom
    controls.target.set(0, 1.4, 0); // Enfocar a la cara
    controls.update();

    // Escuchar redimensionado de ventana
    window.addEventListener('resize', onWindowResize, false);
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// ==========================================
// SECCIÓN 2: CARGADOR DE MODELO (GLTFLoader)
// ==========================================

function loadModel() {
    console.log(`⚙️ Cargando modelo 3D desde: ${MODEL_PATH}...`);
    const loader = new THREE.GLTFLoader();

    loader.load(MODEL_PATH, (gltf) => {
        model = gltf.scene;
        model.scale.set(1, 1, 1); // Ajustar escala si es necesario
        model.position.set(0, 0, 0); // En el suelo
        scene.add(model);
        console.log("✅ Modelo 3D cargado correctamente.");

        // Ocultar la pantalla de carga (overlay)
        document.getElementById('overlay').style.display = 'none';

        // Arrancamos el bucle de renderizado
        animate(); 

    }, (xhr) => {
        // Log opcional de progreso de carga
        // console.log( (xhr.loaded / xhr.total * 100) + '% cargado' );
    }, (error) => {
        console.error("❌ Error cargando el modelo GLTF:", error);
        alert(`Error cargando el modelo: ${MODEL_PATH}. Revisa la consola.`);
    });
}

// Bucle de animación/renderizado
function animate() {
    requestAnimationFrame(animate);
    
    if (controls) controls.update(); // Actualizar OrbitControls
    if (mixer) mixer.update(0.016); // Actualizar animaciones futuras

    renderer.render(scene, camera);
}

// ==========================================
// SECCIÓN 3: MOTOR DE AUDIO VAD/WEBSOCKET
// ==========================================
// (Aquí copiamos tu código funcional de audio tal cual)

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
                // FIX: Filtramos aquí. Si el avatar está hablando, ignoramos el texto.
                if (texto !== "" && isUserSpeaking && !avatarHablando) {
                    transcripcionAcumulada += texto + " ";
                    console.log("📝 Escuchando:", transcripcionAcumulada);
                }
            }
        };

        deepgramSocket.onclose = () => {
            console.log("⚠️ Deepgram desconectado. Reconstruyendo...");
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
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        globalStream = stream; // Guardar flujo global
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 512;
        analyser.smoothingTimeConstant = 0.2;
        microphone = audioContext.createMediaStreamSource(stream);
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
        console.log(`✅ Calibración lista. Umbral de voz: ${dynamicVolumeThreshold.toFixed(2)}`);
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
            console.log(`🎙️ Voz detectada. Capturando phrase...`);
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
        console.log("🧠 Pensando:", textoUsuario);
        const respuestaChat = await fetch(`/api/chat?userId=${userId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: textoUsuario.trim() })
        });
        if (!respuestaChat.ok) throw new Error("Error en IA");
        const data = await respuestaChat.json();
        console.log("🤖 IA responde:", data.text);
        avatarHablando = true; 
        const reproductor = new Audio();
        reproductor.src = `/api/speak?text=${encodeURIComponent(data.text)}`;
        await reproductor.play();
        reproductor.onended = () => {
            avatarHablando = false; 
            resetearTemporizador();
            console.log("⏹️ Avatar terminó. Escuchando ambiente...");
        };
    } catch (error) {
        console.error("Error comunicando con Vercel:", error);
        avatarHablando = false;
    }
}

// ==========================================
// SECCIÓN 4: MEMORIA Y ARRANQUE (BOTÓN BTL)
// ==========================================

function generarNuevoId() { return 'totem_user_' + Math.random().toString(36).substr(2, 9); }
function resetearTemporizador() {
    clearTimeout(temporizadorInactividad);
    temporizadorInactividad = setTimeout(reiniciarSesionTotem, TIEMPO_ESPERA_MS);
}

document.addEventListener('DOMContentLoaded', () => {
    const btnIniciar = document.getElementById('btnIniciar');
    
    // Al hacer clic, arranca la magia 3D y de audio
    btnIniciar.addEventListener('click', () => {
        console.log("🚀 Iniciando sistema Jungle...");
        
        // 1. Iniciar Three.js
        initThreeJS();
        // 2. Cargar el Modelo (esto ocultará el overlay al terminar)
        loadModel(); 
        // 3. Encender el micrófono
        inicializarMicrofonoVAD();
        resetearTemporizador();
    });
});