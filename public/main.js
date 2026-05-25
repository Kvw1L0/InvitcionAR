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
let clock = new THREE.Clock(); 

// Colección para la intensidad lumínica (Lava)
let emissiveMaterials = []; 

// TU NUEVO TOKEN DE FIREBASE INTEGRADO
const MODEL_PATH = 'https://firebasestorage.googleapis.com/v0/b/avatar-ia-84a80.firebasestorage.app/o/Moldels%2Favatar-ia.glb?alt=media&token=e6e64cf6-f39c-487d-9344-26ac71956d0c'; 

// --- Variables de Audio ---
let audioContext, analyser, microphone, globalStream;
let avatarHablando = false; 
let reproductorAnalyser; 
let dataArrayPlayback;   

// ==========================================
// SECCIÓN 1: MOTOR GRÁFICO (BLOOM HDR)
// ==========================================

function initThreeJS() {
    console.log("⚙️ Inicializando Motor: Metal Gris + Lava Fotónica");
    const container = document.getElementById('threejs-container');

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x05080c); 

    camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 0, 3.8); 

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setClearColor(0x000000, 1); 

    // HDR / Color Management
    renderer.outputEncoding = THREE.sRGBEncoding; 
    renderer.toneMapping = THREE.NoToneMapping; 
    container.appendChild(renderer.domElement);

    // ILUMINACIÓN METÁLICA (Tres puntos)
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.2); 
    scene.add(ambientLight);
    
    const frontLight = new THREE.DirectionalLight(0xffffff, 2.0); 
    frontLight.position.set(0, 0, 5); 
    scene.add(frontLight);

    // BLOOM (Lava Sangrante)
    bloomPass = new THREE.UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 3.0, 1.5, 0.9);
    composer = new THREE.EffectComposer(renderer);
    composer.addPass(new THREE.RenderPass(scene, camera));
    composer.addPass(bloomPass);

    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
        composer.setSize(window.innerWidth, window.innerHeight);
    });
}

// ==========================================
// SECCIÓN 2: CARGADOR DE MODELO (METAL VS LAVA)
// ==========================================

function loadModel() {
    const loader = new THREE.GLTFLoader();
    loader.setCrossOrigin('anonymous');

    loader.load(MODEL_PATH, (gltf) => {
        model = gltf.scene;
        model.scale.set(1, 1, 1); 

        model.traverse((child) => {
            if (child.isMesh && child.material) {
                const name = child.name.toLowerCase();
                const matName = child.material.name.toLowerCase();

                // FUEGO LAVA (Ojos/Boca)
                if (name.includes('ojo') || name.includes('boca') || matName.includes('ojo') || matName.includes('boca')) {
                    child.material.emissive.setHex(0xff0000);
                    child.material.color.setHex(0x000000); // Negro puro base
                    child.material.emissiveIntensity = 5.0; // Intensidad base
                    emissiveMaterials.push(child.material);
                } 
                // METAL GRIS
                else {
                    child.material.emissive.setHex(0x000000);
                    child.material.metalness = 1.0;
                    child.material.roughness = 0.2;
                    child.material.color.setHex(0xaaaaaa); // Gris sólido
                }
            }
        });

        scene.add(model);
        document.getElementById('overlay').style.display = 'none';
        animate(); 
    });
}

function animate() {
    requestAnimationFrame(animate);
    
    // RESPIRACIÓN IDLE O LATIDO HABLANDO
    if (emissiveMaterials.length > 0) {
        if (avatarHablando && reproductorAnalyser) {
            reproductorAnalyser.getByteFrequencyData(dataArrayPlayback);
            let maxVol = 0;
            for (let i = 0; i < dataArrayPlayback.length; i++) if(dataArrayPlayback[i] > maxVol) maxVol = dataArrayPlayback[i];
            
            // Intensidad de destello: 3.0 a 60.0 (Fulgor intenso)
            const intensity = 3.0 + (maxVol / 255.0) * 57.0;
            emissiveMaterials.forEach(m => m.emissiveIntensity = intensity);
        } else {
            // Respiración lava: 2.0 a 5.0
            const time = clock.getElapsedTime();
            const pulse = 3.5 + Math.sin(time * 2.0) * 1.5;
            emissiveMaterials.forEach(m => m.emissiveIntensity = pulse);
        }
    }

    composer.render();
}

// ==========================================
// SECCIÓN 3: AUDIO Y Lógica de destello (Bypass CORS)
// ==========================================
// (Aquí va tu lógica de audio VAD y el fetch con arrayBuffer de la sección anterior)
// Nota: Asegúrate de tener tu lógica de audio intacta, solo asegúrate de conectar:
// fuenteAudio.connect(reproductorAnalyser);
// reproductorAnalyser.connect(audioContext.destination);