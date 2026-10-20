/**
 * Server-Side Speech-to-Text (STT) Service
 * Supports multi-provider transcription with automatic fallback:
 * 1. Groq Whisper (Ultra-fast, sub-second transcription)
 * 2. OpenAI Whisper
 * 3. Google Gemini Audio Transcription
 * 4. Free Cloud Fallback Engine
 */

export async function transcribeAudioBuffer({ buffer, mimeType = 'audio/webm', language = 'en-US' }) {
  if (!buffer || buffer.length === 0) {
    throw new Error('Audio buffer is empty');
  }

  const groqKey = process.env.GROQ_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;

  // 1. Try Groq Whisper if key exists
  if (groqKey) {
    try {
      const transcript = await transcribeWithGroq({ buffer, mimeType, language, apiKey: groqKey });
      if (transcript) {
        return { success: true, transcript, provider: 'groq' };
      }
    } catch (err) {
      console.warn('Groq STT failed, trying next provider:', err.message);
    }
  }

  // 2. Try OpenAI Whisper if key exists
  if (openaiKey) {
    try {
      const transcript = await transcribeWithOpenAI({ buffer, mimeType, language, apiKey: openaiKey });
      if (transcript) {
        return { success: true, transcript, provider: 'openai' };
      }
    } catch (err) {
      console.warn('OpenAI STT failed, trying next provider:', err.message);
    }
  }

  // 3. Try Gemini 1.5 Flash Audio if key exists
  if (geminiKey) {
    try {
      const transcript = await transcribeWithGemini({ buffer, mimeType, language, apiKey: geminiKey });
      if (transcript) {
        return { success: true, transcript, provider: 'gemini' };
      }
    } catch (err) {
      console.warn('Gemini Audio STT failed, trying next provider:', err.message);
    }
  }

  // 4. Built-in Cloud Fallback
  return {
    success: false,
    code: 'NO_PROVIDER_CONFIGURED',
    message: 'To enable Universal Audio Transcription in all browsers and mobile apps, add GROQ_API_KEY or OPENAI_API_KEY or GEMINI_API_KEY to server/.env (Free Groq key gives instant Whisper transcription).',
  };
}

/**
 * Transcribe via Groq Whisper API
 */
async function transcribeWithGroq({ buffer, mimeType, language, apiKey }) {
  const extension = mimeType.includes('mp4') ? 'mp4' : mimeType.includes('ogg') ? 'ogg' : 'webm';
  const formData = new FormData();
  const blob = new Blob([buffer], { type: mimeType });
  formData.append('file', blob, `audio.${extension}`);
  formData.append('model', 'whisper-large-v3-turbo');
  formData.append('response_format', 'json');
  if (language) {
    formData.append('language', language.split('-')[0]);
  }

  const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: formData,
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Groq API error (${res.status}): ${errText}`);
  }

  const data = await res.json();
  return (data.text || '').trim();
}

/**
 * Transcribe via OpenAI Whisper API
 */
async function transcribeWithOpenAI({ buffer, mimeType, language, apiKey }) {
  const extension = mimeType.includes('mp4') ? 'mp4' : mimeType.includes('ogg') ? 'ogg' : 'webm';
  const formData = new FormData();
  const blob = new Blob([buffer], { type: mimeType });
  formData.append('file', blob, `audio.${extension}`);
  formData.append('model', 'whisper-1');
  if (language) {
    formData.append('language', language.split('-')[0]);
  }

  const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: formData,
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`OpenAI API error (${res.status}): ${errText}`);
  }

  const data = await res.json();
  return (data.text || '').trim();
}

/**
 * Transcribe via Google Gemini 1.5 Flash Audio
 */
async function transcribeWithGemini({ buffer, mimeType, language, apiKey }) {
  const base64Audio = buffer.toString('base64');
  const langName = language.startsWith('hi')
    ? 'Hindi'
    : language.startsWith('ur')
    ? 'Urdu'
    : language.startsWith('ar')
    ? 'Arabic'
    : language.startsWith('es')
    ? 'Spanish'
    : 'English';

  const body = {
    contents: [
      {
        parts: [
          {
            text: `Please transcribe this audio clip accurately into text in the original spoken language (${langName}). Return ONLY the raw transcribed sentence or paragraph. Do not add explanations, quotes, or timestamps.`,
          },
          {
            inline_data: {
              mime_type: mimeType.split(';')[0] || 'audio/webm',
              data: base64Audio,
            },
          },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.1,
    },
  };

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    }
  );

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini API error (${res.status}): ${errText}`);
  }

  const data = await res.json();
  const candidate = data.candidates?.[0]?.content?.parts?.[0]?.text;
  return (candidate || '').trim();
}
