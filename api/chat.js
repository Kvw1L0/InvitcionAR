import OpenAI from 'openai';
import axios from 'axios';
import { initializeApp, cert, getApps, getApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// 1. INICIALIZACIÓN DE FIREBASE ADMIN (Entorno Seguro)
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

let app;
if (!getApps().length) {
    app = initializeApp({
        credential: cert(serviceAccount)
    });
} else {
    app = getApp();
}

// Nos conectamos específicamente a la base de datos 'eventos'
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
        const docRef = db.collection('eventos').doc('OCzI3LihKgPtbDdj1HpU');
        const doc = await docRef.get();
        
        if (doc.exists) {
            return doc.data();
        }
        console.log("No se encontró el documento en la base de datos.");
        return null;
    } catch (error) {
        console.error("Error al leer Firestore:", error.message);
        return null;
    }
}

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Método no permitido' });
    }

    try {
        // 1. CAPTURAR EL ID DEL USUARIO DESDE LA URL (Para la memoria)
        const userId = req.query.userId || 'usuario_anonimo';

        // 2. RECIBIR AUDIO CRUDO
        const audioBuffer = await getRawBody(req);
        if (audioBuffer.length === 0) throw new Error("El archivo de audio está vacío");

        // 3. TRANSCRIPCIÓN CON DEEPGRAM (Nova-2 en Español)
        const deepgramUrl = 'https://api.deepgram.com/v1/listen?language=es&model=nova-2&smart_format=true';
        const deepgram = await axios.post(deepgramUrl, audioBuffer, {
            headers: { 
                'Authorization': `Token ${process.env.DEEPGRAM_API_KEY}`,
                'Content-Type': 'audio/webm' 
            }
        });
        
        const userText = deepgram.data.results.channels[0].alternatives[0].transcript;
        console.log(`Usuario (${userId}) dijo:`, userText);

        // 4. OBTENER TIEMPO REAL EN CHILE
        const ahora = new Date();
        const opcionesFecha = { timeZone: 'America/Santiago', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
        const opcionesHora = { timeZone: 'America/Santiago', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false };
        
        const fechaChile = ahora.toLocaleDateString('es-CL', opcionesFecha);
        const horaChile = ahora.toLocaleTimeString('es-CL', opcionesHora);

        // 5. OBTENER EL CONTEXTO DINÁMICO DEL EVENTO
        const datosEvento = await obtenerDatosEvento();
        
        // 6. CONSTRUCCIÓN DEL SYSTEM PROMPT ROBUSTO
        let pautaSistema = `Eres el co-animador e inteligencia central de Jungle. Tu estilo es enérgico, cercano, sumamente profesional pero lúdico. 
        Tus respuestas deben ser ultra-breves (máximo 2 frases cortas) para mantener la dinámica del evento viva y no aburrir al usuario.
        Si el usuario te dice su nombre, recuérdalo y úsalo en las siguientes respuestas.
        
        INFORMACIÓN CRUCIAL DE TIEMPO REAL:
        - Fecha de hoy: ${fechaChile}
        - Hora exacta actual: ${horaChile}
        
        Usa esta hora exacta para calcular matemáticamente qué bloque del cronograma está activo o cuál viene a continuación si el usuario te lo pregunta.`;

        if (datosEvento) {
            pautaSistema += `\n\nESTÁS EN EL EVENTO: "${datosEvento.nombreEvento || 'Activación Jungle'}".`;
            
            if (datosEvento.descripcion) pautaSistema += `\nDescripción general: ${datosEvento.descripcion}`;
            if (datosEvento.instrucciones) pautaSistema += `\nObjetivos del día: ${datosEvento.instrucciones}`;
            if (datosEvento.pautaCompleta) {
                pautaSistema += `\n\nCRONOGRAMA Y PAUTA COMPLETA DEL EVENTO:\n---\n${datosEvento.pautaCompleta}\n---`;
            }
        }

        // 7. RECUPERAR LA MEMORIA DESDE FIRESTORE
        const historyRef = db.collection('conversaciones').doc(userId);
        const doc = await historyRef.get();
        let historialMensajes = doc.exists ? doc.data().mensajes : [];

        // Agregamos el mensaje actual del usuario al historial
        historialMensajes.push({ role: "user", content: userText });

        // Para ahorrar tokens, solo le pasamos los últimos 6 mensajes a la IA
        const historialCorto = historialMensajes.slice(-6);

        // 8. PENSAMIENTO CON OPENAI
        const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
        const chat = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                { role: "system", content: pautaSistema },
                ...historialCorto
            ]
        });
        const aiText = chat.choices[0].message.content;
        console.log("IA responde:", aiText);

        // 9. GUARDAR LA RESPUESTA EN LA MEMORIA
        historialMensajes.push({ role: "assistant", content: aiText });
        await historyRef.set({ mensajes: historialMensajes }, { merge: true });

        // 10. DEVOLVER SOLO TEXTO (El streaming de voz ahora ocurre en api/speak.js)
        return res.status(200).json({ text: aiText });

    } catch (error) {
        console.error("ERROR EN EL CEREBRO DINÁMICO:", error.message);
        return res.status(500).json({ error: error.message });
    }
}