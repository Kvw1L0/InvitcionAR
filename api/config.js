import { initializeApp, cert, getApps, getApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
let app = !getApps().length ? initializeApp({ credential: cert(serviceAccount) }) : getApp();
const db = getFirestore(app, 'eventos');

const TARGET_DOC_ID = 'OCzI3LihKgPtbDdj1HpU';

export default async function handler(req, res) {
    const docRef = db.collection('eventos').doc(TARGET_DOC_ID);

    if (req.method === 'GET') {
        try {
            const doc = await docRef.get();
            const data = doc.exists ? doc.data() : {};
            return res.status(200).json({
                mostrarSubtitulos: data.mostrarSubtitulos ?? false,
                mostrarHudEstado: data.mostrarHudEstado ?? true,
                modoAttractLoop: data.modoAttractLoop ?? true,
                coloresDinamicos: data.coloresDinamicos ?? true,
                nombreEvento: data.nombreEvento || 'Activación Jungle',
                descripcion: data.descripcion || '',
                instrucciones: data.instrucciones || '',
                pautaCompleta: data.pautaCompleta || ''
            });
        } catch (error) {
            console.error("Error leyendo config:", error);
            return res.status(500).json({ error: error.message });
        }
    }

    if (req.method === 'POST') {
        try {
            const {
                mostrarSubtitulos,
                mostrarHudEstado,
                modoAttractLoop,
                coloresDinamicos,
                nombreEvento,
                descripcion,
                instrucciones
            } = req.body;

            const updatePayload = {};
            if (typeof mostrarSubtitulos === 'boolean') updatePayload.mostrarSubtitulos = mostrarSubtitulos;
            if (typeof mostrarHudEstado === 'boolean') updatePayload.mostrarHudEstado = mostrarHudEstado;
            if (typeof modoAttractLoop === 'boolean') updatePayload.modoAttractLoop = modoAttractLoop;
            if (typeof coloresDinamicos === 'boolean') updatePayload.coloresDinamicos = coloresDinamicos;
            if (typeof nombreEvento === 'string') updatePayload.nombreEvento = nombreEvento;
            if (typeof descripcion === 'string') updatePayload.descripcion = descripcion;
            if (typeof instrucciones === 'string') updatePayload.instrucciones = instrucciones;

            await docRef.set(updatePayload, { merge: true });
            return res.status(200).json({ success: true, config: updatePayload });
        } catch (error) {
            console.error("Error guardando config:", error);
            return res.status(500).json({ error: error.message });
        }
    }

    return res.status(405).json({ error: 'Método no permitido' });
}
