import { Stack, ThemeProvider, DefaultTheme, DarkTheme } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useColorScheme, View, Text, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';

import { useEffect } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../config/firebase';
import { useProjectStore } from '../store/useProjectStore';
import { PurchaseService } from '../services/purchaseService';
import { SyncManager } from '../services/syncManager';

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const { setUser, setPremiumUser, settings, user } = useProjectStore();

  useEffect(() => {
    // Start or stop sync based on syncMode and auth state
    if (user && settings.syncMode === 'auto') {
      SyncManager.startSync(user.uid);
    } else {
      SyncManager.stopSync(false); // Do not clear local data when just stopping sync due to manual mode
    }
  }, [user, settings.syncMode]);

  useEffect(() => {
    // Initialize RevenueCat
    PurchaseService.initialize();

    // Subscribe to Firebase Auth changes
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        setUser({
          uid: firebaseUser.uid,
          email: firebaseUser.email,
        });

        // Fetch premium status from RevenueCat
        const premium = await PurchaseService.isPremium();
        setPremiumUser(premium);
      } else {
        setUser(null);
        setPremiumUser(false);
        // Stop syncing and clear data completely
        SyncManager.stopSync(true);
      }
    });

    return () => unsubscribe();
  }, [setUser, setPremiumUser]);

  return (
    <ThemeProvider value={isDark ? DarkTheme : DefaultTheme}>
      <Stack
        screenOptions={{
          headerBackground: () => (
            <LinearGradient
              colors={['#007AFF', '#5E5CE6']}
              style={{ flex: 1 }}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            />
          ),
          headerTintColor: '#fff',
          headerTitle: (props) => (
            <View style={{ 
              flexDirection: 'row', 
              alignItems: 'center', 
              flexShrink: 1, 
              marginRight: Platform.OS === 'web' ? 20 : 40 
            }}>
              {/* Platzhalter App-Logo */}
              <Ionicons name="location-sharp" size={28} color="#fff" style={{ marginRight: 6, flexShrink: 0 }} />
              <Text 
                style={{ color: '#fff', fontSize: 19, fontWeight: 'bold', flexShrink: 1 }}
                numberOfLines={1}
                ellipsizeMode="tail"
              >
                {props.children}
              </Text>
            </View>
          ),
        }}
      >
        <Stack.Screen name="index" options={{ title: 'Bildverortung' }} />
        <Stack.Screen name="project/[id]" options={{ title: 'Projekt Details', presentation: 'card' }} />
        <Stack.Screen name="settings" options={{ title: 'Einstellungen', presentation: 'card' }} />
        <Stack.Screen name="login" options={{ title: 'Anmeldung', presentation: 'modal' }} />
      </Stack>
      <StatusBar style="light" />
    </ThemeProvider>
  );
}
