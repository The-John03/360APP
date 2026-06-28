import { Alert } from 'react-native';
import * as Linking from 'expo-linking';
import AsyncStorage from '@react-native-async-storage/async-storage';

export class PurchaseServiceClass {
  public initialize() {
    console.log('[PurchaseService] Running on Web. Bypassing RevenueCat SDK configuration.');
  }

  public async isPremium(): Promise<boolean> {
    try {
      const stored = await AsyncStorage.getItem('@premium_status');
      return stored === 'true';
    } catch {
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
    const checkoutUrl = 'https://checkout.stripe.com/test'; // Stripe checkout portal
    console.log('[PurchaseService] Opening Stripe Checkout:', checkoutUrl);

    if (typeof window !== 'undefined') {
      const confirm = window.confirm(
        'Premium kaufen (Test-Modus)\n\n' +
        'Möchtest du Premium für diesen Browser sofort freischalten?\n\n' +
        '• OK klicken = Premium direkt aktivieren (für Tests)\n' +
        '• Abbrechen klicken = Stripe-Testzahlungsseite im Browser öffnen'
      );
      if (confirm) {
        try {
          await AsyncStorage.setItem('@premium_status', 'true');
          return true;
        } catch {
          return false;
        }
      } else {
        Linking.openURL(checkoutUrl);
        return false;
      }
    } else {
      // Fallback in case window is not defined
      Alert.alert(
        'Premium kaufen (Test-Modus)',
        'Möchtest du Premium sofort freischalten oder die Stripe-Testzahlungsseite öffnen?',
        [
          { text: 'Abbrechen', style: 'cancel' },
          { 
            text: 'Freischalten', 
            onPress: async () => {
              await AsyncStorage.setItem('@premium_status', 'true');
            } 
          },
          { text: 'Stripe öffnen', onPress: () => Linking.openURL(checkoutUrl) }
        ]
      );
      return false;
    }
  }
}

export const PurchaseService = new PurchaseServiceClass();
