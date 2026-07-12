package com.refactor.app.ui.profile

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import com.refactor.app.api.AuthRepository
import com.refactor.app.api.UserToolsRepository
import com.refactor.app.prefs.CoachSchedulePrefs
import com.refactor.app.prefs.MusicPrefs
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ClaimAccountScreen(
    onBack: () -> Unit,
    authRepository: AuthRepository,
) {
    val scope = rememberCoroutineScope()
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var claiming by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var claimed by remember { mutableStateOf(false) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Claim Account") },
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
            Text(
                "Link an email and password to this account so you can log in from any device or the web app.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            OutlinedTextField(
                value = email,
                onValueChange = { email = it },
                label = { Text("Email") },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email),
            )
            OutlinedTextField(
                value = password,
                onValueChange = { password = it },
                label = { Text("Password (min 8 characters)") },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
                visualTransformation = PasswordVisualTransformation(),
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
            )
            error?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
            Button(
                onClick = {
                    scope.launch {
                        claiming = true
                        error = null
                        authRepository.claimAccount(email, password).fold(
                            onSuccess = { claimed = true },
                            onFailure = { error = it.message },
                        )
                        claiming = false
                    }
                },
                enabled = !claiming && !claimed && email.isNotBlank() && password.length >= 8,
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text(
                    when {
                        claiming -> "Claiming…"
                        claimed -> "Account claimed"
                        else -> "Claim Account"
                    },
                )
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ApiTokenScreen(
    onBack: () -> Unit,
    userToolsRepository: UserToolsRepository,
) {
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    var token by remember { mutableStateOf<String?>(null) }
    var endpoint by remember { mutableStateOf<String?>(null) }
    var generating by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var copied by remember { mutableStateOf(false) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Siri Shortcuts / API") },
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
            Text(
                "Generate an API token to use Ref from automations or any HTTP client.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            token?.let { t ->
                Text("Your token", style = MaterialTheme.typography.titleSmall)
                Text(t, style = MaterialTheme.typography.bodySmall)
                TextButton(
                    onClick = {
                        copyToClipboard(ctx, t)
                        copied = true
                        scope.launch {
                            delay(2000)
                            copied = false
                        }
                    },
                ) { Text(if (copied) "Copied!" else "Copy Token") }
                endpoint?.let {
                    Text("Endpoint", style = MaterialTheme.typography.titleSmall)
                    Text(it, style = MaterialTheme.typography.bodySmall)
                }
                Text(
                    "POST with Authorization: Bearer <token> and body { \"message\": \"...\" } to chat with Ref.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            error?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
            Button(
                onClick = {
                    scope.launch {
                        generating = true
                        error = null
                        userToolsRepository.generateApiToken().fold(
                            onSuccess = {
                                token = it.token
                                endpoint = it.endpoint
                            },
                            onFailure = { error = it.message },
                        )
                        generating = false
                    }
                },
                enabled = !generating,
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text(if (token == null) "Generate Token" else "Regenerate Token")
            }
            if (token != null) {
                Text(
                    "Generating a new token revokes the previous one.",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CalendarFeedScreen(
    onBack: () -> Unit,
    userToolsRepository: UserToolsRepository,
) {
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    var feedUrl by remember { mutableStateOf("") }
    var loading by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var copied by remember { mutableStateOf(false) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Calendar Feed") },
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
            Text(
                "Subscribe to your Refactor calendar to see workouts and meals in your calendar app.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            error?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
            if (feedUrl.isNotBlank()) {
                Text("Feed URL", style = MaterialTheme.typography.titleSmall)
                Text(feedUrl, style = MaterialTheme.typography.bodySmall)
                TextButton(
                    onClick = {
                        copyToClipboard(ctx, feedUrl)
                        copied = true
                        scope.launch {
                            delay(2000)
                            copied = false
                        }
                    },
                ) { Text(if (copied) "Copied!" else "Copy Feed URL") }
            }
            Button(
                onClick = {
                    scope.launch {
                        loading = true
                        error = null
                        userToolsRepository.generateCalendarToken().fold(
                            onSuccess = { res ->
                                feedUrl = res.feedUrl?.takeIf { it.isNotBlank() }
                                    ?: userToolsRepository.calendarFeedUrl(res.token)
                            },
                            onFailure = { error = it.message },
                        )
                        loading = false
                    }
                },
                enabled = !loading,
                modifier = Modifier.fillMaxWidth(),
            ) { Text("Generate Feed URL") }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CoachScheduleScreen(
    onBack: () -> Unit,
    coachSchedulePrefs: CoachSchedulePrefs,
) {
    val times = remember {
        mutableStateListOf<String>().apply {
            addAll(coachSchedulePrefs.timesRaw().split(" ").filter { it.contains(":") })
            if (isEmpty()) addAll(listOf("08:00", "12:00", "20:00"))
        }
    }
    var weeklyDay by remember { mutableStateOf(coachSchedulePrefs.weeklyReviewDay()) }
    val weekdays = listOf("Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday")

    fun persist() {
        coachSchedulePrefs.setTimesRaw(times.joinToString(" "))
        coachSchedulePrefs.setWeeklyReviewDay(weeklyDay)
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Ref Schedule") },
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
            Text("Check-in times", style = MaterialTheme.typography.titleSmall)
            Text(
                "Ref sends a daily check-in prompt at each scheduled time.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            times.forEachIndexed { index, time ->
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    OutlinedTextField(
                        value = time,
                        onValueChange = {
                            times[index] = it
                            persist()
                        },
                        label = { Text("Check-in ${index + 1}") },
                        modifier = Modifier.weight(1f),
                        singleLine = true,
                    )
                    IconButton(
                        onClick = {
                            times.removeAt(index)
                            persist()
                        },
                    ) { Icon(Icons.Filled.Delete, contentDescription = "Remove") }
                }
            }
            if (times.size < 6) {
                OutlinedButton(
                    onClick = {
                        times.add("12:00")
                        persist()
                    },
                ) {
                    Icon(Icons.Filled.Add, contentDescription = null)
                    Text("Add time")
                }
            }
            Text("Weekly review day", style = MaterialTheme.typography.titleSmall)
            weekdays.forEachIndexed { i, label ->
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    RadioButton(selected = weeklyDay == i, onClick = {
                        weeklyDay = i
                        persist()
                    })
                    Text(label)
                }
            }
            Text(
                "Ref sends your weekly progress summary on this day.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MusicPreferenceScreen(
    onBack: () -> Unit,
    musicPrefs: MusicPrefs,
) {
    val ctx = LocalContext.current
    var provider by remember { mutableStateOf(musicPrefs.provider()) }
    var sfxOn by remember { mutableStateOf(musicPrefs.soundEffectsEnabled()) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Music") },
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
            Text("Music provider", style = MaterialTheme.typography.titleSmall)
            listOf(
                MusicPrefs.PROVIDER_SPOTIFY to "Spotify",
                MusicPrefs.PROVIDER_APPLE_MUSIC to "Apple Music",
            ).forEach { (value, label) ->
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    RadioButton(
                        selected = provider == value,
                        onClick = {
                            provider = value
                            musicPrefs.setProvider(value)
                        },
                    )
                    Text(label)
                }
            }
            Row(
                Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text("Sound effects")
                Switch(
                    checked = sfxOn,
                    onCheckedChange = {
                        sfxOn = it
                        musicPrefs.setSoundEffectsEnabled(it)
                    },
                )
            }
            Text(
                "Your preferred music provider is used when Ref suggests workout playlists.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            val openUrl = when (provider) {
                MusicPrefs.PROVIDER_APPLE_MUSIC -> "https://music.apple.com/"
                else -> "https://open.spotify.com/"
            }
            TextButton(
                onClick = {
                    runCatching {
                        ctx.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(openUrl)))
                    }
                },
            ) { Text("Open ${if (provider == MusicPrefs.PROVIDER_APPLE_MUSIC) "Apple Music" else "Spotify"}") }
        }
    }
}

private fun copyToClipboard(context: Context, text: String) {
    val mgr = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
    mgr.setPrimaryClip(ClipData.newPlainText("refactor", text))
}
