import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { colors } from '@theme/colors';
import { spacing } from '@theme/spacing';

export function Loading() {
  return (
    <View style={styles.wrap} accessibilityLabel="Loading">
      <ActivityIndicator color={colors.text} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    padding: spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
