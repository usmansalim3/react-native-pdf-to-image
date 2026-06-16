import NativePdfToImage from './NativePdfToImage';

/** Output encoding. `webp` is Android-only; iOS falls back to `png`. */
export type PdfImageFormat = 'png' | 'jpeg' | 'webp';

export interface ConvertOptions {
  /**
   * Render resolution as a multiple of the native 72-DPI page size.
   * `1` = 72 DPI, `2` = 144 DPI (screen default), ~`4.16` = 300 DPI (print).
   * Ignored for an axis constrained by `maxWidth`/`maxHeight`.
   * @default 2
   */
  scale?: number;
  /** Target DPI. Overrides `scale` when set. */
  dpi?: number;
  /** Cap output width in px; page is scaled to fit (aspect preserved). */
  maxWidth?: number;
  /** Cap output height in px; page is scaled to fit (aspect preserved). */
  maxHeight?: number;
  /** @default 'jpeg' */
  format?: PdfImageFormat;
  /** 0–1, JPEG/WebP only (PNG is lossless). @default 0.9 */
  quality?: number;
  /** Solid fill behind transparent content; used by JPEG. @default '#FFFFFF' */
  backgroundColor?: string;
  /** Password for encrypted PDFs (iOS + Android API 35+). */
  password?: string;
  /** Directory to write images into. @default app cache dir */
  outputDir?: string;
  /** Filename prefix for generated files. @default the source file name */
  filePrefix?: string;
  /**
   * What to return:
   * - `'file'`  — write an image file, return its `uri` (default).
   * - `'base64'`— return `base64` only, no disk write.
   * - `'both'`  — write a file *and* return `base64`. Heavy.
   * @default 'file'
   */
  output?: 'file' | 'base64' | 'both';
}

export interface PageImage {
  /** file:// URI to the written image, or '' when `skipFile` is set. */
  uri: string;
  /** 0-based page index. */
  page: number;
  /** Pixel width of the rendered image. */
  width: number;
  /** Pixel height of the rendered image. */
  height: number;
  format: PdfImageFormat;
  /** Present only when `output` is `'base64'` or `'both'`. */
  base64?: string;
}

export interface PdfInfo {
  pageCount: number;
  isEncrypted: boolean;
  /** Per-page native size in points (at 72 DPI). */
  pages: { width: number; height: number }[];
}

/** Stable error codes carried on rejected promises (`error.code`). */
export const PdfToImageErrorCode = {
  FILE_NOT_FOUND: 'E_FILE_NOT_FOUND',
  INVALID_PDF: 'E_INVALID_PDF',
  PASSWORD_REQUIRED: 'E_PASSWORD_REQUIRED',
  WRONG_PASSWORD: 'E_WRONG_PASSWORD',
  PAGE_OUT_OF_RANGE: 'E_PAGE_OUT_OF_RANGE',
  RENDER_FAILED: 'E_RENDER_FAILED',
  IO: 'E_IO',
} as const;

export type PdfToImageErrorCode =
  (typeof PdfToImageErrorCode)[keyof typeof PdfToImageErrorCode];

/**
 * Build the option bag handed to the native module. `fromPage`/`toPage` are
 * inclusive 0-based; `-1`/`-1` means "all pages". The native side reads these
 * flat keys, so everything the renderer needs is normalized here in one place.
 */
function buildOptions(
  options: ConvertOptions | undefined,
  fromPage: number,
  toPage: number
): Object {
  const o = options ?? {};
  return {
    scale: o.scale,
    dpi: o.dpi,
    maxWidth: o.maxWidth,
    maxHeight: o.maxHeight,
    format: o.format ?? 'jpeg',
    quality: o.quality ?? 0.9,
    backgroundColor: o.backgroundColor ?? '#FFFFFF',
    password: o.password,
    outputDir: o.outputDir,
    filePrefix: o.filePrefix,
    output: o.output ?? 'file',
    fromPage,
    toPage,
  };
}

/**
 * Read page count, per-page sizes, and encryption status without rasterizing.
 * Cheap — use it to lay out a viewer before rendering anything.
 */
export function getPdfInfo(
  source: string,
  password?: string
): Promise<PdfInfo> {
  return NativePdfToImage.getPdfInfo(source, { password }) as Promise<PdfInfo>;
}

/**
 * Render every page of the PDF to image files (and/or base64). Pages are
 * rasterized sequentially and freed as they go, so memory stays flat even for
 * large documents.
 */
export function convert(
  source: string,
  options?: ConvertOptions
): Promise<PageImage[]> {
  return NativePdfToImage.convert(
    source,
    buildOptions(options, -1, -1)
  ) as Promise<PageImage[]>;
}

/** Render a single page (0-based). */
export async function convertPage(
  source: string,
  page: number,
  options?: ConvertOptions
): Promise<PageImage> {
  const images = (await NativePdfToImage.convert(
    source,
    buildOptions(options, page, page)
  )) as PageImage[];
  const image = images[0];
  if (!image) {
    const err = new Error(`Page ${page} produced no image`) as Error & {
      code: string;
    };
    err.code = PdfToImageErrorCode.PAGE_OUT_OF_RANGE;
    throw err;
  }
  return image;
}

/** Render an inclusive page range `[from, to]` (0-based). */
export function convertPages(
  source: string,
  from: number,
  to: number,
  options?: ConvertOptions
): Promise<PageImage[]> {
  return NativePdfToImage.convert(
    source,
    buildOptions(options, from, to)
  ) as Promise<PageImage[]>;
}
