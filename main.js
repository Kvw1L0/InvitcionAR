import * as THREE from 'https://esm.sh/three@0.136.0';
import { GLTFLoader } from 'https://esm.sh/three@0.136.0/examples/jsm/loaders/GLTFLoader.js';
import { EffectComposer } from 'https://esm.sh/three@0.136.0/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'https://esm.sh/three@0.136.0/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'https://esm.sh/three@0.136.0/examples/jsm/postprocessing/UnrealBloomPass.js';

// ==========================================
// 1. CONFIGURACIÓN DE LA ESCENA
// ==========================================
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0a0a); // Fondo oscuro para resaltar el neón

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
// AJUSTE CÁMARA (Z=6): Un primer plano limpio y espacioso
camera.position.set(0, 0, 6); 

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
renderer.toneMapping = THREE.ACESFilmicToneMapping; // Crítico para el look cinematográfico del metal y neón
renderer.toneMappingExposure = 1.2;
document.body.appendChild(renderer.domElement);

// ==========================================
// 2. ILUMINACIÓN: Solución Puntos 2 y 4 (Metal y Luz Frontal)
// ==========================================

// A) LUZ DE RELLENO (HemisphereLight): Baña todo de forma suave.
// Esencial para que el metal no se vaya a negro absoluto.
const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 0.6);
scene.add(hemiLight);

// B) LUZ FRONTAL (DirectionalLight) - Solución Punto 4:
// La movemos a (0, 5, 10) para que alumbre directamente de frente y arriba.
const frontalLight = new THREE.DirectionalLight(0xffffff, 2.5); // Mucha potencia para metalizar
frontalLight.position.set(0, 5, 10); // Frente (Z=10), arriba (Y=5) y centrada (X=0)
scene.add(frontalLight);

// Variables globales para materiales
let materialBoca = null;
let materialOjos = null;

// ==========================================
// 3. CARGAR EL AVATAR Y AJUSTAR MATERIALES (Puntos 1, 2 y 3)
// ==========================================
const loader = new GLTFLoader();
loader.load('./animador1.glb', (gltf) => {
    const model = gltf.scene;
    scene.add(model);
    
    // CENTRADO AUTOMÁTICO (Solución Punto 1):
    // Centramos el modelo geométricamente para que no dependa de Blender.
    const box = new THREE.Box3().setFromObject(model);
    const center = box.getCenter(new THREE.Vector3());
    model.position.sub(center); 
    // Pequeño ajuste vertical para enmarcar
    model.position.y = -0.5;

    // RECORRIDO DE MALLAS (Puntos 2 y 3):
    model.traverse((child) => {
        if (child.isMesh) {
            // SOLUCIÓN PUNTO 2: Asegurar que el metal se vea metálico
            // Si el objeto NO es ojos/boca, forzamos metalness
            const name = child.name.toLowerCase();
            const isGlow = name.includes('boca') || name.includes('ojo') || name.includes('od') || name.includes('oi');

            if (!isGlow) {
                // Forzamos el material a ser metálico y con rugosidad controlada
                // Esto es lo que le da el look de Meshy en la web
                child.material.metalness = 1.0;
                child.material.roughness = 0.3; // Un metal pulido pero no espejo
                child.material.needsUpdate = true;
            }

            // SOLUCIÓN PUNTO 3: Glow LED Real (Emisión Potente)
            if (name.includes('boca')) {
                materialBoca = child.material;
                materialBoca.emissive = new THREE.Color(0xff0000); // Forzar rojo
                materialBoca.emissiveIntensity = 8.0; // Intensidad alta para que explote con el Bloom
            }
            if (name.includes('od') || name.includes('oi') || name.includes('ojo')) {
                materialOjos = child.material;
                materialOjos.emissive = new THREE.Color(0xff0000);
                materialOjos.emissiveIntensity = 8.0;
            }
        }
    });
    console.log("Avatar cargado, centrado y calibrado visualmente.");
}, undefined, (error) => {
    console.error("Error al cargar el avatar:", error);
});

// ==========================================
// 4. PIPELINE DE POST-PROCESAMIENTO: Solución Punto 3 (Glow expansivo)
// ==========================================
const renderScene = new RenderPass(scene, camera);

// Calibración del Bloom (Resplandor):
// Parámetros: (Resolución, Intensidad, Radio, Umbral)
const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight), 
    1.5,  // Fuerza del resplandor neón (aumentado para el "Glow real")
    0.6,  // Radio de dispersión del "glóbulo" de luz (más expansivo)
    0.15  // Límite de brillo para que se active el efecto
);

const composer = new EffectComposer(renderer);
composer.addPass(renderScene);
composer.addPass(bloomPass);

// ==========================================
// 5. BUCLE DE ANIMACIÓN (Idle)
// ==========================================
const clock = new THREE.Clock();

function animate() {
    requestAnimationFrame(animate);
    const elapsedTime = clock.getElapsedTime();

    // EFECTO RESPIRACIÓN (Parpadeo suave en los ojos)
    if (materialOjos) {
        // La intensidad oscila suavemente usando una onda seno
        materialOjos.emissiveIntensity = 6.0 + Math.sin(elapsedTime * 2) * 1.5;
    }

    // Aquí se conectará el analizador de audio en la siguiente etapa
    // if (materialBoca && iaEstaHablando) { ... }

    // Usamos el composer para aplicar el filtro de neón
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
