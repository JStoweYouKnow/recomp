package com.refactor.app.ui.meals

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Bundle
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.outlined.ArrowDropDown
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
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
import androidx.core.content.ContextCompat
import com.refactor.app.api.MealRepository
import com.refactor.app.api.SyncJson
import com.refactor.app.api.dto.MealEntryDto
import com.refactor.app.api.dto.MealMacrosDto
import com.refactor.app.api.dto.SuggestedMealDto
import com.refactor.app.api.dto.SyncGetResponse
import com.refactor.app.db.SyncCacheDao
import java.time.Instant
import java.util.UUID
import kotlin.math.roundToInt
import kotlinx.coroutines.launch

private enum class MealInputMode(val label: String) {
    Manual("Manual"),
    Photo("Photo"),
    Menu("Menu scan"),
    Receipt("Receipt scan"),
    Search("Food search"),
    Voice("Voice"),
    Recipe("Recipe URL"),
    Suggest("AI Suggest"),
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AddMealSheet(
    date: String,
    recentMeals: List<MealEntryDto>,
    mealRepository: MealRepository,
    syncCacheDao: SyncCacheDao,
    onDismiss: () -> Unit,
    onSave: (MealEntryDto) -> Unit,
) {
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    var inputMode by remember { mutableStateOf(MealInputMode.Manual) }
    var mealType by remember { mutableStateOf("lunch") }
    var name by remember { mutableStateOf("") }
    var calories by remember { mutableStateOf(0) }
    var protein by remember { mutableStateOf(0.0) }
    var carbs by remember { mutableStateOf(0.0) }
    var fat by remember { mutableStateOf(0.0) }
    var notes by remember { mutableStateOf("") }
    var foodSearchQuery by remember { mutableStateOf("") }
    var recipeUrl by remember { mutableStateOf("") }
    var voiceTranscript by remember { mutableStateOf("") }
    var analyzing by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var suggestions by remember { mutableStateOf<List<SuggestedMealDto>>(emptyList()) }
    var listening by remember { mutableStateOf(false) }

    val speech = remember(ctx) { SpeechRecognizer.createSpeechRecognizer(ctx) }
    val audioPermission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        if (granted) startVoiceListening(speech, ctx) { listening = true }
    }
    val pickPhoto = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri: Uri? ->
        uri ?: return@rememberLauncherForActivityResult
        scope.launch {
            analyzing = true
            error = null
            runCatching {
                val bytes = ctx.contentResolver.openInputStream(uri)?.use { it.readBytes() }
                    ?: error("Could not read image")
                val analyze = when (inputMode) {
                    MealInputMode.Menu -> mealRepository::analyzeMenu
                    MealInputMode.Receipt -> mealRepository::analyzeReceipt
                    else -> mealRepository::analyzePhoto
                }
                analyze(bytes).fold(
                    onSuccess = { suggestions = it },
                    onFailure = { error = it.message },
                )
            }.onFailure { error = it.message }
            analyzing = false
        }
    }

    fun applySuggestion(s: SuggestedMealDto) {
        name = s.name
        calories = s.macros.calories.roundToInt()
        protein = s.macros.protein
        carbs = s.macros.carbs
        fat = s.macros.fat
        s.mealType?.let { mealType = it.lowercase() }
    }

    fun runSuggest() {
        scope.launch {
            analyzing = true
            error = null
            val raw = syncCacheDao.getOnce()?.payloadJson
            if (raw == null) {
                error = "Refresh Today tab first."
                analyzing = false
                return@launch
            }
            val snap = runCatching { SyncJson.format.decodeFromString<SyncGetResponse>(raw) }.getOrElse {
                error = it.message
                analyzing = false
                return@launch
            }
            val targets = snap.plan?.dietPlan?.dailyTargets ?: MealMacrosDto(calories = 2000.0, protein = 150.0)
            val consumed = snap.meals.orEmpty().filter { it.date == date }
                .fold(MealMacrosDto()) { acc, m ->
                    MealMacrosDto(
                        calories = acc.calories + m.macros.calories,
                        protein = acc.protein + m.macros.protein,
                        carbs = acc.carbs + m.macros.carbs,
                        fat = acc.fat + m.macros.fat,
                    )
                }
            val remainingCal = (targets.calories - consumed.calories).roundToInt().coerceAtLeast(100)
            val remainingPro = (targets.protein - consumed.protein).roundToInt().coerceAtLeast(10)
            mealRepository.suggestMeals(
                mealType = mealType,
                remainingCalories = remainingCal,
                remainingProtein = remainingPro,
                restrictions = snap.profile.dietaryRestrictions,
                goal = snap.profile.goal,
            ).fold(
                onSuccess = { suggestions = it },
                onFailure = { error = it.message },
            )
            analyzing = false
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Add meal") },
                navigationIcon = {
                    IconButton(onClick = onDismiss) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
                actions = {
                    TextButton(
                        onClick = {
                            onSave(
                                MealEntryDto(
                                    id = UUID.randomUUID().toString(),
                                    date = date,
                                    mealType = mealType.lowercase(),
                                    name = name.trim(),
                                    macros = MealMacrosDto(
                                        calories = calories.toDouble(),
                                        protein = protein,
                                        carbs = carbs,
                                        fat = fat,
                                    ),
                                    notes = notes.trim().ifBlank { null },
                                    loggedAt = Instant.now().toString(),
                                ),
                            )
                        },
                        enabled = name.isNotBlank() && !analyzing,
                    ) { Text("Save") }
                },
            )
        },
    ) { padding ->
        Column(
            Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(horizontal = 20.dp)
                .verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Spacer(Modifier.height(4.dp))
            MealModeDropdown(inputMode, { inputMode = it }, !analyzing)

            when (inputMode) {
                MealInputMode.Manual -> {
                    OutlinedTextField(value = name, onValueChange = { name = it }, label = { Text("Meal name") }, modifier = Modifier.fillMaxWidth())
                    val matches = if (name.length >= 2) {
                        recentMeals.filter { it.name.contains(name, ignoreCase = true) }
                            .distinctBy { it.name.lowercase() }
                            .take(5)
                    } else emptyList()
                    if (matches.isNotEmpty()) {
                        Text("Recent matches", style = MaterialTheme.typography.labelLarge)
                        matches.forEach { entry ->
                            TextButton(onClick = { applySuggestion(SuggestedMealDto(entry.name, macros = entry.macros, mealType = entry.mealType)) }, modifier = Modifier.fillMaxWidth()) {
                                Text("${entry.name} · ${entry.macros.calories.roundToInt()} cal", modifier = Modifier.fillMaxWidth())
                            }
                        }
                    }
                }
                MealInputMode.Photo, MealInputMode.Menu, MealInputMode.Receipt -> {
                    Text(
                        when (inputMode) {
                            MealInputMode.Menu -> "Select a menu photo to extract items and macros."
                            MealInputMode.Receipt -> "Select a receipt photo to extract food items."
                            else -> "Select a meal photo for AI nutrition analysis."
                        },
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Button(onClick = { pickPhoto.launch("image/*") }, enabled = !analyzing) {
                        Text("Choose photo")
                    }
                }
                MealInputMode.Search -> {
                    OutlinedTextField(value = foodSearchQuery, onValueChange = { foodSearchQuery = it }, label = { Text("e.g. grilled chicken 200g") }, modifier = Modifier.fillMaxWidth())
                    Button(
                        onClick = {
                            scope.launch {
                                analyzing = true
                                error = null
                                mealRepository.lookupNutrition(foodSearchQuery).fold(
                                    onSuccess = { applySuggestion(it); suggestions = listOf(it) },
                                    onFailure = { error = it.message },
                                )
                                analyzing = false
                            }
                        },
                        enabled = foodSearchQuery.isNotBlank() && !analyzing,
                    ) { Text("Look up nutrition") }
                }
                MealInputMode.Voice -> {
                    Text("Tap Listen, speak your meal, then Parse to extract nutrition.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Button(
                            onClick = {
                                if (ContextCompat.checkSelfPermission(ctx, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
                                    startVoiceListening(speech, ctx) { listening = true }
                                } else {
                                    audioPermission.launch(Manifest.permission.RECORD_AUDIO)
                                }
                            },
                            enabled = !analyzing && !listening,
                        ) { Icon(Icons.Filled.Mic, contentDescription = null); Text(" Listen") }
                        if (listening) {
                            TextButton(onClick = { speech.stopListening(); listening = false }) { Text("Stop") }
                        }
                    }
                    OutlinedTextField(
                        value = voiceTranscript,
                        onValueChange = { voiceTranscript = it },
                        label = { Text("Transcript") },
                        modifier = Modifier.fillMaxWidth(),
                        minLines = 2,
                    )
                    Button(
                        onClick = {
                            scope.launch {
                                analyzing = true
                                error = null
                                mealRepository.parseVoiceTranscript(voiceTranscript).fold(
                                    onSuccess = { suggestions = it },
                                    onFailure = { error = it.message },
                                )
                                analyzing = false
                            }
                        },
                        enabled = voiceTranscript.isNotBlank() && !analyzing,
                    ) { Text("Parse meal") }
                }
                MealInputMode.Recipe -> {
                    OutlinedTextField(value = recipeUrl, onValueChange = { recipeUrl = it }, label = { Text("Recipe URL") }, modifier = Modifier.fillMaxWidth(), keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri))
                    Button(
                        onClick = {
                            scope.launch {
                                analyzing = true
                                error = null
                                mealRepository.parseRecipeUrl(recipeUrl).fold(
                                    onSuccess = { applySuggestion(it) },
                                    onFailure = { error = it.message },
                                )
                                analyzing = false
                            }
                        },
                        enabled = recipeUrl.isNotBlank() && !analyzing,
                    ) { Text("Parse recipe") }
                }
                MealInputMode.Suggest -> {
                    Button(onClick = { runSuggest() }, enabled = !analyzing) { Text("Get suggestions") }
                }
            }

            if (analyzing) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    CircularProgressIndicator(Modifier.height(20.dp))
                    Text("Analyzing…", style = MaterialTheme.typography.bodySmall)
                }
            }
            error?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }

            if (suggestions.isNotEmpty()) {
                Text("Results", style = MaterialTheme.typography.titleSmall)
                suggestions.forEach { s ->
                    TextButton(onClick = { applySuggestion(s) }, modifier = Modifier.fillMaxWidth()) {
                        Column(Modifier.fillMaxWidth()) {
                            Text(s.name, style = MaterialTheme.typography.bodyLarge)
                            Text(
                                "${s.macros.calories.roundToInt()} cal · P:${s.macros.protein.roundToInt()}g C:${s.macros.carbs.roundToInt()}g F:${s.macros.fat.roundToInt()}g",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                }
            }

            Text("Meal type", style = MaterialTheme.typography.labelLarge)
            listOf("breakfast", "lunch", "dinner", "snack").forEach { opt ->
                Row(Modifier.fillMaxWidth().clickable { mealType = opt }, verticalAlignment = Alignment.CenterVertically) {
                    RadioButton(selected = mealType == opt, onClick = { mealType = opt })
                    Text(opt.replaceFirstChar { it.uppercaseChar() })
                }
            }

            Text("Macros", style = MaterialTheme.typography.labelLarge)
            OutlinedTextField(value = name, onValueChange = { name = it }, label = { Text("Name") }, modifier = Modifier.fillMaxWidth())
            OutlinedTextField(value = calories.toString(), onValueChange = { calories = it.toIntOrNull() ?: 0 }, label = { Text("Calories") }, singleLine = true, modifier = Modifier.fillMaxWidth())
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(value = protein.toString(), onValueChange = { protein = it.toDoubleOrNull() ?: 0.0 }, label = { Text("P") }, modifier = Modifier.weight(1f), singleLine = true)
                OutlinedTextField(value = carbs.toString(), onValueChange = { carbs = it.toDoubleOrNull() ?: 0.0 }, label = { Text("C") }, modifier = Modifier.weight(1f), singleLine = true)
                OutlinedTextField(value = fat.toString(), onValueChange = { fat = it.toDoubleOrNull() ?: 0.0 }, label = { Text("F") }, modifier = Modifier.weight(1f), singleLine = true)
            }
            OutlinedTextField(value = notes, onValueChange = { notes = it }, label = { Text("Notes (optional)") }, modifier = Modifier.fillMaxWidth())
            Spacer(Modifier.height(16.dp))
        }
    }

    DisposableEffect(speech) {
        speech.setRecognitionListener(object : RecognitionListener {
            override fun onResults(results: Bundle?) {
                listening = false
                val text = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull()
                if (!text.isNullOrBlank()) voiceTranscript = text
            }
            override fun onError(error: Int) { listening = false }
            override fun onReadyForSpeech(params: Bundle?) {}
            override fun onBeginningOfSpeech() {}
            override fun onRmsChanged(rmsdB: Float) {}
            override fun onBufferReceived(buffer: ByteArray?) {}
            override fun onEndOfSpeech() { listening = false }
            override fun onPartialResults(partialResults: Bundle?) {
                partialResults?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull()?.let {
                    voiceTranscript = it
                }
            }
            override fun onEvent(eventType: Int, params: Bundle?) {}
        })
        onDispose { speech.destroy() }
    }
}

@Composable
private fun MealModeDropdown(mode: MealInputMode, onSelect: (MealInputMode) -> Unit, enabled: Boolean) {
    var expanded by remember { mutableStateOf(false) }
    Column {
        Text("Input method", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        OutlinedButton(onClick = { expanded = true }, enabled = enabled, modifier = Modifier.fillMaxWidth()) {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Text(mode.label, modifier = Modifier.weight(1f))
                Icon(Icons.Outlined.ArrowDropDown, contentDescription = null)
            }
        }
        DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
            MealInputMode.entries.forEach { m ->
                DropdownMenuItem(text = { Text(m.label) }, onClick = { onSelect(m); expanded = false })
            }
        }
    }
}

private fun startVoiceListening(speech: SpeechRecognizer, ctx: android.content.Context, onStarted: () -> Unit) {
    if (!SpeechRecognizer.isRecognitionAvailable(ctx)) return
    val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
        putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
        putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
    }
    speech.startListening(intent)
    onStarted()
}
