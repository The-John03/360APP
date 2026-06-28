import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, LayoutChangeEvent, GestureResponderEvent } from 'react-native';
import { useProjectStore } from '../store/useProjectStore';
import { Ionicons } from '@expo/vector-icons';

type Props = {
  projectId: string;
  floorPlanId: string;
};

export default function PdfViewerSkeleton({ projectId, floorPlanId }: Props) {
  const { markers, addMarker } = useProjectStore();
  const projectMarkers = markers.filter(m => m.projectId === projectId && m.floorPlanId === floorPlanId);
  
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  const handleLayout = (e: LayoutChangeEvent) => {
    setDimensions({
      width: e.nativeEvent.layout.width,
      height: e.nativeEvent.layout.height,
    });
  };

  const handlePress = (e: GestureResponderEvent) => {
    if (dimensions.width === 0 || dimensions.height === 0) return;
    
    // Calculate relative coordinates (0.0 to 1.0)
    const x = e.nativeEvent.locationX / dimensions.width;
    const y = e.nativeEvent.locationY / dimensions.height;
    
    addMarker(projectId, floorPlanId, x, y);
  };

  return (
    <View style={styles.container}>
      <Pressable style={styles.pdfMock} onLayout={handleLayout} onPress={handlePress}>
        <View style={styles.mockContent}>
          <Ionicons name="document-text-outline" size={64} color="#C7C7CC" />
          <Text style={styles.mockText}>PDF Plan Platzhalter</Text>
          <Text style={styles.mockSubText}>Tippe auf eine beliebige Stelle, um einen Marker zu setzen</Text>
        </View>

        {/* Render Markers */}
        {projectMarkers.map((marker) => (
          <View
            key={marker.id}
            style={[
              styles.markerContainer,
              {
                // Position relative to dimensions
                left: marker.x * dimensions.width,
                top: marker.y * dimensions.height,
              }
            ]}
          >
            {/* Center the pin horizontally and place the bottom at the tapped Y coordinate */}
            <Ionicons 
              name="location" 
              size={32} 
              color="#FF3B30" 
              style={{ transform: [{ translateX: -16 }, { translateY: -32 }] }} 
            />
          </View>
        ))}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  pdfMock: {
    flex: 1,
    backgroundColor: '#E5E5EA',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#D1D1D6',
    borderStyle: 'dashed',
    overflow: 'hidden',
    position: 'relative',
  },
  mockContent: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  mockText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#8E8E93',
    marginTop: 16,
  },
  mockSubText: {
    fontSize: 14,
    color: '#AEAEB2',
    marginTop: 8,
    textAlign: 'center',
  },
  markerContainer: {
    position: 'absolute',
    width: 0,
    height: 0,
  },
});
