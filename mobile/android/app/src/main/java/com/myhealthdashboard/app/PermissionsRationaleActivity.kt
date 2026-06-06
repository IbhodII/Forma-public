package com.myhealthdashboard.app

import android.app.Activity
import android.os.Bundle
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient

/**
 * Privacy policy / rationale screen opened from Health Connect permission UI (Android 13 and below).
 */
class PermissionsRationaleActivity : Activity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    val webView = WebView(this)
    webView.webViewClient =
        object : WebViewClient() {
          override fun shouldOverrideUrlLoading(
              view: WebView?,
              request: WebResourceRequest?,
          ): Boolean = false
        }
    webView.loadUrl(
        "https://developer.android.com/health-and-fitness/guides/health-connect/develop/get-started",
    )
    setContentView(webView)
  }
}
