import { useState, useEffect } from 'react';
import * as FileSystem from 'expo-file-system/legacy';

export function useCachedMedia(remoteUrl: string | undefined, mediaId: string) {
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

    const cacheMedia = async () => {
      setIsCaching(true);
      try {
        const cacheDir = `${FileSystem.documentDirectory}media_cache/`;
        
        const dirInfo = await FileSystem.getInfoAsync(cacheDir);
        if (!dirInfo.exists) {
          await FileSystem.makeDirectoryAsync(cacheDir, { intermediates: true });
        }

        const ext = remoteUrl.split('?')[0].split('.').pop() || 'jpg';
        const fileUri = `${cacheDir}${mediaId}.${ext}`;
        const fileInfo = await FileSystem.getInfoAsync(fileUri);

        // TypeScript error suppression since size property exists but type definition might miss it
        if (fileInfo.exists && (fileInfo as any).size !== undefined && (fileInfo as any).size > 0) {
          // Use cached file
          if (isMounted) setLocalUri(fileUri);
        } else {
          // Set to remote URL immediately so it displays while downloading
          if (isMounted) setLocalUri(remoteUrl);

          // Download in the background to cache for subsequent offline viewing
          FileSystem.downloadAsync(remoteUrl, fileUri)
            .then((result) => {
              if (isMounted) setLocalUri(result.uri);
              console.log('[useCachedMedia] Background cached media:', remoteUrl);
            })
            .catch((err) => {
              console.warn('[useCachedMedia] Background cache download failed:', err);
            });
        }
      } catch (err) {
        console.warn('[useCachedMedia] Failed to read cache:', err);
        if (isMounted) setLocalUri(remoteUrl);
      } finally {
        if (isMounted) setIsCaching(false);
      }
    };

    cacheMedia();

    return () => {
      isMounted = false;
    };
  }, [remoteUrl, mediaId]);

  return { localUri, isCaching };
}
