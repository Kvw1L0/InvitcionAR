import { initializeApp, cert, getApps, getApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import OpenAI from 'openai';

// 1. Conexión segura a tu base de datos actual
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
let app = !getApps().length ? initializeApp({ credential: cert(serviceAccount) }) : getApp();
const db = getFirestore(app, 'eventos');

// Inicializar la IA
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Importante: Aumentamos el límite de Vercel porque las imágenes pesan más que el texto
export const config = { api: { bodyParser: { sizeLimit: '10mb' } } };

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

    try {
        const { imageBase64, textInput } = req.body;
        // Apuntamos directo al documento de tu evento
        const targetDocId = 'OCzI3LihKgPtbDdj1HpU'; 
        let promptContenido = "";

        if (imageBase64) {
            // Modo Visión: Analiza la foto de la pauta
            promptContenido = [
                {
                    type: "text",
                    text: "Analiza esta imagen de una pauta o agenda de evento. Extrae rigurosamente los bloques de tiempo, nombres de expositores y actividades. Devuelve estrictamente la información formateada en Markdown limpio, calculando horas en formato 24 horas (HH:MM) si solo aparecen duraciones. No incluyas saludos ni explicaciones extras."
                },
                { type: "image_url", image_url: { url: `data:image/png;base64,${imageBase64}` } }
            ];
        } else if (textInput) {
            // Modo Texto: Arregla texto pegado desordenado
            promptContenido = `Estructura este texto desordenado de una pauta en formato Markdown limpio con bloques de tiempo 24h:\n\n${textInput}`;
        }

        // 2. Ejecutar la llamada a la IA de visión
        const response = await openai.chat.completions.create({
            model: "gpt-4o", // Ojo: usamos 4o puro porque tiene la mejor visión
            max_tokens: 1000,
            messages: [{ role: "user", content: promptContenido }]
        });

        const markdownGenerado = response.choices[0].message.content;

        // 3. Sobrescribir silenciosamente la mente del Avatar en Firestore
        await db.collection('eventos').doc(targetDocId).update({
            pautaCompleta: markdownGenerado
        });

        return res.status(200).json({ success: true, markdown: markdownGenerado });
    } catch (error) {
        console.error("Error procesando pauta:", error);
        return res.status(500).json({ error: error.message });
    }
}