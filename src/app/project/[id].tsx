import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  TextInput,
  Image,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { useLocalSearchParams, Stack, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useProjectStore, MediaItem } from '../../store/useProjectStore';
import PdfViewer from '../../components/PdfViewer';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { WebView } from 'react-native-webview';
import * as Print from 'expo-print';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import JSZip from 'jszip';
import PanoramaViewer from '../../components/PanoramaViewer';
import { ERDGESCHOSS_MUSTER_BASE64, OBERGESCHOSS_MUSTER_BASE64 } from '../../constants/samplePdfs';
import ImageViewer2D from '../../components/ImageViewer2D';
import CameraCaptureModal from '../../components/CameraCaptureModal';
import { PdfReportService } from '../../services/pdfReportService';
import { triggerHaptic } from '../../utils/hapticHelper';
import * as Clipboard from 'expo-clipboard';
import { db } from '../../config/firebase';
import { doc, setDoc } from 'firebase/firestore';
import * as MediaLibrary from 'expo-media-library';
import { PurchaseService } from '../../services/purchaseService';
import { ConfirmModal } from '../../components/ConfirmModal';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

export default function ProjectDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [confirmConfig, setConfirmConfig] = useState<{
    visible: boolean;
    title: string;
    message: string;
    confirmText?: string;
    isDestructive?: boolean;
    onConfirm: () => void;
  } | null>(null);

  const {
    projects,
    addFloorPlan,
    updateFloorPlanPdf,
    renameFloorPlan,
    deleteFloorPlan,
    markers,
    deleteMarker,
    renameMarker,
    addMediaToMarker,
    deleteMediaFromMarker,
    addMarker,
    updateMarkerPosition,
    user,
    isPremiumUser,
    setPremiumUser,
    syncData
  } = useProjectStore();

  const project = projects.find(p => p.id === id);


  const [selectedMarkerId, setSelectedMarkerId] = useState<string | null>(null);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [conversionProgress, setConversionProgress] = useState<{ current: number; total: number } | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [isPreviewVisible, setIsPreviewVisible] = useState(false);
  const [isShareMenuVisible, setIsShareMenuVisible] = useState(false);
  const [isZipping, setIsZipping] = useState(false);
  const [zipProgress, setZipProgress] = useState<{current: number, total: number} | null>(null);

  const [noteText, setNoteText] = useState('');
  const [isAddingNote, setIsAddingNote] = useState(false);
  const { DUMMY_MARKERS } = require('../../store/useProjectStore');

  useEffect(() => {
    if (project?.id === '1') {
      const storeMarkers = useProjectStore.getState().markers;
      // Filter out stale dummy markers (dm1 and dm2) so they are updated with the latest URLs/coordinates
      const otherMarkers = storeMarkers.filter(m => m.projectId === '1' ? (m.id !== 'dm1' && m.id !== 'dm2') : true);
      useProjectStore.setState({ markers: [...otherMarkers, ...DUMMY_MARKERS] });

      // Clean up any corrupt cached files for dummy markers
      const cleanupCache = async () => {
        try {
          const cacheDir = `${FileSystem.documentDirectory}media_cache/`;
          const filesToClean = ['dm1_m1.png', 'dm1_m1.jpg', 'dm2_m1.jpg', 'dm2_m1.png'];
          for (const file of filesToClean) {
            const filePath = `${cacheDir}${file}`;
            const info = await FileSystem.getInfoAsync(filePath);
            if (info.exists) {
              await FileSystem.deleteAsync(filePath, { idempotent: true });
              console.log('[ProjectDetail] Cleared stale cache:', filePath);
            }
          }
        } catch (err) {
          console.warn('[ProjectDetail] Cache cleanup error:', err);
        }
      };
      cleanupCache();
    }
  }, [project?.id]);

  const [isEditingLabel, setIsEditingLabel] = useState(false);
  const [labelDraft, setLabelDraft] = useState('');
  const [viewingMedia, setViewingMedia] = useState<MediaItem | null>(null);
  const [cameraModalVisible, setCameraModalVisible] = useState(false);
  const [isUploadingFile, setIsUploadingFile] = useState(false);

  // Move & Add Mode State
  const [isMoveMode, setIsMoveMode] = useState(false);
  const [movingMarkerId, setMovingMarkerId] = useState<string | null>(null);
  const [movingPosition, setMovingPosition] = useState<{ x: number; y: number } | null>(null);
  const [isAddMode, setIsAddMode] = useState(false);

  // Date Filter State
  const [filterStartDate, setFilterStartDate] = useState<Date | null>(null);
  const [filterEndDate, setFilterEndDate] = useState<Date | null>(null);
  const [isFilterModalVisible, setIsFilterModalVisible] = useState(false);
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);

  const filteredMarkers = React.useMemo(() => {
    if (!filterStartDate && !filterEndDate) return markers;

    return markers.map(marker => {
      const filteredMedia = marker.media.filter(m => {
        const d = new Date(m.createdAt);
        if (filterStartDate) {
          const start = new Date(filterStartDate);
          start.setHours(0, 0, 0, 0);
          if (d < start) return false;
        }
        if (filterEndDate) {
          const end = new Date(filterEndDate);
          end.setHours(23, 59, 59, 999);
          if (d > end) return false;
        }
        return true;
      });
      return { ...marker, media: filteredMedia };
    }).filter(marker => {
      if (marker.media.length > 0) return true;
      const md = new Date(marker.createdAt);
      if (filterStartDate) {
        const start = new Date(filterStartDate);
        start.setHours(0,0,0,0);
        if (md < start) return false;
      }
      if (filterEndDate) {
        const end = new Date(filterEndDate);
        end.setHours(23,59,59,999);
        if (md > end) return false;
      }
      return true;
    });
  }, [markers, filterStartDate, filterEndDate]);

  const [activeFloorPlanId, setActiveFloorPlanId] = useState<string | null>(null);
  const activePlanId = activeFloorPlanId || (project?.floorPlans && project.floorPlans.length > 0 ? project.floorPlans[0].id : null);
  const activeFloorPlan = project?.floorPlans.find(fp => fp.id === activePlanId);
  const activeFloorPlanMarkers = filteredMarkers.filter(m => m.projectId === project?.id && m.floorPlanId === activeFloorPlan?.id);

  const handleOpenModal = useCallback((markerId: string) => {
    if (isMoveMode || isAddMode) return;
    const marker = filteredMarkers.find(m => m.id === markerId);
    setLabelDraft(marker?.label ?? 'Neuer Marker');
    setSelectedMarkerId(markerId);
    setIsEditingLabel(false);
    setIsAddingNote(false);
  }, [filteredMarkers, isMoveMode, isAddMode]);

  const handleStartMoveMarker = () => {
    if (!selectedMarkerId) return;
    const marker = filteredMarkers.find(m => m.id === selectedMarkerId);
    if (!marker) return;
    setMovingMarkerId(selectedMarkerId);
    setMovingPosition({ x: marker.x, y: marker.y });
    setIsMoveMode(true);
    setSelectedMarkerId(null); // Close modal
  };

  const handleSaveMoveMarker = () => {
    if (movingMarkerId && movingPosition) {
      updateMarkerPosition(movingMarkerId, movingPosition.x, movingPosition.y);
      setIsMoveMode(false);
      setSelectedMarkerId(movingMarkerId); // Re-open details
      setMovingMarkerId(null);
      setMovingPosition(null);
    }
  };

  const handleCancelMode = () => {
    const prevMarkerId = movingMarkerId;
    setIsMoveMode(false);
    setMovingMarkerId(null);
    setMovingPosition(null);
    setIsAddMode(false);
    if (prevMarkerId) {
      setSelectedMarkerId(prevMarkerId); // Re-open details
    }
  };

  const handlePlanClick = (x: number, y: number) => {
    if (isMoveMode) {
      setMovingPosition({ x, y });
    } else if (isAddMode) {
      setIsAddMode(false);
      triggerHaptic.impactMedium();
      const newId = addMarker(project!.id, activeFloorPlan!.id, x, y);
      handleOpenModal(newId);
    } else {
      // Long press / Klick im Normalmodus -> Erstellt direkt einen Marker
      triggerHaptic.impactMedium();
      const newId = addMarker(project!.id, activeFloorPlan!.id, x, y);
      handleOpenModal(newId);
    }
  };

  const handleExportPdf = async () => {
    if (!project) return;
    setExportingPdf(true);
    setConversionProgress(null);
    try {
      const html = await PdfReportService.buildHtmlTemplate(project, filteredMarkers, (current, total) => {
        setConversionProgress({ current, total });
      });
      setPreviewHtml(html);
      setIsPreviewVisible(true);
    } catch (err: any) {
      Alert.alert(
        'Vorschau fehlgeschlagen',
        err.message || 'Die Vorschau konnte nicht generiert werden.',
        [{ text: 'OK' }]
      );
    } finally {
      setExportingPdf(false);
      setConversionProgress(null);
    }
  };

  const handleShareReport = async () => {
    if (!project || !previewHtml) return;
    setExportingPdf(true);
    try {
      await PdfReportService.exportProjectReport(project, filteredMarkers, previewHtml);
    } catch (err: any) {
      Alert.alert(
        'Export fehlgeschlagen',
        err.message || 'Der PDF-Bericht konnte nicht exportiert werden.',
        [{ text: 'OK' }]
      );
    } finally {
      setExportingPdf(false);
    }
  };

  const handlePrintReport = async () => {
    if (!previewHtml) return;
    try {
      await Print.printAsync({ html: previewHtml });
    } catch (err: any) {
      Alert.alert(
        'Drucken fehlgeschlagen',
        err.message || 'Das PDF konnte nicht gedruckt werden.',
        [{ text: 'OK' }]
      );
    }
  };

  const handleShareMenu = () => {
    setIsShareMenuVisible(true);
  };

  const handleDownloadImagesAsZip = async () => {
    setIsShareMenuVisible(false);
    const mediaToZip: { uri: string, name: string }[] = [];
    
    // Gather all filtered media
    let counter = 1;
    filteredMarkers.forEach((marker, mIndex) => {
      marker.media.forEach((media) => {
        if (media.type === 'photo' || media.type === 'photo360') {
          const targetUri = media.localUri || media.uri;
          if (targetUri) {
             const ext = targetUri.split('.').pop()?.split('?')[0] || 'jpg';
             const cleanExt = ['jpg','jpeg','png'].includes(ext.toLowerCase()) ? ext : 'jpg';
             const safeMarkerName = (marker.label || `Marker_${mIndex + 1}`).replace(/[^a-zA-Z0-9]/g, '_');
             mediaToZip.push({
               uri: targetUri,
               name: `${safeMarkerName}_Bild_${counter++}.${cleanExt}`
             });
          }
        }
      });
    });

    if (mediaToZip.length === 0) {
      Alert.alert('Keine Bilder', 'Es gibt im aktuell gewählten Zeitraum keine Bilder zum Herunterladen.');
      return;
    }

    setIsZipping(true);
    setZipProgress({ current: 0, total: mediaToZip.length });

    try {
      const zip = new JSZip();
      
      for (let i = 0; i < mediaToZip.length; i++) {
        const item = mediaToZip[i];
        let localUri = item.uri;
        
        if (item.uri.startsWith('http')) {
          const downloadDest = `${FileSystem.cacheDirectory}temp_zip_img_${i}.${item.name.split('.').pop()}`;
          const { uri } = await FileSystem.downloadAsync(item.uri, downloadDest);
          localUri = uri;
        }

        const base64Data = await FileSystem.readAsStringAsync(localUri, { encoding: FileSystem.EncodingType.Base64 });
        zip.file(item.name, base64Data, { base64: true });
        
        setZipProgress({ current: i + 1, total: mediaToZip.length });
      }

      setZipProgress(null);
      
      const zipBase64 = await zip.generateAsync({ type: "base64" });
      const safeProjectName = project?.name.replace(/[^a-zA-Z0-9]/g, '_') || 'Projekt';
      const zipPath = `${FileSystem.cacheDirectory}${safeProjectName}_Bilder.zip`;
      
      await FileSystem.writeAsStringAsync(zipPath, zipBase64, { encoding: FileSystem.EncodingType.Base64 });
      
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(zipPath, {
          mimeType: 'application/zip',
          dialogTitle: 'Bilder-Zip teilen'
        });
      } else {
        Alert.alert('Fehler', 'Teilen ist auf diesem Gerät nicht verfügbar.');
      }
    } catch (error: any) {
      console.error('ZIP Error:', error);
      Alert.alert('Fehler beim Zippen', 'Die Bilder konnten leider nicht verpackt werden.');
    } finally {
      setIsZipping(false);
      setZipProgress(null);
    }
  };

  const handleShareProjectLink = async () => {
    if (!project) return;

    if (!user) {
      Alert.alert(
        'Anmeldung erforderlich',
        'Du musst angemeldet sein, um Projekte mit Bauherren zu teilen.',
        [
          { text: 'Abbrechen', style: 'cancel' },
          { text: 'Anmelden', onPress: () => router.push('/login') }
        ]
      );
      return;
    }

    if (!isPremiumUser) {
      Alert.alert(
        'Premium-Feature',
        'Das schreibgeschützte Teilen von Plänen für Bauherren ist ein Premium-Feature. Möchtest du Premium freischalten?',
        [
          { text: 'Abbrechen', style: 'cancel' },
          { 
            text: 'Premium kaufen', 
            onPress: async () => {
              const success = await PurchaseService.purchasePremium();
              if (success) {
                setPremiumUser(true);
                Alert.alert('Erfolg', 'Vielen Dank für deinen Kauf! Premium wurde freigeschaltet.');
              }
            }
          }
        ]
      );
      return;
    }

    try {
      let token = (project as any).shareToken;
      if (!token) {
        token = 'test-token'; // Simplified for demo
        // Save share token to firestore
        await setDoc(doc(db, 'projects', project.id), {
          isShared: true,
          shareToken: token
        }, { merge: true });
        
        // Also update local project object in-memory
        (project as any).isShared = true;
        (project as any).shareToken = token;
      }

      // Build URL
      let webOrigin = 'https://360app.web.app';
      if (Platform.OS === 'web') {
        webOrigin = window.location.origin;
      }
      const shareUrl = `${webOrigin}/share/${project.id}?token=${token}`;

      // Copy to clipboard
      await Clipboard.setStringAsync(shareUrl);
      
      triggerHaptic.success();
      Alert.alert(
        'Link kopiert!',
        'Der Freigabelink für Bauherren wurde in die Zwischenablage kopiert. Du kannst ihn jetzt per E-Mail oder WhatsApp versenden.\n\nLink: ' + shareUrl,
        [{ text: 'OK' }]
      );
    } catch (err) {
      console.error('Error generating share link:', err);
      Alert.alert('Fehler', 'Freigabelink konnte nicht erstellt werden.');
    }
  };
  const [floorPlanModalMode, setFloorPlanModalMode] = useState<'add' | 'edit' | null>(null);
  const [floorPlanModalId, setFloorPlanModalId] = useState<string | null>(null);
  const [floorPlanModalName, setFloorPlanModalName] = useState('');

  const handleUploadPdfForFloorPlan = async (isUpdate: boolean) => {
    try {
      if (!isUpdate && floorPlanModalName.trim() === '') {
        Alert.alert('Eingabe erforderlich', 'Bitte gib einen Namen für den Plan ein.');
        return;
      }
      const result = await DocumentPicker.getDocumentAsync({
        type: 'application/pdf',
        copyToCacheDirectory: true,
      });
      if (!result.canceled && result.assets && result.assets.length > 0) {
        setIsUploadingFile(true);
        triggerHaptic.success();
        try {
          if (isUpdate && floorPlanModalId) {
            await updateFloorPlanPdf(project!.id, floorPlanModalId, result.assets[0].uri);
          } else {
            await addFloorPlan(project!.id, floorPlanModalName.trim(), result.assets[0].uri);
            setFloorPlanModalName('');
          }
          setFloorPlanModalMode(null);
        } catch (uploadErr) {
          console.error('[Upload PDF] Failed:', uploadErr);
          Alert.alert(
            'Upload fehlgeschlagen',
            'Der Plan konnte nicht in die Cloud hochgeladen werden. Bitte überprüfe deine Internetverbindung.'
          );
        } finally {
          setIsUploadingFile(false);
        }
      }
    } catch (err) {
      console.error('Error picking document', err);
      setIsUploadingFile(false);
    }
  };

  const handleSaveFloorPlanName = () => {
    if (floorPlanModalMode === 'edit' && floorPlanModalId && floorPlanModalName.trim() !== '') {
      triggerHaptic.success();
      renameFloorPlan(project!.id, floorPlanModalId, floorPlanModalName.trim());
      setFloorPlanModalMode(null);
    }
  };

  const handleDeleteFloorPlan = () => {
    if (floorPlanModalMode === 'edit' && floorPlanModalId) {
      setConfirmConfig({
        visible: true,
        title: 'Plan löschen',
        message: 'Möchtest du diesen Plan inklusive aller gesetzten Marker wirklich löschen?',
        confirmText: 'Löschen',
        isDestructive: true,
        onConfirm: () => {
          triggerHaptic.warning();
          deleteFloorPlan(project!.id, floorPlanModalId);
          if (activePlanId === floorPlanModalId) {
            setActiveFloorPlanId(null);
          }
          setFloorPlanModalMode(null);
          setConfirmConfig(null);
        }
      });
    }
  };

  const processImageResult = async (result: ImagePicker.ImagePickerResult) => {
    if (!result.canceled && result.assets && result.assets.length > 0 && selectedMarkerId) {
      setIsUploadingFile(true);
      triggerHaptic.success();
      try {
        const asset = result.assets[0];
        const ratio = asset.width / asset.height;
        const is360 = ratio >= 1.9 && ratio <= 2.1;
        await addMediaToMarker(selectedMarkerId, is360 ? 'photo360' : 'photo', asset.uri);
      } catch (uploadErr) {
        console.error('[Upload Image] Failed:', uploadErr);
        Alert.alert(
          'Upload fehlgeschlagen',
          'Das Foto konnte nicht in die Cloud hochgeladen werden. Bitte überprüfe deine Internetverbindung.'
        );
      } finally {
        setIsUploadingFile(false);
      }
    }
  };

  const handleTakePhoto = async () => {
    if (!selectedMarkerId) return;
    const permissionResult = await ImagePicker.requestCameraPermissionsAsync();
    if (!permissionResult.granted) {
      alert('Kamera-Berechtigung ist erforderlich!');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.8,
    });
    processImageResult(result);
  };

  const handlePickImage = async () => {
    if (!selectedMarkerId) return;
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permissionResult.granted) {
      alert('Galerie-Berechtigung ist erforderlich!');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
    });
    processImageResult(result);
  };

  const handle360PhotoCaptured = async (localUri: string) => {
    if (selectedMarkerId) {
      setIsUploadingFile(true);
      triggerHaptic.success();
      try {
        await addMediaToMarker(selectedMarkerId, 'photo360', localUri);
      } catch (uploadErr) {
        console.error('[Upload 360 Photo] Failed:', uploadErr);
        Alert.alert(
          'Upload failed',
          'Das 360° Foto konnte nicht hochgeladen werden.'
        );
      } finally {
        setIsUploadingFile(false);
      }
    }
  };

  const handleSaveNote = async () => {
    if (!selectedMarkerId || noteText.trim() === '') return;
    setIsUploadingFile(true);
    triggerHaptic.success();
    try {
      await addMediaToMarker(selectedMarkerId, 'note', noteText.trim());
      setNoteText('');
      setIsAddingNote(false);
    } catch (err) {
      console.error('[Save Note] Failed:', err);
      Alert.alert('Fehler', 'Notiz konnte nicht in der Cloud gespeichert werden.');
    } finally {
      setIsUploadingFile(false);
    }
  };

  const handleDeleteMarker = () => {
    if (!selectedMarkerId) return;
    setConfirmConfig({
      visible: true,
      title: 'Marker löschen',
      message: 'Möchtest du diesen Marker mit allen Medien wirklich löschen?',
      confirmText: 'Löschen',
      isDestructive: true,
      onConfirm: () => {
        triggerHaptic.warning();
        deleteMarker(selectedMarkerId);
        setSelectedMarkerId(null);
        setConfirmConfig(null);
      }
    });
  };

  const handleDeleteMedia = (markerId: string, mediaId: string) => {
    setConfirmConfig({
      visible: true,
      title: 'Medium löschen',
      message: 'Möchtest du dieses Medium wirklich löschen?',
      confirmText: 'Löschen',
      isDestructive: true,
      onConfirm: () => {
        triggerHaptic.warning();
        deleteMediaFromMarker(markerId, mediaId);
        setConfirmConfig(null);
      }
    });
  };

  const handleSaveLabel = () => {
    if (selectedMarkerId && labelDraft.trim() !== '') {
      renameMarker(selectedMarkerId, labelDraft.trim());
    }
    setIsEditingLabel(false);
  };

  const handleCloseModal = () => {
    if (isEditingLabel) handleSaveLabel();
    setSelectedMarkerId(null);
    setIsAddingNote(false);
    setNoteText('');
  };

  if (!project) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>Projekt nicht gefunden.</Text>
      </View>
    );
  }

  const selectedMarker = filteredMarkers.find(m => m.id === selectedMarkerId);

  const renderMediaItem = (item: MediaItem, markerId: string) => {
    if (item.type === 'photo' || item.type === 'photo360') {
      const is360 = item.type === 'photo360';
      return (
        <TouchableOpacity 
          key={item.id} 
          style={styles.mediaItemPhotoCard}
          onPress={() => setViewingMedia(item)}
        >
          <View style={styles.mediaThumbnailContainer}>
            <Image source={{ uri: item.localUri || item.uri }} style={styles.mediaPhoto} />
            {is360 && (
              <View style={styles.icon360Badge}>
                <Ionicons name="globe-outline" size={16} color="white" />
              </View>
            )}
          </View>
          <View style={styles.mediaItemInfo}>
            <Text style={styles.mediaItemMeta}>
              {is360 ? '🌐 360° Foto' : '📷 Foto'} · {new Date(item.createdAt).toLocaleDateString()}
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => handleDeleteMedia(markerId, item.id)}
            style={styles.deleteMediaButton}
          >
            <Ionicons name="trash-outline" size={20} color="#FF3B30" />
          </TouchableOpacity>
        </TouchableOpacity>
      );
    } else {
      return (
        <View key={item.id} style={styles.mediaItemNoteCard}>
          <Ionicons name="document-text" size={18} color="#007AFF" style={{ marginRight: 8 }} />
          <View style={styles.mediaItemInfo}>
            <Text style={styles.mediaNoteText}>{item.text}</Text>
            <Text style={styles.mediaItemMeta}>
              Notiz · {new Date(item.createdAt).toLocaleDateString()}
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => handleDeleteMedia(markerId, item.id)}
            style={styles.deleteMediaButton}
          >
            <Ionicons name="trash-outline" size={20} color="#FF3B30" />
          </TouchableOpacity>
        </View>
      );
    }
  };

  return (
    <View style={styles.container}>
      <Stack.Screen 
        options={{ 
          title: project.name,
          headerTitle: (props) => (
            <View style={{ 
              flexDirection: 'row', 
              alignItems: 'center', 
              flexShrink: 1, 
              marginLeft: Platform.OS === 'ios' ? 0 : -16,
              marginRight: Platform.OS === 'web' ? 20 : 40 
            }}>
              <Ionicons name="location-sharp" size={28} color="#fff" style={{ marginRight: 6, flexShrink: 0 }} />
              <Text 
                style={{ color: '#fff', fontSize: 19, fontWeight: 'bold', flexShrink: 1 }}
                numberOfLines={1}
                ellipsizeMode="tail"
              >
                {props?.children ?? project.name}
              </Text>
            </View>
          ),
          headerRight: () => (
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <TouchableOpacity 
                onPress={() => setIsFilterModalVisible(true)}
                style={{ marginRight: 8, padding: 6 }}
                disabled={exportingPdf}
              >
                <Ionicons name={(filterStartDate || filterEndDate) ? "filter" : "filter-outline"} size={24} color={(filterStartDate || filterEndDate) ? "#FFCC00" : "white"} />
              </TouchableOpacity>
              <TouchableOpacity 
                onPress={handleShareMenu}
                style={{ marginRight: 8, padding: 6 }}
                disabled={exportingPdf}
              >
                {exportingPdf ? (
                  <ActivityIndicator size="small" color="white" />
                ) : (
                  <Ionicons name="share-outline" size={24} color="white" />
                )}
              </TouchableOpacity>
            </View>
          )
        }} 
      />

      {/* Floor Plans Header Bar */}
      <View style={styles.floorPlanTabs}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabsScrollContent}>
          {project.floorPlans.map((fp) => (
            <TouchableOpacity 
              key={fp.id} 
              style={[styles.tabBtn, activePlanId === fp.id && styles.activeTabBtn]}
              onPress={() => setActiveFloorPlanId(fp.id)}
            >
              <Text style={[styles.tabBtnText, activePlanId === fp.id && styles.activeTabBtnText]}>{fp.name}</Text>
              {activePlanId === fp.id && (
                <TouchableOpacity 
                  onPress={() => {
                    setFloorPlanModalId(fp.id);
                    setFloorPlanModalName(fp.name);
                    setFloorPlanModalMode('edit');
                  }}
                  style={{ marginLeft: 6 }}
                >
                  <Ionicons name="settings-sharp" size={14} color="white" />
                </TouchableOpacity>
              )}
            </TouchableOpacity>
          ))}
          <TouchableOpacity 
            style={styles.addPlanBtn}
            onPress={() => {
              setFloorPlanModalName('');
              setFloorPlanModalMode('add');
            }}
          >
            <Ionicons name="add" size={20} color="#007AFF" />
            <Text style={styles.addPlanBtnText}>Neuer Plan</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>

      {/* No Sync Progress Overlay needed */}

      {/* Full-screen PDF Plan View */}
      <View style={styles.content}>
        {activeFloorPlan ? (
          <View style={{flex: 1}}>
            {(isMoveMode || isAddMode) && (
              <View style={styles.bannerContainer}>
                <Text style={styles.bannerText}>
                  {isMoveMode 
                    ? 'Verschiebe-Modus: Tippe auf den Plan, um die neue Position zu wählen.' 
                    : 'Marker hinzufügen: Tippe auf den Plan, um den Marker zu platzieren.'}
                </Text>
                <View style={styles.bannerActions}>
                  <TouchableOpacity 
                    style={[styles.bannerBtn, styles.bannerBtnCancel]} 
                    onPress={handleCancelMode}
                  >
                    <Text style={styles.bannerBtnTextCancel}>Abbrechen</Text>
                  </TouchableOpacity>
                  {isMoveMode && (
                    <TouchableOpacity 
                      style={[styles.bannerBtn, styles.bannerBtnSave]} 
                      onPress={handleSaveMoveMarker}
                    >
                      <Text style={styles.bannerBtnTextSave}>Speichern</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            )}

            <PdfViewer
              projectId={project.id}
              floorPlanId={activeFloorPlan.id}
              pdfUri={
                project.id === '1' 
                  ? (activeFloorPlan.id === 'fp1' ? ERDGESCHOSS_MUSTER_BASE64 : OBERGESCHOSS_MUSTER_BASE64) 
                  : activeFloorPlan.pdfUrl
              }
              onMarkerClick={handleOpenModal}
              onPlanClick={handlePlanClick}
              movingMarkerId={isMoveMode ? movingMarkerId : null}
              movingPosition={isMoveMode ? movingPosition : null}
              isPlacementActive={isMoveMode || isAddMode}
              overrideMarkers={filteredMarkers}
            />

            {/* Hint overlay if plan has no markers */}
            {activeFloorPlanMarkers.length === 0 && !isMoveMode && !isAddMode && (
              <View style={styles.hintOverlayContainer}>
                <Ionicons name="information-circle-outline" size={20} color="#5E5CE6" style={{ marginRight: 8 }} />
                <Text style={styles.hintOverlayText}>
                  Halte den Finger auf dem Plan gedrückt oder nutze den „+ Marker“-Button unten rechts, um einen Marker zu erstellen.
                </Text>
              </View>
            )}

            {/* Floating Add Marker Button */}
            {!isMoveMode && !isAddMode && (
              <TouchableOpacity
                style={styles.addMarkerFloatingBtn}
                onPress={() => setIsAddMode(true)}
              >
                <Ionicons name="add" size={30} color="white" />
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <View style={styles.uploadContainer}>
            <Ionicons name="map-outline" size={64} color="#C7C7CC" />
            <Text style={styles.uploadText}>Kein Plan ausgewählt</Text>
            {project.floorPlans.length === 0 && (
              <Text style={styles.uploadSubText}>Füge oben einen neuen Plan hinzu.</Text>
            )}
          </View>
        )}
      </View>

      {/* Add / Edit Floor Plan Modal */}
      <Modal
        visible={floorPlanModalMode !== null}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setFloorPlanModalMode(null)}
      >
        <TouchableOpacity 
          style={styles.centerModalOverlay} 
          activeOpacity={1} 
          onPress={() => setFloorPlanModalMode(null)}
        >
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ width: '100%', alignItems: 'center' }}>
            <TouchableOpacity activeOpacity={1} onPress={() => {}} style={styles.centerModalContent}>
              <Text style={styles.centerModalTitle}>
                {floorPlanModalMode === 'add' ? 'Neuen Plan hinzufügen' : 'Plan bearbeiten'}
              </Text>
              <TextInput
                style={styles.centerModalInput}
                placeholder="Name (z.B. Erdgeschoss)"
                value={floorPlanModalName}
                onChangeText={setFloorPlanModalName}
                autoFocus={floorPlanModalMode === 'add'}
              />
              
              {floorPlanModalMode === 'edit' && (
                <>
                  <TouchableOpacity 
                    style={styles.actionBtnOutline} 
                    onPress={() => handleUploadPdfForFloorPlan(true)}
                  >
                    <Ionicons name="refresh" size={16} color="#007AFF" style={{ marginRight: 6 }} />
                    <Text style={styles.actionBtnOutlineText}>Neues PDF auswählen</Text>
                  </TouchableOpacity>

                  <TouchableOpacity 
                    style={[styles.actionBtnOutline, { borderColor: '#FF3B30', marginBottom: 0 }]} 
                    onPress={handleDeleteFloorPlan}
                  >
                    <Ionicons name="trash-outline" size={16} color="#FF3B30" style={{ marginRight: 6 }} />
                    <Text style={[styles.actionBtnOutlineText, { color: '#FF3B30' }]}>Plan löschen</Text>
                  </TouchableOpacity>
                </>
              )}

              <View style={[styles.centerModalActions, { marginTop: floorPlanModalMode === 'edit' ? 24 : 0 }]}>
                {isUploadingFile ? (
                  <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 12 }}>
                    <ActivityIndicator size="small" color="#007AFF" />
                    <Text style={{ marginTop: 6, fontSize: 14, color: '#007AFF', fontWeight: '500' }}>Lade Plan hoch...</Text>
                  </View>
                ) : (
                  <>
                    <TouchableOpacity style={styles.actionBtn} onPress={() => setFloorPlanModalMode(null)}>
                      <Text style={styles.cancelNoteText}>Abbrechen</Text>
                    </TouchableOpacity>
                    {floorPlanModalMode === 'add' ? (
                      <TouchableOpacity style={[styles.actionBtn, styles.saveNoteBtn]} onPress={() => handleUploadPdfForFloorPlan(false)}>
                        <Text style={styles.saveNoteText}>PDF auswählen</Text>
                      </TouchableOpacity>
                    ) : (
                      <TouchableOpacity style={[styles.actionBtn, styles.saveNoteBtn]} onPress={handleSaveFloorPlanName}>
                        <Text style={styles.saveNoteText}>Speichern</Text>
                      </TouchableOpacity>
                    )}
                  </>
                )}
              </View>
            </TouchableOpacity>
          </KeyboardAvoidingView>
        </TouchableOpacity>
      </Modal>

      {/* Marker Details Modal (bottom sheet) */}
      <Modal
        visible={selectedMarkerId !== null}
        animationType="slide"
        transparent={true}
        onRequestClose={handleCloseModal}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalOverlay}
        >
          <View style={styles.modalContent}>
            {/* Drag Handle */}
            <View style={styles.dragHandle} />

            {/* Header – Editable Marker Name */}
            <View style={styles.modalHeader}>
              {isEditingLabel ? (
                <TextInput
                  style={styles.labelInput}
                  value={labelDraft}
                  onChangeText={setLabelDraft}
                  autoFocus={true}
                  onBlur={handleSaveLabel}
                  onSubmitEditing={handleSaveLabel}
                  returnKeyType="done"
                  selectTextOnFocus={true}
                />
              ) : (
                <TouchableOpacity
                  style={styles.labelRow}
                  onPress={() => {
                    setLabelDraft(selectedMarker?.label ?? '');
                    setIsEditingLabel(true);
                  }}
                >
                  <Text style={styles.modalTitle}>
                    {selectedMarker?.label ?? 'Marker'}
                  </Text>
                  <Ionicons name="settings-sharp" size={16} color="#8E8E93" style={{ marginLeft: 8, marginTop: 3 }} />
                </TouchableOpacity>
              )}
              <TouchableOpacity onPress={handleCloseModal} style={styles.closeBtn}>
                <Ionicons name="close-circle" size={30} color="#C7C7CC" />
              </TouchableOpacity>
            </View>

            <Text style={styles.modalSubtitle}>
              Erstellt: {selectedMarker ? new Date(selectedMarker.createdAt).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''}
            </Text>

            {isUploadingFile && (
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#F2F2F7', padding: 10, borderRadius: 8, marginBottom: 12 }}>
                <ActivityIndicator size="small" color="#007AFF" style={{ marginRight: 8 }} />
                <Text style={{ fontSize: 14, color: '#007AFF', fontWeight: '500' }}>Datei wird hochgeladen...</Text>
              </View>
            )}

            {/* Action Grid */}
            <View style={styles.actionGrid} pointerEvents={isUploadingFile ? 'none' : 'auto'}>
              <TouchableOpacity style={[styles.gridBtn, isUploadingFile && { opacity: 0.5 }]} onPress={handleTakePhoto} disabled={isUploadingFile}>
                <Ionicons name="camera" size={22} color="#007AFF" />
                <Text style={styles.gridBtnText}>Kamera</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.gridBtn, isUploadingFile && { opacity: 0.5 }]} onPress={handlePickImage} disabled={isUploadingFile}>
                <Ionicons name="images" size={22} color="#007AFF" />
                <Text style={styles.gridBtnText}>Galerie</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.gridBtn, isUploadingFile && { opacity: 0.5 }]} onPress={() => setCameraModalVisible(true)} disabled={isUploadingFile}>
                <Ionicons name="globe-outline" size={22} color="#007AFF" />
                <Text style={styles.gridBtnText}>360° Cam</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.gridBtn, isUploadingFile && { opacity: 0.5 }]}
                onPress={() => { setIsAddingNote(true); setIsEditingLabel(false); }}
                disabled={isUploadingFile}
              >
                <Ionicons name="create" size={22} color="#007AFF" />
                <Text style={styles.gridBtnText}>Notiz</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.divider} />

            {/* Inline Note Input */}
            {isAddingNote && (
              <View style={styles.noteForm}>
                <TextInput
                  style={styles.noteInput}
                  placeholder="Notiz eingeben..."
                  value={noteText}
                  onChangeText={setNoteText}
                  multiline={true}
                  numberOfLines={3}
                  autoFocus={true}
                />
                <View style={styles.noteFormButtons}>
                  <TouchableOpacity
                    style={[styles.actionBtn, styles.cancelNoteBtn]}
                    onPress={() => { setIsAddingNote(false); setNoteText(''); }}
                  >
                    <Text style={styles.cancelNoteText}>Abbrechen</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.actionBtn, styles.saveNoteBtn]}
                    onPress={handleSaveNote}
                  >
                    <Text style={styles.saveNoteText}>Speichern</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* Media List */}
            <Text style={styles.sectionTitle}>
              Dokumentation ({selectedMarker?.media?.length ?? 0})
            </Text>

            <ScrollView
              style={styles.modalScrollBody}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {(!selectedMarker?.media || selectedMarker.media.length === 0) ? (
                <View style={styles.emptyMedia}>
                  <Ionicons name="images-outline" size={40} color="#C7C7CC" />
                  <Text style={styles.emptyText}>
                    Noch keine Fotos oder Notizen hinterlegt.{'\n'}Nutze die Buttons oben.
                  </Text>
                </View>
              ) : (
                <View style={styles.mediaList}>
                  {selectedMarker.media.map(item =>
                    renderMediaItem(item, selectedMarker.id)
                  )}
                </View>
              )}
              <View style={{ height: 20 }} />
            </ScrollView>

            {/* Footer */}
            <View style={styles.modalFooter}>
              <TouchableOpacity style={styles.moveMarkerBtn} onPress={handleStartMoveMarker}>
                <Ionicons name="move-outline" size={18} color="white" style={{ marginRight: 6 }} />
                <Text style={styles.moveMarkerBtnText}>Verschieben</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.deleteMarkerBtn} onPress={handleDeleteMarker}>
                <Ionicons name="trash-outline" size={18} color="white" style={{ marginRight: 6 }} />
                <Text style={styles.deleteMarkerBtnText}>Löschen</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Media Viewer Modal */}
      <Modal
        visible={viewingMedia !== null}
        animationType="fade"
        transparent={false}
        onRequestClose={() => setViewingMedia(null)}
      >
        <View style={styles.viewerContainer}>
          <View style={[styles.viewerHeader, { top: insets.top > 0 ? insets.top + 10 : (Platform.OS === 'ios' ? 50 : 20) }]}>
            <TouchableOpacity onPress={() => setViewingMedia(null)} style={styles.viewerCloseBtn}>
              <Ionicons name="chevron-down-circle" size={32} color="#ffffff" />
              <Text style={styles.viewerCloseText}>Schließen</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.viewerContent}>
            {viewingMedia?.type === 'photo' && (viewingMedia.localUri || viewingMedia.uri) && (
              <ImageViewer2D imageUrl={(viewingMedia.localUri || viewingMedia.uri)!} mediaId={viewingMedia.id} />
            )}
            {viewingMedia?.type === 'photo360' && (viewingMedia.localUri || viewingMedia.uri) && (
              <PanoramaViewer imageUrl={(viewingMedia.localUri || viewingMedia.uri)!} mediaId={viewingMedia.id} />
            )}
          </View>
        </View>
      </Modal>

      {/* Date Filter Modal */}
      <Modal
        visible={isFilterModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setIsFilterModalVisible(false)}
      >
        <TouchableOpacity 
          style={styles.centerModalOverlay} 
          activeOpacity={1} 
          onPress={() => setIsFilterModalVisible(false)}
        >
          <TouchableOpacity activeOpacity={1} style={styles.centerModalContent}>
            <Text style={styles.centerModalTitle}>Bilder filtern</Text>
            <Text style={{ fontSize: 14, color: '#8E8E93', marginBottom: 20 }}>
              Wähle einen Zeitraum, um nur die Bilder in diesem Bereich anzuzeigen.
            </Text>
            
            <View style={{ marginBottom: 16 }}>
              <Text style={{ fontSize: 14, color: '#3A3A3C', fontWeight: '600', marginBottom: 8 }}>Von (Startdatum)</Text>
              {Platform.OS === 'web' ? (
                <input 
                  type="date" 
                  style={{ padding: 10, borderWidth: 1, borderColor: '#D1D1D6', borderRadius: 8, fontSize: 16 }} 
                  value={filterStartDate ? filterStartDate.toISOString().split('T')[0] : ''} 
                  onChange={(e) => setFilterStartDate(e.target.value ? new Date(e.target.value) : null)} 
                />
              ) : (
                <>
                  {Platform.OS === 'android' && (
                    <TouchableOpacity style={[styles.actionBtnOutline, { marginBottom: 0 }]} onPress={() => setShowStartPicker(true)}>
                      <Ionicons name="calendar-outline" size={18} color="#007AFF" style={{ marginRight: 8 }} />
                      <Text style={styles.actionBtnOutlineText}>{filterStartDate ? filterStartDate.toLocaleDateString() : 'Startdatum wählen'}</Text>
                    </TouchableOpacity>
                  )}
                  {(Platform.OS === 'ios' || showStartPicker) && (
                    <DateTimePicker
                      value={filterStartDate || new Date()}
                      mode="date"
                      display={Platform.OS === 'ios' ? 'default' : 'default'}
                      onValueChange={(event, date) => { 
                        if (Platform.OS === 'android') setShowStartPicker(false);
                        if (date) setFilterStartDate(date); 
                      }}
                      onDismiss={() => {
                        if (Platform.OS === 'android') setShowStartPicker(false);
                      }}
                    />
                  )}
                </>
              )}
            </View>

            <View style={{ marginBottom: 24 }}>
              <Text style={{ fontSize: 14, color: '#3A3A3C', fontWeight: '600', marginBottom: 8 }}>Bis (Enddatum)</Text>
              {Platform.OS === 'web' ? (
                <input 
                  type="date" 
                  style={{ padding: 10, borderWidth: 1, borderColor: '#D1D1D6', borderRadius: 8, fontSize: 16 }} 
                  value={filterEndDate ? filterEndDate.toISOString().split('T')[0] : ''} 
                  onChange={(e) => setFilterEndDate(e.target.value ? new Date(e.target.value) : null)} 
                />
              ) : (
                <>
                  {Platform.OS === 'android' && (
                    <TouchableOpacity style={[styles.actionBtnOutline, { marginBottom: 0 }]} onPress={() => setShowEndPicker(true)}>
                      <Ionicons name="calendar-outline" size={18} color="#007AFF" style={{ marginRight: 8 }} />
                      <Text style={styles.actionBtnOutlineText}>{filterEndDate ? filterEndDate.toLocaleDateString() : 'Enddatum wählen'}</Text>
                    </TouchableOpacity>
                  )}
                  {(Platform.OS === 'ios' || showEndPicker) && (
                    <DateTimePicker
                      value={filterEndDate || new Date()}
                      mode="date"
                      display={Platform.OS === 'ios' ? 'default' : 'default'}
                      onValueChange={(event, date) => { 
                        if (Platform.OS === 'android') setShowEndPicker(false);
                        if (date) setFilterEndDate(date); 
                      }}
                      onDismiss={() => {
                        if (Platform.OS === 'android') setShowEndPicker(false);
                      }}
                    />
                  )}
                </>
              )}
            </View>

            <View style={styles.centerModalActions}>
              <TouchableOpacity 
                style={[styles.actionBtn, styles.cancelNoteBtn, { flex: 1, alignItems: 'center' }]} 
                onPress={() => { setFilterStartDate(null); setFilterEndDate(null); setIsFilterModalVisible(false); }}
              >
                <Text style={styles.cancelNoteText}>Zurücksetzen</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.actionBtn, styles.saveNoteBtn, { flex: 1, alignItems: 'center' }]} 
                onPress={() => setIsFilterModalVisible(false)}
              >
                <Text style={styles.saveNoteText}>Anwenden</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      <CameraCaptureModal
        visible={cameraModalVisible}
        onClose={() => setCameraModalVisible(false)}
        onPhotoCaptured={handle360PhotoCaptured}
      />
      {/* Report Preview Modal */}
      <Modal
        visible={isPreviewVisible}
        animationType="slide"
        transparent={false}
        onRequestClose={() => setIsPreviewVisible(false)}
      >
        <View style={styles.previewModalContainer}>
          <View style={styles.previewModalHeader}>
            <TouchableOpacity onPress={() => setIsPreviewVisible(false)} style={styles.closeBtn}>
              <Ionicons name="close" size={26} color="#007AFF" />
            </TouchableOpacity>
            <Text style={styles.previewModalTitle}>Berichtsvorschau</Text>
            <TouchableOpacity onPress={handlePrintReport} style={styles.closeBtn}>
              <Ionicons name="print-outline" size={24} color="#007AFF" />
            </TouchableOpacity>
          </View>
          
          <View style={{ flex: 1 }}>
            {previewHtml ? (
              <View style={{ flex: 1, position: 'relative' }}>
                {Platform.OS === 'web' ? (
                  <iframe
                    srcDoc={previewHtml}
                    style={{ width: '100%', height: '100%', border: 'none', backgroundColor: '#ffffff' }}
                    title="Berichtsvorschau"
                  />
                ) : (
                  <WebView
                    source={{ html: previewHtml }}
                    style={styles.previewWebview}
                    originWhitelist={['*']}
                    javaScriptEnabled={true}
                    allowFileAccess={true}
                    allowFileAccessFromFileURLs={true}
                    allowUniversalAccessFromFileURLs={true}
                    startInLoadingState={true}
                    renderLoading={() => (
                      <View style={StyleSheet.absoluteFill}>
                        <ActivityIndicator size="large" color="#007AFF" style={{ flex: 1 }} />
                      </View>
                    )}
                  />
                )}
              </View>
            ) : (
              <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F2F2F7' }}>
                <ActivityIndicator size="large" color="#007AFF" />
                <Text style={{ marginTop: 12, fontSize: 16, color: '#8E8E93', fontWeight: '500' }}>
                  Generiere Berichtsvorschau...
                </Text>
              </View>
            )}
          </View>

          <View style={styles.previewModalFooter}>
            <TouchableOpacity style={styles.previewBtnClose} onPress={() => setIsPreviewVisible(false)}>
              <Text style={styles.previewBtnCloseText}>Schließen</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.previewBtnShare} onPress={handleShareReport} disabled={exportingPdf}>
              {exportingPdf ? (
                <ActivityIndicator size="small" color="white" />
              ) : (
                <>
                  <Ionicons name="share-outline" size={20} color="white" />
                  <Text style={styles.previewBtnShareText}>PDF Teilen</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
      {exportingPdf && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#5E5CE6" style={{ marginBottom: 16 }} />
          <Text style={styles.loadingOverlayText}>PDF-Bericht wird erstellt...</Text>
          {conversionProgress ? (
            <Text style={styles.loadingOverlaySubText}>
              Bild {conversionProgress.current} von {conversionProgress.total} wird optimiert...
            </Text>
          ) : (
            <Text style={styles.loadingOverlaySubText}>Bilder werden konvertiert</Text>
          )}
        </View>
      )}

      {/* Share Menu Modal */}
      <Modal visible={isShareMenuVisible} transparent animationType="fade">
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setIsShareMenuVisible(false)}>
          <View style={styles.modalContent}>
            <View style={[styles.modalHeader, { marginTop: 16 }]}>
              <Text style={styles.modalTitle}>Projekt teilen</Text>
              <TouchableOpacity onPress={() => setIsShareMenuVisible(false)} style={styles.closeBtn}>
                <Ionicons name="close-circle" size={26} color="#C7C7CC" />
              </TouchableOpacity>
            </View>

            <Text style={styles.modalSubtitle}>Wie möchtest du dieses Projekt weitergeben?</Text>

            {(filterStartDate || filterEndDate) && (
              <View style={{ backgroundColor: '#FFF9C4', padding: 12, borderRadius: 8, marginVertical: 8, flexDirection: 'row', alignItems: 'center' }}>
                <Ionicons name="warning" size={20} color="#F57F17" style={{ marginRight: 8 }} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: '#F57F17', fontSize: 13, fontWeight: 'bold' }}>
                    Datumsfilter aktiv
                  </Text>
                  <Text style={{ color: '#F57F17', fontSize: 12, marginTop: 2 }}>
                    Alle Exporte (PDF & ZIP) beinhalten aktuell nur Bilder aus dem gewählten Zeitraum!
                  </Text>
                </View>
              </View>
            )}

            <TouchableOpacity 
              style={[styles.mediaItemPhotoCard, { marginVertical: 6, padding: 14 }]} 
              onPress={() => { setIsShareMenuVisible(false); handleExportPdf(); }}
            >
              <Ionicons name="document-text-outline" size={24} color="#007AFF" />
              <View style={styles.mediaItemInfo}>
                <Text style={{ fontSize: 16, fontWeight: '600', color: '#1C1C1E' }}>Als PDF-Bericht exportieren</Text>
                <Text style={styles.mediaItemMeta}>Lokales PDF-Dokument erzeugen</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.mediaItemPhotoCard, { marginVertical: 6, padding: 14 }]} 
              onPress={() => { setIsShareMenuVisible(false); handleShareProjectLink(); }}
            >
              <Ionicons name="link-outline" size={24} color="#007AFF" />
              <View style={styles.mediaItemInfo}>
                <Text style={{ fontSize: 16, fontWeight: '600', color: '#1C1C1E' }}>Bauherren-Link teilen</Text>
                <Text style={styles.mediaItemMeta}>Interaktive Web-Ansicht (nur Premium)</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.mediaItemPhotoCard, { marginVertical: 6, padding: 14 }]} 
              onPress={handleDownloadImagesAsZip}
            >
              <Ionicons name="download-outline" size={24} color="#007AFF" />
              <View style={styles.mediaItemInfo}>
                <Text style={{ fontSize: 16, fontWeight: '600', color: '#1C1C1E' }}>Bilder als ZIP exportieren</Text>
                <Text style={styles.mediaItemMeta}>Gesammelte Bilder herunterladen</Text>
              </View>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Zipping Progress Modal */}
      <Modal visible={isZipping} transparent animationType="fade">
        <View style={styles.centerModalOverlay}>
          <View style={[styles.centerModalContent, { alignItems: 'center', paddingVertical: 40 }]}>
            <ActivityIndicator size="large" color="#007AFF" style={{ marginBottom: 20 }} />
            <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#1C1C1E' }}>
              {zipProgress ? 'Bilder werden geladen...' : 'Bilder werden verpackt...'}
            </Text>
            {zipProgress && (
              <Text style={{ fontSize: 14, color: '#8E8E93', marginTop: 10 }}>
                Verarbeite Bild {zipProgress.current} von {zipProgress.total}
              </Text>
            )}
          </View>
        </View>
      </Modal>

      {confirmConfig && (
        <ConfirmModal
          visible={confirmConfig.visible}
          title={confirmConfig.title}
          message={confirmConfig.message}
          confirmText={confirmConfig.confirmText}
          isDestructive={confirmConfig.isDestructive}
          onConfirm={confirmConfig.onConfirm}
          onCancel={() => setConfirmConfig(null)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F2F2F7',
  },
  errorText: {
    fontSize: 18,
    color: '#FF3B30',
    textAlign: 'center',
    marginTop: 50,
  },
  content: {
    flex: 1,
  },
  uploadContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  uploadText: {
    fontSize: 18,
    color: '#8E8E93',
    marginVertical: 16,
  },
  uploadButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  uploadButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: 'white',
    borderRadius: 24,
    width: '90%',
    maxWidth: 640,
    maxHeight: '85%',
    paddingHorizontal: 20,
    paddingBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 10,
  },
  dragHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#D1D1D6',
    alignSelf: 'center',
    marginTop: 12,
    marginBottom: 16,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    paddingRight: 8,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#1C1C1E',
    flexShrink: 1,
  },
  labelInput: {
    flex: 1,
    fontSize: 22,
    fontWeight: 'bold',
    color: '#1C1C1E',
    borderBottomWidth: 2,
    borderBottomColor: '#007AFF',
    paddingBottom: 2,
    marginRight: 8,
  },
  closeBtn: {
    padding: 4,
  },
  modalSubtitle: {
    fontSize: 13,
    color: '#8E8E93',
    marginBottom: 16,
  },
  actionGrid: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  gridBtn: {
    flex: 1,
    backgroundColor: '#F2F2F7',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: '#E5E5EA',
  },
  gridBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#007AFF',
  },
  divider: {
    height: 1,
    backgroundColor: '#E5E5EA',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#3A3A3C',
    marginBottom: 10,
  },
  modalScrollBody: {
    flexGrow: 0,
  },
  emptyMedia: {
    alignItems: 'center',
    paddingVertical: 24,
    gap: 10,
  },
  emptyText: {
    fontSize: 14,
    color: '#8E8E93',
    textAlign: 'center',
    lineHeight: 20,
  },
  mediaList: {
    gap: 10,
  },
  mediaItemPhotoCard: {
    flexDirection: 'row',
    backgroundColor: '#F2F2F7',
    borderRadius: 10,
    padding: 8,
    alignItems: 'center',
  },
  mediaPhoto: {
    width: 56,
    height: 56,
    borderRadius: 8,
    backgroundColor: '#C7C7CC',
  },
  mediaItemInfo: {
    flex: 1,
    marginLeft: 10,
    justifyContent: 'center',
  },
  mediaItemMeta: {
    fontSize: 12,
    color: '#8E8E93',
    marginTop: 4,
  },
  mediaItemNoteCard: {
    flexDirection: 'row',
    backgroundColor: '#E5F1FF',
    borderRadius: 10,
    padding: 12,
    alignItems: 'center',
  },
  mediaNoteText: {
    fontSize: 15,
    color: '#1C1C1E',
    lineHeight: 20,
  },
  deleteMediaButton: {
    padding: 8,
  },
  noteForm: {
    backgroundColor: '#F2F2F7',
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
  },
  noteInput: {
    backgroundColor: 'white',
    borderRadius: 8,
    padding: 10,
    fontSize: 15,
    textAlignVertical: 'top',
    minHeight: 72,
    borderWidth: 1,
    borderColor: '#E5E5EA',
  },
  noteFormButtons: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 10,
    gap: 10,
  },
  actionBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
  },
  cancelNoteBtn: {
    backgroundColor: '#E5E5EA',
  },
  cancelNoteText: {
    color: '#3A3A3C',
    fontWeight: '600',
  },
  saveNoteBtn: {
    backgroundColor: '#007AFF',
  },
  saveNoteText: {
    color: 'white',
    fontWeight: '600',
  },
  modalFooter: {
    borderTopWidth: 1,
    borderTopColor: '#E5E5EA',
    paddingTop: 14,
    marginTop: 4,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
  },
  deleteMarkerBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FF3B30',
    paddingVertical: 12,
    borderRadius: 24,
  },
  deleteMarkerBtnText: {
    color: 'white',
    fontSize: 15,
    fontWeight: '600',
  },
  moveMarkerBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#007AFF',
    paddingVertical: 12,
    borderRadius: 24,
  },
  moveMarkerBtnText: {
    color: 'white',
    fontSize: 15,
    fontWeight: '600',
  },
  mediaThumbnailContainer: {
    position: 'relative',
  },
  icon360Badge: {
    position: 'absolute',
    bottom: -4,
    right: -4,
    backgroundColor: '#007AFF',
    borderRadius: 12,
    padding: 2,
    borderWidth: 2,
    borderColor: '#F2F2F7',
  },
  viewerContainer: {
    flex: 1,
    backgroundColor: '#000',
  },
  viewerHeader: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 50 : 20,
    left: 20,
    zIndex: 100,
  },
  viewerCloseBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingRight: 12,
    borderRadius: 20,
  },
  viewerCloseText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 6,
  },
  viewerContent: {
    flex: 1,
  },
  floorPlanTabs: {
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
    height: 50,
  },
  tabsScrollContent: {
    alignItems: 'center',
    paddingHorizontal: 12,
    gap: 8,
  },
  tabBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#F2F2F7',
    flexDirection: 'row',
    alignItems: 'center',
  },
  activeTabBtn: {
    backgroundColor: '#007AFF',
  },
  tabBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#8E8E93',
  },
  activeTabBtnText: {
    color: 'white',
  },
  addPlanBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#007AFF',
    borderStyle: 'dashed',
    backgroundColor: '#E5F1FF',
    gap: 4,
  },
  addPlanBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#007AFF',
  },
  updatePdfBtn: {
    position: 'absolute',
    top: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    gap: 6,
  },
  updatePdfBtnText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '600',
  },
  uploadSubText: {
    fontSize: 14,
    color: '#8E8E93',
    marginTop: 4,
  },
  centerModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  centerModalContent: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 24,
    width: '85%',
    maxWidth: 400,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 5,
  },
  centerModalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 16,
    color: '#1C1C1E',
  },
  centerModalInput: {
    borderWidth: 1,
    borderColor: '#D1D1D6',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    marginBottom: 20,
  },
  centerModalActions: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
  },
  actionBtnOutline: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    borderWidth: 1,
    borderColor: '#007AFF',
    borderRadius: 8,
    marginBottom: 8,
  },
  actionBtnOutlineText: {
    color: '#007AFF',
    fontWeight: '600',
    fontSize: 16,
  },
  previewModalContainer: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  previewModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 50 : 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
    backgroundColor: '#F2F2F7',
  },
  previewModalTitle: {
    fontSize: 17,
    fontWeight: 'bold',
    color: '#1C1C1E',
  },
  previewWebview: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  previewModalFooter: {
    paddingBottom: Platform.OS === 'ios' ? 34 : 20,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#E5E5EA',
    backgroundColor: '#F2F2F7',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
  },
  previewBtnShare: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
    flexDirection: 'row',
    alignItems: 'center',
  },
  previewBtnShareText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 15,
    marginLeft: 6,
  },
  previewBtnClose: {
    backgroundColor: '#E5E5EA',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
  },
  previewBtnCloseText: {
    color: '#3A3A3C',
    fontWeight: 'bold',
    fontSize: 15,
  },
  loadingOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 9999,
  },
  loadingOverlayText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
    marginTop: 16,
  },
  loadingOverlaySubText: {
    color: '#AEAEB2',
    fontSize: 14,
    marginTop: 6,
  },
  bannerContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: '#1C1C1E',
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#2C2C2E',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  bannerText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
    marginRight: 12,
  },
  bannerActions: {
    flexDirection: 'row',
    gap: 8,
  },
  bannerBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  bannerBtnCancel: {
    backgroundColor: '#3A3A3C',
  },
  bannerBtnSave: {
    backgroundColor: '#5E5CE6',
  },
  bannerBtnTextCancel: {
    color: '#E5E5EA',
    fontSize: 12,
    fontWeight: '600',
  },
  bannerBtnTextSave: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  hintOverlayContainer: {
    position: 'absolute',
    bottom: 16,
    left: 16,
    right: 92,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 12,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 4,
    borderWidth: 1,
    borderColor: '#E5E5EA',
    zIndex: 10,
  },
  hintOverlayText: {
    flex: 1,
    fontSize: 13,
    color: '#3A3A3C',
    fontWeight: '500',
    lineHeight: 18,
  },
  addMarkerFloatingBtn: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    backgroundColor: '#5E5CE6',
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 6,
    zIndex: 10,
  },
});
