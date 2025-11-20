import { ProjectMetadata, ProjectManifest, CastMember, GeneratedScene, FullProjectExport, User } from "../types";
import * as AssetStore from "./assetStore";

const getProjectIndexKey = (userId: string) => `cosmo_project_index_${userId}`;
const ALL_USERS_KEY = "cosmo_all_users";

export const getAllProjects = (user: User, adminFetchAll: boolean = false): ProjectMetadata[] => {
  if (!user) return [];

  const getProjectsForSingleUser = (userId: string): ProjectMetadata[] => {
      try {
          const key = getProjectIndexKey(userId);
          const raw = localStorage.getItem(key);
          return raw ? JSON.parse(raw) : [];
      } catch (e) {
          return [];
      }
  };

  if (user.role === 'admin' && adminFetchAll) {
      const allProjects: ProjectMetadata[] = [];
      let allUsers: User[] = [];
      try {
        const rawUsers = localStorage.getItem(ALL_USERS_KEY);
        allUsers = rawUsers ? JSON.parse(rawUsers) : [];
      } catch (e) { /* ignore */ }

      for (const u of allUsers) {
          const userProjects = getProjectsForSingleUser(u.id);
          // Add owner info for the admin panel
          allProjects.push(...userProjects.map(p => ({ ...p, ownerEmail: u.email, ownerId: u.id })));
      }
      // Sort by most recently modified
      return allProjects.sort((a, b) => b.lastModified - a.lastModified);
  } else {
      return getProjectsForSingleUser(user.id);
  }
};

export const createProject = (userId: string, manifest?: ProjectManifest): ProjectMetadata => {
  const user = { id: userId, role: 'user' } as User; // Dummy user object for compatibility
  const projects = getAllProjects(user);
  const newProject: ProjectMetadata = {
    id: crypto.randomUUID(),
    title: manifest?.projectTitle || "Untitled Project",
    lastModified: Date.now(),
    sceneCount: 0,
    previewImage: null
  };

  projects.unshift(newProject); 
  localStorage.setItem(getProjectIndexKey(userId), JSON.stringify(projects));
  return newProject;
};

export const updateProjectMeta = (userId: string, id: string, updates: Partial<ProjectMetadata>) => {
  const user = { id: userId, role: 'user' } as User;
  const projects = getAllProjects(user);
  const index = projects.findIndex(p => p.id === id);
  if (index !== -1) {
    projects[index] = { ...projects[index], ...updates, lastModified: Date.now() };
    localStorage.setItem(getProjectIndexKey(userId), JSON.stringify(projects));
  }
};

export const deleteProject = async (userId: string, id: string) => {
  const castData = loadProjectData<any[]>(userId, id, "cast", []);
  const sceneData = loadProjectData<any[]>(userId, id, "scenes", []);
  const voiceData = loadProjectData<any>(userId, id, "voice", {});
  const motionData = loadProjectData<any[]>(userId, id, "motion", []);

  const deletionPromises: Promise<void>[] = [];

  castData.forEach(c => deletionPromises.push(AssetStore.deleteAsset(`cast_${c.id}`)));
  sceneData.forEach(s => deletionPromises.push(AssetStore.deleteAsset(`scene_${s.id}`)));

  if (voiceData.lines) {
      voiceData.lines.forEach((l: any) => {
          if (l.id) deletionPromises.push(AssetStore.deleteAsset(`voice_${l.id}`));
      });
  }

  motionData.forEach(j => deletionPromises.push(AssetStore.deleteAsset(`video_${j.id}`)));

  await Promise.all(deletionPromises);

  localStorage.removeItem(`cosmo_project_${id}_cast`);
  localStorage.removeItem(`cosmo_project_${id}_scenes`);
  localStorage.removeItem(`cosmo_project_${id}_voice`);
  localStorage.removeItem(`cosmo_project_${id}_motion`);
  localStorage.removeItem(`cosmo_project_${id}_prompt_draft`);
  
  const user = { id: userId, role: 'user' } as User;
  const projects = getAllProjects(user).filter(p => p.id !== id);
  localStorage.setItem(getProjectIndexKey(userId), JSON.stringify(projects));
};

export const deleteAllProjectsForUser = async (userId: string) => {
    const user = { id: userId, role: 'user' } as User;
    const projects = getAllProjects(user);
    
    const deletionPromises = projects.map(p => deleteProject(userId, p.id));
    await Promise.all(deletionPromises);
    
    localStorage.removeItem(getProjectIndexKey(userId));
};


export const loadProjectData = <T>(userId: string, projectId: string, keySuffix: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(`cosmo_project_${projectId}_${keySuffix}`);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) {
    return fallback;
  }
};

export const saveProjectData = (userId: string, projectId: string, keySuffix: string, data: any) => {
  localStorage.setItem(`cosmo_project_${projectId}_${keySuffix}`, JSON.stringify(data));
  updateProjectMeta(userId, projectId, { lastModified: Date.now() });
};

// --- PAIN POINT 3 & RISK REPORT: ROBUST EXPORT ---

export const exportProject = async (userId: string, projectId: string): Promise<Blob> => {
    // 1. Gather Metadata
    const user = { id: userId, role: 'user' } as User;
    const metadata = getAllProjects(user).find(p => p.id === projectId);
    if (!metadata) throw new Error("Project not found");

    const castMeta = loadProjectData<CastMember[]>(userId, projectId, "cast", []);
    const scenesMeta = loadProjectData<GeneratedScene[]>(userId, projectId, "scenes", []);
    const voiceMeta = loadProjectData<any>(userId, projectId, "voice", { scriptText: "", voiceMap: {}, lines: [] });
    const motionMeta = loadProjectData<any[]>(userId, projectId, "motion", []);

    // 2. Re-attach Heavy Assets from IDB
    const fullCast = await Promise.all(castMeta.map(async c => {
        const img = await AssetStore.getAsset(`cast_${c.id}`);
        return { ...c, image: img || c.image };
    }));

    const fullScenes = await Promise.all(scenesMeta.map(async s => {
        const img = await AssetStore.getAsset(`scene_${s.id}`);
        return { ...s, imageUrl: img || s.imageUrl };
    }));
    
    const fullVoiceLines = await Promise.all(voiceMeta.lines.map(async (l: any) => {
        if(l.audioUrl) return l;
        const audio = await AssetStore.getAsset(`voice_${l.id}`);
        return { ...l, audioUrl: audio };
    }));

    const fullMotion = await Promise.all(motionMeta.map(async m => {
        if(m.videoUrl) return m;
        const vid = await AssetStore.getAsset(`video_${m.id}`);
        return { ...m, videoUrl: vid };
    }));

    // 3. MEMORY-SAFE CONSTRUCTION (Risk Report Fix)
    const chunks: BlobPart[] = [];
    
    chunks.push(`{ "version": "2.3", "metadata": ${JSON.stringify(metadata)}, `);
    
    chunks.push(`"cast": ${JSON.stringify(fullCast)}, `);
    chunks.push(`"scenes": ${JSON.stringify(fullScenes)}, `);
    
    const voiceExport = { ...voiceMeta, lines: fullVoiceLines };
    chunks.push(`"voice": ${JSON.stringify(voiceExport)}, `);
    
    chunks.push(`"motion": ${JSON.stringify(fullMotion)} }`);

    return new Blob(chunks, { type: "application/json" });
};

export const importProject = async (userId: string, jsonString: string): Promise<ProjectMetadata> => {
    try {
        const data: FullProjectExport = JSON.parse(jsonString);
        
        if (!data.metadata || !data.cast || !data.scenes) throw new Error("Invalid Cosmo Project File");

        const newId = crypto.randomUUID();
        const newMeta: ProjectMetadata = {
            ...data.metadata,
            id: newId,
            title: `${data.metadata.title} (Imported)`,
            lastModified: Date.now()
        };
        
        const user = { id: userId, role: 'user' } as User;
        const projects = getAllProjects(user);
        projects.unshift(newMeta);
        localStorage.setItem(getProjectIndexKey(userId), JSON.stringify(projects));
        
        const castMeta = data.cast.map(c => ({ ...c, image: null }));
        saveProjectData(userId, newId, "cast", castMeta);
        await Promise.all(data.cast.map(c => c.image ? AssetStore.saveAsset(`cast_${c.id}`, c.image) : Promise.resolve()));

        const scenesMeta = data.scenes.map(s => ({ ...s, imageUrl: null }));
        saveProjectData(userId, newId, "scenes", scenesMeta);
        await Promise.all(data.scenes.map(s => s.imageUrl ? AssetStore.saveAsset(`scene_${s.id}`, s.imageUrl) : Promise.resolve()));

        const voiceMeta = { 
            ...data.voice, 
            lines: data.voice.lines.map(l => ({ ...l, audioUrl: null }))
        };
        saveProjectData(userId, newId, "voice", voiceMeta);
        await Promise.all(data.voice.lines.map(l => l.audioUrl ? AssetStore.saveAsset(`voice_${l.id}`, l.audioUrl) : Promise.resolve()));

        const motionMeta = data.motion.map(m => ({ ...m, videoUrl: null }));
        saveProjectData(userId, newId, "motion", motionMeta);
        await Promise.all(data.motion.map(m => m.videoUrl ? AssetStore.saveAsset(`video_${m.id}`, m.videoUrl) : Promise.resolve()));

        return newMeta;

    } catch (e) {
        console.error("Import failed", e);
        throw new Error("Failed to import project file.");
    }
};