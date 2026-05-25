```javascript
// ==========================================
// JUNGLE AVATAR AI
// MAIN.JS FINAL FULL VERSION
// ==========================================
//
// ✔ Modelo 3D GLB
// ✔ Casco metálico
// ✔ Glow SOLO ojos/boca
// ✔ Idle breathing glow
// ✔ Glow reactivo al audio
// ✔ Deepgram STT
// ✔ VAD detección voz
// ✔ IA Chat
// ✔ TTS playback
// ✔ Overlay fix
// ✔ Render estable
//
// ==========================================

// ==========================================
// UTILIDADES
// ==========================================

function generarNuevoId() {
    return 'totem_user_' + Math.random().toString(36).substr(2, 9);
}

let userId = generarNuevoId();

// ==========================================
// THREE
// ==========================================

let scene;
let camera;
let renderer;
let composer;
let bloomPass;

let model;
let mixer;
let controls;

const clock = new THREE.Clock();

let emissiveMaterials = [];

// ==========================================
// AUDIO
// ==========================================

let audioContext;

let analyser;
let microphone;
let globalStream;

let reproductorAnalyser;
let dataArrayPlayback;

let mediaRecorder;

let isUserSpeaking = false;
let silenceTimer = null;
let isCalibrating = false;
let avatarHablando = false;

let baseNoiseFloor = 0;
let dynamicVolumeThreshold = 15;

const SIGNAL_TO_NOISE_MARGIN = 10;
const SILENCE_DURATION = 700;

// ==========================================
// DEEPGRAM
// ==========================================

let deepgramSocket;
let keepAliveInterval;

let transcripcionAcumulada = "";

// ==========================================
// SESSION
// ==========================================

let temporizadorInactividad;

const TIEMPO_ESPERA_MS = 45000;

// ==========================================
// MODEL
// ==========================================

const MODEL_PATH =
'https://firebasestorage.googleapis.com/v0/b/avatar-ia-84a80.firebasestorage.app/o/Moldels%2Favatar-ia.glb?alt=media&token=e6e64cf6-f39c-487d-9344-26ac71956d0c';

// ==========================================
// INIT THREE
// ==========================================

function initThreeJS() {

    console.log("⚙️ Inicializando Three.js...");

    const container =
        document.getElementById('threejs-container');

    scene = new THREE.Scene();

    scene.background =
        new THREE.Color(0x08111c);

    camera =
        new THREE.PerspectiveCamera(
            50,
            window.innerWidth / window.innerHeight,
            0.1,
            1000
        );

    camera.position.set(0, 0, 3.8);

    renderer =
        new THREE.WebGLRenderer({
            antialias: true
        });

    renderer.setSize(
        window.innerWidth,
        window.innerHeight
    );

    renderer.setPixelRatio(
        window.devicePixelRatio
    );

    renderer.outputEncoding =
        THREE.sRGBEncoding;

    renderer.toneMapping =
        THREE.ACESFilmicToneMapping;

    renderer.toneMappingExposure = 0.9;

    container.appendChild(
        renderer.domElement
    );

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
            0.4
        );

    fillLight.position.set(-5, 3, -5);

    scene.add(fillLight);

    // ==========================================
    // BLOOM
    // ==========================================

    bloomPass =
        new THREE.UnrealBloomPass(
            new THREE.Vector2(
                window.innerWidth,
                window.innerHeight
            ),
            1.8,
            0.6,
            0.2
        );

    bloomPass.threshold = 0.25;
    bloomPass.strength = 2.2;
    bloomPass.radius = 0.7;

    composer =
        new THREE.EffectComposer(renderer);

    composer.addPass(
        new THREE.RenderPass(
            scene,
            camera
        )
    );

    composer.addPass(bloomPass);

    // ==========================================
    // CONTROLES
    // ==========================================

    if (THREE.OrbitControls) {

        controls =
            new THREE.OrbitControls(
                camera,
                renderer.domElement
            );

        controls.enablePan = false;

        controls.update();
    }

    window.addEventListener(
        'resize',
        onWindowResize
    );
}

// ==========================================
// RESIZE
// ==========================================

function onWindowResize() {

    camera.aspect =
        window.innerWidth / window.innerHeight;

    camera.updateProjectionMatrix();

    renderer.setSize(
        window.innerWidth,
        window.innerHeight
    );

    composer.setSize(
        window.innerWidth,
        window.innerHeight
    );
}

// ==========================================
// LOAD MODEL
// ==========================================

function loadModel() {

    console.log("⚙️ Cargando modelo...");

    const loader =
        new THREE.GLTFLoader();

    loader.load(

        MODEL_PATH,

        (gltf) => {

            model = gltf.scene;

            emissiveMaterials = [];

            model.traverse((child) => {

                if (child.isMesh) {

                    const meshName =
                        child.name.toLowerCase();

                    const isGlowPart =

                        meshName.includes('ojo') ||
                        meshName.includes('eye') ||
                        meshName.includes('boca') ||
                        meshName.includes('mouth');

                    // ==========================================
                    // OJOS Y BOCA
                    // ==========================================

                    if (isGlowPart) {

                        const glowMaterial =
                            new THREE.MeshStandardMaterial({

                                color: 0x000000,

                                emissive: 0xff2200,

                                emissiveIntensity: 2,

                                metalness: 0,

                                roughness: 1,

                                toneMapped: false
                            });

                        child.material =
                            glowMaterial;

                        emissiveMaterials.push(
                            glowMaterial
                        );

                        console.log(
                            "🔥 Glow detectado:",
                            child.name
                        );
                    }

                    // ==========================================
                    // CASCO
                    // ==========================================

                    else {

                        const metalMaterial =
                            new THREE.MeshStandardMaterial({

                                color: 0x555555,

                                metalness: 0.85,

                                roughness: 0.42,

                                emissive: 0x000000,

                                emissiveIntensity: 0,

                                envMapIntensity: 0.2
                            });

                        child.material =
                            metalMaterial;
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

            console.log(
                "✅ Modelo cargado"
            );

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
            Math.sin(time) * 0.04;
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
                    Math.random() * 3;

                const intensity =
                    6 +
                    (maxVolume * 0.12) +
                    flicker;

                mat.emissive.setRGB(
                    1,
                    Math.random() * 0.1,
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
                    2 +
                    Math.sin(time * 4) * 0.4;

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
// AUDIO INIT
// ==========================================

async function inicializarMicrofonoVAD() {

    try {

        globalStream =
            await navigator.mediaDevices.getUserMedia({
                audio: true
            });

        audioContext =
            new (
                window.AudioContext ||
                window.webkitAudioContext
            )();

        // ==========================================
        // PLAYBACK ANALYSER
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
        // MIC ANALYSER
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

        calibrarRuidoAmbiente();

        console.log(
            "🎤 Micrófono listo"
        );

    } catch(err) {

        console.error(
            "❌ Error micrófono:",
            err
        );
    }
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

            console.log(
                "⚡ Deepgram conectado"
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
                "⚠️ Reconectando Deepgram..."
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

    } catch(error) {

        console.error(
            "❌ Error Deepgram:",
            error
        );
    }
}

// ==========================================
// CALIBRAR RUIDO
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

        console.log(
            "✅ Threshold:",
            dynamicVolumeThreshold
        );

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

    // ==========================================
    // HABLANDO
    // ==========================================

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

    // ==========================================
    // SILENCIO
    // ==========================================

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

        console.log(
            "🧠 Pensando..."
        );

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

        if (!respuestaChat.ok) {

            throw new Error("Error IA");
        }

        const data =
            await respuestaChat.json();

        console.log(
            "🔊 Reproduciendo..."
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

            resetearTemporizador();

            emissiveMaterials.forEach((mat) => {

                mat.emissiveIntensity = 2;
            });

            console.log(
                "⏹️ Fin playback"
            );
        };

    } catch(error) {

        console.error(
            "❌ Error IA:",
            error
        );

        avatarHablando = false;
    }
}

// ==========================================
// SESIÓN
// ==========================================

function reiniciarSesionTotem() {

    userId = generarNuevoId();

    calibrarRuidoAmbiente();

    console.log(
        "🔄 Nueva sesión:",
        userId
    );
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
// INIT APP
// ==========================================

document.addEventListener(
    'DOMContentLoaded',
    () => {

        const btn =
            document.getElementById(
                'btnIniciar'
            );

        btn.addEventListener(
            'click',
            async () => {

                // ==========================================
                // OCULTAR OVERLAY
                // ==========================================

                const overlay =
                    document.getElementById(
                        'overlay'
                    );

                if (overlay) {

                    overlay.style.opacity = '0';

                    overlay.style.pointerEvents = 'none';

                    setTimeout(() => {

                        overlay.style.display = 'none';

                    }, 500);
                }

                // ==========================================
                // INIT
                // ==========================================

                initThreeJS();

                loadModel();

                await inicializarMicrofonoVAD();

                resetearTemporizador();

                console.log(
                    "🚀 Sistema iniciado"
                );
            }
        );
    }
);
```
