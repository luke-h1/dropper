import * as Application from 'expo-application';
import Constants from 'expo-constants';
import { StyleSheet, Text, View } from 'react-native';

export default function Index() {
  const version = Application.nativeApplicationVersion ?? 'dev';
  const build = Application.nativeBuildVersion ?? 'dev';
  const channel = Constants.expoConfig?.extra?.updateChannel ?? 'none';

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Dropper Example</Text>
      <Text style={styles.subtitle}>
        Internal build, installed over the air.
      </Text>

      <View style={styles.card}>
        <Row label='Version' value={version} />
        <Row label='Build' value={build} />
        <Row label='Channel' value={String(channel)} />
      </View>
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 8,
  },
  title: { fontSize: 28, fontWeight: '700' },
  subtitle: { fontSize: 15, opacity: 0.6, marginBottom: 24 },
  card: {
    alignSelf: 'stretch',
    gap: 12,
    padding: 20,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#8884',
  },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  label: { fontSize: 15, opacity: 0.6 },
  value: { fontSize: 15, fontWeight: '600', fontVariant: ['tabular-nums'] },
});
