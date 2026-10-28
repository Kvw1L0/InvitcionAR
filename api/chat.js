import OpenAI from 'openai';
import { initializeApp, cert, getApps, getApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
let app = !getApps().length ? initializeApp({ credential: cert(serviceAccount) }) : getApp();
const db = getFirestore(app, 'eventos');

// Instancia global reutilizable entre invocaciones (ahorra inicialización en cada request)
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Caché en memoria para la pauta del evento (evita consultar Firestore en cada turno si hace menos de 30s)
let cachedEventData = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 30000;

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
        const { text: userText } = req.body;

        if (!userText || userText.trim() === "") {
            return res.status(400).json({ error: "Texto vacío" });
        }
        console.log(`Usuario (${userId}) dijo:`, userText);

        const ahora = new Date();
        const opcionesFecha = { timeZone: 'America/Santiago', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
        const opcionesHora = { timeZone: 'America/Santiago', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false };
        const fechaChile = ahora.toLocaleDateString('es-CL', opcionesFecha);
        const horaChile = ahora.toLocaleTimeString('es-CL', opcionesHora);

        const historyRef = db.collection('conversaciones').doc(userId);

        // ¡OPTIMIZACIÓN DE LATENCIA #1: Consultamos Evento e Historial en PARALELO!
        const [datosEvento, historyDoc] = await Promise.all([
            obtenerDatosEventoRapido(),
            historyRef.get()
        ]);

        let pautaSistema = `Eres la co-animadora e inteligencia llamada Sandy. Tu estilo es enérgico, cercano, sumamente profesional pero lúdico. 
        Tus respuestas deben ser ultra-breves (máximo 2 frases cortas y directas, ideales para ser habladas sin demora). Si el usuario te dice su nombre, recuérdalo y úsalo en las siguientes respuestas.
        INFORMACIÓN CRUCIAL: Fecha: ${fechaChile} | Hora: ${horaChile}`;

        if (datosEvento) {
            pautaSistema += `\n\nESTÁS EN EL EVENTO: "${datosEvento.nombreEvento || 'Activación'}".`;
            if (datosEvento.descripcion) pautaSistema += `\nDescripción: ${datosEvento.descripcion}`;
            if (datosEvento.instrucciones) pautaSistema += `\nObjetivos: ${datosEvento.instrucciones}`;
            if (datosEvento.pautaCompleta) pautaSistema += `\nPAUTA:\n---\n${datosEvento.pautaCompleta}\n---`;
        }

        let historialMensajes = historyDoc.exists ? (historyDoc.data().mensajes || []) : [];
        historialMensajes.push({ role: "user", content: userText });
        const historialCorto = historialMensajes.slice(-6);

        // ¡OPTIMIZACIÓN DE LATENCIA #2: max_tokens acotado para generación ultra-rápida!
        const chat = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            max_tokens: 110,
            temperature: 0.7,
            messages: [{ role: "system", content: pautaSistema }, ...historialCorto]
        });

        const aiText = chat.choices[0].message.content;
        console.log("IA responde:", aiText);

        historialMensajes.push({ role: "assistant", content: aiText });

        // Respondemos INMEDIATAMENTE al cliente y guardamos el historial sin bloquear la respuesta HTTP
        res.status(200).json({ text: aiText });

        historyRef.set({ mensajes: historialMensajes.slice(-12) }, { merge: true }).catch(err => {
            console.warn("Error guardando historial async:", err.message);
        });

    } catch (error) {
        console.error("ERROR EN EL CEREBRO DINÁMICO:", error.message);
        return res.status(500).json({ error: error.message });
    }
}
