package com.refactor.app.ui.profile

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import android.util.Base64
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
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
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.outlined.AccountCircle
import androidx.compose.material.icons.outlined.ArrowDropDown
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Surface
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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.refactor.app.api.SyncJson
import com.refactor.app.api.SyncRepository
import com.refactor.app.api.dto.SyncGetResponse
import com.refactor.app.api.dto.UserProfileDto
import com.refactor.app.db.SyncCacheDao
import java.io.ByteArrayOutputStream
import kotlinx.coroutines.launch

private val equipmentOptions = listOf(
    "bodyweight" to "Bodyweight",
    "free_weights" to "Free weights",
    "barbells" to "Barbells",
    "kettlebells" to "Kettlebells",
    "machines" to "Machines",
    "resistance_bands" to "Resistance bands",
    "cardio_machines" to "Cardio machines",
    "pull_up_bar" to "Pull-up bar",
    "cable_machine" to "Cable machine",
)

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun ProfileEditScreen(
    syncRepository: SyncRepository,
    syncCacheDao: SyncCacheDao,
    onBack: () -> Unit,
) {
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    var loaded by remember { mutableStateOf(false) }
    var baseProfile by remember { mutableStateOf<UserProfileDto?>(null) }

    // Form state
    var name by remember { mutableStateOf("") }
    var age by remember { mutableStateOf("") }
    var gender by remember { mutableStateOf("other") }
    var unit by remember { mutableStateOf("us") }
    var weight by remember { mutableStateOf("") }
    var heightCm by remember { mutableStateOf("") }
    var heightIn by remember { mutableStateOf("") }
    var goal by remember { mutableStateOf("maintain") }
    var fitnessLevel by remember { mutableStateOf("intermediate") }
    var activity by remember { mutableStateOf("moderate") }
    var workoutLocation by remember { mutableStateOf("gym") }
    var workoutDays by remember { mutableStateOf("3") }
    var workoutTimeframe by remember { mutableStateOf("flexible") }
    var dietaryText by remember { mutableStateOf("") }
    var injuriesText by remember { mutableStateOf("") }
    var equipment by remember { mutableStateOf(setOf<String>()) }
    var avatarDataUrl by remember { mutableStateOf<String?>(null) }

    androidx.compose.runtime.LaunchedEffect(Unit) {
        val raw = syncCacheDao.getOnce()?.payloadJson ?: return@LaunchedEffect
        val p = runCatching { SyncJson.format.decodeFromString<SyncGetResponse>(raw).profile }.getOrNull()
            ?: return@LaunchedEffect
        baseProfile = p
        name = p.name
        age = if (p.age > 0) p.age.toString() else ""
        gender = p.gender
        unit = p.unitSystem ?: "us"
        val isMetric = unit == "metric"
        weight = if (p.weight > 0) {
            if (isMetric) "%.1f".format(p.weight / 2.20462) else "%.0f".format(p.weight)
        } else ""
        if (isMetric) {
            heightCm = if (p.height > 0) "%.0f".format(p.height) else ""
        } else {
            val totalIn = p.height / 2.54
            heightIn = if (totalIn > 0) "%.0f".format(totalIn) else ""
        }
        goal = p.goal
        fitnessLevel = p.fitnessLevel
        activity = p.dailyActivityLevel ?: "moderate"
        workoutLocation = p.workoutLocation ?: "gym"
        workoutDays = p.workoutDaysPerWeek?.toString() ?: "3"
        workoutTimeframe = p.workoutTimeframe ?: "flexible"
        dietaryText = p.dietaryRestrictions.joinToString(", ")
        injuriesText = p.injuriesOrLimitations.joinToString(", ")
        equipment = p.workoutEquipment.toSet()
        avatarDataUrl = p.avatarDataUrl
        loaded = true
    }

    val pickAvatar = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri: Uri? ->
        uri ?: return@rememberLauncherForActivityResult
        runCatching {
            ctx.contentResolver.openInputStream(uri)?.use { stream ->
                val bmp = BitmapFactory.decodeStream(stream) ?: return@runCatching
                val scaled = Bitmap.createScaledBitmap(bmp, 256, 256, true)
                val out = ByteArrayOutputStream()
                scaled.compress(Bitmap.CompressFormat.JPEG, 85, out)
                val b64 = Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP)
                avatarDataUrl = "data:image/jpeg;base64,$b64"
            }
        }
    }

    fun save() {
        val base = baseProfile ?: return
        busy = true
        error = null
        val w = weight.toDoubleOrNull()
        val submitWeightLbs = w?.let { if (unit == "metric") it * 2.20462 else it }
        val submitHeight = if (unit == "metric") {
            heightCm.toDoubleOrNull()
        } else {
            heightIn.toDoubleOrNull()?.times(2.54)
        }
        val updated = base.copy(
            name = name.trim(),
            age = age.toIntOrNull() ?: base.age,
            gender = gender,
            unitSystem = unit,
            weight = submitWeightLbs ?: base.weight,
            height = submitHeight ?: base.height,
            goal = goal,
            fitnessLevel = fitnessLevel,
            dailyActivityLevel = activity,
            workoutLocation = workoutLocation,
            workoutDaysPerWeek = workoutDays.toIntOrNull()?.coerceIn(1, 7),
            workoutTimeframe = workoutTimeframe,
            dietaryRestrictions = dietaryText.split(",").map { it.trim() }.filter { it.isNotEmpty() },
            injuriesOrLimitations = injuriesText.split(",").map { it.trim() }.filter { it.isNotEmpty() },
            workoutEquipment = equipment.toList(),
            avatarDataUrl = avatarDataUrl,
        )
        scope.launch {
            syncRepository.mutateCachedSnapshot { it.copy(profile = updated) }
                .fold(
                    onSuccess = {
                        syncRepository.pushCachedSnapshot().fold(
                            onSuccess = {
                                busy = false
                                onBack()
                            },
                            onFailure = { e ->
                                busy = false
                                error = e.message ?: "Sync failed"
                            },
                        )
                    },
                    onFailure = { e ->
                        busy = false
                        error = e.message ?: "Save failed"
                    },
                )
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Edit profile") },
                navigationIcon = {
                    IconButton(onClick = onBack, enabled = !busy) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
                actions = {
                    if (busy) {
                        CircularProgressIndicator(Modifier.size(24.dp).padding(end = 16.dp), strokeWidth = 2.dp)
                    } else {
                        Button(
                            onClick = { save() },
                            enabled = loaded && name.isNotBlank(),
                            modifier = Modifier.padding(end = 8.dp),
                        ) { Text("Save") }
                    }
                },
            )
        },
    ) { padding ->
        if (!loaded) {
            Column(Modifier.fillMaxSize().padding(padding), verticalArrangement = Arrangement.Center, horizontalAlignment = Alignment.CenterHorizontally) {
                CircularProgressIndicator()
            }
            return@Scaffold
        }
        Column(
            Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(horizontal = 24.dp)
                .verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Spacer(Modifier.height(4.dp))
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.Center) {
                Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Surface(
                        modifier = Modifier.size(80.dp).clip(CircleShape),
                        color = MaterialTheme.colorScheme.primaryContainer,
                    ) {
                        Icon(Icons.Outlined.AccountCircle, contentDescription = null, Modifier.fillMaxSize().padding(12.dp))
                    }
                    OutlinedButton(onClick = { pickAvatar.launch("image/*") }, enabled = !busy) {
                        Text("Change photo")
                    }
                }
            }

            ProfileSectionLabel("Identity")
            OutlinedTextField(value = name, onValueChange = { name = it }, label = { Text("Name") }, singleLine = true, enabled = !busy, modifier = Modifier.fillMaxWidth())
            OutlinedTextField(value = age, onValueChange = { age = it.filter(Char::isDigit) }, label = { Text("Age") }, singleLine = true, enabled = !busy, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number), modifier = Modifier.fillMaxWidth())
            ProfileSegmentedRow(listOf("male" to "Male", "female" to "Female", "other" to "Other"), gender, { gender = it }, !busy)

            ProfileSectionLabel("Measurements")
            ProfileSegmentedRow(listOf("us" to "US (lbs, in)", "metric" to "Metric (kg, cm)"), unit, { unit = it }, !busy)
            OutlinedTextField(
                value = weight, onValueChange = { weight = it.filter { c -> c.isDigit() || c == '.' } },
                label = { Text(if (unit == "metric") "Weight (kg)" else "Weight (lbs)") },
                singleLine = true, enabled = !busy, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal), modifier = Modifier.fillMaxWidth(),
            )
            if (unit == "metric") {
                OutlinedTextField(value = heightCm, onValueChange = { heightCm = it.filter { c -> c.isDigit() || c == '.' } }, label = { Text("Height (cm)") }, singleLine = true, enabled = !busy, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal), modifier = Modifier.fillMaxWidth())
            } else {
                OutlinedTextField(value = heightIn, onValueChange = { heightIn = it.filter { c -> c.isDigit() || c == '.' } }, label = { Text("Height (total inches)") }, singleLine = true, enabled = !busy, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal), modifier = Modifier.fillMaxWidth())
            }

            ProfileSectionLabel("Fitness")
            ProfileEnumDropdown("Goal", listOf("lose_weight" to "Lose weight", "maintain" to "Maintain", "build_muscle" to "Build muscle", "improve_endurance" to "Improve endurance"), goal, { goal = it }, !busy)
            ProfileEnumDropdown("Level", listOf("beginner" to "Beginner", "intermediate" to "Intermediate", "advanced" to "Advanced", "athlete" to "Athlete"), fitnessLevel, { fitnessLevel = it }, !busy)
            ProfileEnumDropdown("Daily activity", listOf("sedentary" to "Sedentary", "light" to "Light", "moderate" to "Moderate", "active" to "Active", "very_active" to "Very active"), activity, { activity = it }, !busy)

            ProfileSectionLabel("Workouts")
            ProfileEnumDropdown("Location", listOf("home" to "Home", "gym" to "Gym", "outside" to "Outside"), workoutLocation, { workoutLocation = it }, !busy)
            OutlinedTextField(value = workoutDays, onValueChange = { workoutDays = it.filter(Char::isDigit) }, label = { Text("Days per week") }, singleLine = true, enabled = !busy, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number), modifier = Modifier.fillMaxWidth())
            ProfileEnumDropdown("Preferred time", listOf("morning" to "Morning", "afternoon" to "Afternoon", "evening" to "Evening", "flexible" to "Flexible"), workoutTimeframe, { workoutTimeframe = it }, !busy)
            Text("Equipment", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                equipmentOptions.forEach { (value, label) ->
                    FilterChip(
                        selected = equipment.contains(value),
                        onClick = {
                            equipment = if (equipment.contains(value)) equipment - value else equipment + value
                        },
                        label = { Text(label, style = MaterialTheme.typography.labelSmall) },
                        enabled = !busy,
                    )
                }
            }

            ProfileSectionLabel("Health & restrictions")
            OutlinedTextField(value = dietaryText, onValueChange = { dietaryText = it }, label = { Text("Dietary restrictions (comma-separated)") }, enabled = !busy, modifier = Modifier.fillMaxWidth())
            OutlinedTextField(value = injuriesText, onValueChange = { injuriesText = it }, label = { Text("Injuries / limitations (comma-separated)") }, enabled = !busy, modifier = Modifier.fillMaxWidth())

            error?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodyMedium) }
            Spacer(Modifier.height(16.dp))
        }
    }
}

@Composable
private fun ProfileSectionLabel(title: String) {
    Text(title, style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.primary, modifier = Modifier.padding(top = 8.dp))
}

@Composable
private fun ProfileSegmentedRow(options: List<Pair<String, String>>, selected: String, onSelect: (String) -> Unit, enabled: Boolean) {
    SingleChoiceSegmentedButtonRow(modifier = Modifier.fillMaxWidth()) {
        options.forEachIndexed { index, (value, label) ->
            SegmentedButton(
                selected = selected == value,
                onClick = { if (enabled) onSelect(value) },
                shape = SegmentedButtonDefaults.itemShape(index, options.size),
                enabled = enabled,
            ) { Text(label, style = MaterialTheme.typography.labelMedium) }
        }
    }
}

@Composable
private fun ProfileEnumDropdown(label: String, options: List<Pair<String, String>>, selectedValue: String, onSelect: (String) -> Unit, enabled: Boolean) {
    var expanded by remember { mutableStateOf(false) }
    val selectedLabel = options.firstOrNull { it.first == selectedValue }?.second ?: "Select"
    Column {
        Text(label, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(bottom = 4.dp))
        OutlinedButton(onClick = { expanded = true }, enabled = enabled, modifier = Modifier.fillMaxWidth()) {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Text(selectedLabel, modifier = Modifier.weight(1f))
                Icon(Icons.Outlined.ArrowDropDown, contentDescription = null)
            }
        }
        DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
            options.forEach { (value, display) ->
                DropdownMenuItem(text = { Text(display) }, onClick = { onSelect(value); expanded = false })
            }
        }
    }
}
