# react-native-pdf-to-image

Render PDF pages to images (PNG / JPEG / WebP) in React Native. Native, fast, and memory-safe — pages are rasterized one at a time and freed as they go, so even large documents stay flat on memory.

- 📄 Convert all pages, a single page, or an inclusive page range
- 🖼️ PNG, JPEG, and WebP (WebP is Android-only; iOS falls back to PNG)
- 📐 Size by `scale`, `dpi`, or a `maxWidth` / `maxHeight` cap (aspect preserved)
- 💾 Return file URIs, base64, or both
- 🔒 Encrypted / password-protected PDFs
- 🔎 Cheap `getPdfInfo()` — page count, per-page size, and encryption status without rasterizing
- ⚡️ Built on the New Architecture (TurboModules)

## Requirements

- React Native **New Architecture** enabled (TurboModules)
- iOS **15+** (uses PDFKit / Core Graphics)
- Android **API 24+** (uses `PdfRenderer`). Password-protected PDFs require **API 35+**.

## Installation

```sh
npm install @uzimandias/react-native-pdf-to-image
# or
yarn add @uzimandias/react-native-pdf-to-image
```

### iOS

```sh
cd ios && pod install
```

No extra setup on Android — autolinking handles it.

## Quick start

```ts
import { convert } from '@uzimandias/react-native-pdf-to-image';

const pages = await convert('file:///path/to/document.pdf', {
  format: 'jpeg',
  scale: 2, // 144 DPI
});

// pages[0] => { uri, page, width, height, format }
```

Render the result with a plain `<Image>`:

```tsx
import { Image } from 'react-native';

<Image source={{ uri: pages[0].uri }} style={{ width: 200, height: 280 }} />;
```

> **Note:** `source` must be a local `file://` path the native module can read. If your PDF comes from a document picker or a remote URL, copy it into the app's cache/documents directory first, then pass that path.

## API

### `getPdfInfo(source, password?) => Promise<PdfInfo>`

Read page count, per-page size (in points), and encryption status without rasterizing anything. Use it to lay out a viewer before rendering.

```ts
const info = await getPdfInfo('file:///doc.pdf');
// { pageCount: 12, isEncrypted: false, pages: [{ width: 595, height: 842 }, ...] }
```

### `convert(source, options?) => Promise<PageImage[]>`

Render **every** page.

```ts
const pages = await convert('file:///doc.pdf', { format: 'png', dpi: 300 });
```

### `convertPage(source, page, options?) => Promise<PageImage>`

Render a **single** page (0-based).

```ts
const cover = await convertPage('file:///doc.pdf', 0, { scale: 3 });
```

### `convertPages(source, from, to, options?) => Promise<PageImage[]>`

Render an inclusive **range** `[from, to]` (0-based).

```ts
const firstThree = await convertPages('file:///doc.pdf', 0, 2);
```

## Options (`ConvertOptions`)

| Option            | Type                           | Default       | Description                                                                                |
| ----------------- | ------------------------------ | ------------- | ----------------------------------------------------------------------------------------- |
| `scale`           | `number`                       | `2`           | Render resolution as a multiple of native 72 DPI. `1` = 72, `2` = 144, ~`4.16` = 300 DPI. |
| `dpi`             | `number`                       | —             | Target DPI. Overrides `scale` when set.                                                   |
| `maxWidth`        | `number`                       | —             | Cap output width in px; page scaled to fit (aspect preserved).                            |
| `maxHeight`       | `number`                       | —             | Cap output height in px; page scaled to fit (aspect preserved).                           |
| `format`          | `'png' \| 'jpeg' \| 'webp'`    | `'jpeg'`      | Output encoding. `webp` is Android-only; iOS falls back to `png`.                         |
| `quality`         | `number` (0–1)                 | `0.9`         | JPEG / WebP only (PNG is lossless).                                                        |
| `backgroundColor` | `string`                       | `'#FFFFFF'`   | Solid fill behind transparent content; used by JPEG.                                      |
| `password`        | `string`                       | —             | Password for encrypted PDFs (iOS + Android API 35+).                                       |
| `outputDir`       | `string`                       | app cache dir | Directory to write images into.                                                           |
| `filePrefix`      | `string`                       | source name   | Filename prefix for generated files.                                                      |
| `output`          | `'file' \| 'base64' \| 'both'` | `'file'`      | `file` → write image, return `uri`. `base64` → no disk write. `both` → file **and** base64. |

## Returned shape (`PageImage`)

```ts
interface PageImage {
  uri: string; // file:// URI to the written image ('' when output is 'base64')
  page: number; // 0-based page index
  width: number; // pixel width of the rendered image
  height: number; // pixel height of the rendered image
  format: 'png' | 'jpeg' | 'webp';
  base64?: string; // present only when output is 'base64' or 'both'
}
```

Using base64 output? Build a data URI for `<Image>`:

```ts
const page = await convertPage('file:///doc.pdf', 0, { output: 'base64' });
const uri = `data:image/${page.format};base64,${page.base64}`;
```

## Error handling

Rejected promises carry a stable `error.code`. Match against `PdfToImageErrorCode`:

```ts
import { convert, PdfToImageErrorCode } from '@uzimandias/react-native-pdf-to-image';

try {
  await convert('file:///doc.pdf', { password: 'wrong' });
} catch (e) {
  if (e.code === PdfToImageErrorCode.WRONG_PASSWORD) {
    // prompt for the right password
  }
}
```

| Code                  | Meaning                                       |
| --------------------- | --------------------------------------------- |
| `E_FILE_NOT_FOUND`    | Source path does not exist.                   |
| `E_INVALID_PDF`       | File is not a readable PDF.                    |
| `E_PASSWORD_REQUIRED` | PDF is encrypted and no password was given.   |
| `E_WRONG_PASSWORD`    | Supplied password was rejected.               |
| `E_PAGE_OUT_OF_RANGE` | Requested page index is outside the document. |
| `E_RENDER_FAILED`     | A page failed to rasterize.                   |
| `E_IO`                | Failed to write the output file.              |

## Example app

A full example exercising every option lives in [`example/`](example/):

```sh
yarn
yarn example ios     # or: yarn example android
```

## Contributing

See the [contributing guide](CONTRIBUTING.md) to learn how to contribute to the repository and the development workflow.

- [Development workflow](CONTRIBUTING.md#development-workflow)
- [Sending a pull request](CONTRIBUTING.md#sending-a-pull-request)
- [Code of conduct](CODE_OF_CONDUCT.md)

## License

MIT © [Usman salim](https://github.com/usmansalim3)

---

Made with [create-react-native-library](https://github.com/callstack/react-native-builder-bob)
