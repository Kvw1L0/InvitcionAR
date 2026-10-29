import { initializeApp, cert, getApps, getApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
let app = !getApps().length ? initializeApp({ credential: cert(serviceAccount) }) : getApp();
const db = getFirestore(app, 'eventos');

const TARGET_DOC_ID = 'OCzI3LihKgPtbDdj1HpU';

// Caché en memoria RAM para evitar miles de lecturas a Firestore por el polling cada 2.5s del Tótem
let cachedConfigData = null;
let cachedConfigTime = 0;
const CONFIG_TTL_MS = 12000;

function formatConfigResponse(data = {}) {
    return {
        mostrarSubtitulos: data.mostrarSubtitulos ?? false,
        mostrarHudEstado: data.mostrarHudEstado ?? true,
        modoAttractLoop: data.modoAttractLoop ?? true,
        coloresDinamicos: data.coloresDinamicos ?? true,
        nombreEvento: data.nombreEvento || 'Activación Jungle',
        descripcion: data.descripcion || '',
        instrucciones: data.instrucciones || '',
        pautaCompleta: data.pautaCompleta || '',
        salvavidasTrigger: data.salvavidasTrigger || null
    };
}

export default async function handler(req, res) {
    const docRef = db.collection('eventos').doc(TARGET_DOC_ID);
    res.setHeader('Cache-Control', 'no-store');

    if (req.method === 'GET') {
        const now = Date.now();
        if (cachedConfigData && (now - cachedConfigTime) < CONFIG_TTL_MS) {
            return res.status(200).json(formatConfigResponse(cachedConfigData));
        }
        try {
            const doc = await docRef.get();
            const data = doc.exists ? doc.data() : {};
            cachedConfigData = data;
            cachedConfigTime = now;
            return res.status(200).json(formatConfigResponse(data));
        } catch (error) {
            console.error("Error leyendo config:", error);
            if (cachedConfigData) {
                return res.status(200).json(formatConfigResponse(cachedConfigData));
            }
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
                instrucciones,
                salvavidasText
            } = req.body;

            const updatePayload = {};
            if (typeof mostrarSubtitulos === 'boolean') updatePayload.mostrarSubtitulos = mostrarSubtitulos;
            if (typeof mostrarHudEstado === 'boolean') updatePayload.mostrarHudEstado = mostrarHudEstado;
            if (typeof modoAttractLoop === 'boolean') updatePayload.modoAttractLoop = modoAttractLoop;
            if (typeof coloresDinamicos === 'boolean') updatePayload.coloresDinamicos = coloresDinamicos;
            if (typeof nombreEvento === 'string') updatePayload.nombreEvento = nombreEvento;
            if (typeof descripcion === 'string') updatePayload.descripcion = descripcion;
            if (typeof instrucciones === 'string') updatePayload.instrucciones = instrucciones;

            // Si el administrador disparó un botón "Salvavidas"
            if (typeof salvavidasText === 'string' && salvavidasText.trim() !== '') {
                updatePayload.salvavidasTrigger = {
                    id: Date.now(),
                    text: salvavidasText.trim()
                };
            }

            // Actualizar caché en memoria inmediatamente (0ms para el próximo GET del Tótem)
            cachedConfigData = { ...(cachedConfigData || {}), ...updatePayload };
            cachedConfigTime = Date.now();

            await docRef.set(updatePayload, { merge: true });
            return res.status(200).json({ success: true, config: updatePayload });
        } catch (error) {
            console.error("Error guardando config:", error);
            return res.status(500).json({ error: error.message });
        }
    }

    return res.status(405).json({ error: 'Método no permitido' });
}
