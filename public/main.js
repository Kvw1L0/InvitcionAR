// ==========================================
// 1. CONFIGURACIÓN DEL TÓTEM Y MEMORIA
// ==========================================
function generarNuevoId() {
    return 'totem_user_' + Math.random().toString(36).substr(2, 9);
}

let userId = generarNuevoId();
let temporizadorInactividad;
const TIEMPO_ESPERA_MS = 45000; // 45 segundos para resetear la sesión de la persona

function reiniciarSesionTotem() {
    userId = generarNuevoId();
    console.log("Sesión reiniciada. Tótem Jungle listo para una nueva persona: " + userId);
    calibrarRuidoAmbiente();
    // Aquí puedes activar una animación del avatar en estado "Idle" o de espera
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

// Variables dinámicas (ya no son constantes fijas)
let baseNoiseFloor = 0; 
let dynamicVolumeThreshold = 15; 
const SIGNAL_TO_NOISE_MARGIN = 10; // Qué tan fuerte debe hablar la persona por sobre el ruido
const SILENCE_DURATION = 1500; // Milisegundos de silencio para cortar

async function inicializarMicrofonoVAD() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 512;
        analyser.smoothingTimeConstant = 0.2; // Un poco más de suavizado para el ruido
        
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

        console.log("🎤 Micrófono encendido.");
        
        // Antes de escuchar a la gente, calibramos el ruido de la sala
        calibrarRuidoAmbiente();

    } catch (err) {
        console.error("Error al acceder al micrófono:", err);
    }
}

// Función para medir el ruido de fondo durante 3 segundos
function calibrarRuidoAmbiente() {
    isCalibrating = true;
    console.log("⚙️ Calibrando ruido de fondo... (Mantener silencio relativo)");
    
    let totalVolume = 0;
    let sampleCount = 0;
    
    // Tomamos muestras durante 3 segundos
    const calibracionInterval = setInterval(() => {
        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(dataArray);
        
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) { sum += dataArray[i]; }
        
        totalVolume += (sum / dataArray.length);
        sampleCount++;
    }, 100); // 10 muestras por segundo

    setTimeout(() => {
        clearInterval(calibracionInterval);
        
        // Calcular el promedio del ruido del evento
        baseNoiseFloor = totalVolume / sampleCount;
        
        // El nuevo umbral para empezar a grabar es el ruido ambiente + el margen para la voz
        dynamicVolumeThreshold = baseNoiseFloor + SIGNAL_TO_NOISE_MARGIN;
        
        isCalibrating = false;
        console.log(`✅ Calibración lista. Ruido base: ${baseNoiseFloor.toFixed(2)} | Umbral de voz: ${dynamicVolumeThreshold.toFixed(2)}`);
        
        // Ahora sí, empezamos a monitorear la voz
        monitorearVolumen();
    }, 3000);
}

// Bucle de monitoreo en tiempo real
function monitorearVolumen() {
    if (isCalibrating) return; // Si está calibrando, no grabar a nadie

    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(dataArray);

    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) { sum += dataArray[i]; }
    const averageVolume = sum / dataArray.length;

    // Lógica de detección usando el UMBRAL DINÁMICO
    if (averageVolume > dynamicVolumeThreshold) {
        resetearTemporizador(); 
        
        if (!isRecording) {
            console.log(`🗣️ Voz detectada (Vol: ${averageVolume.toFixed(2)} > Umbral: ${dynamicVolumeThreshold.toFixed(2)})`);
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
                console.log("🤫 Silencio. Procesando...");
                isRecording = false;
                mediaRecorder.stop();
                silenceTimer = null;
            }, SILENCE_DURATION);
        }
    }

    requestAnimationFrame(monitorearVolumen);
}

// ==========================================
// 3. CONEXIÓN CON EL BACKEND Y AVATAR
// ==========================================
async function enviarAudioAlCerebro(audioBlob) {
    try {
        // Mostrar indicador visual de "Pensando..."
        console.log("Enviando audio a Vercel...");
        
        const respuesta = await fetch(`/api/chat?userId=${userId}`, {
            method: 'POST',
            body: audioBlob
        });

        if (!respuesta.ok) throw new Error("Error en el servidor");

        // Recibir el audio generado por ElevenLabs
        const audioBuffer = await respuesta.arrayBuffer();
        const blob = new Blob([audioBuffer], { type: 'audio/mpeg' });
        const urlAudio = URL.createObjectURL(blob);
        
        // Reproducir el audio (Y aquí sincronizarías las animaciones de tu modelo 3D)
        const reproductor = new Audio(urlAudio);
        reproductor.play();
        
        reproductor.onended = () => {
            console.log("Avatar terminó de hablar. Listo para escuchar nuevamente.");
            // Aquí el avatar vuelve a su pose de descanso
        };

    } catch (error) {
        console.error("Error al procesar la respuesta:", error);
    }
}

// Iniciar todo el sistema al cargar la página (o al presionar un botón de "Iniciar Experiencia")
document.addEventListener('DOMContentLoaded', () => {
    // Por políticas de navegadores, a veces es necesario que el usuario haga 
    // un primer clic en la pantalla antes de poder activar el micrófono.
    // Puedes atar inicializarMicrofonoVAD() a un botón de "Comenzar".
    inicializarMicrofonoVAD(); 
    resetearTemporizador();
});