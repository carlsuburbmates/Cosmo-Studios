import { GoogleGenAI, Modality, Type, Schema } from "@google/genai";
import { CastMember } from "../types";

// Helper to init AI
// CRITICAL: We look for the key in 3 places:
// 1. process.env (Build time / Dev env)
// 2. sessionStorage (Manual User Entry for Web App)
// 3. window.aistudio (Project IDX Helper)
const getApiKey = (): string => {
  // 1. Check Build/Env
  if (process.env.API_KEY) return process.env.API_KEY;
  
  // 2. Check Session Storage (For deployed web apps)
  const sessionKey = sessionStorage.getItem("cosmo_api_key");
  if (sessionKey) return sessionKey;

  throw new Error("API Key not found. Please enter your key on the login screen.");
};

const getAI = () => {
  const apiKey = getApiKey();
  return new GoogleGenAI({ apiKey });
};

// --- COST ESTIMATION UTILITIES ---
const COSTS = {
  IMAGE_GENERATION: 0.004,
  VIDEO_GENERATION: 0.08,
  TTS_PER_CHAR: 0.000015,
  TEXT_GENERATION: 0.0005,
};

// --- RESILIENCE UTILITIES ---

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function executeWithRetry<T>(
  operation: () => Promise<T>, 
  retries = 3, 
  delay = 1000
): Promise<T> {
  try {
    return await operation();
  } catch (error: any) {
    const isRetryable = 
      error.message?.includes("429") || // Rate limit
      error.message?.includes("503") || // Service Unavailable
      error.message?.includes("overloaded");

    if (retries > 0 && isRetryable) {
      console.warn(`Operation failed, retrying in ${delay}ms...`, error.message);
      await wait(delay);
      return executeWithRetry(operation, retries - 1, delay * 2);
    }
    throw error;
  }
}

// --- MODULE 0: BRAINSTORMING ---

export const generateCreativePrompts = async (
  cast: CastMember[]
): Promise<{ prompts: string[]; cost: number }> => {
  const ai = getAI();
  
  // Describe the cast for the model
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
    try {
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

      const jsonText = response.text;
      if (!jsonText) throw new Error("No ideas generated");

      const prompts = JSON.parse(jsonText) as string[];
      return { 
        prompts,
        cost: COSTS.TEXT_GENERATION
      };
    } catch (error: any) {
      console.error("Brainstorm Error:", error);
      throw new Error("Failed to brainstorm ideas.");
    }
  });
};

// --- MODULE 1: IMAGES ---

export const generateSceneImage = async (
  prompt: string,
  castMembers: CastMember[]
): Promise<{ imageUrl: string; charactersIncluded: string[]; cost: number }> => {
  const ai = getAI();

  // 1. Identify which cast members are actually in the prompt
  // We prefer longer labels/roles first to avoid partial matching issues (e.g. matching "Hero" inside "Superhero")
  const sortedCast = [...castMembers].sort((a, b) => {
     const lenA = Math.max(a.label.length, a.role.length);
     const lenB = Math.max(b.label.length, b.role.length);
     return lenB - lenA;
  });

  const matchedMembers = new Set<CastMember>();
  let cleanedPrompt = prompt;

  // 2. First pass: Find matches and replace with temporary placeholders to avoid double-replacement
  // We use a Map to store the replacement logic: { "The Hero": "##REF_0##" }
  const replacementMap = new Map<string, CastMember>();
  const fragments: { start: number; end: number; replacement: string }[] = [];

  sortedCast.forEach((member) => {
    if (!member.image) return; // Skip members without images

    // Create a safe regex for Label and Role
    const keys = [member.label];
    if (member.role && member.role.trim().length > 1) {
        keys.push(member.role);
    }

    const pattern = keys
        .map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) // Escape special chars
        .join('|');
    
    const regex = new RegExp(`\\b(${pattern})\\b`, 'gi');
    
    // We don't replace yet, we just track that this member is needed
    if (regex.test(prompt)) {
        matchedMembers.add(member);
    }
  });

  // Convert Set to Array to establish a fixed index order (1, 2, 3...)
  const activeCastArray = Array.from(matchedMembers);
  const charactersIncluded = activeCastArray.map(c => c.label);

  // 3. Second pass: Perform the actual replacement in the prompt string based on the fixed array index
  activeCastArray.forEach((member, index) => {
     const keys = [member.label];
     if (member.role && member.role.trim().length > 1) keys.push(member.role);
     
     const pattern = keys.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
     const regex = new RegExp(`\\b(${pattern})\\b`, 'gi');

     // Gemini expects "the person in reference image 1", "the person in reference image 2", etc.
     // Indices are 1-based in the prompt text context usually, but the API maps parts sequentially.
     // We'll use explicit naming for clarity.
     cleanedPrompt = cleanedPrompt.replace(regex, `the person in reference image ${index + 1}`);
  });

  // 4. Construct the API Payload
  // Gemini Rule: Images must come BEFORE the text prompt in the 'parts' array
  const parts: any[] = [];

  // Push images in the EXACT order of activeCastArray
  activeCastArray.forEach((member) => {
      const base64Data = member.image!.split(",")[1] || member.image!;
      parts.push({
        inlineData: {
            data: base64Data,
            mimeType: member.mimeType
        }
      });
  });

  // Push the modified text prompt
  parts.push({ text: cleanedPrompt });

  return executeWithRetry(async () => {
    try {
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-image",
        contents: { parts: parts },
        config: { responseModalities: [Modality.IMAGE] },
      });

      const candidate = response.candidates?.[0];
      const imagePart = candidate?.content?.parts?.find((p) => p.inlineData);

      if (!imagePart || !imagePart.inlineData) {
        throw new Error("No image generated");
      }

      const generatedBase64 = imagePart.inlineData.data;
      return { 
        imageUrl: `data:image/png;base64,${generatedBase64}`, 
        charactersIncluded,
        cost: COSTS.IMAGE_GENERATION
      };
    } catch (error: any) {
      console.error("Gemini Image Error:", error);
      throw new Error(error.message || "Failed to generate scene");
    }
  });
};

// --- MODULE 2: AUDIO (TTS) ---

export const generateSpeech = async (
  text: string,
  voiceName: string
): Promise<{ audioUrl: string; cost: number }> => {
  const ai = getAI();

  return executeWithRetry(async () => {
    try {
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: {
          parts: [{ text: text }],
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

      const cost = text.length * COSTS.TTS_PER_CHAR;

      return { 
        audioUrl: `data:audio/mp3;base64,${audioPart.inlineData.data}`,
        cost 
      }; 
    } catch (error: any) {
      console.error("Gemini TTS Error:", error);
      throw new Error(error.message || "Failed to generate speech");
    }
  });
};

// --- MODULE 3: MOTION (VIDEO) ---

export const generateVideo = async (
  imageBase64: string,
  prompt: string
): Promise<{ videoUrl: string; cost: number }> => {
  const ai = getAI();
  const cleanBase64 = imageBase64.split(",")[1] || imageBase64;
  
  const apiKey = getApiKey(); // Uses our new universal helper

  return executeWithRetry(async () => {
    try {
      // 1. Initiate Operation
      let operation = await ai.models.generateVideos({
        model: 'veo-3.1-fast-generate-preview',
        prompt: prompt || "Cinematic movement",
        image: {
          imageBytes: cleanBase64,
          mimeType: 'image/png', 
        },
        config: {
          numberOfVideos: 1,
          resolution: '720p',
          aspectRatio: '16:9' 
        }
      });

      // 2. Polling Loop with Extended Timeout
      const maxRetries = 30; // 30 * 5s = 150 seconds max
      let retries = 0;

      while (!operation.done && retries < maxRetries) {
        await wait(5000);
        operation = await ai.operations.getVideosOperation({ operation: operation });
        retries++;
      }

      if (!operation.done) {
        throw new Error("Video generation timed out. The server is busy, please try again.");
      }

      // 3. Retrieve Result
      const videoUri = operation.response?.generatedVideos?.[0]?.video?.uri;
      if (!videoUri) {
        throw new Error("No video URI returned.");
      }

      // 4. Fetch actual bytes
      // IMPORTANT: We must append the API key manually for the download link.
      const separator = videoUri.includes('?') ? '&' : '?';
      const fileResponse = await fetch(`${videoUri}${separator}key=${apiKey}`);
      
      if (!fileResponse.ok) {
        throw new Error("Failed to download video file.");
      }
      
      const blob = await fileResponse.blob();
      return {
        videoUrl: URL.createObjectURL(blob),
        cost: COSTS.VIDEO_GENERATION
      };

    } catch (error: any) {
      console.error("Veo Video Error:", error);
      throw new Error(error.message || "Failed to generate video");
    }
  });
};