// ==========================================
// SECCIÓN 0: VARIABLES GLOBALES
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
let targetMouthScale = 1.0;
let currentMouthScale = 1.0;
const LERP_FACTOR = 0.15; // Suavizado de articulación

const MODEL_PATH = 'https://firebasestorage.googleapis.com/v0/b/avatar-ia-84a80.firebasestorage.app/o/Moldels%2Favatar-ia.glb?alt=media&token=e6e64cf6-f39c-487d-9344-26ac71956d0c'; 

// --- Variables de Audio ---
let audioContext, analyser, microphone, globalStream;
let avatarHablando = false; 
let reproductorAnalyser, dataArrayPlayback;   

// ==========================================
// SECCIÓN 1: MOTOR GRÁFICO (BLOOM + HDR)
// ==========================================

function initThreeJS() {
    console.log("⚙️ Inicializando Motor: Titán Oscuro + Plasma Rojo...");
    const container = document.getElementById('threejs-container');

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x05080c); 

    camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 0, 3.8); 

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setClearColor( 0x000000, 1 ); 
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    container.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0xffffff, 0.8));
    const dLight = new THREE.DirectionalLight(0xffffff, 2.5);
    dLight.position.set(0, 2, 5);
    scene.add(dLight);

    // BLOOM ACOTADO: Radio pequeño para no manchar el metal
    bloomPass = new THREE.UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 2.5, 0.4, 0.85);
    
    composer = new THREE.EffectComposer(renderer);
    composer.addPass(new THREE.RenderPass(scene, camera));
    composer.addPass(bloomPass);
}

// ==========================================
// SECCIÓN 2: CARGADOR DE MODELO Y MATERIALES
// ==========================================

function loadModel() {
    const loader = new THREE.GLTFLoader();
    loader.setCrossOrigin('anonymous');

    loader.load(MODEL_PATH, (gltf) => {
        model = gltf.scene;
        scene.add(model);

        model.traverse((child) => {
            if (child.isMesh && child.material) {
                const name = child.name.toLowerCase();
                
                // OJOS Y BOCA -> PLASMA ROJO
                if (name.includes('ojo') || name.includes('boca')) {
                    child.material.color.setHex(0x000000); // Base negra
                    child.material.emissive.setHex(0xff0000); 
                    child.material.emissiveIntensity = 3.0;
                    emissiveMaterials.push(child.material);
                } 
                // METAL -> TITANIO
                else {
                    child.material.emissive.setHex(0x000000);
                    child.material.metalness = 1.0;
                    child.material.roughness = 0.15;
                    child.material.color.setHex(0x555555); // Gris titanio
                }
            }
        });
        document.getElementById('overlay').style.display = 'none';
        animate(); 
    });
}

// ==========================================
// SECCIÓN 3: LÓGICA DE ANIMACIÓN (LERP + PICOS)
// ==========================================

function animate() {
    requestAnimationFrame(animate);
    const time = clock.getElapsedTime();
    
    if (model) model.position.y = Math.sin(time) * 0.15;

    // Lógica de "Lipsync" Fotónico
    if (avatarHablando && reproductorAnalyser) {
        reproductorAnalyser.getByteFrequencyData(dataArrayPlayback);
        
        let maxVol = 0;
        for (let i = 0; i < dataArrayPlayback.length; i++) if(dataArrayPlayback[i] > maxVol) maxVol = dataArrayPlayback[i];

        // Intensidad (x100 para el fulgor)
        const targetIntensity = 3.0 + (maxVol / 255.0) * 100.0;
        emissiveMaterials.forEach(mat => mat.emissiveIntensity += (targetIntensity - mat.emissiveIntensity) * LERP_FACTOR);

        // Deformación de boca (Escala Y suave)
        targetMouthScale = 1.0 + (maxVol / 255.0) * 0.3;
    } else {
        // Respiración en reposo
        const idlePulse = 3.0 + Math.sin(time * 3.0) * 1.5;
        emissiveMaterials.forEach(mat => mat.emissiveIntensity += (idlePulse - mat.emissiveIntensity) * LERP_FACTOR);
        targetMouthScale = 1.0;
    }

    // Aplicar deformación con interpolación
    currentMouthScale += (targetMouthScale - currentMouthScale) * LERP_FACTOR;
    model.traverse((child) => {
        if (child.name.toLowerCase().includes('boca')) child.scale.y = currentMouthScale;
    });

    composer.render();
}

// ==========================================
// SECCIÓN 4: AUDIO (BYPASS CORS + LOGS)
// ==========================================

async function enviarTextoAlCerebro(textoUsuario) {
    console.log("🧠 Pensando respuesta para:", textoUsuario);
    try {
        const res = await fetch(`/api/chat?userId=${userId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: textoUsuario.trim() })
        });
        const data = await res.json();
        console.log("🤖 IA responde:", data.text);
        
        if (audioContext.state === 'suspended') await audioContext.resume();
        
        const audioRes = await fetch(`/api/speak?text=${encodeURIComponent(data.text)}`);
        const buffer = await audioContext.decodeAudioData(await audioRes.arrayBuffer());
        const source = audioContext.createBufferSource();
        source.buffer = buffer;
        
        source.connect(reproductorAnalyser);
        reproductorAnalyser.connect(audioContext.destination);
        
        avatarHablando = true;
        console.log("🔥 Lip-Sync Orgánico activado.");
        source.start(0);
        
        source.onended = () => {
            avatarHablando = false;
            console.log("⏹️ Avatar en silencio.");
        };
    } catch (e) {
        console.error("Error en flujo de voz:", e);
    }
}

// Inicialización de audio al hacer clic en el botón
async function iniciarSistema() {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    reproductorAnalyser = audioContext.createAnalyser();
    reproductorAnalyser.fftSize = 256;
    dataArrayPlayback = new Uint8Array(reproductorAnalyser.frequencyBinCount);
    
    initThreeJS();
    loadModel();
    // Aquí iría tu lógica de inicializarMicrofonoVAD()
}

document.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('btnIniciar');
    if(btn) btn.onclick = () => { btn.style.display = 'none'; iniciarSistema(); };
});