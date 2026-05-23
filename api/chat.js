import OpenAI from 'openai';
import axios from 'axios';

// Función para capturar el flujo de datos (el audio) de forma segura
async function getRawBody(req) {
    const chunks = [];
    for await (const chunk of req) {
        chunks.push(chunk);
    }
    return Buffer.concat(chunks);
}

export default async function handler(req, res) {
    // Solo permitir POST
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        // 1. Recibir audio crudo desde el frontend
        const audioBuffer = await getRawBody(req);
        if (audioBuffer.length === 0) throw new Error("El archivo de audio está vacío");

        // 2. Transcripción con Deepgram
        // Asegúrate de que tu DEEPGRAM_API_KEY esté correcta en Vercel Settings
        const deepgram = await axios.post('https://api.deepgram.com/v1/listen', audioBuffer, {
            headers: { 
                'Authorization': `Token ${process.env.DEEPGRAM_API_KEY}`,
                'Content-Type': 'audio/webm' 
            }
        });
        
        const userText = deepgram.data.results.channels[0].alternatives[0].transcript;
        console.log("Usuario dijo:", userText);

        // 3. Pensamiento con OpenAI
        const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
        const chat = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                { role: "system", content: "Eres el co-animador de Jungle. Enérgico, breve (máx 2 frases), experto y cercano." },
                { role: "user", content: userText }
            ]
        });
        const aiText = chat.choices[0].message.content;
        console.log("IA responde:", aiText);

        // 4. Síntesis de voz con ElevenLabs
        const voiceResponse = await axios.post(
            `https://api.elevenlabs.io/v1/text-to-speech/${process.env.ELEVENLABS_VOICE_ID}/stream`,
            { text: aiText, model_id: "eleven_turbo_v2_5" },
            { headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY }, responseType: 'arraybuffer' }
        );

        // 5. Enviar audio de vuelta al navegador
        res.setHeader('Content-Type', 'audio/mpeg');
        res.send(Buffer.from(voiceResponse.data));

    } catch (error) {
        console.error("ERROR EN EL CEREBRO:", error.message);
        res.status(500).json({ error: error.message });
    }
}