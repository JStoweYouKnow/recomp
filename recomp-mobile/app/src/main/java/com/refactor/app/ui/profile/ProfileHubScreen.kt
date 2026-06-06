package com.refactor.app.ui.profile

import android.app.Activity
import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.outlined.AccountCircle
import androidx.compose.material.icons.outlined.ChevronRight
import androidx.compose.material.icons.outlined.DarkMode
import androidx.compose.material.icons.outlined.Devices
import androidx.compose.material.icons.outlined.Feedback
import androidx.compose.material.icons.outlined.LightMode
import androidx.compose.material.icons.outlined.MusicNote
import androidx.compose.material.icons.outlined.PhoneAndroid
import androidx.compose.material.icons.outlined.Search
import androidx.compose.material.icons.outlined.Star
import androidx.compose.material.icons.outlined.Sync
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.SnackbarDuration
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.refactor.app.api.ResearchRepository
import com.refactor.app.api.SyncJson
import com.refactor.app.api.SyncRepository
import com.refactor.app.api.dto.SyncGetResponse
import com.refactor.app.billing.PlayBillingManager
import com.refactor.app.db.SyncCacheDao
import com.refactor.app.prefs.AppTheme
import com.refactor.app.ui.more.SyncWearablesScreen
import com.refactor.app.ui.research.ResearchScreen
import com.refactor.app.ui.screens.ConfigFootnoteCard
import kotlinx.coroutines.launch

private enum class ProfileSection {
    Home, Wearables, Research, Music, Subscription,
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ProfileHubScreen(
    userDisplayName: String,
    onLogout: () -> Unit,
    biometricEnabled: Boolean,
    onBiometricEnabledChange: (Boolean) -> Unit,
    syncCacheDao: SyncCacheDao,
    researchRepository: ResearchRepository,
    playBilling: PlayBillingManager,
    syncRepository: SyncRepository,
    themePreference: AppTheme = AppTheme.SYSTEM,
    onThemeChange: (AppTheme) -> Unit = {},
) {
    var section by remember { mutableStateOf(ProfileSection.Home) }
    val ctx = LocalContext.current
    val entity by syncCacheDao.observe().collectAsStateWithLifecycle(initialValue = null)
    val billingState by playBilling.state.collectAsStateWithLifecycle()
    val activity = ctx as? Activity
    val snap = remember(entity) {
        entity?.payloadJson?.let { raw ->
            runCatching { SyncJson.format.decodeFromString<SyncGetResponse>(raw) }.getOrNull()
        }
    }
    val proAccess = snap?.profile?.proAccess

    when (section) {
        ProfileSection.Wearables -> SyncWearablesScreen(
            onBack = { section = ProfileSection.Home },
            syncCacheDao = syncCacheDao,
        )
        ProfileSection.Research -> ResearchScreen(
            researchRepository = researchRepository,
            onBack = { section = ProfileSection.Home },
        )
        ProfileSection.Music -> MusicSubScreen(onBack = { section = ProfileSection.Home })
        ProfileSection.Subscription -> SubscriptionSubScreen(
            onBack = { section = ProfileSection.Home },
            proAccess = proAccess,
            billingState = billingState,
            activity = activity,
            playBilling = playBilling,
        )
        ProfileSection.Home -> ProfileHomeScreen(
            snap = snap,
            userDisplayName = userDisplayName,
            biometricEnabled = biometricEnabled,
            onBiometricEnabledChange = onBiometricEnabledChange,
            themePreference = themePreference,
            onThemeChange = onThemeChange,
            syncRepository = syncRepository,
            onLogout = onLogout,
            onNavigate = { section = it },
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ProfileHomeScreen(
    snap: SyncGetResponse?,
    userDisplayName: String,
    biometricEnabled: Boolean,
    onBiometricEnabledChange: (Boolean) -> Unit,
    themePreference: AppTheme,
    onThemeChange: (AppTheme) -> Unit,
    syncRepository: SyncRepository,
    onLogout: () -> Unit,
    onNavigate: (ProfileSection) -> Unit,
) {
    val scope = rememberCoroutineScope()
    val ctx = LocalContext.current
    val snackbarHostState = remember { SnackbarHostState() }
    var syncing by remember { mutableStateOf(false) }

    Scaffold(
        snackbarHost = { SnackbarHost(snackbarHostState) },
        topBar = { TopAppBar(title = { Text("Profile") }) },
    ) { padding ->
        Column(
            Modifier
                .fillMaxSize()
                .padding(padding)
                .verticalScroll(rememberScrollState()),
        ) {
            // Profile header card
            ProfileHeaderCard(snap = snap, userDisplayName = userDisplayName)

            Spacer(Modifier.height(8.dp))

            // Appearance
            SectionHeader("Appearance")
            SingleChoiceSegmentedButtonRow(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 4.dp),
            ) {
                val themes = listOf(AppTheme.SYSTEM, AppTheme.LIGHT, AppTheme.DARK)
                val labels = listOf("System", "Light", "Dark")
                themes.forEachIndexed { index, theme ->
                    SegmentedButton(
                        selected = themePreference == theme,
                        onClick = { onThemeChange(theme) },
                        shape = SegmentedButtonDefaults.itemShape(index, themes.size),
                        icon = {
                            when (theme) {
                                AppTheme.SYSTEM -> Icon(Icons.Outlined.PhoneAndroid, contentDescription = null, modifier = Modifier.size(16.dp))
                                AppTheme.LIGHT -> Icon(Icons.Outlined.LightMode, contentDescription = null, modifier = Modifier.size(16.dp))
                                AppTheme.DARK -> Icon(Icons.Outlined.DarkMode, contentDescription = null, modifier = Modifier.size(16.dp))
                            }
                        },
                    ) {
                        Text(labels[index], style = MaterialTheme.typography.labelMedium)
                    }
                }
            }

            Spacer(Modifier.height(8.dp))

            // Settings
            SectionHeader("Settings")
            SettingsRow(
                icon = Icons.Outlined.Star,
                label = "Subscription",
                onClick = { onNavigate(ProfileSection.Subscription) },
            )
            HorizontalDivider(Modifier.padding(start = 56.dp))
            SettingsRow(
                icon = Icons.Outlined.Devices,
                label = "Wearables",
                onClick = { onNavigate(ProfileSection.Wearables) },
            )
            HorizontalDivider(Modifier.padding(start = 56.dp))
            SettingsRow(
                icon = Icons.Outlined.MusicNote,
                label = "Music",
                onClick = { onNavigate(ProfileSection.Music) },
            )
            HorizontalDivider(Modifier.padding(start = 56.dp))
            SettingsRow(
                icon = Icons.Outlined.Search,
                label = "Research",
                onClick = { onNavigate(ProfileSection.Research) },
            )

            Spacer(Modifier.height(8.dp))

            // Security
            SectionHeader("Security")
            Row(
                Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 12.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column {
                    Text("Lock on background", style = MaterialTheme.typography.bodyLarge)
                    Text(
                        "Requires biometric unlock when returning",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                Switch(checked = biometricEnabled, onCheckedChange = onBiometricEnabledChange)
            }

            Spacer(Modifier.height(8.dp))

            // Account
            SectionHeader("Account")
            SettingsRow(
                icon = Icons.Outlined.Sync,
                label = if (syncing) "Syncing…" else "Sync now",
                onClick = {
                    if (!syncing) {
                        scope.launch {
                            syncing = true
                            val result = syncRepository.fetchSnapshot()
                            syncing = false
                            result.onFailure { err ->
                                snackbarHostState.showSnackbar(
                                    message = err.message ?: "Sync failed",
                                    duration = SnackbarDuration.Short,
                                    withDismissAction = true,
                                )
                            }
                            result.onSuccess {
                                snackbarHostState.showSnackbar(
                                    message = "Sync complete",
                                    duration = SnackbarDuration.Short,
                                )
                            }
                        }
                    }
                },
                trailing = if (syncing) {
                    { CircularProgressIndicator(modifier = Modifier.size(18.dp), strokeWidth = 2.dp) }
                } else null,
            )
            HorizontalDivider(Modifier.padding(start = 56.dp))
            SettingsRow(
                icon = Icons.Outlined.Feedback,
                label = "Send Feedback",
                onClick = {
                    runCatching {
                        ctx.startActivity(
                            Intent(Intent.ACTION_SENDTO).apply {
                                data = Uri.parse("mailto:")
                                putExtra(Intent.EXTRA_EMAIL, arrayOf("support@refactorapp.com"))
                                putExtra(Intent.EXTRA_SUBJECT, "Recomp Android Feedback")
                            }
                        )
                    }
                },
            )
            HorizontalDivider(Modifier.padding(start = 56.dp))
            TextButton(
                onClick = onLogout,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 8.dp),
            ) {
                Text("Sign Out", color = MaterialTheme.colorScheme.error)
            }

            Spacer(Modifier.height(8.dp))
            ConfigFootnoteCard()
            Spacer(Modifier.height(16.dp))
        }
    }
}

@Composable
private fun ProfileHeaderCard(snap: SyncGetResponse?, userDisplayName: String) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 8.dp),
    ) {
        Row(
            Modifier.padding(16.dp),
            horizontalArrangement = Arrangement.spacedBy(16.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Surface(
                modifier = Modifier
                    .size(56.dp)
                    .clip(CircleShape),
                color = MaterialTheme.colorScheme.primaryContainer,
            ) {
                Icon(
                    Icons.Outlined.AccountCircle,
                    contentDescription = null,
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(8.dp),
                    tint = MaterialTheme.colorScheme.onPrimaryContainer,
                )
            }
            Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                val displayName = snap?.profile?.name?.takeIf { it.isNotBlank() } ?: userDisplayName
                Text(displayName, style = MaterialTheme.typography.titleMedium)
                snap?.profile?.email?.takeIf { it.isNotBlank() }?.let {
                    Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                snap?.profile?.let { p ->
                    val goal = p.goal.replace('_', ' ').replaceFirstChar { it.uppercase() }
                    val weight = if (p.weight > 0) " · ${p.weight.toInt()} lbs" else ""
                    Text(
                        "$goal$weight",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }
    }
}

@Composable
private fun SectionHeader(title: String) {
    Text(
        title,
        style = MaterialTheme.typography.labelMedium,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        modifier = Modifier.padding(start = 16.dp, top = 12.dp, bottom = 4.dp),
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun SettingsRow(
    icon: ImageVector,
    label: String,
    onClick: () -> Unit,
    trailing: (@Composable () -> Unit)? = null,
) {
    Surface(onClick = onClick, modifier = Modifier.fillMaxWidth()) {
        Row(
            Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 14.dp),
            horizontalArrangement = Arrangement.spacedBy(16.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(icon, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
            Text(label, style = MaterialTheme.typography.bodyLarge, modifier = Modifier.weight(1f))
            trailing?.invoke() ?: Icon(
                Icons.Outlined.ChevronRight,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun MusicSubScreen(onBack: () -> Unit) {
    val ctx = LocalContext.current
    Column(Modifier.fillMaxSize()) {
        TopAppBar(
            title = { Text("Music") },
            navigationIcon = {
                IconButton(onClick = onBack) {
                    Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                }
            },
        )
        Column(Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text(
                "Workout playlists open in your music app. Playlist suggestions appear in the Workouts tab when you tap Get Music.",
                style = MaterialTheme.typography.bodyMedium,
            )
            TextButton(onClick = {
                runCatching {
                    ctx.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("https://open.spotify.com/")))
                }
            }) { Text("Open Spotify") }
            TextButton(onClick = {
                runCatching {
                    ctx.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("https://music.apple.com/")))
                }
            }) { Text("Open Apple Music") }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun SubscriptionSubScreen(
    onBack: () -> Unit,
    proAccess: Boolean?,
    billingState: com.refactor.app.billing.PlayBillingUiState,
    activity: Activity?,
    playBilling: PlayBillingManager,
) {
    Column(Modifier.fillMaxSize()) {
        TopAppBar(
            title = { Text("Subscription") },
            navigationIcon = {
                IconButton(onClick = onBack) {
                    Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                }
            },
        )
        Column(
            Modifier
                .padding(20.dp)
                .verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            val serverPro = proAccess == true
            val playActive = billingState.activePurchase != null
            val hasPro = serverPro || playActive
            Text("Pro access", style = MaterialTheme.typography.titleMedium)
            Text(
                when {
                    hasPro && serverPro && playActive -> "Pro via server profile and an active Google Play subscription."
                    hasPro && serverPro -> "Pro via server profile (App Store, web, or admin grant)."
                    hasPro && playActive -> "Active Google Play subscription detected. Pull sync on Today if server profile hasn't updated yet."
                    else -> "No Pro on this account. Subscribe below to unlock all features."
                },
                style = MaterialTheme.typography.bodyMedium,
            )
            if (!billingState.configured) {
                Text(
                    "Play Billing is not configured. Add PLAY_SUBSCRIPTION_ID to gradle.properties.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            } else {
                if (!billingState.connected) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        CircularProgressIndicator(strokeWidth = 2.dp, modifier = Modifier.size(18.dp))
                        Text("Connecting to Google Play…", style = MaterialTheme.typography.bodySmall)
                    }
                } else {
                    billingState.productTitle?.let {
                        Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    if (activity != null && billingState.connected && !hasPro) {
                        androidx.compose.material3.Button(
                            onClick = { playBilling.launchSubscribeFlow(activity) },
                            modifier = Modifier.fillMaxWidth(),
                        ) {
                            Text("Subscribe with Google Play")
                        }
                    }
                    TextButton(
                        onClick = { playBilling.queryExistingPurchases() },
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Text("Restore purchases")
                    }
                }
                billingState.lastError?.let { err ->
                    Text(err, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error)
                }
            }
        }
    }
}
