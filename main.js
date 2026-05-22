import * as THREE from 'https://esm.sh/three@0.136.0';
import { GLTFLoader } from 'https://esm.sh/three@0.136.0/examples/jsm/loaders/GLTFLoader.js';
import { EffectComposer } from 'https://esm.sh/three@0.136.0/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'https://esm.sh/three@0.136.0/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'https://esm.sh/three@0.136.0/examples/jsm/postprocessing/UnrealBloomPass.js';

// ==========================================
// 1. CONFIGURACIÓN DE LA ESCENA
// ==========================================
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0a0a); // Fondo oscuro

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 0, 5.5); // Distancia calibrada para que quede bien enmarcado

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
renderer.toneMapping = THREE.ACESFilmicToneMapping; 
renderer.toneMappingExposure = 1.0; // Exposición normal para evitar el quemado blanco
document.body.appendChild(renderer.domElement);

// ==========================================
// 2. ILUMINACIÓN (Replicando el estudio de Blender)
// ==========================================
// Luz Ambiente Fuerte: Baña al robot desde todos los ángulos para que no haya sombras negras duras
const ambientLight = new THREE.AmbientLight(0xffffff, 2.5); 
scene.add(ambientLight);

// Luz Frontal Suave: Solo da un pequeño brillo al metal frontal, sin exagerar
const frontalLight = new THREE.DirectionalLight(0xffffff, 0.4); 
frontalLight.position.set(0, 2, 5);
scene.add(frontalLight);

let materialBoca = null;
let materialOjos = null;

// ==========================================
// 3. CARGAR EL AVATAR
// ==========================================
const loader = new GLTFLoader();
loader.load('./animador1.glb', (gltf) => {
    const model = gltf.scene;
    scene.add(model);
    
    // CENTRADO PERFECTO: 
    const box = new THREE.Box3().setFromObject(model);
    const center = box.getCenter(new THREE.Vector3());
    model.position.sub(center); 

    model.traverse((child) => {
        if (child.isMesh) {
            const name = child.name.toLowerCase();
            const isGlow = name.includes('boca') || name.includes('ojo') || name.includes('od') || name.includes('oi');

            // SOLUCIÓN AL METAL: 
            if (!isGlow) {
                // Bajamos el nivel de "espejo" para que no refleje la oscuridad
                // y aumentamos la rugosidad para que se vea el plateado de tu textura
                child.material.metalness = 0.1; 
                child.material.roughness = 0.8;
                child.material.needsUpdate = true;
            }

            // SOLUCIÓN A LOS OJOS (Glow Rojo Puro):
            if (name.includes('boca')) {
                materialBoca = child.material;
                materialBoca.emissive = new THREE.Color(0xff0000);
                // Intensidad en 2.5 mantiene el color rojo intacto sin volverlo blanco
                materialBoca.emissiveIntensity = 2.5; 
            }
            if (name.includes('od') || name.includes('oi') || name.includes('ojo')) {
                materialOjos = child.material;
                materialOjos.emissive = new THREE.Color(0xff0000);
                materialOjos.emissiveIntensity = 2.5;
            }
        }
    });
}, undefined, (error) => {
    console.error("Error al cargar el avatar:", error);
});

// ==========================================
// 4. PIPELINE NEÓN (Glow LED)
// ==========================================
const renderScene = new RenderPass(scene, camera);

const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight), 
    1.2,  // Fuerza del brillo
    0.5,  // Tamaño de la expansión del neón
    0.6   // Umbral: Evita que el metal brille, asegurando que SOLO los ojos hagan neón
);

const composer = new EffectComposer(renderer);
composer.addPass(renderScene);
composer.addPass(bloomPass);

// ==========================================
// 5. ANIMACIÓN BÁSICA
// ==========================================
const clock = new THREE.Clock();

function animate() {
    requestAnimationFrame(animate);
    const elapsedTime = clock.getElapsedTime();

    if (materialOjos) {
        // Oscilación sutil que no sobrepasa el límite del color rojo
        materialOjos.emissiveIntensity = 2.0 + Math.sin(elapsedTime * 2) * 0.8;
    }

    composer.render();
}

animate();

// ==========================================
// 6. RESPONSIVE
// ==========================================
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);
});
