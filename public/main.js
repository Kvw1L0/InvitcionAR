```javascript
// ==========================================
// MAIN.JS — AVATAR IA HDR SELECTIVE BLOOM
// VERSION PROFESIONAL
// ==========================================
//
// ✔ Selective Bloom REAL
// ✔ Solo ojos y boca brillan
// ✔ Casco metálico sin contaminación HDR
// ✔ LipSync fotónico reactivo
// ✔ Glow fuego LED
// ✔ Deepgram + IA + TTS
//
// ==========================================

// ==========================================
// IMPORTANTE
// ==========================================
//
// NECESITAS IMPORTAR:
//
// EffectComposer
// RenderPass
// UnrealBloomPass
// ShaderPass
// OrbitControls
// GLTFLoader
//
// ==========================================

// ==========================================
// SECCIÓN 0 — VARIABLES GLOBALES
// ==========================================

function generarNuevoId() {
    return 'totem_user_' + Math.random().toString(36).substr(2, 9);
}

let userId = generarNuevoId();

const ENTIRE_SCENE = 0;
const BLOOM_SCENE = 1;

const darkMaterial = new THREE.MeshBasicMaterial({
    color: "black"
});

const materials = {};

let scene;
let camera;
let renderer;

let composer;
let bloomComposer;

let bloomPass;

let mixer;
let model;
let controls;

let clock = new THREE.Clock();

let emissiveMeshes = [];
let emissiveMaterials = [];

let temporizadorInactividad;
const TIEMPO_ESPERA_MS = 45000;

// ==========================================
// AUDIO
// ==========================================

let audioContext;
let analyser;
let microphone;
let globalStream;
let mediaRecorder;

let reproductorAnalyser;
let dataArrayPlayback;

let isUserSpeaking = false;
let silenceTimer = null;
let isCalibrating = false;
let avatarHablando = false;

let baseNoiseFloor = 0;
let dynamicVolumeThreshold = 15;

const SIGNAL_TO_NOISE_MARGIN = 10;
const SILENCE_DURATION = 600;

// ==========================================
// DEEPGRAM
// ==========================================

let deepgramSocket;
let keepAliveInterval;
let transcripcionAcumulada = "";

// ==========================================
// MODELO
// ==========================================

const MODEL_PATH =
'https://firebasestorage.googleapis.com/v0/b/avatar-ia-84a80.firebasestorage.app/o/Moldels%2Favatar-ia.glb?alt=media&token=e6e64cf6-f39c-487d-9344-26ac71956d0c';

// ==========================================
// SHADERS SELECTIVE BLOOM
// ==========================================

const vertexshader = `
varying vec2 vUv;

void main() {

    vUv = uv;

    gl_Position = projectionMatrix *
                  modelViewMatrix *
                  vec4(position,1.0);
}
`;

const fragmentshader = `
uniform sampler2D baseTexture;
uniform sampler2D bloomTexture;

varying vec2 vUv;

void main() {

    gl_FragColor =
        texture2D(baseTexture, vUv) +
        vec4(1.0) * texture2D(bloomTexture, vUv);
}
`;

// ==========================================
// INIT THREE
// ==========================================

function initThreeJS() {

    console.log("⚙️ Inicializando Selective Bloom HDR...");

    const container =
        document.getElementById('threejs-container');

    scene = new THREE.Scene();

    scene.background =
        new THREE.Color(0x08111c);

    camera = new THREE.PerspectiveCamera(
        50,
        window.innerWidth / window.innerHeight,
        0.1,
        1000
    );

    camera.position.set(0, 0, 3.8);

    renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: false
    });

    renderer.setPixelRatio(window.devicePixelRatio);

    renderer.setSize(
        window.innerWidth,
        window.innerHeight
    );

    renderer.outputEncoding =
        THREE.sRGBEncoding;

    renderer.toneMapping =
        THREE.ACESFilmicToneMapping;

    renderer.toneMappingExposure = 0.9;

    container.appendChild(renderer.domElement);

    // ==========================================
    // LUCES
    // ==========================================

    const ambientLight =
        new THREE.AmbientLight(
            0xffffff,
            1.2
        );

    scene.add(ambientLight);

    const keyLight =
        new THREE.DirectionalLight(
            0xffffff,
            1.8
        );

    keyLight.position.set(0, 2, 5);

    scene.add(keyLight);

    const fillLight =
        new THREE.DirectionalLight(
            0x88aaff,
            0.6
        );

    fillLight.position.set(-5, 3, -5);

    scene.add(fillLight);

    // ==========================================
    // BLOOM PASS
    // ==========================================

    bloomPass =
        new THREE.UnrealBloomPass(
            new THREE.Vector2(
                window.innerWidth,
                window.innerHeight
            ),
            2.0,
            0.8,
            0.25
        );

    bloomPass.threshold = 0.22;
    bloomPass.strength = 2.2;
    bloomPass.radius = 0.9;

    // ==========================================
    // BLOOM COMPOSER
    // ==========================================

    bloomComposer =
        new THREE.EffectComposer(renderer);

    bloomComposer.renderToScreen = false;

    bloomComposer.addPass(
        new THREE.RenderPass(scene, camera)
    );

    bloomComposer.addPass(bloomPass);

    // ==========================================
    // FINAL COMPOSER
    // ==========================================

    composer =
        new THREE.EffectComposer(renderer);

    composer.addPass(
        new THREE.RenderPass(scene, camera)
    );

    const finalPass =
        new THREE.ShaderPass(
            new THREE.ShaderMaterial({

                uniforms: {

                    baseTexture: {
                        value: null
                    },

                    bloomTexture: {
                        value:
                            bloomComposer
                                .renderTarget2
                                .texture
                    }
                },

                vertexShader: vertexshader,
                fragmentShader: fragmentshader,
                defines: {}

            }),

            "baseTexture"
        );

    finalPass.needsSwap = true;

    composer.addPass(finalPass);

    // ==========================================
    // CONTROLES
    // ==========================================

    if (typeof THREE.OrbitControls !== 'undefined') {

        controls =
            new THREE.OrbitControls(
                camera,
                renderer.domElement
            );

        controls.enablePan = false;

        controls.target.set(0, 0, 0);

        controls.update();
    }

    window.addEventListener(
        'resize',
        onWindowResize,
        false
    );
}

// ==========================================
// RESIZE
// ==========================================

function onWindowResize() {

    camera.aspect =
        window.innerWidth /
        window.innerHeight;

    camera.updateProjectionMatrix();

    renderer.setSize(
        window.innerWidth,
        window.innerHeight
    );

    composer.setSize(
        window.innerWidth,
        window.innerHeight
    );

    bloomComposer.setSize(
        window.innerWidth,
        window.innerHeight
    );
}

// ==========================================
// LOAD MODEL
// ==========================================

function loadModel() {

    console.log("⚙️ Cargando modelo...");

    const loader = new THREE.GLTFLoader();

    loader.setCrossOrigin('anonymous');

    loader.load(

        MODEL_PATH,

        (gltf) => {

            model = gltf.scene;

            model.scale.set(1,1,1);

            emissiveMeshes = [];
            emissiveMaterials = [];

            model.traverse((child) => {

                if (child.isMesh) {

                    let mat = child.material;

                    const meshName =
                        child.name.toLowerCase();

                    // ==========================================
                    // OJOS Y BOCA
                    // ==========================================

                    const isEmissivePart =

                        meshName.includes('ojo') ||
                        meshName.includes('eye') ||
                        meshName.includes('boca') ||
                        meshName.includes('mouth');

                    // ==========================================
                    // MATERIAL GLOW
                    // ==========================================

                    if (isEmissivePart) {

                        const glowMat =
                            new THREE.MeshStandardMaterial({

                                color: 0x000000,

                                emissive: 0xff2200,

                                emissiveIntensity: 3,

                                metalness: 0,

                                roughness: 1,

                                toneMapped: false
                            });

                        child.material = glowMat;

                        child.layers.enable(BLOOM_SCENE);

                        emissiveMeshes.push(child);

                        emissiveMaterials.push(glowMat);

                        console.log(
                            "🔥 Glow Layer:",
                            child.name
                        );
                    }

                    // ==========================================
                    // CASCO METÁLICO
                    // ==========================================

                    else {

                        const metalMat =
                            new THREE.MeshStandardMaterial({

                                color: 0x555555,

                                metalness: 0.85,

                                roughness: 0.42,

                                envMapIntensity: 0.2,

                                emissive: 0x000000,

                                emissiveIntensity: 0,

                                toneMapped: true
                            });

                        child.material = metalMat;

                        child.layers.disable(BLOOM_SCENE);

                        console.log(
                            "🛡️ Metal:",
                            child.name
                        );
                    }
                }
            });

            scene.add(model);

            // ==========================================
            // ANIMACIONES
            // ==========================================

            if (
                gltf.animations &&
                gltf.animations.length > 0
            ) {

                mixer =
                    new THREE.AnimationMixer(model);

                gltf.animations.forEach((clip) => {

                    mixer
                        .clipAction(clip)
                        .play();
                });
            }

            const overlay =
                document.getElementById('overlay');

            if (overlay) {
                overlay.style.display = 'none';
            }

            animate();
        },

        undefined,

        (error) => {

            console.error(
                "❌ Error modelo:",
                error
            );
        }
    );
}

// ==========================================
// DARKEN NON BLOOMED
// ==========================================

function darkenNonBloomed(obj) {

    if (
        obj.isMesh &&
        BLOOM_SCENE !== obj.layers.mask
    ) {

        materials[obj.uuid] =
            obj.material;

        obj.material =
            darkMaterial;
    }
}

// ==========================================
// RESTORE MATERIAL
// ==========================================

function restoreMaterial(obj) {

    if (materials[obj.uuid]) {

        obj.material =
            materials[obj.uuid];

        delete materials[obj.uuid];
    }
}

// ==========================================
// ANIMATE
// ==========================================

function animate() {

    requestAnimationFrame(animate);

    const delta =
        clock.getDelta();

    if (mixer) mixer.update(delta);

    if (controls) controls.update();

    const time =
        Date.now() * 0.002;

    // ==========================================
    // FLOTACIÓN
    // ==========================================

    if (model) {

        model.position.y =
            Math.sin(time) * 0.05;
    }

    // ==========================================
    // GLOW
    // ==========================================

    if (emissiveMaterials.length > 0) {

        // ==========================================
        // HABLANDO
        // ==========================================

        if (
            avatarHablando &&
            reproductorAnalyser
        ) {

            reproductorAnalyser.getByteFrequencyData(
                dataArrayPlayback
            );

            let maxVolume = 0;

            for (
                let i = 0;
                i < dataArrayPlayback.length;
                i++
            ) {

                if (
                    dataArrayPlayback[i] > maxVolume
                ) {

                    maxVolume =
                        dataArrayPlayback[i];
                }
            }

            emissiveMaterials.forEach((mat) => {

                const flicker =
                    Math.random() * 4;

                const intensity =
                    8 +
                    (maxVolume * 0.18) +
                    flicker;

                mat.emissive.setRGB(
                    1,
                    Math.random() * 0.12,
                    0
                );

                mat.emissiveIntensity =
                    intensity;
            });
        }

        // ==========================================
        // IDLE
        // ==========================================

        else {

            emissiveMaterials.forEach((mat) => {

                const pulse =
                    2.2 +
                    Math.sin(time * 4.0) * 0.8;

                mat.emissive.setRGB(
                    1,
                    0,
                    0
                );

                mat.emissiveIntensity =
                    pulse;
            });
        }
    }

    // ==========================================
    // SELECTIVE BLOOM RENDER
    // ==========================================

    scene.traverse(darkenNonBloomed);

    bloomComposer.render();

    scene.traverse(restoreMaterial);

    composer.render();
}

// ==========================================
// SESIÓN
// ==========================================

function reiniciarSesionTotem() {

    userId = generarNuevoId();

    calibrarRuidoAmbiente();
}

function resetearTemporizador() {

    clearTimeout(temporizadorInactividad);

    temporizadorInactividad =
        setTimeout(
            reiniciarSesionTotem,
            TIEMPO_ESPERA_MS
        );
}

// ==========================================
// DEEPGRAM
// ==========================================

async function conectarDeepgramYGrabar() {

    try {

        const res =
            await fetch('/api/deepgram-token');

        const data =
            await res.json();

        const url =
            'wss://api.deepgram.com/v1/listen?language=es&model=nova-2&smart_format=true&mimetype=audio/webm';

        deepgramSocket =
            new WebSocket(
                url,
                ['token', data.key]
            );

        deepgramSocket.onopen = () => {

            mediaRecorder =
                new MediaRecorder(
                    globalStream,
                    {
                        mimeType: 'audio/webm'
                    }
                );

            mediaRecorder.ondataavailable =
                (event) => {

                    if (
                        event.data.size > 0 &&
                        deepgramSocket.readyState === 1
                    ) {

                        deepgramSocket.send(
                            event.data
                        );
                    }
                };

            mediaRecorder.start(250);

            keepAliveInterval =
                setInterval(() => {

                    if (
                        deepgramSocket.readyState === 1
                    ) {

                        deepgramSocket.send(
                            JSON.stringify({
                                type: "KeepAlive"
                            })
                        );
                    }

                }, 8000);
        };

        deepgramSocket.onmessage =
            (message) => {

                const respuesta =
                    JSON.parse(message.data);

                if (
                    respuesta.is_final &&
                    respuesta.channel &&
                    respuesta.channel.alternatives[0].transcript
                ) {

                    const texto =
                        respuesta.channel
                            .alternatives[0]
                            .transcript
                            .trim();

                    if (
                        texto !== "" &&
                        !avatarHablando
                    ) {

                        transcripcionAcumulada +=
                            texto + " ";
                    }
                }
            };

    } catch (error) {

        console.error(error);
    }
}

// ==========================================
// MICRÓFONO
// ==========================================

async function inicializarMicrofonoVAD() {

    try {

        globalStream =
            await navigator
                .mediaDevices
                .getUserMedia({
                    audio: true
                });

        audioContext =
            new (
                window.AudioContext ||
                window.webkitAudioContext
            )();

        reproductorAnalyser =
            audioContext.createAnalyser();

        reproductorAnalyser.fftSize = 512;

        reproductorAnalyser.smoothingTimeConstant = 0.1;

        dataArrayPlayback =
            new Uint8Array(
                reproductorAnalyser.frequencyBinCount
            );

        analyser =
            audioContext.createAnalyser();

        analyser.fftSize = 512;

        microphone =
            audioContext.createMediaStreamSource(
                globalStream
            );

        microphone.connect(analyser);

        await conectarDeepgramYGrabar();

        calibrarRuidoAmbiente();

    } catch (err) {

        console.error(err);
    }
}

// ==========================================
// CALIBRACIÓN
// ==========================================

function calibrarRuidoAmbiente() {

    isCalibrating = true;

    let totalVolume = 0;
    let sampleCount = 0;

    const calibracionInterval =
        setInterval(() => {

            const dataArray =
                new Uint8Array(
                    analyser.frequencyBinCount
                );

            analyser.getByteFrequencyData(
                dataArray
            );

            let sum = 0;

            for (
                let i = 0;
                i < dataArray.length;
                i++
            ) {

                sum += dataArray[i];
            }

            totalVolume +=
                sum / dataArray.length;

            sampleCount++;

        },100);

    setTimeout(() => {

        clearInterval(
            calibracionInterval
        );

        baseNoiseFloor =
            totalVolume / sampleCount;

        dynamicVolumeThreshold =
            baseNoiseFloor +
            SIGNAL_TO_NOISE_MARGIN;

        isCalibrating = false;

        monitorearVolumen();

    },3000);
}

// ==========================================
// VAD
// ==========================================

function monitorearVolumen() {

    if (
        isCalibrating ||
        avatarHablando
    ) {

        requestAnimationFrame(
            monitorearVolumen
        );

        return;
    }

    const dataArray =
        new Uint8Array(
            analyser.frequencyBinCount
        );

    analyser.getByteFrequencyData(
        dataArray
    );

    let sum = 0;

    for (
        let i = 0;
        i < dataArray.length;
        i++
    ) {

        sum += dataArray[i];
    }

    const averageVolume =
        sum / dataArray.length;

    if (
        averageVolume >
        dynamicVolumeThreshold
    ) {

        resetearTemporizador();

        if (!isUserSpeaking) {

            isUserSpeaking = true;
        }

        if (silenceTimer) {

            clearTimeout(silenceTimer);

            silenceTimer = null;
        }
    }

    else {

        if (
            isUserSpeaking &&
            !silenceTimer
        ) {

            silenceTimer =
                setTimeout(() => {

                    isUserSpeaking = false;

                    silenceTimer = null;

                    setTimeout(() => {

                        if (
                            !isUserSpeaking &&
                            transcripcionAcumulada.trim() !== ""
                        ) {

                            enviarTextoAlCerebro(
                                transcripcionAcumulada
                            );

                            transcripcionAcumulada = "";
                        }

                    },400);

                },SILENCE_DURATION);
        }
    }

    requestAnimationFrame(
        monitorearVolumen
    );
}

// ==========================================
// IA + TTS
// ==========================================

async function enviarTextoAlCerebro(textoUsuario) {

    try {

        const respuestaChat =
            await fetch(
                `/api/chat?userId=${userId}`,
                {
                    method:'POST',
                    headers:{
                        'Content-Type':'application/json'
                    },
                    body:JSON.stringify({
                        text:textoUsuario.trim()
                    })
                }
            );

        const data =
            await respuestaChat.json();

        const audioResponse =
            await fetch(
                `/api/speak?text=${encodeURIComponent(data.text)}`
            );

        const arrayBuffer =
            await audioResponse.arrayBuffer();

        const audioBuffer =
            await audioContext.decodeAudioData(
                arrayBuffer
            );

        const source =
            audioContext.createBufferSource();

        source.buffer = audioBuffer;

        source.connect(
            reproductorAnalyser
        );

        reproductorAnalyser.connect(
            audioContext.destination
        );

        avatarHablando = true;

        source.start(0);

        source.onended = () => {

            avatarHablando = false;

            emissiveMaterials.forEach((mat) => {

                mat.emissiveIntensity = 2.5;
            });
        };

    } catch(error) {

        console.error(error);

        avatarHablando = false;
    }
}

// ==========================================
// INIT
// ==========================================

document.addEventListener(
    'DOMContentLoaded',
    () => {

        const btnIniciar =
            document.getElementById(
                'btnIniciar'
            );

        if (btnIniciar) {

            btnIniciar.addEventListener(
                'click',
                async () => {

                    btnIniciar.style.display =
                        'none';

                    initThreeJS();

                    loadModel();

                    await inicializarMicrofonoVAD();

                    resetearTemporizador();
                }
            );
        }
    }
);
```
