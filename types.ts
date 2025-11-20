

export interface CastMember {
  id: string;
  label: string; // e.g., "Char1", "Neo"
  role: string; // e.g., "Hero", "The One"
  image: string | null; // Base64 string
  mimeType: string;
}

export type AspectRatio = '16:9' | '1:1' | '9:16' | '21:9' | '4:3';

export interface GeneratedScene {
  id: string;
  prompt: string;
  imageUrl: string | null;
  loading: boolean;
  error: string | null;
  timestamp: number;
  charactersIncluded: string[]; // Metadata for the scene map
  aspectRatio: AspectRatio;
  cost?: number; // Estimated cost in USD
  tags: string[]; // User-defined tags
  
  // Editing & History
  history: string[]; // Stack of previous image URLs (Base64)
  redoStack: string[]; // Stack of undone image URLs
  suggestions: string[]; // Smart suggestions for modifications
  isEditing?: boolean; // UI state
  isSuggesting?: boolean; // UI state for loading suggestions
  
  // QA & Workflow (Pain Point 2 & 6)
  approvalStatus: 'draft' | 'approved' | 'rejected'; 
  consistencyScore?: number; // 0-100 score from Agentic Check
  consistencyFeedback?: string; // "Hair color mismatch"
  isVerifying?: boolean;
}

export interface SceneMap {
  [filename: string]: {
    characters: string[];
    attribution: string;
    license: string;
    generator: string;
  };
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
  type: 'success' | 'error' | 'info' | 'warning';
  cost?: number;
}

export interface User {
  id: string;
  email: string;
  role: 'user' | 'admin';
}

// --- Onboarding / Manifest ---
export interface ProjectManifest {
  projectTitle: string;
  cast: { name: string; role: string }[];
  scenes: string[]; // The initial list of scene prompts
  suggestedRatio: AspectRatio;
}

export interface ProjectMetadata {
  id: string;
  title: string;
  lastModified: number;
  previewImage?: string | null; // Small thumbnail
  sceneCount: number;
  ownerEmail?: string; // For admin view
  ownerId?: string; // For admin actions
}

export interface FullProjectExport {
  version: string;
  metadata: ProjectMetadata;
  cast: CastMember[];
  scenes: GeneratedScene[];
  voice: {
    scriptText: string;
    voiceMap: VoiceMap;
    lines: ScriptLine[];
  };
  motion: VideoJob[];
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