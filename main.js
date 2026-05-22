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
scene.background = new THREE.Color(0x050505); 

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 0, 5.5); 

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0; 
document.body.appendChild(renderer.domElement);

// ==========================================
// 2. ENTORNO DE REFLEJOS (Metal cromado)
// ==========================================
const pmremGenerator = new THREE.PMREMGenerator(renderer);
scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;

// ==========================================
// 3. ILUMINACIÓN BASE
// ==========================================
const ambientLight = new THREE.AmbientLight(0xffffff, 1.0); 
scene.add(ambientLight);

const frontalLight = new THREE.DirectionalLight(0xffffff, 1.0); 
frontalLight.position.set(0, 2, 5);
scene.add(frontalLight);

// Variables globales para animar
let materialBoca = null;
let materialOjos = null;
let avatarModel = null; // Guardamos el modelo completo para moverlo

// ==========================================
// 4. CARGAR AVATAR DESDE FIREBASE
// ==========================================
const urlModelo = 'https://firebasestorage.googleapis.com/v0/b/avatar-ia-84a80.firebasestorage.app/o/Moldels%2Favatar-ia.glb?alt=media&token=1b020122-46cf-43dd-aadc-c3676760ba1f';

const loader = new GLTFLoader();
loader.load(urlModelo, (gltf) => {
    avatarModel = gltf.scene; // Asignamos el modelo a la variable global
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
                materialBoca.emissiveIntensity = 5.0; 
            }
            if (name.includes('od') || name.includes('oi') || name.includes('ojo')) {
                materialOjos = child.material;
                materialOjos.emissive = new THREE.Color(0xff0000);
                materialOjos.emissiveIntensity = 5.0;
            }
        }
    });
}, undefined, (error) => {
    console.error("Error al cargar el avatar:", error);
});

// ==========================================
// 5. EFECTO NEÓN (BLOOM)
// ==========================================
const renderScene = new RenderPass(scene, camera);

const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight), 
    1.2,  
    0.4,  
    0.95  
);

const composer = new EffectComposer(renderer);
composer.addPass(renderScene);
composer.addPass(bloomPass);

// ==========================================
// 6. BUCLE DE ANIMACIÓN (MOVIMIENTO AUTÓNOMO)
// ==========================================
const clock = new THREE.Clock();

function animate() {
    requestAnimationFrame(animate);
    const elapsedTime = clock.getElapsedTime();

    // 1. Animación LED de los ojos (respiración)
    if (materialOjos) {
        materialOjos.emissiveIntensity = 3.0 + Math.sin(elapsedTime * 2) * 2.0;
    }

    // 2. Animación Procedural del Modelo (Vida propia)
    if (avatarModel) {
        // Flotar suavemente como si respirara (eje Y)
        avatarModel.position.y = Math.sin(elapsedTime * 1.5) * 0.08;
        
        // Mirar sutilmente a los lados (rotación sobre eje Y)
        // Multiplicar el tiempo por números distintos rompe el patrón para que se vea aleatorio
        avatarModel.rotation.y = Math.sin(elapsedTime * 0.7) * 0.15;
        
        // Cabeceo muy leve hacia arriba y abajo (rotación sobre eje X)
        avatarModel.rotation.x = Math.cos(elapsedTime * 0.5) * 0.05;
        
        // Inclinación mínima del cuello (rotación sobre eje Z)
        avatarModel.rotation.z = Math.sin(elapsedTime * 0.3) * 0.02;
    }

    composer.render();
}
animate();

// ==========================================
// 7. RESPONSIVE
// ==========================================
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);
});
