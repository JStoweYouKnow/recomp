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
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import com.refactor.app.util.OpenFoodFactsClient
import com.google.mlkit.vision.barcode.common.Barcode
import com.google.mlkit.vision.codescanner.GmsBarcodeScannerOptions
import com.google.mlkit.vision.codescanner.GmsBarcodeScanning
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
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.material3.HorizontalDivider
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
import com.refactor.app.prefs.AiConsentPrefs
import com.refactor.app.ui.consent.AIConsentDialog
import com.refactor.app.api.dto.MealEntryDto
import com.refactor.app.api.dto.MealMacrosDto
import com.refactor.app.api.dto.SuggestedMealDto
import com.refactor.app.api.dto.SyncGetResponse
import com.refactor.app.db.SyncCacheDao
import java.time.Instant
import java.util.UUID
import kotlin.math.roundToInt
import kotlinx.coroutines.launch

private enum class MealInputMode(val label: String, val shortLabel: String) {
    Photo("Photo", "Photo"),
    Menu("Menu scan", "Menu"),
    Receipt("Receipt scan", "Receipt"),
    Barcode("Barcode", "Scan"),
    Search("Food search", "Search"),
    Voice("Voice", "Voice"),
    Recipe("Recipe URL", "Recipe"),
    Suggest("AI Suggest", "Coach");

    companion object {
        /** The four that earn a one-tap button; the rest live behind "More ways to add". */
        val quickActions = listOf(Barcode, Photo, Voice, Suggest)
        val secondaryActions = listOf(Search, Menu, Receipt, Recipe)
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AddMealSheet(
    date: String,
    recentMeals: List<MealEntryDto>,
    mealRepository: MealRepository,
    syncCacheDao: SyncCacheDao,
    aiConsentPrefs: AiConsentPrefs,
    onDismiss: () -> Unit,
    onSave: (MealEntryDto) -> Unit,
    prefill: com.refactor.app.util.MealRecommendation? = null,
) {
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    // Null is the default flow: search your own history, or type a name and fill macros in.
    // The capture modes are opt-in — breadth stays available without making the user
    // choose an input method before they can start.
    var advancedMode by remember { mutableStateOf<MealInputMode?>(null) }
    var scannedProduct by remember { mutableStateOf<OpenFoodFactsClient.Product?>(null) }
    var selectedPortion by remember { mutableStateOf<OpenFoodFactsClient.Portion?>(null) }
    var mealType by remember { mutableStateOf(prefill?.mealType ?: "lunch") }
    var name by remember { mutableStateOf(prefill?.name ?: "") }
    var calories by remember { mutableStateOf(prefill?.macros?.calories?.roundToInt() ?: 0) }
    var protein by remember { mutableStateOf(prefill?.macros?.protein ?: 0.0) }
    var carbs by remember { mutableStateOf(prefill?.macros?.carbs ?: 0.0) }
    var fat by remember { mutableStateOf(prefill?.macros?.fat ?: 0.0) }
    var notes by remember { mutableStateOf("") }
    var foodSearchQuery by remember { mutableStateOf("") }
    var barcodeQuery by remember { mutableStateOf("") }
    var recipeUrl by remember { mutableStateOf("") }
    var voiceTranscript by remember { mutableStateOf("") }
    var analyzing by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var suggestions by remember { mutableStateOf<List<SuggestedMealDto>>(emptyList()) }
    var listening by remember { mutableStateOf(false) }
    var showAiConsent by remember { mutableStateOf(false) }
    var pendingAiAction by remember { mutableStateOf<(() -> Unit)?>(null) }

    fun runWithConsent(action: () -> Unit) {
        if (aiConsentPrefs.isGiven()) action()
        else {
            pendingAiAction = action
            showAiConsent = true
        }
    }

    val speech = remember(ctx) { SpeechRecognizer.createSpeechRecognizer(ctx) }
    val cameraPermission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        if (granted) {
            launchBarcodeScanner(ctx, { analyzing = it }, { error = it }) { code ->
                barcodeQuery = code
                scope.launch {
                    analyzing = true
                    error = null
                    val p = OpenFoodFactsClient.lookup(code)
                    if (p != null) {
                        name = p.name
                        calories = p.calories
                        protein = p.protein
                        carbs = p.carbs
                        fat = p.fat
                    } else {
                        error = "No nutrition found for that barcode. Try Food search."
                    }
                    analyzing = false
                }
            }
        } else {
            error = "Camera access is required to scan barcodes."
        }
    }
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
                val analyze = when (advancedMode) {
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
                .verticalScroll(rememberScrollState())
                .imePadding(),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Spacer(Modifier.height(4.dp))

            OutlinedTextField(
                value = name,
                onValueChange = { name = it },
                label = { Text("Search your meals, or type a name") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )

            // Four one-tap capture modes. Barcode goes straight to the camera — making
            // the user pick a mode and then tap "Scan barcode" was two taps for the
            // fastest path in the app.
            Row(
                Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                MealInputMode.quickActions.forEach { mode ->
                    val selected = advancedMode == mode
                    OutlinedButton(
                        onClick = {
                            if (selected) {
                                advancedMode = null
                            } else {
                                advancedMode = mode
                                if (mode == MealInputMode.Barcode) {
                                    if (ContextCompat.checkSelfPermission(ctx, Manifest.permission.CAMERA) ==
                                        PackageManager.PERMISSION_GRANTED
                                    ) {
                                        launchBarcodeScanner(ctx, { analyzing = it }, { error = it }) { code ->
                                            barcodeQuery = code
                                            scope.launch {
                                                analyzing = true; error = null
                                                val p = OpenFoodFactsClient.lookup(code)
                                                if (p != null) {
                                                    name = p.name
                                                    scannedProduct = p
                                                    p.defaultPortion?.let { portion ->
                                                        selectedPortion = portion
                                                        calories = portion.calories
                                                        protein = portion.protein
                                                        carbs = portion.carbs
                                                        fat = portion.fat
                                                    }
                                                } else {
                                                    scannedProduct = null
                                                    selectedPortion = null
                                                    error = "No nutrition found for that barcode. Try Food search."
                                                }
                                                analyzing = false
                                            }
                                        }
                                    } else {
                                        cameraPermission.launch(Manifest.permission.CAMERA)
                                    }
                                }
                            }
                        },
                        enabled = !analyzing,
                        contentPadding = PaddingValues(horizontal = 4.dp, vertical = 8.dp),
                        modifier = Modifier.weight(1f),
                    ) {
                        Text(
                            mode.shortLabel,
                            style = MaterialTheme.typography.labelSmall,
                            maxLines = 1,
                            color = if (selected) MaterialTheme.colorScheme.primary
                            else MaterialTheme.colorScheme.onSurface,
                        )
                    }
                }
            }

            // The most common action for a returning user is re-logging something they
            // have eaten before, so it sits directly under the field rather than behind
            // an input-method choice.
            val suggested = recentMeals
                .filter { name.isBlank() || it.name.contains(name.trim(), ignoreCase = true) }
                .distinctBy { it.name.lowercase() }
                .take(if (name.isBlank()) 6 else 8)
            if (suggested.isNotEmpty()) {
                Text(
                    if (name.isBlank()) "Recent meals" else "Your meals matching \"${name.trim()}\"",
                    style = MaterialTheme.typography.labelLarge,
                )
                suggested.forEach { entry ->
                    TextButton(
                        onClick = {
                            applySuggestion(
                                SuggestedMealDto(entry.name, macros = entry.macros, mealType = entry.mealType)
                            )
                        },
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Text(
                            "${entry.name} · ${entry.macros.calories.roundToInt()} cal",
                            modifier = Modifier.fillMaxWidth(),
                        )
                    }
                }
            }

            MealModeDropdown(advancedMode, { advancedMode = it }, !analyzing)

            when (advancedMode) {
                null -> {}
                MealInputMode.Photo, MealInputMode.Menu, MealInputMode.Receipt -> {
                    Text(
                        when (advancedMode) {
                            MealInputMode.Menu -> "Select a menu photo to extract items and macros."
                            MealInputMode.Receipt -> "Select a receipt photo to extract food items."
                            else -> "Select a meal photo for AI nutrition analysis."
                        },
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Button(onClick = { runWithConsent { pickPhoto.launch("image/*") } }, enabled = !analyzing) {
                        Text("Choose photo")
                    }
                }
                MealInputMode.Barcode -> {
                    Text(
                        "Scan a product barcode or enter it manually.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    // Portion choices come from the product's own label. Handing the user
                    // "per 100 g" and asking them to divide is arithmetic at a shelf.
                    val applyProduct: (OpenFoodFactsClient.Product?) -> Unit = { p ->
                        if (p != null) {
                            name = p.name
                            scannedProduct = p
                            p.defaultPortion?.let { portion ->
                                selectedPortion = portion
                                calories = portion.calories
                                protein = portion.protein
                                carbs = portion.carbs
                                fat = portion.fat
                            }
                        } else {
                            scannedProduct = null
                            selectedPortion = null
                            error = "No nutrition found for that barcode. Try Food search."
                        }
                    }
                    Button(
                        onClick = {
                            when {
                                ContextCompat.checkSelfPermission(ctx, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED ->
                                    launchBarcodeScanner(ctx, { analyzing = it }, { error = it }) { code ->
                                        barcodeQuery = code
                                        scope.launch {
                                            analyzing = true
                                            error = null
                                            applyProduct(OpenFoodFactsClient.lookup(code))
                                            analyzing = false
                                        }
                                    }
                                else -> cameraPermission.launch(Manifest.permission.CAMERA)
                            }
                        },
                        enabled = !analyzing,
                    ) { Text("Scan barcode") }
                    OutlinedTextField(
                        value = barcodeQuery,
                        onValueChange = { barcodeQuery = it },
                        label = { Text("Or enter barcode number") },
                        singleLine = true,
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                        modifier = Modifier.fillMaxWidth(),
                    )
                    Button(
                        onClick = {
                            scope.launch {
                                analyzing = true; error = null
                                applyProduct(OpenFoodFactsClient.lookup(barcodeQuery))
                                analyzing = false
                            }
                        },
                        enabled = barcodeQuery.isNotBlank() && !analyzing,
                    ) { Text("Look up") }

                    scannedProduct?.let { product ->
                        Text("Portion", style = MaterialTheme.typography.labelLarge)
                        product.portions.forEach { portion ->
                            Row(
                                Modifier
                                    .fillMaxWidth()
                                    .clickable {
                                        selectedPortion = portion
                                        calories = portion.calories
                                        protein = portion.protein
                                        carbs = portion.carbs
                                        fat = portion.fat
                                    }
                                    .padding(vertical = 4.dp),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                RadioButton(
                                    selected = selectedPortion?.label == portion.label,
                                    onClick = {
                                        selectedPortion = portion
                                        calories = portion.calories
                                        protein = portion.protein
                                        carbs = portion.carbs
                                        fat = portion.fat
                                    },
                                )
                                Column(Modifier.weight(1f)) {
                                    Text(portion.label, style = MaterialTheme.typography.bodyMedium)
                                    Text(
                                        "${portion.calories} cal · P ${portion.protein.roundToInt()}g",
                                        style = MaterialTheme.typography.bodySmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    )
                                }
                            }
                        }
                        if (product.servingSizeGrams == null) {
                            Text(
                                "This product doesn't declare a serving size — pick 100 g and adjust below, or edit the macros directly.",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                }
                MealInputMode.Search -> {
                    OutlinedTextField(value = foodSearchQuery, onValueChange = { foodSearchQuery = it }, label = { Text("e.g. grilled chicken 200g") }, modifier = Modifier.fillMaxWidth())
                    Button(
                        onClick = {
                            runWithConsent {
                                scope.launch {
                                    analyzing = true
                                    error = null
                                    mealRepository.lookupNutrition(foodSearchQuery).fold(
                                        onSuccess = { applySuggestion(it); suggestions = listOf(it) },
                                        onFailure = { error = it.message },
                                    )
                                    analyzing = false
                                }
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
                            runWithConsent {
                                scope.launch {
                                    analyzing = true
                                    error = null
                                    mealRepository.parseVoiceTranscript(voiceTranscript).fold(
                                        onSuccess = { suggestions = it },
                                        onFailure = { error = it.message },
                                    )
                                    analyzing = false
                                }
                            }
                        },
                        enabled = voiceTranscript.isNotBlank() && !analyzing,
                    ) { Text("Parse meal") }
                }
                MealInputMode.Recipe -> {
                    OutlinedTextField(value = recipeUrl, onValueChange = { recipeUrl = it }, label = { Text("Recipe URL") }, modifier = Modifier.fillMaxWidth(), keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri))
                    Button(
                        onClick = {
                            runWithConsent {
                                scope.launch {
                                    analyzing = true
                                    error = null
                                    mealRepository.parseRecipeUrl(recipeUrl).fold(
                                        onSuccess = { applySuggestion(it) },
                                        onFailure = { error = it.message },
                                    )
                                    analyzing = false
                                }
                            }
                        },
                        enabled = recipeUrl.isNotBlank() && !analyzing,
                    ) { Text("Parse recipe") }
                }
                MealInputMode.Suggest -> {
                    Button(onClick = { runWithConsent { runSuggest() } }, enabled = !analyzing) { Text("Get suggestions") }
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

    if (showAiConsent) {
        AIConsentDialog(
            onAccept = {
                aiConsentPrefs.setGiven(true)
                showAiConsent = false
                pendingAiAction?.invoke()
                pendingAiAction = null
            },
            onDecline = {
                showAiConsent = false
                pendingAiAction = null
            },
        )
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
private fun MealModeDropdown(mode: MealInputMode?, onSelect: (MealInputMode?) -> Unit, enabled: Boolean) {
    var expanded by remember { mutableStateOf(false) }
    Column {
        OutlinedButton(onClick = { expanded = true }, enabled = enabled, modifier = Modifier.fillMaxWidth()) {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Text(mode?.label ?: "More ways to add", modifier = Modifier.weight(1f))
                Icon(Icons.Outlined.ArrowDropDown, contentDescription = null)
            }
        }
        DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
            MealInputMode.secondaryActions.forEach { m ->
                DropdownMenuItem(text = { Text(m.label) }, onClick = { onSelect(m); expanded = false })
            }
            if (mode != null) {
                HorizontalDivider()
                DropdownMenuItem(
                    text = { Text("Clear input method") },
                    onClick = { onSelect(null); expanded = false },
                )
            }
        }
    }
}

private fun launchBarcodeScanner(
    ctx: android.content.Context,
    setAnalyzing: (Boolean) -> Unit,
    setError: (String?) -> Unit,
    onCode: (String) -> Unit,
) {
    val options = GmsBarcodeScannerOptions.Builder()
        .setBarcodeFormats(
            Barcode.FORMAT_EAN_13,
            Barcode.FORMAT_EAN_8,
            Barcode.FORMAT_UPC_A,
            Barcode.FORMAT_UPC_E,
        )
        .build()
    setAnalyzing(true)
    GmsBarcodeScanning.getClient(ctx, options).startScan()
        .addOnSuccessListener { barcode ->
            setAnalyzing(false)
            val code = barcode.rawValue?.trim().orEmpty()
            if (code.isNotEmpty()) onCode(code)
        }
        .addOnFailureListener { e ->
            setAnalyzing(false)
            setError(e.localizedMessage ?: "Couldn't start the scanner.")
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
