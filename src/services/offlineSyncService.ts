import * as FileSystem from 'expo-file-system/legacy';
import { Project, Marker } from '../store/useProjectStore';

export type SyncProgress = {
  current: number;
  total: number;
  statusText: string;
};

export const offlineSyncService = {
  async downloadProjectAssets(
    project: Project,
    markers: Marker[],
    onProgress: (progress: SyncProgress) => void
  ): Promise<void> {
    try {
      // 1. Gather all URLs to download
      const itemsToDownload: { url: string; cachePath: string; id: string }[] = [];

      // A. PDFs
      for (const fp of project.floorPlans) {
        if (fp.pdfUrl && fp.pdfUrl.startsWith('http')) {
          itemsToDownload.push({
            url: fp.pdfUrl,
            cachePath: `${FileSystem.documentDirectory}pdf_cache/${fp.id}.pdf`,
            id: fp.id,
          });
        }
      }

      // B. Media Items
      for (const marker of markers) {
        if (marker.projectId === project.id) {
          for (const media of marker.media) {
            if (media.uri && media.uri.startsWith('http')) {
              // Extract extension or fallback to jpg
              const ext = media.uri.split('?')[0].split('.').pop() || 'jpg';
              itemsToDownload.push({
                url: media.uri,
                cachePath: `${FileSystem.documentDirectory}media_cache/${media.id}.${ext}`,
                id: media.id,
              });
            }
          }
        }
      }

      const totalItems = itemsToDownload.length;
      if (totalItems === 0) {
        onProgress({ current: 0, total: 0, statusText: 'Alles bereits lokal!' });
        return;
      }

      // 2. Create directories if needed
      const pdfDirInfo = await FileSystem.getInfoAsync(`${FileSystem.documentDirectory}pdf_cache/`);
      if (!pdfDirInfo.exists) {
        await FileSystem.makeDirectoryAsync(`${FileSystem.documentDirectory}pdf_cache/`, { intermediates: true });
      }

      const mediaDirInfo = await FileSystem.getInfoAsync(`${FileSystem.documentDirectory}media_cache/`);
      if (!mediaDirInfo.exists) {
        await FileSystem.makeDirectoryAsync(`${FileSystem.documentDirectory}media_cache/`, { intermediates: true });
      }

      // 3. Download items sequentially
      let downloadedCount = 0;
      for (const item of itemsToDownload) {
        onProgress({
          current: downloadedCount,
          total: totalItems,
          statusText: `Lade Datei ${downloadedCount + 1} von ${totalItems}...`,
        });

        const fileInfo = await FileSystem.getInfoAsync(item.cachePath);
        
        // Skip if already downloaded and has size > 0
        if (fileInfo.exists && (fileInfo as any).size !== undefined && (fileInfo as any).size > 0) {
          downloadedCount++;
          continue;
        }

        try {
          const res = await FileSystem.downloadAsync(item.url, item.cachePath);
          if (res.status !== 200) {
            console.warn(`Failed to download ${item.url}, status: ${res.status}`);
          }
        } catch (err) {
          console.warn(`Error downloading ${item.url}:`, err);
        }

        downloadedCount++;
      }

      onProgress({
        current: totalItems,
        total: totalItems,
        statusText: 'Download abgeschlossen!',
      });

    } catch (error) {
      console.error('Offline Sync Error:', error);
      throw error;
    }
  }
};
