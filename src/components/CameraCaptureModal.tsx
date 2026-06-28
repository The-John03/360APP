import React, { useEffect, useState } from 'react';
import { View, Text, Modal, TouchableOpacity, StyleSheet, ActivityIndicator, Platform, Alert } from 'react-native';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import { CameraService, CameraStatus } from '../services/cameraService';
import WifiHelperModal from './WifiHelperModal';

type Props = {
  visible: boolean;
  onClose: () => void;
  onPhotoCaptured: (localUri: string) => void;
};

export default function CameraCaptureModal({ visible, onClose, onPhotoCaptured }: Props) {
  const [loadingInfo, setLoadingInfo] = useState(true);
  const [cameraInfo, setCameraInfo] = useState<CameraStatus | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [statusText, setStatusText] = useState('Verbindung wird geprüft...');
  const [wifiHelperVisible, setWifiHelperVisible] = useState(false);

  const initConnection = async () => {
    setLoadingInfo(true);
    setStatusText('Verbindung zur Kamera wird hergestellt...');
    try {
      const status = await CameraService.checkConnection();
      setCameraInfo(status);
      if (status.connected) {
        setStatusText(`Verbunden mit ${status.manufacturer} ${status.model || ''}`);
      } else {
        setStatusText('Keine Kamera im WLAN gefunden.');
      }
    } catch (err) {
      console.error(err);
      setCameraInfo({ connected: false });
      setStatusText('Fehler bei der Verbindung.');
    } finally {
      setLoadingInfo(false);
    }
  };

  useEffect(() => {
    if (visible) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      initConnection();
    } else {
      CameraService.enableSimulation(false);
      setCameraInfo(null);
      setCapturing(false);
      setDownloadProgress(0);
    }
  }, [visible]);

  const handleCapture = async () => {
    if (!cameraInfo?.connected) return;
    setCapturing(true);
    setDownloadProgress(0);
    setStatusText('Foto wird aufgenommen... Bitte stillhalten.');
    
    try {
      // 1. Trigger take photo
      const remoteUrl = await CameraService.takePhoto();
      
      // 2. Download photo
      setStatusText('Foto wird heruntergeladen...');
      const localUri = await CameraService.downloadPhoto(remoteUrl, (progress) => {
        setDownloadProgress(progress);
      });
      
      // 3. Callback & Close
      onPhotoCaptured(localUri);
      onClose();
    } catch (err: any) {
      console.error(err);
      Alert.alert(
        'Aufnahme fehlgeschlagen',
        err.message || 'Das Foto konnte nicht aufgenommen oder heruntergeladen werden. Bitte prüfe die WLAN-Verbindung zur Kamera.',
        [{ text: 'OK' }]
      );
      setStatusText(cameraInfo ? `Verbunden mit ${cameraInfo.manufacturer} ${cameraInfo.model || ''}` : 'Kamera bereit');
    } finally {
      setCapturing(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent={false}
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.closeButton} disabled={capturing}>
            <Ionicons name="close" size={28} color="white" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>360° Kamera-Steuerung</Text>
          {cameraInfo?.connected && !capturing ? (
            <TouchableOpacity onPress={initConnection} style={styles.refreshButton}>
              <Ionicons name="refresh" size={22} color="white" />
            </TouchableOpacity>
          ) : (
            <View style={{ width: 44 }} />
          )}
        </View>

        {/* Live Preview Area */}
        <View style={styles.previewContainer}>
          {loadingInfo ? (
            <View style={styles.center}>
              <ActivityIndicator size="large" color="#007AFF" />
              <Text style={styles.messageText}>{statusText}</Text>
            </View>
          ) : !cameraInfo?.connected ? (
            <View style={styles.center}>
              <Ionicons name="wifi-outline" size={64} color="#8E8E93" style={{ marginBottom: 16 }} />
              <Text style={styles.errorText}>Keine Kamera verbunden</Text>
              <Text style={styles.subErrorText}>
                Bitte verbinde dein Handy im WLAN mit der Kamera (z.B. Insta360 oder Ricoh Theta).
              </Text>
              
              <TouchableOpacity style={styles.guideBtn} onPress={() => setWifiHelperVisible(true)}>
                <Ionicons name="help-circle-outline" size={20} color="#007AFF" style={{ marginRight: 6 }} />
                <Text style={styles.guideBtnText}>WLAN-Anleitung anzeigen</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.retryBtn} onPress={initConnection}>
                <Text style={styles.retryBtnText}>Verbindung erneut prüfen</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={[styles.retryBtn, { backgroundColor: '#34C759', marginTop: 12, flexDirection: 'row', alignItems: 'center' }]} 
                onPress={() => {
                  CameraService.enableSimulation(true);
                  initConnection();
                }}
              >
                <Ionicons name="construct-outline" size={18} color="white" style={{ marginRight: 6 }} />
                <Text style={styles.retryBtnText}>Kamera simulieren (Demo)</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={{ flex: 1, position: 'relative' }}>
              <WebView
                source={{ html: CameraService.getLivePreviewHtml() }}
                style={styles.webview}
                originWhitelist={['*']}
                scrollEnabled={false}
                javaScriptEnabled={true}
              />
              
              {/* Battery Badge overlay */}
              {cameraInfo.batteryLevel !== undefined && (
                <View style={styles.batteryBadge}>
                  <Ionicons 
                    name={cameraInfo.batteryLevel > 0.2 ? "battery-full" : "battery-dead"} 
                    size={16} 
                    color={cameraInfo.batteryLevel > 0.2 ? "#4CD964" : "#FF3B30"} 
                    style={{ marginRight: 4 }}
                  />
                  <Text style={styles.batteryText}>{Math.round(cameraInfo.batteryLevel * 100)}%</Text>
                </View>
              )}
            </View>
          )}

          {/* Capture Loading Overlay */}
          {capturing && (
            <View style={styles.overlay}>
              <ActivityIndicator size="large" color="white" style={{ marginBottom: 16 }} />
              <Text style={styles.overlayText}>{statusText}</Text>
              {downloadProgress > 0 && (
                <Text style={styles.progressText}>{Math.round(downloadProgress * 100)}% geladen</Text>
              )}
            </View>
          )}
        </View>

        {/* Footer Area */}
        <View style={styles.footer}>
          <Text style={styles.statusLabel} numberOfLines={1}>
            {statusText}
          </Text>

          <TouchableOpacity
            style={[styles.captureBtn, (!cameraInfo?.connected || capturing) && styles.captureBtnDisabled]}
            disabled={!cameraInfo?.connected || capturing}
            onPress={handleCapture}
          >
            <View style={styles.captureInnerCircle}>
              <Ionicons name="aperture" size={36} color="white" />
            </View>
          </TouchableOpacity>
        </View>

        <WifiHelperModal visible={wifiHelperVisible} onClose={() => setWifiHelperVisible(false)} />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1C1C1E',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Platform.OS === 'ios' ? 50 : 20,
    paddingBottom: 16,
    paddingHorizontal: 16,
    backgroundColor: '#000000',
    borderBottomWidth: 1,
    borderBottomColor: '#2C2C2E',
  },
  headerTitle: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },
  closeButton: {
    padding: 8,
  },
  refreshButton: {
    padding: 8,
  },
  previewContainer: {
    flex: 1,
    backgroundColor: '#000000',
    justifyContent: 'center',
  },
  webview: {
    flex: 1,
    backgroundColor: '#000000',
  },
  center: {
    alignItems: 'center',
    padding: 24,
  },
  messageText: {
    color: '#8E8E93',
    fontSize: 15,
    marginTop: 16,
    textAlign: 'center',
  },
  errorText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  subErrorText: {
    color: '#8E8E93',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  guideBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2C2C2E',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginBottom: 16,
  },
  guideBtnText: {
    color: '#007AFF',
    fontWeight: '600',
    fontSize: 15,
  },
  retryBtn: {
    backgroundColor: '#007AFF',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 24,
  },
  retryBtnText: {
    color: 'white',
    fontSize: 15,
    fontWeight: 'bold',
  },
  batteryBadge: {
    position: 'absolute',
    top: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
  },
  batteryText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '600',
  },
  overlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  overlayText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 8,
  },
  progressText: {
    color: '#007AFF',
    fontSize: 14,
    fontWeight: 'bold',
  },
  footer: {
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
    paddingTop: 16,
    paddingHorizontal: 24,
    backgroundColor: '#000000',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#2C2C2E',
  },
  statusLabel: {
    color: '#8E8E93',
    fontSize: 13,
    marginBottom: 16,
    textAlign: 'center',
    width: '100%',
  },
  captureBtn: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: '#3A3A3C',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 4,
    borderColor: 'white',
  },
  captureBtnDisabled: {
    opacity: 0.4,
  },
  captureInnerCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#FF3B30',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
