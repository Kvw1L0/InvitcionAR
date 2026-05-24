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
// 2. MOTOR VAD CON CALIBRACIÓN DINÁMICA
// ==========================================
let audioContext;
let analyser;
let microphone;
let mediaRecorder;
let audioChunks = [];

let isRecording = false;
let silenceTimer = null;
let isCalibrating = false;
let avatarHablando = false; // IMPORTANTE: Para que no se escuche a sí mismo

let baseNoiseFloor = 0; 
let dynamicVolumeThreshold = 15; 
const SIGNAL_TO_NOISE_MARGIN = 10; 
const SILENCE_DURATION = 1500; 

async function inicializarMicrofonoVAD() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 512;
        analyser.smoothingTimeConstant = 0.2;
        
        microphone = audioContext.createMediaStreamSource(stream);
        microphone.connect(analyser);

        mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
        
        mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) audioChunks.push(event.data);
        };

        mediaRecorder.onstop = async () => {
            const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
            audioChunks = [];
            await enviarAudioAlCerebro(audioBlob);
        };

        console.log("🎤 Micrófono encendido y conectado.");
        calibrarRuidoAmbiente();

    } catch (err) {
        console.error("Error al acceder al micrófono:", err);
        alert("Por favor permite el acceso al micrófono para interactuar.");
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
        console.log(`✅ Calibración lista. Ruido base: ${baseNoiseFloor.toFixed(2)} | Umbral de voz: ${dynamicVolumeThreshold.toFixed(2)}`);
        
        monitorearVolumen();
    }, 3000);
}

function monitorearVolumen() {
    // Si el sistema está calibrando o el avatar está hablando, ignoramos el micrófono
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
            console.log(`🗣️ Voz detectada. Grabando...`);
            isRecording = true;
            mediaRecorder.start();
        }
        
        if (silenceTimer) {
            clearTimeout(silenceTimer);
            silenceTimer = null;
        }
    } else {
        if (isRecording && !silenceTimer) {
            silenceTimer = setTimeout(() => {
                console.log("🤫 Silencio de 1.5s. Procesando audio...");
                isRecording = false;
                mediaRecorder.stop();
                silenceTimer = null;
            }, SILENCE_DURATION);
        }
    }

    requestAnimationFrame(monitorearVolumen);
}

// ==========================================
// 3. CONEXIÓN BTL DE BAJA LATENCIA (TTFB)
// ==========================================
async function enviarAudioAlCerebro(audioBlob) {
    try {
        console.log("🧠 1. Enviando audio a transcribir y pensar...");
        
        // Paso 1: Obtener la respuesta en texto súper rápido (chat.js)
        const respuestaChat = await fetch(`/api/chat?userId=${userId}`, {
            method: 'POST',
            body: audioBlob
        });

        if (!respuestaChat.ok) throw new Error("Error en el servidor de IA");
        const data = await respuestaChat.json();
        
        console.log("🤖 IA responde (Texto):", data.text);
        console.log("🔊 2. Abriendo túnel de streaming de voz...");

        // Paso 2: Reproducción en Streaming Nativo (speak.js)
        avatarHablando = true; // Bloqueamos el micrófono
        
        const reproductor = new Audio();
        // Usamos encodeURIComponent para pasar el texto de forma segura por la URL
        reproductor.src = `/api/speak?text=${encodeURIComponent(data.text)}`;
        
        // Aquí puedes disparar la animación de "Avatar Hablando" en Three.js
        console.log("▶️ Reproduciendo voz en streaming...");
        await reproductor.play();
        
        reproductor.onended = () => {
            console.log("⏹️ Avatar terminó de hablar. Micrófono abierto nuevamente.");
            avatarHablando = false; // Desbloqueamos el micrófono
            resetearTemporizador();
            // Aquí puedes devolver al avatar a su pose "Idle" en Three.js
        };

    } catch (error) {
        console.error("Error en la tubería de comunicación:", error);
        avatarHablando = false; // Liberar bloqueo en caso de error
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