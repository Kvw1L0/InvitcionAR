import OpenAI from 'openai';
import { initializeApp, cert, getApps, getApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
let app = !getApps().length ? initializeApp({ credential: cert(serviceAccount) }) : getApp();
const db = getFirestore(app, 'eventos');

// Instancia global reutilizable entre invocaciones (ahorra inicialización en cada request)
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Caché en memoria para la pauta del evento (evita consultar Firestore en cada turno)
let cachedEventData = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 45000;

// Caché en memoria RAM para el historial de conversación por usuario (0ms de latencia de base de datos)
const memoryHistoryMap = new Map();

async function obtenerDatosEventoRapido() {
    const now = Date.now();
    if (cachedEventData && (now - cacheTimestamp) < CACHE_TTL_MS) {
        return cachedEventData;
    }
    try {
        const docRef = db.collection('eventos').doc('OCzI3LihKgPtbDdj1HpU');
        const doc = await docRef.get();
        if (doc.exists) {
            cachedEventData = doc.data();
            cacheTimestamp = now;
            return cachedEventData;
        }
        return null;
    } catch (error) {
        return cachedEventData;
    }
}

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

    try {
        const userId = req.query.userId || 'usuario_anonimo';
        const { text: userText, history: clientHistory, stream: wantStream } = req.body;

        if (!userText || userText.trim() === "") {
            return res.status(400).json({ error: "Texto vacío" });
        }

        const ahora = new Date();
        const opcionesFecha = { timeZone: 'America/Santiago', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
        const opcionesHora = { timeZone: 'America/Santiago', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false };
        const fechaChile = ahora.toLocaleDateString('es-CL', opcionesFecha);
        const horaChile = ahora.toLocaleTimeString('es-CL', opcionesHora);

        // ¡OPTIMIZACIÓN EXTREMA DE LATENCIA: Si el cliente envía su historial en memoria o está en RAM,
        // no esperamos a Firestore (0ms de bloqueo en lectura de historial)!
        let historialMensajes;
        let datosEvento;

        if (Array.isArray(clientHistory)) {
            datosEvento = await obtenerDatosEventoRapido();
            historialMensajes = clientHistory.slice(-6);
        } else if (memoryHistoryMap.has(userId)) {
            datosEvento = await obtenerDatosEventoRapido();
            historialMensajes = [...memoryHistoryMap.get(userId)];
        } else {
            const historyRef = db.collection('conversaciones').doc(userId);
            const [evt, historyDoc] = await Promise.all([
                obtenerDatosEventoRapido(),
                historyRef.get()
            ]);
            datosEvento = evt;
            historialMensajes = historyDoc.exists ? (historyDoc.data().mensajes || []) : [];
        }

        let pautaSistema = `Eres la co-animadora e inteligencia llamada Sandy. Tu estilo es enérgico, cercano, sumamente profesional pero lúdico. 
        Tus respuestas deben ser ultra-breves (máximo 2 frases cortas y directas, ideales para ser habladas sin demora). Empieza tu primera frase de forma directa y corta (5 a 10 palabras) para que la voz se reproduzca al instante. Si el usuario te dice su nombre, recuérdalo y úsalo en las siguientes respuestas.
        INFORMACIÓN CRUCIAL: Fecha: ${fechaChile} | Hora: ${horaChile}`;

        if (datosEvento) {
            pautaSistema += `\n\nESTÁS EN EL EVENTO: "${datosEvento.nombreEvento || 'Activación'}".`;
            if (datosEvento.descripcion) pautaSistema += `\nDescripción: ${datosEvento.descripcion}`;
            if (datosEvento.instrucciones) pautaSistema += `\nObjetivos: ${datosEvento.instrucciones}`;
            if (datosEvento.pautaCompleta) pautaSistema += `\nPAUTA:\n---\n${datosEvento.pautaCompleta}\n---`;
        }

        historialMensajes.push({ role: "user", content: userText.trim() });
        const historialCorto = historialMensajes.slice(-6);

        // MODO STREAMING NDJSON: Emite la primera frase apenas se completa (~180-250ms) para que ElevenLabs hable de inmediato
        if (wantStream) {
            res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
            res.setHeader('Cache-Control', 'no-store, no-transform');
            res.setHeader('X-Accel-Buffering', 'no');

            const stream = await openai.chat.completions.create({
                model: "gpt-4o-mini",
                max_tokens: 95,
                temperature: 0.65,
                stream: true,
                messages: [{ role: "system", content: pautaSistema }, ...historialCorto]
            });

            let fullText = "";
            let sentenceBuffer = "";
            let firstSentenceEmitted = false;

            for await (const chunk of stream) {
                const delta = chunk.choices?.[0]?.delta?.content || "";
                if (!delta) continue;
                fullText += delta;
                sentenceBuffer += delta;

                // En cuanto tengamos la primera oración completa (. ! ? o más de 22 caracteres con coma/pausa)
                if (!firstSentenceEmitted) {
                    const match = sentenceBuffer.match(/^([\s\S]{8,}?[.!?]+)(?:\s+|$)/);
                    if (match) {
                        const firstClause = match[1].trim();
                        sentenceBuffer = sentenceBuffer.slice(match[0].length);
                        firstSentenceEmitted = true;
                        res.write(JSON.stringify({ type: 'sentence', index: 0, text: firstClause }) + '\n');
                    }
                }
            }

            const remainder = sentenceBuffer.trim();
            if (!firstSentenceEmitted && remainder) {
                res.write(JSON.stringify({ type: 'sentence', index: 0, text: remainder }) + '\n');
            } else if (remainder) {
                res.write(JSON.stringify({ type: 'sentence', index: 1, text: remainder }) + '\n');
            }

            const finalClean = fullText.trim();
            historialMensajes.push({ role: "assistant", content: finalClean });
            memoryHistoryMap.set(userId, historialMensajes.slice(-10));

            res.write(JSON.stringify({ type: 'done', text: finalClean }) + '\n');
            return res.end();
        }

        // MODO CLÁSICO JSON (Fallback compatible)
        const chat = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            max_tokens: 95,
            temperature: 0.65,
            messages: [{ role: "system", content: pautaSistema }, ...historialCorto]
        });

        const aiText = chat.choices[0].message.content;
        historialMensajes.push({ role: "assistant", content: aiText });
        memoryHistoryMap.set(userId, historialMensajes.slice(-10));

        return res.status(200).json({ text: aiText });

    } catch (error) {
        console.error("ERROR EN EL CEREBRO DINÁMICO:", error.message);
        if (!res.headersSent) {
            return res.status(500).json({ error: error.message });
        }
        res.end();
    }
}
