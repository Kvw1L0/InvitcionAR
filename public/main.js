// ==========================================
// 1. CONFIGURACIÓN DEL TÓTEM Y MEMORIA
// ==========================================
function generarNuevoId() {
    return 'totem_user_' + Math.random().toString(36).substr(2, 9);
}

let userId = generarNuevoId();
let temporizadorInactividad;
const TIEMPO_ESPERA_MS = 45000; 

function reiniciarSesionTotem() {
    userId = generarNuevoId();
    console.log("🔄 Sesión reiniciada. Tótem listo para una nueva persona: " + userId);
    calibrarRuidoAmbiente(); 
}

function resetearTemporizador() {
    clearTimeout(temporizadorInactividad);
    temporizadorInactividad = setTimeout(reiniciarSesionTotem, TIEMPO_ESPERA_MS);
}

// ==========================================
// 2. MOTOR VAD + WEBSOCKET DEEPGRAM CONTINUO
// ==========================================
let audioContext, analyser, microphone, mediaRecorder;
let isUserSpeaking = false; // Interruptor lógico
let silenceTimer = null;
let isCalibrating = false;
let avatarHablando = false; 

let baseNoiseFloor = 0; 
let dynamicVolumeThreshold = 15; 
const SIGNAL_TO_NOISE_MARGIN = 10; 
const SILENCE_DURATION = 600; // Ultra baja latencia: 600 milisegundos

// Variables de Conexión
let deepgramSocket;
let transcripcionAcumulada = "";

async function conectarDeepgram() {
    try {
        const res = await fetch('/api/deepgram-token');
        const data = await res.json();
        
        deepgramSocket = new WebSocket('wss://api.deepgram.com/v1/listen?language=es&model=nova-2', ['token', data.key]);
        
        deepgramSocket.onopen = () => {
            console.log("⚡ Conexión en vivo con Deepgram establecida.");
            
            // Latido de seguridad: Evita que Deepgram nos desconecte si hay mucho silencio
            setInterval(() => {
                if (deepgramSocket.readyState === 1) {
                    deepgramSocket.send(JSON.stringify({ type: "KeepAlive" }));
                }
            }, 8000);
        };
        
        deepgramSocket.onmessage = (message) => {
            const respuesta = JSON.parse(message.data);
            if (respuesta.channel && respuesta.channel.alternatives[0].transcript) {
                const texto = respuesta.channel.alternatives[0].transcript.trim();
                
                // LA MAGIA: Deepgram transcribe todo, pero SOLO guardamos el texto 
                // si nuestra calibración de ruido confirma que hay una persona hablando fuerte.
                if (isUserSpeaking && texto !== "") {
                    transcripcionAcumulada += texto + " ";
                    console.log("📝 Escuchando:", transcripcionAcumulada);
                }
            }
        };

        deepgramSocket.onclose = () => {
            console.log("Deepgram desconectado. Reconectando en 1s...");
            setTimeout(conectarDeepgram, 1000); 
        };
    } catch (error) {
        console.error("Error conectando a Deepgram:", error);
    }
}

async function inicializarMicrofonoVAD() {
    try {
        await conectarDeepgram(); 
        
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 512;
        analyser.smoothingTimeConstant = 0.2;
        microphone = audioContext.createMediaStreamSource(stream);
        microphone.connect(analyser);

        mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
        
        mediaRecorder.ondataavailable = (event) => {
            // Enviamos audio continuo, excepto cuando el Avatar habla (para evitar eco)
            if (event.data.size > 0 && deepgramSocket && deepgramSocket.readyState === 1 && !avatarHablando) {
                deepgramSocket.send(event.data); 
            }
        };

        // Arrancamos el grabador una sola vez, emitiendo trozos cada 250ms
        mediaRecorder.start(250); 
        
        console.log("🎤 Micrófono encendido y conectado en tiempo real.");
        calibrarRuidoAmbiente();

    } catch (err) {
        console.error("Error al acceder al micrófono:", err);
    }
}

function calibrarRuidoAmbiente() {
    isCalibrating = true;
    console.log("⚙️ Calibrando ruido de fondo del evento...");
    
    let totalVolume = 0;
    let sampleCount = 0;
    
    const calibracionInterval = setInterval(() => {
        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(dataArray);
        
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) { sum += dataArray[i]; }
        
        totalVolume += (sum / dataArray.length);
        sampleCount++;
    }, 100); 

    setTimeout(() => {
        clearInterval(calibracionInterval);
        baseNoiseFloor = totalVolume / sampleCount;
        dynamicVolumeThreshold = baseNoiseFloor + SIGNAL_TO_NOISE_MARGIN;
        
        isCalibrating = false;
        console.log(`✅ Calibración lista. Umbral de voz: ${dynamicVolumeThreshold.toFixed(2)}`);
        
        monitorearVolumen();
    }, 3000);
}

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
        
        if (!isUserSpeaking) {
            console.log(`🎙️ Voz humana detectada. Capturando frase...`);
            isUserSpeaking = true;
        }
        
        if (silenceTimer) {
            clearTimeout(silenceTimer);
            silenceTimer = null;
        }
    } else {
        if (isUserSpeaking && !silenceTimer) {
            silenceTimer = setTimeout(() => {
                isUserSpeaking = false;
                silenceTimer = null;
                
                // Si hay texto acumulado tras la pausa de 600ms, ¡Disparamos!
                if (transcripcionAcumulada.trim() !== "") {
                    console.log("🚀 Frase terminada. Enviando al cerebro:", transcripcionAcumulada);
                    enviarTextoAlCerebro(transcripcionAcumulada);
                    transcripcionAcumulada = ""; // Limpiamos para la siguiente oración
                }
            }, SILENCE_DURATION);
        }
    }
    requestAnimationFrame(monitorearVolumen);
}

// ==========================================
// 3. COMUNICACIÓN JSON Y REPRODUCCIÓN (TTFB)
// ==========================================
async function enviarTextoAlCerebro(textoUsuario) {
    try {
        console.log("🧠 Pensando respuesta para:", textoUsuario);
        
        const respuestaChat = await fetch(`/api/chat?userId=${userId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: textoUsuario.trim() })
        });

        if (!respuestaChat.ok) throw new Error("Error en el servidor de IA");
        const data = await respuestaChat.json();
        
        console.log("🤖 IA responde:", data.text);
        
        avatarHablando = true; 
        const reproductor = new Audio();
        reproductor.src = `/api/speak?text=${encodeURIComponent(data.text)}`;
        
        await reproductor.play();
        
        reproductor.onended = () => {
            avatarHablando = false; 
            resetearTemporizador();
            console.log("⏹️ Avatar en silencio. Escuchando ambiente...");
        };

    } catch (error) {
        console.error("Error comunicando con Vercel:", error);
        avatarHablando = false;
    }
}

// ==========================================
// 4. ARRANQUE DEL SISTEMA
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    const btnIniciar = document.getElementById('btnIniciar');
    if (btnIniciar) {
        btnIniciar.addEventListener('click', () => {
            btnIniciar.style.display = 'none'; 
            console.log("🚀 Iniciando sistema Jungle...");
            inicializarMicrofonoVAD();
            resetearTemporizador();
        });
    }
});