import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  ScrollView,
  Image,
  Platform,
} from 'react-native';
import { useLocalSearchParams, Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { Project, Marker } from '../../store/useProjectStore';
import PdfViewer from '../../components/PdfViewer';
import PanoramaViewer from '../../components/PanoramaViewer';
import ImageViewer2D from '../../components/ImageViewer2D';
import { Ionicons } from '@expo/vector-icons';

export default function ShareViewScreen() {
  const { id, token } = useLocalSearchParams<{ id: string; token?: string }>();
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [project, setProject] = useState<Project | null>(null);
  const [markers, setMarkers] = useState<Marker[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [activePlanId, setActivePlanId] = useState<string | null>(null);

  // Modal / Viewer states (read-only views)
  const [selectedMarkerId, setSelectedMarkerId] = useState<string | null>(null);
  const [viewerPhotoUri, setViewerPhotoUri] = useState<string | null>(null);
  const [viewer360Uri, setViewer360Uri] = useState<string | null>(null);

  useEffect(() => {
    async function loadSharedProject() {
      if (!id || !token) {
        setErrorMsg('Ungültiger Freigabelink. Fehlende Parameter.');
        setLoading(false);
        return;
      }

      try {
        // 1. Fetch Project Doc
        const projectDocRef = doc(db, 'projects', id);
        const projectSnapshot = await getDoc(projectDocRef);

        if (!projectSnapshot.exists()) {
          setErrorMsg('Das angeforderte Projekt existiert nicht.');
          setLoading(false);
          return;
        }

        const projectData = projectSnapshot.data();

        // 2. Validate Token and Share Status
        if (!projectData.isShared || projectData.shareToken !== token) {
          setErrorMsg('Zugriff verweigert. Dieser Freigabelink ist ungültig oder wurde deaktiviert.');
          setLoading(false);
          return;
        }

        const loadedProject: Project = {
          id: projectData.id,
          name: projectData.name,
          date: projectData.date,
          floorPlans: projectData.floorPlans || [],
        };

        setProject(loadedProject);

        // Auto-select first floor plan
        if (loadedProject.floorPlans.length > 0) {
          setActivePlanId(loadedProject.floorPlans[0].id);
        }

        // 3. Fetch Markers
        const markersQuery = query(collection(db, 'markers'), where('projectId', '==', id));
        const markersSnapshot = await getDocs(markersQuery);
        const markersList: Marker[] = [];
        
        markersSnapshot.forEach((doc) => {
          const data = doc.data();
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

        setMarkers(markersList);
      } catch (err: any) {
        console.error('Error loading shared project:', err);
        setErrorMsg('Fehler beim Laden des Projekts: ' + (err.message || err));
      } finally {
        setLoading(false);
      }
    }

    loadSharedProject();
  }, [id, token]);

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Projekt wird geladen...</Text>
      </View>
    );
  }

  if (errorMsg || !project) {
    return (
      <View style={styles.centerContainer}>
        <Ionicons name="alert-circle-outline" size={64} color="#FF3B30" />
        <Text style={styles.errorTitle}>Zugriff nicht möglich</Text>
        <Text style={styles.errorText}>{errorMsg}</Text>
      </View>
    );
  }

  const activeFloorPlan = project.floorPlans.find((fp) => fp.id === activePlanId);
  const selectedMarker = markers.find((m) => m.id === selectedMarkerId);

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: `${project.name} (Freigabe)`,
          headerLeft: () => null, // Hide back button as this is an independent web view for the client
        }}
      />

      {/* Floor Plan Selector tabs if there are multiple plans */}
      {project.floorPlans.length > 1 && (
        <View style={styles.planSelectorWrapper}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.planTabsContainer}>
            {project.floorPlans.map((fp) => (
              <TouchableOpacity
                key={fp.id}
                style={[styles.planTab, activePlanId === fp.id && styles.planTabActive]}
                onPress={() => {
                  setActivePlanId(fp.id);
                  setSelectedMarkerId(null);
                }}
              >
                <Ionicons
                  name="map-outline"
                  size={16}
                  color={activePlanId === fp.id ? '#FFFFFF' : '#007AFF'}
                  style={{ marginRight: 6 }}
                />
                <Text style={[styles.planTabText, activePlanId === fp.id && styles.planTabTextActive]}>
                  {fp.name}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Main Floor Plan Map Viewer */}
      <View style={styles.viewerWrapper}>
        {activeFloorPlan ? (
          <PdfViewer
            projectId={project.id}
            floorPlanId={activeFloorPlan.id}
            pdfUri={activeFloorPlan.pdfUrl}
            onMarkerClick={(markerId) => setSelectedMarkerId(markerId)}
            overrideMarkers={markers}
          />
        ) : (
          <View style={styles.centerContainer}>
            <Text style={styles.noPlansText}>Dieses Projekt enthält noch keine Grundriss-Pläne.</Text>
          </View>
        )}
      </View>

      {/* READ-ONLY MARKER DETAILS BOTTOM DRAWER */}
      {selectedMarker && (
        <View style={styles.drawerContainer}>
          <View style={styles.drawerHeader}>
            <Ionicons name="location" size={20} color="#5E5CE6" style={{ marginRight: 8 }} />
            <Text style={styles.drawerTitle} numberOfLines={1}>{selectedMarker.label}</Text>
            <TouchableOpacity style={styles.closeDrawerBtn} onPress={() => setSelectedMarkerId(null)}>
              <Ionicons name="close-circle" size={24} color="#8E8E93" />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.drawerContent} contentContainerStyle={{ paddingBottom: 24 }}>
            {/* Notes List */}
            <Text style={styles.drawerSectionTitle}>Notizen & Kommentare</Text>
            {selectedMarker.media.filter((item) => item.type === 'note').length === 0 ? (
              <Text style={styles.noNotesText}>Keine Notizen zu diesem Standort vorhanden.</Text>
            ) : (
              selectedMarker.media
                .filter((item) => item.type === 'note')
                .map((note) => (
                  <View key={note.id} style={styles.noteItem}>
                    <Text style={styles.noteText}>{note.text}</Text>
                    <Text style={styles.noteDate}>
                      {new Date(note.createdAt).toLocaleDateString('de-DE')}
                    </Text>
                  </View>
                ))
            )}

            {/* Photos & 360 Grid */}
            <Text style={[styles.drawerSectionTitle, { marginTop: 20 }]}>Fotodokumentation</Text>
            {selectedMarker.media.filter((item) => item.type === 'photo' || item.type === 'photo360').length === 0 ? (
              <Text style={styles.noNotesText}>Keine Fotos zu diesem Standort hochgeladen.</Text>
            ) : (
              <View style={styles.photoGrid}>
                {selectedMarker.media
                  .filter((item) => item.type === 'photo' || item.type === 'photo360')
                  .map((photo) => (
                    <TouchableOpacity
                      key={photo.id}
                      style={styles.photoThumbnailCard}
                      onPress={() => {
                        if (photo.type === 'photo360') {
                          setViewer360Uri(photo.uri || null);
                        } else {
                          setViewerPhotoUri(photo.uri || null);
                        }
                      }}
                    >
                      <Image source={{ uri: photo.uri }} style={styles.thumbnailImg} />
                      <View style={styles.photoTypeBadge}>
                        <Ionicons
                          name={photo.type === 'photo360' ? 'globe-outline' : 'camera-outline'}
                          size={14}
                          color="#FFFFFF"
                          style={{ marginRight: 4 }}
                        />
                        <Text style={styles.photoTypeBadgeText}>
                          {photo.type === 'photo360' ? '360°' : 'Foto'}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  ))}
              </View>
            )}
          </ScrollView>
        </View>
      )}

      {/* 360 Panorama Viewer Overlay */}
      <Modal visible={viewer360Uri !== null} animationType="fade" transparent={false} onRequestClose={() => setViewer360Uri(null)}>
        <View style={styles.viewerContainer}>
          <View style={[styles.viewerHeader, { top: insets.top > 0 ? insets.top + 10 : (Platform.OS === 'ios' ? 50 : 20) }]}>
            <TouchableOpacity onPress={() => setViewer360Uri(null)} style={styles.viewerCloseBtn}>
              <Ionicons name="chevron-down-circle" size={32} color="#ffffff" />
              <Text style={styles.viewerCloseText}>Schließen</Text>
            </TouchableOpacity>
          </View>
          {viewer360Uri && (
            <PanoramaViewer imageUrl={viewer360Uri} mediaId="shared-360" />
          )}
        </View>
      </Modal>

      {/* 2D Photo Fullscreen Viewer Overlay */}
      <Modal visible={viewerPhotoUri !== null} animationType="fade" transparent={false} onRequestClose={() => setViewerPhotoUri(null)}>
        <View style={styles.viewerContainer}>
          <View style={[styles.viewerHeader, { top: insets.top > 0 ? insets.top + 10 : (Platform.OS === 'ios' ? 50 : 20) }]}>
            <TouchableOpacity onPress={() => setViewerPhotoUri(null)} style={styles.viewerCloseBtn}>
              <Ionicons name="chevron-down-circle" size={32} color="#ffffff" />
              <Text style={styles.viewerCloseText}>Schließen</Text>
            </TouchableOpacity>
          </View>
          {viewerPhotoUri && (
            <ImageViewer2D imageUrl={viewerPhotoUri} mediaId="shared-2d" />
          )}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F2F2F7',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: '#F2F2F7',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#8E8E93',
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1C1C1E',
    marginTop: 16,
    marginBottom: 8,
  },
  errorText: {
    fontSize: 14,
    color: '#8E8E93',
    textAlign: 'center',
    lineHeight: 20,
  },
  planSelectorWrapper: {
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
    paddingVertical: 8,
  },
  planTabsContainer: {
    paddingHorizontal: 16,
    gap: 8,
  },
  planTab: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: '#E5F1FF',
    borderWidth: 1,
    borderColor: '#007AFF',
  },
  planTabActive: {
    backgroundColor: '#007AFF',
  },
  planTabText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#007AFF',
  },
  planTabTextActive: {
    color: '#FFFFFF',
  },
  viewerWrapper: {
    flex: 1,
    position: 'relative',
  },
  viewerContainer: {
    flex: 1,
    backgroundColor: '#000',
  },
  viewerHeader: {
    position: 'absolute',
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
  noPlansText: {
    fontSize: 16,
    color: '#8E8E93',
    textAlign: 'center',
  },
  drawerContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '45%',
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 10,
    zIndex: 100,
  },
  drawerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  drawerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1C1C1E',
    flex: 1,
  },
  closeDrawerBtn: {
    padding: 4,
  },
  drawerContent: {
    flex: 1,
    padding: 16,
  },
  drawerSectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#8E8E93',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  noNotesText: {
    fontSize: 14,
    color: '#AEAeb2',
    fontStyle: 'italic',
  },
  noteItem: {
    backgroundColor: '#F2F2F7',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
  },
  noteText: {
    fontSize: 15,
    color: '#1C1C1E',
    lineHeight: 20,
  },
  noteDate: {
    fontSize: 11,
    color: '#8E8E93',
    marginTop: 6,
    alignSelf: 'flex-end',
  },
  photoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 6,
  },
  photoThumbnailCard: {
    width: (Platform.OS === 'web' ? 120 : 90),
    height: (Platform.OS === 'web' ? 120 : 90),
    borderRadius: 8,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: '#F2F2F7',
    borderWidth: 1,
    borderColor: '#E5E5EA',
  },
  thumbnailImg: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  photoTypeBadge: {
    position: 'absolute',
    bottom: 4,
    left: 4,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 4,
    paddingVertical: 2,
    paddingHorizontal: 6,
    flexDirection: 'row',
    alignItems: 'center',
  },
  photoTypeBadgeText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: 'bold',
  },
});
