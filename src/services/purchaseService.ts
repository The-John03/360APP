import Purchases from 'react-native-purchases';
import { Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';

const REVENUECAT_PUBLIC_KEY = process.env.EXPO_PUBLIC_REVENUECAT_PUBLIC_KEY || '';

// Detect if running in Expo Go (where native modules are not available)
const isExpoGo = Constants.appOwnership === 'expo';

export class PurchaseServiceClass {
  private isInitialized = false;

  public initialize() {
    if (this.isInitialized) return;

    if (isExpoGo) {
      console.log('[PurchaseService] Running in Expo Go. Bypassing RevenueCat native SDK configuration.');
      return;
    }

    if (REVENUECAT_PUBLIC_KEY.startsWith('test_')) {
      console.log('[PurchaseService] Test API key detected. Bypassing RevenueCat native SDK configuration to avoid crash on release builds.');
      return;
    }

    try {
      if (REVENUECAT_PUBLIC_KEY) {
        Purchases.configure({ apiKey: REVENUECAT_PUBLIC_KEY });
        this.isInitialized = true;
        console.log('[PurchaseService] RevenueCat initialized successfully.');
      } else {
        console.warn('[PurchaseService] EXPO_PUBLIC_REVENUECAT_PUBLIC_KEY is not defined.');
      }
    } catch (error) {
      console.error('[PurchaseService] Failed to initialize RevenueCat:', error);
    }
  }

  public async isPremium(): Promise<boolean> {
    // Check AsyncStorage first for test override
    try {
      const stored = await AsyncStorage.getItem('@premium_status');
      if (stored === 'true') return true;
    } catch {
      // Ignore storage read errors
    }

    if (!this.isInitialized) {
      this.initialize();
    }

    try {
      if (!this.isInitialized) return false;
      const customerInfo = await Purchases.getCustomerInfo();
      return customerInfo.entitlements.active['premium'] !== undefined;
    } catch (error) {
      console.error('[PurchaseService] Error fetching customer info:', error);
      return false;
    }
  }

  public async cancelPremium(): Promise<boolean> {
    try {
      await AsyncStorage.removeItem('@premium_status');
      return true;
    } catch {
      return false;
    }
  }

  public async purchasePremium(): Promise<boolean> {
    if (!this.isInitialized) {
      this.initialize();
    }

    // Fallback if not initialized (e.g. running in Expo Go where native module is missing)
    if (!this.isInitialized) {
      return new Promise((resolve) => {
        Alert.alert(
          'Premium kaufen (Test-Modus)',
          'Das RevenueCat Native SDK ist in diesem Client (z. B. Expo Go) nicht verfügbar. Möchtest du Premium für dieses Gerät direkt freischalten?',
          [
            { 
              text: 'Abbrechen', 
              onPress: () => resolve(false), 
              style: 'cancel' 
            },
            { 
              text: 'Freischalten', 
              onPress: async () => {
                try {
                  await AsyncStorage.setItem('@premium_status', 'true');
                  resolve(true);
                } catch {
                  resolve(false);
                }
              } 
            }
          ]
        );
      });
    }

    try {
      const offerings = await Purchases.getOfferings();
      if (offerings.current !== null && offerings.current.availablePackages.length > 0) {
        // Purchase the first available package (e.g. monthly premium)
        const packageToBuy = offerings.current.availablePackages[0];
        const { customerInfo } = await Purchases.purchasePackage(packageToBuy);
        return customerInfo.entitlements.active['premium'] !== undefined;
      }
      
      // Fallback if no offerings configured but SDK is running in sandbox
      return new Promise((resolve) => {
        Alert.alert(
          'Keine Angebote gefunden',
          'Das SDK ist initialisiert, aber im Dashboard sind keine Produkte hinterlegt. Möchtest du das Test-Premium-Abonnement aktivieren?',
          [
            { text: 'Abbrechen', onPress: () => resolve(false), style: 'cancel' },
            { 
              text: 'Freischalten', 
              onPress: async () => {
                try {
                  await AsyncStorage.setItem('@premium_status', 'true');
                  resolve(true);
                } catch {
                  resolve(false);
                }
              } 
            }
          ]
        );
      });
    } catch (error: any) {
      if (!error.userCancelled) {
        console.error('[PurchaseService] Error purchasing premium:', error);
        // Alert user of error and offer simulation fallback
        return new Promise((resolve) => {
          Alert.alert(
            'Kauf fehlgeschlagen',
            (error.message || 'Kauf konnte nicht abgeschlossen werden.') + '\n\nMöchtest du stattdessen das Test-Abonnement direkt aktivieren?',
            [
              { text: 'Abbrechen', onPress: () => resolve(false), style: 'cancel' },
              { 
                text: 'Aktivieren', 
                onPress: async () => {
                  try {
                    await AsyncStorage.setItem('@premium_status', 'true');
                    resolve(true);
                  } catch {
                    resolve(false);
                  }
                } 
              }
            ]
          );
        });
      }
      return false;
    }
  }
}

export const PurchaseService = new PurchaseServiceClass();
