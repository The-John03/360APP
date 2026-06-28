import React, { useState } from 'react';
import { View, StyleSheet, Platform, ActivityIndicator, Text } from 'react-native';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import { useCachedMedia } from '../hooks/useCachedMedia';

type Props = {
  imageUrl: string;
  mediaId: string;
};

const getHtml = (imageUrl: string) => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=5.0, minimum-scale=1.0, user-scalable=yes">
  <style>
    body, html {
      margin: 0;
      padding: 0;
      width: 100%;
      height: 100%;
      background-color: #000;
      display: flex;
      justify-content: center;
      align-items: center;
    }
    img {
      max-width: 100%;
      max-height: 100%;
      object-fit: contain;
      display: block;
      margin: auto;
    }
  </style>
</head>
<body>
  <img src="${imageUrl}" />
</body>
</html>
`;

export default function ImageViewer2D({ imageUrl: originalUrl, mediaId }: Props) {
  const { localUri: cachedUrl, isCaching } = useCachedMedia(originalUrl, mediaId);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [useOriginal, setUseOriginal] = useState(false);

  const imageUrl = useOriginal ? originalUrl : (cachedUrl || originalUrl);
  const baseUrl = imageUrl;

  console.log('[ImageViewer2D] originalUrl:', originalUrl, 'imageUrl:', imageUrl, 'isCaching:', isCaching, 'useOriginal:', useOriginal);

  const isLocalUriOnWeb = Platform.OS === 'web' && (imageUrl?.startsWith('file://') || imageUrl?.startsWith('content://'));

  if (Platform.OS === 'web') {
    if (isLocalUriOnWeb) {
      return (
        <View style={[styles.container, styles.errorContainer]}>
          <Ionicons name="cloud-offline-outline" size={48} color="#FF9500" style={{ marginBottom: 12 }} />
          <Text style={styles.errorTitle}>Bild nicht synchronisiert</Text>
          <Text style={styles.errorText}>
            Dieses Foto wurde lokal auf einem Mobilgerät hinzugefügt, aber die Übertragung in die Cloud wurde noch nicht abgeschlossen.
          </Text>
        </View>
      );
    }

    if (isCaching) {
      return (
        <View style={styles.container}>
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#007AFF" />
            <Text style={styles.loadingText}>Speichere Bild für Offline-Nutzung...</Text>
          </View>
        </View>
      );
    }

    return (
      <View style={styles.container}>
        <img
          src={imageUrl}
          style={{ width: '100%', height: '100%', objectFit: 'contain' } as any}
          alt="2D View"
        />
      </View>
    );
  }

  if (isCaching && !imageUrl) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={styles.loadingText}>Lade Bild...</Text>
        </View>
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.container, styles.errorContainer]}>
        <Ionicons name="image-outline" size={48} color="#FF3B30" style={{ marginBottom: 12 }} />
        <Text style={styles.errorTitle}>Bild konnte nicht geladen werden</Text>
        <Text style={styles.errorText}>
          Die Bilddatei ist möglicherweise beschädigt oder nicht mehr verfügbar.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <WebView
        source={{ html: getHtml(imageUrl), baseUrl: baseUrl }}
        style={styles.webview}
        originWhitelist={['*']}
        allowFileAccess={true}
        allowFileAccessFromFileURLs={true}
        allowUniversalAccessFromFileURLs={true}
        javaScriptEnabled={true}
        mixedContentMode="always"
        scalesPageToFit={true}
        bounces={false}
        onLoadEnd={() => setLoading(false)}
        onError={(e: any) => {
          console.warn('[ImageViewer2D] WebView load error:', e.nativeEvent);
          if (!useOriginal && imageUrl !== originalUrl) {
            console.log('[ImageViewer2D] Fallback to original URL:', originalUrl);
            setUseOriginal(true);
            setLoading(true);
          } else {
            setError(true);
            setLoading(false);
          }
        }}
      />
      {loading && (
        <View style={styles.loadingOverlay} pointerEvents="none">
          <ActivityIndicator size="large" color="#ffffff" />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  webview: {
    flex: 1,
    backgroundColor: '#000',
  },
  loadingContainer: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#999',
    marginTop: 12,
    fontSize: 14,
  },
  errorContainer: {
    padding: 24,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1C1C1E',
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 8,
    textAlign: 'center',
  },
  errorText: {
    fontSize: 14,
    color: '#AEAEB2',
    textAlign: 'center',
    lineHeight: 20,
  }
});
