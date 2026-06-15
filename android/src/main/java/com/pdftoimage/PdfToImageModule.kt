package com.pdftoimage

import com.facebook.react.bridge.ReactApplicationContext

class PdfToImageModule(reactContext: ReactApplicationContext) :
  NativePdfToImageSpec(reactContext) {

  override fun multiply(a: Double, b: Double): Double {
    return a * b
  }

  companion object {
    const val NAME = NativePdfToImageSpec.NAME
  }
}
