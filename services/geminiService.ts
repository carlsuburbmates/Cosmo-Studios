

import { GoogleGenAI, Modality, Type, Schema, Chat, LiveServerMessage, Blob } from "@google/genai";
import { CastMember, AspectRatio, ProjectManifest } from "../types";

// Helper to init AI
const getApiKey = (): string => {
  if (process.env.API_KEY) return process.env.API_KEY;
  const sessionKey = sessionStorage.getItem("cosmo_api_key");
  if (sessionKey) return sessionKey;
  throw new Error("API Key not found. Please enter your key on the login screen.");
};

const getAI = () => {
  const apiKey = getApiKey();
  return new GoogleGenAI({ apiKey });
};

// --- UTILITIES ---

export const COSTS = {
  IMAGE_GENERATION: 0.004,
  VIDEO_GENERATION: 0.08,
  TTS_PER_CHAR: 0.000015,
  TEXT_GENERATION: 0.0005,
  INPUT_TOKEN: 0.000001, // Approx
};

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Robust JSON cleaning to handle LLM Markdown output
const cleanAndParseJson = <T>(text: string | undefined, fallback: T): T => {
  if (!text) return fallback;
  try {
    // Remove markdown code blocks (```json ... ```)
    const cleaned = text.replace(/```json|```/g, '').trim();
    return JSON.parse(cleaned) as T;
  } catch (e) {
    console.error("JSON Parse Error:", e, "Raw text:", text);
    return fallback;
  }
};

// PAIN POINT 4: Fortified Error Handling
async function executeWithRetry<T>(
  operation: () => Promise<T>, 
  retries = 3, 
  delay = 1000
): Promise<T> {
  try {
    return await operation();
  } catch (error: any) {
    const msg = error.message?.toLowerCase() || "";
    
    // Map generic errors to user-friendly concepts
    if (msg.includes("safety")) throw new Error("Safety Filter Triggered. Please adjust your prompt.");
    if (msg.includes("quota") || msg.includes("429")) {
        if (retries > 0) {
            console.warn(`Rate limit hit, retrying in ${delay}ms...`);
            await wait(delay);
            return executeWithRetry(operation, retries - 1, delay * 2);
        }
        throw new Error("Daily Quota Exceeded. Please try again later.");
    }
    if (msg.includes("503") || msg.includes("overloaded")) {
        if (retries > 0) {
            await wait(delay);
            return executeWithRetry(operation, retries - 1, delay * 2);
        }
        throw new Error("AI Service is momentarily overloaded.");
    }
    
    throw error;
  }
}

// PAIN POINT 5: Client-Side IP/Safety Validator
// UPDATED: Normalizes input (spaces instead of punctuation) to catch evasive terms (e.g. "mickey-mouse")
const BLOCKED_TERMS = [
  "mickey mouse", "marvel", "dc comics", "star wars", "harry potter", 
  "pokemon", "nintendo", "super mario", "disney", "pixar"
];

export const validatePromptSafety = (prompt: string): { safe: boolean; flaggedTerm?: string } => {
  // QA Measure: Normalize punctuation to spaces to prevent evasion (mickey-mouse -> mickey mouse)
  const lower = prompt.toLowerCase().replace(/[-_.]/g, ' ');
  
  // Regex \b matches word boundaries.
  const found = BLOCKED_TERMS.find(term => {
     const escapedTerm = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); 
     const regex = new RegExp(`\\b${escapedTerm}\\b`, 'i'); 
     return regex.test(lower);
  });

  if (found) return { safe: false, flaggedTerm: found };
  return { safe: true };
};

// PAIN POINT 1: Cost Estimator
export const estimateBatchCost = (promptCount: number): number => {
  return promptCount * COSTS.IMAGE_GENERATION;
};

export const estimateTTSCost = (charCount: number): number => {
  return charCount * COSTS.TTS_PER_CHAR;
};

// --- AUDIO/BLOB UTILITIES ---
const blobToBase64 = (blob: globalThis.Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
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

    // RIFF identifier
    writeString(view, 0, 'RIFF');
    // file length
    view.setUint32(4, 36 + dataLength, true);
    // RIFF type
    writeString(view, 8, 'WAVE');
    // format chunk identifier
    writeString(view, 12, 'fmt ');
    // format chunk length
    view.setUint32(16, 16, true);
    // sample format (1 is PCM)
    view.setUint16(20, 1, true);
    // channel count
    view.setUint16(22, numChannels, true);
    // sample rate
    view.setUint32(24, sampleRate, true);
    // byte rate (sample rate * block align)
    view.setUint32(28, sampleRate * numChannels * (bitDepth / 8), true);
    // block align (channel count * bytes per sample)
    view.setUint16(32, numChannels * (bitDepth / 8), true);
    // bits per sample
    view.setUint16(34, bitDepth, true);
    // data chunk identifier
    writeString(view, 36, 'data');
    // data chunk length
    view.setUint32(40, dataLength, true);

    // write pcm data
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

const encodeBase64 = (bytes: Uint8Array): string => {
    let binary = '';
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
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

// --- MODULE 0: BRAINSTORMING & ONBOARDING ---

export const createChatSession = (systemInstruction: string): Chat => {
  const ai = getAI();
  return ai.chats.create({
    model: "gemini-2.5-flash",
    config: { systemInstruction }
  });
};

export const generateCreativePrompts = async (
  cast: CastMember[]
): Promise<{ prompts: string[]; cost: number }> => {
  const ai = getAI();
  
  const castDescription = cast
    .filter(c => c.role && c.role.trim() !== "")
    .map(c => `${c.label} (${c.role})`)
    .join(", ");

  const systemPrompt = `
    You are a cinematic director's assistant. 
    Generate 5 distinct, visually striking scene descriptions involving these characters: ${castDescription}.
    Use the exact identifiers (e.g., 'Char1', 'Char2') in the sentences.
    Focus on visual details: lighting, camera angles, and action.
    Keep each prompt under 30 words.
  `;

  return executeWithRetry(async () => {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: systemPrompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: { type: Type.STRING }
        } as Schema
      }
    });

    const prompts = cleanAndParseJson<string[]>(response.text, []);
    if (prompts.length === 0) throw new Error("No ideas generated");

    return { 
      prompts,
      cost: COSTS.TEXT_GENERATION
    };
  });
};

// Chat-to-Manifest Extraction
export const extractProjectManifest = async (
  conversationHistory: { role: 'user' | 'model'; text: string }[]
): Promise<ProjectManifest> => {
  const ai = getAI();
  
  const prompt = `
    Analyze the conversation history. Extract project details.
    Constraints:
    1. Extract up to 4 main characters (names and roles).
    2. Extract a list of scene descriptions.
    3. Infer the best aspect ratio (default '16:9').
    4. Create a short project title.
    Return JSON only.
  `;

  const context = conversationHistory.map(msg => `${msg.role.toUpperCase()}: ${msg.text}`).join("\n");

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: `${prompt}\n\nCONVERSATION LOG:\n${context}`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          projectTitle: { type: Type.STRING },
          cast: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING },
                role: { type: Type.STRING }
              }
            }
          },
          scenes: { type: Type.ARRAY, items: { type: Type.STRING } },
          suggestedRatio: { type: Type.STRING, enum: ['16:9', '9:16', '1:1', '21:9', '4:3'] }
        }
      } as Schema
    }
  });

  return cleanAndParseJson<ProjectManifest>(response.text, {
      projectTitle: "Untitled",
      cast: [],
      scenes: [],
      suggestedRatio: '16:9'
  });
}

// --- MODULE 1: IMAGES ---

const detectCastMembers = (prompt: string, castMembers: CastMember[]): { 
  activeCastArray: CastMember[], 
  cleanedPrompt: string 
} => {
    const sortedCast = [...castMembers].sort((a, b) => {
         const lenA = Math.max(a.label.length, a.role.length);
         const lenB = Math.max(b.label.length, b.role.length);
         return lenB - lenA;
    });

    const matchedMembers = new Set<CastMember>();
    let cleanedPrompt = prompt;
    
    // Pass 1: Detection
    sortedCast.forEach((member) => {
        if (!member.image) return;
        const keys = [member.label];
        if (member.role && member.role.trim().length > 1) keys.push(member.role);
        
        const pattern = keys.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
        const regex = new RegExp(`\\b(${pattern})\\b`, 'gi');
        
        if (regex.test(prompt)) matchedMembers.add(member);
    });

    const activeCastArray = Array.from(matchedMembers);

    // Pass 2: Replacement
    activeCastArray.forEach((member, index) => {
         const keys = [member.label];
         if (member.role && member.role.trim().length > 1) keys.push(member.role);
         const pattern = keys.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
         const regex = new RegExp(`\\b(${pattern})\\b`, 'gi');
         cleanedPrompt = cleanedPrompt.replace(regex, `the person in reference image ${index + 1}`);
    });

    return { activeCastArray, cleanedPrompt };
};

export const generateSceneImage = async (
  prompt: string,
  castMembers: CastMember[],
  aspectRatio: AspectRatio = '16:9'
): Promise<{ imageUrl: string; charactersIncluded: string[]; cost: number }> => {
  const ai = getAI();
  
  // Safety Check Pre-Flight
  const safety = validatePromptSafety(prompt);
  if (!safety.safe) throw new Error(`Safety Block: Prompt contains restricted term "${safety.flaggedTerm}"`);

  const { activeCastArray, cleanedPrompt } = detectCastMembers(prompt, castMembers);

  const parts: any[] = [];
  activeCastArray.forEach((member) => {
      const base64Data = member.image!.split(",")[1] || member.image!;
      parts.push({
        inlineData: { data: base64Data, mimeType: member.mimeType }
      });
  });

  const ratioInstruction = 
    aspectRatio === '16:9' ? "wide cinematic 16:9" :
    aspectRatio === '21:9' ? "ultrawide anamorphic 21:9" :
    aspectRatio === '9:16' ? "tall vertical 9:16 mobile" :
    aspectRatio === '4:3' ? "classic 4:3" : "square 1:1";

  const enhancedPrompt = `${cleanedPrompt}. (Generate in ${ratioInstruction}, high fidelity, consistent style).`;
  parts.push({ text: enhancedPrompt });

  return executeWithRetry(async () => {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-image",
      contents: { parts: parts },
      config: { responseModalities: [Modality.IMAGE] },
    });

    const candidate = response.candidates?.[0];
    const imagePart = candidate?.content?.parts?.find((p) => p.inlineData);

    if (!imagePart || !imagePart.inlineData) throw new Error("No image generated");

    return { 
      imageUrl: `data:image/png;base64,${imagePart.inlineData.data}`, 
      charactersIncluded: activeCastArray.map(c => c.label),
      cost: COSTS.IMAGE_GENERATION
    };
  });
};

// PAIN POINT 2: Agentic Consistency Check
export const checkSceneConsistency = async (
    referenceImageUrl: string,
    generatedImageUrl: string,
    characterName: string
): Promise<{ score: number; feedback: string; cost: number }> => {
    const ai = getAI();
    const refBase64 = referenceImageUrl.split(",")[1] || referenceImageUrl;
    const genBase64 = generatedImageUrl.split(",")[1] || generatedImageUrl;

    // We use Flash for this as it is cheap and smart enough for visual comparison
    return executeWithRetry(async () => {
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: {
                parts: [
                    { inlineData: { data: refBase64, mimeType: 'image/png' } },
                    { inlineData: { data: genBase64, mimeType: 'image/png' } },
                    { text: `Compare the character "${characterName}" in the first image (reference) with the second image (generated). Give a consistency score (0-100) and 1 short sentence of feedback on facial features/style. Return JSON: { "score": number, "feedback": string }.` }
                ]
            },
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        score: { type: Type.INTEGER },
                        feedback: { type: Type.STRING }
                    }
                } as Schema
            }
        });

        const result = cleanAndParseJson(response.text, { score: 0, feedback: "Analysis failed" });
        return { ...result, cost: COSTS.TEXT_GENERATION + (COSTS.INPUT_TOKEN * 1000) }; // Rough estimate
    });
};

// Image Modification
export const generateImageEdit = async (
    originalImageUrl: string,
    modificationPrompt: string
): Promise<{ imageUrl: string; cost: number }> => {
    const ai = getAI();
    const base64Data = originalImageUrl.split(",")[1] || originalImageUrl;

    return executeWithRetry(async () => {
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash-image",
            contents: {
                parts: [
                    { inlineData: { data: base64Data, mimeType: 'image/png' } },
                    { text: `Edit this image: ${modificationPrompt}. Maintain style and composition.` }
                ]
            },
            config: { responseModalities: [Modality.IMAGE] }
        });

        const candidate = response.candidates?.[0];
        const imagePart = candidate?.content?.parts?.find((p) => p.inlineData);

        if (!imagePart || !imagePart.inlineData) throw new Error("No edit generated");

        return {
            imageUrl: `data:image/png;base64,${imagePart.inlineData.data}`,
            cost: COSTS.IMAGE_GENERATION
        };
    });
};

// Smart Suggestions
export const generateSceneSuggestions = async (
    imageUrl: string
): Promise<{ suggestions: string[]; cost: number }> => {
    const ai = getAI();
    const base64Data = imageUrl.split(",")[1] || imageUrl;

    return executeWithRetry(async () => {
        try {
            const response = await ai.models.generateContent({
                model: "gemini-2.5-flash",
                contents: {
                    parts: [
                        { inlineData: { data: base64Data, mimeType: 'image/png' } },
                        { text: "Analyze this movie scene. Provide a JSON list of 3 short, creative commands to modify or enhance it. Format: string array." }
                    ]
                },
                config: {
                    responseMimeType: "application/json",
                    responseSchema: {
                        type: Type.ARRAY,
                        items: { type: Type.STRING }
                    } as Schema
                }
            });

            const suggestions = cleanAndParseJson<string[]>(response.text, []);
            return { suggestions: suggestions.slice(0, 3), cost: COSTS.TEXT_GENERATION };
        } catch (error) {
            return { suggestions: ["Enhance details", "Change lighting", "Cinematic grading"], cost: 0 };
        }
    });
};

// --- MODULE 2: AUDIO (TTS) ---

export const generateSpeech = async (
  text: string,
  voiceName: string
): Promise<{ audioUrl: string; cost: number }> => {
  const ai = getAI();

  // New: Parse for emotion tags e.g., (shouting)
  const tagRegex = /^\(([^)]+)\)\s*/;
  const match = text.match(tagRegex);
  let promptText = text;
  
  if (match) {
    const instruction = match[1]; // e.g., "shouting"
    const actualText = text.replace(tagRegex, '').trim();
    promptText = `Say it ${instruction}: ${actualText}`;
  }

  return executeWithRetry(async () => {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: {
        parts: [{ text: promptText }],
      },
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: voiceName },
          },
        },
      },
    });

    const audioPart = response.candidates?.[0]?.content?.parts?.[0];
    if (!audioPart || !audioPart.inlineData) {
      throw new Error("No audio generated");
    }

    // Gemini TTS returns raw PCM (24kHz, 1 channel, 16-bit usually)
    // We must wrap it in a WAV container to play it in browser <audio> tags
    const pcmBytes = decodeBase64(audioPart.inlineData.data);
    const wavBuffer = addWavHeader(pcmBytes, 24000, 1, 16);
    const wavBase64 = arrayBufferToBase64(wavBuffer);

    return { 
      audioUrl: `data:audio/wav;base64,${wavBase64}`,
      cost: text.length * COSTS.TTS_PER_CHAR
    }; 
  });
};

// --- MODULE 3: MOTION (VIDEO) ---

export const generateVideo = async (
  imageBase64: string,
  prompt: string,
  aspectRatio: AspectRatio = '16:9'
): Promise<{ videoUrl: string; cost: number }> => {
  const ai = getAI();
  const cleanBase64 = imageBase64.split(",")[1] || imageBase64;
  const apiKey = getApiKey();
  
  const safety = validatePromptSafety(prompt);
  if (!safety.safe) throw new Error(`Safety Block: Prompt contains restricted term "${safety.flaggedTerm}"`);

  return executeWithRetry(async () => {
    let operation = await ai.models.generateVideos({
      model: 'veo-3.1-fast-generate-preview',
      prompt: prompt || "Cinematic movement",
      image: { imageBytes: cleanBase64, mimeType: 'image/png' },
      config: { numberOfVideos: 1, resolution: '720p', aspectRatio }
    });

    const maxRetries = 60; 
    let retries = 0;

    while (!operation.done && retries < maxRetries) {
      await wait(5000);
      operation = await ai.operations.getVideosOperation({ operation: operation });
      retries++;
    }

    if (!operation.done) throw new Error("Video generation timed out.");

    const videoUri = operation.response?.generatedVideos?.[0]?.video?.uri;
    if (!videoUri) throw new Error("No video URI returned.");

    const separator = videoUri.includes('?') ? '&' : '?';
    const fileResponse = await fetch(`${videoUri}${separator}key=${apiKey}`);
    
    if (!fileResponse.ok) throw new Error("Failed to download video file.");
    
    const blob = await fileResponse.blob();
    const videoBase64 = await blobToBase64(blob);

    return {
      videoUrl: videoBase64,
      cost: COSTS.VIDEO_GENERATION
    };
  });
};

// --- LIVE CREATIVE SESSION ---

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
}, outputAudioContext: AudioContext) => { // Accept the shared audio context
    const ai = getAI();
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
                    // FIX: Use the passed-in audio context instead of creating a new one.
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
                if (stream) {
                    stream.getTracks().forEach(track => track.stop());
                }
                if (scriptProcessor) {
                    scriptProcessor.disconnect();
                }
                if (inputAudioContext) {
                    inputAudioContext.close();
                }
                callbacks.onClose(e);
            },
        },
        config: {
            responseModalities: [Modality.AUDIO],
            speechConfig: {
                voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } },
            },
            systemInstruction: 'You are a creative partner for a film director. Help them brainstorm ideas for characters, plots, and scenes. Be encouraging, concise, and imaginative.',
            outputAudioTranscription: {},
            inputAudioTranscription: {},
        },
    });

    return sessionPromise;
};
