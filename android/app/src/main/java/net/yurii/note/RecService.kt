package net.yurii.note

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.media.MediaRecorder
import android.os.Build
import android.os.IBinder
import org.json.JSONObject
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

// 録音（画面を消しても、ほかのアプリに移っても止まらないよう、前面サービスで録る）。
// 録り終えたら、受信箱（files/inbox/）に rec-<id>.m4a と rec-<id>.json を置く。PC が取り込んで、文字化する（スマホでは文字化しない）
class RecService : Service() {
    companion object {
        const val CHANNEL = "yurii_note_rec_v1"
        private const val NOTE_ID = 7301
        @Volatile var file: File? = null
        @Volatile var startedAt: Long = 0L
        @Volatile var startedStamp: String = ""
        val on: Boolean get() = file != null

        fun stamp(t: Long): String = SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.US).format(Date(t))   // 保存は、いつも秒まで

        fun start(ctx: Context) {
            val i = Intent(ctx, RecService::class.java).setAction("start")
            if (Build.VERSION.SDK_INT >= 26) ctx.startForegroundService(i) else ctx.startService(i)
        }
        fun stop(ctx: Context) { ctx.startService(Intent(ctx, RecService::class.java).setAction("stop")) }
        fun state(): String {
            val f = file
            return JSONObject().put("on", f != null).put("file", f?.name ?: "").put("at", startedStamp)
                .put("sec", if (f != null) (System.currentTimeMillis() - startedAt) / 1000 else 0).toString()
        }
    }

    private var rec: MediaRecorder? = null

    override fun onBind(i: Intent?): IBinder? = null

    override fun onStartCommand(i: Intent?, flags: Int, id: Int): Int {
        when (i?.action) {
            "start" -> begin()
            "stop" -> finish()
        }
        return START_NOT_STICKY
    }

    private fun inbox(): File = File(getExternalFilesDir(null) ?: filesDir, "inbox").also { it.mkdirs() }

    private fun notification(): Notification {
        val nm = getSystemService(NotificationManager::class.java)
        if (Build.VERSION.SDK_INT >= 26 && nm.getNotificationChannel(CHANNEL) == null)
            nm.createNotificationChannel(NotificationChannel(CHANNEL, "録音", NotificationManager.IMPORTANCE_LOW))
        val open = PendingIntent.getActivity(this, 0, Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP), PendingIntent.FLAG_IMMUTABLE)
        val b = if (Build.VERSION.SDK_INT >= 26) Notification.Builder(this, CHANNEL) else @Suppress("DEPRECATION") Notification.Builder(this)
        return b.setSmallIcon(R.drawable.ic_note).setContentTitle("🎙️ 録音しています").setContentText("押すと、アプリに戻ります（止めるのはアプリの中で）")
            .setOngoing(true).setContentIntent(open).setUsesChronometer(true).setWhen(System.currentTimeMillis()).build()
    }

    private fun begin() {
        if (rec != null) return
        val n = notification()
        if (Build.VERSION.SDK_INT >= 29) startForeground(NOTE_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE) else startForeground(NOTE_ID, n)
        val now = System.currentTimeMillis()
        val f = File(inbox(), "rec-$now-${(1000..9999).random()}.m4a.part")   // 録り終えるまでは .part（PC は読まない）
        try {
            val r = if (Build.VERSION.SDK_INT >= 31) MediaRecorder(this) else @Suppress("DEPRECATION") MediaRecorder()
            r.setAudioSource(MediaRecorder.AudioSource.MIC)
            r.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
            r.setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
            r.setAudioChannels(1); r.setAudioSamplingRate(32000); r.setAudioEncodingBitRate(64000)
            r.setOutputFile(f.absolutePath)
            r.prepare(); r.start()
            rec = r; file = f; startedAt = now; startedStamp = stamp(now)
        } catch (e: Exception) {
            f.delete(); rec = null; file = null
            stopForeground(STOP_FOREGROUND_REMOVE); stopSelf()
        }
    }

    private fun finish() {
        val r = rec; val f = file
        rec = null; file = null
        if (r != null && f != null) {
            val sec = (System.currentTimeMillis() - startedAt) / 1000
            var ok = true
            try { r.stop() } catch (e: Exception) { ok = false }   // 短すぎると止められない（中身が無い）
            r.release()
            if (ok && f.length() > 0) {
                val audio = File(f.parent, f.name.removeSuffix(".part"))
                f.renameTo(audio)
                val json = JSONObject().put("type", "audio").put("at", startedStamp).put("file", audio.name).put("sec", sec).toString()
                val js = File(f.parent, audio.name.removeSuffix(".m4a") + ".json")
                val tmp = File(js.path + ".tmp"); tmp.writeText(json); tmp.renameTo(js)
            } else f.delete()
        }
        stopForeground(STOP_FOREGROUND_REMOVE); stopSelf()
    }

    override fun onDestroy() { if (rec != null) finish(); super.onDestroy() }
}
