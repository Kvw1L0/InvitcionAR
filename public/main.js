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
document.body.appendChild(renderer.domElement);

const pmremGenerator = new THREE.PMREMGenerator(renderer);
scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;

const ambientLight = new THREE.AmbientLight(0xffffff, 1.2); 
scene.add(ambientLight);

// ==========================================
// 2. VARIABLES GLOBALES Y AUDIO
// ==========================================
let materialBoca, materialOjoDerecho, materialOjoIzquierdo, avatarModel;
let audioAnalyser = null;
let dataArray = null;
let audioContext = null;
let source = null;

const objetivoRotacion = new THREE.Euler(0, 0, 0);
const objetivoPosicion = new THREE.Vector3(0, 0, 0);

// ==========================================
// 3. INTEGRACIÓN CON IA (BACKEND)
// ==========================================
function conectarAudioAVisuals(audioElement) {
    if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)();
    if (source) source.disconnect();
    
    source = audioContext.createMediaElementSource(audioElement);
    if (!audioAnalyser) {
        audioAnalyser = audioContext.createAnalyser();
        audioAnalyser.fftSize = 256;
    }
    source.connect(audioAnalyser);
    source.connect(audioContext.destination);
    dataArray = new Uint8Array(audioAnalyser.frequencyBinCount);
}

async function enviarAudioABackend(audioBlob) {
    console.log("Enviando audio al cerebro Jungle...");
    const response = await fetch('/api/chat', { method: 'POST', body: audioBlob });
    
    if (response.ok) {
        const audioData = await response.arrayBuffer();
        const blob = new Blob([audioData], { type: 'audio/mpeg' });
        const audioUrl = URL.createObjectURL(blob);
        const audio = new Audio(audioUrl);
        
        conectarAudioAVisuals(audio); 
        audio.play();
    } else {
        console.error("Error en la respuesta del backend");
    }
}

// ==========================================
// 4. LÓGICA DE GRABACIÓN
// ==========================================
// ==========================================
// 4. LÓGICA DE GRABACIÓN (PUSH-TO-TALK)
// ==========================================
let mediaRecorder;
let audioChunks = [];
let streamIniciado = false;

const btnStart = document.createElement('button');
btnStart.innerText = "MANTÉN PRESIONADO PARA HABLAR";
btnStart.style.position = 'absolute';
btnStart.style.top = '80%'; // Lo bajé un poco para que no tape la cara del avatar
btnStart.style.left = '50%';
btnStart.style.transform = 'translate(-50%, -50%)';
btnStart.style.padding = '20px 40px';
btnStart.style.cursor = 'pointer';
btnStart.style.zIndex = '100';
btnStart.style.userSelect = 'none'; // Evita que el texto se seleccione en móviles
document.body.appendChild(btnStart);

// Función para inicializar el micrófono una sola vez
async function prepararMicrofono() {
    if (!streamIniciado) {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream);
        
        mediaRecorder.ondataavailable = (e) => audioChunks.push(e.data);
        mediaRecorder.onstop = () => {
            const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
            audioChunks = [];
            enviarAudioABackend(audioBlob);
        };
        streamIniciado = true;
    }
}

// Eventos al PRESIONAR (Mouse y Táctil)
const iniciarGrabacion = async (e) => {
    e.preventDefault(); // Evita comportamientos raros en móviles
    await prepararMicrofono();
    if (mediaRecorder.state === 'inactive') {
        mediaRecorder.start();
        btnStart.innerText = "ESCUCHANDO... (Habla ahora)";
        btnStart.style.backgroundColor = "#ff4444"; // Cambio visual para que sepan que graba
        btnStart.style.color = "white";
    }
};

// Eventos al SOLTAR (Mouse y Táctil)
const detenerGrabacion = (e) => {
    e.preventDefault();
    if (mediaRecorder && mediaRecorder.state === 'recording') {
        mediaRecorder.stop();
        btnStart.innerText = "PROCESANDO RESPUESTA...";
        btnStart.style.backgroundColor = ""; // Vuelve al color original
        btnStart.style.color = "";
    }
};

// Asignar los eventos
btnStart.addEventListener('mousedown', iniciarGrabacion);
btnStart.addEventListener('touchstart', iniciarGrabacion, { passive: false });

btnStart.addEventListener('mouseup', detenerGrabacion);
btnStart.addEventListener('touchend', detenerGrabacion, { passive: false });
btnStart.addEventListener('mouseleave', detenerGrabacion); // Por si el usuario arrastra el dedo fuera del botón

// ==========================================
// 5. CARGA DE MODELO (FIREBASE)
// ==========================================
const urlModelo = 'https://firebasestorage.googleapis.com/v0/b/avatar-ia-84a80.firebasestorage.app/o/Moldels%2Favatar-ia.glb?alt=media&token=1b020122-46cf-43dd-aadc-c3676760ba1f';
new GLTFLoader().load(urlModelo, (gltf) => {
    avatarModel = gltf.scene; 
    scene.add(avatarModel);
    avatarModel.traverse((child) => {
        if (child.isMesh) {
            const name = child.name.toLowerCase();
            if (name.includes('boca')) materialBoca = child.material;
            if (name.includes('ojo')) child.material.emissiveIntensity = 20.0;
        }
    });
});

// ==========================================
// 6. BUCLE ANIMACIÓN
// ==========================================
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
composer.addPass(new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 3.0, 1.0, 0.95));

const clock = new THREE.Clock();
function animate() {
    requestAnimationFrame(animate);
    const time = clock.getElapsedTime();

    if (audioAnalyser && dataArray && materialBoca) {
        audioAnalyser.getByteFrequencyData(dataArray);
        let sum = dataArray.reduce((a, b) => a + b, 0);
        let promedio = sum / dataArray.length;
        materialBoca.emissiveIntensity = THREE.MathUtils.lerp(materialBoca.emissiveIntensity, 1.0 + (promedio / 255) * 40.0, 0.3);
    }

    if (avatarModel) {
        avatarModel.rotation.y = Math.sin(time * 0.5) * 0.2;
        avatarModel.position.y = Math.sin(time * 1.5) * 0.05;
    }

    composer.render();
}
animate();
