import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
  Alert,
  Keyboard,
} from 'react-native';
import { useRouter, Stack } from 'expo-router';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../config/firebase';
import { Ionicons } from '@expo/vector-icons';
import { triggerHaptic } from '../utils/hapticHelper';

export default function LoginScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isRegisterMode, setIsRegisterMode] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleAuthAction = async () => {
    const cleanEmail = email.trim();
    const cleanPassword = password.trim();

    if (!cleanEmail || !cleanPassword) {
      Alert.alert('Fehler', 'Bitte gib eine E-Mail-Adresse und ein Passwort ein.');
      return;
    }

    if (cleanPassword.length < 6) {
      Alert.alert('Fehler', 'Das Passwort muss mindestens 6 Zeichen lang sein.');
      return;
    }

    setLoading(true);
    try {
      if (isRegisterMode) {
        // Register new account in Firebase
        await createUserWithEmailAndPassword(auth, cleanEmail, cleanPassword);
        triggerHaptic.success();
        Alert.alert('Erfolg', 'Registrierung erfolgreich! Willkommen in der 360 APP.', [
          { text: 'OK', onPress: () => router.back() }
        ]);
      } else {
        // Login to existing account
        await signInWithEmailAndPassword(auth, cleanEmail, cleanPassword);
        triggerHaptic.success();
        router.back();
      }
    } catch (error: any) {
      console.error('[Auth Error]', error);
      triggerHaptic.warning();
      let msg = 'Es ist ein Fehler bei der Anmeldung aufgetreten.';
      if (error.code === 'auth/wrong-password' || error.code === 'auth/user-not-found' || error.code === 'auth/invalid-credential') {
        msg = 'Falsche E-Mail-Adresse oder falsches Passwort.';
      } else if (error.code === 'auth/email-already-in-use') {
        msg = 'Diese E-Mail-Adresse wird bereits für ein anderes Konto verwendet.';
      } else if (error.code === 'auth/invalid-email') {
        msg = 'Ungültige E-Mail-Adresse.';
      }
      Alert.alert('Authentifizierung fehlgeschlagen', msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#F2F2F7' }}>
      <Stack.Screen
        options={{
          title: isRegisterMode ? 'Registrieren' : 'Anmelden',
        }}
      />
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 100 : 80}
      >
        <ScrollView 
          contentContainerStyle={[
            styles.scrollContent, 
            { paddingBottom: 40 }
          ]} 
          keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets={true}
        >
        <View style={styles.contentWrapper}>
          
          <View style={styles.iconContainer}>
            <LinearGradientBackground />
          </View>

          <Text style={styles.title}>
            {isRegisterMode ? 'Konto erstellen' : 'Willkommen zurück!'}
          </Text>
          <Text style={styles.subtitle}>
            {isRegisterMode
              ? 'Erstelle ein Konto, um deine Projekte in der Cloud zu sichern und auf allen Geräten zu bearbeiten.'
              : 'Melde dich an, um deine Projekte zu synchronisieren.'}
          </Text>

          <View style={styles.card}>
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>E-Mail-Adresse</Text>
              <TextInput
                style={styles.input}
                placeholder="z.B. max.mustermann@firma.de"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                placeholderTextColor="#A8A8A8"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Passwort</Text>
              <TextInput
                style={styles.input}
                placeholder="Mindestens 6 Zeichen"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                placeholderTextColor="#A8A8A8"
              />
            </View>

            <TouchableOpacity
              style={styles.authBtn}
              onPress={handleAuthAction}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <>
                  <Ionicons
                    name={isRegisterMode ? 'person-add-outline' : 'log-in-outline'}
                    size={20}
                    color="#FFFFFF"
                    style={{ marginRight: 8 }}
                  />
                  <Text style={styles.authBtnText}>
                    {isRegisterMode ? 'Registrieren' : 'Anmelden'}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={styles.switchBtn}
            onPress={() => {
              setIsRegisterMode(!isRegisterMode);
              triggerHaptic.selection();
            }}
          >
            <Text style={styles.switchBtnText}>
              {isRegisterMode
                ? 'Bereits registriert? Hier anmelden'
                : 'Noch kein Konto? Hier registrieren'}
            </Text>
          </TouchableOpacity>

        </View>
      </ScrollView>
    </KeyboardAvoidingView>
    </View>
  );
}

// Simple fallback if LinearGradient isn't imported from expo-linear-gradient
function LinearGradientBackground() {
  return (
    <View style={styles.gradientIconBg}>
      <Ionicons name="location-sharp" size={48} color="#FFFFFF" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F2F2F7',
  },
  scrollContent: {
    flexGrow: 1,
    paddingTop: 80,
    paddingBottom: 40,
    paddingHorizontal: 20,
  },
  contentWrapper: {
    width: '100%',
    maxWidth: 440,
    alignSelf: 'center',
    alignItems: 'center',
  },
  iconContainer: {
    marginBottom: 24,
    shadowColor: '#5E5CE6',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 6,
  },
  gradientIconBg: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: '#5E5CE6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1C1C1E',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: '#8E8E93',
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 20,
    paddingHorizontal: 12,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 3,
  },
  inputGroup: {
    marginBottom: 20,
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
    paddingVertical: 12,
    fontSize: 16,
    color: '#1C1C1E',
    borderWidth: 1,
    borderColor: '#E5E5EA',
  },
  authBtn: {
    backgroundColor: '#007AFF',
    borderRadius: 8,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
    shadowColor: '#007AFF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 3,
  },
  authBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  switchBtn: {
    padding: 16,
    marginTop: 20,
  },
  switchBtnText: {
    color: '#007AFF',
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
  },
});
