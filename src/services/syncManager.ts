import { collection, query, where, onSnapshot, doc } from 'firebase/firestore';
import { db } from '../config/firebase';
import { useProjectStore, Project, Marker } from '../store/useProjectStore';


class SyncManagerClass {
  private unsubscribes: (() => void)[] = [];
  private isSyncing = false;

  public startSync(userId: string) {
    if (this.isSyncing) return;
    this.isSyncing = true;
    console.log('[SyncManager] Starting real-time sync for user:', userId);

    // 1. Sync Projects
    const projectsQuery = query(
      collection(db, 'projects'),
      where('ownerId', '==', userId)
    );
    const unsubProjects = onSnapshot(projectsQuery, (snapshot) => {
      const projectsList: Project[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        if (data.id === '1') return; // Completely ignore Cloud Musterprojekt
        
        projectsList.push({
          id: data.id,
          name: data.name,
          date: data.date,
          isFavorite: data.isFavorite,
          floorPlans: data.floorPlans || [],
          // We can also attach shared properties
          isShared: data.isShared,
          shareToken: data.shareToken
        } as any);
      });
      console.log('[SyncManager] Projects snapshot received. Count:', projectsList.length);
      
      import('../store/useProjectStore').then(({ DUMMY_PROJECTS }) => {
        if (DUMMY_PROJECTS) projectsList.unshift(...DUMMY_PROJECTS);
        useProjectStore.setState({ projects: projectsList });
      }).catch(() => {
        useProjectStore.setState({ projects: projectsList });
      });
    }, (error) => {
      console.error('[SyncManager] Projects sync failed:', error);
    });

    // 2. Sync Markers
    const markersQuery = query(
      collection(db, 'markers'),
      where('ownerId', '==', userId)
    );
    const unsubMarkers = onSnapshot(markersQuery, (snapshot) => {
      const markersList: Marker[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        if (data.projectId === '1') return; // Completely ignore Cloud Musterprojekt markers
        
        markersList.push({
          id: data.id,
          projectId: data.projectId,
          floorPlanId: data.floorPlanId,
          label: data.label,
          x: data.x,
          y: data.y,
          createdAt: data.createdAt,
          media: data.media || [],
          cropBase64: data.cropBase64
        });
      });
      console.log('[SyncManager] Markers snapshot received. Count:', markersList.length);
      
      // Ensure dummy markers are present
      import('../store/useProjectStore').then(({ DUMMY_MARKERS }) => {
        if (DUMMY_MARKERS) markersList.push(...DUMMY_MARKERS);
        useProjectStore.setState({ markers: markersList });
      }).catch(() => {
        useProjectStore.setState({ markers: markersList });
      });
    }, (error) => {
      console.error('[SyncManager] Markers sync failed:', error);
    });

    // 3. Sync Settings
    const unsubSettings = onSnapshot(doc(db, 'users', userId), (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        if (data && data.settings) {
          console.log('[SyncManager] Settings snapshot received:', data.settings);
          useProjectStore.setState((state) => ({ 
            settings: { ...state.settings, ...data.settings } 
          }));
        }
      }
    }, (error) => {
      console.error('[SyncManager] Settings sync failed:', error);
    });

    this.unsubscribes.push(unsubProjects, unsubMarkers, unsubSettings);
  }

  public stopSync(clearData: boolean = false) {
    console.log('[SyncManager] Stopping sync. Unsubscribing listeners:', this.unsubscribes.length);
    this.unsubscribes.forEach((unsub) => unsub());
    this.unsubscribes = [];
    this.isSyncing = false;
    
    if (clearData) {
      // Reset projects, markers, and settings to default dummy data on logout
      useProjectStore.setState({
        projects: [
          {
            id: '1',
            name: 'Musterprojekt: Bauvorhaben München',
            date: new Date(Date.now() - 3600000 * 24 * 5).toISOString(),
            floorPlans: [
              { id: 'fp1', name: 'Erdgeschoss (Muster)', pdfUrl: '' }, // Loaded dynamically
              { id: 'fp2', name: '1. Obergeschoss (Muster)', pdfUrl: '' }
            ]
          } as any
        ],
        markers: [],
        settings: {
          companyName: '',
          companyAddress: '',
          companyLogoUri: undefined,
          companyLogoSize: 0,
          hapticsEnabled: true,
          exportQuality: 'medium',
          syncMode: 'auto',
        }
      });
    }
  }
}

export const SyncManager = new SyncManagerClass();
