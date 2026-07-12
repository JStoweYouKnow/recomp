package com.refactor.app.ui.profile

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Error
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.refactor.app.BuildConfig
import com.refactor.app.api.SocialRepository
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

private val visibilityOptions = listOf(
    "badges_only" to "Badges Only",
    "badges_stats" to "Badges & Stats",
    "full_transparency" to "Full Transparency",
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SocialSettingsScreen(
    onBack: () -> Unit,
    socialRepository: SocialRepository,
) {
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    var visibility by remember { mutableStateOf("badges_only") }
    var username by remember { mutableStateOf("") }
    var loading by remember { mutableStateOf(true) }
    var saving by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var saved by remember { mutableStateOf(false) }
    var usernameStatus by remember { mutableStateOf<UsernameStatus>(UsernameStatus.Idle) }
    var copied by remember { mutableStateOf(false) }

    val profileUrl = "${BuildConfig.API_BASE_URL.trimEnd('/')}/u/$username"

    LaunchedEffect(Unit) {
        socialRepository.getSettings().fold(
            onSuccess = {
                visibility = it.visibility
                username = it.username.orEmpty()
                loading = false
            },
            onFailure = {
                error = it.message
                loading = false
            },
        )
    }

    LaunchedEffect(username) {
        if (username.length < 3) {
            usernameStatus = UsernameStatus.Idle
            return@LaunchedEffect
        }
        usernameStatus = UsernameStatus.Checking
        delay(600)
        socialRepository.checkUsername(username).fold(
            onSuccess = { available ->
                usernameStatus = if (available) UsernameStatus.Available else UsernameStatus.Taken
            },
            onFailure = { usernameStatus = UsernameStatus.Idle },
        )
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Social & Privacy") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
            )
        },
    ) { padding ->
        if (loading) {
            Column(Modifier.fillMaxSize().padding(padding), verticalArrangement = Arrangement.Center, horizontalAlignment = Alignment.CenterHorizontally) {
                CircularProgressIndicator()
            }
        } else {
            Column(
                Modifier
                    .fillMaxSize()
                    .padding(padding)
                    .verticalScroll(rememberScrollState())
                    .padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp),
            ) {
                error?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }

                Text("Visibility", style = MaterialTheme.typography.titleSmall)
                visibilityOptions.forEach { (value, label) ->
                    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                        RadioButton(selected = visibility == value, onClick = { visibility = value })
                        Text(label)
                    }
                }

                Text("Username", style = MaterialTheme.typography.titleSmall)
                OutlinedTextField(
                    value = username,
                    onValueChange = { username = it.lowercase().filter { c -> c.isLetterOrDigit() || c == '_' || c == '-' } },
                    label = { Text("username") },
                    modifier = Modifier.fillMaxWidth(),
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Ascii),
                    singleLine = true,
                )
                UsernameStatusRow(usernameStatus, username.length)

                if (username.length >= 3) {
                    TextButton(
                        onClick = {
                            copyToClipboard(ctx, profileUrl)
                            copied = true
                            scope.launch {
                                delay(2000)
                                copied = false
                            }
                        },
                    ) { Text(if (copied) "Copied!" else "Copy Profile Link") }
                }

                Button(
                    onClick = {
                        scope.launch {
                            saving = true
                            saved = false
                            error = null
                            val trimmed = username.trim()
                            socialRepository.updateSettings(
                                visibility = visibility,
                                username = if (trimmed.length >= 3) trimmed else null,
                            ).fold(
                                onSuccess = {
                                    visibility = it.visibility
                                    username = it.username.orEmpty()
                                    saved = true
                                },
                                onFailure = { error = it.message },
                            )
                            saving = false
                        }
                    },
                    enabled = !saving,
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text(if (saving) "Saving…" else if (saved) "Saved" else "Save to server")
                }
            }
        }
    }
}

private enum class UsernameStatus { Idle, Checking, Available, Taken }

@Composable
private fun UsernameStatusRow(status: UsernameStatus, usernameLen: Int) {
    when (status) {
        UsernameStatus.Idle -> {
            Text(
                if (usernameLen < 3) "At least 3 characters to claim a public username."
                else "",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        UsernameStatus.Checking -> Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
            CircularProgressIndicator(Modifier.size(14.dp), strokeWidth = 2.dp)
            Text("Checking…", style = MaterialTheme.typography.bodySmall)
        }
        UsernameStatus.Available -> Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Filled.CheckCircle, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
            Text("Available", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.primary)
        }
        UsernameStatus.Taken -> Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Filled.Error, contentDescription = null, tint = MaterialTheme.colorScheme.error)
            Text("Already taken", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error)
        }
    }
}

private fun copyToClipboard(context: Context, text: String) {
    val mgr = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
    mgr.setPrimaryClip(ClipData.newPlainText("profile", text))
}
