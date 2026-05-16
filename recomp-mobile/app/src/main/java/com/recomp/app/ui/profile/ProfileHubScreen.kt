package com.recomp.app.ui.profile

import android.app.Activity
import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
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
import com.recomp.app.api.ResearchRepository
import com.recomp.app.api.SyncJson
import com.recomp.app.billing.PlayBillingManager
import com.recomp.app.api.dto.SyncGetResponse
import com.recomp.app.db.SyncCacheDao
import com.recomp.app.ui.more.SyncWearablesScreen
import com.recomp.app.ui.more.SyncProfileScreen
import com.recomp.app.ui.research.ResearchScreen
import com.recomp.app.ui.screens.ConfigFootnoteCard
import androidx.lifecycle.compose.collectAsStateWithLifecycle

private enum class ProfileSection {
    Home,
    Wearables,
    Research,
    Music,
    Subscription,
    ProfileDetail,
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
) {
    var section by remember { mutableStateOf(ProfileSection.Home) }
    val ctx = LocalContext.current
    val entity by syncCacheDao.observe().collectAsStateWithLifecycle(initialValue = null)
    val billingState by playBilling.state.collectAsStateWithLifecycle()
    val activity = ctx as? Activity
    val proAccess = remember(entity) {
        entity?.payloadJson?.let { raw ->
            runCatching { SyncJson.format.decodeFromString<SyncGetResponse>(raw).profile.proAccess }.getOrNull()
        }
    }

    when (section) {
        ProfileSection.Wearables -> SyncWearablesScreen(onBack = { section = ProfileSection.Home }, syncCacheDao = syncCacheDao)
        ProfileSection.Research -> ResearchScreen(
            researchRepository = researchRepository,
            onBack = { section = ProfileSection.Home },
        )
        ProfileSection.Music -> {
            Column(Modifier.fillMaxSize()) {
                TopAppBar(
                    title = { Text("Music") },
                    navigationIcon = {
                        TextButton(onClick = { section = ProfileSection.Home }) { Text("Back") }
                    },
                )
                Column(Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Text(
                        "Workout playlists open in your music app (same idea as iOS Music preferences).",
                        style = MaterialTheme.typography.bodyMedium,
                    )
                    Button(
                        onClick = {
                            runCatching {
                                ctx.startActivity(
                                    Intent(Intent.ACTION_VIEW, Uri.parse("https://open.spotify.com/")),
                                )
                            }
                        },
                    ) { Text("Open Spotify") }
                }
            }
        }
        ProfileSection.Subscription -> {
            Column(Modifier.fillMaxSize()) {
                TopAppBar(
                    title = { Text("Subscription") },
                    navigationIcon = {
                        TextButton(onClick = { section = ProfileSection.Home }) { Text("Back") }
                    },
                )
                Column(Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Text("Pro access", style = MaterialTheme.typography.titleMedium)
                    val serverPro = proAccess == true
                    val playActive = billingState.activePurchase != null
                    val hasPro = serverPro || playActive
                    Text(
                        when {
                            hasPro && serverPro && playActive -> "Pro via server profile and an active Google Play subscription on this device."
                            hasPro && serverPro -> "Pro via server profile (App Store, web, or admin grant)."
                            hasPro && playActive -> "Active Google Play subscription on this device. Pull sync on Today if server profile has not updated yet."
                            else -> "No Pro on this account yet (server), and no active Play subscription detected here."
                        },
                        style = MaterialTheme.typography.bodyMedium,
                    )
                    if (!billingState.configured) {
                        Text(
                            "Play Billing is wired, but no subscription product id is set. Add " +
                                "`PLAY_SUBSCRIPTION_ID=your_base_plan_product_id` to `gradle.properties` (or " +
                                "`-PPLAY_SUBSCRIPTION_ID=…` when building), matching a subscription SKU in Play Console.",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    } else {
                        if (!billingState.connected) {
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(8.dp),
                            ) {
                                CircularProgressIndicator(
                                    strokeWidth = 2.dp,
                                    modifier = Modifier.padding(end = 4.dp),
                                )
                                Text("Connecting to Google Play…", style = MaterialTheme.typography.bodySmall)
                            }
                        } else {
                            Text(
                                billingState.productTitle?.let { "Product: $it" } ?: "Subscription product loaded.",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                        if (activity != null && billingState.connected && !hasPro) {
                            Button(
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
                        Text(
                            err,
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.error,
                        )
                    }
                    Text(
                        "iOS uses App Store; Android uses Play Billing here. After purchase, pull sync on Today so " +
                            "the server can refresh your profile when verification is enabled.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }
        ProfileSection.ProfileDetail -> SyncProfileScreen(onBack = { section = ProfileSection.Home }, syncCacheDao = syncCacheDao)
        ProfileSection.Home -> {
            Column(Modifier.fillMaxSize()) {
                TopAppBar(title = { Text("Profile") })
                Column(
                    Modifier
                        .verticalScroll(rememberScrollState())
                        .padding(20.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    Text(userDisplayName, style = MaterialTheme.typography.titleMedium)
                    Row(
                        Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text("Unlock after background", style = MaterialTheme.typography.bodyLarge)
                        Switch(checked = biometricEnabled, onCheckedChange = onBiometricEnabledChange)
                    }
                    Text(
                        "When on, confirm with fingerprint or face after leaving the app.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Button(onClick = { section = ProfileSection.ProfileDetail }, modifier = Modifier.fillMaxWidth()) {
                        Text("Synced profile details")
                    }
                    Button(onClick = { section = ProfileSection.Wearables }, modifier = Modifier.fillMaxWidth()) {
                        Text("Wearables")
                    }
                    Button(onClick = { section = ProfileSection.Research }, modifier = Modifier.fillMaxWidth()) {
                        Text("Research")
                    }
                    Button(onClick = { section = ProfileSection.Music }, modifier = Modifier.fillMaxWidth()) {
                        Text("Music")
                    }
                    Button(onClick = { section = ProfileSection.Subscription }, modifier = Modifier.fillMaxWidth()) {
                        Text("Subscription")
                    }
                    Button(onClick = onLogout, modifier = Modifier.fillMaxWidth()) {
                        Text("Sign out")
                    }
                    ConfigFootnoteCard()
                }
            }
        }
    }
}
