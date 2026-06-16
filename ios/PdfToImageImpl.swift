import Foundation
import UIKit

/// Pure-Swift implementation of the PdfToImage TurboModule.
///
/// This class never imports React. The ObjC++ shim (`PdfToImage.mm`) adapts the
/// React promise blocks to the plain Swift closures used here, so all the
/// Core Graphics rendering lives in Swift with zero bridging-header glue.
///
/// Rasterization is done with Core Graphics (`CGPDFDocument` / `drawPDFPage`):
/// it's built into the OS (no third-party deps), handles encrypted PDFs via
/// `unlockWithPassword`, and lets us drive the exact pixel size + DPI.
@objc public class PdfToImageImpl: NSObject {

  // Error codes — kept in sync with `PdfToImageErrorCode` in src/index.tsx.
  private static let E_FILE_NOT_FOUND = "E_FILE_NOT_FOUND"
  private static let E_INVALID_PDF = "E_INVALID_PDF"
  private static let E_PASSWORD_REQUIRED = "E_PASSWORD_REQUIRED"
  private static let E_WRONG_PASSWORD = "E_WRONG_PASSWORD"
  private static let E_RENDER_FAILED = "E_RENDER_FAILED"
  private static let E_IO = "E_IO"

  // MARK: - getPdfInfo

  @objc public func getPdfInfo(
    _ source: String,
    options: [String: Any],
    resolve: @escaping (Any?) -> Void,
    reject: @escaping (String, String) -> Void
  ) {
    DispatchQueue.global(qos: .userInitiated).async {
      guard let url = Self.resolveURL(source),
        FileManager.default.fileExists(atPath: url.path)
      else {
        reject(Self.E_FILE_NOT_FOUND, "No PDF found at \(source)")
        return
      }
      guard let doc = CGPDFDocument(url as CFURL) else {
        reject(Self.E_INVALID_PDF, "Could not open \(source) as a PDF")
        return
      }

      let encrypted = doc.isEncrypted
      if encrypted && !doc.isUnlocked, let pw = options["password"] as? String {
        _ = doc.unlockWithPassword(pw)
      }

      let count = doc.numberOfPages
      var pages: [[String: Any]] = []
      if count > 0 {
        for i in 1...count {
          guard let page = doc.page(at: i) else { continue }
          let size = Self.displaySize(of: page)
          pages.append([
            "width": Double(size.width),
            "height": Double(size.height),
          ])
        }
      }

      resolve([
        "pageCount": count,
        "isEncrypted": encrypted,
        "pages": pages,
      ])
    }
  }

  // MARK: - convert

  @objc public func convert(
    _ source: String,
    options: [String: Any],
    resolve: @escaping (Any?) -> Void,
    reject: @escaping (String, String) -> Void
  ) {
    DispatchQueue.global(qos: .userInitiated).async {
      guard let url = Self.resolveURL(source),
        FileManager.default.fileExists(atPath: url.path)
      else {
        reject(Self.E_FILE_NOT_FOUND, "No PDF found at \(source)")
        return
      }
      guard let doc = CGPDFDocument(url as CFURL) else {
        reject(Self.E_INVALID_PDF, "Could not open \(source) as a PDF")
        return
      }

      // Unlock encrypted documents before rendering — content streams stay
      // protected until the right password is supplied.
      if doc.isEncrypted && !doc.isUnlocked {
        guard let pw = options["password"] as? String, !pw.isEmpty else {
          reject(Self.E_PASSWORD_REQUIRED, "PDF is encrypted; a password is required")
          return
        }
        if !doc.unlockWithPassword(pw) {
          reject(Self.E_WRONG_PASSWORD, "Incorrect password for the PDF")
          return
        }
      }

      let total = doc.numberOfPages
      if total == 0 {
        resolve([])
        return
      }

      // Resolve the inclusive 0-based range (-1/-1 means "all pages").
      var from = Self.int(options, "fromPage") ?? -1
      var to = Self.int(options, "toPage") ?? -1
      if from < 0 || to < 0 {
        from = 0
        to = total - 1
      }
      from = max(0, from)
      to = min(total - 1, to)
      if from > to {
        // Out of range — JS maps the empty result to E_PAGE_OUT_OF_RANGE.
        resolve([])
        return
      }

      // Resolution: explicit DPI wins, else `scale` (multiple of 72 DPI).
      var scale: CGFloat
      if let dpi = Self.double(options, "dpi"), dpi > 0 {
        scale = CGFloat(dpi / 72.0)
      } else {
        scale = CGFloat(Self.double(options, "scale") ?? 2.0)
      }
      let maxWidth = Self.double(options, "maxWidth")
      let maxHeight = Self.double(options, "maxHeight")

      var format = (options["format"] as? String) ?? "jpeg"
      // iOS has no built-in WebP encoder — fall back to PNG and report it.
      if format == "webp" { format = "png" }
      let ext = format == "jpeg" ? "jpg" : "png"
      let quality = CGFloat(Self.double(options, "quality") ?? 0.9)
      let bgColor = Self.parseColor(options["backgroundColor"] as? String)
      let output = (options["output"] as? String) ?? "file"
      let wantsFile = output == "file" || output == "both"
      let wantsBase64 = output == "base64" || output == "both"

      // Output directory: explicit dir, else the app cache dir (disposable,
      // not backed up). Created on demand.
      let dir: URL
      if let outDir = options["outputDir"] as? String, !outDir.isEmpty {
        dir = Self.resolveURL(outDir) ?? URL(fileURLWithPath: NSTemporaryDirectory())
      } else {
        dir =
          FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask).first
          ?? URL(fileURLWithPath: NSTemporaryDirectory())
      }
      if wantsFile {
        try? FileManager.default.createDirectory(
          at: dir, withIntermediateDirectories: true)
      }
      let prefix =
        (options["filePrefix"] as? String).flatMap { $0.isEmpty ? nil : $0 }
        ?? url.deletingPathExtension().lastPathComponent

      var results: [[String: Any]] = []
      for pageIndex in from...to {
        // Render → encode → write → free, one page at a time, so memory stays
        // flat even for large documents.
        var failure: (String, String)?
        autoreleasepool {
          guard let page = doc.page(at: pageIndex + 1) else {
            failure = (Self.E_RENDER_FAILED, "Could not read page \(pageIndex)")
            return
          }

          let displaySize = Self.displaySize(of: page)
          var px = CGSize(
            width: displaySize.width * scale,
            height: displaySize.height * scale)

          // Constrain to maxWidth/maxHeight, preserving aspect ratio.
          var ratio: CGFloat = 1
          if let mw = maxWidth, mw > 0, px.width > CGFloat(mw) {
            ratio = min(ratio, CGFloat(mw) / px.width)
          }
          if let mh = maxHeight, mh > 0, px.height > CGFloat(mh) {
            ratio = min(ratio, CGFloat(mh) / px.height)
          }
          px = CGSize(
            width: max(1, (px.width * ratio).rounded()),
            height: max(1, (px.height * ratio).rounded()))

          let fmt = UIGraphicsImageRendererFormat()
          fmt.scale = 1  // `px` is already in pixels.
          fmt.opaque = format == "jpeg"  // JPEG has no alpha channel.
          let renderer = UIGraphicsImageRenderer(size: px, format: fmt)
          let image = renderer.image { ctx in
            let cg = ctx.cgContext
            bgColor.setFill()
            cg.fill(CGRect(origin: .zero, size: px))
            // PDF space is bottom-left origin; UIKit is top-left. Flip Y, then
            // let Core Graphics fit (and rotate) the page into the pixel rect.
            cg.translateBy(x: 0, y: px.height)
            cg.scaleBy(x: 1, y: -1)
            let transform = page.getDrawingTransform(
              .mediaBox,
              rect: CGRect(origin: .zero, size: px),
              rotate: 0,
              preserveAspectRatio: true)
            cg.concatenate(transform)
            cg.drawPDFPage(page)
          }

          let data: Data? =
            format == "jpeg" ? image.jpegData(compressionQuality: quality) : image.pngData()
          guard let bytes = data else {
            failure = (Self.E_RENDER_FAILED, "Failed to encode page \(pageIndex)")
            return
          }

          var uri = ""
          if wantsFile {
            let fileURL = dir.appendingPathComponent("\(prefix)-\(pageIndex).\(ext)")
            do {
              try bytes.write(to: fileURL, options: .atomic)
              uri = fileURL.absoluteString
            } catch {
              failure = (Self.E_IO, "Failed to write \(fileURL.path): \(error.localizedDescription)")
              return
            }
          }

          var entry: [String: Any] = [
            "uri": uri,
            "page": pageIndex,
            "width": Int(px.width),
            "height": Int(px.height),
            "format": format,
          ]
          if wantsBase64 {
            entry["base64"] = bytes.base64EncodedString()
          }
          results.append(entry)
        }

        if let (code, message) = failure {
          reject(code, message)
          return
        }
      }

      resolve(results)
    }
  }

  // MARK: - Helpers

  /// The page size as displayed (media box, with width/height swapped for
  /// pages rotated 90°/270°), in points at 72 DPI.
  private static func displaySize(of page: CGPDFPage) -> CGSize {
    let box = page.getBoxRect(.mediaBox)
    let rotation = abs(page.rotationAngle % 360)
    if rotation == 90 || rotation == 270 {
      return CGSize(width: box.height, height: box.width)
    }
    return CGSize(width: box.width, height: box.height)
  }

  private static func resolveURL(_ source: String) -> URL? {
    if source.hasPrefix("file://") {
      if let u = URL(string: source) { return u }
      let raw = String(source.dropFirst("file://".count))
      return URL(fileURLWithPath: raw.removingPercentEncoding ?? raw)
    }
    if source.hasPrefix("/") {
      return URL(fileURLWithPath: source)
    }
    return URL(string: source) ?? URL(fileURLWithPath: source)
  }

  private static func double(_ options: [String: Any], _ key: String) -> Double? {
    (options[key] as? NSNumber)?.doubleValue
  }

  private static func int(_ options: [String: Any], _ key: String) -> Int? {
    (options[key] as? NSNumber)?.intValue
  }

  /// Parse `#RGB`, `#RRGGBB`, or `#RRGGBBAA`. Defaults to opaque white.
  private static func parseColor(_ hex: String?) -> UIColor {
    guard var h = hex, h.hasPrefix("#") else { return .white }
    h.removeFirst()
    if h.count == 3 {
      h = h.map { "\($0)\($0)" }.joined()
    }
    guard h.count == 6 || h.count == 8, let value = UInt64(h, radix: 16) else {
      return .white
    }
    let r: CGFloat
    let g: CGFloat
    let b: CGFloat
    let a: CGFloat
    if h.count == 8 {
      r = CGFloat((value >> 24) & 0xFF) / 255
      g = CGFloat((value >> 16) & 0xFF) / 255
      b = CGFloat((value >> 8) & 0xFF) / 255
      a = CGFloat(value & 0xFF) / 255
    } else {
      r = CGFloat((value >> 16) & 0xFF) / 255
      g = CGFloat((value >> 8) & 0xFF) / 255
      b = CGFloat(value & 0xFF) / 255
      a = 1
    }
    return UIColor(red: r, green: g, blue: b, alpha: a)
  }
}
