

import { GoogleGenAI, Modality, Type, Schema, Chat, LiveServerMessage, Blob } from "@google/genai";
import { CastMember, AspectRatio, ProjectManifest } from "../types";

// THIS IS A CLIENT-SIDE FILE. DO NOT USE API KEYS HERE.
// All calls are now routed through our secure serverless proxy.

/**
 * A generic fetch wrapper for our serverless proxy.
 * @param action - The name of the geminiService function to call.
 * @param payload - The arguments for that function.
 * @returns The JSON response from the serverless function.
 */
async function proxyFetch<T>(action: string, payload: any): Promise<T> {
  const response = await fetch('/api/proxy', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ action, payload }),
  });

  if (!response.ok) {
    const errorBody = await response.json();
    throw new Error(errorBody.error || 'API call failed');
  }

  return response.json();
}


// --- UTILITIES ---

export const COSTS = {
  IMAGE_GENERATION: 0.004,
  VIDEO_GENERATION: 0.08,
  TTS_PER_CHAR: 0.000015,
  TEXT_GENERATION: 0.0005,
  INPUT_TOKEN: 0.000001, // Approx
};

// PAIN POINT 5: Client-Side IP/Safety Validator
// This remains on the client for instant feedback before sending to the API.
const BLOCKED_TERMS = [
  "mickey mouse", "marvel", "dc comics", "star wars", "harry potter", 
  "pokemon", "nintendo", "super mario", "disney", "pixar"
];

export const validatePromptSafety = (prompt: string): { safe: boolean; flaggedTerm?: string } => {
  const lower = prompt.toLowerCase().replace(/[-_.]/g, ' ');
  const found = BLOCKED_TERMS.find(term => {
     const escapedTerm = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); 
     const regex = new RegExp(`\\b${escapedTerm}\\b`, 'i'); 
     return regex.test(lower);
  });

  if (found) return { safe: false, flaggedTerm: found };
  return { safe: true };
};

// PAIN POINT 1: Cost Estimator (remains client-side)
export const estimateBatchCost = (promptCount: number): number => {
  return promptCount * COSTS.IMAGE_GENERATION;
};

export const estimateTTSCost = (charCount: number): number => {
  return charCount * COSTS.TTS_PER_CHAR;
};

// --- MODULE 0: BRAINSTORMING & ONBOARDING ---

// Chat sessions are stateful and complex to proxy. 
// For this feature, we will use non-proxied, stateless generateContent calls.
let chatHistory: { role: 'user' | 'model'; text: string }[] = [];
let chatSystemInstruction = "";

export const createChatSession = (systemInstruction: string): Chat => {
    chatSystemInstruction = systemInstruction;
    chatHistory = [];
    // Return a mock object that mimics the Chat interface for sendMessage
    return {
        sendMessage: async (request: { message: string }) => {
            chatHistory.push({ role: 'user', text: request.message });
            const response = await proxyFetch<{ text: string }>('chat', {
                history: chatHistory,
                systemInstruction: chatSystemInstruction,
                message: request.message,
            });
            chatHistory.push({ role: 'model', text: response.text });
            return response;
        }
    } as unknown as Chat;
};


export const generateCreativePrompts = async (
  cast: CastMember[]
): Promise<{ prompts: string[]; cost: number }> => {
  return proxyFetch('generateCreativePrompts', { cast });
};

export const extractProjectManifest = async (
  conversationHistory: { role: 'user' | 'model'; text: string }[]
): Promise<ProjectManifest> => {
  return proxyFetch('extractProjectManifest', { conversationHistory });
}

// --- MODULE 1: IMAGES ---

export const generateSceneImage = async (
  prompt: string,
  castMembers: CastMember[],
  aspectRatio: AspectRatio = '16:9'
): Promise<{ imageUrl: string; charactersIncluded: string[]; cost: number }> => {
  const safety = validatePromptSafety(prompt);
  if (!safety.safe) throw new Error(`Safety Block: Prompt contains restricted term "${safety.flaggedTerm}"`);
  return proxyFetch('generateSceneImage', { prompt, castMembers, aspectRatio });
};

export const checkSceneConsistency = async (
    referenceImageUrl: string,
    generatedImageUrl: string,
    characterName: string
): Promise<{ score: number; feedback: string; cost: number }> => {
    return proxyFetch('checkSceneConsistency', { referenceImageUrl, generatedImageUrl, characterName });
};

export const generateImageEdit = async (
    originalImageUrl: string,
    modificationPrompt: string
): Promise<{ imageUrl: string; cost: number }> => {
    return proxyFetch('generateImageEdit', { originalImageUrl, modificationPrompt });
};

export const generateSceneSuggestions = async (
    imageUrl: string
): Promise<{ suggestions: string[]; cost: number }> => {
    return proxyFetch('generateSceneSuggestions', { imageUrl });
};

// --- MODULE 2: AUDIO (TTS) ---

export const generateSpeech = async (
  text: string,
  voiceName: string
): Promise<{ audioUrl: string; cost: number }> => {
  return proxyFetch('generateSpeech', { text, voiceName });
};

// --- MODULE 3: MOTION (VIDEO) ---

export const generateVideo = async (
  imageBase64: string,
  prompt: string,
  aspectRatio: AspectRatio = '16:9'
): Promise<{ videoUrl: string; cost: number }> => {
  const safety = validatePromptSafety(prompt);
  if (!safety.safe) throw new Error(`Safety Block: Prompt contains restricted term "${safety.flaggedTerm}"`);
  return proxyFetch('generateVideo', { imageBase64, prompt, aspectRatio });
};


// --- LIVE CREATIVE SESSION ---
/**
 * Checks if the current environment supports the Live Session feature.
 * This feature requires the AI Studio environment which provides window.aistudio.
 */
export const isLiveSessionAvailable = (): boolean => {
  return typeof window !== 'undefined' && !!window.aistudio;
};

async function decodeAudioData(
    data: Uint8Array,
    ctx: AudioContext,
    sampleRate: number,
    numChannels: number
): Promise<AudioBuffer> {
    const dataInt16 = new Int16Array(data.buffer);
    const frameCount = dataInt16.length / numChannels;
    const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);
    for (let channel = 0; channel < numChannels; channel++) {
        const channelData = buffer.getChannelData(channel);
        for (let i = 0; i < frameCount; i++) {
            channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
        }
    }
    return buffer;
}

const decodeBase64 = (base64: string): Uint8Array => {
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
};

const encodeBase64 = (bytes: Uint8Array): string => {
    let binary = '';
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
};

function createPcmBlob(data: Float32Array): Blob {
    const l = data.length;
    const int16 = new Int16Array(l);
    for (let i = 0; i < l; i++) {
        int16[i] = data[i] * 32768;
    }
    return {
        data: encodeBase64(new Uint8Array(int16.buffer)),
        mimeType: 'audio/pcm;rate=16000',
    };
}

export const startLiveSession = (callbacks: {
    onMessage: (message: LiveServerMessage) => void,
    onOpen: () => void,
    onClose: (e: CloseEvent) => void,
    onError: (e: ErrorEvent) => void,
    onAudioChunk: (audioChunk: AudioBuffer) => void,
}, outputAudioContext: AudioContext) => { 
    if (!isLiveSessionAvailable()) {
        throw new Error("Live session is only available in the AI Studio environment.");
    }

    // This is now safe to call because the AI Studio environment will provide process.env.API_KEY
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY }); 
    let stream: MediaStream | null = null;
    let inputAudioContext: AudioContext | null = null;
    let scriptProcessor: ScriptProcessorNode | null = null;

    const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        callbacks: {
            onopen: async () => {
                callbacks.onOpen();
                try {
                    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                    inputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
                    const source = inputAudioContext.createMediaStreamSource(stream);
                    scriptProcessor = inputAudioContext.createScriptProcessor(4096, 1, 1);
                    scriptProcessor.onaudioprocess = (audioProcessingEvent) => {
                        const inputData = audioProcessingEvent.inputBuffer.getChannelData(0);
                        const pcmBlob = createPcmBlob(inputData);
                        sessionPromise.then((session) => {
                            session.sendRealtimeInput({ media: pcmBlob });
                        });
                    };
                    source.connect(scriptProcessor);
                    scriptProcessor.connect(inputAudioContext.destination);
                } catch (e) {
                    callbacks.onError(new ErrorEvent('mic_error', { message: 'Microphone access denied.' }));
                }
            },
            onmessage: async (message: LiveServerMessage) => {
                callbacks.onMessage(message);
                const base64Audio = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
                if (base64Audio) {
                    const audioBuffer = await decodeAudioData(
                        decodeBase64(base64Audio),
                        outputAudioContext,
                        24000, 1
                    );
                    callbacks.onAudioChunk(audioBuffer);
                }
            },
            onerror: callbacks.onError,
            onclose: (e: CloseEvent) => {
                if (stream) stream.getTracks().forEach(track => track.stop());
                if (scriptProcessor) scriptProcessor.disconnect();
                if (inputAudioContext) inputAudioContext.close();
                callbacks.onClose(e);
            },
        },
        config: {
            responseModalities: [Modality.AUDIO],
            speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } } },
            systemInstruction: 'You are a creative partner for a film director. Help them brainstorm ideas for characters, plots, and scenes. Be encouraging, concise, and imaginative.',
            outputAudioTranscription: {},
            inputAudioTranscription: {},
        },
    });

    return sessionPromise;
};
