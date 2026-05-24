import axios from 'axios';

export default async function handler(req, res) {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Método no permitido' });
    
    const { text } = req.query;
    if (!text) return res.status(400).json({ error: 'Falta el texto' });

    try {
        // optimize_streaming_latency=3 obliga a ElevenLabs a responder en milisegundos
        const url = `https://api.elevenlabs.io/v1/text-to-speech/${process.env.ELEVENLABS_VOICE_ID}/stream?optimize_streaming_latency=3`;
        
        const response = await axios.post(
            url,
            { text: text, model_id: "eleven_turbo_v2_5" },
            { 
                headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY },
                responseType: 'stream' // ¡LA MAGIA DEL STREAMING AQUÍ!
            }
        );

        // Preparamos a Vercel para enviar los datos en pedacitos (chunks)
        res.setHeader('Content-Type', 'audio/mpeg');
        res.setHeader('Transfer-Encoding', 'chunked');
        
        // Conectamos la tubería: ElevenLabs -> Vercel -> Parlantes del Tótem
        response.data.pipe(res);
        
    } catch (error) {
        console.error("Error en el Streaming de Voz:", error.message);
        res.status(500).json({ error: error.message });
    }
}