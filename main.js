import * as THREE from 'https://esm.sh/three@0.136.0';
import { GLTFLoader } from 'https://esm.sh/three@0.136.0/examples/jsm/loaders/GLTFLoader.js';
import { EffectComposer } from 'https://esm.sh/three@0.136.0/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'https://esm.sh/three@0.136.0/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'https://esm.sh/three@0.136.0/examples/jsm/postprocessing/UnrealBloomPass.js';
// ==========================================
// 1. CONFIGURACIÓN DE LA ESCENA Y RENDERER
// ==========================================
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0a0a); // Fondo oscuro para resaltar el neón

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 0, 8); // Centrado de frente al avatar

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
renderer.toneMapping = THREE.ACESFilmicToneMapping; // Evita que el brillo neón se queme en blanco plano
renderer.toneMappingExposure = 1.2;
document.body.appendChild(renderer.domElement);

// ==========================================
// 2. ILUMINACIÓN (Sustituye al Sol de Blender)
// ==========================================
const ambientLight = new THREE.AmbientLight(0xffffff, 0.4); // Luz suave de relleno para ver el casco
scene.add(ambientLight);

const dirLight = new THREE.DirectionalLight(0xffffff, 1.5); // Da volumen y reflejos metálicos
dirLight.position.set(5, 5, 5);
scene.add(dirLight);

// Variables globales para controlar la animación de los materiales
let materialBoca = null;
let materialOjos = null;

// ==========================================
// 3. CARGAR EL AVATAR (.GLB)
// ==========================================
const loader = new GLTFLoader();
loader.load('./animador1.glb', (gltf) => {
    const model = gltf.scene;
    scene.add(model);
    
    // Ajuste de posición central
    model.position.set(0, -0.2, 0);

    // Recorrido de mallas con tolerancia a mayúsculas, espacios o guiones
    model.traverse((child) => {
        if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;

            // Imprime en la consola de la web los nombres reales para auditoría visual
            console.log("Malla detectada en el .glb:", child.name);

            // Búsqueda inteligente de la Boca
            if (child.name.toLowerCase().includes('boca')) {
                materialBoca = child.material;
                console.log("-> Vinculado material de la Boca.");
            }
            
            // Búsqueda inteligente de los Ojos (OD, OI u Ojo)
            if (child.name.toLowerCase().includes('od') || 
                child.name.toLowerCase().includes('oi') || 
                child.name.toLowerCase().includes('ojo')) {
                materialOjos = child.material;
                console.log("-> Vinculado material de los Ojos.");
            }
        }
    });
    console.log("¡Robot cargado y renderizado con éxito!");
}, undefined, (error) => {
    console.error("Error crítico al cargar el archivo .glb:", error);
});

// ==========================================
// 4. FILTRO DE POST-PROCESAMIENTO (Efecto Bloom / Neón)
// ==========================================
const renderScene = new RenderPass(scene, camera);

// Parámetros: (Resolución, Intensidad del Brillo, Radio de Expansión, Umbral de Activación)
const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight), 
    0.9,  // Fuerza del resplandor neón (aumenta si quieres más aura)
    0.4,  // Radio de dispersión del "glóbulo" de luz
    0.15  // Límite de brillo para que el material empiece a brillar
);

const composer = new EffectComposer(renderer);
composer.addPass(renderScene);
composer.addPass(bloomPass);

// ==========================================
// 5. BUCLE DE RENDIMIENTO Y ANIMACIÓN (Idle)
// ==========================================
const clock = new THREE.Clock();

function animate() {
    requestAnimationFrame(animate);
    const elapsedTime = clock.getElapsedTime();

    // EFECTO RESPIRACIÓN (Parpadeo/Oscilación suave en los ojos mientras espera al usuario)
    if (materialOjos) {
        // Modifica matemáticamente la fuerza de emisión usando una función seno
        materialOjos.emissiveIntensity = 2.0 + Math.sin(elapsedTime * 2) * 0.6;
    }

    // Nota para la siguiente etapa: Aquí conectaremos el analizador de audio de la IA
    // if (materialBoca && iaEstaHablando) { ... }

    // Usamos el composer en lugar del renderer estándar para aplicar el Bloom
    composer.render();
}

animate();

// ==========================================
// 6. RESPONSIVE (Ajuste dinámico de pantalla)
// ==========================================
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);
});
