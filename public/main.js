// ==========================================
// SECCIÓN 0: VARIABLES GLOBALES
// ==========================================
const MODEL_PATH = 'https://firebasestorage.googleapis.com/v0/b/avatar-ia-84a80.firebasestorage.app/o/Moldels%2Favatar-ia.glb?alt=media&token=e6e64cf6-f39c-487d-9344-26ac71956d0c';

let scene, camera, renderer, model, composer, bloomPass;
let clock = new THREE.Clock();
let emissiveMaterials = []; // Solo para Ojos y Boca
let avatarHablando = false;
let reproductorAnalyser, dataArrayPlayback;
let audioContext;

// ==========================================
// SECCIÓN 1: INICIALIZACIÓN (Blindaje del DOM)
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    const btnIniciar = document.getElementById('btnIniciar');
    if (btnIniciar) {
        btnIniciar.addEventListener('click', () => {
            console.log("🚀 Usuario inició la experiencia.");
            btnIniciar.style.display = 'none';
            document.getElementById('overlay').style.display = 'none';
            iniciarExperiencia();
        });
    }
});

function iniciarExperiencia() {
    initThreeJS();
    loadModel();
    inicializarAudio();
}

// ==========================================
// SECCIÓN 2: MOTOR GRÁFICO (METAL Y LAVA)
// ==========================================
function initThreeJS() {
    const container = document.getElementById('threejs-container');
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x05080c);

    camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 0, 3.8);

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.toneMapping = THREE.NoToneMapping;
    container.appendChild(renderer.domElement);

    // Luces para metal "húmedo"
    scene.add(new THREE.AmbientLight(0xffffff, 1.2));
    const dLight = new THREE.DirectionalLight(0xffffff, 2.0);
    dLight.position.set(0, 2, 5);
    scene.add(dLight);

    // Bloom (Fuego neón)
    bloomPass = new THREE.UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 3.0, 1.2, 0.9);
    composer = new THREE.EffectComposer(renderer);
    composer.addPass(new THREE.RenderPass(scene, camera));
    composer.addPass(bloomPass);
}

function loadModel() {
    const loader = new THREE.GLTFLoader();
    loader.setCrossOrigin('anonymous');
    loader.load(MODEL_PATH, (gltf) => {
        model = gltf.scene;
        scene.add(model);

        model.traverse((child) => {
            if (child.isMesh && child.material) {
                const name = child.name.toLowerCase();
                const matName = child.material.name.toLowerCase();

                if (name.includes('ojo') || name.includes('boca') || matName.includes('ojo') || matName.includes('boca')) {
                    child.material.emissive.setHex(0xff0000);
                    child.material.color.setHex(0x000000);
                    child.material.metalness = 0.0;
                    child.material.roughness = 1.0;
                    child.material.emissiveIntensity = 3.0;
                    emissiveMaterials.push(child.material);
                } else {
                    child.material.emissive.setHex(0x000000);
                    child.material.metalness = 1.0;
                    child.material.roughness = 0.15; // Húmedo
                    child.material.color.setHex(0xaaaaaa); // Gris sólido
                }
            }
        });
        animate();
    });
}

function animate() {
    requestAnimationFrame(animate);
    const time = clock.getElapsedTime();
    
    // RESPIRACIÓN IDLE O LATIDO HABLANDO
    if (emissiveMaterials.length > 0) {
        if (avatarHablando && reproductorAnalyser) {
            reproductorAnalyser.getByteFrequencyData(dataArrayPlayback);
            let maxVol = 0;
            for (let i = 0; i < dataArrayPlayback.length; i++) if(dataArrayPlayback[i] > maxVol) maxVol = dataArrayPlayback[i];
            
            // Intensidad destello (Máx 70.0)
            const intensity = 3.0 + (maxVol / 255.0) * 67.0;
            emissiveMaterials.forEach(m => m.emissiveIntensity = intensity);
        } else {
            // Respiración lava inactiva
            const pulse = 3.0 + Math.sin(time * 3.0) * 1.5;
            emissiveMaterials.forEach(m => m.emissiveIntensity = pulse);
        }
    }
    composer.render();
}

// ==========================================
// SECCIÓN 3: MOTOR DE AUDIO (PLAYBACK)
// ==========================================
function inicializarAudio() {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    reproductorAnalyser = audioContext.createAnalyser();
    reproductorAnalyser.fftSize = 256;
    dataArrayPlayback = new Uint8Array(reproductorAnalyser.frequencyBinCount);
}

// Lógica de respuesta (Inyectar audio directamente al analizador)
async function procesarRespuestaIA(text) {
    try {
        const audioResponse = await fetch(`/api/speak?text=${encodeURIComponent(text)}`);
        const arrayBuffer = await audioResponse.arrayBuffer();
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
        
        const source = audioContext.createBufferSource();
        source.buffer = audioBuffer;
        
        source.connect(reproductorAnalyser);
        reproductorAnalyser.connect(audioContext.destination);
        
        avatarHablando = true;
        source.start(0);
        
        source.onended = () => {
            avatarHablando = false;
        };
    } catch (e) {
        console.error("Error audio:", e);
        avatarHablando = false;
    }
}