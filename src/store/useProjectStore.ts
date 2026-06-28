import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import uuid from 'react-native-uuid';
import * as FileSystem from 'expo-file-system/legacy';
import { ERDGESCHOSS_MUSTER_BASE64, OBERGESCHOSS_MUSTER_BASE64 } from '../constants/samplePdfs';
import { db, storage } from '../config/firebase';
import { doc, setDoc, deleteDoc, writeBatch, getDocs, collection, query, where } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject, listAll } from 'firebase/storage';
import { Platform, Alert } from 'react-native';

export const STORAGE_LIMIT_FREE = 50 * 1024 * 1024; // 50 MB
export const STORAGE_LIMIT_PREMIUM = 1000 * 1024 * 1024; // 1 GB

export type MediaItem = {
  id: string;
  type: 'photo' | 'photo360' | 'note';
  uri?: string;
  localUri?: string;
  text?: string;
  fileSize?: number;
  createdAt: string;
};

export type Marker = {
  id: string;
  projectId: string;
  floorPlanId: string;
  label: string;
  x: number;
  y: number;
  createdAt: string;
  media: MediaItem[];
  cropBase64?: string;
};

export type FloorPlan = {
  id: string;
  name: string;
  pdfUrl: string;
  localPdfUrl?: string;
  pdfSize?: number;
};

export type Settings = {
  companyName: string;
  companyAddress: string;
  companyLogoUri?: string;
  companyLogoSize?: number;
  hapticsEnabled: boolean;
  exportQuality: 'high' | 'medium' | 'low';
  syncMode: 'auto' | 'manual';
};

export type Project = {
  id: string;
  name: string;
  date: string;
  isFavorite?: boolean;
  floorPlans: FloorPlan[];
};

type ProjectState = {
  projects: Project[];
  markers: Marker[];
  settings: Settings;
  user: { uid: string; email: string | null } | null;
  isPremiumUser: boolean;
  deletedProjectIds: string[];
  deletedMarkerIds: string[];
  setUser: (user: { uid: string; email: string | null } | null) => void;
  setPremiumUser: (isPremium: boolean) => void;
  triggerAutoSync: () => void;
  syncData: () => Promise<void>;
  getStorageUsageBytes: () => number;
  addProject: (name: string) => void;
  deleteProject: (id: string) => void;
  renameProject: (id: string, name: string) => void;
  toggleFavoriteProject: (id: string) => void;
  addFloorPlan: (projectId: string, name: string, pdfUrl: string) => Promise<void>;
  updateFloorPlanPdf: (projectId: string, floorPlanId: string, pdfUrl: string) => Promise<void>;
  renameFloorPlan: (projectId: string, floorPlanId: string, name: string) => void;
  deleteFloorPlan: (projectId: string, floorPlanId: string) => void;
  addMarker: (projectId: string, floorPlanId: string, x: number, y: number) => string;
  deleteMarker: (markerId: string) => void;
  renameMarker: (markerId: string, label: string) => void;
  addMediaToMarker: (markerId: string, type: 'photo' | 'photo360' | 'note', value: string) => Promise<void>;
  deleteMediaFromMarker: (markerId: string, mediaId: string) => void;
  updateMarkerCrop: (markerId: string, cropBase64: string) => void;
  updateMarkerPosition: (markerId: string, x: number, y: number) => void;
  updateSettings: (settings: Partial<Settings>) => Promise<void>;
};

const DUMMY_PROJECTS: Project[] = [
  {
    id: '1',
    name: 'Musterprojekt: Bauvorhaben München',
    date: new Date(Date.now() - 3600000 * 24 * 5).toISOString(),
    floorPlans: [
      { id: 'fp1', name: 'Erdgeschoss (Muster)', pdfUrl: ERDGESCHOSS_MUSTER_BASE64, pdfSize: 0 },
      { id: 'fp2', name: '1. Obergeschoss (Muster)', pdfUrl: OBERGESCHOSS_MUSTER_BASE64, pdfSize: 0 }
    ]
  }
];

export const DUMMY_MARKERS: Marker[] = [
  {
    id: 'dm1',
    projectId: '1',
    floorPlanId: 'fp1',
    label: 'Test Foto',
    x: 0.2,
    y: 0.2,
    createdAt: new Date().toISOString(),
    media: [
      {
        id: 'dm1_m1',
        uri: 'https://picsum.photos/id/20/800/600.jpg',
        type: 'photo',
        createdAt: new Date().toISOString()
      }
    ]
  },
  {
    id: 'dm2',
    projectId: '1',
    floorPlanId: 'fp1',
    label: 'Test 360',
    x: 0.8,
    y: 0.2,
    createdAt: new Date().toISOString(),
    media: [
      {
        id: 'dm2_m1',
        uri: 'https://pannellum.org/images/alma.jpg',
        type: 'photo360',
        createdAt: new Date().toISOString()
      }
    ]
  }
];

async function getLocalFileSize(uri: string): Promise<number> {
  if (!uri) return 0;
  if (uri.startsWith('data:')) {
    return Math.round((uri.length * 3) / 4);
  }
  if (Platform.OS === 'web') {
    try {
      const response = await fetch(uri);
      const blob = await response.blob();
      return blob.size;
    } catch {
      return 0;
    }
  } else {
    try {
      const fileInfo = await FileSystem.getInfoAsync(uri);
      if (fileInfo.exists) {
        return fileInfo.size || 0;
      }
    } catch (err) {
      console.error('Failed to get local file size:', err);
    }
    return 0;
  }
}

async function uploadFileToStorage(uri: string, path: string): Promise<string> {
  try {
    if (!uri) return '';
    if (uri.startsWith('http://') || uri.startsWith('https://')) {
      if (uri.includes('firebasestorage.googleapis.com')) return uri;
    }
    
    let blob: Blob;
    if (Platform.OS === 'web') {
      const response = await fetch(uri);
      blob = await response.blob();
    } else {
      blob = await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.onload = function () { resolve(xhr.response); };
        xhr.onerror = function (e) { reject(new TypeError("Network request failed")); };
        xhr.responseType = "blob";
        xhr.open("GET", uri, true);
        xhr.send(null);
      });
    }

    const fileRef = ref(storage, path);
    await uploadBytes(fileRef, blob);
    
    if (Platform.OS !== 'web' && typeof (blob as any).close === 'function') {
      (blob as any).close();
    }
    
    return await getDownloadURL(fileRef);
  } catch (err) {
    console.error('File upload to Storage failed:', err);
    throw err;
  }
}

async function deleteFolderContents(folderPath: string) {
  try {
    const folderRef = ref(storage, folderPath);
    const res = await listAll(folderRef);
    for (const item of res.items) {
      await deleteObject(item).catch(() => {});
    }
    for (const prefix of res.prefixes) {
      await deleteFolderContents(prefix.fullPath);
    }
  } catch (err) {
    console.error(`Failed to delete folder contents for ${folderPath}:`, err);
  }
}

export const useProjectStore = create<ProjectState>()(
  persist(
    (set, get) => ({
      projects: DUMMY_PROJECTS,
      markers: DUMMY_MARKERS,
      user: null,
      isPremiumUser: false,
      deletedProjectIds: [],
      deletedMarkerIds: [],
      settings: {
        companyName: '',
        companyAddress: '',
        companyLogoUri: undefined,
        companyLogoSize: 0,
        hapticsEnabled: true,
        exportQuality: 'medium',
        syncMode: 'auto',
      },
      setUser: (user) => set({ user }),
      setPremiumUser: (isPremiumUser) => set({ isPremiumUser }),
      
      getStorageUsageBytes: () => {
        const { settings, projects, markers } = get();
        let total = 0;
        if (settings.companyLogoSize) total += settings.companyLogoSize;
        projects.forEach(p => {
          p.floorPlans.forEach(fp => total += (fp.pdfSize || 0));
        });
        markers.forEach(m => {
          m.media.forEach(med => total += (med.fileSize || 0));
        });
        return total;
      },

      checkStorageLimit: (additionalBytes: number) => {
        const { isPremiumUser, getStorageUsageBytes } = get();
        const limit = isPremiumUser ? STORAGE_LIMIT_PREMIUM : STORAGE_LIMIT_FREE;
        if (getStorageUsageBytes() + additionalBytes > limit) {
          throw new Error('LIMIT_EXCEEDED');
        }
      },

      triggerAutoSync: () => {
        const { user, settings } = get();
        if (user && settings.syncMode === 'auto') {
          get().syncData().catch(err => console.log('Auto-Sync im Hintergrund fehlgeschlagen (evtl. offline):', err));
        }
      },

      syncData: async () => {
        const { projects, markers, deletedProjectIds, deletedMarkerIds, user, settings } = get();
        if (!user) return;

        try {
          // 1. Process deletions
          for (const id of deletedProjectIds) {
            await deleteDoc(doc(db, 'projects', id)).catch(() => {});
            await deleteFolderContents(`projects/${id}`).catch(() => {});
          }
          for (const id of deletedMarkerIds) {
            await deleteDoc(doc(db, 'markers', id)).catch(() => {});
          }
          set({ deletedProjectIds: [], deletedMarkerIds: [] });

          // 2. Upload pending local files
          const updatedProjects = [...projects];
          let projectsChanged = false;
          
          for (let pIdx = 0; pIdx < updatedProjects.length; pIdx++) {
            const proj = updatedProjects[pIdx];
            let projChanged = false;
            const updatedFloorPlans = [...proj.floorPlans];
            
            for (let fpIdx = 0; fpIdx < updatedFloorPlans.length; fpIdx++) {
              const fp = updatedFloorPlans[fpIdx];
              if (fp.pdfUrl && !fp.pdfUrl.startsWith('http') && !fp.pdfUrl.startsWith('data:')) {
                try {
                  const newUrl = await uploadFileToStorage(fp.pdfUrl, `projects/${proj.id}/floorplans/${fp.id}.pdf`);
                  updatedFloorPlans[fpIdx] = { ...fp, pdfUrl: newUrl, localPdfUrl: fp.localPdfUrl || fp.pdfUrl };
                  projChanged = true;
                } catch (e) { console.error('Failed to upload PDF', e); throw e; }
              }
            }
            if (projChanged) {
              updatedProjects[pIdx] = { ...proj, floorPlans: updatedFloorPlans };
              projectsChanged = true;
            }
          }

          const updatedMarkers = [...markers];
          let markersChanged = false;

          for (let mIdx = 0; mIdx < updatedMarkers.length; mIdx++) {
            const marker = updatedMarkers[mIdx];
            let markerChanged = false;
            const updatedMedia = [...marker.media];

            for (let mdIdx = 0; mdIdx < updatedMedia.length; mdIdx++) {
              const md = updatedMedia[mdIdx];
              if (md.uri && !md.uri.startsWith('http') && !md.uri.startsWith('data:')) {
                try {
                  const newUrl = await uploadFileToStorage(md.uri, `projects/${marker.projectId}/media/${md.id}.jpg`);
                  updatedMedia[mdIdx] = { ...md, uri: newUrl, localUri: md.localUri || md.uri };
                  markerChanged = true;
                } catch (e) { console.error('Failed to upload media', e); throw e; }
              }
            }
            if (markerChanged) {
              updatedMarkers[mIdx] = { ...marker, media: updatedMedia };
              markersChanged = true;
            }
          }

          if (projectsChanged || markersChanged) {
            set({ projects: updatedProjects, markers: updatedMarkers });
          }

          const finalProjects = get().projects;
          const finalMarkers = get().markers;

          // 3. Batch write to Firestore
          const batch = writeBatch(db);
          for (const project of finalProjects) {
            const cleanProject = JSON.parse(JSON.stringify(project));
            const docRef = doc(db, 'projects', project.id);
            batch.set(docRef, { ...cleanProject, ownerId: user.uid }, { merge: true });
          }
          for (const marker of finalMarkers) {
            const cleanMarker = JSON.parse(JSON.stringify(marker));
            const docRef = doc(db, 'markers', marker.id);
            batch.set(docRef, { ...cleanMarker, ownerId: user.uid }, { merge: true });
          }
          
          let logoUrl = settings.companyLogoUri;
          if (logoUrl && !logoUrl.startsWith('http://') && !logoUrl.startsWith('https://') && !logoUrl.startsWith('data:')) {
            try {
              logoUrl = await uploadFileToStorage(logoUrl, `users/${user.uid}/branding/logo.jpg`);
              set({ settings: { ...settings, companyLogoUri: logoUrl } });
            } catch (e) { console.error('Failed to upload logo', e); throw e; }
          }
          const cleanSettings = JSON.parse(JSON.stringify(get().settings));
          batch.set(doc(db, 'users', user.uid), { settings: cleanSettings }, { merge: true });

          await batch.commit();

          // 4. Fetch updates from Cloud
          const projectsSnap = await getDocs(query(collection(db, 'projects'), where('ownerId', '==', user.uid)));
          const serverProjects: Project[] = [];
          projectsSnap.forEach(d => serverProjects.push(d.data() as Project));

          const markersSnap = await getDocs(query(collection(db, 'markers'), where('ownerId', '==', user.uid)));
          const serverMarkers: Marker[] = [];
          markersSnap.forEach(d => serverMarkers.push(d.data() as Marker));

          const localProjectsMap = new Map(get().projects.map(p => [p.id, p]));
          serverProjects.forEach(sp => {
            if (!localProjectsMap.has(sp.id)) {
              localProjectsMap.set(sp.id, sp);
            } else {
              const lp = localProjectsMap.get(sp.id)!;
              const fpMap = new Map(lp.floorPlans.map(f => [f.id, f]));
              sp.floorPlans?.forEach(sfp => {
                const localFp = fpMap.get(sfp.id);
                fpMap.set(sfp.id, { ...localFp, ...sfp });
              });
              localProjectsMap.set(sp.id, { ...lp, ...sp, floorPlans: Array.from(fpMap.values()) });
            }
          });

          const localMarkersMap = new Map(get().markers.map(m => [m.id, m]));
          serverMarkers.forEach(sm => {
            if (!localMarkersMap.has(sm.id)) {
              localMarkersMap.set(sm.id, sm);
            } else {
              const lm = localMarkersMap.get(sm.id)!;
              const mediaMap = new Map(lm.media.map(med => [med.id, med]));
              sm.media?.forEach(smed => {
                const localMed = mediaMap.get(smed.id);
                mediaMap.set(smed.id, { ...localMed, ...smed });
              });
              localMarkersMap.set(sm.id, { ...lm, ...sm, media: Array.from(mediaMap.values()) });
            }
          });

          set({
            projects: Array.from(localProjectsMap.values()),
            markers: Array.from(localMarkersMap.values())
          });
          
        } catch (err) {
          console.error('Sync failed:', err);
          throw err;
        }
      },

      updateSettings: async (newSettings) => {
        const { settings } = get();
        const updatedSettings = { ...settings, ...newSettings };
        
        if (newSettings.companyLogoUri && newSettings.companyLogoUri !== settings.companyLogoUri) {
          const size = await getLocalFileSize(newSettings.companyLogoUri);
          (get() as any).checkStorageLimit(size);
          updatedSettings.companyLogoSize = size;
        }

        set({ settings: updatedSettings });
        get().triggerAutoSync();
      },

      addProject: async (name) => {
        const newId = uuid.v4() as string;
        const project: Project = { id: newId, name, date: new Date().toISOString(), floorPlans: [] };
        set((state) => ({ projects: [...state.projects, project] }));
        get().triggerAutoSync();
      },

      deleteProject: async (id) => {
        set((state) => ({
          projects: state.projects.filter(p => p.id !== id),
          markers: state.markers.filter(m => m.projectId !== id),
          deletedProjectIds: [...state.deletedProjectIds, id]
        }));
        get().triggerAutoSync();
      },

      renameProject: async (id, name) => {
        set((state) => ({ projects: state.projects.map(p => p.id === id ? { ...p, name } : p) }));
        get().triggerAutoSync();
      },

      toggleFavoriteProject: async (id) => {
        set((state) => ({ projects: state.projects.map(p => p.id === id ? { ...p, isFavorite: !p.isFavorite } : p) }));
        get().triggerAutoSync();
      },

      addFloorPlan: async (projectId, name, pdfUrl) => {
        const size = await getLocalFileSize(pdfUrl);
        (get() as any).checkStorageLimit(size);

        const newFpId = uuid.v4() as string;
        const newFp: FloorPlan = { id: newFpId, name, pdfUrl, localPdfUrl: pdfUrl, pdfSize: size };
        
        set((state) => ({
          projects: state.projects.map(p => p.id === projectId ? { ...p, floorPlans: [...(p.floorPlans || []), newFp] } : p)
        }));
        get().triggerAutoSync();
      },

      updateFloorPlanPdf: async (projectId, floorPlanId, pdfUrl) => {
        const size = await getLocalFileSize(pdfUrl);
        (get() as any).checkStorageLimit(size);

        set((state) => ({
          projects: state.projects.map(p => p.id === projectId ? {
            ...p,
            floorPlans: p.floorPlans.map(fp => fp.id === floorPlanId ? { ...fp, pdfUrl, localPdfUrl: pdfUrl, pdfSize: size } : fp)
          } : p)
        }));
        get().triggerAutoSync();
      },

      renameFloorPlan: async (projectId, floorPlanId, name) => {
        set((state) => ({
          projects: state.projects.map(p => p.id === projectId ? {
            ...p,
            floorPlans: p.floorPlans.map(fp => fp.id === floorPlanId ? { ...fp, name } : fp)
          } : p)
        }));
        get().triggerAutoSync();
      },

      deleteFloorPlan: async (projectId, floorPlanId) => {
        set((state) => ({
          projects: state.projects.map(p => p.id === projectId ? {
            ...p,
            floorPlans: p.floorPlans.filter(fp => fp.id !== floorPlanId)
          } : p),
          markers: state.markers.filter(m => m.floorPlanId !== floorPlanId)
        }));
        // We do not eagerly delete files from storage locally, since syncData doesn't track deleted floorPlanIds
        // A fully robust sync would track deleted file URLs too, but for now ignoring orphan files.
        get().triggerAutoSync();
      },

      addMarker: (projectId, floorPlanId, x, y) => {
        const newId = uuid.v4() as string;
        const marker: Marker = {
          id: newId, projectId, floorPlanId, label: 'Neuer Marker', x, y, createdAt: new Date().toISOString(), media: []
        };
        set((state) => ({ markers: [...state.markers, marker] }));
        get().triggerAutoSync();
        return newId;
      },

      renameMarker: async (markerId, label) => {
        set((state) => ({ markers: state.markers.map(m => m.id === markerId ? { ...m, label } : m) }));
        get().triggerAutoSync();
      },

      deleteMarker: async (markerId) => {
        set((state) => ({
          markers: state.markers.filter(m => m.id !== markerId),
          deletedMarkerIds: [...state.deletedMarkerIds, markerId]
        }));
        get().triggerAutoSync();
      },

      addMediaToMarker: async (markerId, type, value) => {
        let size = 0;
        if (type === 'photo' || type === 'photo360') {
          size = await getLocalFileSize(value);
          (get() as any).checkStorageLimit(size);
        }

        const newMedia: MediaItem = {
          id: uuid.v4() as string,
          type,
          createdAt: new Date().toISOString(),
          fileSize: size
        };

        if (type === 'photo' || type === 'photo360') {
          newMedia.uri = value;
          newMedia.localUri = value;
        } else {
          newMedia.text = value;
        }

        set((state) => ({
          markers: state.markers.map(m => m.id === markerId ? { ...m, media: [...(m.media || []), newMedia] } : m)
        }));
        get().triggerAutoSync();
      },

      deleteMediaFromMarker: async (markerId, mediaId) => {
        set((state) => ({
          markers: state.markers.map(m => m.id === markerId ? { ...m, media: (m.media || []).filter(item => item.id !== mediaId) } : m)
        }));
        get().triggerAutoSync();
      },

      updateMarkerCrop: async (markerId, cropBase64) => {
        set((state) => ({ markers: state.markers.map(m => m.id === markerId ? { ...m, cropBase64 } : m) }));
        get().triggerAutoSync();
      },

      updateMarkerPosition: async (markerId, x, y) => {
        set((state) => ({ markers: state.markers.map(m => m.id === markerId ? { ...m, x, y, cropBase64: undefined } : m) }));
        get().triggerAutoSync();
      }
    }),
    {
      name: 'project-store',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
