import React, { useEffect, useRef, useState } from 'react';
import {
  Modal,
  View,
  StyleSheet,
  Animated,
  TouchableWithoutFeedback,
  Dimensions,
  Platform,
  KeyboardAvoidingView,
  StyleProp,
  ViewStyle,
} from 'react-native';

const { height } = Dimensions.get('window');

export interface TopSlideModalProps {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
  dismissible?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
  maxHeightPercent?: number; // Varsayılan 0.85
}

/**
 * Yukarıdan aşağıya kayarak açılan (Top-to-Bottom Slide) ve
 * ekranın üst kısmına konumlanarak telefon navigasyon tuşlarıyla
 * çakışmayı tamamen önleyen özel Modal bileşeni.
 */
export function TopSlideModal({
  visible,
  onClose,
  children,
  dismissible = true,
  contentStyle,
  maxHeightPercent = 0.85,
}: TopSlideModalProps) {
  const [showModal, setShowModal] = useState(visible);
  const translateY = useRef(new Animated.Value(-height * 0.75)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      setShowModal(true);
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 220,
          useNativeDriver: true,
        }),
        Animated.spring(translateY, {
          toValue: 0,
          friction: 8,
          tension: 65,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 0,
          duration: 180,
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: -height * 0.75,
          duration: 180,
          useNativeDriver: true,
        }),
      ]).start(() => {
        setShowModal(false);
      });
    }
  }, [visible]);

  if (!showModal) return null;

  return (
    <Modal
      transparent
      visible={showModal}
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.overlay}>
        {/* Karartma arka planı (Dışarı tıklandığında kapatır) */}
        <TouchableWithoutFeedback onPress={dismissible ? onClose : undefined}>
          <Animated.View style={[styles.backdrop, { opacity }]} />
        </TouchableWithoutFeedback>

        {/* Yukarıdan aşağı kayan içerik kutusu */}
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.keyboardContainer}
        >
          <Animated.View
            style={[
              styles.modalCard,
              {
                maxHeight: height * maxHeightPercent,
                transform: [{ translateY }],
              },
              contentStyle,
            ]}
          >
            {children}
          </Animated.View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-start',
    alignItems: 'center',
    paddingTop: Platform.OS === 'android' ? 36 : 52,
    paddingHorizontal: 16,
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
  },
  keyboardContainer: {
    width: '100%',
    alignItems: 'center',
  },
  modalCard: {
    width: '100%',
    maxWidth: 520,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.18,
    shadowRadius: 18,
    elevation: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
});
