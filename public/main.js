// ==========================================
// MAIN.JS — AVATAR IA REACTIVO HDR
// Glow LED + LipSync Fotónico + Deepgram
// ==========================================

// ==========================================
// SECCIÓN 0: VARIABLES GLOBALES
// ==========================================

function generarNuevoId() {
    return 'totem_user_' + Math.random().toString(36).substr(2, 9);
}

let userId = generarNuevoId();

let temporizadorInactividad;
const TIEMPO_ESPERA_MS = 45000;

// ---------- THREE ----------
let scene;
let camera;
let renderer;
let composer;
let bloomPass;
let controls;
let mixer;
let model;

const clock = new THREE.Clock();

let emissiveMaterials = [];

// ---------- AUDIO ----------
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

// ---------- DEEPGRAM ----------
let deepgramSocket;
let keepAliveInterval;

let transcripcionAcumulada = "";

// ---------- MODEL ----------
const MODEL_PATH =
    'https://firebasestorage.googleapis.com/v0/b/avatar-ia-84a80.firebasestorage.app/o/Moldels%2Favatar-ia.glb?alt=media&token=e6e64cf6-f39c-487d-9344-26ac71956d0c';

// ==========================================
// SECCIÓN 1: THREE.JS
// ==========================================

function initThreeJS() {

    console.log("⚙️ Inicializando motor gráfico HDR...");

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

    // HDR REAL
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.5;

    renderer.setClearColor(0x000000, 1);

    container.appendChild(renderer.domElement);

    // ==========================================
    // LUCES
    // ==========================================

    const ambientLight = new THREE.AmbientLight(0xffffff, 1.5);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 2.0);
    directionalLight.position.set(0, 2, 5);
    scene.add(directionalLight);

    const fillLight = new THREE.DirectionalLight(0xddddff, 1.0);
    fillLight.position.set(-5, 3, -5);
    scene.add(fillLight);

    // ==========================================
    // BLOOM
    // ==========================================

    bloomPass = new THREE.UnrealBloomPass(
        new THREE.Vector2(window.innerWidth, window.innerHeight),
        3.0,
        1.2,
        0.1
    );

    bloomPass.threshold = 0.05;
    bloomPass.strength = 3.5;
    bloomPass.radius = 1.0;

    composer = new THREE.EffectComposer(renderer);

    composer.addPass(
        new THREE.RenderPass(scene, camera)
    );

    composer.addPass(bloomPass);

    // ==========================================
    // CONTROLES
    // ==========================================

    if (typeof THREE.OrbitControls !== 'undefined') {

        controls = new THREE.OrbitControls(
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

function onWindowResize() {

    camera.aspect =
        window.innerWidth / window.innerHeight;

    camera.updateProjectionMatrix();

    renderer.setSize(
        window.innerWidth,
        window.innerHeight
    );

    if (composer) {

        composer.setSize(
            window.innerWidth,
            window.innerHeight
        );
    }
}

// ==========================================
// SECCIÓN 2: CARGA MODELO
// ==========================================

function loadModel() {

    console.log("⚙️ Cargando modelo GLB...");

    const loader = new THREE.GLTFLoader();

    loader.setCrossOrigin('anonymous');

    loader.load(

        MODEL_PATH,

        (gltf) => {

            model = gltf.scene;

            model.scale.set(1, 1, 1);
            model.position.set(0, 0, 0);

            emissiveMaterials = [];

            model.traverse((child) => {

                if (child.isMesh && child.material) {

                    let materials = Array.isArray(child.material)
                        ? child.material
                        : [child.material];

                    materials.forEach((mat, index) => {

                        // ==========================================
                        // FORZAR MATERIAL COMPATIBLE
                        // ==========================================

                        if (!(mat instanceof THREE.MeshStandardMaterial)) {

                            const nuevoMaterial =
                                new THREE.MeshStandardMaterial({

                                    map: mat.map || null,

                                    color: 0x111111,

                                    emissive: 0xff0000,

                                    emissiveIntensity: 3,

                                    metalness: 0,

                                    roughness: 1
                                });

                            if (Array.isArray(child.material)) {
                                child.material[index] = nuevoMaterial;
                            } else {
                                child.material = nuevoMaterial;
                            }

                            mat = nuevoMaterial;
                        }

                        const matName =
                            mat.name.toLowerCase();

                        const meshName =
                            child.name.toLowerCase();

                        const esOjoOBoca =
                            matName.includes('ojo') ||
                            meshName.includes('ojo') ||
                            matName.includes('eye') ||
                            meshName.includes('eye') ||
                            matName.includes('boca') ||
                            meshName.includes('boca') ||
                            matName.includes('mouth') ||
                            meshName.includes('mouth');

                        // ==========================================
                        // OJOS / BOCA
                        // ==========================================

                        if (esOjoOBoca) {

                            mat.color.setHex(0x000000);

                            mat.emissive.setHex(0xff0000);

                            mat.emissiveIntensity = 5;

                            mat.metalness = 0;

                            mat.roughness = 1;

                            emissiveMaterials.push(mat);

                            console.log(
                                `🔥 Material LED detectado: ${child.name}`
                            );
                        }

                        // ==========================================
                        // CASCO / METAL
                        // ==========================================

                        else {

                            mat.emissive.setHex(0x000000);
                            mat.emissiveIntensity = 0;

                            mat.color.setHex(0xaaaaaa);

                            mat.metalness = 1.0;
                            mat.roughness = 0.15;
                        }
                    });
                }
            });

            scene.add(model);

            console.log(
                "✅ Modelo listo."
            );

            // ==========================================
            // ANIMACIONES
            // ==========================================

            if (
                gltf.animations &&
                gltf.animations.length > 0
            ) {

                mixer = new THREE.AnimationMixer(model);

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
                "❌ Error cargando modelo:",
                error
            );
        }
    );
}

// ==========================================
// SECCIÓN 3: ANIMATE
// ==========================================

function animate() {

    requestAnimationFrame(animate);

    const delta = clock.getDelta();

    if (mixer) mixer.update(delta);

    if (controls) controls.update();

    const time = Date.now() * 0.002;

    // ==========================================
    // FLOTACIÓN
    // ==========================================

    if (model) {

        model.position.y =
            Math.sin(time) * 0.05;
    }

    // ==========================================
    // GLOW REACTIVO
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

            // DEBUG
            // console.log(maxVolume);

            emissiveMaterials.forEach((mat) => {

                const flicker =
                    Math.random() * 4;

                const intensity =
                    20 +
                    (maxVolume * 0.45) +
                    flicker;

                mat.emissive.setRGB(
                    1,
                    Math.random() * 0.15,
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
                    3 +
                    Math.sin(time * 4) * 1.5;

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

    composer.render();
}

// ==========================================
// SECCIÓN 4: SESIÓN
// ==========================================

function reiniciarSesionTotem() {

    userId = generarNuevoId();

    console.log(
        "🔄 Nueva sesión:",
        userId
    );

    calibrarRuidoAmbiente();
}

function resetearTemporizador() {

    clearTimeout(
        temporizadorInactividad
    );

    temporizadorInactividad =
        setTimeout(
            reiniciarSesionTotem,
            TIEMPO_ESPERA_MS
        );
}

// ==========================================
// SECCIÓN 5: DEEPGRAM
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

            console.log(
                "⚡ Deepgram conectado."
            );

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

                        console.log(
                            "📝",
                            transcripcionAcumulada
                        );
                    }
                }
            };

        deepgramSocket.onclose = () => {

            console.log(
                "⚠️ Deepgram desconectado..."
            );

            clearInterval(
                keepAliveInterval
            );

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
            "❌ Error Deepgram:",
            error
        );
    }
}

// ==========================================
// SECCIÓN 6: MICRÓFONO
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

        // ==========================================
        // ANALYZER PLAYBACK
        // ==========================================

        reproductorAnalyser =
            audioContext.createAnalyser();

        reproductorAnalyser.fftSize = 512;
        reproductorAnalyser.smoothingTimeConstant = 0.1;

        dataArrayPlayback =
            new Uint8Array(
                reproductorAnalyser.frequencyBinCount
            );

        // ==========================================
        // ANALYZER MIC
        // ==========================================

        analyser =
            audioContext.createAnalyser();

        analyser.fftSize = 512;
        analyser.smoothingTimeConstant = 0.2;

        microphone =
            audioContext.createMediaStreamSource(
                globalStream
            );

        microphone.connect(analyser);

        await conectarDeepgramYGrabar();

        console.log(
            "🎤 Micrófono conectado."
        );

        calibrarRuidoAmbiente();

    } catch (err) {

        console.error(
            "❌ Error micrófono:",
            err
        );
    }
}

// ==========================================
// SECCIÓN 7: CALIBRACIÓN
// ==========================================

function calibrarRuidoAmbiente() {

    isCalibrating = true;

    console.log(
        "⚙️ Calibrando ruido..."
    );

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

        }, 100);

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

        console.log(
            "✅ Threshold:",
            dynamicVolumeThreshold
        );

        monitorearVolumen();

    }, 3000);
}

// ==========================================
// SECCIÓN 8: VAD
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

            console.log(
                "🎙️ Voz detectada"
            );

            isUserSpeaking = true;
        }

        if (silenceTimer) {

            clearTimeout(
                silenceTimer
            );

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

                    }, 400);

                }, SILENCE_DURATION);
        }
    }

    requestAnimationFrame(
        monitorearVolumen
    );
}

// ==========================================
// SECCIÓN 9: IA + PLAYBACK
// ==========================================

async function enviarTextoAlCerebro(textoUsuario) {

    try {

        console.log(
            "🧠 Pensando..."
        );

        const respuestaChat =
            await fetch(
                `/api/chat?userId=${userId}`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        text: textoUsuario.trim()
                    })
                }
            );

        if (!respuestaChat.ok) {
            throw new Error("Error IA");
        }

        const data =
            await respuestaChat.json();

        console.log(
            "🔊 Generando voz..."
        );

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

        // ==========================================
        // CONEXIONES AUDIO
        // ==========================================

        source.connect(
            reproductorAnalyser
        );

        reproductorAnalyser.connect(
            audioContext.destination
        );

        avatarHablando = true;

        console.log(
            "🔥 Glow reactivo ACTIVADO"
        );

        source.start(0);

        source.onended = () => {

            avatarHablando = false;

            resetearTemporizador();

            emissiveMaterials.forEach(
                (mat) => {

                    mat.emissiveIntensity = 3;
                }
            );

            console.log(
                "⏹️ Avatar en silencio"
            );
        };

    } catch (error) {

        console.error(
            "❌ Error comunicación:",
            error
        );

        avatarHablando = false;

        emissiveMaterials.forEach(
            (mat) => {

                mat.emissiveIntensity = 3;
            }
        );
    }
}

// ==========================================
// SECCIÓN 10: INIT
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