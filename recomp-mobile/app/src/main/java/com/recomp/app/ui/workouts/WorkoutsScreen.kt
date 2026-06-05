package com.recomp.app.ui.workouts

import android.app.Application
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Button
import androidx.compose.material3.Checkbox
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.key
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.foundation.clickable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import coil.compose.AsyncImage
import com.recomp.app.BuildConfig
import com.recomp.app.api.SyncJson
import com.recomp.app.api.WorkoutExtrasRepository
import com.recomp.app.api.SyncRepository
import com.recomp.app.api.dto.SyncGetResponse
import com.recomp.app.api.dto.WorkoutDayDto
import com.recomp.app.api.dto.WorkoutExerciseDto
import com.recomp.app.db.SyncCacheDao
import java.time.LocalDate
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun WorkoutsScreen(
    syncRepository: SyncRepository,
    syncCacheDao: SyncCacheDao,
    workoutExtrasRepository: WorkoutExtrasRepository,
) {
    val context = LocalContext.current
    val vm: WorkoutsViewModel = viewModel(
        factory = WorkoutsViewModel.Factory(
            context.applicationContext as Application,
            syncCacheDao,
            syncRepository,
        ),
    )
    val days by vm.workoutDays.collectAsStateWithLifecycle()
    val plan by vm.plan.collectAsStateWithLifecycle()
    val planId = plan?.id.orEmpty()
    val progressUiEpoch by vm.progressUiEpoch.collectAsStateWithLifecycle()
    val progressEntries by vm.workoutProgressEntries.collectAsStateWithLifecycle()
    val cacheEntity by syncCacheDao.observe().collectAsStateWithLifecycle(initialValue = null)
    val latestBio = remember(cacheEntity) {
        cacheEntity?.payloadJson?.let { raw ->
            runCatching {
                val snap = SyncJson.format.decodeFromString<SyncGetResponse>(raw)
                val today = LocalDate.now().toString()
                snap.biofeedback?.filter { it.date == today }?.maxByOrNull { it.time }
            }.getOrNull()
        }
    }
    var recoveryText by remember { mutableStateOf<String?>(null) }
    var recoveryBusy by remember { mutableStateOf(false) }
    var exerciseQuery by remember { mutableStateOf("") }
    var gifPath by remember { mutableStateOf<String?>(null) }
    var gifError by remember { mutableStateOf<String?>(null) }
    var editIndex by remember { mutableStateOf<Int?>(null) }
    var busy by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()

    Column(Modifier.fillMaxWidth()) {
        TopAppBar(title = { Text("Training", style = MaterialTheme.typography.titleLarge) })
        Column(
            Modifier
                .verticalScroll(rememberScrollState())
                .padding(bottom = 8.dp),
        ) {
            if (busy) {
                Row(
                    Modifier.padding(16.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    CircularProgressIndicator(strokeWidth = 2.dp, modifier = Modifier.padding(end = 8.dp))
                    Text("Saving…", style = MaterialTheme.typography.bodySmall)
                }
            }

            latestBio?.let { bf ->
                Card(
                    Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp, vertical = 8.dp),
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainerLow),
                ) {
                    Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text("Recovery (today's biofeedback)", style = MaterialTheme.typography.titleSmall)
                        Button(
                            onClick = {
                                recoveryBusy = true
                                recoveryText = null
                                scope.launch {
                                    workoutExtrasRepository.recoveryAdjust(bf).fold(
                                        onSuccess = { r ->
                                            recoveryBusy = false
                                            recoveryText = "${r.level.uppercase()} (${r.score.toInt()}%) — ${r.recommendation}"
                                        },
                                        onFailure = {
                                            recoveryBusy = false
                                            recoveryText = it.message ?: "Recovery failed"
                                        },
                                    )
                                }
                            },
                            enabled = !recoveryBusy,
                        ) { Text(if (recoveryBusy) "Assessing…" else "Assess recovery") }
                        recoveryText?.let { Text(it, style = MaterialTheme.typography.bodySmall) }
                    }
                }
            }

            Card(
                Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 8.dp),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainerLow),
            ) {
                Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("Exercise GIF", style = MaterialTheme.typography.titleSmall)
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                        OutlinedTextField(
                            value = exerciseQuery,
                            onValueChange = { exerciseQuery = it },
                            label = { Text("Exercise name") },
                            modifier = Modifier.weight(1f),
                            singleLine = true,
                        )
                        Button(
                            onClick = {
                                gifError = null
                                scope.launch {
                                    workoutExtrasRepository.searchExercises(exerciseQuery).fold(
                                        onSuccess = { gifPath = it.gifUrl },
                                        onFailure = { gifError = it.message },
                                    )
                                }
                            },
                            enabled = exerciseQuery.isNotBlank(),
                        ) { Text("Find") }
                    }
                    gifError?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
                    gifPath?.let { rel ->
                        val base = BuildConfig.API_BASE_URL.trimEnd('/')
                        val url = if (rel.startsWith("http")) rel else base + rel
                        AsyncImage(
                            model = url,
                            contentDescription = "Exercise animation",
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(top = 4.dp),
                        )
                    }
                }
            }

            if (progressEntries.isNotEmpty()) {
                Card(
                    Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp, vertical = 8.dp),
                    elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
                    colors = CardDefaults.cardColors(
                        containerColor = MaterialTheme.colorScheme.surfaceContainerLow,
                    ),
                ) {
                    Column(
                        Modifier.padding(14.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        Text(
                            "Workout progress",
                            style = MaterialTheme.typography.titleSmall,
                            color = MaterialTheme.colorScheme.primary,
                        )
                        progressEntries.forEach { (slot, payload) ->
                            ProgressLine(slot, payload)
                        }
                    }
                }
            }
            if (days.isEmpty()) {
                Text(
                    "No workout plan in the last sync. Generate a plan on the web app, then refresh on Today.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(20.dp),
                )
            } else {
                Column(
                    Modifier.padding(horizontal = 16.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    days.forEachIndexed { index, day ->
                        key(progressUiEpoch, index) {
                            WorkoutDayCard(
                                planId = planId,
                                day = day,
                                setProgressEnabled = planId.isNotBlank(),
                                isSetComplete = { ex, globalSlot, setIdx ->
                                    vm.isSetComplete(
                                        planId = planId,
                                        progressDayKey = WorkoutProgramSchedule.progressDayKeyForWorkoutDay(
                                            day.day,
                                            LocalDate.now(),
                                        ),
                                        dayLabel = day.day,
                                        section = day.sectionForGlobalSlot(globalSlot),
                                        exercise = ex,
                                        globalSlot = globalSlot,
                                        setIndex = setIdx,
                                    )
                                },
                                onToggleSet = { ex, globalSlot, setIdx ->
                                    if (planId.isNotBlank()) {
                                        busy = true
                                        scope.launch {
                                            vm.toggleSetAndSync(planId, day, globalSlot, ex, setIdx).fold(
                                                onSuccess = { busy = false },
                                                onFailure = { busy = false },
                                            )
                                        }
                                    }
                                },
                                onEdit = { editIndex = index },
                            )
                        }
                    }
                }
            }
        }
    }

    editIndex?.let { i ->
        val day = days.getOrNull(i) ?: return@let
        EditWorkoutDayDialog(
            day = day,
            onDismiss = { editIndex = null },
            onSave = { newDay ->
                busy = true
                scope.launch {
                    val newList = days.toMutableList().also { list -> list[i] = newDay }
                    vm.persistWeeklyPlanAndPush(newList).fold(
                        onSuccess = {
                            busy = false
                            editIndex = null
                        },
                        onFailure = {
                            busy = false
                        },
                    )
                }
            },
        )
    }
}

private const val PROGRESS_PREVIEW_CHARS = 360

@Composable
private fun ColumnScope.ProgressLine(slot: String, payload: String) {
    var expanded by remember(slot, payload) { mutableStateOf(false) }
    val structuredLines = remember(payload) { summarizeProgressPayload(payload) }
    val collapsedBody = remember(structuredLines, payload) {
        val joined = structuredLines.joinToString("\n").ifBlank { payload.trim() }
        if (joined.length <= PROGRESS_PREVIEW_CHARS) joined
        else joined.take(PROGRESS_PREVIEW_CHARS).trimEnd() + "…"
    }
    Column(
        Modifier
            .padding(vertical = 6.dp)
            .clickable { expanded = !expanded },
    ) {
        Text(slot, style = MaterialTheme.typography.labelLarge)
        Text(
            if (expanded) payload.trim() else collapsedBody,
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Text(
            if (expanded) "Tap to collapse" else "Tap to expand full blob",
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.outline,
        )
    }
}

@Composable
private fun WorkoutDayCard(
    planId: String,
    day: WorkoutDayDto,
    setProgressEnabled: Boolean,
    isSetComplete: (WorkoutExerciseDto, Int, Int) -> Boolean,
    onToggleSet: (WorkoutExerciseDto, Int, Int) -> Unit,
    onEdit: () -> Unit,
) {
    Card(
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainerLow),
    ) {
        Row(
            Modifier
                .fillMaxWidth()
                .padding(14.dp),
            verticalAlignment = Alignment.Top,
        ) {
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(day.day, style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.primary)
                Text(day.focus, style = MaterialTheme.typography.titleMedium)
                var shownSection: String? = null
                for ((globalSlot, ex) in day.enumeratedExerciseSlots()) {
                    val section = day.sectionForGlobalSlot(globalSlot)
                    if (section != shownSection) {
                        shownSection = section
                        Text(
                            when (section) {
                                "warmup" -> "Warm-up"
                                "finisher" -> "Finisher"
                                else -> "Main"
                            },
                            style = MaterialTheme.typography.labelLarge,
                        )
                    }
                    ExerciseWithSetCheckboxes(
                        exercise = ex,
                        enabled = setProgressEnabled,
                        isSetComplete = { si -> isSetComplete(ex, globalSlot, si) },
                        onToggleSet = { si -> onToggleSet(ex, globalSlot, si) },
                    )
                }
            }
            IconButton(onClick = onEdit) {
                Icon(Icons.Filled.Edit, contentDescription = "Edit workout day")
            }
        }
    }
}

@Composable
private fun ExerciseWithSetCheckboxes(
    exercise: WorkoutExerciseDto,
    enabled: Boolean,
    isSetComplete: (Int) -> Boolean,
    onToggleSet: (Int) -> Unit,
) {
    val n = exercise.effectiveSetCount()
    Column(Modifier.padding(vertical = 4.dp)) {
        Text(
            "${exercise.name} · ${exercise.sets} × ${exercise.reps}",
            style = MaterialTheme.typography.bodyMedium,
        )
        exercise.notes?.takeIf { it.isNotBlank() }?.let {
            Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        Row(
            modifier = Modifier.padding(top = 4.dp),
            horizontalArrangement = Arrangement.spacedBy(4.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            repeat(n) { i ->
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.Start,
                ) {
                    Checkbox(
                        checked = isSetComplete(i),
                        onCheckedChange = { onToggleSet(i) },
                        enabled = enabled,
                    )
                    Text("${i + 1}", style = MaterialTheme.typography.labelSmall)
                }
            }
        }
    }
}
