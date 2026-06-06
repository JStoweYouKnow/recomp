package com.refactor.app.ui.more

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.outlined.AutoAwesome
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.automirrored.outlined.DirectionsRun
import androidx.compose.material.icons.outlined.EmojiEvents
import androidx.compose.material.icons.outlined.FitnessCenter
import androidx.compose.material.icons.outlined.Insights
import androidx.compose.material.icons.outlined.LocalFireDepartment
import androidx.compose.material.icons.outlined.Lock
import androidx.compose.material.icons.outlined.MonitorWeight
import androidx.compose.material.icons.outlined.Nightlight
import androidx.compose.material.icons.outlined.Psychology
import androidx.compose.material.icons.outlined.Star
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.refactor.app.api.SyncJson
import com.refactor.app.api.SyncRepository
import com.refactor.app.api.WearableConnectRepository
import com.refactor.app.api.dto.MeasurementTargetsDto
import com.refactor.app.api.dto.AdjustSuggestionDto
import com.refactor.app.api.dto.BiofeedbackInsightsResponseDto
import com.refactor.app.api.dto.MealMacrosDto
import com.refactor.app.api.dto.ScaleEntryPayloadDto
import com.refactor.app.api.dto.SyncGetResponse
import com.refactor.app.api.dto.WeeklyReviewDto
import com.refactor.app.db.SyncCacheDao
import java.time.LocalDate
import kotlin.math.roundToInt
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

private enum class TargetMode { Base, Training, Rest }

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SyncAdjustScreen(
    onBack: (() -> Unit)?,
    syncRepository: SyncRepository,
    syncCacheDao: SyncCacheDao,
) {
    val scope = rememberCoroutineScope()
    val entity by syncCacheDao.observe().collectAsStateWithLifecycle(initialValue = null)
    val snap = remember(entity) {
        entity?.payloadJson?.let { raw ->
            runCatching { SyncJson.format.decodeFromString<SyncGetResponse>(raw) }.getOrNull()
        }
    }
    val plan = snap?.plan

    // Macro editor state (Base)
    var baseCal by rememberSaveable { mutableStateOf("") }
    var basePro by rememberSaveable { mutableStateOf("") }
    var baseCarb by rememberSaveable { mutableStateOf("") }
    var baseFat by rememberSaveable { mutableStateOf("") }
    // Training
    var trainCal by rememberSaveable { mutableStateOf("") }
    var trainPro by rememberSaveable { mutableStateOf("") }
    var trainCarb by rememberSaveable { mutableStateOf("") }
    var trainFat by rememberSaveable { mutableStateOf("") }
    // Rest
    var restCal by rememberSaveable { mutableStateOf("") }
    var restPro by rememberSaveable { mutableStateOf("") }
    var restCarb by rememberSaveable { mutableStateOf("") }
    var restFat by rememberSaveable { mutableStateOf("") }

    var targetMode by rememberSaveable { mutableStateOf(TargetMode.Base) }
    var targetSaveError by remember { mutableStateOf<String?>(null) }
    var targetSaved by remember { mutableStateOf(false) }
    var savingTargets by remember { mutableStateOf(false) }

    // AI adjust state
    var feedback by rememberSaveable { mutableStateOf("") }
    var adjusting by remember { mutableStateOf(false) }
    var adjustError by remember { mutableStateOf<String?>(null) }
    var suggestion by remember { mutableStateOf<AdjustSuggestionDto?>(null) }
    var applyingChanges by remember { mutableStateOf(false) }
    var changesSaved by remember { mutableStateOf(false) }

    // Populate fields from plan on first load
    LaunchedEffect(plan?.id) {
        val base = plan?.dietPlan?.dailyTargets
        if (base != null) {
            baseCal = base.calories.roundToInt().toString()
            basePro = base.protein.roundToInt().toString()
            baseCarb = base.carbs.roundToInt().toString()
            baseFat = base.fat.roundToInt().toString()
        }
        val train = plan?.dietPlan?.trainingTargets
        if (train != null) {
            trainCal = train.calories.roundToInt().toString()
            trainPro = train.protein.roundToInt().toString()
            trainCarb = train.carbs.roundToInt().toString()
            trainFat = train.fat.roundToInt().toString()
        } else if (base != null) {
            // Formula defaults
            trainCal = (base.calories.roundToInt() + 200).toString()
            trainPro = base.protein.roundToInt().toString()
            trainCarb = (base.carbs.roundToInt() + 50).toString()
            trainFat = base.fat.roundToInt().toString()
        }
        val rest = plan?.dietPlan?.restTargets
        if (rest != null) {
            restCal = rest.calories.roundToInt().toString()
            restPro = rest.protein.roundToInt().toString()
            restCarb = rest.carbs.roundToInt().toString()
            restFat = rest.fat.roundToInt().toString()
        } else if (base != null) {
            // Formula defaults
            restCal = maxOf(0, base.calories.roundToInt() - 200).toString()
            restPro = base.protein.roundToInt().toString()
            restCarb = maxOf(0, base.carbs.roundToInt() - 50).toString()
            restFat = base.fat.roundToInt().toString()
        }
    }

    Column(Modifier.fillMaxSize()) {
        TopAppBar(
            title = { Text("Adjust Plan") },
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
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            // ─── Macro targets editor ───────────────────────────────────────
            Card {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Text("Macro Targets", style = MaterialTheme.typography.titleMedium)
                    Text(
                        "Set separate targets for training and rest days, or a single base average.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )

                    SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth()) {
                        val modes = TargetMode.entries
                        modes.forEachIndexed { i, mode ->
                            SegmentedButton(
                                selected = targetMode == mode,
                                onClick = { targetMode = mode },
                                shape = SegmentedButtonDefaults.itemShape(i, modes.size),
                            ) {
                                Text(mode.name, style = MaterialTheme.typography.labelMedium)
                            }
                        }
                    }

                    when (targetMode) {
                        TargetMode.Base -> {
                            Text(
                                "Weekly average — used as a fallback when no workout is scheduled.",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                            MacroFieldsRow(
                                cal = baseCal, onCal = { baseCal = it },
                                pro = basePro, onPro = { basePro = it },
                                carb = baseCarb, onCarb = { baseCarb = it },
                                fat = baseFat, onFat = { baseFat = it },
                            )
                        }
                        TargetMode.Training -> {
                            Text(
                                "Used on workout days. Formula default: base +200 kcal / +50g carbs.",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                            MacroFieldsRow(
                                cal = trainCal, onCal = { trainCal = it },
                                pro = trainPro, onPro = { trainPro = it },
                                carb = trainCarb, onCarb = { trainCarb = it },
                                fat = trainFat, onFat = { trainFat = it },
                            )
                            Button(
                                onClick = {
                                    val bc = baseCal.toIntOrNull() ?: 2000
                                    val bcarb = baseCarb.toIntOrNull() ?: 200
                                    trainCal = (bc + 200).toString()
                                    trainCarb = (bcarb + 50).toString()
                                },
                                colors = ButtonDefaults.textButtonColors(),
                            ) { Text("Reset to formula") }
                        }
                        TargetMode.Rest -> {
                            Text(
                                "Used on rest/recovery days. Formula default: base −200 kcal / −50g carbs.",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                            MacroFieldsRow(
                                cal = restCal, onCal = { restCal = it },
                                pro = restPro, onPro = { restPro = it },
                                carb = restCarb, onCarb = { restCarb = it },
                                fat = restFat, onFat = { restFat = it },
                            )
                            Button(
                                onClick = {
                                    val bc = baseCal.toIntOrNull() ?: 2000
                                    val bcarb = baseCarb.toIntOrNull() ?: 200
                                    restCal = maxOf(0, bc - 200).toString()
                                    restCarb = maxOf(0, bcarb - 50).toString()
                                },
                                colors = ButtonDefaults.textButtonColors(),
                            ) { Text("Reset to formula") }
                        }
                    }

                    targetSaveError?.let {
                        Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
                    }

                    Button(
                        onClick = {
                            targetSaveError = null
                            val bc = baseCal.toIntOrNull()
                            if (bc == null || bc < 800 || bc > 5000) {
                                targetSaveError = "Base calories must be between 800 and 5000."
                                return@Button
                            }
                            scope.launch {
                                savingTargets = true
                                val base = MealMacrosDto(
                                    calories = baseCal.toDoubleOrNull() ?: 0.0,
                                    protein = basePro.toDoubleOrNull() ?: 0.0,
                                    carbs = baseCarb.toDoubleOrNull() ?: 0.0,
                                    fat = baseFat.toDoubleOrNull() ?: 0.0,
                                )
                                val training = trainCal.toIntOrNull()?.let {
                                    MealMacrosDto(
                                        calories = trainCal.toDoubleOrNull() ?: 0.0,
                                        protein = trainPro.toDoubleOrNull() ?: 0.0,
                                        carbs = trainCarb.toDoubleOrNull() ?: 0.0,
                                        fat = trainFat.toDoubleOrNull() ?: 0.0,
                                    )
                                }
                                val rest = restCal.toIntOrNull()?.let {
                                    MealMacrosDto(
                                        calories = restCal.toDoubleOrNull() ?: 0.0,
                                        protein = restPro.toDoubleOrNull() ?: 0.0,
                                        carbs = restCarb.toDoubleOrNull() ?: 0.0,
                                        fat = restFat.toDoubleOrNull() ?: 0.0,
                                    )
                                }
                                syncRepository.saveMacroTargets(base, training, rest)
                                syncRepository.pushCachedSnapshot()
                                savingTargets = false
                                targetSaved = true
                            }
                        },
                        enabled = !savingTargets && plan != null,
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        if (savingTargets) {
                            CircularProgressIndicator(modifier = Modifier.size(18.dp), strokeWidth = 2.dp)
                        } else {
                            Text(if (targetSaved) "Saved!" else "Save targets")
                        }
                    }
                }
            }

            // ─── AI feedback + adjust ───────────────────────────────────────
            Card {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Text("How's your plan going?", style = MaterialTheme.typography.titleMedium)
                    Text(
                        "Share feedback and the AI will suggest adjustments to your macros and training.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    OutlinedTextField(
                        value = feedback,
                        onValueChange = { feedback = it },
                        placeholder = { Text("e.g. Not losing weight, feeling low energy…") },
                        minLines = 4,
                        modifier = Modifier.fillMaxWidth(),
                        keyboardOptions = KeyboardOptions(
                            keyboardType = KeyboardType.Text,
                            imeAction = ImeAction.Default,
                        ),
                    )
                    Button(
                        onClick = {
                            adjustError = null
                            scope.launch {
                                adjusting = true
                                syncRepository.adjustPlan(feedback)
                                    .onSuccess { s -> suggestion = s }
                                    .onFailure { e -> adjustError = e.message ?: "Adjustment failed" }
                                adjusting = false
                            }
                        },
                        enabled = feedback.isNotBlank() && !adjusting,
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        if (adjusting) {
                            CircularProgressIndicator(modifier = Modifier.size(18.dp), strokeWidth = 2.dp)
                            Text("  Thinking…")
                        } else {
                            Icon(Icons.Outlined.AutoAwesome, contentDescription = null)
                            Text("  Adjust with AI")
                        }
                    }
                    adjustError?.let {
                        Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
                    }
                }
            }

            // ─── Suggestion display ─────────────────────────────────────────
            suggestion?.let { s ->
                Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.secondaryContainer)) {
                    Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        Text("Suggestion", style = MaterialTheme.typography.titleMedium)
                        Text(s.explanation, style = MaterialTheme.typography.bodyMedium)

                        s.newTargets?.let { t ->
                            Text("New Macro Targets", style = MaterialTheme.typography.labelLarge)
                            Row(
                                Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceEvenly,
                            ) {
                                MacroPill("Cal", "${t.calories}")
                                MacroPill("Protein", "${t.protein.roundToInt()}g")
                                MacroPill("Carbs", "${t.carbs.roundToInt()}g")
                                MacroPill("Fat", "${t.fat.roundToInt()}g")
                            }
                        }

                        s.changes?.takeIf { it.isNotEmpty() }?.let { changes ->
                            Text("Changes", style = MaterialTheme.typography.labelLarge)
                            changes.forEach { change ->
                                Text("· $change", style = MaterialTheme.typography.bodySmall)
                            }
                        }

                        Button(
                            onClick = {
                                val t = s.newTargets ?: return@Button
                                scope.launch {
                                    applyingChanges = true
                                    val base = MealMacrosDto(
                                        calories = t.calories.toDouble(),
                                        protein = t.protein,
                                        carbs = t.carbs,
                                        fat = t.fat,
                                    )
                                    val training = MealMacrosDto(
                                        calories = (t.calories + 200).toDouble(),
                                        protein = t.protein,
                                        carbs = t.carbs + 50,
                                        fat = t.fat,
                                    )
                                    val rest = MealMacrosDto(
                                        calories = maxOf(0, t.calories - 200).toDouble(),
                                        protein = t.protein,
                                        carbs = maxOf(0.0, t.carbs - 50),
                                        fat = t.fat,
                                    )
                                    // Update editor fields
                                    baseCal = t.calories.toString()
                                    basePro = t.protein.roundToInt().toString()
                                    baseCarb = t.carbs.roundToInt().toString()
                                    baseFat = t.fat.roundToInt().toString()
                                    syncRepository.saveMacroTargets(base, training, rest)
                                    syncRepository.pushCachedSnapshot()
                                    applyingChanges = false
                                    changesSaved = true
                                    suggestion = null
                                }
                            },
                            enabled = !applyingChanges && s.newTargets != null,
                            modifier = Modifier.fillMaxWidth(),
                        ) {
                            if (applyingChanges) {
                                CircularProgressIndicator(modifier = Modifier.size(18.dp), strokeWidth = 2.dp)
                                Text("  Applying…")
                            } else {
                                Text(if (changesSaved) "Applied!" else "Apply Changes")
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun MacroFieldsRow(
    cal: String, onCal: (String) -> Unit,
    pro: String, onPro: (String) -> Unit,
    carb: String, onCarb: (String) -> Unit,
    fat: String, onFat: (String) -> Unit,
) {
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        MacroField("Calories", cal, onCal, Modifier.weight(1f))
        MacroField("Protein g", pro, onPro, Modifier.weight(1f))
    }
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        MacroField("Carbs g", carb, onCarb, Modifier.weight(1f))
        MacroField("Fat g", fat, onFat, Modifier.weight(1f))
    }
}

@Composable
private fun MacroField(label: String, value: String, onValue: (String) -> Unit, modifier: Modifier = Modifier) {
    OutlinedTextField(
        value = value,
        onValueChange = { onValue(it.filter { c -> c.isDigit() }) },
        label = { Text(label, style = MaterialTheme.typography.labelSmall) },
        singleLine = true,
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
        modifier = modifier,
        textStyle = MaterialTheme.typography.bodyMedium,
    )
}

@Composable
private fun MacroPill(label: String, value: String) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(value, style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.primary)
        Text(label, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SyncWearablesScreen(
    onBack: () -> Unit,
    syncCacheDao: SyncCacheDao,
    syncRepository: SyncRepository,
    wearableConnectRepository: WearableConnectRepository,
) {
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    val entity by syncCacheDao.observe().collectAsStateWithLifecycle(initialValue = null)
    val snap = remember(entity) {
        entity?.payloadJson?.let { raw ->
            runCatching { SyncJson.format.decodeFromString<SyncGetResponse>(raw) }.getOrNull()
        }
    }
    var showOuraSheet by remember { mutableStateOf(false) }
    var ouraToken by remember { mutableStateOf("") }
    var connecting by remember { mutableStateOf(false) }
    var connectError by remember { mutableStateOf<String?>(null) }

    val connectedProviders = remember(snap) {
        snap?.wearableConnections.orEmpty().map { it.provider.lowercase() }.toSet()
    }

    fun markOuraConnected() {
        scope.launch {
            val now = java.time.Instant.now().toString()
            syncRepository.mutateCachedSnapshot { s ->
                val conns = s.wearableConnections.orEmpty().toMutableList()
                if (conns.none { it.provider.equals("oura", ignoreCase = true) }) {
                    conns.add(
                        com.refactor.app.api.dto.WearableConnectionDto(
                            provider = "oura",
                            connectedAt = now,
                            label = "Oura Ring",
                        ),
                    )
                }
                s.copy(wearableConnections = conns)
            }
            syncRepository.pushCachedSnapshot()
            syncRepository.fetchSnapshot()
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
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            connectError?.let {
                Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
            }

            Card(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                        Text("Oura Ring", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
                        if ("oura" in connectedProviders) {
                            Icon(Icons.Filled.CheckCircle, contentDescription = "Connected", tint = Color(0xFF2E7D32))
                        }
                    }
                    if ("oura" !in connectedProviders) {
                        Button(onClick = { showOuraSheet = true }, enabled = !connecting) {
                            Text("Connect with Personal Token")
                        }
                    }
                }
            }

            Card(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                        Text("Fitbit", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
                        if ("fitbit" in connectedProviders) {
                            Icon(Icons.Filled.CheckCircle, contentDescription = "Connected", tint = Color(0xFF2E7D32))
                        }
                    }
                    if ("fitbit" !in connectedProviders) {
                        Button(
                            onClick = {
                                ctx.startActivity(
                                    android.content.Intent(
                                        android.content.Intent.ACTION_VIEW,
                                        android.net.Uri.parse(wearableConnectRepository.fitbitAuthUrl()),
                                    ),
                                )
                            },
                            enabled = !connecting,
                        ) { Text("Connect via Browser") }
                        Text(
                            "Opens Fitbit OAuth in your browser. Sync after authorizing.",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            }

            if (snap != null) {
                val days = snap.wearableData.orEmpty()
                Text("Day summaries · ${days.size}", style = MaterialTheme.typography.titleSmall)
                days.take(12).forEach { d ->
                    Text(
                        "${d.date} · ${d.provider}${d.steps?.let { " · ${it} steps" } ?: ""}",
                        style = MaterialTheme.typography.bodySmall,
                    )
                }
                if (days.size > 12) {
                    Text("+ ${days.size - 12} more…", style = MaterialTheme.typography.labelMedium)
                }
            } else {
                Text("No sync data yet.", color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }

    if (showOuraSheet) {
        androidx.compose.material3.AlertDialog(
            onDismissRequest = { if (!connecting) showOuraSheet = false },
            title = { Text("Connect Oura Ring") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(
                        "Create a Personal Access Token in the Oura Developer Portal, then paste it here.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    OutlinedTextField(
                        value = ouraToken,
                        onValueChange = { ouraToken = it },
                        label = { Text("Personal Access Token") },
                        modifier = Modifier.fillMaxWidth(),
                        singleLine = true,
                    )
                }
            },
            confirmButton = {
                Button(
                    onClick = {
                        scope.launch {
                            connecting = true
                            connectError = null
                            wearableConnectRepository.connectOura(ouraToken).fold(
                                onSuccess = {
                                    showOuraSheet = false
                                    ouraToken = ""
                                    markOuraConnected()
                                },
                                onFailure = { connectError = it.message },
                            )
                            connecting = false
                        }
                    },
                    enabled = ouraToken.length >= 20 && !connecting,
                ) { Text("Connect") }
            },
            dismissButton = {
                TextButton(onClick = { showOuraSheet = false }, enabled = !connecting) { Text("Cancel") }
            },
        )
    }
}

private val knownMilestones: List<Pair<String, String>> = listOf(
    "first_log" to "First Meal Logged",
    "week_streak" to "7-Day Streak",
    "macro_hit" to "Hit Macros",
    "scale_entry" to "Weigh-In",
    "workout_done" to "Workout Logged",
    "plan_generated" to "Plan Created",
    "coach_chat" to "Chatted With Coach",
    "biofeedback_logged" to "Biofeedback Logged",
    "30_day_streak" to "30-Day Streak",
    "100_workouts" to "100 Workouts",
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SyncMilestonesScreen(
    onBack: (() -> Unit)?,
    syncCacheDao: SyncCacheDao,
    syncRepository: SyncRepository,
) {
    val entity by syncCacheDao.observe().collectAsStateWithLifecycle(initialValue = null)
    val snap = remember(entity) {
        entity?.payloadJson?.let { raw ->
            runCatching { SyncJson.format.decodeFromString<SyncGetResponse>(raw) }.getOrNull()
        }
    }
    var tabIndex by rememberSaveable { mutableIntStateOf(0) }

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
        SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth().padding(horizontal = 16.dp)) {
            listOf("Milestones", "Body", "Insights").forEachIndexed { i, label ->
                SegmentedButton(
                    selected = tabIndex == i,
                    onClick = { tabIndex = i },
                    shape = SegmentedButtonDefaults.itemShape(index = i, count = 3),
                    label = { Text(label) },
                )
            }
        }
        Spacer(Modifier.height(8.dp))
        when (tabIndex) {
            0 -> MilestonesTab(snap)
            1 -> BodyTab(snap, syncRepository)
            else -> InsightsTab(syncRepository)
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun MilestonesTab(snap: SyncGetResponse?) {
    val xp = snap?.meta?.xp ?: 0
    val level = xp / 1000
    val levelProgress = (xp % 1000) / 1000f
    val earnedIds = snap?.milestones.orEmpty().map { it.id }.toSet()

    Column(
        Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        // XP level card
        Card(Modifier.fillMaxWidth()) {
            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Row(
                    Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Row(
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Icon(
                            Icons.Outlined.Star,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.primary,
                            modifier = Modifier.size(24.dp),
                        )
                        Text("Level $level", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                    }
                    Text("$xp XP", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                LinearProgressIndicator(
                    progress = { levelProgress },
                    modifier = Modifier.fillMaxWidth(),
                )
                Text(
                    "${xp % 1000} / 1000 XP to Level ${level + 1}",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }

        // Badges
        Text("Achievements", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
        FlowRow(
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            knownMilestones.forEach { (id, label) ->
                val earned = id in earnedIds
                BadgeChip(label = label, earned = earned)
            }
            // Show any server milestones not in our known list
            snap?.milestones.orEmpty().filter { m -> knownMilestones.none { it.first == m.id } }.forEach { m ->
                BadgeChip(label = m.id.replace('_', ' ').replaceFirstChar { it.uppercase() }, earned = true)
            }
        }
        Spacer(Modifier.height(8.dp))
    }
}

@Composable
private fun BadgeChip(label: String, earned: Boolean) {
    Surface(
        shape = MaterialTheme.shapes.small,
        color = if (earned) MaterialTheme.colorScheme.primaryContainer else MaterialTheme.colorScheme.surfaceVariant,
        modifier = Modifier.alpha(if (earned) 1f else 0.5f),
    ) {
        Row(
            Modifier.padding(horizontal = 10.dp, vertical = 6.dp),
            horizontalArrangement = Arrangement.spacedBy(4.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(
                if (earned) Icons.Outlined.EmojiEvents else Icons.Outlined.Lock,
                contentDescription = null,
                modifier = Modifier.size(14.dp),
                tint = if (earned) MaterialTheme.colorScheme.onPrimaryContainer else MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Text(
                label,
                style = MaterialTheme.typography.labelSmall,
                color = if (earned) MaterialTheme.colorScheme.onPrimaryContainer else MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun BodyTab(snap: SyncGetResponse?, syncRepository: SyncRepository) {
    val scope = rememberCoroutineScope()
    val latestWear = snap?.wearableData.orEmpty().maxByOrNull { it.date }

    var scaleDate by rememberSaveable { mutableStateOf(LocalDate.now().toString()) }
    var weightLbs by rememberSaveable { mutableStateOf("") }
    var bodyFat by rememberSaveable { mutableStateOf("") }
    var muscleMass by rememberSaveable { mutableStateOf("") }
    var bmi by rememberSaveable { mutableStateOf("") }
    var bmr by rememberSaveable { mutableStateOf("") }
    var metaAge by rememberSaveable { mutableStateOf("") }

    var saving by remember { mutableStateOf(false) }
    var saveMessage by remember { mutableStateOf<String?>(null) }

    Column(
        Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        // Latest stats from wearable
        if (latestWear != null) {
            Card(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Text("Latest Wearable Data · ${latestWear.date}", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
                    latestWear.steps?.let { StatRow(icon = Icons.AutoMirrored.Outlined.DirectionsRun, label = "Steps", value = "$it") }
                    latestWear.caloriesBurned?.let { StatRow(icon = Icons.Outlined.LocalFireDepartment, label = "Calories Burned", value = "${it.roundToInt()} kcal") }
                    latestWear.sleepScore?.let { StatRow(icon = Icons.Outlined.Nightlight, label = "Sleep Score", value = "$it / 100") }
                }
            }
        }

        // Current body stats from profile
        val w = snap?.profile?.weight ?: 0.0
        if (w > 0) {
            Card(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Text("Body Stats", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
                    StatRow(icon = Icons.Outlined.MonitorWeight, label = "Weight", value = "${w.roundToInt()} lbs")
                    snap?.profile?.height?.takeIf { it > 0 }?.let {
                        StatRow(icon = Icons.Outlined.FitnessCenter, label = "Height", value = "${it.roundToInt()} cm")
                    }
                }
            }
        }

        // Body measurement targets
        BodyMeasurementTargetsCard(snap, syncRepository)

        // Smart Scale Entry
        Card(Modifier.fillMaxWidth()) {
            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text("Log Scale Reading", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)

                OutlinedTextField(
                    value = scaleDate,
                    onValueChange = { scaleDate = it },
                    label = { Text("Date (YYYY-MM-DD)") },
                    modifier = Modifier.fillMaxWidth(),
                    keyboardOptions = KeyboardOptions(imeAction = ImeAction.Next),
                    singleLine = true,
                )
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedTextField(
                        value = weightLbs,
                        onValueChange = { weightLbs = it },
                        label = { Text("Weight (lbs)") },
                        modifier = Modifier.weight(1f),
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal, imeAction = ImeAction.Next),
                        singleLine = true,
                    )
                    OutlinedTextField(
                        value = bodyFat,
                        onValueChange = { bodyFat = it },
                        label = { Text("Body Fat %") },
                        modifier = Modifier.weight(1f),
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal, imeAction = ImeAction.Next),
                        singleLine = true,
                    )
                }
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedTextField(
                        value = muscleMass,
                        onValueChange = { muscleMass = it },
                        label = { Text("Muscle Mass") },
                        modifier = Modifier.weight(1f),
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal, imeAction = ImeAction.Next),
                        singleLine = true,
                    )
                    OutlinedTextField(
                        value = bmi,
                        onValueChange = { bmi = it },
                        label = { Text("BMI") },
                        modifier = Modifier.weight(1f),
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal, imeAction = ImeAction.Next),
                        singleLine = true,
                    )
                }
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedTextField(
                        value = bmr,
                        onValueChange = { bmr = it },
                        label = { Text("BMR (kcal)") },
                        modifier = Modifier.weight(1f),
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal, imeAction = ImeAction.Next),
                        singleLine = true,
                    )
                    OutlinedTextField(
                        value = metaAge,
                        onValueChange = { metaAge = it },
                        label = { Text("Metabolic Age") },
                        modifier = Modifier.weight(1f),
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number, imeAction = ImeAction.Done),
                        singleLine = true,
                    )
                }

                saveMessage?.let {
                    Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.primary)
                }

                Button(
                    onClick = {
                        scope.launch {
                            saving = true
                            saveMessage = null
                            val payload = ScaleEntryPayloadDto(
                                date = scaleDate,
                                weightLbs = weightLbs.toDoubleOrNull(),
                                bodyFatPercent = bodyFat.toDoubleOrNull(),
                                muscleMass = muscleMass.toDoubleOrNull(),
                                bmi = bmi.toDoubleOrNull(),
                                bmr = bmr.toDoubleOrNull(),
                                metabolicAge = metaAge.toIntOrNull(),
                            )
                            syncRepository.scaleEntry(payload).fold(
                                onSuccess = {
                                    saveMessage = "Logged successfully"
                                    weightLbs = ""; bodyFat = ""; muscleMass = ""; bmi = ""; bmr = ""; metaAge = ""
                                },
                                onFailure = { saveMessage = "Error: ${it.message}" },
                            )
                            saving = false
                        }
                    },
                    modifier = Modifier.fillMaxWidth(),
                    enabled = !saving && weightLbs.isNotBlank(),
                ) {
                    if (saving) CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp)
                    else Text("Log Reading")
                }
            }
        }
        Spacer(Modifier.height(8.dp))
    }
}

@Composable
private fun BodyMeasurementTargetsCard(snap: SyncGetResponse?, syncRepository: SyncRepository) {
    val scope = rememberCoroutineScope()
    val isMetric = snap?.profile?.unitSystem == "metric"
    val massUnit = if (isMetric) "kg" else "lbs"
    val targets = snap?.meta?.measurementTargets

    var weightText by rememberSaveable(snap?.meta?.measurementTargets) {
        mutableStateOf(formatTargetWeight(targets?.targetWeightLbs, isMetric))
    }
    var bodyFatText by rememberSaveable(targets?.targetBodyFatPercent) {
        mutableStateOf(targets?.targetBodyFatPercent?.let { "%.1f".format(it) }.orEmpty())
    }
    var muscleText by rememberSaveable(targets?.targetMuscleMassLbs) {
        mutableStateOf(formatTargetWeight(targets?.targetMuscleMassLbs, isMetric))
    }
    var saving by remember { mutableStateOf(false) }
    var saveMessage by remember { mutableStateOf<String?>(null) }

    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text("Body measurement targets", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
            Text(
                "Set goals for weight, body fat, and muscle. They sync with your account.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            TargetField("Goal weight ($massUnit)", weightText) { weightText = it }
            TargetField("Goal body fat (%)", bodyFatText) { bodyFatText = it }
            TargetField("Goal muscle mass ($massUnit)", muscleText) { muscleText = it }
            saveMessage?.let {
                Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.primary)
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(
                    onClick = {
                        scope.launch {
                            saving = true
                            saveMessage = null
                            val weightLbs = parseMassToLbs(weightText, isMetric)
                            val muscleLbs = parseMassToLbs(muscleText, isMetric)
                            val bodyFat = bodyFatText.toDoubleOrNull()
                            val next = MeasurementTargetsDto(
                                targetWeightLbs = weightLbs,
                                targetBodyFatPercent = bodyFat,
                                targetMuscleMassLbs = muscleLbs,
                            )
                            syncRepository.mutateCachedSnapshot { s ->
                                s.copy(meta = (s.meta ?: com.refactor.app.api.dto.SyncMetaDto()).copy(measurementTargets = next))
                            }.fold(
                                onSuccess = {
                                    syncRepository.pushCachedSnapshot()
                                    saveMessage = "Targets saved"
                                },
                                onFailure = { saveMessage = it.message },
                            )
                            saving = false
                        }
                    },
                    modifier = Modifier.weight(1f),
                    enabled = !saving,
                ) { Text(if (saving) "Saving…" else "Save targets") }
                OutlinedButton(
                    onClick = {
                        scope.launch {
                            weightText = ""
                            bodyFatText = ""
                            muscleText = ""
                            syncRepository.mutateCachedSnapshot { s ->
                                s.copy(meta = (s.meta ?: com.refactor.app.api.dto.SyncMetaDto()).copy(measurementTargets = null))
                            }
                            syncRepository.pushCachedSnapshot()
                            saveMessage = "Targets cleared"
                        }
                    },
                    enabled = !saving,
                ) { Text("Clear") }
            }
        }
    }
}

@Composable
private fun TargetField(label: String, value: String, onChange: (String) -> Unit) {
    OutlinedTextField(
        value = value,
        onValueChange = onChange,
        label = { Text(label) },
        modifier = Modifier.fillMaxWidth(),
        singleLine = true,
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal, imeAction = ImeAction.Next),
    )
}

private fun formatTargetWeight(lbs: Double?, isMetric: Boolean): String {
    if (lbs == null) return ""
    return if (isMetric) "%.1f".format(lbs / 2.20462) else "%.1f".format(lbs)
}

private fun parseMassToLbs(text: String, isMetric: Boolean): Double? {
    val v = text.toDoubleOrNull() ?: return null
    return if (isMetric) v * 2.20462 else v
}

@Composable
private fun StatRow(icon: ImageVector, label: String, value: String) {
    Row(
        Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon(icon, contentDescription = null, modifier = Modifier.size(16.dp), tint = MaterialTheme.colorScheme.primary)
            Text(label, style = MaterialTheme.typography.bodyMedium)
        }
        Text(value, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Medium)
    }
}

@Composable
private fun InsightsTab(syncRepository: SyncRepository) {
    val scope = rememberCoroutineScope()

    var loadingInsights by remember { mutableStateOf(false) }
    var insights by remember { mutableStateOf<BiofeedbackInsightsResponseDto?>(null) }
    var insightsError by remember { mutableStateOf<String?>(null) }

    var loadingReview by remember { mutableStateOf(false) }
    var review by remember { mutableStateOf<WeeklyReviewDto?>(null) }
    var reviewError by remember { mutableStateOf<String?>(null) }

    Column(
        Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        // Biofeedback insights section
        Card(Modifier.fillMaxWidth()) {
            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Row(
                    Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Outlined.Psychology, contentDescription = null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(20.dp))
                        Text("Biofeedback Analysis", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
                    }
                    if (!loadingInsights) {
                        OutlinedButton(onClick = {
                            scope.launch {
                                loadingInsights = true
                                insightsError = null
                                syncRepository.biofeedbackInsights().fold(
                                    onSuccess = { insights = it },
                                    onFailure = { insightsError = it.message ?: "Failed" },
                                )
                                loadingInsights = false
                            }
                        }) { Text("Analyze") }
                    }
                }

                if (loadingInsights) {
                    Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
                        CircularProgressIndicator(Modifier.size(28.dp))
                    }
                }

                insightsError?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error) }

                insights?.let { ins ->
                    if (ins.correlations.isNotEmpty()) {
                        Text("Correlations", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        ins.correlations.forEach { c ->
                            Column(Modifier.padding(start = 8.dp)) {
                                Text(c.factor, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Medium)
                                Text(c.observation, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                Text("Strength: ${c.strength}", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.primary)
                            }
                        }
                    }
                    if (ins.recommendations.isNotEmpty()) {
                        Text("Recommendations", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        ins.recommendations.forEach { r ->
                            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                Icon(Icons.Outlined.CheckCircle, contentDescription = null, modifier = Modifier.size(14.dp), tint = MaterialTheme.colorScheme.primary)
                                Text(r, style = MaterialTheme.typography.bodySmall)
                            }
                        }
                    }
                }

                if (insights == null && !loadingInsights && insightsError == null) {
                    Text(
                        "Tap Analyze to get AI insights from your biofeedback logs.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }

        // Weekly review section
        Card(Modifier.fillMaxWidth()) {
            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Row(
                    Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Outlined.Insights, contentDescription = null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(20.dp))
                        Text("Weekly Recap", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
                    }
                    if (!loadingReview) {
                        OutlinedButton(onClick = {
                            scope.launch {
                                loadingReview = true
                                reviewError = null
                                syncRepository.weeklyReview().fold(
                                    onSuccess = { review = it },
                                    onFailure = { reviewError = it.message ?: "Failed" },
                                )
                                loadingReview = false
                            }
                        }) { Text("Generate") }
                    }
                }

                if (loadingReview) {
                    Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
                        CircularProgressIndicator(Modifier.size(28.dp))
                    }
                }

                reviewError?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error) }

                review?.let { rv ->
                    rv.weeklyScore?.let { score ->
                        Row(
                            Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.Center,
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Text(
                                "$score",
                                style = MaterialTheme.typography.displaySmall,
                                fontWeight = FontWeight.Bold,
                                color = MaterialTheme.colorScheme.primary,
                            )
                            Text(" / 100", style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                    if (rv.summary.isNotBlank()) {
                        Text("Summary", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        Text(rv.summary, style = MaterialTheme.typography.bodyMedium)
                    }
                    if (rv.mealAnalysis.isNotBlank()) {
                        Text("Nutrition", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        Text(rv.mealAnalysis, style = MaterialTheme.typography.bodyMedium)
                    }
                    if (rv.wearableInsights.isNotBlank()) {
                        Text("Activity & Sleep", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        Text(rv.wearableInsights, style = MaterialTheme.typography.bodyMedium)
                    }
                    if (rv.recommendations.isNotEmpty()) {
                        Text("This Week's Goals", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        rv.recommendations.forEach { r ->
                            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                Icon(Icons.Outlined.CheckCircle, contentDescription = null, modifier = Modifier.size(14.dp), tint = MaterialTheme.colorScheme.primary)
                                Text(r, style = MaterialTheme.typography.bodySmall)
                            }
                        }
                    }
                }

                if (review == null && !loadingReview && reviewError == null) {
                    Text(
                        "Tap Generate for your personalized weekly performance recap.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }
        Spacer(Modifier.height(8.dp))
    }
}
