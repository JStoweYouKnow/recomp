package com.refactor.app.widget

import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context
import android.widget.RemoteViews
import com.refactor.app.R
import com.refactor.app.api.dto.SyncGetResponse

object RecompWidgetUpdater {

    private const val PREFS = "recomp_widget_summary"
    private const val KEY_TITLE = "title"
    private const val KEY_XP = "xp"
    private const val KEY_SUB = "subtitle"

    fun updateFromSnapshot(context: Context, snap: SyncGetResponse) {
        val xp = snap.meta?.xp ?: 0
        val plan = snap.plan?.workoutPlan?.weeklyPlan?.firstOrNull()
        val subtitle = plan?.let { "${it.day} · ${it.focus}" } ?: "Synced"
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
            .putString(KEY_TITLE, snap.profile.name.ifBlank { "Refactor" })
            .putInt(KEY_XP, xp)
            .putString(KEY_SUB, subtitle)
            .apply()
        refreshWidgets(context)
    }

    fun refreshWidgets(context: Context) {
        val mgr = AppWidgetManager.getInstance(context)
        val ids = mgr.getAppWidgetIds(ComponentName(context, RecompAppWidgetProvider::class.java))
        if (ids.isEmpty()) return
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val title = prefs.getString(KEY_TITLE, null) ?: context.getString(R.string.app_name)
        val xp = prefs.getInt(KEY_XP, 0)
        val sub = prefs.getString(KEY_SUB, "") ?: ""
        val views = RemoteViews(context.packageName, R.layout.widget_recomp).apply {
            setTextViewText(R.id.widget_title, title)
            setTextViewText(R.id.widget_xp, context.getString(R.string.widget_xp_line, xp))
            setTextViewText(R.id.widget_subtitle, sub)
        }
        ids.forEach { mgr.updateAppWidget(it, views) }
    }
}
