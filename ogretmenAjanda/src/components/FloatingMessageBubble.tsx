import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  subscribeUnreadCount,
  fetchUnreadMessageCount,
  markAllMessagesAsRead,
  setCachedUnreadCount,
} from '../services/messageNotificationService';

interface FloatingMessageBubbleProps {
  onPress: () => void;
  schoolId?: string;
  bottomOffset?: number;
  rightOffset?: number;
}

export const FloatingMessageBubble: React.FC<FloatingMessageBubbleProps> = ({
  onPress,
  schoolId,
  bottomOffset = 84,
  rightOffset = 18,
}) => {
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [isMinimized, setIsMinimized] = useState<boolean>(false);
  const [isDismissed, setIsDismissed] = useState<boolean>(false);
  const lastSeenCountRef = useRef<number>(0);

  // Animations
  const scaleAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Subscribe to central unread message service
  useEffect(() => {
    const unsubscribe = subscribeUnreadCount((count) => {
      if (count <= 0) {
        setUnreadCount(0);
        setIsDismissed(false);
      } else {
        // Yalnızca yeni mesaj sayısı arttığında dismissed durumu sıfırlanır
        if (count > lastSeenCountRef.current) {
          setIsDismissed(false);
        }
        lastSeenCountRef.current = count;
        setUnreadCount(count);
      }
    });

    // İlk sorguyu yap
    fetchUnreadMessageCount(schoolId);

    // Periyodik olarak 30 saniyede bir kontrol et
    const interval = setInterval(() => {
      fetchUnreadMessageCount(schoolId);
    }, 30000);

    return () => {
      unsubscribe();
      clearInterval(interval);
    };
  }, [schoolId]);

  // Giriş ve Nabız (Pulse) Animasyonu
  useEffect(() => {
    if (unreadCount > 0 && !isDismissed) {
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 5,
        tension: 80,
        useNativeDriver: true,
      }).start();

      // Hafif nabız döngüsü
      const pulseLoop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.08,
            duration: 800,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 800,
            useNativeDriver: true,
          }),
        ])
      );
      pulseLoop.start();

      return () => pulseLoop.stop();
    } else {
      Animated.timing(scaleAnim, {
        toValue: 0,
        duration: 250,
        useNativeDriver: true,
      }).start();
    }
  }, [unreadCount, isDismissed]);

  const handlePress = () => {
    // Balona tıklandığında anında ekrandan kaldır ve okunmuş işaretle
    setUnreadCount(0);
    setIsDismissed(true);
    setCachedUnreadCount(0);
    markAllMessagesAsRead(schoolId);
    onPress();
  };

  const handleDismiss = () => {
    // Kapatma butonuna tıklandığında balonu gizle ve okundu say
    setUnreadCount(0);
    setIsDismissed(true);
    setCachedUnreadCount(0);
    markAllMessagesAsRead(schoolId);
  };

  if (unreadCount <= 0 || isDismissed) {
    return null;
  }

  const badgeText = unreadCount > 99 ? '99+' : `${unreadCount}`;

  return (
    <Animated.View
      style={[
        styles.floatingContainer,
        {
          bottom: bottomOffset,
          right: rightOffset,
          transform: [{ scale: scaleAnim }],
        },
      ]}
      pointerEvents="box-none"
    >
      {isMinimized ? (
        // Küçültülmüş dairesel ikon baloncuk
        <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
          <TouchableOpacity
            style={styles.minimizedBubble}
            activeOpacity={0.85}
            onPress={handlePress}
          >
            <Ionicons name="chatbubbles" size={24} color="#FFFFFF" />
            <View style={styles.unreadBadge}>
              <Text style={styles.unreadBadgeText}>{badgeText}</Text>
            </View>
          </TouchableOpacity>
        </Animated.View>
      ) : (
        // Genişletilmiş interaktif bildirim hapı
        <Animated.View
          style={[styles.expandedCard, { transform: [{ scale: pulseAnim }] }]}
        >
          <TouchableOpacity
            style={styles.cardContent}
            activeOpacity={0.85}
            onPress={handlePress}
          >
            <View style={styles.iconCircle}>
              <Ionicons name="chatbubbles" size={20} color="#FFFFFF" />
              <View style={styles.unreadBadge}>
                <Text style={styles.unreadBadgeText}>{badgeText}</Text>
              </View>
            </View>
            <View style={styles.textContainer}>
              <Text style={styles.titleText}>Yeni Mesajınız Var!</Text>
              <Text style={styles.subtitleText}>
                {unreadCount} okunmamış mesajı gör
              </Text>
            </View>
            <View style={styles.actionArrow}>
              <Ionicons name="chevron-forward" size={16} color="#FFFFFF" />
            </View>
          </TouchableOpacity>

          {/* Kapatma / Okundu Sayma butonu */}
          <TouchableOpacity
            style={styles.closeBtn}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            onPress={handleDismiss}
          >
            <Ionicons name="close" size={14} color="rgba(255,255,255,0.85)" />
          </TouchableOpacity>
        </Animated.View>
      )}
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  floatingContainer: {
    position: 'absolute',
    zIndex: 9999,
    alignItems: 'flex-end',
    justifyContent: 'center',
    ...Platform.select({
      web: {
        position: 'fixed' as any,
      },
    }),
  },
  minimizedBubble: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: '#4F46E5',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#4338CA',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.45,
    shadowRadius: 10,
    elevation: 10,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.4)',
  },
  expandedCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#4338CA',
    borderRadius: 28,
    paddingLeft: 6,
    paddingRight: 10,
    paddingVertical: 6,
    shadowColor: '#312E81',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 14,
    elevation: 12,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  cardContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#6366F1',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  unreadBadge: {
    position: 'absolute',
    top: -4,
    right: -5,
    backgroundColor: '#EF4444',
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  unreadBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '900',
  },
  textContainer: {
    marginLeft: 10,
    marginRight: 6,
  },
  titleText: {
    color: '#FFFFFF',
    fontSize: 12.5,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  subtitleText: {
    color: 'rgba(255, 255, 255, 0.85)',
    fontSize: 11,
    fontWeight: '500',
  },
  actionArrow: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 4,
  },
  closeBtn: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(0, 0, 0, 0.25)',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 6,
  },
});
