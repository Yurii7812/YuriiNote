package net.yurii.note

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.app.AlertDialog
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.provider.Settings
import android.net.Uri
import android.os.Bundle
import android.util.Base64
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import com.google.mlkit.vision.documentscanner.GmsDocumentScannerOptions
import com.google.mlkit.vision.documentscanner.GmsDocumentScanning
import com.google.mlkit.vision.documentscanner.GmsDocumentScanningResult
import android.webkit.*
import android.widget.EditText
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayInputStream
import java.io.File

// スマホ版: 画面は assets/phone/index.html（WebView）。書いたものは、受信箱（files/inbox/）に、新しいファイルとして置く。
// PC が USB（adb）で読んで取り込み、取り込んだファイルの名前を files/imported.json で返す。消すかどうかは、画面で利用者が決める。
class MainActivity : Activity() {
    private lateinit var web: WebView
    private var pendingCamera: PermissionRequest? = null
    private var chooser: ValueCallback<Array<Uri>>? = null
    private val host = "app.local"

    private val root: File get() = getExternalFilesDir(null) ?: filesDir
    private val inbox: File get() = File(root, "inbox").also { it.mkdirs() }
    private val trash: File get() = File(root, "trash").also { it.mkdirs() }   // スマホのごみ箱（消した写真・録音。戻せる）
    private var scanMode = "card"
    private fun js(code: String) = runOnUiThread { web.evaluateJavascript(code, null) }
    private fun safe(name: String): Boolean = Regex("^[A-Za-z0-9][A-Za-z0-9._-]*$").matches(name) && !name.contains("..")

    @SuppressLint("SetJavaScriptEnabled", "JavascriptInterface")
    override fun onCreate(b: Bundle?) {
        super.onCreate(b)
        // PC のノート・メモ帳の最後のページは、スマホには映さない（前の版が置いたものは、消す）。時系列記録の種類（kinds.json。名前だけ）は、同期するので消さない
        for (n in listOf("notes.json", "pmemo.json", "pc_memos.json")) File(root, n).delete()
        web = WebView(this)
        setContentView(web)
        web.settings.apply {
            javaScriptEnabled = true; domStorageEnabled = true; allowFileAccess = false; allowContentAccess = false
            mediaPlaybackRequiresUserGesture = false; setSupportZoom(false)
        }
        web.addJavascriptInterface(Bridge(), "Native")
        web.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(view: WebView, req: WebResourceRequest): WebResourceResponse? {
                if (req.url.host != host) return null
                val p = req.url.path ?: return null
                return try {
                    when {
                        p.startsWith("/phone/") -> asset(p.removePrefix("/"))
                        p.startsWith("/inbox/") -> { val n = p.removePrefix("/inbox/"); if (safe(n)) file(File(inbox, n)) else null }
                        p.startsWith("/trash/") -> { val n = p.removePrefix("/trash/"); if (safe(n)) file(File(trash, n)) else null }
                        else -> null
                    }
                } catch (e: Exception) { null }
            }
            override fun shouldOverrideUrlLoading(view: WebView, req: WebResourceRequest): Boolean = req.url.host != host
        }
        web.webChromeClient = object : WebChromeClient() {
            override fun onPermissionRequest(req: PermissionRequest) {
                runOnUiThread {
                    if (req.origin.host != host) { req.deny(); return@runOnUiThread }
                    if (checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) req.grant(req.resources)
                    else { pendingCamera = req; requestPermissions(arrayOf(Manifest.permission.CAMERA), 1) }
                }
            }
            override fun onShowFileChooser(w: WebView, cb: ValueCallback<Array<Uri>>, p: FileChooserParams): Boolean {
                chooser?.onReceiveValue(null); chooser = cb
                val i = Intent(Intent.ACTION_GET_CONTENT).apply { addCategory(Intent.CATEGORY_OPENABLE); type = "image/*"; putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true) }
                return try { startActivityForResult(Intent.createChooser(i, "写真を選ぶ"), 2); true } catch (e: Exception) { chooser = null; false }
            }
            override fun onJsConfirm(v: WebView, url: String, msg: String, r: JsResult): Boolean {
                AlertDialog.Builder(this@MainActivity).setMessage(msg).setPositiveButton("はい") { _, _ -> r.confirm() }.setNegativeButton("いいえ") { _, _ -> r.cancel() }.setOnCancelListener { r.cancel() }.show(); return true
            }
            override fun onJsAlert(v: WebView, url: String, msg: String, r: JsResult): Boolean {
                AlertDialog.Builder(this@MainActivity).setMessage(msg).setPositiveButton("OK") { _, _ -> r.confirm() }.setOnCancelListener { r.confirm() }.show(); return true
            }
            override fun onJsPrompt(v: WebView, url: String, msg: String, def: String?, r: JsPromptResult): Boolean {
                val e = EditText(this@MainActivity); e.setText(def ?: "")
                AlertDialog.Builder(this@MainActivity).setMessage(msg).setView(e).setPositiveButton("OK") { _, _ -> r.confirm(e.text.toString()) }.setNegativeButton("やめる") { _, _ -> r.cancel() }.setOnCancelListener { r.cancel() }.show(); return true
            }
        }
        web.loadUrl("https://$host/phone/index.html")
    }

    private fun asset(path: String): WebResourceResponse {
        val data = assets.open(path).readBytes()
        val mime = when { path.endsWith(".html") -> "text/html"; path.endsWith(".js") -> "text/javascript"; path.endsWith(".css") -> "text/css"; path.endsWith(".png") -> "image/png"; else -> "application/octet-stream" }
        return WebResourceResponse(mime, "utf-8", ByteArrayInputStream(data))
    }
    private fun file(f: File): WebResourceResponse? {
        if (!f.isFile) return null
        val mime = when { f.name.endsWith(".jpg") || f.name.endsWith(".jpeg") -> "image/jpeg"; f.name.endsWith(".png") -> "image/png"; f.name.endsWith(".m4a") -> "audio/mp4"; else -> "application/octet-stream" }
        return WebResourceResponse(mime, null, f.inputStream())
    }

    override fun onRequestPermissionsResult(code: Int, perms: Array<out String>, res: IntArray) {
        if (code == 7) { val ok = res.isNotEmpty() && res[0] == PackageManager.PERMISSION_GRANTED; if (ok) RecService.start(this); js("window.onRecState&&window.onRecState(" + JSONObject.quote(if (ok) "started" else "denied") + ")"); return }
        val r = pendingCamera ?: return; pendingCamera = null
        if (res.isNotEmpty() && res[0] == PackageManager.PERMISSION_GRANTED) r.grant(r.resources) else r.deny()
    }
    @Deprecated("Deprecated in Java")
    override fun onActivityResult(code: Int, result: Int, data: Intent?) {
        if (code == 5) { onScanned(result, data); return }
        if (code != 2) return
        val cb = chooser ?: return; chooser = null
        val uris = ArrayList<Uri>()
        if (result == RESULT_OK && data != null) { data.clipData?.let { c -> for (i in 0 until c.itemCount) uris.add(c.getItemAt(i).uri) } ?: data.data?.let { uris.add(it) } }
        cb.onReceiveValue(if (uris.isEmpty()) null else uris.toTypedArray())
    }
    // 文書スキャナーの結果: 縁で切り取った写真を受信箱に置き、画面に名前を渡す。見開き（spread）は、1 枚のまま渡し、折り目の位置も教える（分けるのは画面）
    private fun onScanned(result: Int, data: Intent?) {
        val r = if (result == RESULT_OK && data != null) GmsDocumentScanningResult.fromActivityResultIntent(data) else null
        val pages = r?.pages ?: emptyList()
        if (pages.isEmpty()) { js("window.onScanned&&window.onScanned('[]')"); return }
        val mode = scanMode
        Thread {
            val out = JSONArray(); val t = System.currentTimeMillis()
            pages.forEachIndexed { i, pg ->
                try {
                    val bytes = contentResolver.openInputStream(pg.imageUri)?.use { it.readBytes() } ?: return@forEachIndexed
                    if (mode == "spread") {
                        // 見開きは、1 枚のまま受信箱に置き、折り目（背骨）の位置を画像から探して、画面に渡す。分けるのは、画面で位置を確かめてから
                        val o = BitmapFactory.Options().apply { inJustDecodeBounds = true }; BitmapFactory.decodeByteArray(bytes, 0, bytes.size, o)
                        val name = "pmfull-$t-$i.jpg"; val tmp = File(inbox, "$name.tmp"); tmp.writeBytes(bytes); tmp.renameTo(File(inbox, name))
                        out.put(JSONObject().put("full", name).put("ratio", gutter(bytes, o.outWidth, o.outHeight)).put("w", o.outWidth).put("h", o.outHeight))
                    } else {
                        val name = "paper-$t-$i.jpg"; val tmp = File(inbox, "$name.tmp"); tmp.writeBytes(bytes); tmp.renameTo(File(inbox, name)); out.put(JSONArray().put(name))
                    }
                } catch (e: Exception) { }
            }
            js("window.onScanned&&window.onScanned(" + JSONObject.quote(out.toString()) + ")")
        }.start()
    }

    // 見開きの折り目: 長い辺の方向に、明るさの「谷」（背骨の影・縫い目）を探す。見つからなければ、真ん中
    private fun gutter(bytes: ByteArray, w: Int, h: Int): Double {
        try {
            var s = 1; while (maxOf(w, h) / s > 900) s *= 2
            val bmp = BitmapFactory.decodeByteArray(bytes, 0, bytes.size, BitmapFactory.Options().apply { inSampleSize = s }) ?: return 0.5
            val bw = bmp.width; val bh = bmp.height; val landscape = bw >= bh
            val px = IntArray(bw * bh); bmp.getPixels(px, 0, bw, 0, 0, bw, bh); bmp.recycle()
            val len = if (landscape) bw else bh; val cross = if (landscape) bh else bw
            val lo = (cross * 0.12).toInt(); val hi = (cross * 0.88).toInt()
            val prof = DoubleArray(len)
            for (a in 0 until len) {
                var sum = 0.0
                for (c in lo until hi) { val p = if (landscape) px[c * bw + a] else px[a * bw + c]; sum += 0.299 * ((p shr 16) and 255) + 0.587 * ((p shr 8) and 255) + 0.114 * (p and 255) }
                prof[a] = sum / (hi - lo)
            }
            val win = maxOf(2, (len * 0.012).toInt()); val sm = DoubleArray(len)
            for (a in 0 until len) { var t = 0.0; var n = 0; for (k in -win..win) { val j = a + k; if (j in 0 until len) { t += prof[j]; n++ } }; sm[a] = t / n }
            val far = maxOf(win * 3, (len * 0.05).toInt()); var best = -1; var bestScore = 0.0
            for (a in (len * 0.36).toInt()..(len * 0.64).toInt()) {
                val l = sm.getOrNull(a - far) ?: continue; val r = sm.getOrNull(a + far) ?: continue
                val score = (l + r) / 2 - sm[a]   // 両わきより、どれだけ暗いか
                if (score > bestScore) { bestScore = score; best = a }
            }
            return if (best >= 0 && bestScore >= 5.0) best.toDouble() / len else 0.5
        } catch (e: Exception) { return 0.5 }
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        web.evaluateJavascript("(window.onBack&&window.onBack())===true") { if (it != "true") moveTaskToBack(true) }
    }
    override fun onNewIntent(i: Intent) { super.onNewIntent(i); setIntent(i) }
    override fun onResume() {
        super.onResume()
        Alarm.stopRinging(this)
        val prompt = Alarm.takePrompt(this) || intent?.getBooleanExtra(Alarm.EXTRA_PROMPT, false) == true
        intent?.removeExtra(Alarm.EXTRA_PROMPT)
        // 戻ってきたら、今日のものを開く（通知から来たときは、メモ帳の入力まで）
        web.evaluateJavascript(if (prompt) "window.openPrompt&&window.openPrompt()" else "window.resumeToday&&window.resumeToday()", null)
    }

    // 画面（JS）から呼ぶ道具。名前は、英数字・ . _ - だけ
    inner class Bridge {
        @JavascriptInterface fun list(): String {
            val a = JSONArray(); inbox.listFiles()?.sortedBy { it.name }?.forEach { if (it.isFile && !it.name.endsWith(".tmp")) a.put(JSONObject().put("name", it.name).put("size", it.length())) }; return a.toString()
        }
        @JavascriptInterface fun read(name: String): String = if (safe(name)) File(inbox, name).takeIf { it.isFile }?.readText() ?: "" else ""
        @JavascriptInterface fun write(name: String, text: String): Boolean = put(name, text.toByteArray(Charsets.UTF_8))
        @JavascriptInterface fun writeB64(name: String, b64: String): Boolean = put(name, Base64.decode(b64, Base64.DEFAULT))
        @JavascriptInterface fun remove(name: String): Boolean = safe(name) && File(inbox, name).delete()
        // PC が置いたもの（取り込み済みの印だけ）
        @JavascriptInterface fun meta(name: String): String = if (name == "imported.json" || name == "kinds.json") File(root, name).takeIf { it.isFile }?.readText() ?: "" else ""   // kinds.json: PC の時系列記録の種類（項目の名前だけ）
        @JavascriptInterface fun url(name: String): String = if (safe(name)) "https://$host/inbox/$name" else ""
        // 紙の写真: 文書スキャナー（縁を見つけて切り取る。四隅は指で直せる）。mode: card（カード）／spread（メモ帳の見開き → 2 ページ）
        @JavascriptInterface fun scan(mode: String) = runOnUiThread {
            scanMode = if (mode == "spread") "spread" else "card"
            val opts = GmsDocumentScannerOptions.Builder().setGalleryImportAllowed(true).setPageLimit(if (scanMode == "spread") 20 else 40)
                .setResultFormats(GmsDocumentScannerOptions.RESULT_FORMAT_JPEG).setScannerMode(GmsDocumentScannerOptions.SCANNER_MODE_FULL).build()
            GmsDocumentScanning.getClient(opts).getStartScanIntent(this@MainActivity)
                .addOnSuccessListener { sender -> try { startIntentSenderForResult(sender, 5, null, 0, 0, 0) } catch (e: Exception) { js("window.onScanFail&&window.onScanFail(" + JSONObject.quote(e.message ?: "") + ")") } }
                .addOnFailureListener { e -> js("window.onScanFail&&window.onScanFail(" + JSONObject.quote(e.message ?: "") + ")") }
        }
        // ごみ箱: 受信箱のファイルを trash/ へ移す（戻せる）。名前の頭に、消した時刻を付ける
        @JavascriptInterface fun toTrash(name: String): Boolean = safe(name) && File(inbox, name).let { it.isFile && it.renameTo(File(trash, "${System.currentTimeMillis()}-$name")) }
        @JavascriptInterface fun trashList(): String {
            val a = JSONArray(); trash.listFiles()?.sortedByDescending { it.name }?.forEach { if (it.isFile) a.put(JSONObject().put("name", it.name).put("size", it.length())) }; return a.toString()
        }
        @JavascriptInterface fun fromTrash(name: String): Boolean {
            if (!safe(name)) return false
            val f = File(trash, name); val orig = name.replace(Regex("^\\d+-"), "")
            return f.isFile && safe(orig) && !File(inbox, orig).exists() && f.renameTo(File(inbox, orig))
        }
        @JavascriptInterface fun trashRead(name: String): String = if (safe(name)) File(trash, name).takeIf { it.isFile && name.endsWith(".json") }?.readText() ?: "" else ""
        @JavascriptInterface fun trashUrl(name: String): String = if (safe(name)) "https://$host/trash/$name" else ""
        @JavascriptInterface fun emptyTrash(): Int { var n = 0; trash.listFiles()?.forEach { if (it.delete()) n++ }; return n }
        // 録音（前面サービス。画面を消しても続く）
        @JavascriptInterface fun recStart(): String {
            if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) { runOnUiThread { requestPermissions(arrayOf(Manifest.permission.RECORD_AUDIO), 7) }; return "asking" }
            RecService.start(this@MainActivity); return "started"
        }
        @JavascriptInterface fun recStop() { RecService.stop(this@MainActivity) }
        @JavascriptInterface fun recState(): String = RecService.state()
        // 定期の通知（アラーム）
        @JavascriptInterface fun alarmGet(): String = Alarm.toJson(this@MainActivity)
        @JavascriptInterface fun alarmSet(json: String): String {
            val o = JSONObject(json)
            Alarm.save(this@MainActivity, Alarm.Cfg(o.optBoolean("on"), o.optInt("minutes", 60), o.optInt("from", 9), o.optInt("to", 23), o.optInt("ring", 0)))
            Alarm.schedule(this@MainActivity)
            return Alarm.toJson(this@MainActivity)
        }
        @JavascriptInterface fun askNotify() = runOnUiThread {
            if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), 3)
            else startActivity(Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, packageName))
        }
        @JavascriptInterface fun askExact() = runOnUiThread {
            if (Build.VERSION.SDK_INT >= 31) startActivity(Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, Uri.parse("package:$packageName")))
        }
        @JavascriptInterface fun pref(key: String): String = getSharedPreferences("yn", MODE_PRIVATE).getString(key, "") ?: ""
        @JavascriptInterface fun setPref(key: String, value: String) { getSharedPreferences("yn", MODE_PRIVATE).edit().putString(key, value).apply() }
        private fun put(name: String, bytes: ByteArray): Boolean {
            if (!safe(name)) return false
            val tmp = File(inbox, "$name.tmp"); tmp.writeBytes(bytes)
            return tmp.renameTo(File(inbox, name))
        }
    }
}
