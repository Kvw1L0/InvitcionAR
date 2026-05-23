import OpenAI from 'openai';
import axios from 'axios';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).send('Método no permitido');

    try {
        const audioBuffer = req.body;

        // 1. Transcripción (Deepgram)
        const deepgram = await axios.post('https://api.deepgram.com/v1/listen', audioBuffer, {
            headers: { 'Authorization': `Token ${process.env.DEEPGRAM_API_KEY}`, 'Content-Type': 'audio/webm' }
        });
        const userText = deepgram.data.results.channels[0].alternatives[0].transcript;

        // 2. Pensamiento (OpenAI)
        const chat = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                { role: "system", content: "Eres el co-animador de Jungle. Enérgico, breve (máx 2 frases), experto y cercano." },
                { role: "user", content: userText }
            ]
        });
        const aiText = chat.choices[0].message.content;

        // 3. Síntesis (ElevenLabs)
        const voice = await axios.post(
            `https://api.elevenlabs.io/v1/text-to-speech/${process.env.ELEVENLABS_VOICE_ID}/stream`,
            { text: aiText, model_id: "eleven_turbo_v2_5" },
            { headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY }, responseType: 'arraybuffer' }
        );

        res.setHeader('Content-Type', 'audio/mpeg');
        res.send(Buffer.from(voice.data));

    } catch (error) {
        console.error("Error en pipeline:", error);
        res.status(500).json({ error: "Fallo en el cerebro del robot" });
    }
}
