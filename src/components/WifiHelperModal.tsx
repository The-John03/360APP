import React from 'react';
import { View, Text, Modal, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

type Props = {
  visible: boolean;
  onClose: () => void;
};

export default function WifiHelperModal({ visible, onClose }: Props) {
  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.content}>
          <Text style={styles.title}>360° Kamera verbinden</Text>
          
          <ScrollView showsVerticalScrollIndicator={false} style={styles.scroll}>
            <Text style={styles.intro}>
              Die Steuerung erfolgt direkt über das WLAN der Kamera. Bitte folge diesen Schritten:
            </Text>

            <View style={styles.step}>
              <View style={styles.numberCircle}><Text style={styles.numberText}>1</Text></View>
              <View style={styles.stepContent}>
                <Text style={styles.stepTitle}>WLAN an der Kamera aktivieren</Text>
                <Text style={styles.stepDesc}>
                  Schalte deine Kamera ein und aktiviere die Wi-Fi-Funktion (oft über einen physischen Button an der Seite oder das Touch-Menü).
                </Text>
              </View>
            </View>

            <View style={styles.step}>
              <View style={styles.numberCircle}><Text style={styles.numberText}>2</Text></View>
              <View style={styles.stepContent}>
                <Text style={styles.stepTitle}>WLAN-Einstellungen öffnen</Text>
                <Text style={styles.stepDesc}>
                  Gehe in die Systemeinstellungen deines Smartphones und öffne das WLAN-Menü.
                </Text>
              </View>
            </View>

            <View style={styles.step}>
              <View style={styles.numberCircle}><Text style={styles.numberText}>3</Text></View>
              <View style={styles.stepContent}>
                <Text style={styles.stepTitle}>Mit Kamera verbinden</Text>
                <Text style={styles.stepDesc}>
                  Wähle das Netzwerk deiner Kamera aus:
                </Text>
                <View style={styles.infoBox}>
                  <Text style={styles.infoText}>
                    🌐 <Text style={{ fontWeight: 'bold' }}>Insta360:</Text> Netzwerk heißt meist <Text style={{ fontFamily: 'monospace' }}>Insta360...</Text> (Passwort: <Text style={{ fontFamily: 'monospace' }}>88888888</Text>).
                  </Text>
                  <Text style={[styles.infoText, { marginTop: 6 }]}>
                    🌐 <Text style={{ fontWeight: 'bold' }}>Ricoh Theta:</Text> Netzwerk heißt meist <Text style={{ fontFamily: 'monospace' }}>THETA...</Text> (Passwort sind die Ziffern des Netzwerknamens, z.B. <Text style={{ fontFamily: 'monospace' }}>00123456</Text>).
                  </Text>
                </View>
              </View>
            </View>

            <View style={styles.step}>
              <View style={styles.numberCircle}><Text style={styles.numberText}>4</Text></View>
              <View style={styles.stepContent}>
                <Text style={styles.stepTitle}>Zurückkehren</Text>
                <Text style={styles.stepDesc}>
                  Öffne diese App wieder. Die Kamera wird automatisch erkannt und ist aufnahmebereit!
                </Text>
              </View>
            </View>
          </ScrollView>

          <View style={styles.actions}>
            <TouchableOpacity style={styles.button} onPress={onClose}>
              <Text style={styles.buttonText}>Ok, verstanden</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  content: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 440,
    maxHeight: '80%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 5,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1C1C1E',
    marginBottom: 14,
    textAlign: 'center',
  },
  scroll: {
    marginBottom: 16,
  },
  intro: {
    fontSize: 14,
    color: '#3A3A3C',
    lineHeight: 20,
    marginBottom: 16,
  },
  step: {
    flexDirection: 'row',
    marginBottom: 20,
  },
  numberCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    marginTop: 2,
  },
  numberText: {
    color: 'white',
    fontSize: 14,
    fontWeight: 'bold',
  },
  stepContent: {
    flex: 1,
  },
  stepTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#1C1C1E',
    marginBottom: 4,
  },
  stepDesc: {
    fontSize: 13,
    color: '#8E8E93',
    lineHeight: 18,
  },
  infoBox: {
    backgroundColor: '#F2F2F7',
    padding: 10,
    borderRadius: 8,
    marginTop: 8,
  },
  infoText: {
    fontSize: 12,
    color: '#3A3A3C',
    lineHeight: 16,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'center',
  },
  button: {
    backgroundColor: '#007AFF',
    paddingVertical: 12,
    paddingHorizontal: 32,
    borderRadius: 24,
  },
  buttonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
});
