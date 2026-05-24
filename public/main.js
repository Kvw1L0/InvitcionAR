// ==========================================
// 1. CONFIGURACIÓN DEL TÓTEM Y MEMORIA
// ==========================================
function generarNuevoId() {
    return 'totem_user_' + Math.random().toString(36).substr(2, 9);
}

let userId = generarNuevoId();
let temporizadorInactividad;
const TIEMPO_ESPERA_MS = 45000; // 45 segundos para resetear la sesión

function reiniciarSesionTotem() {
    userId = generarNuevoId();
    console.log("🔄 Sesión reiniciada. Tótem listo para una nueva persona: " + userId);
    // Recalibramos el ruido de fondo por si el evento está más ruidoso ahora
    calibrarRuidoAmbiente(); 
    // Aquí puedes disparar una animación 3D de "Idle" o "Esperando"
}

function resetearTemporizador() {
    clearTimeout(temporizadorInactividad);
    temporizadorInactividad = setTimeout(reiniciarSesionTotem, TIEMPO_ESPERA_MS);
}

// ==========================================
// 2. MOTOR VAD + WEBSOCKET DEEPGRAM EN VIVO
// ==========================================
let audioContext, analyser, microphone, mediaRecorder;
let isRecording = false;
let silenceTimer = null;
let isCalibrating = false;
let avatarHablando = false; 

let baseNoiseFloor = 0; 
let dynamicVolumeThreshold = 15; 
const SIGNAL_TO_NOISE_MARGIN = 10; 
const SILENCE_DURATION = 600; // ¡Reducido a 600ms para latencia extrema!

// Variables del WebSocket
let deepgramSocket;
let transcripcionAcumulada = "";

async function conectarDeepgram() {
    try {
        const res = await fetch('/api/deepgram-token');
        const data = await res.json();
        
        // Abrimos el WebSocket nativo del navegador directo a Deepgram
        deepgramSocket = new WebSocket('wss://api.deepgram.com/v1/listen?language=es&model=nova-2&smart_format=true', ['token', data.key]);
        
        deepgramSocket.onopen = () => console.log("⚡ Conexión en vivo con Deepgram establecida.");
        
        deepgramSocket.onmessage = (message) => {
            const respuesta = JSON.parse(message.data);
            if (respuesta.is_final && respuesta.channel.alternatives[0].transcript) {
                // Vamos guardando las palabras mientras la persona habla
                transcripcionAcumulada += respuesta.channel.alternatives[0].transcript + " ";
            }
        };

        deepgramSocket.onclose = () => {
            console.log("Deepgram desconectado. Reconectando en 1s...");
            setTimeout(conectarDeepgram, 1000); // Auto-reconexión si el evento dura todo el día
        };
    } catch (error) {
        console.error("Error conectando a Deepgram:", error);
    }
}

async function inicializarMicrofonoVAD() {
    try {
        await conectarDeepgram(); // Iniciar el túnel antes de grabar
        
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 512;
        analyser.smoothingTimeConstant = 0.2;
        microphone = audioContext.createMediaStreamSource(stream);
        microphone.connect(analyser);

        // AHORA NO ENVIAMOS TODO AL FINAL, ENVIAMOS EN TIEMPO REAL
        mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
        
        mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0 && deepgramSocket && deepgramSocket.readyState === 1) {
                deepgramSocket.send(event.data); // Enviar trozo de audio en milisegundos
            }
        };

        mediaRecorder.onstop = async () => {
            console.log("🗣️ Frase terminada. Transcripción lista:", transcripcionAcumulada);
            await enviarTextoAlCerebro(transcripcionAcumulada);
            transcripcionAcumulada = ""; // Limpiamos para la siguiente persona
        };

        calibrarRuidoAmbiente();

    } catch (err) {
        console.error("Error micrófono:", err);
    }
}

// ... (MANTÉN TU FUNCIÓN calibrarRuidoAmbiente() EXACTAMENTE IGUAL AQUÍ) ...
// ... (MANTÉN TU FUNCIÓN monitorearVolumen() EXACTAMENTE IGUAL AQUÍ, 
//      pero recuerda que adentro hace mediaRecorder.start(250) en vez de start()... 
//      Espera, vamos a actualizarla rápido aquí abajo:)

function monitorearVolumen() {
    if (isCalibrating || avatarHablando) {
        requestAnimationFrame(monitorearVolumen);
        return; 
    }

    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(dataArray);
    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) { sum += dataArray[i]; }
    const averageVolume = sum / dataArray.length;

    if (averageVolume > dynamicVolumeThreshold) {
        resetearTemporizador(); 
        
        if (!isRecording) {
            console.log(`🎙️ Grabando y transmitiendo en vivo...`);
            isRecording = true;
            // ¡IMPORTANTE! Enviamos cortes cada 250ms a Deepgram
            mediaRecorder.start(250); 
        }
        
        if (silenceTimer) {
            clearTimeout(silenceTimer);
            silenceTimer = null;
        }
    } else {
        if (isRecording && !silenceTimer) {
            silenceTimer = setTimeout(() => {
                isRecording = false;
                mediaRecorder.stop();
                silenceTimer = null;
            }, SILENCE_DURATION);
        }
    }
    requestAnimationFrame(monitorearVolumen);
}

// ==========================================
// 3. CONEXIÓN BTL DE BAJA LATENCIA (JSON + TTFB)
// ==========================================
async function enviarTextoAlCerebro(textoUsuario) {
    if (!textoUsuario || textoUsuario.trim() === "") return;
    
    try {
        console.log("🧠 1. Enviando solo texto a OpenAI...");
        
        // Ahora enviamos JSON, ¡cero peso de audio!
        const respuestaChat = await fetch(`/api/chat?userId=${userId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: textoUsuario.trim() })
        });

        if (!respuestaChat.ok) throw new Error("Error en el servidor de IA");
        const data = await respuestaChat.json();
        
        console.log("🤖 IA responde (Texto):", data.text);
        
        avatarHablando = true; 
        const reproductor = new Audio();
        reproductor.src = `/api/speak?text=${encodeURIComponent(data.text)}`;
        
        await reproductor.play();
        
        reproductor.onended = () => {
            avatarHablando = false; 
            resetearTemporizador();
        };

    } catch (error) {
        console.error("Error comunicando con Vercel:", error);
        avatarHablando = false;
    }
}

// ==========================================
// 4. INICIO DEL SISTEMA (Requisito de Navegadores)
// ==========================================
// Agrega un botón en tu HTML con id="btnIniciar" para arrancar el tótem
document.addEventListener('DOMContentLoaded', () => {
    const btnIniciar = document.getElementById('btnIniciar');
    
    if (btnIniciar) {
        btnIniciar.addEventListener('click', () => {
            // Ocultamos el botón tras presionarlo
            btnIniciar.style.display = 'none'; 
            console.log("🚀 Iniciando sistema Jungle...");
            
            inicializarMicrofonoVAD();
            resetearTemporizador();
        });
    } else {
        console.warn("⚠️ No se encontró un botón con id='btnIniciar'. Crea uno en tu HTML para arrancar el audio.");
    }
});