// ==========================================
// SECCIÓN 0: VARIABLES GLOBALES (3D + AUDIO)
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

const MODEL_PATH = 'https://firebasestorage.googleapis.com/v0/b/avatar-ia-84a80.firebasestorage.app/o/Moldels%2Favatar-ia.glb?alt=media&token=e6e64cf6-f39c-487d-9344-26ac71956d0c'; 

// --- Variables de Audio ---
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

let reproductorAnalyser; 
let dataArrayPlayback;   

// ==========================================
// SECCIÓN 1: MOTOR GRÁFICO (BLOOM POTENCIADO)
// ==========================================

function initThreeJS() {
    console.log("⚙️ Inicializando Three.js: Fulgor Radioactivo Activado...");
    const container = document.getElementById('threejs-container');

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x05080c); 

    camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 0, 3.8); 

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setClearColor( 0x000000, 1 ); 
    renderer.outputEncoding = THREE.sRGBEncoding; 
    renderer.toneMapping = THREE.NoToneMapping; 
    container.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0xffffff, 1.5));
    const directionalLight = new THREE.DirectionalLight(0xffffff, 2.0); 
    directionalLight.position.set(0, 2, 5);
    scene.add(directionalLight);

    // BLOOM POTENCIADO (Fuerza 4.0 para fulgor real)
    bloomPass = new THREE.UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 4.0, 1.5, 0.8);
    
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
// SECCIÓN 2: CARGADOR DE MODELO
// ==========================================

function loadModel() {
    const loader = new THREE.GLTFLoader();
    loader.setCrossOrigin('anonymous');

    loader.load(MODEL_PATH, (gltf) => {
        model = gltf.scene;
        model.scale.set(1, 1, 1); 
        model.position.set(0, 0, 0); 
        emissiveMaterials = [];

        model.traverse((child) => {
            if (child.isMesh && child.material) {
                const name = child.name.toLowerCase();
                const matName = child.material.name.toLowerCase();

                if (name.includes('ojo') || name.includes('boca') || matName.includes('ojo') || matName.includes('boca')) {
                    child.material.emissive.setHex(0xff0000);
                    child.material.color.setHex(0x000000); // Negro puro para contraste de lava
                    child.material.emissiveIntensity = 3.0;
                    emissiveMaterials.push(child.material);
                } else {
                    child.material.emissive.setHex(0x000000);
                    child.material.metalness = 1.0;
                    child.material.roughness = 0.15;
                    child.material.color.setHex(0xaaaaaa); // Acero gris
                }
            }
        });

        scene.add(model);
        document.getElementById('overlay').style.display = 'none';
        animate(); 
    });
}

// ==========================================
// SECCIÓN 3: ANIMACIÓN Y REACTIVIDAD
// ==========================================
function animate() {
    requestAnimationFrame(animate);
    const time = clock.getElapsedTime();
    
    if (model) model.position.y = Math.sin(time) * 0.15;

    if (emissiveMaterials.length > 0) {
        if (avatarHablando && reproductorAnalyser) {
            reproductorAnalyser.getByteFrequencyData(dataArrayPlayback);
            
            // BUSCAMOS EL PICO MÁXIMO (más reactivo que el promedio)
            let maxVolume = 0;
            for (let i = 0; i < dataArrayPlayback.length; i++) {
                if (dataArrayPlayback[i] > maxVolume) maxVolume = dataArrayPlayback[i];
            }
            
            // Multiplicador 150.0 para un fulgor agresivo
            const dynamicIntensity = 3.0 + (maxVolume / 255.0) * 150.0;
            emissiveMaterials.forEach(mat => mat.emissiveIntensity = dynamicIntensity);
        } else {
            // Respiración de lava (3.0 a 6.0)
            const idlePulse = 4.5 + Math.sin(time * 3.0) * 1.5; 
            emissiveMaterials.forEach(mat => mat.emissiveIntensity = idlePulse);
        }
    }
    composer.render();
}

// ==========================================
// SECCIÓN 4: AUDIO (Mismo motor que te funciona)
// ==========================================
// ... (Aquí mantén tus funciones de audio actuales: conectarDeepgramYGrabar, inicializarMicrofonoVAD, monitorearVolumen, enviarTextoAlCerebro, etc.)

// AVISO: Asegúrate de que tu función 'enviarTextoAlCerebro' llame a:
// source.connect(reproductorAnalyser);
// reproductorAnalyser.connect(audioContext.destination);