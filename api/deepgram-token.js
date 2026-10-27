// api/deepgram-token.js
export default async function handler(req, res) {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Método no permitido' });

    const masterKey = process.env.DEEPGRAM_API_KEY;
    if (!masterKey) {
        return res.status(500).json({ error: 'Falta DEEPGRAM_API_KEY en el servidor' });
    }

    res.setHeader('Cache-Control', 'no-store');

    // Si existe DEEPGRAM_PROJECT_ID configurado, intentamos crear una llave temporal vía REST
    if (process.env.DEEPGRAM_PROJECT_ID) {
        try {
            const response = await fetch(
                `https://api.deepgram.com/v1/projects/${process.env.DEEPGRAM_PROJECT_ID}/keys`,
                {
                    method: 'POST',
                    headers: {
                        'Authorization': `Token ${masterKey}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        comment: 'Ephemeral Totem BTL Key',
                        scopes: ['usage:write'],
                        time_to_live_in_seconds: 60
                    })
                }
            );
            if (response.ok) {
                const data = await response.json();
                if (data?.key) {
                    return res.status(200).json({ key: data.key, ephemeral: true });
                }
            }
        } catch (err) {
            console.warn("Fallback a llave estándar de Deepgram:", err.message);
        }
    }

    // Le entregamos la llave al tótem para que abra el WebSocket
    return res.status(200).json({ key: masterKey, ephemeral: false });
}
