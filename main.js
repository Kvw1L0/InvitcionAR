import { RoomEnvironment } from 'https://esm.sh/three@0.136.0/examples/jsm/environments/RoomEnvironment.js';
import * as THREE from 'https://esm.sh/three@0.136.0';
import { GLTFLoader } from 'https://esm.sh/three@0.136.0/examples/jsm/loaders/GLTFLoader.js';
import { EffectComposer } from 'https://esm.sh/three@0.136.0/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'https://esm.sh/three@0.136.0/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'https://esm.sh/three@0.136.0/examples/jsm/postprocessing/UnrealBloomPass.js';


// ==========================================
// 1. ESCENA Y CÁMARA
// ==========================================
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x050505);

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 0, 5.5); // Cámara centrada

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0; 
document.body.appendChild(renderer.domElement);

// Generador de entorno para reflejos metálicos
const pmremGenerator = new THREE.PMREMGenerator(renderer);
scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;

// ==========================================
// 2. ILUMINACIÓN (Suave y sin quemar)
// ==========================================
const ambientLight = new THREE.AmbientLight(0xffffff, 2.0); // Luz base normal
scene.add(ambientLight);

const frontalLight = new THREE.DirectionalLight(0xffffff, 1.8); // Luz para el metal
frontalLight.position.set(0, 2, 5);
scene.add(frontalLight);

let materialBoca = null;
let materialOjos = null;

// ==========================================
// 3. CARGAR AVATAR (Respetando tu textura de Blender)
// ==========================================
const loader = new GLTFLoader();
loader.load('./avatar_ia.glb', (gltf) => {
    const model = gltf.scene;
    scene.add(model);
    
    // Centrado
    const box = new THREE.Box3().setFromObject(model);
    const center = box.getCenter(new THREE.Vector3());
    model.position.sub(center);

    model.traverse((child) => {
        if (child.isMesh) {
            const name = child.name.toLowerCase();
            
            // SOLO tocamos los ojos y la boca para darles luz pura.
            // La cabeza se queda con la textura PNG original intacta.
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
});

// ==========================================
// 4. BLOOM (Protegiendo la cara)
// ==========================================
const renderScene = new RenderPass(scene, camera);

const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight), 
    1.2,  // Intensidad del glow
    0.4,  // Expansión
    0.95  // UMBRAL ALTO: Esto es un escudo. Impide que la cabeza brille, SOLO agarra los ojos.
);

const composer = new EffectComposer(renderer);
composer.addPass(renderScene);
composer.addPass(bloomPass);

// ==========================================
// 5. ANIMACIÓN
// ==========================================
const clock = new THREE.Clock();

function animate() {
    requestAnimationFrame(animate);
    const elapsedTime = clock.getElapsedTime();

    if (materialOjos) {
        materialOjos.emissiveIntensity = 3.0 + Math.sin(elapsedTime * 2) * 2.0;
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
