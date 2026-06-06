package com.refactor.app.ui.profile

import android.content.Intent
import android.os.Build
import android.provider.Settings
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.refactor.app.prefs.NotificationPrefs
import com.refactor.app.push.LocalReminderScheduler

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NotificationSettingsScreen(
    onBack: () -> Unit,
    notificationPrefs: NotificationPrefs,
) {
    val ctx = LocalContext.current
    var mealOn by remember { mutableStateOf(notificationPrefs.mealReminders()) }
    var workoutOn by remember { mutableStateOf(notificationPrefs.workoutReminders()) }
    var hydrationOn by remember { mutableStateOf(notificationPrefs.hydrationReminders()) }
    var coachOn by remember { mutableStateOf(notificationPrefs.coachCheckIns()) }
    var notificationsEnabled by remember {
        mutableStateOf(NotificationManagerCompat.from(ctx).areNotificationsEnabled())
    }

    val permissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission(),
    ) { granted ->
        notificationsEnabled = granted || NotificationManagerCompat.from(ctx).areNotificationsEnabled()
        if (notificationsEnabled) {
            LocalReminderScheduler.rescheduleAll(ctx, notificationPrefs)
        }
    }

    fun update(kind: LocalReminderScheduler.Kind, enabled: Boolean, setter: (Boolean) -> Unit) {
        setter(enabled)
        when (kind) {
            LocalReminderScheduler.Kind.MEAL -> notificationPrefs.setMealReminders(enabled)
            LocalReminderScheduler.Kind.WORKOUT -> notificationPrefs.setWorkoutReminders(enabled)
            LocalReminderScheduler.Kind.HYDRATION -> notificationPrefs.setHydrationReminders(enabled)
            LocalReminderScheduler.Kind.COACH -> notificationPrefs.setCoachCheckIns(enabled)
        }
        LocalReminderScheduler.schedule(ctx, kind, enabled && notificationsEnabled)
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Notifications") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
            )
        },
    ) { padding ->
        Column(
            Modifier
                .fillMaxSize()
                .padding(padding)
                .verticalScroll(rememberScrollState())
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            if (notificationsEnabled) {
                Text("Notifications enabled", color = MaterialTheme.colorScheme.primary)
            } else {
                Text("Notifications disabled", color = MaterialTheme.colorScheme.error)
                TextButton(
                    onClick = {
                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                            if (ContextCompat.checkSelfPermission(ctx, android.Manifest.permission.POST_NOTIFICATIONS)
                                != android.content.pm.PackageManager.PERMISSION_GRANTED
                            ) {
                                permissionLauncher.launch(android.Manifest.permission.POST_NOTIFICATIONS)
                            } else {
                                ctx.startActivity(Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).apply {
                                    putExtra(Settings.EXTRA_APP_PACKAGE, ctx.packageName)
                                })
                            }
                        } else {
                            notificationsEnabled = true
                            LocalReminderScheduler.rescheduleAll(ctx, notificationPrefs)
                        }
                    },
                ) { Text(if (Build.VERSION.SDK_INT >= 33) "Enable Notifications" else "Open Settings") }
            }

            val togglesEnabled = notificationsEnabled
            ReminderToggle("Meal Reminders (12 pm daily)", mealOn, togglesEnabled) {
                update(LocalReminderScheduler.Kind.MEAL, it) { mealOn = it }
            }
            ReminderToggle("Workout Reminders (7 am daily)", workoutOn, togglesEnabled) {
                update(LocalReminderScheduler.Kind.WORKOUT, it) { workoutOn = it }
            }
            ReminderToggle("Hydration Reminders (3 pm daily)", hydrationOn, togglesEnabled) {
                update(LocalReminderScheduler.Kind.HYDRATION, it) { hydrationOn = it }
            }
            ReminderToggle("Coach Check-Ins (8 pm daily)", coachOn, togglesEnabled) {
                update(LocalReminderScheduler.Kind.COACH, it) { coachOn = it }
            }
        }
    }
}

@Composable
private fun ReminderToggle(label: String, checked: Boolean, enabled: Boolean, onChange: (Boolean) -> Unit) {
    Row(
        Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(label, modifier = Modifier.weight(1f).padding(end = 8.dp))
        Switch(checked = checked, onCheckedChange = onChange, enabled = enabled)
    }
}
