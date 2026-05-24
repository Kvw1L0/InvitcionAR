// api/deepgram-token.js
export default async function handler(req, res) {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Método no permitido' });
    
    // Le entregamos la llave al tótem para que abra el WebSocket
    res.status(200).json({ key: process.env.DEEPGRAM_API_KEY });
}