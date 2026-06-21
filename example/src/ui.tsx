import type { ReactNode } from 'react';
import {
  Text,
  View,
  StyleSheet,
  Pressable,
  TextInput,
  type ViewStyle,
  type StyleProp,
  type TextInputProps,
} from 'react-native';
import type { PageImage } from '@uzimandias/react-native-pdf-to-image';

/** Shared dark theme — reads well behind rendered page images. */
export const theme = {
  bg: '#0d1117',
  card: '#161b22',
  border: '#30363d',
  text: '#e6edf3',
  textDim: '#8b949e',
  accent: '#2f81f7',
  danger: '#f85149',
};

/**
 * Build an <Image> source for a converted page. Falls back to a base64 data
 * URI when the page was produced with `output: 'base64'` (no file on disk).
 */
export function imageSource(page: PageImage): { uri: string } {
  if (page.uri) return { uri: page.uri };
  const mime = page.format === 'jpeg' ? 'jpeg' : page.format;
  return { uri: `data:image/${mime};base64,${page.base64 ?? ''}` };
}

export function Card({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Label({ children }: { children: ReactNode }) {
  return <Text style={styles.label}>{children}</Text>;
}

export function Button({
  title,
  onPress,
  variant = 'primary',
  disabled,
}: {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'ghost';
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        variant === 'ghost' && styles.buttonGhost,
        (pressed || disabled) && styles.buttonPressed,
      ]}
    >
      <Text
        style={[
          styles.buttonText,
          variant === 'ghost' && styles.buttonTextGhost,
        ]}
      >
        {title}
      </Text>
    </Pressable>
  );
}

/** Lay children out in a horizontal row with equal-width columns. */
export function Row({ children }: { children: ReactNode }) {
  return <View style={styles.row}>{children}</View>;
}

/** A labeled text input. Spreads any TextInputProps (keyboardType, etc.). */
export function Field({
  label,
  hint,
  style,
  ...inputProps
}: {
  label: string;
  hint?: string;
  style?: StyleProp<ViewStyle>;
} & TextInputProps) {
  return (
    <View style={[styles.field, style]}>
      <Label>{label}</Label>
      <TextInput
        style={styles.input}
        placeholderTextColor={theme.textDim}
        {...inputProps}
      />
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

/** A simple inline option picker. `T` is the option value type. */
export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
}: {
  options: readonly { label: string; value: T }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <View style={styles.segment}>
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <Pressable
            key={String(opt.value)}
            onPress={() => onChange(opt.value)}
            style={[styles.segmentItem, active && styles.segmentItemActive]}
          >
            <Text
              style={[styles.segmentText, active && styles.segmentTextActive]}
            >
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.border,
    padding: 16,
  },
  label: {
    color: theme.textDim,
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  button: {
    backgroundColor: theme.accent,
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: 'center',
  },
  buttonGhost: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: theme.border,
  },
  buttonPressed: { opacity: 0.6 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  buttonTextGhost: { color: theme.text },
  segment: {
    flexDirection: 'row',
    backgroundColor: theme.bg,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.border,
    padding: 3,
  },
  segmentItem: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 7,
    alignItems: 'center',
  },
  segmentItemActive: { backgroundColor: theme.accent },
  segmentText: { color: theme.textDim, fontSize: 14, fontWeight: '600' },
  segmentTextActive: { color: '#fff' },
  row: { flexDirection: 'row', gap: 10 },
  field: { flex: 1 },
  input: {
    backgroundColor: theme.bg,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 10,
    padding: 12,
    color: theme.text,
  },
  hint: { color: theme.textDim, fontSize: 12, marginTop: 6 },
});
