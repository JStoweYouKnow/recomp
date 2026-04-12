import {
  notificationAsync,
  selectionAsync,
  impactAsync,
  NotificationFeedbackType,
  ImpactFeedbackStyle,
} from "expo-haptics";

export function hapticSuccess() {
  notificationAsync(NotificationFeedbackType.Success).catch(() => {});
}

export function hapticError() {
  notificationAsync(NotificationFeedbackType.Error).catch(() => {});
}

export function hapticSelection() {
  selectionAsync().catch(() => {});
}

export function hapticLight() {
  impactAsync(ImpactFeedbackStyle.Light).catch(() => {});
}
