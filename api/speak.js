import https from 'node:https';
import { Readable } from 'node:stream';

// Agente HTTPS persistente con Keep-Alive para ahorrar ~120-200ms de handshake TCP+TLS con ElevenLabs en cada frase
const keepAliveAgent = new https.Agent({
    keepAlive: true,
    keepAliveMsecs: 30000,
    maxSockets: 10
});

const VOICE_ID = '6Gr4AVmTax1pMJO0lHRK';

export default async function handler(req, res) {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Método no permitido' });

    const { text } = req.query;
    if (!text) return res.status(400).json({ error: 'Falta el texto' });

    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'Falta ELEVENLABS_API_KEY' });

    try {
        // optimize_streaming_latency=4 + mp3_22050_32 + language_code="es" (evita detección automática de idioma)
        const url = `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}/stream?optimize_streaming_latency=4&output_format=mp3_22050_32`;

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'xi-api-key': apiKey,
                'Content-Type': 'application/json',
                'Accept': 'audio/mpeg'
            },
            body: JSON.stringify({
                text,
                model_id: 'eleven_flash_v2_5',
                language_code: 'es'
            })
        });

        if (!response.ok) {
            throw new Error(`ElevenLabs Flash HTTP ${response.status}`);
        }

        res.setHeader('Content-Type', 'audio/mpeg');
        res.setHeader('Cache-Control', 'no-store');
        res.setHeader('Transfer-Encoding', 'chunked');

        if (response.body) {
            Readable.fromWeb(response.body).pipe(res);
            return;
        }
    } catch (error) {
        // Fallback automático a eleven_turbo_v2_5 si por alguna razón flash falla
        try {
            const fallbackUrl = `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}/stream?optimize_streaming_latency=4&output_format=mp3_22050_32`;
            const fallbackRes = await fetch(fallbackUrl, {
                method: 'POST',
                headers: {
                    'xi-api-key': apiKey,
                    'Content-Type': 'application/json',
                    'Accept': 'audio/mpeg'
                },
                body: JSON.stringify({
                    text,
                    model_id: 'eleven_turbo_v2_5',
                    language_code: 'es'
                })
            });

            if (!fallbackRes.ok) {
                throw new Error(`ElevenLabs Turbo HTTP ${fallbackRes.status}`);
            }

            res.setHeader('Content-Type', 'audio/mpeg');
            res.setHeader('Cache-Control', 'no-store');
            res.setHeader('Transfer-Encoding', 'chunked');

            if (fallbackRes.body) {
                Readable.fromWeb(fallbackRes.body).pipe(res);
                return;
            }
        } catch (err2) {
            console.error('Error en el Streaming de Voz:', err2.message);
            if (!res.headersSent) {
                res.status(500).json({ error: err2.message });
            }
        }
    }
}
