import * as THREE from 'https://cdn.skypack.dev/three@0.136.0/build/three.module.js';
import { GLTFLoader } from 'https://cdn.skypack.dev/three@0.136.0/examples/jsm/loaders/GLTFLoader.js';
import { EffectComposer } from 'https://cdn.skypack.dev/three@0.136.0/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'https://cdn.skypack.dev/three@0.136.0/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'https://cdn.skypack.dev/three@0.136.0/examples/jsm/postprocessing/UnrealBloomPass.js';

// 1. CONFIGURACIÓN DE LA ESCENA
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0a0a); // Fondo oscuro para resaltar el neón

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 0, 3); // Centrado y de frente al avatar

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
renderer.toneMapping = THREE.ACESFilmicToneMapping; // Crítico para que el brillo neón no se queme
renderer.toneMappingExposure = 1.2;
document.body.appendChild(renderer.domElement);

// 2. ILUMINACIÓN (Sustituye al Sol de Blender para ver la máscara)
const ambientLight = new THREE.AmbientLight(0xffffff, 0.4); // Luz suave para rellenar sombras
scene.add(ambientLight);

const dirLight = new THREE.DirectionalLight(0xffffff, 0.8); // Da volumen metálico al casco
dirLight.position.set(5, 5, 5);
scene.add(dirLight);

// Variables globales para controlar los materiales por código
let materialBoca = null;
let materialOjos = null;

// 3. CARGAR EL AVATAR (.GLB)
const loader = new GLTFLoader();
loader.load('./avatar_ia.glb', (gltf) => {
    const model = gltf.scene;
    scene.add(model);
    
    // Centrar el modelo en la pantalla
    model.position.set(0, -0.2, 0);

    // Buscar las mallas y capturar sus materiales
    model.traverse((child) => {
        if (child.isMesh) {
            // Activar generación de sombras si es necesario
            child.castShadow = true;
            child.receiveShadow = true;

            // Identificar los materiales independientes que separamos
            if (child.name === 'robot_boca') {
                materialBoca = child.material;
            }
            if (child.name === 'robot_OD' || child.name === 'robot_OI') {
                materialOjos = child.material;
            }
        }
    });
    console.log("Avatar cargado y materiales indexados con éxito.");
}, undefined, (error) => {
    console.error("Error al cargar el avatar:", error);
});

// 4. PIPELINE DE POST-PROCESAMIENTO (El filtro Neón/Bloom)
const renderScene = new RenderPass(scene, camera);

// Parámetros del Bloom: (Resolución, Intensidad, Radio, Umbral)
const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight), 
    1.5,  // Intensidad del neón (Glow)
    0.4,  // Radio de expansión de la aureola
    0.15  // Umbral (qué tan brillante debe ser el material para que explote)
);

const composer = new EffectComposer(renderer);
composer.addPass(renderScene);
composer.addPass(bloomPass);

// 5. BUCLE DE ANIMACIÓN (Render dinámico)
const clock = new THREE.Clock();

function animate() {
    requestAnimationFrame(animate);
    const elapsedTime = clock.getElapsedTime();

    // EFECTO IDLE (Respiración sutil en los ojos mientras espera al usuario)
    if (materialOjos) {
        // Hace que los ojos oscilen suavemente usando una onda seno
        materialOjos.emissiveIntensity = 2.0 + Math.sin(elapsedTime * 2) * 0.5;
    }

    // Aquí se inyectará el analizador de audio en la siguiente etapa para la boca
    // if (materialBoca && iaEstaHablando) { ... }

    // En lugar del renderer clásico, usamos el composer para aplicar el filtro de neón
    composer.render();
}

animate();

// 6. ADAPTACIÓN A PANTALLAS (Responsive para el Tótem/Dispositivo)
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);
});
