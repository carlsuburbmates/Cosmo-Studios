export interface CastMember {
  id: string;
  label: string; // e.g., "Char1", "Char2"
  role: string; // e.g., "Hero", "Villain"
  image: string | null; // Base64 string
  mimeType: string;
}

export interface GeneratedScene {
  id: string;
  prompt: string;
  imageUrl: string | null;
  loading: boolean;
  error: string | null;
  timestamp: number;
  charactersIncluded: string[]; // Metadata for the scene map
  cost?: number; // Estimated cost in USD
}

export interface SceneMap {
  [filename: string]: string[];
}

// --- Module 2: Audio ---
export interface ScriptLine {
  id: string;
  speaker: string;
  text: string;
  audioUrl: string | null;
  isLoading: boolean;
  voiceName: string;
  matchedCastId?: string; // Link to Module 1 cast member if name matches
  cost?: number;
}

export interface VoiceMap {
  [speaker: string]: string; // Maps "Hero" -> "Puck"
}

// --- Module 3: Motion ---
export interface VideoJob {
  id: string;
  sourceSceneId: string; // Links back to Module 1
  sourceImageUrl: string;
  prompt: string;
  videoUrl: string | null;
  status: 'idle' | 'generating' | 'completed' | 'failed';
  error: string | null;
  cost?: number;
}

// --- System ---
export interface Notification {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
  cost?: number;
}

// --- Environment / Window ---

declare global {
  interface AIStudio {
    hasSelectedApiKey: () => Promise<boolean>;
    openSelectKey: () => Promise<void>;
  }
  
  interface Window {
    aistudio?: AIStudio;
  }
}