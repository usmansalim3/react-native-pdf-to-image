import { TurboModuleRegistry, type TurboModule } from 'react-native';

/**
 * Codegen spec for the PdfToImage TurboModule (New Architecture).
 *
 * NOTE: Codegen has no support for method overloads, string-literal unions, or
 * enums, and it turns richly-optional option objects into rigid native structs.
 * To stay robust across RN versions we keep the *options* parameters as the
 * generic `Object` type here and apply the full, ergonomic typing in
 * `src/index.tsx`. Return shapes are stable, so those are typed properly.
 */

export interface NativePageSize {
  /** Page width in points (1pt = 1/72 inch), at native 72 DPI. */
  width: number;
  /** Page height in points. */
  height: number;
}

export interface NativePdfInfo {
  pageCount: number;
  isEncrypted: boolean;
  pages: NativePageSize[];
}

export interface NativePageImage {
  /** file:// URI to the written image (empty string when skipFile is set). */
  uri: string;
  /** 0-based page index. */
  page: number;
  /** Pixel width of the rendered image. */
  width: number;
  /** Pixel height of the rendered image. */
  height: number;
  /** Encoding used: 'png' | 'jpeg' | 'webp'. */
  format: string;
  /** Base64 of the encoded image; present only when output is 'base64'|'both'. */
  base64?: string;
}

export interface Spec extends TurboModule {
  /**
   * Read page count / sizes / encryption without rasterizing.
   * `options` carries an optional `password`.
   */
  getPdfInfo(source: string, options: Object): Promise<NativePdfInfo>;

  /**
   * Render pages to encoded image files (and/or base64).
   * `options` is the normalized option bag built in index.tsx, including
   * `fromPage`/`toPage` (inclusive, 0-based; both -1 means "all pages").
   */
  convert(source: string, options: Object): Promise<NativePageImage[]>;
}

export default TurboModuleRegistry.getEnforcing<Spec>('PdfToImage');
