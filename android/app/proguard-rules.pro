# ProGuard configuration for Himalayan Koh Admin Android App

# Preserve WebView JavaScript interfaces and WebChromeClient
-keepattributes JavascriptInterface
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

-keepclassmembers class * extends android.webkit.WebChromeClient {
    public *;
}

-keepclassmembers class * extends android.webkit.WebViewClient {
    public *;
}
