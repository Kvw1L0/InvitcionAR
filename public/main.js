// ==========================================
// SECCIÓN 0: VARIABLES GLOBALES
// ==========================================
let scene, camera, renderer, model, composer, bloomPass;
let clock = new THREE.Clock();
let emissiveMaterials = []; 
let avatarHablando = false;
let reproductorAnalyser;
let dataArrayPlayback;
let audioContext;

const MODEL_PATH = 'https://firebasestorage.googleapis.com/v0/b/avatar-ia-84a80.firebasestorage.app/o/Moldels%2Favatar-ia.glb?alt=media&token=e6e64cf6-f39c-487d-9344-26ac71956d0c';

// ==========================================
// SECCIÓN 1: INICIALIZACIÓN
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('btnIniciar');
    if(btn) btn.onclick = () => {
        btn.style.display = 'none';
        document.getElementById('overlay').style.display = 'none';
        iniciarTodo();
    };
});

async function iniciarTodo() {
    // 1. Crear contexto de audio inmediatamente al hacer click
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    
    // 2. Inicializar Gráficos
    initThreeJS();
    loadModel();
    
    // 3. Inicializar Analizador de audio de playback (el que da la luz)
    reproductorAnalyser = audioContext.createAnalyser();
    reproductorAnalyser.fftSize = 256;
    dataArrayPlayback = new Uint8Array(reproductorAnalyser.frequencyBinCount);
    
    console.log("✅ Sistema de audio y gráficos listo.");
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

    // Luces
    scene.add(new THREE.AmbientLight(0xffffff, 1.2));
    const dLight = new THREE.DirectionalLight(0xffffff, 2.0);
    dLight.position.set(0, 0, 5);
    scene.add(dLight);

    // Bloom fuerte
    bloomPass = new THREE.UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 3.0, 1.5, 0.9);
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
                
                // Ojos/Boca: Fuego Rojo
                if (name.includes('ojo') || name.includes('boca')) {
                    child.material.emissive.setHex(0xff0000);
                    child.material.color.setHex(0x000000);
                    child.material.emissiveIntensity = 2.0;
                    emissiveMaterials.push(child.material);
                } 
                // Metal: Gris
                else {
                    child.material.emissive.setHex(0x000000);
                    child.material.metalness = 1.0;
                    child.material.roughness = 0.15;
                    child.material.color.setHex(0xaaaaaa);
                }
            }
        });
        animate();
    });
}

// ==========================================
// SECCIÓN 3: ANIMACIÓN (EL LATIDO)
// ==========================================
function animate() {
    requestAnimationFrame(animate);
    const time = clock.getElapsedTime();
    
    // RESPIRACIÓN IDLE O LATIDO HABLANDO
    if (emissiveMaterials.length > 0) {
        if (avatarHablando) {
            reproductorAnalyser.getByteFrequencyData(dataArrayPlayback);
            let maxVol = 0;
            for (let i = 0; i < dataArrayPlayback.length; i++) if(dataArrayPlayback[i] > maxVol) maxVol = dataArrayPlayback[i];
            
            // Si maxVol > 0, dispara luz (hasta 100.0)
            const intensity = 3.0 + (maxVol / 255.0) * 100.0;
            emissiveMaterials.forEach(m => m.emissiveIntensity = intensity);
        } else {
            // Respiración inactiva suave
            const pulse = 3.0 + Math.sin(time * 3.0) * 2.0;
            emissiveMaterials.forEach(m => m.emissiveIntensity = pulse);
        }
    }
    composer.render();
}

// ==========================================
// SECCIÓN 4: AUDIO (BYPASS CORS)
// ==========================================
async function procesarRespuestaIA(text) {
    try {
        console.log("⬇️ Procesando audio IA...");
        const res = await fetch(`/api/speak?text=${encodeURIComponent(text)}`);
        const arrayBuffer = await res.arrayBuffer();
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
        
        const source = audioContext.createBufferSource();
        source.buffer = audioBuffer;
        
        // CONEXIÓN CRÍTICA
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