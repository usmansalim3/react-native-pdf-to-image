package com.pdftoimage

import android.graphics.Bitmap
import android.graphics.pdf.LoadParams
import android.graphics.pdf.PdfRenderer
import android.net.Uri
import android.os.Build
import android.os.ParcelFileDescriptor
import android.util.Base64
import androidx.annotation.RequiresApi
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.WritableArray
import com.facebook.react.bridge.WritableMap
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.FileOutputStream
import java.io.IOException
import kotlin.math.max
import kotlin.math.roundToInt

/**
 * Android implementation of the PdfToImage TurboModule.
 *
 * Rasterization uses the platform `android.graphics.pdf.PdfRenderer` (API 21+):
 * no third-party deps, and it drives the exact output pixel size. Behavior is
 * kept in lock-step with the iOS Swift implementation — same options, the same
 * `PdfToImageErrorCode` codes, the same result shape, and the same
 * render → encode → write → recycle loop so memory stays flat on big documents.
 *
 * Password-protected PDFs are only openable on API 35+ (`PdfRenderer.LoadParams`);
 * on older versions an encrypted PDF rejects with `E_PASSWORD_REQUIRED`.
 */
class PdfToImageModule(private val reactContext: ReactApplicationContext) :
  NativePdfToImageSpec(reactContext) {

  // MARK: - getPdfInfo

  override fun getPdfInfo(source: String, options: ReadableMap, promise: Promise) {
    Thread {
      val pfd = openPfd(source)
      if (pfd == null) {
        promise.reject(E_FILE_NOT_FOUND, "No PDF found at $source")
        return@Thread
      }
      var renderer: PdfRenderer? = null
      try {
        val opened = openRenderer(pfd, optString(options, "password"))
        when (opened.status) {
          OpenStatus.INVALID -> {
            promise.reject(E_INVALID_PDF, "Could not open $source as a PDF")
            return@Thread
          }
          // Locked and we have no usable password: report it as encrypted
          // (best effort — page count/sizes are unreadable while locked).
          OpenStatus.ENCRYPTED -> {
            val result = Arguments.createMap()
            result.putInt("pageCount", 0)
            result.putBoolean("isEncrypted", true)
            result.putArray("pages", Arguments.createArray())
            promise.resolve(result)
            return@Thread
          }
          OpenStatus.OK -> {}
        }

        renderer = opened.renderer!!
        val pages: WritableArray = Arguments.createArray()
        for (i in 0 until renderer.pageCount) {
          renderer.openPage(i).use { page ->
            val size = Arguments.createMap()
            size.putDouble("width", page.width.toDouble())
            size.putDouble("height", page.height.toDouble())
            pages.pushMap(size)
          }
        }

        val result = Arguments.createMap()
        result.putInt("pageCount", renderer.pageCount)
        result.putBoolean("isEncrypted", opened.encrypted)
        result.putArray("pages", pages)
        promise.resolve(result)
      } catch (e: Exception) {
        promise.reject(E_INVALID_PDF, "Could not read $source: ${e.message}")
      } finally {
        renderer?.close()
        try { pfd.close() } catch (_: IOException) {}
      }
    }.start()
  }

  // MARK: - convert

  override fun convert(source: String, options: ReadableMap, promise: Promise) {
    Thread {
      val pfd = openPfd(source)
      if (pfd == null) {
        promise.reject(E_FILE_NOT_FOUND, "No PDF found at $source")
        return@Thread
      }
      var renderer: PdfRenderer? = null
      try {
        val password = optString(options, "password")
        val opened = openRenderer(pfd, password)
        when (opened.status) {
          OpenStatus.INVALID -> {
            promise.reject(E_INVALID_PDF, "Could not open $source as a PDF")
            return@Thread
          }
          OpenStatus.ENCRYPTED -> {
            if (Build.VERSION.SDK_INT < 35) {
              promise.reject(
                E_PASSWORD_REQUIRED,
                "PDF is encrypted; password-protected PDFs require Android 15 (API 35)+")
            } else if (password.isNullOrEmpty()) {
              promise.reject(E_PASSWORD_REQUIRED, "PDF is encrypted; a password is required")
            } else {
              promise.reject(E_WRONG_PASSWORD, "Incorrect password for the PDF")
            }
            return@Thread
          }
          OpenStatus.OK -> {}
        }

        renderer = opened.renderer!!
        val total = renderer.pageCount
        if (total == 0) {
          promise.resolve(Arguments.createArray())
          return@Thread
        }

        // Resolve the inclusive 0-based range (-1/-1 means "all pages").
        var from = optInt(options, "fromPage") ?: -1
        var to = optInt(options, "toPage") ?: -1
        if (from < 0 || to < 0) {
          from = 0
          to = total - 1
        }
        from = max(0, from)
        to = minOf(total - 1, to)
        if (from > to) {
          // Out of range — JS maps the empty result to E_PAGE_OUT_OF_RANGE.
          promise.resolve(Arguments.createArray())
          return@Thread
        }

        // Resolution: explicit DPI wins, else `scale` (multiple of 72 DPI).
        val dpi = optDouble(options, "dpi")
        val scale = if (dpi != null && dpi > 0) dpi / 72.0 else (optDouble(options, "scale") ?: 2.0)
        val maxWidth = optDouble(options, "maxWidth")
        val maxHeight = optDouble(options, "maxHeight")

        val format = optString(options, "format") ?: "jpeg"
        val ext = when (format) {
          "jpeg" -> "jpg"
          "webp" -> "webp"
          else -> "png"
        }
        val quality = ((optDouble(options, "quality") ?: 0.9) * 100).roundToInt().coerceIn(0, 100)
        val bgColor = parseColor(optString(options, "backgroundColor"))
        val output = optString(options, "output") ?: "file"
        val wantsFile = output == "file" || output == "both"
        val wantsBase64 = output == "base64" || output == "both"

        // Output directory: explicit dir, else the app cache dir (disposable).
        // Created on demand.
        val dir: File = optString(options, "outputDir")
          ?.takeIf { it.isNotEmpty() }
          ?.let { fileFromPathOrUri(it) }
          ?: reactContext.cacheDir
        if (wantsFile) dir.mkdirs()
        val prefix = optString(options, "filePrefix")?.takeIf { it.isNotEmpty() }
          ?: sourceBaseName(source)

        val results: WritableArray = Arguments.createArray()
        for (pageIndex in from..to) {
          // Render → encode → write → recycle, one page at a time.
          val page = renderer.openPage(pageIndex)
          var bitmap: Bitmap? = null
          try {
            var pxW = page.width * scale
            var pxH = page.height * scale

            // Constrain to maxWidth/maxHeight, preserving aspect ratio.
            var ratio = 1.0
            if (maxWidth != null && maxWidth > 0 && pxW > maxWidth) {
              ratio = minOf(ratio, maxWidth / pxW)
            }
            if (maxHeight != null && maxHeight > 0 && pxH > maxHeight) {
              ratio = minOf(ratio, maxHeight / pxH)
            }
            val w = max(1, (pxW * ratio).roundToInt())
            val h = max(1, (pxH * ratio).roundToInt())

            bitmap = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
            // Solid fill behind transparent content (mirrors iOS, which always
            // paints the background before drawing the page).
            bitmap.eraseColor(bgColor)
            page.render(bitmap, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)

            val bytes = ByteArrayOutputStream().use { stream ->
              bitmap.compress(compressFormat(format), quality, stream)
              stream.toByteArray()
            }

            var uri = ""
            if (wantsFile) {
              val file = File(dir, "$prefix-$pageIndex.$ext")
              try {
                FileOutputStream(file).use { it.write(bytes) }
                uri = Uri.fromFile(file).toString()
              } catch (e: IOException) {
                promise.reject(E_IO, "Failed to write ${file.path}: ${e.message}")
                return@Thread
              }
            }

            val entry: WritableMap = Arguments.createMap()
            entry.putString("uri", uri)
            entry.putInt("page", pageIndex)
            entry.putInt("width", w)
            entry.putInt("height", h)
            entry.putString("format", format)
            if (wantsBase64) {
              entry.putString("base64", Base64.encodeToString(bytes, Base64.NO_WRAP))
            }
            results.pushMap(entry)
          } finally {
            bitmap?.recycle()
            page.close()
          }
        }

        promise.resolve(results)
      } catch (e: Exception) {
        promise.reject(E_RENDER_FAILED, "Failed to render $source: ${e.message}")
      } finally {
        renderer?.close()
        try { pfd.close() } catch (_: IOException) {}
      }
    }.start()
  }

  // MARK: - Opening

  private enum class OpenStatus { OK, ENCRYPTED, INVALID }

  private class Opened(
    val renderer: PdfRenderer?,
    val status: OpenStatus,
    val encrypted: Boolean,
  )

  /** Open a [PdfRenderer], using the password on API 35+ when one is supplied. */
  private fun openRenderer(pfd: ParcelFileDescriptor, password: String?): Opened {
    return try {
      if (!password.isNullOrEmpty() && Build.VERSION.SDK_INT >= 35) {
        Opened(openWithPassword(pfd, password), OpenStatus.OK, true)
      } else {
        Opened(PdfRenderer(pfd), OpenStatus.OK, false)
      }
    } catch (e: SecurityException) {
      Opened(null, OpenStatus.ENCRYPTED, true)
    } catch (e: IOException) {
      Opened(null, OpenStatus.INVALID, false)
    } catch (e: Exception) {
      Opened(null, OpenStatus.INVALID, false)
    }
  }

  // Isolated so the API-35 `LoadParams` class is only loaded when actually used.
  @RequiresApi(35)
  private fun openWithPassword(pfd: ParcelFileDescriptor, password: String): PdfRenderer {
    val params = LoadParams.Builder().setPassword(password).build()
    return PdfRenderer(pfd, params)
  }

  /**
   * Open a seekable read-only descriptor for `content://`, `file://`, or a plain
   * filesystem path. Returns null when the source can't be opened (missing file,
   * unreadable provider, …) — the caller maps that to `E_FILE_NOT_FOUND`.
   */
  private fun openPfd(source: String): ParcelFileDescriptor? {
    return try {
      when {
        source.startsWith("content://") ->
          reactContext.contentResolver.openFileDescriptor(Uri.parse(source), "r")
        else -> {
          val file = fileFromPathOrUri(source)
          if (!file.exists()) null
          else ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY)
        }
      }
    } catch (e: Exception) {
      null
    }
  }

  // MARK: - Helpers

  private fun fileFromPathOrUri(path: String): File =
    if (path.startsWith("file://")) File(Uri.parse(path).path ?: path) else File(path)

  private fun sourceBaseName(source: String): String {
    val name = if (source.startsWith("content://")) {
      Uri.parse(source).lastPathSegment ?: "page"
    } else {
      fileFromPathOrUri(source).name
    }
    return name.substringBeforeLast('.', name).ifEmpty { "page" }
  }

  private fun compressFormat(format: String): Bitmap.CompressFormat = when (format) {
    "jpeg" -> Bitmap.CompressFormat.JPEG
    "webp" ->
      if (Build.VERSION.SDK_INT >= 30) Bitmap.CompressFormat.WEBP_LOSSY
      else @Suppress("DEPRECATION") Bitmap.CompressFormat.WEBP
    else -> Bitmap.CompressFormat.PNG
  }

  private fun optString(options: ReadableMap, key: String): String? =
    if (options.hasKey(key) && !options.isNull(key)) options.getString(key) else null

  private fun optDouble(options: ReadableMap, key: String): Double? =
    if (options.hasKey(key) && !options.isNull(key)) options.getDouble(key) else null

  private fun optInt(options: ReadableMap, key: String): Int? =
    if (options.hasKey(key) && !options.isNull(key)) options.getInt(key) else null

  /** Parse `#RGB`, `#RRGGBB`, or `#RRGGBBAA`. Defaults to opaque white. */
  private fun parseColor(hex: String?): Int {
    var h = hex ?: return WHITE
    if (!h.startsWith("#")) return WHITE
    h = h.substring(1)
    if (h.length == 3) h = h.map { "$it$it" }.joinToString("")
    if (h.length != 6 && h.length != 8) return WHITE
    val value = h.toLongOrNull(16) ?: return WHITE
    return if (h.length == 8) {
      val r = (value shr 24) and 0xFF
      val g = (value shr 16) and 0xFF
      val b = (value shr 8) and 0xFF
      val a = value and 0xFF
      ((a shl 24) or (r shl 16) or (g shl 8) or b).toInt()
    } else {
      (0xFF000000L or value).toInt()
    }
  }

  companion object {
    const val NAME = NativePdfToImageSpec.NAME

    // Error codes — kept in sync with `PdfToImageErrorCode` in src/index.tsx.
    private const val E_FILE_NOT_FOUND = "E_FILE_NOT_FOUND"
    private const val E_INVALID_PDF = "E_INVALID_PDF"
    private const val E_PASSWORD_REQUIRED = "E_PASSWORD_REQUIRED"
    private const val E_WRONG_PASSWORD = "E_WRONG_PASSWORD"
    private const val E_RENDER_FAILED = "E_RENDER_FAILED"
    private const val E_IO = "E_IO"

    private const val WHITE = 0xFFFFFFFF.toInt()
  }
}
