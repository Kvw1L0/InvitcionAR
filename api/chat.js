import OpenAI from 'openai';
import axios from 'axios';
import { initializeApp, cert, getApps, getApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// 1. INICIALIZACIÓN DE FIREBASE ADMIN (Entorno Seguro)
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

// Nos aseguramos de guardar la 'app' en una variable
let app;
if (!getApps().length) {
    app = initializeApp({
        credential: cert(serviceAccount)
    });
} else {
    app = getApp();
}

// EL TOQUE FINAL: Le pasamos la 'app' primero, y el ID de tu base de datos después
const db = getFirestore(app, 'eventos');

// Función auxiliar para capturar el flujo de datos del audio
async function getRawBody(req) {
    const chunks = [];
    for await (const chunk of req) {
        chunks.push(chunk);
    }
    return Buffer.concat(chunks);
}

// Función para obtener la pauta del evento desde Firestore
async function obtenerDatosEvento() {
    try {
        // Apunta directamente a tu colección y al ID de tu documento
        const docRef = db.collection('eventos').doc('OCzI3LihKgPtbDdj1HpU');
        const doc = await docRef.get();
        
        if (doc.exists) {
            return doc.data();
        }
        console.log("No se encontró el documento, usando datos por defecto.");
        return null;
    } catch (error) {
        console.error("Error al leer Firestore:", error.message);
        return null;
    }
}

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        // 1. Recibir audio crudo desde el frontend
        const audioBuffer = await getRawBody(req);
        if (audioBuffer.length === 0) throw new Error("El archivo de audio está vacío");

        // 2. Transcripción con Deepgram (Configurado en Español y modelo rápido Nova-2)
        const deepgramUrl = 'https://api.deepgram.com/v1/listen?language=es&model=nova-2&smart_format=true';
        const deepgram = await axios.post(deepgramUrl, audioBuffer, {
            headers: { 
                'Authorization': `Token ${process.env.DEEPGRAM_API_KEY}`,
                'Content-Type': 'audio/webm' 
            }
        });
        
        const userText = deepgram.data.results.channels[0].alternatives[0].transcript;
        console.log("Usuario dijo:", userText);

        // 3. Obtener el contexto dinámico del evento desde Firestore
        const datosEvento = await obtenerDatosEvento();
        
        // Construcción de la pauta dinámica para el sistema
        let pautaSistema = "Eres el co-animador de Jungle. Enérgico, breve (máx 2 frases), experto y cercano.";
        if (datosEvento) {
            pautaSistema += ` Actualmente estás en el evento: "${datosEvento.nombreEvento}". `;
            pautaSistema += `Descripción del entorno: ${datosEvento.descripcion}. `;
            pautaSistema += `Tus instrucciones para interactuar con el público hoy: ${datosEvento.instrucciones}.`;
        }

        // 4. Pensamiento con OpenAI (Inyectando el contexto de Firebase)
        const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
        const chat = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                { role: "system", content: pautaSistema },
                { role: "user", content: userText }
            ]
        });
        const aiText = chat.choices[0].message.content;
        console.log("IA responde:", aiText);

        // 5. Síntesis de voz con ElevenLabs (Modelo Flash / Turbo de baja latencia)
        const voiceResponse = await axios.post(
            `https://api.elevenlabs.io/v1/text-to-speech/${process.env.ELEVENLABS_VOICE_ID}/stream`,
            { text: aiText, model_id: "eleven_turbo_v2_5" },
            { headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY }, responseType: 'arraybuffer' }
        );

        // 6. Enviar audio de vuelta al navegador
        res.setHeader('Content-Type', 'audio/mpeg');
        res.send(Buffer.from(voiceResponse.data));

    } catch (error) {
        console.error("ERROR EN EL CEREBRO DINÁMICO:", error.message);
        res.status(500).json({ error: error.message });
    }
}