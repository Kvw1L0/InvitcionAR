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
// 2. ENTORNO DE REFLEJOS
// ==========================================
const pmremGenerator = new THREE.PMREMGenerator(renderer);
scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;

const ambientLight = new THREE.AmbientLight(0xffffff, 1.2); 
scene.add(ambientLight);

const frontalLight = new THREE.DirectionalLight(0xffffff, 1.5); 
frontalLight.position.set(0, 2, 5);
scene.add(frontalLight);

// ==========================================
// 3. VARIABLES GLOBALES INDEPENDIENTES
// ==========================================
let materialBoca = null;
let materialOjoDerecho = null;
let materialOjoIzquierdo = null;
let avatarModel = null; 

// ==========================================
// 4. EL "CEREBRO" DEL PRESENTADOR (Variables de postura)
// ==========================================
const objetivoPosicion = new THREE.Vector3(0, 0, 0);
const objetivoRotacion = new THREE.Euler(0, 0, 0);

// Esta función decide a dónde mirar y cuánto esperar antes de moverse de nuevo
function pensarSiguienteMovimiento() {
    // 1. Decidir nueva rotación (Mirar a los lados, arriba o abajo)
    // Rango sutil: de -0.5 a 0.5 radianes para no torcer el cuello
    objetivoRotacion.y = (Math.random() - 0.5) * 1.0; 
    objetivoRotacion.x = (Math.random() - 0.5) * 0.3; 
    objetivoRotacion.z = (Math.random() - 0.5) * 0.1; // Leve inclinación de cabeza

    // 2. Decidir nueva posición en el escenario (Micro-desplazamientos)
    objetivoPosicion.x = (Math.random() - 0.5) * 1.5; 
    
    // 3. Programar el próximo movimiento (Entre 2 y 6 segundos de pausa)
    const tiempoEspera = 2000 + Math.random() * 4000;
    setTimeout(pensarSiguienteMovimiento, tiempoEspera);
}

// ==========================================
// 5. CARGAR AVATAR
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
                materialBoca.emissiveIntensity = 15.0; 
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

    // Iniciar la toma de decisiones una vez que el modelo carga
    pensarSiguienteMovimiento();
}, undefined, (error) => {
    console.error("Error al cargar el avatar:", error);
});

// ==========================================
// 6. EFECTO NEÓN (BLOOM)
// ==========================================
const renderScene = new RenderPass(scene, camera);

const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight), 
    3.0,  
    1.0,  
    0.95  
);

const composer = new EffectComposer(renderer);
composer.addPass(renderScene);
composer.addPass(bloomPass);

// ==========================================
// 7. BUCLE DE ANIMACIÓN
// ==========================================
const clock = new THREE.Clock();

function animate() {
    requestAnimationFrame(animate);
    const elapsedTime = clock.getElapsedTime();

    if (materialOjoDerecho && materialOjoIzquierdo) {
        const latidoNuclear = 20.0 + Math.sin(elapsedTime * 4) * 10.0;
        materialOjoDerecho.emissiveIntensity = latidoNuclear;
        materialOjoIzquierdo.emissiveIntensity = latidoNuclear;
    }

    if (avatarModel) {
        // INTERPOLACIÓN (Lerp): El secreto del movimiento fluido.
        // Mueve la rotación y posición actual hacia el "objetivo" a un 2% de velocidad por fotograma.
        avatarModel.rotation.y = THREE.MathUtils.lerp(avatarModel.rotation.y, objetivoRotacion.y, 0.02);
        avatarModel.rotation.x = THREE.MathUtils.lerp(avatarModel.rotation.x, objetivoRotacion.x, 0.02);
        avatarModel.rotation.z = THREE.MathUtils.lerp(avatarModel.rotation.z, objetivoRotacion.z, 0.02);
        
        avatarModel.position.x = THREE.MathUtils.lerp(avatarModel.position.x, objetivoPosicion.x, 0.015);

        // La respiración en el eje Y siempre se mantiene constante y sutil
        avatarModel.position.y = Math.sin(elapsedTime * 1.5) * 0.05; 
    }

    composer.render();
}
animate();

// ==========================================
// 8. RESPONSIVE
// ==========================================
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);
});
