package com.refactor.app.push

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

class LocalReminderReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent?) {
        val kindName = intent?.getStringExtra(LocalReminderScheduler.EXTRA_KIND) ?: return
        val kind = runCatching { LocalReminderScheduler.Kind.valueOf(kindName) }.getOrNull() ?: return
        RefactorNotifications.showReminder(context, kind.title, kind.body)
    }
}
