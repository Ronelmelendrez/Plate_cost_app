import type { ReactNode } from 'react';
import { Pressable, Text } from 'react-native';

interface ButtonProps {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  variant?: 'primary' | 'secondary';
  icon?: ReactNode;
}

export function Button({
  label,
  onPress,
  disabled = false,
  variant = 'primary',
  icon,
}: ButtonProps) {
  const isPrimary = variant === 'primary';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      className={`min-h-14 flex-row items-center justify-center rounded-xl px-4 ${
        isPrimary ? 'bg-brand' : 'border border-line bg-surface'
      } ${disabled ? 'opacity-50' : ''}`}>
      {icon}
      <Text className={`text-base font-semibold ${isPrimary ? 'text-white' : 'text-ink'}`}>
        {label}
      </Text>
    </Pressable>
  );
}
