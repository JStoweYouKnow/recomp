package com.recomp.app.ui.workouts

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshots.SnapshotStateList
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.recomp.app.api.dto.WorkoutDayDto
import com.recomp.app.api.dto.WorkoutExerciseDto

@Composable
fun EditWorkoutDayDialog(
    day: WorkoutDayDto,
    onDismiss: () -> Unit,
    onSave: (WorkoutDayDto) -> Unit,
) {
    var dayLabel by remember(day) { mutableStateOf(day.day) }
    var focus by remember(day) { mutableStateOf(day.focus) }
    val warmups = remember(day) { mutableStateListOf<WorkoutExerciseDto>().apply { addAll(day.warmups.orEmpty()) } }
    val mains = remember(day) { mutableStateListOf<WorkoutExerciseDto>().apply { addAll(day.exercises) } }
    val finishers = remember(day) { mutableStateListOf<WorkoutExerciseDto>().apply { addAll(day.finishers.orEmpty()) } }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Edit workout day") },
        text = {
            Column(
                Modifier
                    .verticalScroll(rememberScrollState())
                    .fillMaxWidth(),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                OutlinedTextField(
                    value = dayLabel,
                    onValueChange = { dayLabel = it },
                    label = { Text("Day label") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                OutlinedTextField(
                    value = focus,
                    onValueChange = { focus = it },
                    label = { Text("Focus") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                Text("Warm-up", style = MaterialTheme.typography.titleSmall)
                exerciseBlock(warmups)
                TextButton(onClick = { warmups.add(WorkoutExerciseDto("New exercise", "3", "10", null)) }) {
                    Text("Add warm-up")
                }
                Text("Main", style = MaterialTheme.typography.titleSmall)
                exerciseBlock(mains)
                TextButton(onClick = { mains.add(WorkoutExerciseDto("New exercise", "3", "10", null)) }) {
                    Text("Add main exercise")
                }
                Text("Finisher", style = MaterialTheme.typography.titleSmall)
                exerciseBlock(finishers)
                TextButton(onClick = { finishers.add(WorkoutExerciseDto("New exercise", "3", "10", null)) }) {
                    Text("Add finisher")
                }
            }
        },
        confirmButton = {
            TextButton(
                onClick = {
                    val out = WorkoutDayDto(
                        day = dayLabel.trim().ifBlank { day.day },
                        focus = focus.trim().ifBlank { day.focus },
                        warmups = warmups.takeIf { it.isNotEmpty() }?.toList(),
                        exercises = mains.toList(),
                        finishers = finishers.takeIf { it.isNotEmpty() }?.toList(),
                    )
                    onSave(out)
                },
            ) { Text("Save") }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("Cancel") }
        },
    )
}

@Composable
private fun exerciseBlock(rows: SnapshotStateList<WorkoutExerciseDto>) {
    rows.forEachIndexed { idx, ex ->
        key(idx, ex.name, ex.sets, ex.reps) {
            Row(
                Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.Top,
                horizontalArrangement = Arrangement.spacedBy(4.dp),
            ) {
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    OutlinedTextField(
                        value = ex.name,
                        onValueChange = { rows[idx] = ex.copy(name = it) },
                        label = { Text("Name") },
                        singleLine = true,
                    )
                    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        OutlinedTextField(
                            value = ex.sets,
                            onValueChange = { rows[idx] = ex.copy(sets = it) },
                            label = { Text("Sets") },
                            singleLine = true,
                            modifier = Modifier.weight(1f),
                        )
                        OutlinedTextField(
                            value = ex.reps,
                            onValueChange = { rows[idx] = ex.copy(reps = it) },
                            label = { Text("Reps") },
                            singleLine = true,
                            modifier = Modifier.weight(1f),
                        )
                    }
                    OutlinedTextField(
                        value = ex.notes.orEmpty(),
                        onValueChange = { rows[idx] = ex.copy(notes = it.ifBlank { null }) },
                        label = { Text("Notes") },
                    )
                }
                IconButton(onClick = { if (idx in rows.indices) rows.removeAt(idx) }) {
                    Icon(Icons.Filled.Close, contentDescription = "Remove")
                }
            }
        }
    }
}
