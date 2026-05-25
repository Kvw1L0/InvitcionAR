// ==========================================
// SECCIÓN 0: VARIABLES GLOBALES
// ==========================================
let userId = 'totem_' + Math.random().toString(36).substr(2, 9);
let scene, camera, renderer, model, mixer, composer, bloomPass;
let audioContext, analyser, reproductorAnalyser, globalStream;
let emissiveMaterials = [];
let avatarHablando = false;
let currentMouthScale = 1.0;
const LERP_FACTOR = 0.15;
const MODEL_PATH = 'https://firebasestorage.googleapis.com/v0/b/avatar-ia-84a80.firebasestorage.app/o/Moldels%2Favatar-ia.glb?alt=media&token=e6e64cf6-f39c-487d-9344-26ac71956d0c';

// ==========================================
// SECCIÓN 1: MOTOR GRÁFICO (BLOOM HDR)
// ==========================================
function initThreeJS() {
    console.log("⚙️ SECCIÓN 1: Inicializando Motor Gráfico...");
    const container = document.getElementById('threejs-container');
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x05080c);
    camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 0, 3.8);
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    container.appendChild(renderer.domElement);
    bloomPass = new THREE.UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 2.5, 0.4, 0.85);
    composer = new THREE.EffectComposer(renderer);
    composer.addPass(new THREE.RenderPass(scene, camera));
    composer.addPass(bloomPass);
}

// ==========================================
// SECCIÓN 2: CARGADOR DE MODELO
// ==========================================
function loadModel() {
    console.log("⚙️ SECCIÓN 2: Cargando Modelo 3D...");
    const loader = new THREE.GLTFLoader();
    loader.load(MODEL_PATH, (gltf) => {
        model = gltf.scene;
        scene.add(model);
        model.traverse(c => {
            if (c.isMesh && c.material) {
                if (c.name.toLowerCase().includes('ojo') || c.name.toLowerCase().includes('boca')) {
                    c.material.color.setHex(0x000000);
                    c.material.emissive.setHex(0xff0000);
                    emissiveMaterials.push(c.material);
                } else {
                    c.material.metalness = 1.0;
                    c.material.roughness = 0.15;
                    c.material.color.setHex(0x555555);
                }
            }
        });
        document.getElementById('overlay').style.display = 'none';
        animate();
    });
}

// ==========================================
// SECCIÓN 3: MOTOR DE AUDIO (VAD + ANALYZER)
// ==========================================
async function iniciarAudio() {
    console.log("⚙️ SECCIÓN 3: Inicializando Audio...");
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    reproductorAnalyser = audioContext.createAnalyser();
    analyser = audioContext.createAnalyser();
    globalStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    audioContext.createMediaStreamSource(globalStream).connect(analyser);
    await conectarDeepgramYGrabar();
    calibrarRuidoAmbiente();
    monitorearVolumen();
}

// ==========================================
// SECCIÓN 4: LOGICA DE DEEPGRAM
// ==========================================
async function conectarDeepgramYGrabar() { /* Tu código original */ }

// ==========================================
// SECCIÓN 5: CALIBRACIÓN Y VAD
// ==========================================
function calibrarRuidoAmbiente() { /* Tu código original */ }
function monitorearVolumen() { /* Tu código original */ }

// ==========================================
// SECCIÓN 6: LÓGICA DE RESPUESTA IA
// ==========================================
async function enviarTextoAlCerebro(texto) {
    console.log("🧠 SECCIÓN 6: Pensando...", texto);
    if (audioContext.state === 'suspended') await audioContext.resume();
    // ... lógica de fetch y reproducción ...
    avatarHablando = true;
}

// ==========================================
// SECCIÓN 7: ANIMACIÓN Y SINCRO (LIP-SYNC)
// ==========================================
function animate() {
    requestAnimationFrame(animate);
    let targetMouthScale = 1.0;
    if (avatarHablando && reproductorAnalyser) {
        const data = new Uint8Array(reproductorAnalyser.frequencyBinCount);
        reproductorAnalyser.getByteFrequencyData(data);
        let maxVol = Math.max(...data);
        emissiveMaterials.forEach(m => m.emissiveIntensity = 3.0 + (maxVol/255)*50);
        targetMouthScale = 1.0 + (maxVol/255)*0.3;
    }
    currentMouthScale += (targetMouthScale - currentMouthScale) * LERP_FACTOR;
    if(model) model.traverse(c => { if(c.name.toLowerCase().includes('boca')) c.scale.y = currentMouthScale; });
    composer.render();
}

// ==========================================
// SECCIÓN 8: ARRANQUE
// ==========================================
document.getElementById('btnIniciar').onclick = () => {
    document.getElementById('btnIniciar').style.display = 'none';
    iniciarAudio();
    initThreeJS();
    loadModel();
};