package com.refactor.app.widget

import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context
import android.widget.RemoteViews
import com.refactor.app.R
import com.refactor.app.api.dto.SyncGetResponse
import com.refactor.app.ui.dashboard.activityCalorieAdjustmentForDate
import com.refactor.app.ui.dashboard.todaysMacroTargets
import com.refactor.app.ui.workouts.WorkoutProgramSchedule
import java.time.LocalDate
import kotlin.math.roundToInt

object RecompWidgetUpdater {

    private const val PREFS = "recomp_widget_summary"
    private const val KEY_TITLE = "title"
    private const val KEY_HEADLINE = "headline"
    private const val KEY_SUB = "subtitle"

    fun updateFromSnapshot(context: Context, snap: SyncGetResponse) {
        val today = LocalDate.now()
        val todayIso = today.toString()

        // Calories left is the number people actually open the widget to check. This used
        // to show XP, which changes rarely and answers nothing actionable.
        val targets = todaysMacroTargets(snap, today)
        val activityAdjustment = activityCalorieAdjustmentForDate(snap.activityLog, todayIso)
        val budget = targets.calories.roundToInt() + activityAdjustment
        val consumed = snap.meals
            ?.filter { it.date == todayIso }
            ?.sumOf { it.macros.calories }
            ?.roundToInt()
            ?: 0
        val headline = when {
            budget <= 0 -> "Open Refactor to sync"
            consumed > budget -> "${consumed - budget} cal over"
            else -> "${budget - consumed} cal left"
        }

        // Today's session — resolved through the schedule rather than taking the plan's
        // first day, which showed the same workout every day of the week.
        val workoutDay = snap.plan?.let { plan ->
            WorkoutProgramSchedule.planIndexForDate(plan, today)
                ?.let { idx -> plan.workoutPlan?.weeklyPlan?.getOrNull(idx) }
        }
        val subtitle = workoutDay
            ?.let { "${it.day} · ${it.focus}" }
            ?: "Rest day"

        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
            .putString(KEY_TITLE, snap.profile.name.ifBlank { "Refactor" })
            .putString(KEY_HEADLINE, headline)
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
        val headline = prefs.getString(KEY_HEADLINE, null) ?: "Open Refactor to sync"
        val sub = prefs.getString(KEY_SUB, "") ?: ""
        val views = RemoteViews(context.packageName, R.layout.widget_recomp).apply {
            setTextViewText(R.id.widget_title, title)
            setTextViewText(R.id.widget_headline, headline)
            setTextViewText(R.id.widget_subtitle, sub)
        }
        ids.forEach { mgr.updateAppWidget(it, views) }
    }
}
