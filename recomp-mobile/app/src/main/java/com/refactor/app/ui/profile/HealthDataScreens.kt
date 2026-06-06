package com.refactor.app.ui.profile

import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
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
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.outlined.Circle
import androidx.compose.material.icons.outlined.Delete
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.refactor.app.api.HealthExtrasRepository
import com.refactor.app.api.SyncJson
import com.refactor.app.api.SyncRepository
import com.refactor.app.api.dto.BloodWorkDto
import com.refactor.app.api.dto.BloodWorkMarkerDto
import com.refactor.app.api.dto.SupplementAnalysisResponseDto
import com.refactor.app.api.dto.SupplementDto
import com.refactor.app.api.dto.SyncGetResponse
import com.refactor.app.db.SyncCacheDao
import com.refactor.app.prefs.AiConsentPrefs
import com.refactor.app.ui.consent.AIConsentDialog
import java.time.LocalDate
import java.util.UUID
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SupplementsScreen(
    onBack: () -> Unit,
    syncCacheDao: SyncCacheDao,
    syncRepository: SyncRepository,
    healthExtrasRepository: HealthExtrasRepository,
    aiConsentPrefs: AiConsentPrefs,
) {
    val entity by syncCacheDao.observe().collectAsStateWithLifecycle(initialValue = null)
    val snap = remember(entity) {
        entity?.payloadJson?.let { raw ->
            runCatching { SyncJson.format.decodeFromString<SyncGetResponse>(raw) }.getOrNull()
        }
    }
    val scope = rememberCoroutineScope()
    var analyzing by remember { mutableStateOf(false) }
    var analysis by remember { mutableStateOf<SupplementAnalysisResponseDto?>(null) }
    var analysisError by remember { mutableStateOf<String?>(null) }
    var showConsent by remember { mutableStateOf(false) }
    var pendingAnalyze by remember { mutableStateOf(false) }

    fun persistSupplements(updated: List<SupplementDto>) {
        scope.launch {
            syncRepository.mutateCachedSnapshot { it.copy(supplements = updated) }
            syncRepository.pushCachedSnapshot()
        }
    }

    fun runAnalyze() {
        val names = snap?.supplements.orEmpty().map { it.name }
        if (names.isEmpty()) return
        scope.launch {
            analyzing = true
            analysisError = null
            healthExtrasRepository.analyzeSupplements(names, snap?.profile?.goal).fold(
                onSuccess = { analysis = it },
                onFailure = { analysisError = it.message },
            )
            analyzing = false
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Supplements") },
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
            val supplements = snap?.supplements.orEmpty()
            if (supplements.isEmpty()) {
                Text(
                    "No supplements in your sync data yet.",
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            } else {
                supplements.forEach { supp ->
                    Card(Modifier.fillMaxWidth()) {
                        Row(
                            Modifier
                                .fillMaxWidth()
                                .padding(12.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Column(Modifier.weight(1f)) {
                                Text(supp.name, fontWeight = FontWeight.Medium)
                                Text(
                                    "${supp.dosage} · ${supp.frequency.replace('_', ' ')}",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            }
                            IconButton(
                                onClick = {
                                    val next = supplements.map {
                                        if (it.id == supp.id) it.copy(takenToday = !it.takenToday) else it
                                    }
                                    persistSupplements(next)
                                },
                            ) {
                                Icon(
                                    if (supp.takenToday) Icons.Filled.CheckCircle else Icons.Outlined.Circle,
                                    contentDescription = "Toggle taken",
                                    tint = if (supp.takenToday) Color(0xFF2E7D32) else MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            }
                            IconButton(
                                onClick = {
                                    persistSupplements(supplements.filter { it.id != supp.id })
                                },
                            ) {
                                Icon(Icons.Outlined.Delete, contentDescription = "Delete")
                            }
                        }
                    }
                }

                Button(
                    onClick = {
                        if (aiConsentPrefs.isGiven()) runAnalyze()
                        else {
                            pendingAnalyze = true
                            showConsent = true
                        }
                    },
                    enabled = !analyzing,
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    if (analyzing) {
                        CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp)
                        Spacer(Modifier.size(8.dp))
                    }
                    Text("AI Analysis")
                }
                analysisError?.let {
                    Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
                }
                analysis?.let { result ->
                    if (result.deficiencies.isNotEmpty()) {
                        Text("Potential Deficiencies", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
                        result.deficiencies.forEach { d ->
                            Text("${d.nutrient} (${d.severity}) — ${d.evidence}", style = MaterialTheme.typography.bodySmall)
                        }
                    }
                    if (result.recommendations.isNotEmpty()) {
                        Text("Recommendations", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
                        result.recommendations.forEach { r ->
                            Text("${r.action} (${r.priority}) — ${r.reason}", style = MaterialTheme.typography.bodySmall)
                        }
                    }
                    if (result.interactions.isNotEmpty()) {
                        Text("Interactions", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
                        result.interactions.forEach { Text("· $it", style = MaterialTheme.typography.bodySmall) }
                    }
                    Text(
                        "Not medical advice. Discuss with a healthcare provider.",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }
    }

    if (showConsent) {
        AIConsentDialog(
            onAccept = {
                aiConsentPrefs.setGiven(true)
                showConsent = false
                if (pendingAnalyze) {
                    pendingAnalyze = false
                    runAnalyze()
                }
            },
            onDecline = {
                showConsent = false
                pendingAnalyze = false
            },
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun BloodWorkScreen(
    onBack: () -> Unit,
    syncCacheDao: SyncCacheDao,
    syncRepository: SyncRepository,
    healthExtrasRepository: HealthExtrasRepository,
    aiConsentPrefs: AiConsentPrefs,
) {
    val ctx = LocalContext.current
    val entity by syncCacheDao.observe().collectAsStateWithLifecycle(initialValue = null)
    val snap = remember(entity) {
        entity?.payloadJson?.let { raw ->
            runCatching { SyncJson.format.decodeFromString<SyncGetResponse>(raw) }.getOrNull()
        }
    }
    val scope = rememberCoroutineScope()
    var uploading by remember { mutableStateOf(false) }
    var uploadError by remember { mutableStateOf<String?>(null) }
    var showConsent by remember { mutableStateOf(false) }
    var pendingUri by remember { mutableStateOf<Uri?>(null) }

    val uploadPhoto: (Uri) -> Unit = { uri ->
        scope.launch {
            uploading = true
            uploadError = null
            runCatching {
                val bytes = ctx.contentResolver.openInputStream(uri)?.use { it.readBytes() }
                    ?: error("Could not read image")
                val parsed = healthExtrasRepository.parseBloodWork(bytes).getOrThrow()
                val entry = BloodWorkDto(
                    id = UUID.randomUUID().toString(),
                    date = LocalDate.now().toString(),
                    markers = parsed.markers,
                )
                syncRepository.mutateCachedSnapshot { s ->
                    val list = s.bloodWork.orEmpty().toMutableList()
                    list.add(0, entry)
                    s.copy(bloodWork = list)
                }
                syncRepository.pushCachedSnapshot()
            }.onFailure { uploadError = it.message }
            uploading = false
        }
    }

    val pickPhoto = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri: Uri? ->
        uri ?: return@rememberLauncherForActivityResult
        if (aiConsentPrefs.isGiven()) uploadPhoto(uri)
        else {
            pendingUri = uri
            showConsent = true
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Blood Work") },
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
            val entries = snap?.bloodWork.orEmpty()
            if (entries.isEmpty()) {
                Text(
                    "Upload a photo of your lab results for AI analysis.",
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            entries.forEach { entry ->
                Text("Analyzed ${entry.date}", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                entry.markers.forEach { marker ->
                    BloodWorkMarkerRow(marker)
                    HorizontalDivider()
                }
                Spacer(Modifier.height(8.dp))
            }
            Button(
                onClick = { pickPhoto.launch("image/*") },
                enabled = !uploading,
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text(if (entries.isEmpty()) "Upload Photo" else "Upload New Photo")
            }
            if (uploading) {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                    CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp)
                    Text("Analyzing…", style = MaterialTheme.typography.bodySmall)
                }
            }
            uploadError?.let {
                Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
            }
        }
    }

    if (showConsent) {
        AIConsentDialog(
            onAccept = {
                aiConsentPrefs.setGiven(true)
                showConsent = false
                pendingUri?.let { uri ->
                    pendingUri = null
                    uploadPhoto(uri)
                }
            },
            onDecline = {
                showConsent = false
                pendingUri = null
            },
        )
    }
}

@Composable
private fun BloodWorkMarkerRow(marker: BloodWorkMarkerDto) {
    val statusColor = when (marker.status) {
        "low" -> Color(0xFFE65100)
        "high" -> MaterialTheme.colorScheme.error
        else -> Color(0xFF2E7D32)
    }
    Row(Modifier.fillMaxWidth().padding(vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f)) {
            Text(marker.name, fontWeight = FontWeight.Medium)
            Text(
                "Normal: ${marker.normalRange.low}–${marker.normalRange.high} ${marker.unit}",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        Column(horizontalAlignment = Alignment.End) {
            Text("${marker.value} ${marker.unit}", fontWeight = FontWeight.Medium)
            Text(marker.status, style = MaterialTheme.typography.labelSmall, color = statusColor)
        }
    }
}
