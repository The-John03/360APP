import { useState, useEffect } from 'react';
import * as FileSystem from 'expo-file-system/legacy';

export function useCachedPdf(remoteUrl: string | undefined, floorPlanId: string) {
  const [localUri, setLocalUri] = useState<string | undefined>(remoteUrl);
  const [isCaching, setIsCaching] = useState(false);

  useEffect(() => {
    if (!remoteUrl) {
      setLocalUri(undefined);
      return;
    }

    // If it's already a local file or data URI, no caching needed
    if (remoteUrl.startsWith('file://') || remoteUrl.startsWith('data:') || remoteUrl.startsWith('content://')) {
      setLocalUri(remoteUrl);
      return;
    }

    let isMounted = true;

    const cachePdf = async () => {
      setIsCaching(true);
      try {
        const cacheDir = `${FileSystem.documentDirectory}pdf_cache/`;
        
        const dirInfo = await FileSystem.getInfoAsync(cacheDir);
        if (!dirInfo.exists) {
          await FileSystem.makeDirectoryAsync(cacheDir, { intermediates: true });
        }

        const fileUri = `${cacheDir}${floorPlanId}.pdf`;
        const fileInfo = await FileSystem.getInfoAsync(fileUri);

        // TypeScript error suppression since size property exists but type definition might miss it
        if (fileInfo.exists && (fileInfo as any).size !== undefined && (fileInfo as any).size > 0) {
          // Use cached file
          if (isMounted) setLocalUri(fileUri);
        } else {
          // Download and cache
          const downloadResult = await FileSystem.downloadAsync(remoteUrl, fileUri);
          if (downloadResult.status === 200 && isMounted) {
            setLocalUri(downloadResult.uri);
          } else {
            if (isMounted) setLocalUri(remoteUrl); // fallback
          }
        }
      } catch (err) {
        console.warn('[useCachedPdf] Failed to cache PDF:', err);
        if (isMounted) setLocalUri(remoteUrl);
      } finally {
        if (isMounted) setIsCaching(false);
      }
    };

    cachePdf();

    return () => {
      isMounted = false;
    };
  }, [remoteUrl, floorPlanId]);

  return { localUri, isCaching };
}
