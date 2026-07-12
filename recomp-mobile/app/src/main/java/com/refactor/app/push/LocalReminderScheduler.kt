package com.refactor.app.push

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import com.refactor.app.prefs.NotificationPrefs
import java.util.Calendar

object LocalReminderScheduler {

    enum class Kind(
        val id: String,
        val hour: Int,
        val title: String,
        val body: String,
    ) {
        MEAL("recomp.meal", 12, "Log your meals", "Keep your macro streak going."),
        WORKOUT("recomp.workout", 7, "Time to train", "Your workout plan is ready."),
        HYDRATION("recomp.hydration", 15, "Stay hydrated", "You're due for a water check-in."),
        COACH("recomp.coach", 20, "Daily check-in with Ref", "Tap to share your feedback."),
    }

    fun rescheduleAll(context: Context, prefs: NotificationPrefs) {
        schedule(context, Kind.MEAL, prefs.mealReminders())
        schedule(context, Kind.WORKOUT, prefs.workoutReminders())
        schedule(context, Kind.HYDRATION, prefs.hydrationReminders())
        schedule(context, Kind.COACH, prefs.coachCheckIns())
    }

    fun schedule(context: Context, kind: Kind, enabled: Boolean) {
        val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        val pi = pendingIntent(context, kind)
        if (!enabled) {
            alarmManager.cancel(pi)
            return
        }
        val triggerAt = nextTriggerMillis(kind.hour)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            alarmManager.setInexactRepeating(
                AlarmManager.RTC_WAKEUP,
                triggerAt,
                AlarmManager.INTERVAL_DAY,
                pi,
            )
        } else {
            @Suppress("DEPRECATION")
            alarmManager.setInexactRepeating(
                AlarmManager.RTC_WAKEUP,
                triggerAt,
                AlarmManager.INTERVAL_DAY,
                pi,
            )
        }
    }

    private fun pendingIntent(context: Context, kind: Kind): PendingIntent {
        val intent = Intent(context, LocalReminderReceiver::class.java).apply {
            putExtra(EXTRA_KIND, kind.name)
        }
        val flags = PendingIntent.FLAG_UPDATE_CURRENT or
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) PendingIntent.FLAG_IMMUTABLE else 0
        return PendingIntent.getBroadcast(context, kind.ordinal, intent, flags)
    }

    private fun nextTriggerMillis(hour: Int): Long {
        val cal = Calendar.getInstance()
        cal.set(Calendar.HOUR_OF_DAY, hour)
        cal.set(Calendar.MINUTE, 0)
        cal.set(Calendar.SECOND, 0)
        cal.set(Calendar.MILLISECOND, 0)
        if (cal.timeInMillis <= System.currentTimeMillis()) {
            cal.add(Calendar.DAY_OF_YEAR, 1)
        }
        return cal.timeInMillis
    }

    const val EXTRA_KIND = "reminder_kind"
}
