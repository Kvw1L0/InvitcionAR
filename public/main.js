// ==========================================
// SECCIÓN 0: VARIABLES GLOBALES (3D + AUDIO)
// ==========================================

function generarNuevoId() {
    return 'totem_user_' + Math.random().toString(36).substr(2, 9);
}

let userId = generarNuevoId();
let temporizadorInactividad;
const TIEMPO_ESPERA_MS = 45000;

// --- Variables 3D ---
let scene, camera, renderer, model, mixer, composer, bloomPass;
let controls, clock = new THREE.Clock();

// ==========================================
// MATERIALES REACTIVOS
// ==========================================

let eyeMaterials = [];
let mouthMaterials = [];

let currentMouthIntensity = 3.0;
let targetMouthIntensity = 3.0;

// TOKEN FIREBASE
const MODEL_PATH = 'https://firebasestorage.googleapis.com/v0/b/avatar-ia-84a80.firebasestorage.app/o/Moldels%2Favatar-ia.glb?alt=media&token=e6e64cf6-f39c-487d-9344-26ac71956d0c';

// ==========================================
// AUDIO / IA
// ==========================================

let audioContext, analyser, microphone, globalStream, mediaRecorder;

let isUserSpeaking = false;
let silenceTimer = null;
let isCalibrating = false;

let avatarHablando = false;

let baseNoiseFloor = 0;
let dynamicVolumeThreshold = 15;

const SIGNAL_TO_NOISE_MARGIN = 10;
const SILENCE_DURATION = 600;

let deepgramSocket, keepAliveInterval;
let transcripcionAcumulada = "";

// Playback / LipSync
let reproductorAnalyser;
let dataArrayPlayback;

// ==========================================
// THREE JS
// ==========================================

function initThreeJS() {

    console.log("⚙️ Inicializando Three.js");

    const container = document.getElementById('threejs-container');

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x05080c);

    camera = new THREE.PerspectiveCamera(
        50,
        window.innerWidth / window.innerHeight,
        0.1,
        1000
    );

    camera.position.set(0, 0, 3.8);

    renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true
    });

    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);

    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.toneMappingExposure = 1.0;

    renderer.setClearColor(0x000000, 1);

    container.appendChild(renderer.domElement);

    // ==========================================
    // ILUMINACIÓN
    // ==========================================

    scene.add(new THREE.AmbientLight(0xffffff, 1.2));

    const directionalLight = new THREE.DirectionalLight(0xffffff, 2.0);
    directionalLight.position.set(0, 2, 5);
    scene.add(directionalLight);

    const fillLight = new THREE.DirectionalLight(0xddddff, 1.0);
    fillLight.position.set(-5, 3, -5);
    scene.add(fillLight);

    // ==========================================
    // BLOOM HDR
    // ==========================================

    bloomPass = new THREE.UnrealBloomPass(
        new THREE.Vector2(window.innerWidth, window.innerHeight),
        2.2,
        1.0,
        0.85
    );

    composer = new THREE.EffectComposer(renderer);

    composer.addPass(new THREE.RenderPass(scene, camera));
    composer.addPass(bloomPass);

    // OrbitControls opcional
    if (typeof THREE.OrbitControls !== 'undefined') {

        controls = new THREE.OrbitControls(
            camera,
            renderer.domElement
        );

        controls.enablePan = false;
        controls.target.set(0, 0, 0);

        controls.update();
    }

    window.addEventListener('resize', onWindowResize, false);
}

function onWindowResize() {

    camera.aspect = window.innerWidth / window.innerHeight;

    camera.updateProjectionMatrix();

    renderer.setSize(window.innerWidth, window.innerHeight);

    if (composer) {
        composer.setSize(window.innerWidth, window.innerHeight);
    }
}

// ==========================================
// CARGA MODELO
// ==========================================

function loadModel() {

    console.log("⚙️ Cargando modelo...");

    const loader = new THREE.GLTFLoader();

    loader.setCrossOrigin('anonymous');

    loader.load(

        MODEL_PATH,

        (gltf) => {

            model = gltf.scene;

            model.scale.set(1, 1, 1);
            model.position.set(0, 0, 0);

            eyeMaterials = [];
            mouthMaterials = [];

            model.traverse((child) => {

                if (child.isMesh && child.material) {

                    const materials = Array.isArray(child.material)
                        ? child.material
                        : [child.material];

                    materials.forEach(mat => {

                        const matName = mat.name.toLowerCase();
                        const meshName = child.name.toLowerCase();

                        // ==========================================
                        // OJOS
                        // ==========================================

                        if (
                            matName.includes('ojo') ||
                            meshName.includes('ojo')
                        ) {

                            mat.color.setHex(0x000000);

                            mat.emissive.setHex(0xff2200);

                            mat.emissiveIntensity = 4.0;

                            mat.metalness = 0.0;
                            mat.roughness = 1.0;

                            eyeMaterials.push(mat);

                            console.log(`👁️ Ojos HDR: ${child.name}`);
                        }

                        // ==========================================
                        // BOCA
                        // ==========================================

                        else if (

                            matName.includes('boca') ||
                            meshName.includes('boca') ||

                            matName.includes('mouth') ||
                            meshName.includes('mouth')

                        ) {

                            mat.color.setHex(0x000000);

                            mat.emissive.setHex(0xff0000);

                            mat.emissiveIntensity = 2.0;

                            mat.metalness = 0.0;
                            mat.roughness = 1.0;

                            mouthMaterials.push(mat);

                            console.log(`👄 Boca reactiva: ${child.name}`);
                        }

                        // ==========================================
                        // RESTO DEL CUERPO
                        // ==========================================

                        else {

                            mat.emissive.setHex(0x000000);
                            mat.emissiveIntensity = 0;

                            mat.metalness = 1.0;
                            mat.roughness = 0.15;

                            mat.color.setHex(0xaaaaaa);
                        }
                    });
                }
            });

            scene.add(model);

            console.log("✅ Modelo cargado");

            // Animaciones
            if (gltf.animations && gltf.animations.length > 0) {

                mixer = new THREE.AnimationMixer(model);

                gltf.animations.forEach((clip) => {
                    mixer.clipAction(clip).play();
                });
            }

            const overlay = document.getElementById('overlay');

            if (overlay) {
                overlay.style.display = 'none';
            }

            animate();
        },

        undefined,

        (error) => {
            console.error("❌ Error GLTF:", error);
        }
    );
}

// ==========================================
// ANIMATE
// ==========================================

function animate() {

    requestAnimationFrame(animate);

    const delta = clock.getDelta();

    if (mixer) mixer.update(delta);

    if (controls) controls.update();

    const time = Date.now() * 0.002;

    // Flotación
    if (model) {
        model.position.y = Math.sin(time) * 0.15;
    }

    // ==========================================
    // SISTEMA REACTIVO OJOS + LIPSYNC
    // ==========================================

    const timePulse = Date.now() * 0.003;

    // ==========================================
    // OJOS
    // ==========================================

    eyeMaterials.forEach(mat => {

        const eyePulse =
            4.0 +
            Math.sin(timePulse * 2.5) * 0.8;

        const speakingBoost =
            avatarHablando ? 2.5 : 0.0;

        mat.emissiveIntensity =
            eyePulse + speakingBoost;
    });

    // ==========================================
    // BOCA
    // ==========================================

    if (avatarHablando && reproductorAnalyser) {

        reproductorAnalyser.getByteFrequencyData(
            dataArrayPlayback
        );

        let sum = 0;

        // frecuencias medias voz
        for (let i = 8; i < 40; i++) {
            sum += dataArrayPlayback[i];
        }

        const avg = sum / 32;

        const normalized = avg / 255;

        targetMouthIntensity =
            2.0 +
            Math.pow(normalized, 1.8) * 18.0;

    } else {

        targetMouthIntensity =
            2.5 +
            Math.sin(timePulse * 4.0) * 0.4;
    }

    // SUAVIZADO

    currentMouthIntensity +=
        (targetMouthIntensity - currentMouthIntensity) * 0.18;

    mouthMaterials.forEach(mat => {

        mat.emissiveIntensity =
            currentMouthIntensity;
    });

    // ==========================================
    // RENDER
    // ==========================================

    if (composer) {
        composer.render();
    }
}

// ==========================================
// REINICIO SESIÓN
// ==========================================

function reiniciarSesionTotem() {

    userId = generarNuevoId();

    console.log("🔄 Nueva sesión:", userId);

    calibrarRuidoAmbiente();
}

function resetearTemporizador() {

    clearTimeout(temporizadorInactividad);

    temporizadorInactividad = setTimeout(
        reiniciarSesionTotem,
        TIEMPO_ESPERA_MS
    );
}

// ==========================================
// DEEPGRAM
// ==========================================

async function conectarDeepgramYGrabar() {

    try {

        const res = await fetch('/api/deepgram-token');

        const data = await res.json();

        const url =
            'wss://api.deepgram.com/v1/listen?language=es&model=nova-2&smart_format=true&mimetype=audio/webm';

        deepgramSocket = new WebSocket(
            url,
            ['token', data.key]
        );

        deepgramSocket.onopen = () => {

            mediaRecorder = new MediaRecorder(
                globalStream,
                { mimeType: 'audio/webm' }
            );

            mediaRecorder.ondataavailable = (event) => {

                if (
                    event.data.size > 0 &&
                    deepgramSocket.readyState === 1
                ) {
                    deepgramSocket.send(event.data);
                }
            };

            mediaRecorder.start(250);

            keepAliveInterval = setInterval(() => {

                if (deepgramSocket.readyState === 1) {

                    deepgramSocket.send(
                        JSON.stringify({
                            type: "KeepAlive"
                        })
                    );
                }

            }, 8000);
        };

        deepgramSocket.onmessage = (message) => {

            const respuesta = JSON.parse(message.data);

            if (
                respuesta.is_final &&
                respuesta.channel &&
                respuesta.channel.alternatives[0].transcript
            ) {

                const texto =
                    respuesta.channel.alternatives[0]
                    .transcript
                    .trim();

                if (
                    texto !== "" &&
                    !avatarHablando
                ) {

                    transcripcionAcumulada +=
                        texto + " ";

                    console.log(
                        "📝",
                        transcripcionAcumulada
                    );
                }
            }
        };

        deepgramSocket.onclose = () => {

            clearInterval(keepAliveInterval);

            if (
                mediaRecorder &&
                mediaRecorder.state !== 'inactive'
            ) {
                mediaRecorder.stop();
            }

            setTimeout(
                conectarDeepgramYGrabar,
                1000
            );
        };

    } catch (error) {

        console.error(
            "❌ Deepgram:",
            error
        );
    }
}

// ==========================================
// AUDIO + MICROFONO
// ==========================================

async function inicializarAudioYMicrofono() {

    try {

        audioContext =
            new (
                window.AudioContext ||
                window.webkitAudioContext
            )();

        if (audioContext.state === 'suspended') {
            await audioContext.resume();
        }

        // Playback analyser
        reproductorAnalyser =
            audioContext.createAnalyser();

        reproductorAnalyser.fftSize = 256;

        dataArrayPlayback =
            new Uint8Array(
                reproductorAnalyser.frequencyBinCount
            );

        // Micrófono
        globalStream =
            await navigator.mediaDevices.getUserMedia({
                audio: true
            });

        analyser = audioContext.createAnalyser();

        analyser.fftSize = 512;
        analyser.smoothingTimeConstant = 0.2;

        microphone =
            audioContext.createMediaStreamSource(
                globalStream
            );

        microphone.connect(analyser);

        await conectarDeepgramYGrabar();

        console.log("🎤 Micrófono listo");

        calibrarRuidoAmbiente();

    } catch (err) {

        console.error(
            "❌ Audio:",
            err
        );
    }
}

// ==========================================
// CALIBRACIÓN
// ==========================================

function calibrarRuidoAmbiente() {

    isCalibrating = true;

    let totalVolume = 0;
    let sampleCount = 0;

    const calibracionInterval = setInterval(() => {

        const dataArray =
            new Uint8Array(
                analyser.frequencyBinCount
            );

        analyser.getByteFrequencyData(dataArray);

        let sum = 0;

        for (let i = 0; i < dataArray.length; i++) {
            sum += dataArray[i];
        }

        totalVolume +=
            (sum / dataArray.length);

        sampleCount++;

    }, 100);

    setTimeout(() => {

        clearInterval(calibracionInterval);

        baseNoiseFloor =
            totalVolume / sampleCount;

        dynamicVolumeThreshold =
            baseNoiseFloor +
            SIGNAL_TO_NOISE_MARGIN;

        isCalibrating = false;

        monitorearVolumen();

    }, 3000);
}

// ==========================================
// MONITOREAR VOLUMEN
// ==========================================

function monitorearVolumen() {

    if (
        isCalibrating ||
        avatarHablando
    ) {

        requestAnimationFrame(monitorearVolumen);

        return;
    }

    const dataArray =
        new Uint8Array(
            analyser.frequencyBinCount
        );

    analyser.getByteFrequencyData(dataArray);

    let sum = 0;

    for (let i = 0; i < dataArray.length; i++) {
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

    } else {

        if (
            isUserSpeaking &&
            !silenceTimer
        ) {

            silenceTimer = setTimeout(() => {

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

                }, 400);

            }, SILENCE_DURATION);
        }
    }

    requestAnimationFrame(monitorearVolumen);
}

// ==========================================
// IA + TTS
// ==========================================

async function enviarTextoAlCerebro(textoUsuario) {

    try {

        console.log(
            "🧠 Usuario:",
            textoUsuario
        );

        const respuestaChat =
            await fetch(`/api/chat?userId=${userId}`, {

                method: 'POST',

                headers: {
                    'Content-Type': 'application/json'
                },

                body: JSON.stringify({
                    text: textoUsuario.trim()
                })
            });

        if (!respuestaChat.ok) {
            throw new Error("Error IA");
        }

        const data =
            await respuestaChat.json();

        console.log(
            "🤖 IA:",
            data.text
        );

        if (
            audioContext &&
            audioContext.state === 'suspended'
        ) {
            await audioContext.resume();
        }

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

        // IMPORTANTÍSIMO
        source.connect(reproductorAnalyser);

        reproductorAnalyser.connect(
            audioContext.destination
        );

        avatarHablando = true;

        console.log("🔥 LipSync activo");

        source.start(0);

        source.onended = () => {

            avatarHablando = false;

            resetearTemporizador();

            console.log(
                "⏹️ Avatar silencioso"
            );
        };

    } catch (error) {

        console.error(
            "❌ Error IA:",
            error
        );

        avatarHablando = false;
    }
}

// ==========================================
// ARRANQUE
// ==========================================

document.addEventListener('DOMContentLoaded', () => {

    const btnIniciar =
        document.getElementById('btnIniciar');

    if (btnIniciar) {

        btnIniciar.addEventListener('click', () => {

            btnIniciar.style.display = 'none';

            initThreeJS();

            loadModel();

            inicializarAudioYMicrofono();

            resetearTemporizador();
        });
    }
});