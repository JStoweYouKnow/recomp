package com.refactor.app.ui

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue

/**
 * Bridges an app-shortcut / deep-link action (recomp://<host>) from MainActivity into the
 * Compose tree so AppShell can select the matching tab. Android equivalent of the iOS
 * App Intents that navigate on launch.
 */
object ShortcutRouter {
    /** Host of the launching recomp:// URI, e.g. "workout", "dashboard". Cleared once handled. */
    var pending by mutableStateOf<String?>(null)
}
