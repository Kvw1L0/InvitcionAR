import axios from 'axios';

export default async function handler(req, res) {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Método no permitido' });
    
    const { text } = req.query;
    if (!text) return res.status(400).json({ error: 'Falta el texto' });

    try {
        // optimize_streaming_latency=4 (máxima velocidad de ElevenLabs) + formato mp3_22050_32 (ligero y ultra-rápido)
        const url = `https://api.elevenlabs.io/v1/text-to-speech/6Gr4AVmTax1pMJO0lHRK/stream?optimize_streaming_latency=4&output_format=mp3_22050_32`;
        
        const response = await axios.post(
            url,
            { 
                text: text, 
                model_id: "eleven_flash_v2_5" // Modelo Flash v2.5 (~75ms de latencia de inferencia)
            },
            { 
                headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY },
                responseType: 'stream'
            }
        );

        res.setHeader('Content-Type', 'audio/mpeg');
        res.setHeader('Cache-Control', 'no-store');
        res.setHeader('Transfer-Encoding', 'chunked');
        
        response.data.pipe(res);
        
    } catch (error) {
        // Fallback automático a eleven_turbo_v2_5 si por alguna razón flash no estuviera habilitado
        try {
            const fallbackUrl = `https://api.elevenlabs.io/v1/text-to-speech/6Gr4AVmTax1pMJO0lHRK/stream?optimize_streaming_latency=4`;
            const fallbackRes = await axios.post(
                fallbackUrl,
                { text: text, model_id: "eleven_turbo_v2_5" },
                { headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY }, responseType: 'stream' }
            );
            res.setHeader('Content-Type', 'audio/mpeg');
            res.setHeader('Transfer-Encoding', 'chunked');
            fallbackRes.data.pipe(res);
        } catch (err2) {
            console.error("Error en el Streaming de Voz:", err2.message);
            res.status(500).json({ error: err2.message });
        }
    }
}
