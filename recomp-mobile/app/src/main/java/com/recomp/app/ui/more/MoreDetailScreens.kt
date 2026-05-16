package com.recomp.app.ui.more

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
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.recomp.app.api.SyncJson
import com.recomp.app.api.SyncRepository
import com.recomp.app.api.dto.SyncGetResponse
import com.recomp.app.db.SyncCacheDao
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SyncProfileScreen(onBack: (() -> Unit)?, syncCacheDao: SyncCacheDao) {
    val entity by syncCacheDao.observe().collectAsStateWithLifecycle(initialValue = null)
    val snap = remember(entity) {
        entity?.payloadJson?.let { raw ->
            runCatching { SyncJson.format.decodeFromString<SyncGetResponse>(raw) }.getOrNull()
        }
    }
    Column(Modifier.fillMaxSize()) {
        TopAppBar(
            title = { Text("Profile", style = MaterialTheme.typography.titleLarge) },
            navigationIcon = {
                if (onBack != null) {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                }
            },
        )
        Column(
            Modifier
                .padding(20.dp)
                .verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            if (snap == null) {
                Text(
                    "No sync data yet. Open Today and refresh.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            } else {
                val p = snap.profile
                Text(p.name, style = MaterialTheme.typography.titleMedium)
                p.email?.takeIf { it.isNotBlank() }?.let { Text("Email · $it") }
                Text("Goal · ${p.goal.replace('_', ' ')}")
                Text("Weight · ${p.weight} · Height · ${p.height}")
                Text("Fitness · ${p.fitnessLevel}")
                if (p.dietaryRestrictions.isNotEmpty()) {
                    Text("Diet · ${p.dietaryRestrictions.joinToString()}")
                }
                if (p.injuriesOrLimitations.isNotEmpty()) {
                    Text("Limitations · ${p.injuriesOrLimitations.joinToString()}")
                }
                if (p.workoutEquipment.isNotEmpty()) {
                    Text("Equipment · ${p.workoutEquipment.joinToString()}")
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SyncAdjustScreen(
    onBack: (() -> Unit)?,
    syncRepository: SyncRepository,
    syncCacheDao: SyncCacheDao,
) {
    val scope = rememberCoroutineScope()
    var refreshing by remember { mutableStateOf(false) }
    val entity by syncCacheDao.observe().collectAsStateWithLifecycle(initialValue = null)
    val snap = remember(entity) {
        entity?.payloadJson?.let { raw ->
            runCatching { SyncJson.format.decodeFromString<SyncGetResponse>(raw) }.getOrNull()
        }
    }
    Column(Modifier.fillMaxSize()) {
        TopAppBar(
            title = { Text("Adjust plan", style = MaterialTheme.typography.titleLarge) },
            navigationIcon = {
                if (onBack != null) {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                }
            },
        )
        Column(
            Modifier.padding(20.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text(
                "Macro targets and block adjustments from Rico or the web sync here once you refresh.",
                style = MaterialTheme.typography.bodyMedium,
            )
            snap?.meta?.hasAdjusted?.let { adj ->
                Text(
                    if (adj) "Plan adjusted this block" else "Plan not yet adjusted",
                    style = MaterialTheme.typography.labelLarge,
                )
            }
            snap?.meta?.xp?.let { Text("XP · $it") }
            Button(
                onClick = {
                    scope.launch {
                        refreshing = true
                        syncRepository.fetchSnapshot()
                        refreshing = false
                    }
                },
                enabled = !refreshing,
                modifier = Modifier.fillMaxWidth(),
            ) {
                Row(
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    if (refreshing) {
                        CircularProgressIndicator(strokeWidth = 2.dp)
                    }
                    Text("Refresh sync")
                }
            }
            Text(
                "Detailed adjustment flows match the web app; native editors will expand later.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SyncWearablesScreen(onBack: () -> Unit, syncCacheDao: SyncCacheDao) {
    val entity by syncCacheDao.observe().collectAsStateWithLifecycle(initialValue = null)
    val snap = remember(entity) {
        entity?.payloadJson?.let { raw ->
            runCatching { SyncJson.format.decodeFromString<SyncGetResponse>(raw) }.getOrNull()
        }
    }
    Column(Modifier.fillMaxSize()) {
        TopAppBar(
            title = { Text("Wearables", style = MaterialTheme.typography.titleLarge) },
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
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            if (snap == null) {
                Text("No sync data yet.", color = MaterialTheme.colorScheme.onSurfaceVariant)
            } else {
                val conns = snap.wearableConnections.orEmpty()
                val days = snap.wearableData.orEmpty()
                Text("Connections · ${conns.size}", style = MaterialTheme.typography.titleSmall)
                if (conns.isEmpty()) {
                    Text(
                        "No devices linked in this snapshot.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                } else {
                    conns.forEach { c ->
                        Text("· ${c.provider} · ${c.label ?: c.connectedAt}")
                    }
                }
                Text("Day summaries · ${days.size}", style = MaterialTheme.typography.titleSmall, modifier = Modifier.padding(top = 12.dp))
                days.take(12).forEach { d ->
                    Text(
                        "${d.date} · ${d.provider}${d.steps?.let { " · ${it} steps" } ?: ""}",
                        style = MaterialTheme.typography.bodySmall,
                    )
                }
                if (days.size > 12) {
                    Text("+ ${days.size - 12} more…", style = MaterialTheme.typography.labelMedium)
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SyncMilestonesScreen(onBack: (() -> Unit)?, syncCacheDao: SyncCacheDao) {
    val entity by syncCacheDao.observe().collectAsStateWithLifecycle(initialValue = null)
    val snap = remember(entity) {
        entity?.payloadJson?.let { raw ->
            runCatching { SyncJson.format.decodeFromString<SyncGetResponse>(raw) }.getOrNull()
        }
    }
    Column(Modifier.fillMaxSize()) {
        TopAppBar(
            title = { Text("Progress", style = MaterialTheme.typography.titleLarge) },
            navigationIcon = {
                if (onBack != null) {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                }
            },
        )
        Column(
            Modifier
                .padding(20.dp)
                .verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            if (snap == null) {
                Text("No sync data yet.", color = MaterialTheme.colorScheme.onSurfaceVariant)
            } else {
                val ms = snap.milestones.orEmpty()
                val xp = snap.meta?.xp ?: 0
                Text("XP · $xp", style = MaterialTheme.typography.titleSmall)
                Text("Milestones · ${ms.size}", style = MaterialTheme.typography.titleSmall)
                if (ms.isEmpty()) {
                    Text(
                        "No milestones in this snapshot.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                } else {
                    ms.forEach { m ->
                        Text(
                            "· ${m.id} · ${m.earnedAt}${m.progress?.let { p -> " · ${p.toInt()}%" } ?: ""}",
                            style = MaterialTheme.typography.bodySmall,
                        )
                    }
                }
            }
        }
    }
}
