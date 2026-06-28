import * as Haptics from 'expo-haptics';
import { useProjectStore } from '../store/useProjectStore';

export const triggerHaptic = {
  impactMedium: () => {
    const { settings } = useProjectStore.getState();
    if (settings.hapticsEnabled !== false) { // default to true if undefined
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    }
  },
  success: () => {
    const { settings } = useProjectStore.getState();
    if (settings.hapticsEnabled !== false) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    }
  },
  warning: () => {
    const { settings } = useProjectStore.getState();
    if (settings.hapticsEnabled !== false) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
    }
  },
  selection: () => {
    const { settings } = useProjectStore.getState();
    if (settings.hapticsEnabled !== false) {
      Haptics.selectionAsync().catch(() => {});
    }
  }
};
