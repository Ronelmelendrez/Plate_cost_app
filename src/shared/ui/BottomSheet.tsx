import type { ReactNode } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

interface BottomSheetProps {
  visible?: boolean;
  title: string;
  subtitle?: string;
  closeLabel: string;
  onClose: () => void;
  size?: 'content' | 'half';
  children: ReactNode;
}

export function BottomSheet({
  visible = true,
  title,
  subtitle,
  closeLabel,
  onClose,
  size = 'content',
  children,
}: BottomSheetProps) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent>
      <View className="flex-1 justify-end">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={closeLabel}
          onPress={onClose}
          className="absolute inset-0 bg-black/30"
        />
        <SafeAreaView
          edges={['bottom']}
          className="max-h-[90%] rounded-t-3xl border-t border-line bg-surface"
          style={size === 'half' ? { height: '50%' } : undefined}>
          <View className="items-center px-4 pb-3 pt-2.5">
            <View className="h-1 w-10 rounded-full bg-line" />
          </View>
          <View className="flex-row items-start justify-between gap-3 border-b border-line px-4 pb-3">
            <View className="min-w-0 flex-1 gap-1">
              <Text accessibilityRole="header" className="font-inter-semibold text-xl text-ink">
                {title}
              </Text>
              {subtitle ? (
                <Text className="font-inter text-sm leading-5 text-muted">{subtitle}</Text>
              ) : null}
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={closeLabel}
              onPress={onClose}
              className="min-h-12 min-w-12 items-center justify-center px-1">
              <Text className="font-inter-semibold text-base text-brand">{closeLabel}</Text>
            </Pressable>
          </View>
          {children}
        </SafeAreaView>
      </View>
    </Modal>
  );
}
