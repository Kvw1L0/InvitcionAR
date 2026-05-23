import * as THREE from 'https://esm.sh/three@0.136.0';
import { GLTFLoader } from 'https://esm.sh/three@0.136.0/examples/jsm/loaders/GLTFLoader.js';
import { EffectComposer } from 'https://esm.sh/three@0.136.0/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'https://esm.sh/three@0.136.0/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'https://esm.sh/three@0.136.0/examples/jsm/postprocessing/UnrealBloomPass.js';
import { RoomEnvironment } from 'https://esm.sh/three@0.136.0/examples/jsm/environments/RoomEnvironment.js';

// ==========================================
// 1. CONFIGURACIÓN DE ESCENA
// ==========================================
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x020000); 

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 0, 7.5); 

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0; 
document.body.appendChild(renderer.domElement);

// ==========================================
// 2. ENTORNO Y LUCES
// ==========================================
const pmremGenerator = new THREE.PMREMGenerator(renderer);
scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;

const ambientLight = new THREE.AmbientLight(0xffffff, 1.2); 
scene.add(ambientLight);
const frontalLight = new THREE.DirectionalLight(0xffffff, 1.5); 
frontalLight.position.set(0, 2, 5);
scene.add(frontalLight);

// ==========================================
// 3. VARIABLES GLOBALES 
// ==========================================
let materialBoca = null;
let materialOjoDerecho = null;
let materialOjoIzquierdo = null;
let avatarModel = null; 

// Variables para el Cerebro y Audio
const objetivoPosicion = new THREE.Vector3(0, 0, 0);
const objetivoRotacion = new THREE.Euler(0, 0, 0);
let audioAnalyser = null;
let dataArray = null;

// ==========================================
// 4. SISTEMA DE AUDIO (WEB AUDIO API)
// ==========================================
async function iniciarAudio() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const source = audioContext.createMediaStreamSource(stream);
        
        audioAnalyser = audioContext.createAnalyser();
        audioAnalyser.fftSize = 256; // Precisión del muestreo de frecuencias
        source.connect(audioAnalyser);
        
        dataArray = new Uint8Array(audioAnalyser.frequencyBinCount);
        console.log("Micrófono conectado. Analizador listo.");
    } catch (err) {
        console.error("Error al acceder al micrófono:", err);
    }
}

// Botón de Interfaz (Requisito de navegadores para iniciar audio)
const btnStart = document.createElement('button');
btnStart.innerText = "INICIAR SISTEMA";
btnStart.style.position = 'absolute';
btnStart.style.top = '50%';
btnStart.style.left = '50%';
btnStart.style.transform = 'translate(-50%, -50%)';
btnStart.style.padding = '20px 40px';
btnStart.style.fontSize = '24px';
btnStart.style.fontWeight = 'bold';
btnStart.style.color = '#fff';
btnStart.style.backgroundColor = 'rgba(255, 0, 0, 0.7)';
btnStart.style.border = '2px solid #ff0000';
btnStart.style.cursor = 'pointer';
btnStart.style.zIndex = '100';
document.body.appendChild(btnStart);

btnStart.addEventListener('click', () => {
    iniciarAudio();
    btnStart.style.display = 'none'; // Ocultar botón tras hacer clic
});

// ==========================================
// 5. LÓGICA DE MOVIMIENTO
// ==========================================
function pensarSiguienteMovimiento() {
    objetivoRotacion.y = (Math.random() - 0.5) * 1.0; 
    objetivoRotacion.x = (Math.random() - 0.5) * 0.3; 
    objetivoRotacion.z = (Math.random() - 0.5) * 0.1; 
    objetivoPosicion.x = (Math.random() - 0.5) * 1.5; 
    
    const tiempoEspera = 2000 + Math.random() * 4000;
    setTimeout(pensarSiguienteMovimiento, tiempoEspera);
}

// ==========================================
// 6. CARGAR AVATAR (FIREBASE)
// ==========================================
const urlModelo = 'https://firebasestorage.googleapis.com/v0/b/avatar-ia-84a80.firebasestorage.app/o/Moldels%2Favatar-ia.glb?alt=media&token=1b020122-46cf-43dd-aadc-c3676760ba1f';
const loader = new GLTFLoader();
loader.load(urlModelo, (gltf) => {
    avatarModel = gltf.scene; 
    scene.add(avatarModel);
    
    const box = new THREE.Box3().setFromObject(avatarModel);
    const center = box.getCenter(new THREE.Vector3());
    avatarModel.position.sub(center);

    avatarModel.traverse((child) => {
        if (child.isMesh) {
            const name = child.name.toLowerCase();
            if (name.includes('boca')) {
                materialBoca = child.material;
                materialBoca.emissive = new THREE.Color(0xff0000);
                materialBoca.emissiveIntensity = 1.0; // Empieza apagada
            }
            if (name.includes('ojo_derecho')) {
                materialOjoDerecho = child.material;
                materialOjoDerecho.emissive = new THREE.Color(0xff0000);
                materialOjoDerecho.emissiveIntensity = 20.0;
            }
            if (name.includes('ojo_izquierdo')) {
                materialOjoIzquierdo = child.material;
                materialOjoIzquierdo.emissive = new THREE.Color(0xff0000);
                materialOjoIzquierdo.emissiveIntensity = 20.0;
            }
        }
    });
    pensarSiguienteMovimiento();
});

// ==========================================
// 7. EFECTO NEÓN (BLOOM)
// ==========================================
const renderScene = new RenderPass(scene, camera);
const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight), 
    3.0, 1.0, 0.95  
);
const composer = new EffectComposer(renderer);
composer.addPass(renderScene);
composer.addPass(bloomPass);

// ==========================================
// 8. BUCLE DE ANIMACIÓN
// ==========================================
const clock = new THREE.Clock();

function animate() {
    requestAnimationFrame(animate);
    const elapsedTime = clock.getElapsedTime();

    // Latido de ojos
    if (materialOjoDerecho && materialOjoIzquierdo) {
        const latido = 20.0 + Math.sin(elapsedTime * 4) * 10.0;
        materialOjoDerecho.emissiveIntensity = latido;
        materialOjoIzquierdo.emissiveIntensity = latido;
    }

    // REACTIVIDAD DE LA BOCA AL MICRÓFONO
    if (audioAnalyser && dataArray && materialBoca) {
        audioAnalyser.getByteFrequencyData(dataArray);
        
        // Calcular el promedio de volumen (de 0 a 255)
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
            sum += dataArray[i];
        }
        let promedioVolumen = sum / dataArray.length;

        // Mapear el volumen a intensidad LED (Si hay silencio es 1.0, si gritas sube hasta 40.0)
        let intensidadObjetivo = 1.0 + (promedioVolumen / 255) * 40.0;

        // Lerp: Suaviza la transición de la luz para que no se vea errática
        materialBoca.emissiveIntensity = THREE.MathUtils.lerp(materialBoca.emissiveIntensity, intensidadObjetivo, 0.3);
    }

    // Movimiento
    if (avatarModel) {
        avatarModel.rotation.y = THREE.MathUtils.lerp(avatarModel.rotation.y, objetivoRotacion.y, 0.02);
        avatarModel.rotation.x = THREE.MathUtils.lerp(avatarModel.rotation.x, objetivoRotacion.x, 0.02);
        avatarModel.rotation.z = THREE.MathUtils.lerp(avatarModel.rotation.z, objetivoRotacion.z, 0.02);
        avatarModel.position.x = THREE.MathUtils.lerp(avatarModel.position.x, objetivoPosicion.x, 0.015);
        avatarModel.position.y = Math.sin(elapsedTime * 1.5) * 0.05; 
    }

    composer.render();
}
animate();

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);
});
