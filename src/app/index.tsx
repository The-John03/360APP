import React, { useState, useEffect, useRef } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, TextInput, KeyboardAvoidingView, Platform, Modal, Alert, Keyboard, LayoutAnimation } from 'react-native';
import { useRouter, Stack } from 'expo-router';
import { useProjectStore } from '../store/useProjectStore';
import { Ionicons } from '@expo/vector-icons';
import { PurchaseService } from '../services/purchaseService';
import { ConfirmModal } from '../components/ConfirmModal';

export default function DashboardScreen() {
  const router = useRouter();
  const { 
    projects, 
    addProject, 
    deleteProject, 
    renameProject, 
    toggleFavoriteProject,
    user,
    isPremiumUser,
    setPremiumUser
  } = useProjectStore();
  const [newProjectName, setNewProjectName] = useState('');
  const newProjectInputRef = useRef<TextInput>(null);
  
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [editingProjectName, setEditingProjectName] = useState('');
  const [sortType, setSortType] = useState<'date' | 'alpha'>('date');
  const [sortMenuVisible, setSortMenuVisible] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  const [confirmConfig, setConfirmConfig] = useState<{
    visible: boolean;
    title: string;
    message: string;
    confirmText?: string;
    isDestructive?: boolean;
    onConfirm: () => void;
  } | null>(null);

  const handleOpenSettings = () => {
    router.push('/settings');
  };

  useEffect(() => {
    if (Platform.OS === 'ios') return;

    const showSubscription = Keyboard.addListener('keyboardDidShow', (e) => {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setKeyboardHeight(e.endCoordinates.height);
    });
    const hideSubscription = Keyboard.addListener('keyboardDidHide', () => {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setKeyboardHeight(0);
    });

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  const editingProject = projects.find(p => p.id === editingProjectId);

  const sortedProjects = [...projects].sort((a, b) => {
    if (a.isFavorite && !b.isFavorite) return -1;
    if (!a.isFavorite && b.isFavorite) return 1;

    if (sortType === 'alpha') {
      return a.name.localeCompare(b.name);
    } else {
      return new Date(b.date).getTime() - new Date(a.date).getTime();
    }
  });

  // Filter projects: cost-free users only see the Musterprojekt (ID: '1')
  const visibleProjects = isPremiumUser 
    ? sortedProjects 
    : sortedProjects.filter(p => p.id === '1');

  const handleCreateProject = async () => {
    if (newProjectName.trim() === '') {
      newProjectInputRef.current?.focus();
      return;
    }

    if (!user) {
      Alert.alert(
        'Anmeldung erforderlich',
        'Du musst angemeldet sein, um eigene Projekte zu erstellen. Möchtest du dich jetzt registrieren oder anmelden?',
        [
          { text: 'Abbrechen', style: 'cancel' },
          { text: 'Anmelden', onPress: () => router.push('/login') }
        ]
      );
      return;
    }

    if (!isPremiumUser) {
      Alert.alert(
        'Premium-Abo erforderlich',
        'Das Erstellen eigener Projekte ist nur für Premium-Mitglieder möglich. Möchtest du Premium jetzt erwerben?',
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

    addProject(newProjectName.trim());
    setNewProjectName('');
  };

  const handleRenameProject = () => {
    if (editingProjectId && editingProjectName.trim() !== '') {
      renameProject(editingProjectId, editingProjectName.trim());
      setEditingProjectId(null);
    }
  };

  const handleDeleteProject = () => {
    if (editingProjectId) {
      setConfirmConfig({
        visible: true,
        title: 'Projekt löschen',
        message: 'Bist du sicher, dass du dieses Projekt wirklich löschen möchtest? Das kann nicht rückgängig gemacht werden.',
        confirmText: 'Löschen',
        isDestructive: true,
        onConfirm: () => {
          deleteProject(editingProjectId);
          setEditingProjectId(null);
          setConfirmConfig(null);
        }
      });
    }
  };

  const renderItem = ({ item }: { item: any }) => (
    <TouchableOpacity
      style={styles.projectCard}
      onPress={() => router.push(`/project/${item.id}`)}
    >
      <View style={styles.projectInfo}>
        <View style={styles.projectNameRow}>
          {item.isFavorite && <Ionicons name="star" size={18} color="#FF9500" style={{ marginRight: 6 }} />}
          <Text style={styles.projectName}>{item.name}</Text>
        </View>
        <Text style={styles.projectDate}>{new Date(item.date).toLocaleDateString()}</Text>
      </View>
      <View style={styles.actionRow}>
        <TouchableOpacity 
          onPress={() => {
            setEditingProjectId(item.id);
            setEditingProjectName(item.name);
          }} 
          style={styles.editButton}
        >
          <Ionicons name="settings-sharp" size={18} color="#007AFF" />
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );

  return (
    <KeyboardAvoidingView 
      style={styles.container} 
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 100 : 0}
    >
      <Stack.Screen 
        options={{
          title: 'Bildverortung',
          headerRight: () => (
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <TouchableOpacity onPress={() => setSortMenuVisible(true)} style={{ padding: 8 }}>
                <Ionicons name="filter-outline" size={24} color="#fff" />
              </TouchableOpacity>
              <TouchableOpacity onPress={handleOpenSettings} style={{ padding: 8, marginRight: 8 }}>
                <Ionicons name="settings-outline" size={24} color="#fff" />
              </TouchableOpacity>
            </View>
          )
        }} 
      />

      {!isPremiumUser && (
        <TouchableOpacity style={styles.demoBanner} onPress={() => router.push('/settings')}>
          <Ionicons name="sparkles" size={16} color="#FFF" style={{ marginRight: 6 }} />
          <Text style={styles.demoBannerText}>
            Demo-Modus aktiv. Tippe hier, um Premium freizuschalten.
          </Text>
        </TouchableOpacity>
      )}

      <View style={styles.listWrapper}>
        <FlatList
          data={visibleProjects}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          style={{ flex: 1 }}
          contentContainerStyle={styles.listContainer}
          ListEmptyComponent={<Text style={styles.emptyText}>Keine Projekte vorhanden.</Text>}
        />
      </View>
      
      <View style={styles.createWrapper}>
        <View style={styles.createInnerContainer}>
          <TextInput
            style={styles.input}
            placeholder="Neues Projekt erstellen..."
            placeholderTextColor="#8E8E93"
            value={newProjectName}
            onChangeText={setNewProjectName}
            ref={newProjectInputRef}
          />
          <TouchableOpacity style={styles.addButton} onPress={handleCreateProject}>
            <Ionicons name="add" size={24} color="white" />
          </TouchableOpacity>
        </View>
      </View>

      {Platform.OS === 'android' && <View style={{ height: keyboardHeight > 0 ? keyboardHeight + 16 : 0 }} />}

      {/* Rename Project Modal */}
      <Modal
        visible={editingProjectId !== null}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setEditingProjectId(null)}
      >
        <TouchableOpacity 
          style={styles.centerModalOverlay} 
          activeOpacity={1} 
          onPress={() => setEditingProjectId(null)}
        >
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ width: '100%', alignItems: 'center' }}>
            <TouchableOpacity activeOpacity={1} onPress={() => {}} style={styles.centerModalContent}>
              <Text style={styles.centerModalTitle}>Projekt bearbeiten</Text>
              <TextInput
                style={styles.centerModalInput}
                placeholder="Projektname"
                placeholderTextColor="#8E8E93"
                value={editingProjectName}
                onChangeText={setEditingProjectName}
                autoFocus
              />
              
              <TouchableOpacity 
                style={[styles.actionBtnOutline, { marginBottom: 20 }]} 
                onPress={() => {
                  if (editingProjectId) toggleFavoriteProject(editingProjectId);
                }}
              >
                <Ionicons 
                  name={editingProject?.isFavorite ? "star" : "star-outline"} 
                  size={18} 
                  color={editingProject?.isFavorite ? "#FF9500" : "#007AFF"} 
                  style={{ marginRight: 8 }} 
                />
                <Text style={[styles.actionBtnOutlineText, editingProject?.isFavorite && { color: '#FF9500' }]}>
                  {editingProject?.isFavorite ? 'Favorit entfernen' : 'Als Favorit markieren'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.deleteProjectBtn} onPress={handleDeleteProject}>
                <Ionicons name="trash-outline" size={18} color="#FF3B30" style={{ marginRight: 6 }} />
                <Text style={styles.deleteProjectText}>Projekt löschen</Text>
              </TouchableOpacity>

              <View style={styles.centerModalActions}>
                <TouchableOpacity style={styles.modalBtn} onPress={() => setEditingProjectId(null)}>
                  <Text style={styles.cancelText}>Abbrechen</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.modalBtn, styles.saveBtn]} onPress={handleRenameProject}>
                  <Text style={styles.saveText}>Speichern</Text>
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          </KeyboardAvoidingView>
        </TouchableOpacity>
      </Modal>

      {/* Sort Menu Modal */}
      <Modal
        visible={sortMenuVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setSortMenuVisible(false)}
      >
        <TouchableOpacity 
          style={styles.sortModalOverlay} 
          activeOpacity={1} 
          onPress={() => setSortMenuVisible(false)}
        >
          <TouchableOpacity activeOpacity={1} onPress={() => {}} style={styles.sortModalContent}>
            <Text style={styles.sortModalTitle}>Sortieren nach</Text>
            <TouchableOpacity 
              style={[styles.sortModalBtn, sortType === 'date' && styles.sortModalBtnActive]} 
              onPress={() => { setSortType('date'); setSortMenuVisible(false); }}
            >
              <Text style={[styles.sortModalBtnText, sortType === 'date' && styles.sortModalBtnTextActive]}>Datum</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.sortModalBtn, sortType === 'alpha' && styles.sortModalBtnActive]} 
              onPress={() => { setSortType('alpha'); setSortMenuVisible(false); }}
            >
              <Text style={[styles.sortModalBtnText, sortType === 'alpha' && styles.sortModalBtnTextActive]}>Alphabet</Text>
            </TouchableOpacity>
            </TouchableOpacity>
          </TouchableOpacity>
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
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F2F2F7',
  },
  listWrapper: {
    flex: 1,
    width: '100%',
    maxWidth: Platform.OS === 'web' ? 800 : '100%',
    alignSelf: 'center',
  },
  listContainer: {
    padding: 16,
    paddingBottom: 16,
  },
  projectCard: {
    backgroundColor: 'white',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  projectInfo: {
    flex: 1,
  },
  projectNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  projectName: {
    fontSize: 18,
    fontWeight: '600',
  },
  projectDate: {
    fontSize: 14,
    color: '#8E8E93',
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  editButton: {
    backgroundColor: '#E5F1FF',
    padding: 8,
    borderRadius: 16,
  },
  emptyText: {
    textAlign: 'center',
    marginTop: 50,
    color: '#8E8E93',
    fontSize: 16,
  },
  createWrapper: {
    width: '100%',
    backgroundColor: '#F2F2F7',
    borderTopWidth: 1,
    borderTopColor: '#E5E5EA',
  },
  createInnerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: Platform.OS === 'ios' ? 32 : 28,
    paddingTop: 8,
    backgroundColor: '#F2F2F7',
    width: '100%',
    maxWidth: Platform.OS === 'web' ? 800 : '100%',
    alignSelf: 'center',
  },
  input: {
    flex: 1,
    backgroundColor: 'white',
    color: '#1C1C1E',
    height: 50,
    borderRadius: 25,
    paddingHorizontal: 20,
    fontSize: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  addButton: {
    backgroundColor: '#007AFF',
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 12,
    shadowColor: '#007AFF',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
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
    color: '#1C1C1E',
  },
  centerModalActions: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
  },
  modalBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  cancelText: {
    color: '#007AFF',
    fontSize: 16,
    fontWeight: '600',
  },
  saveBtn: {
    backgroundColor: '#007AFF',
  },
  saveText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  actionBtnOutline: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    borderWidth: 1,
    borderColor: '#007AFF',
    borderRadius: 8,
  },
  actionBtnOutlineText: {
    color: '#007AFF',
    fontWeight: '600',
    fontSize: 16,
  },
  deleteProjectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    borderWidth: 1,
    borderColor: '#FF3B30',
    borderRadius: 8,
    marginBottom: 20,
  },
  deleteProjectText: {
    color: '#FF3B30',
    fontSize: 16,
    fontWeight: '600',
  },
  sortModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'flex-start',
    alignItems: 'flex-end',
    paddingTop: Platform.OS === 'ios' ? 90 : 60,
    paddingRight: 16,
  },
  sortModalContent: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    width: 200,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  sortModalTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#8E8E93',
    marginBottom: 12,
    textTransform: 'uppercase',
  },
  sortModalBtn: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#F2F2F7',
    marginBottom: 8,
  },
  sortModalBtnActive: {
    backgroundColor: '#007AFF',
  },
  sortModalBtnText: {
    fontSize: 16,
    color: '#1C1C1E',
  },
  sortModalBtnTextActive: {
    color: 'white',
    fontWeight: '600',
  },
  demoBanner: {
    backgroundColor: '#5E5CE6',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    width: '100%',
  },
  demoBannerText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },

});
