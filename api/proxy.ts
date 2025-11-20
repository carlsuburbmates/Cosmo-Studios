
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenAI, Modality, Type, Schema, Chat } from "@google/genai";
import { CastMember, AspectRatio, ProjectManifest } from "../types";

// This is the server-side proxy. It is safe to use the API key here.
// Initialize the AI client with the API key from Vercel's environment variables.
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY! });

// --- UTILITIES (Copied from original geminiService) ---
const COSTS = {
  IMAGE_GENERATION: 0.004,
  VIDEO_GENERATION: 0.08,
  TTS_PER_CHAR: 0.000015,
  TEXT_GENERATION: 0.0005,
  INPUT_TOKEN: 0.000001,
};

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const cleanAndParseJson = <T>(text: string | undefined, fallback: T): T => {
  if (!text) return fallback;
  try {
    const cleaned = text.replace(/```json|```/g, '').trim();
    return JSON.parse(cleaned) as T;
  } catch (e) {
    return fallback;
  }
};

const writeString = (view: DataView, offset: number, string: string) => {
    for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
    }
};

const addWavHeader = (pcmData: Uint8Array, sampleRate: number, numChannels: number = 1, bitDepth: number = 16): ArrayBuffer => {
    const headerLength = 44;
    const dataLength = pcmData.length;
    const buffer = new ArrayBuffer(headerLength + dataLength);
    const view = new DataView(buffer);
    writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + dataLength, true);
    writeString(view, 8, 'WAVE');
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * numChannels * (bitDepth / 8), true);
    view.setUint16(32, numChannels * (bitDepth / 8), true);
    view.setUint16(34, bitDepth, true);
    writeString(view, 36, 'data');
    view.setUint32(40, dataLength, true);
    new Uint8Array(buffer, headerLength).set(pcmData);
    return buffer;
};

const decodeBase64 = (base64: string): Uint8Array => {
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
};

const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
};

const blobToBase64 = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
};


// --- SERVER-SIDE IMPLEMENTATIONS OF THE GEMINI SERVICE FUNCTIONS ---

const services: { [key: string]: (payload: any) => Promise<any> } = {
  chat: async ({ history, systemInstruction, message }) => {
    // For stateless chat via proxy, we send history each time
    const chat = ai.chats.create({
        model: "gemini-2.5-flash",
        config: { systemInstruction },
        history: history.slice(0, -1).map((m: any) => ({
            role: m.role,
            parts: [{ text: m.text }]
        }))
    });
    const result = await chat.sendMessage({ message });
    return { text: result.text };
  },
  generateCreativePrompts: async ({ cast }) => {
    const castDescription = cast
      .filter((c: CastMember) => c.role && c.role.trim() !== "")
      .map((c: CastMember) => `${c.label} (${c.role})`)
      .join(", ");

    const systemPrompt = `You are a cinematic director's assistant. Generate 5 distinct, visually striking scene descriptions involving these characters: ${castDescription}. Use the exact identifiers (e.g., 'Char1', 'Char2') in the sentences. Focus on visual details: lighting, camera angles, and action. Keep each prompt under 30 words.`;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: systemPrompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: { type: Type.ARRAY, items: { type: Type.STRING } } as Schema
      }
    });

    const prompts = cleanAndParseJson<string[]>(response.text, []);
    if (prompts.length === 0) throw new Error("No ideas generated");
    return { prompts, cost: COSTS.TEXT_GENERATION };
  },
  extractProjectManifest: async ({ conversationHistory }) => {
    const prompt = `Analyze the conversation history. Extract project details. Constraints: 1. Extract up to 4 main characters (names and roles). 2. Extract a list of scene descriptions. 3. Infer the best aspect ratio (default '16:9'). 4. Create a short project title. Return JSON only.`;
    const context = conversationHistory.map((msg: any) => `${msg.role.toUpperCase()}: ${msg.text}`).join("\n");

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: `${prompt}\n\nCONVERSATION LOG:\n${context}`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            projectTitle: { type: Type.STRING },
            cast: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { name: { type: Type.STRING }, role: { type: Type.STRING } } } },
            scenes: { type: Type.ARRAY, items: { type: Type.STRING } },
            suggestedRatio: { type: Type.STRING, enum: ['16:9', '9:16', '1:1', '21:9', '4:3'] }
          }
        } as Schema
      }
    });
    return cleanAndParseJson<ProjectManifest>(response.text, { projectTitle: "Untitled", cast: [], scenes: [], suggestedRatio: '16:9' });
  },
  generateSceneImage: async ({ prompt, castMembers, aspectRatio }) => {
    const detectCastMembers = (p: string, cast: CastMember[]) => {
      const sortedCast = [...cast].sort((a, b) => b.label.length - a.label.length);
      const matchedMembers = new Set<CastMember>();
      let cleanedPrompt = p;
      sortedCast.forEach(member => {
        if (!member.image) return;
        const keys = [member.label, member.role].filter(Boolean);
        const pattern = new RegExp(`\\b(${keys.join('|')})\\b`, 'gi');
        if (pattern.test(p)) matchedMembers.add(member);
      });
      const activeCastArray = Array.from(matchedMembers);
      activeCastArray.forEach((member, index) => {
        const keys = [member.label, member.role].filter(Boolean);
        const pattern = new RegExp(`\\b(${keys.join('|')})\\b`, 'gi');
        cleanedPrompt = cleanedPrompt.replace(pattern, `the person in reference image ${index + 1}`);
      });
      return { activeCastArray, cleanedPrompt };
    };

    const { activeCastArray, cleanedPrompt } = detectCastMembers(prompt, castMembers);
    const parts: any[] = activeCastArray.map(member => ({
      inlineData: { data: member.image!.split(",")[1], mimeType: member.mimeType }
    }));
    const ratioInstruction = aspectRatio === '16:9' ? "wide cinematic 16:9" : aspectRatio === '21:9' ? "ultrawide anamorphic 21:9" : aspectRatio === '9:16' ? "tall vertical 9:16 mobile" : aspectRatio === '4:3' ? "classic 4:3" : "square 1:1";
    const enhancedPrompt = `${cleanedPrompt}. (Generate in ${ratioInstruction}, high fidelity, consistent style).`;
    parts.push({ text: enhancedPrompt });

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-image",
      contents: { parts },
      config: { responseModalities: [Modality.IMAGE] },
    });

    const imagePart = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
    if (!imagePart?.inlineData) throw new Error("No image generated");
    return {
      imageUrl: `data:image/png;base64,${imagePart.inlineData.data}`,
      charactersIncluded: activeCastArray.map(c => c.label),
      cost: COSTS.IMAGE_GENERATION
    };
  },
  checkSceneConsistency: async ({ referenceImageUrl, generatedImageUrl, characterName }) => {
      const response = await ai.models.generateContent({
          model: "gemini-2.5-flash",
          contents: {
              parts: [
                  { inlineData: { data: referenceImageUrl.split(",")[1], mimeType: 'image/png' } },
                  { inlineData: { data: generatedImageUrl.split(",")[1], mimeType: 'image/png' } },
                  { text: `Compare the character "${characterName}" in the first image (reference) with the second image (generated). Give a consistency score (0-100) and 1 short sentence of feedback on facial features/style. Return JSON: { "score": number, "feedback": string }.` }
              ]
          },
          config: {
              responseMimeType: "application/json",
              responseSchema: { type: Type.OBJECT, properties: { score: { type: Type.INTEGER }, feedback: { type: Type.STRING } } } as Schema
          }
      });
      const result = cleanAndParseJson(response.text, { score: 0, feedback: "Analysis failed" });
      return { ...result, cost: COSTS.TEXT_GENERATION };
  },
  generateImageEdit: async ({ originalImageUrl, modificationPrompt }) => {
      const response = await ai.models.generateContent({
          model: "gemini-2.5-flash-image",
          contents: { parts: [{ inlineData: { data: originalImageUrl.split(",")[1], mimeType: 'image/png' } }, { text: `Edit this image: ${modificationPrompt}. Maintain style and composition.` }] },
          config: { responseModalities: [Modality.IMAGE] }
      });
      const imagePart = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
      if (!imagePart?.inlineData) throw new Error("No edit generated");
      return { imageUrl: `data:image/png;base64,${imagePart.inlineData.data}`, cost: COSTS.IMAGE_GENERATION };
  },
  generateSceneSuggestions: async ({ imageUrl }) => {
      const response = await ai.models.generateContent({
          model: "gemini-2.5-flash",
          contents: { parts: [{ inlineData: { data: imageUrl.split(",")[1], mimeType: 'image/png' } }, { text: "Analyze this movie scene. Provide a JSON list of 3 short, creative commands to modify or enhance it. Format: string array." }] },
          config: {
              responseMimeType: "application/json",
              responseSchema: { type: Type.ARRAY, items: { type: Type.STRING } } as Schema
          }
      });
      const suggestions = cleanAndParseJson<string[]>(response.text, []);
      return { suggestions: suggestions.slice(0, 3), cost: COSTS.TEXT_GENERATION };
  },
  generateSpeech: async ({ text, voiceName }) => {
    const tagRegex = /^\(([^)]+)\)\s*/;
    const match = text.match(tagRegex);
    let promptText = text;
    if (match) {
        const instruction = match[1];
        const actualText = text.replace(tagRegex, '').trim();
        promptText = `Say it ${instruction}: ${actualText}`;
    }
    const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: { parts: [{ text: promptText }] },
        config: {
            responseModalities: [Modality.AUDIO],
            speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName } } },
        },
    });
    const audioPart = response.candidates?.[0]?.content?.parts?.[0];
    if (!audioPart?.inlineData) throw new Error("No audio generated");
    const pcmBytes = decodeBase64(audioPart.inlineData.data);
    const wavBuffer = addWavHeader(pcmBytes, 24000, 1, 16);
    const wavBase64 = arrayBufferToBase64(wavBuffer);
    return { audioUrl: `data:audio/wav;base64,${wavBase64}`, cost: text.length * COSTS.TTS_PER_CHAR };
  },
  generateVideo: async ({ imageBase64, prompt, aspectRatio }) => {
    let operation = await ai.models.generateVideos({
        model: 'veo-3.1-fast-generate-preview',
        prompt: prompt || "Cinematic movement",
        image: { imageBytes: imageBase64.split(",")[1], mimeType: 'image/png' },
        config: { numberOfVideos: 1, resolution: '720p', aspectRatio }
    });
    while (!operation.done) {
        await wait(5000);
        operation = await ai.operations.getVideosOperation({ operation });
    }
    const videoUri = operation.response?.generatedVideos?.[0]?.video?.uri;
    if (!videoUri) throw new Error("No video URI returned.");
    const separator = videoUri.includes('?') ? '&' : '?';
    const fileResponse = await fetch(`${videoUri}${separator}key=${process.env.API_KEY}`);
    if (!fileResponse.ok) throw new Error("Failed to download video file.");
    const blob = await fileResponse.blob();
    // This part is tricky in serverless. Let's convert blob to base64 string.
    const buffer = await blob.arrayBuffer();
    // FIX: Replaced Node.js Buffer with a browser-compatible function to avoid reference errors.
    const videoBase64 = arrayBufferToBase64(buffer);
    return { videoUrl: `data:${blob.type};base64,${videoBase64}`, cost: COSTS.VIDEO_GENERATION };
  },
};

// The main serverless function handler
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { action, payload } = req.body;

  if (!action || typeof action !== 'string' || !services[action]) {
    return res.status(400).json({ error: 'Invalid action specified' });
  }

  try {
    const result = await services[action](payload);
    res.status(200).json(result);
  } catch (error: any) {
    console.error(`Error executing action "${action}":`, error);
    res.status(500).json({ error: error.message || 'An internal server error occurred' });
  }
}
