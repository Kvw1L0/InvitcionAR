import * as THREE from 'https://esm.sh/three@0.136.0';
import { GLTFLoader } from 'https://esm.sh/three@0.136.0/examples/jsm/loaders/GLTFLoader.js';
import { EffectComposer } from 'https://esm.sh/three@0.136.0/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'https://esm.sh/three@0.136.0/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'https://esm.sh/three@0.136.0/examples/jsm/postprocessing/UnrealBloomPass.js';
import { RoomEnvironment } from 'https://esm.sh/three@0.136.0/examples/jsm/environments/RoomEnvironment.js';

// ==========================================
// 1. CONFIGURACIÓN DE ESCENA Y RENDERER
// ==========================================
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x050505); // Fondo oscuro para resaltar el neón

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 0, 5.5); // Encuadre centrado

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0; 
document.body.appendChild(renderer.domElement);

// ==========================================
// 2. ENTORNO DE REFLEJOS (El secreto del metal cromado)
// ==========================================
// Generamos un "estudio invisible" alrededor del robot para que el metal tenga qué reflejar
const pmremGenerator = new THREE.PMREMGenerator(renderer);
scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;

// ==========================================
// 3. ILUMINACIÓN BASE (Suave, el entorno hace el resto)
// ==========================================
const ambientLight = new THREE.AmbientLight(0xffffff, 1.0); 
scene.add(ambientLight);

const frontalLight = new THREE.DirectionalLight(0xffffff, 1.0); 
frontalLight.position.set(0, 2, 5);
scene.add(frontalLight);

let materialBoca = null;
let materialOjos = null;

// ==========================================
// 4. CARGAR AVATAR DESDE FIREBASE
// ==========================================
const urlModelo = 'https://firebasestorage.googleapis.com/v0/b/avatar-ia-84a80.firebasestorage.app/o/Moldels%2Favatar-ia.glb?alt=media&token=1b020122-46cf-43dd-aadc-c3676760ba1f';

const loader = new GLTFLoader();
loader.load(urlModelo, (gltf) => {
    const model = gltf.scene;
    scene.add(model);
    
    // Centrado matemático perfecto
    const box = new THREE.Box3().setFromObject(model);
    const center = box.getCenter(new THREE.Vector3());
    model.position.sub(center);

    model.traverse((child) => {
        if (child.isMesh) {
            const name = child.name.toLowerCase();
            
            // Separar materiales emisivos (LED) del metal
            if (name.includes('boca')) {
                materialBoca = child.material;
                materialBoca.emissive = new THREE.Color(0xff0000);
                materialBoca.emissiveIntensity = 5.0; 
            }
            if (name.includes('od') || name.includes('oi') || name.includes('ojo')) {
                materialOjos = child.material;
                materialOjos.emissive = new THREE.Color(0xff0000);
                materialOjos.emissiveIntensity = 5.0;
            }
        }
    });
    console.log("Avatar cargado exitosamente desde Firebase.");
}, undefined, (error) => {
    console.error("Error al cargar el avatar desde Firebase:", error);
});

// ==========================================
// 5. EFECTO NEÓN (BLOOM) Y ESCUDO DE METAL
// ==========================================
const renderScene = new RenderPass(scene, camera);

const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight), 
    1.2,  // Intensidad del glow
    0.4,  // Expansión
    0.95  // Umbral alto (Escudo): Impide que los reflejos del metal generen neón
);

const composer = new EffectComposer(renderer);
composer.addPass(renderScene);
composer.addPass(bloomPass);

// ==========================================
// 6. BUCLE DE ANIMACIÓN
// ==========================================
const clock = new THREE.Clock();

function animate() {
    requestAnimationFrame(animate);
    const elapsedTime = clock.getElapsedTime();

    // Efecto idle: latido en los ojos
    if (materialOjos) {
        materialOjos.emissiveIntensity = 3.0 + Math.sin(elapsedTime * 2) * 2.0;
    }

    // Renderizamos usando el composer para aplicar los filtros
    composer.render();
}
animate();

// ==========================================
// 7. RESPONSIVE (Ajuste automático de pantalla)
// ==========================================
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);
});
