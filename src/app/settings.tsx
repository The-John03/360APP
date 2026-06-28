import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Image,
  Switch,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useRouter, Stack } from 'expo-router';
import { useProjectStore, STORAGE_LIMIT_FREE, STORAGE_LIMIT_PREMIUM } from '../store/useProjectStore';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { triggerHaptic } from '../utils/hapticHelper';
import { signOut } from 'firebase/auth';
import { auth } from '../config/firebase';
import { ConfirmModal } from '../components/ConfirmModal';
import { PurchaseService } from '../services/purchaseService';

export default function SettingsScreen() {
  const router = useRouter();
  const { settings, updateSettings, user, isPremiumUser, setPremiumUser, getStorageUsageBytes, syncData } = useProjectStore();

  const [confirmConfig, setConfirmConfig] = useState<{
    visible: boolean;
    title: string;
    message: string;
    confirmText?: string;
    isDestructive?: boolean;
    onConfirm: () => void;
  } | null>(null);

  const [isSaving, setIsSaving] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [companyName, setCompanyName] = useState(settings.companyName || '');
  const [companyAddress, setCompanyAddress] = useState(settings.companyAddress || '');
  const [companyLogoUri, setCompanyLogoUri] = useState<string | undefined>(settings.companyLogoUri);
  const [hapticsEnabled, setHapticsEnabled] = useState(settings.hapticsEnabled !== false);
  const [exportQuality, setExportQuality] = useState<'high' | 'medium' | 'low'>(settings.exportQuality || 'medium');
  const [syncMode, setSyncMode] = useState<'auto' | 'manual'>(settings.syncMode || 'auto');

  useEffect(() => {
    setCompanyName(settings.companyName || '');
    setCompanyAddress(settings.companyAddress || '');
    setCompanyLogoUri(settings.companyLogoUri);
    setHapticsEnabled(settings.hapticsEnabled !== false);
    setExportQuality(settings.exportQuality || 'medium');
    setSyncMode(settings.syncMode || 'auto');
  }, [settings]);

  const storageUsed = getStorageUsageBytes();
  const storageLimit = isPremiumUser ? STORAGE_LIMIT_PREMIUM : STORAGE_LIMIT_FREE;
  const storageUsedMB = (storageUsed / (1024 * 1024)).toFixed(2);
  const storageLimitMB = (storageLimit / (1024 * 1024)).toFixed(0);
  const storagePercent = Math.min(100, (storageUsed / storageLimit) * 100);

  const handlePickLogo = async () => {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permissionResult.granted) {
      alert('Galerie-Berechtigung ist erforderlich!');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
    });
    if (!result.canceled && result.assets && result.assets.length > 0) {
      setCompanyLogoUri(result.assets[0].uri);
      triggerHaptic.selection();
    }
  };

  const handleDeleteLogo = () => {
    setCompanyLogoUri(undefined);
    triggerHaptic.selection();
  };

  const handleSaveSettings = async () => {
    setIsSaving(true);
    try {
      await updateSettings({
        companyName: companyName.trim(),
        companyAddress: companyAddress.trim(),
        companyLogoUri: companyLogoUri,
        hapticsEnabled,
        exportQuality,
        syncMode,
      });
      triggerHaptic.success();
      router.back();
    } catch (error) {
      console.error('Failed to save settings:', error);
      Alert.alert('Fehler', 'Beim Speichern der Einstellungen ist ein Fehler aufgetreten.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleLogout = () => {
    setConfirmConfig({
      visible: true,
      title: 'Abmelden',
      message: 'Möchtest du dich wirklich abmelden?',
      confirmText: 'Abmelden',
      isDestructive: true,
      onConfirm: async () => {
        setConfirmConfig(null);
        try {
          await signOut(auth);
          triggerHaptic.success();
          Alert.alert('Abgemeldet', 'Du hast dich erfolgreich abgemeldet.');
        } catch (error) {
          console.error('Logout failed:', error);
          Alert.alert('Fehler', 'Abmeldung fehlgeschlagen.');
        }
      }
    });
  };

  const handleUpgrade = async () => {
    const success = await PurchaseService.purchasePremium();
    if (success) {
      setPremiumUser(true);
      triggerHaptic.success();
      Alert.alert('Erfolg', 'Premium wurde erfolgreich freigeschaltet! Vielen Dank für deine Unterstützung.');
    }
  };

  const handleCancelSubscription = () => {
    setConfirmConfig({
      visible: true,
      title: 'Test-Abo beenden',
      message: 'Möchtest du das Test-Premium-Abonnement wirklich beenden, um den Demo-Modus wieder zu aktivieren?',
      confirmText: 'Beenden',
      isDestructive: true,
      onConfirm: async () => {
        setConfirmConfig(null);
        const success = await PurchaseService.cancelPremium();
        if (success) {
          setPremiumUser(false);
          triggerHaptic.success();
          Alert.alert('Abo beendet', 'Das Test-Abo wurde beendet. Du befindest dich wieder im Demo-Modus.');
        }
      }
    });
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 100 : 0}
    >
      <Stack.Screen
        options={{
          title: 'Einstellungen',
          headerRight: () => (
            <TouchableOpacity 
              onPress={handleSaveSettings} 
              style={{ padding: 8, marginRight: 8 }}
              disabled={isSaving}
            >
              {isSaving ? (
                <ActivityIndicator size="small" color="#FFF" />
              ) : (
                <Text style={styles.headerSaveText}>Speichern</Text>
              )}
            </TouchableOpacity>
          ),
        }}
      />

      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <View style={styles.contentWrapper}>
          
          {/* SECTION 1: BENUTZERKONTO & ABONNEMENT */}
          <Text style={styles.sectionTitle}>Konto & Abonnement</Text>
          <View style={styles.card}>
            {user ? (
              <View style={styles.userContainer}>
                <View style={styles.userInfoRow}>
                  <Ionicons name="person-circle-outline" size={32} color="#5E5CE6" style={{ marginRight: 12 }} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.userEmail}>{user.email}</Text>
                    <Text style={styles.userStatus}>
                      Status: {isPremiumUser ? 'Premium Mitglied 🌟' : 'Demo Version (Eingeschränkt)'}
                    </Text>
                  </View>
                </View>

                {!isPremiumUser && (
                  <TouchableOpacity style={styles.upgradeBtn} onPress={handleUpgrade}>
                    <Ionicons name="sparkles" size={18} color="#FFFFFF" style={{ marginRight: 6 }} />
                    <Text style={styles.upgradeBtnText}>Premium freischalten</Text>
                  </TouchableOpacity>
                )}

                {isPremiumUser && (
                  <TouchableOpacity style={styles.cancelAboBtn} onPress={handleCancelSubscription}>
                    <Ionicons name="close-circle-outline" size={18} color="#FF9500" style={{ marginRight: 6 }} />
                    <Text style={styles.cancelAboBtnText}>Test-Abo beenden</Text>
                  </TouchableOpacity>
                )}

                <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
                  <Ionicons name="log-out-outline" size={18} color="#FF3B30" style={{ marginRight: 6 }} />
                  <Text style={styles.logoutBtnText}>Abmelden</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.authPromptContainer}>
                <Text style={styles.authPromptText}>
                  Du bist aktuell nicht angemeldet. Registriere dich oder melde dich an, um deine Projekte in der Cloud zu sichern und plattformübergreifend zu bearbeiten.
                </Text>
                <TouchableOpacity style={styles.loginBtn} onPress={() => router.push('/login')}>
                  <Ionicons name="log-in-outline" size={20} color="#007AFF" style={{ marginRight: 8 }} />
                  <Text style={styles.loginBtnText}>Anmelden / Registrieren</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

          {/* SECTION 1.5: CLOUD & SYNCHRONISATION */}
          <Text style={styles.sectionTitle}>Cloud & Synchronisation</Text>
          <View style={styles.card}>
            <View style={styles.settingRow}>
              <View style={styles.settingTextCol}>
                <Text style={styles.settingLabel}>Automatische Synchronisation</Text>
                <Text style={styles.settingDescription}>Änderungen sofort in der Cloud speichern (benötigt Internet)</Text>
              </View>
              <Switch
                value={syncMode === 'auto'}
                onValueChange={(val) => {
                  setSyncMode(val ? 'auto' : 'manual');
                  triggerHaptic.selection();
                }}
                trackColor={{ false: '#D1D1D6', true: '#34C759' }}
                thumbColor={Platform.OS === 'android' ? '#FFFFFF' : undefined}
              />
            </View>

            {syncMode === 'manual' && user && (
              <>
                <View style={styles.divider} />
                <TouchableOpacity 
                  style={[styles.syncBtn, isSyncing && { opacity: 0.7 }]} 
                  onPress={async () => {
                    setIsSyncing(true);
                    await syncData();
                    setIsSyncing(false);
                  }}
                  disabled={isSyncing}
                >
                  <Ionicons name="cloud-upload-outline" size={18} color="#007AFF" style={{ marginRight: 6 }} />
                  <Text style={styles.syncBtnText}>{isSyncing ? 'Synchronisiere...' : 'Jetzt manuell synchronisieren'}</Text>
                </TouchableOpacity>
              </>
            )}

            <View style={styles.divider} />

            <View style={styles.settingRow}>
              <View style={[styles.settingTextCol, { marginRight: 0 }]}>
                <Text style={styles.settingLabel}>Speicherplatz ({isPremiumUser ? 'Premium' : 'Free'})</Text>
                <Text style={styles.settingDescription}>{storageUsedMB} MB von {storageLimitMB} MB belegt</Text>
                <View style={styles.progressBarContainer}>
                  <View style={[styles.progressBarFill, { width: `${storagePercent}%`, backgroundColor: storagePercent > 90 ? '#FF3B30' : '#007AFF' }]} />
                </View>
              </View>
            </View>
          </View>

          {/* SECTION 2: BÜRO-BRANDING */}
          <Text style={styles.sectionTitle}>Büro-Branding für PDF-Berichte</Text>
          <View style={[styles.card, !isPremiumUser && styles.premiumLockedCard]}>
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Firmenname</Text>
              <TextInput
                style={[styles.input, !isPremiumUser && styles.disabledInput]}
                placeholder="z.B. Müller & Partner Bau GmbH"
                value={companyName}
                onChangeText={setCompanyName}
                placeholderTextColor="#A8A8A8"
                editable={isPremiumUser}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Firmenadresse</Text>
              <TextInput
                style={[styles.input, styles.textArea, !isPremiumUser && styles.disabledInput]}
                placeholder="z.B. Hauptstraße 12, 80331 München"
                value={companyAddress}
                onChangeText={setCompanyAddress}
                multiline={true}
                numberOfLines={3}
                placeholderTextColor="#A8A8A8"
                editable={isPremiumUser}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Firmenlogo</Text>
              <View style={styles.logoSettingsRow}>
                {companyLogoUri ? (
                  <View style={styles.logoPreviewContainer}>
                    <Image source={{ uri: companyLogoUri }} style={styles.logoPreview} />
                    <TouchableOpacity 
                      style={[styles.deleteLogoBtn, !isPremiumUser && { opacity: 0.5 }]} 
                      onPress={handleDeleteLogo}
                      disabled={!isPremiumUser}
                    >
                      <Ionicons name="trash-outline" size={20} color="#FF3B30" />
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity 
                    style={[styles.selectLogoBtn, !isPremiumUser && styles.disabledSelectLogoBtn]} 
                    onPress={handlePickLogo}
                    disabled={!isPremiumUser}
                  >
                    <Ionicons name="image-outline" size={22} color={isPremiumUser ? "#007AFF" : "#8E8E93"} style={{ marginRight: 8 }} />
                    <Text style={[styles.selectLogoBtnText, !isPremiumUser && { color: '#8E8E93' }]}>Logo auswählen</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>

            {!isPremiumUser && (
              <View style={styles.premiumLockBanner}>
                <Ionicons name="lock-closed" size={24} color="#FF9500" style={{ marginBottom: 8 }} />
                <Text style={styles.premiumLockTitle}>Premium-Funktion</Text>
                <Text style={styles.premiumLockText}>
                  Das Büro-Branding für PDF-Berichte steht nur Premium-Mitgliedern zur Verfügung. Dein Branding wird automatisch in der Cloud gesichert und plattformübergreifend synchronisiert.
                </Text>
                <TouchableOpacity style={styles.premiumLockUpgradeBtn} onPress={handleUpgrade}>
                  <Ionicons name="sparkles" size={16} color="#FFFFFF" style={{ marginRight: 6 }} />
                  <Text style={styles.premiumLockUpgradeBtnText}>Premium freischalten</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

          {/* SECTION 3: APP-EINSTELLUNGEN */}
          <Text style={styles.sectionTitle}>App-Einstellungen</Text>
          <View style={styles.card}>
            <View style={styles.settingRow}>
              <View style={styles.settingTextCol}>
                <Text style={styles.settingLabel}>Haptisches Feedback</Text>
                <Text style={styles.settingDescription}>Fühlbare Rückmeldungen bei Aktionen (Vibrationen)</Text>
              </View>
              <Switch
                value={hapticsEnabled}
                onValueChange={(val) => {
                  setHapticsEnabled(val);
                  if (val) triggerHaptic.selection();
                }}
                trackColor={{ false: '#D1D1D6', true: '#34C759' }}
                thumbColor={Platform.OS === 'android' ? '#FFFFFF' : undefined}
              />
            </View>

            <View style={styles.divider} />

            <View style={[styles.settingRow, { flexDirection: 'column', alignItems: 'stretch' }]}>
              <View style={styles.settingTextCol}>
                <Text style={styles.settingLabel}>PDF-Exportqualität</Text>
                <Text style={styles.settingDescription}>Beeinflusst die Auflösung und Dateigröße der Bilder im PDF-Bericht</Text>
              </View>
              <View style={styles.qualitySegmentContainer}>
                {(['low', 'medium', 'high'] as const).map((q) => {
                  const label = q === 'low' ? 'Niedrig' : q === 'medium' ? 'Mittel' : 'Hoch';
                  const isActive = exportQuality === q;
                  return (
                    <TouchableOpacity
                      key={q}
                      style={[styles.qualitySegmentButton, isActive && styles.qualitySegmentButtonActive]}
                      onPress={() => {
                        setExportQuality(q);
                        triggerHaptic.selection();
                      }}
                    >
                      <Text style={[styles.qualitySegmentText, isActive && styles.qualitySegmentTextActive]}>
                        {label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          </View>

          {/* SECTION 4: SYSTEMINFO */}
          <Text style={styles.sectionTitle}>Systeminformationen</Text>
          <View style={styles.card}>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>App-Version</Text>
              <Text style={styles.infoValue}>1.0.0</Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Lizenz</Text>
              <Text style={styles.infoValue}>MIT Lizenz</Text>
            </View>
          </View>

          {/* SAVE BUTTON */}
          <TouchableOpacity 
            style={[styles.saveButton, isSaving && { opacity: 0.7 }]} 
            onPress={handleSaveSettings}
            disabled={isSaving}
          >
            {isSaving ? (
              <ActivityIndicator size="small" color="#FFF" style={{ marginRight: 8 }} />
            ) : (
              <Ionicons name="checkmark-circle-outline" size={24} color="#FFF" style={{ marginRight: 8 }} />
            )}
            <Text style={styles.saveButtonText}>
              {isSaving ? 'Wird gespeichert...' : 'Einstellungen speichern'}
            </Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.footerText}>Version 1.0.0 (Build 1)</Text>
      </ScrollView>

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
  scrollContent: {
    paddingVertical: 20,
    paddingHorizontal: 16,
  },
  contentWrapper: {
    width: '100%',
    maxWidth: Platform.OS === 'web' ? 800 : '100%',
    alignSelf: 'center',
  },
  headerSaveText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#8E8E93',
    marginBottom: 8,
    marginLeft: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  userContainer: {
    width: '100%',
  },
  userInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  userEmail: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1C1C1E',
  },
  userStatus: {
    fontSize: 13,
    color: '#8E8E93',
    marginTop: 2,
  },
  upgradeBtn: {
    backgroundColor: '#5E5CE6',
    borderRadius: 8,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  upgradeBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: 'bold',
  },
  logoutBtn: {
    borderWidth: 1,
    borderColor: '#FF3B30',
    borderRadius: 8,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoutBtnText: {
    color: '#FF3B30',
    fontSize: 14,
    fontWeight: 'bold',
  },
  cancelAboBtn: {
    borderWidth: 1,
    borderColor: '#FF9500',
    borderRadius: 8,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  cancelAboBtnText: {
    color: '#FF9500',
    fontSize: 14,
    fontWeight: 'bold',
  },
  authPromptContainer: {
    alignItems: 'center',
  },
  authPromptText: {
    fontSize: 14,
    color: '#3A3A3C',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 16,
  },
  loginBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderWidth: 1.5,
    borderColor: '#007AFF',
    borderRadius: 8,
    backgroundColor: '#E5F1FF',
    width: '100%',
  },
  loginBtnText: {
    color: '#007AFF',
    fontSize: 15,
    fontWeight: 'bold',
  },
  inputGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1C1C1E',
    marginBottom: 6,
  },
  input: {
    backgroundColor: '#F2F2F7',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: '#1C1C1E',
    borderWidth: 1,
    borderColor: '#E5E5EA',
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  logoSettingsRow: {
    marginTop: 4,
  },
  selectLogoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 14,
    borderWidth: 1.5,
    borderColor: '#007AFF',
    borderStyle: 'dashed',
    borderRadius: 8,
    backgroundColor: '#E5F1FF',
  },
  selectLogoBtnText: {
    color: '#007AFF',
    fontSize: 15,
    fontWeight: '600',
  },
  logoPreviewContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F2F2F7',
    borderRadius: 8,
    padding: 10,
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#E5E5EA',
  },
  logoPreview: {
    width: 140,
    height: 48,
    resizeMode: 'contain',
    backgroundColor: 'white',
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#E5E5EA',
  },
  deleteLogoBtn: {
    padding: 8,
    backgroundColor: '#FFE5E5',
    borderRadius: 6,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  settingTextCol: {
    flex: 1,
    marginRight: 16,
  },
  settingLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1C1C1E',
    marginBottom: 2,
  },
  settingDescription: {
    fontSize: 13,
    color: '#8E8E93',
  },
  divider: {
    height: 1,
    backgroundColor: '#E5E5EA',
    marginVertical: 14,
  },
  qualitySegmentContainer: {
    flexDirection: 'row',
    backgroundColor: '#F2F2F7',
    borderRadius: 8,
    padding: 3,
    marginTop: 12,
  },
  qualitySegmentButton: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 6,
  },
  qualitySegmentButtonActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 1,
  },
  qualitySegmentText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#8E8E93',
  },
  qualitySegmentTextActive: {
    color: '#007AFF',
    fontWeight: '600',
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  infoLabel: {
    fontSize: 15,
    color: '#1C1C1E',
  },
  infoValue: {
    fontSize: 15,
    color: '#8E8E93',
    fontWeight: '500',
  },
  saveButton: {
    backgroundColor: '#5E5CE6',
    borderRadius: 24,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    shadowColor: '#5E5CE6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  premiumLockedCard: {
    borderColor: '#FFD60A',
    borderWidth: 1,
    backgroundColor: '#FAF9F2',
  },
  disabledInput: {
    backgroundColor: '#E5E5EA',
    color: '#8E8E93',
    borderColor: '#D1D1D6',
  },
  disabledSelectLogoBtn: {
    borderColor: '#D1D1D6',
    backgroundColor: '#F2F2F7',
  },
  premiumLockBanner: {
    marginTop: 16,
    padding: 16,
    backgroundColor: '#FFFBE6',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FFE680',
    alignItems: 'center',
  },
  premiumLockTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#FF9500',
    marginBottom: 4,
  },
  premiumLockText: {
    fontSize: 13,
    color: '#665c33',
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 12,
  },
  premiumLockUpgradeBtn: {
    backgroundColor: '#FF9500',
    borderRadius: 6,
    paddingVertical: 8,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
  },
  premiumLockUpgradeBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: 'bold',
  },
  syncBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    backgroundColor: '#E5F1FF',
    borderRadius: 8,
    marginTop: 8,
  },
  syncBtnText: {
    color: '#007AFF',
    fontSize: 14,
    fontWeight: 'bold',
  },
  progressBarContainer: {
    height: 8,
    backgroundColor: '#E5E5EA',
    borderRadius: 4,
    marginTop: 8,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  footerText: {
    textAlign: 'center',
    color: '#8E8E93',
    fontSize: 13,
    marginTop: 20,
    marginBottom: 40,
  },
});
