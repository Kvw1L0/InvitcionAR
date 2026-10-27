// api/deepgram-token.js
import { createClient } from '@deepgram/sdk';

export default async function handler(req, res) {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Método no permitido' });

    const masterKey = process.env.DEEPGRAM_API_KEY;
    if (!masterKey) {
        return res.status(500).json({ error: 'Falta DEEPGRAM_API_KEY en el servidor' });
    }

    try {
        // Intentamos generar una llave efímera (TTL de 60 segundos) si se dispone de DEEPGRAM_PROJECT_ID
        if (process.env.DEEPGRAM_PROJECT_ID) {
            const deepgram = createClient(masterKey);
            const { result, error } = await deepgram.manage.createProjectKey(
                process.env.DEEPGRAM_PROJECT_ID,
                {
                    comment: 'Ephemeral Totem BTL Key',
                    scopes: ['usage:write'],
                    time_to_live_in_seconds: 60
                }
            );
            if (!error && result?.key) {
                return res.status(200).json({ key: result.key, ephemeral: true });
            }
        }
    } catch (err) {
        console.warn("Fallback a llave estándar de Deepgram:", err.message);
    }

    // Fallback compatible si la llave configurada no tiene permisos de Manage o no hay Project ID
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ key: masterKey, ephemeral: false });
}
