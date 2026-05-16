package com.recomp.app.widget

import android.appwidget.AppWidgetProvider
import android.content.Context

class RecompAppWidgetProvider : AppWidgetProvider() {
    override fun onUpdate(
        context: Context,
        appWidgetManager: android.appwidget.AppWidgetManager,
        appWidgetIds: IntArray,
    ) {
        RecompWidgetUpdater.refreshWidgets(context)
    }
}
