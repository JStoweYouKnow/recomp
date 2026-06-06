package com.refactor.app.push

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.os.Build
import androidx.core.app.NotificationCompat
import com.refactor.app.R

object RefactorNotifications {

    const val CHANNEL_PUSH_ID = "refactor_push"
    const val CHANNEL_REMINDERS_ID = "refactor_reminders"

    fun ensurePushChannel(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val mgr = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        val channel = NotificationChannel(
            CHANNEL_PUSH_ID,
            context.getString(R.string.notification_channel_push_name),
            NotificationManager.IMPORTANCE_DEFAULT,
        )
        mgr.createNotificationChannel(channel)
    }

    fun ensureRemindersChannel(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val mgr = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        val channel = NotificationChannel(
            CHANNEL_REMINDERS_ID,
            context.getString(R.string.notification_channel_reminders_name),
            NotificationManager.IMPORTANCE_DEFAULT,
        )
        mgr.createNotificationChannel(channel)
    }

    fun showReminder(context: Context, title: String, body: String) {
        ensureRemindersChannel(context)
        val mgr = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        val notification = NotificationCompat.Builder(context, CHANNEL_REMINDERS_ID)
            .setSmallIcon(R.drawable.ic_launcher_foreground)
            .setContentTitle(title)
            .setContentText(body)
            .setAutoCancel(true)
            .build()
        mgr.notify(kindNotifyId(title), notification)
    }

    fun showPush(context: Context, title: String, body: String) {
        ensurePushChannel(context)
        val mgr = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        val notification = NotificationCompat.Builder(context, CHANNEL_PUSH_ID)
            .setSmallIcon(R.drawable.ic_launcher_foreground)
            .setContentTitle(title)
            .setContentText(body)
            .setAutoCancel(true)
            .build()
        mgr.notify((System.currentTimeMillis() % Int.MAX_VALUE).toInt(), notification)
    }

    private fun kindNotifyId(title: String): Int = title.hashCode()
}
