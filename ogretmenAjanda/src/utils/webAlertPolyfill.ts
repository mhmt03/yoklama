import { Alert, Platform, AlertButton } from 'react-native';

/**
 * react-native-web içinde Alert.alert bir no-op'tur (hiçbir şey göstermez).
 * Bu polyfill web platformunda Alert.alert çağrılarını tarayıcının
 * window.alert / window.confirm diyaloglarına yönlendirir.
 */
if (Platform.OS === 'web' && typeof window !== 'undefined') {
  (Alert as any).alert = (title?: string, message?: string, buttons?: AlertButton[]) => {
    const text = [title, message].filter(Boolean).join('\n\n');
    const list = buttons || [];

    if (list.length <= 1) {
      window.alert(text);
      list[0]?.onPress?.();
      return;
    }

    const cancelBtn = list.find((b) => b.style === 'cancel');
    const actionBtns = list.filter((b) => b !== cancelBtn);
    // Onay butonu: iptal olmayan son buton (genellikle asıl eylem)
    const confirmBtn = actionBtns[actionBtns.length - 1];

    const ok = window.confirm(text);
    if (ok) confirmBtn?.onPress?.();
    else cancelBtn?.onPress?.();
  };
}

export function showAlert(title: string, message?: string) {
  Alert.alert(title, message);
}

export function showConfirm(title: string, message: string, onConfirm: () => void) {
  Alert.alert(title, message, [
    { text: 'Vazgeç', style: 'cancel' },
    { text: 'Onayla', style: 'destructive', onPress: onConfirm },
  ]);
}
