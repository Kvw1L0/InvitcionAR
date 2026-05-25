// ==========================================
// JUNGLE AVATAR AI
// MAIN.JS — VERSION ESTABLE
// ==========================================

function generarNuevoId() {
    return 'totem_user_' + Math.random().toString(36).substr(2, 9);
}

let userId = generarNuevoId();

let scene;
let camera;
let renderer;
let composer;
let bloomPass;

let model;
let mixer;
let controls;

const clock = new THREE.Clock();

const BLOOM_LAYER = 1;

let emissiveMaterials = [];

let audioContext;
let reproductorAnalyser;
let dataArrayPlayback;

let avatarHablando = false;

// ==========================================
// MODELO
// ==========================================

const MODEL_PATH =
'https://firebasestorage.googleapis.com/v0/b/avatar-ia-84a80.firebasestorage.app/o/Moldels%2Favatar-ia.glb?alt=media&token=e6e64cf6-f39c-487d-9344-26ac71956d0c';

// ==========================================
// INIT
// ==========================================

function initThreeJS() {

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
        new THREE.RenderPass(scene, camera)
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

                        child.layers.enable(
                            BLOOM_LAYER
                        );

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

                        child.layers.disable(
                            BLOOM_LAYER
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

            animate();

            console.log(
                "✅ Modelo cargado"
            );
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
// AUDIO
// ==========================================

async function initAudio() {

    audioContext =
        new (
            window.AudioContext ||
            window.webkitAudioContext
        )();

    reproductorAnalyser =
        audioContext.createAnalyser();

    reproductorAnalyser.fftSize = 512;

    dataArrayPlayback =
        new Uint8Array(
            reproductorAnalyser.frequencyBinCount
        );
}

// ==========================================
// TEST GLOW
// ==========================================

function activarGlowTest() {

    avatarHablando = true;

    setTimeout(() => {

        avatarHablando = false;

    }, 4000);
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

        if (avatarHablando) {

            emissiveMaterials.forEach((mat) => {

                const flicker =
                    Math.random() * 3;

                const intensity =
                    7 + flicker;

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

                btn.style.display = 'none';

                initThreeJS();

                loadModel();

                await initAudio();

                // TEST AUTOMÁTICO
                setTimeout(() => {

                    activarGlowTest();

                }, 3000);
            }
        );
    }
);