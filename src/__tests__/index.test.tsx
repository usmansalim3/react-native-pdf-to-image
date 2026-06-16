import { describe, it, expect, jest } from '@jest/globals';

// The TurboModule isn't available in the Jest environment, so stub the native
// spec and assert the JS layer normalizes options and page ranges correctly.
jest.mock('../NativePdfToImage', () => ({
  __esModule: true,
  default: {
    convert: jest.fn(async () => []),
    getPdfInfo: jest.fn(async () => ({
      pageCount: 0,
      isEncrypted: false,
      pages: [],
    })),
  },
}));

const native = require('../NativePdfToImage').default as {
  convert: jest.Mock<any>;
  getPdfInfo: jest.Mock<any>;
};
const {
  convert: convertAll,
  convertPage,
  convertPages,
  getPdfInfo: info,
} = require('../index');

const lastOptions = (mock: jest.Mock<any>): any =>
  mock.mock.calls[mock.mock.calls.length - 1]![1];

describe('option + range normalization', () => {
  it('convert() requests all pages with -1/-1', async () => {
    await convertAll('/tmp/a.pdf');
    const [source] = native.convert.mock.calls[0] as [string, any];
    expect(source).toBe('/tmp/a.pdf');
    expect(lastOptions(native.convert).fromPage).toBe(-1);
    expect(lastOptions(native.convert).toPage).toBe(-1);
  });

  it('applies defaults (jpeg, q0.9, white bg, file) and forwards overrides', async () => {
    await convertAll('/tmp/a.pdf', { scale: 3, format: 'png' });
    const o = lastOptions(native.convert);
    expect(o.scale).toBe(3);
    expect(o.format).toBe('png');
    expect(o.quality).toBe(0.9);
    expect(o.backgroundColor).toBe('#FFFFFF');
    expect(o.output).toBe('file');
  });

  it('convertPage() pins from===to to the page', async () => {
    native.convert.mockResolvedValueOnce([{ uri: 'file://x', page: 4 }]);
    await convertPage('/tmp/a.pdf', 4);
    const o = lastOptions(native.convert);
    expect(o.fromPage).toBe(4);
    expect(o.toPage).toBe(4);
  });

  it('convertPage() rejects with PAGE_OUT_OF_RANGE when empty', async () => {
    native.convert.mockResolvedValueOnce([]);
    await expect(convertPage('/tmp/a.pdf', 99)).rejects.toMatchObject({
      code: 'E_PAGE_OUT_OF_RANGE',
    });
  });

  it('convertPages() forwards an inclusive range', async () => {
    await convertPages('/tmp/a.pdf', 2, 5);
    const o = lastOptions(native.convert);
    expect(o.fromPage).toBe(2);
    expect(o.toPage).toBe(5);
  });

  it('getPdfInfo() forwards the password in options', async () => {
    await info('/tmp/a.pdf', 'hunter2');
    expect(lastOptions(native.getPdfInfo).password).toBe('hunter2');
  });
});
