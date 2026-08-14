import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { health } from '@api/client';
import { userFacingMessage } from '@api/errors';
import { ErrorBanner } from '@components/ErrorBanner';
import { Loading } from '@components/Loading';
import { colors } from '@theme/colors';
import { radius } from '@theme/radius';
import { spacing } from '@theme/spacing';
import { typography } from '@theme/typography';

type HealthState =
  | { status: 'loading' }
  | { status: 'ok'; version?: string }
  | { status: 'error'; message: string };

export function HealthScreen() {
  const [state, setState] = useState<HealthState>({ status: 'loading' });

  const load = useCallback(async () => {
    setState({ status: 'loading' });
    try {
      const result = await health();
      setState({ status: 'ok', version: result.version });
    } catch (error) {
      setState({ status: 'error', message: userFacingMessage(error) });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <View style={styles.screen}>
      <Text style={styles.title}>Recall</Text>
      <View style={styles.card}>
        {state.status === 'loading' ? <Loading /> : null}
        {state.status === 'ok' ? (
          <View>
            <Text style={styles.ok}>ok: true</Text>
            {state.version ? <Text style={styles.meta}>version {state.version}</Text> : null}
          </View>
        ) : null}
        {state.status === 'error' ? (
          <ErrorBanner message={state.message} onRetry={() => void load()} />
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
    padding: spacing.xl,
    justifyContent: 'center',
  },
  title: {
    ...typography.title,
    color: colors.text,
    marginBottom: spacing.lg,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  ok: {
    color: colors.success,
    fontSize: 16,
    fontWeight: '600',
  },
  meta: {
    color: colors.text2,
    marginTop: spacing.sm,
  },
});
