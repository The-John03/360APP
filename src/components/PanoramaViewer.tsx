import React, { useState } from 'react';
import { View, StyleSheet, Platform, ActivityIndicator, Text } from 'react-native';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';

type Props = {
  imageUrl: string;
  mediaId: string;
};

const getPannellumHtml = (imageUrl: string, isWeb: boolean) => `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=${isWeb ? 'no' : 'yes'}">
    <title>Panorama</title>
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/pannellum@2.5.6/build/pannellum.css"/>
    <script type="text/javascript" src="https://cdn.jsdelivr.net/npm/pannellum@2.5.6/build/pannellum.js"></script>
    <style>
    html, body {
        margin: 0;
        padding: 0;
        width: 100%;
        height: 100%;
        overflow: hidden;
        background-color: #000;
    }
    #panorama {
        width: 100%;
        height: 100%;
    }
    </style>
</head>
<body>
    <div id="panorama"></div>
    <script>
    pannellum.viewer('panorama', {
        "type": "equirectangular",
        "panorama": "${imageUrl}",
        "autoLoad": true,
        "compass": false,
        "showControls": false
    });
    </script>
</body>
</html>
`;

import { useCachedMedia } from '../hooks/useCachedMedia';

export default function PanoramaViewer({ imageUrl: originalUrl, mediaId }: Props) {
  const { localUri: imageUrl, isCaching } = useCachedMedia(originalUrl, mediaId);
  const [loading, setLoading] = useState(true);
  console.log('[PanoramaViewer] originalUrl:', originalUrl, 'imageUrl:', imageUrl, 'isCaching:', isCaching);

  const isLocalUriOnWeb = Platform.OS === 'web' && (imageUrl?.startsWith('file://') || imageUrl?.startsWith('content://'));

  if (Platform.OS === 'web') {
    if (isLocalUriOnWeb) {
      return (
        <View style={[styles.container, styles.errorContainer]}>
          <Ionicons name="cloud-offline-outline" size={48} color="#FF9500" style={{ marginBottom: 12 }} />
          <Text style={styles.errorTitle}>Panorama nicht synchronisiert</Text>
          <Text style={styles.errorText}>
            Dieses 360° Foto wurde lokal auf einem Mobilgerät hinzugefügt, aber die Übertragung in die Cloud wurde noch nicht abgeschlossen.
          </Text>
        </View>
      );
    }

    if (isCaching) {
      return (
        <View style={styles.container}>
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#007AFF" />
            <Text style={styles.loadingText}>Speichere 360° Foto für Offline-Nutzung...</Text>
          </View>
        </View>
      );
    }

    return (
      <View style={styles.container}>
        <iframe
          srcDoc={getPannellumHtml(imageUrl || '', true)}
          style={{ width: '100%', height: '100%', border: 'none' }}
          title="360 Panorama Viewer"
          onLoad={() => setLoading(false)}
        />
        {loading && (
          <View style={styles.loadingContainer} pointerEvents="none">
            <ActivityIndicator size="large" color="#ffffff" />
            <Text style={styles.loadingText}>Lade 360° Ansicht...</Text>
          </View>
        )}
      </View>
    );
  }

  if (isCaching) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={styles.loadingText}>Speichere 360° Foto für Offline-Nutzung...</Text>
        </View>
      </View>
    );
  }

  const baseUrl = imageUrl;

  return (
    <View style={styles.container}>
      <WebView
        source={{ html: getPannellumHtml(imageUrl || '', false), baseUrl: baseUrl }}
        style={styles.webview}
        originWhitelist={['*']}
        allowFileAccess={true}
        allowFileAccessFromFileURLs={true}
        allowUniversalAccessFromFileURLs={true}
        javaScriptEnabled={true}
        mixedContentMode="always"
        onLoadEnd={() => setLoading(false)}
      />
      {loading && (
        <View style={styles.loadingContainer} pointerEvents="none">
          <ActivityIndicator size="large" color="#ffffff" />
          <Text style={styles.loadingText}>Lade 360° Ansicht...</Text>
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
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#ffffff',
  },
  errorContainer: {
    padding: 24,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1C1C1E', // Dark mode background for panorama viewer
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
