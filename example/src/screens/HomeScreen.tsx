import { useState } from 'react';
import { Text, View, StyleSheet, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  pick,
  keepLocalCopy,
  types,
  errorCodes,
  isErrorWithCode,
} from '@react-native-documents/picker';
import {
  convert,
  convertPages,
  getPdfInfo,
  type PdfInfo,
  type PdfImageFormat,
  type ConvertOptions,
} from '@uzimandias/react-native-pdf-to-image';
import { theme, Card, Label, Button, Segmented, Field, Row } from '../ui';
import type { RootStackParamList } from '../App';

type Props = NativeStackScreenProps<RootStackParamList, 'Home'>;

// Parse a numeric field; empty/invalid → undefined so the option is omitted.
const num = (t: string): number | undefined => {
  const n = parseFloat(t);
  return t.trim() !== '' && !Number.isNaN(n) ? n : undefined;
};
const str = (t: string): string | undefined =>
  t.trim() !== '' ? t : undefined;

export default function HomeScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();

  const [source, setSource] = useState('');

  // Sizing
  const [sizeMode, setSizeMode] = useState<'scale' | 'dpi'>('scale');
  const [scale, setScale] = useState('2');
  const [dpi, setDpi] = useState('150');
  const [maxWidth, setMaxWidth] = useState('');
  const [maxHeight, setMaxHeight] = useState('');

  // Encoding
  const [format, setFormat] = useState<PdfImageFormat>('jpeg');
  const [quality, setQuality] = useState('0.9');
  const [backgroundColor, setBackgroundColor] = useState('#FFFFFF');

  // Source / output
  const [password, setPassword] = useState('');
  const [output, setOutput] =
    useState<NonNullable<ConvertOptions['output']>>('file');
  const [outputDir, setOutputDir] = useState('');
  const [filePrefix, setFilePrefix] = useState('');

  // Pages
  const [pageMode, setPageMode] = useState<'all' | 'range'>('all');
  const [fromPage, setFromPage] = useState('0');
  const [toPage, setToPage] = useState('0');

  const [info, setInfo] = useState<PdfInfo | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<'pick' | 'info' | 'convert' | null>(null);

  const run = async (
    kind: 'pick' | 'info' | 'convert',
    fn: () => Promise<void>
  ) => {
    setError('');
    setBusy(kind);
    try {
      await fn();
    } catch (e: any) {
      setError(`${e?.code ?? 'ERR'}: ${e?.message ?? String(e)}`);
    } finally {
      setBusy(null);
    }
  };

  const buildOptions = (): ConvertOptions => {
    const opts: ConvertOptions = {
      format,
      output,
      maxWidth: num(maxWidth),
      maxHeight: num(maxHeight),
      backgroundColor: str(backgroundColor),
      password: str(password),
      outputDir: str(outputDir),
      filePrefix: str(filePrefix),
    };
    if (sizeMode === 'dpi') opts.dpi = num(dpi);
    else opts.scale = num(scale);
    if (format !== 'png') opts.quality = num(quality);
    return opts;
  };

  // Pick a PDF and copy it into the app cache so the native module has a stable
  // file:// path to read (the raw picker URI can be a transient, scoped URL).
  const onPick = () =>
    run('pick', async () => {
      try {
        const [file] = await pick({ type: [types.pdf] });
        if (!file) return;
        const [copy] = await keepLocalCopy({
          files: [{ uri: file.uri, fileName: file.name ?? 'document.pdf' }],
          destination: 'cachesDirectory',
        });
        setSource(copy && copy.status === 'success' ? copy.localUri : file.uri);
        setInfo(null);
      } catch (e) {
        if (isErrorWithCode(e) && e.code === errorCodes.OPERATION_CANCELED) {
          return;
        }
        throw e;
      }
    });

  const onGetInfo = () =>
    run('info', async () => setInfo(await getPdfInfo(source, str(password))));

  const onConvert = () =>
    run('convert', async () => {
      const opts = buildOptions();
      const pages =
        pageMode === 'all'
          ? await convert(source, opts)
          : await convertPages(
              source,
              num(fromPage) ?? 0,
              num(toPage) ?? 0,
              opts
            );
      if (pages.length === 0) {
        throw Object.assign(new Error('No pages were produced'), {
          code: 'E_EMPTY',
        });
      }
      navigation.navigate('Preview', { pages });
    });

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 24 }]}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.title}>PDF → Image</Text>
      <Text style={styles.subtitle}>
        Every TurboModule option, wired end to end.
      </Text>

      {/* Source */}
      <Card style={styles.section}>
        <Field
          label="Source"
          placeholder="file:// path, or pick a PDF"
          autoCapitalize="none"
          autoCorrect={false}
          value={source}
          onChangeText={setSource}
        />
        <Row>
          <View style={styles.flex}>
            <Button
              title={busy === 'pick' ? 'Opening…' : 'Pick PDF'}
              onPress={onPick}
              disabled={busy !== null}
            />
          </View>
          <View style={styles.flex}>
            <Button
              title={busy === 'info' ? 'Reading…' : 'Get info'}
              variant="ghost"
              onPress={onGetInfo}
              disabled={!source || busy !== null}
            />
          </View>
        </Row>
        {info && (
          <View style={styles.infoRow}>
            <Text style={styles.infoText}>
              {info.pageCount} page{info.pageCount === 1 ? '' : 's'}
            </Text>
            <Text style={styles.infoText}>
              {info.isEncrypted ? '🔒 encrypted' : 'unencrypted'}
            </Text>
            {info.pages[0] && (
              <Text style={styles.infoText}>
                {Math.round(info.pages[0].width)}×
                {Math.round(info.pages[0].height)} pt
              </Text>
            )}
          </View>
        )}
      </Card>

      {/* Sizing */}
      <Card style={styles.section}>
        <Label>Size by</Label>
        <Segmented
          value={sizeMode}
          onChange={setSizeMode}
          options={[
            { label: 'Scale (×)', value: 'scale' },
            { label: 'DPI', value: 'dpi' },
          ]}
        />
        <View style={styles.spacer} />
        {sizeMode === 'scale' ? (
          <Field
            label="Scale"
            hint="Multiple of 72 DPI. 1 = 72dpi, 2 = 144dpi."
            keyboardType="decimal-pad"
            value={scale}
            onChangeText={setScale}
            placeholder="2"
          />
        ) : (
          <Field
            label="DPI"
            hint="Target dots per inch. Overrides scale."
            keyboardType="number-pad"
            value={dpi}
            onChangeText={setDpi}
            placeholder="150"
          />
        )}
        <View style={styles.spacer} />
        <Row>
          <Field
            label="Max width"
            hint="px cap, optional"
            keyboardType="number-pad"
            value={maxWidth}
            onChangeText={setMaxWidth}
            placeholder="—"
          />
          <Field
            label="Max height"
            hint="px cap, optional"
            keyboardType="number-pad"
            value={maxHeight}
            onChangeText={setMaxHeight}
            placeholder="—"
          />
        </Row>
      </Card>

      {/* Encoding */}
      <Card style={styles.section}>
        <Label>Format</Label>
        <Segmented
          value={format}
          onChange={setFormat}
          options={[
            { label: 'JPEG', value: 'jpeg' },
            { label: 'PNG', value: 'png' },
            { label: 'WebP', value: 'webp' },
          ]}
        />
        <View style={styles.spacer} />
        {format !== 'png' && (
          <>
            <Field
              label={`Quality (${format.toUpperCase()}, 0–1)`}
              keyboardType="decimal-pad"
              value={quality}
              onChangeText={setQuality}
              placeholder="0.9"
            />
            <View style={styles.spacer} />
          </>
        )}
        <Field
          label="Background color"
          hint="Hex behind transparent content (used by JPEG)."
          autoCapitalize="none"
          autoCorrect={false}
          value={backgroundColor}
          onChangeText={setBackgroundColor}
          placeholder="#FFFFFF"
        />
      </Card>

      {/* Pages */}
      <Card style={styles.section}>
        <Label>Pages</Label>
        <Segmented
          value={pageMode}
          onChange={setPageMode}
          options={[
            { label: 'All', value: 'all' },
            { label: 'Range', value: 'range' },
          ]}
        />
        {pageMode === 'range' && (
          <>
            <View style={styles.spacer} />
            <Row>
              <Field
                label="From"
                hint="0-based, inclusive"
                keyboardType="number-pad"
                value={fromPage}
                onChangeText={setFromPage}
                placeholder="0"
              />
              <Field
                label="To"
                hint="0-based, inclusive"
                keyboardType="number-pad"
                value={toPage}
                onChangeText={setToPage}
                placeholder="0"
              />
            </Row>
          </>
        )}
      </Card>

      {/* Output */}
      <Card style={styles.section}>
        <Label>Output</Label>
        <Segmented
          value={output}
          onChange={setOutput}
          options={[
            { label: 'File', value: 'file' },
            { label: 'Base64', value: 'base64' },
            { label: 'Both', value: 'both' },
          ]}
        />
        <View style={styles.spacer} />
        <Field
          label="Password"
          hint="For encrypted PDFs (iOS + Android API 35+)."
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry
          value={password}
          onChangeText={setPassword}
          placeholder="—"
        />
        <View style={styles.spacer} />
        <Field
          label="Output dir"
          hint="Defaults to the app cache dir."
          autoCapitalize="none"
          autoCorrect={false}
          value={outputDir}
          onChangeText={setOutputDir}
          placeholder="—"
        />
        <View style={styles.spacer} />
        <Field
          label="File prefix"
          hint="Defaults to the source file name."
          autoCapitalize="none"
          autoCorrect={false}
          value={filePrefix}
          onChangeText={setFilePrefix}
          placeholder="—"
        />
      </Card>

      <Button
        title={busy === 'convert' ? 'Converting…' : 'Convert & preview'}
        onPress={onConvert}
        disabled={!source || busy !== null}
      />

      {error !== '' && <Text style={styles.error}>{error}</Text>}
      <View style={{ height: insets.bottom + 24 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.bg },
  content: { padding: 16, gap: 14 },
  title: { color: theme.text, fontSize: 28, fontWeight: '700' },
  subtitle: { color: theme.textDim, fontSize: 15, marginBottom: 6 },
  section: { gap: 4 },
  infoRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 14,
  },
  infoText: { color: theme.text, fontSize: 14 },
  flex: { flex: 1 },
  spacer: { height: 16 },
  error: { color: theme.danger, fontSize: 14, marginTop: 4 },
});
