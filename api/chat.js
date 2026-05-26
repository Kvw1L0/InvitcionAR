import OpenAI from 'openai';
import { initializeApp, cert, getApps, getApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
let app = !getApps().length ? initializeApp({ credential: cert(serviceAccount) }) : getApp();
const db = getFirestore(app, 'eventos');

async function obtenerDatosEvento() {
    try {
        const docRef = db.collection('eventos').doc('OCzI3LihKgPtbDdj1HpU');
        const doc = await docRef.get();
        return doc.exists ? doc.data() : null;
    } catch (error) {
        return null;
    }
}

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

    try {
        const userId = req.query.userId || 'usuario_anonimo';
        
        // ¡LA MAGIA! Ahora recibimos TEXTO directo desde el frontend, no audio.
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

        const datosEvento = await obtenerDatosEvento();
        
        let pautaSistema = `Eres la co-animadora e inteligencia llamada Sandy. Tu estilo es enérgico, cercano, sumamente profesional pero lúdico. 
        Tus respuestas deben ser ultra-breves (máximo 2 frases cortas). Si el usuario te dice su nombre, recuérdalo y úsalo en las siguientes respuestas.
        INFORMACIÓN CRUCIAL: Fecha: ${fechaChile} | Hora: ${horaChile}`;

        if (datosEvento) {
            pautaSistema += `\n\nESTÁS EN EL EVENTO: "${datosEvento.nombreEvento || 'Activación'}".`;
            if (datosEvento.descripcion) pautaSistema += `\nDescripción: ${datosEvento.descripcion}`;
            if (datosEvento.instrucciones) pautaSistema += `\nObjetivos: ${datosEvento.instrucciones}`;
            if (datosEvento.pautaCompleta) pautaSistema += `\nPAUTA:\n---\n${datosEvento.pautaCompleta}\n---`;
        }

        const historyRef = db.collection('conversaciones').doc(userId);
        const doc = await historyRef.get();
        let historialMensajes = doc.exists ? doc.data().mensajes : [];

        historialMensajes.push({ role: "user", content: userText });
        const historialCorto = historialMensajes.slice(-6);

        const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
        const chat = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [{ role: "system", content: pautaSistema }, ...historialCorto]
        });
        
        const aiText = chat.choices[0].message.content;
        console.log("IA responde:", aiText);

        historialMensajes.push({ role: "assistant", content: aiText });
        await historyRef.set({ mensajes: historialMensajes }, { merge: true });

        return res.status(200).json({ text: aiText });

    } catch (error) {
        console.error("ERROR EN EL CEREBRO DINÁMICO:", error.message);
        return res.status(500).json({ error: error.message });
    }
}