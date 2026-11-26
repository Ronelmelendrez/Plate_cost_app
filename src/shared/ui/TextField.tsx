import { Text, TextInput, View } from 'react-native';

import { Colors } from '@shared/theme';

interface TextFieldProps {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  onBlur?: () => void;
  keyboardType?: 'default' | 'decimal-pad';
  placeholder?: string;
  prefix?: string;
  suffix?: string;
  helperText?: string;
  error?: string;
  accessibilityLabel?: string;
}

export function TextField({
  label,
  value,
  onChangeText,
  onBlur,
  keyboardType = 'default',
  placeholder,
  prefix,
  suffix,
  helperText,
  error,
  accessibilityLabel,
}: TextFieldProps) {
  return (
    <View className="gap-2">
      <Text className="text-sm font-semibold text-ink">{label}</Text>
      <View className="min-h-12 flex-row items-center rounded-xl border border-line bg-surface px-3">
        {prefix ? <Text className="me-2 text-base text-muted">{prefix}</Text> : null}
        <TextInput
          accessibilityLabel={accessibilityLabel ?? label}
          value={value}
          onChangeText={onChangeText}
          onBlur={onBlur}
          keyboardType={keyboardType}
          selectTextOnFocus={keyboardType === 'decimal-pad'}
          placeholder={placeholder}
          placeholderTextColor={Colors.light.tabIconDefault}
          className="min-h-12 flex-1 p-0 text-base text-ink"
          returnKeyType="done"
        />
        {suffix ? <Text className="ms-2 text-base text-muted">{suffix}</Text> : null}
      </View>
      {error ? (
        <Text accessibilityRole="alert" className="text-sm text-bad">
          {error}
        </Text>
      ) : helperText ? (
        <Text className="text-sm text-muted">{helperText}</Text>
      ) : null}
    </View>
  );
}
