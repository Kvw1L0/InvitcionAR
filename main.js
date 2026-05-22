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
scene.background = new THREE.Color(0x020000); // Fondo con un micro-toque rojizo oscuro

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 0, 8.5); // Alejamos un poco la cámara para que tenga espacio para volar

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
const ambientLight = new THREE.AmbientLight(0xffffff, 1.2); 
scene.add(ambientLight);

const frontalLight = new THREE.DirectionalLight(0xffffff, 1.5); 
frontalLight.position.set(0, 2, 5);
scene.add(frontalLight);

// ==========================================
// 4. VARIABLES GLOBALES INDEPENDIENTES
// ==========================================
let materialBoca = null;
let materialOjoDerecho = null;
let materialOjoIzquierdo = null;
let avatarModel = null; 

// ==========================================
// 5. CARGAR AVATAR DESDE FIREBASE
// ==========================================
const urlModelo = 'https://firebasestorage.googleapis.com/v0/b/avatar-ia-84a80.firebasestorage.app/o/Moldels%2Favatar-ia.glb?alt=media&token=1b020122-46cf-43dd-aadc-c3676760ba1f';

const loader = new GLTFLoader();
loader.load(urlModelo, (gltf) => {
    avatarModel = gltf.scene; 
    scene.add(avatarModel);
    
    // Centrado matemático
    const box = new THREE.Box3().setFromObject(avatarModel);
    const center = box.getCenter(new THREE.Vector3());
    avatarModel.position.sub(center);

    avatarModel.traverse((child) => {
        if (child.isMesh) {
            const name = child.name.toLowerCase();
            
            // INTENSIDAD SOLAR: Subimos la emisión base a 20.0
            if (name.includes('boca')) {
                materialBoca = child.material;
                materialBoca.emissive = new THREE.Color(0xff0000);
                materialBoca.emissiveIntensity = 20.0; 
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
}, undefined, (error) => {
    console.error("Error al cargar el avatar:", error);
});

// ==========================================
// 6. EFECTO NEÓN RADICAL (BLOOM)
// ==========================================
const renderScene = new RenderPass(scene, camera);

const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight), 
    3.0,  // FUERZA DEL GLOW: Extremadamente alto
    1.0,  // EXPANSIÓN: El aura llegará mucho más lejos
    0.95  // ESCUDO: Mantiene el metal a salvo del resplandor
);

const composer = new EffectComposer(renderer);
composer.addPass(renderScene);
composer.addPass(bloomPass);

// ==========================================
// 7. BUCLE DE ANIMACIÓN (ESTRAMBÓTICO)
// ==========================================
const clock = new THREE.Clock();

function animate() {
    requestAnimationFrame(animate);
    const elapsedTime = clock.getElapsedTime();

    // Latido nuclear: Oscila violentamente entre 10 y 30 de intensidad
    if (materialOjoDerecho && materialOjoIzquierdo) {
        const latidoNuclear = 20.0 + Math.sin(elapsedTime * 4) * 10.0;
        materialOjoDerecho.emissiveIntensity = latidoNuclear;
        materialOjoIzquierdo.emissiveIntensity = latidoNuclear;
    }

    if (materialBoca) {
        // La boca se mantiene como una caldera encendida a punto de hablar
        materialBoca.emissiveIntensity = 15.0; 
    }

    // Movimiento Caótico / Estrambótico
    if (avatarModel) {
        // POSICIÓN: Vuela por toda la pantalla (Ejes X, Y, Z ampliados)
        avatarModel.position.x = Math.sin(elapsedTime * 2.5) * 3.5; // De lado a lado rápido
        avatarModel.position.y = Math.cos(elapsedTime * 3.0) * 2.0; // Saltos verticales
        avatarModel.position.z = Math.sin(elapsedTime * 1.5) * 2.5; // Se acerca y se aleja de la cámara

        // ROTACIÓN: Giros de cabeza radicales y desorientadores
        avatarModel.rotation.y = Math.sin(elapsedTime * 2.0) * Math.PI * 0.8; // Gira casi mirando hacia atrás
        avatarModel.rotation.x = Math.cos(elapsedTime * 2.2) * 0.8; // Cabecea bruscamente
        avatarModel.rotation.z = Math.sin(elapsedTime * 3.5) * 0.4; // Tiembla un poco de lado
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
