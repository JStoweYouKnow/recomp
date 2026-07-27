package com.refactor.app.ui.meals

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.ChevronLeft
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Button
import androidx.compose.material3.Scaffold
import androidx.compose.material3.ScrollableTabRow
import androidx.compose.material3.Tab
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.compose.ui.platform.LocalContext
import com.refactor.app.util.Feedback
import com.refactor.app.util.HealthConnectWriter
import androidx.lifecycle.viewmodel.compose.viewModel
import com.refactor.app.api.MealPrepRepository
import com.refactor.app.api.MealRepository
import com.refactor.app.prefs.AiConsentPrefs
import com.refactor.app.api.SyncRepository
import com.refactor.app.api.dto.GroceryItemDto
import com.refactor.app.api.dto.MealEntryDto
import com.refactor.app.api.dto.MealMacrosDto
import com.refactor.app.api.dto.MealPrepPlanDto
import com.refactor.app.api.dto.PantryItemDto
import com.refactor.app.api.dto.SavedRecipeDto
import com.refactor.app.api.dto.ScoredRecipeSuggestionDto
import com.refactor.app.db.SyncCacheDao
import com.refactor.app.ui.dashboard.MacroPillsRow
import com.refactor.app.ui.dashboard.sumMacrosForDate
import com.refactor.app.ui.dashboard.todaysMacroTargets
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import kotlin.math.roundToInt
import kotlinx.coroutines.launch

private val isoDate: DateTimeFormatter = DateTimeFormatter.ISO_LOCAL_DATE

private val mealTypeOptions = listOf("breakfast", "lunch", "dinner", "snack")

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MealsScreen(
    syncRepository: SyncRepository,
    syncCacheDao: SyncCacheDao,
    mealPrepRepository: MealPrepRepository,
    mealRepository: MealRepository,
    aiConsentPrefs: AiConsentPrefs,
) {
    val vm: MealsViewModel = viewModel(
        factory = MealsViewModel.Factory(syncCacheDao, syncRepository, mealPrepRepository, mealRepository),
    )
    val allMeals by vm.allMeals.collectAsStateWithLifecycle()
    val syncSnapshot by vm.snapshot.collectAsStateWithLifecycle()
    val allPantry by vm.allPantry.collectAsStateWithLifecycle()
    val mealPrepPlan by vm.mealPrepPlan.collectAsStateWithLifecycle()
    val mealPrepErr by vm.mealPrepError.collectAsStateWithLifecycle()
    val mealPrepBusy by vm.mealPrepBusy.collectAsStateWithLifecycle()
    val savedRecipes by vm.allSavedRecipes.collectAsStateWithLifecycle()
    val recipeSuggestions by vm.recipeSuggestions.collectAsStateWithLifecycle()
    val recipeStatus by vm.recipeStatus.collectAsStateWithLifecycle()
    val recipeBusy by vm.recipeBusy.collectAsStateWithLifecycle()
    var sectionTab by remember { mutableIntStateOf(0) }
    var selectedDate by remember { mutableStateOf(LocalDate.now()) }
    val dateStr = remember(selectedDate) { selectedDate.format(isoDate) }
    val mealsForDay = remember(allMeals, dateStr) { allMeals.filter { it.date == dateStr } }

    var editorTarget by remember { mutableStateOf<MealEntryDto?>(null) }
    var showAdd by remember { mutableStateOf(false) }
    var deleteTarget by remember { mutableStateOf<MealEntryDto?>(null) }
    var busy by remember { mutableStateOf(false) }
    var isRefreshing by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()
    val context = LocalContext.current

    LaunchedEffect(Unit) {
        isRefreshing = true
        vm.refreshSnapshot()
        isRefreshing = false
    }

    fun persistAll(updated: List<MealEntryDto>) {
        busy = true
        error = null
        scope.launch {
            vm.persistMealsAndPush(updated).fold(
                onSuccess = {
                    busy = false
                    showAdd = false
                    editorTarget = null
                    deleteTarget = null
                },
                onFailure = { e ->
                    busy = false
                    error = e.message ?: "Sync failed"
                },
            )
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(title = { Text("Meals", style = MaterialTheme.typography.titleLarge) })
        },
        floatingActionButton = {
            if (sectionTab == 0) {
                // Offset above the global Coach-chat FAB from MainShell's outer
                // Scaffold, which shares this bottom-end slot and would otherwise cover it.
                FloatingActionButton(
                    onClick = { showAdd = true },
                    modifier = Modifier.padding(bottom = 72.dp),
                ) {
                    Icon(Icons.Filled.Add, contentDescription = "Add meal")
                }
            }
        },
    ) { padding ->
        Column(
            Modifier
                .padding(padding)
                .fillMaxWidth(),
        ) {
            Row(
                Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 12.dp, vertical = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.Center,
            ) {
                IconButton(
                    onClick = { selectedDate = selectedDate.minusDays(1) },
                    enabled = !busy,
                ) {
                    Icon(Icons.Filled.ChevronLeft, contentDescription = "Previous day")
                }
                Text(
                    dateStr,
                    style = MaterialTheme.typography.titleMedium,
                    modifier = Modifier.padding(horizontal = 8.dp),
                )
                IconButton(
                    onClick = { selectedDate = selectedDate.plusDays(1) },
                    enabled = !busy,
                ) {
                    Icon(Icons.Filled.ChevronRight, contentDescription = "Next day")
                }
            }

            syncSnapshot?.let { snap ->
                val consumed = sumMacrosForDate(snap.meals, dateStr)
                val targets = todaysMacroTargets(snap, selectedDate)
                MacroPillsRow(
                    consumed = consumed,
                    targets = targets,
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 8.dp, vertical = 4.dp),
                )
            }

            error?.let {
                Text(
                    it,
                    color = MaterialTheme.colorScheme.error,
                    style = MaterialTheme.typography.bodySmall,
                    modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp),
                )
            }

            if (busy) {
                Row(
                    Modifier.padding(16.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    CircularProgressIndicator(strokeWidth = 2.dp, modifier = Modifier.width(20.dp))
                    Text("Saving…", style = MaterialTheme.typography.bodySmall)
                }
            }

            ScrollableTabRow(selectedTabIndex = sectionTab, edgePadding = 8.dp) {
                Tab(selected = sectionTab == 0, onClick = { sectionTab = 0 }, text = { Text("Meals") })
                Tab(selected = sectionTab == 1, onClick = { sectionTab = 1 }, text = { Text("Pantry") })
                Tab(selected = sectionTab == 2, onClick = { sectionTab = 2 }, text = { Text("Meal prep") })
                Tab(selected = sectionTab == 3, onClick = { sectionTab = 3 }, text = { Text("Recipes") })
            }

            when (sectionTab) {
                0 -> {
                    PullToRefreshBox(
                        isRefreshing = isRefreshing,
                        onRefresh = {
                            isRefreshing = true
                            scope.launch {
                                vm.refreshSnapshot()
                                isRefreshing = false
                            }
                        },
                    ) {
                        if (mealsForDay.isEmpty() && !busy) {
                            Text(
                                "No meals for this day. Tap + to log one (same flow as iOS).",
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                modifier = Modifier.padding(20.dp),
                            )
                        } else {
                            LazyColumn(
                                contentPadding = PaddingValues(16.dp),
                                verticalArrangement = Arrangement.spacedBy(10.dp),
                            ) {
                                items(mealsForDay, key = { "${it.date}#${it.id}" }) { meal ->
                                    Card(
                                        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
                                        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainerLow),
                                    ) {
                                        Row(
                                            Modifier
                                                .fillMaxWidth()
                                                .padding(14.dp),
                                            verticalAlignment = Alignment.CenterVertically,
                                        ) {
                                            Column(Modifier.weight(1f)) {
                                                Text(
                                                    meal.mealType.replaceFirstChar { it.uppercaseChar() },
                                                    style = MaterialTheme.typography.labelMedium,
                                                    color = MaterialTheme.colorScheme.primary,
                                                )
                                                Text(meal.name, style = MaterialTheme.typography.titleMedium)
                                                val m = meal.macros
                                                Text(
                                                    "${m.calories.roundToInt()} kcal · P ${m.protein.roundToInt()} · C ${m.carbs.roundToInt()} · F ${m.fat.roundToInt()}",
                                                    style = MaterialTheme.typography.bodySmall,
                                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                                )
                                            }
                                            IconButton(
                                                onClick = { editorTarget = meal },
                                                enabled = !busy,
                                            ) {
                                                Icon(Icons.Filled.Edit, contentDescription = "Edit meal")
                                            }
                                            IconButton(
                                                onClick = { deleteTarget = meal },
                                                enabled = !busy,
                                            ) {
                                                Icon(Icons.Filled.Delete, contentDescription = "Delete meal")
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
                1 -> PantryTab(
                    items = allPantry,
                    busy = busy,
                    onPersist = { next ->
                        busy = true
                        error = null
                        scope.launch {
                            vm.persistPantryAndPush(next).fold(
                                onSuccess = { busy = false },
                                onFailure = { e ->
                                    busy = false
                                    error = e.message ?: "Sync failed"
                                },
                            )
                        }
                    },
                )
                2 -> MealPrepTab(
                    plan = mealPrepPlan,
                    mealPrepErr = mealPrepErr,
                    busy = mealPrepBusy,
                    onGenerate = { prefs -> vm.generateMealPrep(prefs) },
                    onToggleGrocery = { item -> vm.toggleGroceryItem(item) },
                    onAddGrocery = { name -> vm.addGroceryItem(name) },
                    onRemoveGrocery = { item -> vm.removeGroceryItem(item) },
                    onClearErr = { vm.clearMealPrepError() },
                )
                3 -> SavedRecipesTab(
                    recipes = savedRecipes,
                    suggestions = recipeSuggestions,
                    status = recipeStatus,
                    busy = recipeBusy || busy,
                    onSuggest = { vm.suggestRecipes() },
                    onSaveUrl = { url -> vm.saveRecipeFromUrl(url) },
                    onClearStatus = { vm.clearRecipeStatus() },
                )
            }
        }
    }

    if (showAdd) {
        AddMealSheet(
            date = dateStr,
            recentMeals = allMeals,
            mealRepository = mealRepository,
            syncCacheDao = syncCacheDao,
            aiConsentPrefs = aiConsentPrefs,
            onDismiss = { showAdd = false },
            onSave = { draft ->
                val next = allMeals + draft
                persistAll(next)
                // Feedback + Health Connect export + protein-goal celebration (mirrors iOS).
                val today = LocalDate.now().toString()
                val proteinTarget = syncSnapshot?.plan?.dietPlan?.dailyTargets?.protein ?: 0.0
                val priorProtein = allMeals.filter { it.date == draft.date }.sumOf { it.macros.protein }
                val newProtein = priorProtein + draft.macros.protein
                if (draft.date == today && proteinTarget > 0 && priorProtein < proteinTarget && newProtein >= proteinTarget) {
                    Feedback.celebrate(context, "Protein goal hit! 🎯")
                } else {
                    Feedback.success(context)
                    Feedback.toast(context, "Meal logged")
                }
                scope.launch {
                    HealthConnectWriter.saveMeal(
                        context, draft.name, draft.macros.calories.toInt(),
                        draft.macros.protein, draft.macros.carbs, draft.macros.fat,
                        System.currentTimeMillis(),
                    )
                }
            },
        )
    }

    editorTarget?.let { meal ->
        MealEditorDialog(
            title = "Edit meal",
            initial = meal,
            defaultDate = dateStr,
            onDismiss = { editorTarget = null },
            onSave = { draft ->
                val next = allMeals.map { if (it.id == meal.id) draft else it }
                persistAll(next)
            },
        )
    }

    deleteTarget?.let { meal ->
        AlertDialog(
            onDismissRequest = { deleteTarget = null },
            title = { Text("Delete meal?") },
            text = { Text(meal.name) },
            confirmButton = {
                TextButton(
                    onClick = {
                        val next = allMeals.filterNot { it.id == meal.id }
                        deleteTarget = null
                        persistAll(next)
                    },
                ) { Text("Delete") }
            },
            dismissButton = {
                TextButton(onClick = { deleteTarget = null }) { Text("Cancel") }
            },
        )
    }
}

@Composable
private fun MealEditorDialog(
    title: String,
    initial: MealEntryDto?,
    defaultDate: String,
    onDismiss: () -> Unit,
    onSave: (MealEntryDto) -> Unit,
) {
    var dateField by remember(initial, defaultDate) { mutableStateOf(initial?.date ?: defaultDate) }
    var mealType by remember(initial) { mutableStateOf(initial?.mealType ?: "lunch") }
    var name by remember(initial) { mutableStateOf(initial?.name ?: "") }
    var calories by remember(initial) { mutableStateOf(initial?.macros?.calories?.roundToInt() ?: 0) }
    var protein by remember(initial) { mutableStateOf(initial?.macros?.protein ?: 0.0) }
    var carbs by remember(initial) { mutableStateOf(initial?.macros?.carbs ?: 0.0) }
    var fat by remember(initial) { mutableStateOf(initial?.macros?.fat ?: 0.0) }
    var notes by remember(initial) { mutableStateOf(initial?.notes ?: "") }

    val fallbackId = remember { java.util.UUID.randomUUID().toString() }
    val id = initial?.id ?: fallbackId
    val loggedAt = initial?.loggedAt ?: java.time.Instant.now().toString()

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(title) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                OutlinedTextField(
                    value = dateField,
                    onValueChange = { dateField = it },
                    label = { Text("Date (yyyy-MM-dd)") },
                    singleLine = true,
                )
                Text("Meal type", style = MaterialTheme.typography.labelLarge)
                mealTypeOptions.forEach { opt ->
                    Row(
                        Modifier
                            .fillMaxWidth()
                            .clickable { mealType = opt },
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        RadioButton(
                            selected = mealType == opt,
                            onClick = { mealType = opt },
                        )
                        Text(opt.replaceFirstChar { it.uppercaseChar() })
                    }
                }
                OutlinedTextField(
                    value = name,
                    onValueChange = { name = it },
                    label = { Text("Name") },
                    singleLine = false,
                )
                OutlinedTextField(
                    value = calories.toString(),
                    onValueChange = { calories = it.toIntOrNull() ?: 0 },
                    label = { Text("Calories") },
                    singleLine = true,
                )
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedTextField(
                        value = protein.toString(),
                        onValueChange = { protein = it.toDoubleOrNull() ?: 0.0 },
                        label = { Text("P") },
                        modifier = Modifier.weight(1f),
                        singleLine = true,
                    )
                    OutlinedTextField(
                        value = carbs.toString(),
                        onValueChange = { carbs = it.toDoubleOrNull() ?: 0.0 },
                        label = { Text("C") },
                        modifier = Modifier.weight(1f),
                        singleLine = true,
                    )
                    OutlinedTextField(
                        value = fat.toString(),
                        onValueChange = { fat = it.toDoubleOrNull() ?: 0.0 },
                        label = { Text("F") },
                        modifier = Modifier.weight(1f),
                        singleLine = true,
                    )
                }
                OutlinedTextField(
                    value = notes,
                    onValueChange = { notes = it },
                    label = { Text("Notes") },
                )
            }
        },
        confirmButton = {
            TextButton(
                onClick = {
                    val d = dateField.trim().ifBlank { defaultDate }
                    val dto = MealEntryDto(
                        id = id,
                        date = d,
                        mealType = mealType.lowercase(),
                        name = name.trim(),
                        macros = MealMacrosDto(
                            calories = calories.toDouble(),
                            protein = protein,
                            carbs = carbs,
                            fat = fat,
                        ),
                        notes = notes.trim().ifBlank { null },
                        imageUrl = initial?.imageUrl,
                        loggedAt = loggedAt,
                    )
                    onSave(dto)
                },
                enabled = name.isNotBlank(),
            ) { Text("Save") }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("Cancel") }
        },
    )
}

private val pantryCategories = listOf("protein", "carb", "fat", "produce", "dairy", "spice", "other")

@Composable
private fun PantryTab(
    items: List<PantryItemDto>,
    busy: Boolean,
    onPersist: (List<PantryItemDto>) -> Unit,
) {
    var showAdd by remember { mutableStateOf(false) }
    Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Button(onClick = { showAdd = true }, enabled = !busy) { Text("Add pantry item") }
        pantryCategories.forEach { cat ->
            val inCat = items.filter { it.category == cat }
            if (inCat.isEmpty()) return@forEach
            Text(cat.replaceFirstChar { it.uppercaseChar() }, style = MaterialTheme.typography.titleSmall)
            inCat.forEach { item ->
                Row(
                    Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(item.name, style = MaterialTheme.typography.bodyLarge, modifier = Modifier.weight(1f))
                    TextButton(
                        onClick = { onPersist(items.filterNot { it.id == item.id }) },
                        enabled = !busy,
                    ) { Text("Remove") }
                }
            }
        }
        if (items.isEmpty()) {
            Text(
                "Pantry is empty. Add items for meal prep suggestions (matches iOS).",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
    if (showAdd) {
        var newName by remember { mutableStateOf("") }
        var newCat by remember { mutableStateOf("protein") }
        AlertDialog(
            onDismissRequest = { showAdd = false },
            title = { Text("Add item") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedTextField(value = newName, onValueChange = { newName = it }, label = { Text("Name") })
                    OutlinedTextField(value = newCat, onValueChange = { newCat = it }, label = { Text("Category") })
                }
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        val n = newName.trim()
                        if (n.isNotEmpty()) {
                            val cat = newCat.trim().lowercase().ifBlank { "other" }
                            val id = java.util.UUID.randomUUID().toString()
                            val at = java.time.Instant.now().toString()
                            onPersist(items + PantryItemDto(id, n, cat, at, null))
                            showAdd = false
                        }
                    },
                ) { Text("Add") }
            },
            dismissButton = { TextButton(onClick = { showAdd = false }) { Text("Cancel") } },
        )
    }
}

@Composable
private fun MealPrepTab(
    plan: MealPrepPlanDto?,
    mealPrepErr: String?,
    busy: Boolean,
    onGenerate: (String?) -> Unit,
    onToggleGrocery: (GroceryItemDto) -> Unit,
    onAddGrocery: (String) -> Unit,
    onRemoveGrocery: (GroceryItemDto) -> Unit,
    onClearErr: () -> Unit,
) {
    var prefs by remember { mutableStateOf("") }
    var newItem by remember { mutableStateOf("") }
    LazyColumn(
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item {
            Text(
                "Generate a batch-cook plan with a grocery list from your macro targets and pantry.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        item {
            OutlinedTextField(
                value = prefs,
                onValueChange = { prefs = it },
                label = { Text("Preferences (optional)") },
                modifier = Modifier.fillMaxWidth(),
            )
        }
        item {
            Button(onClick = { onGenerate(prefs.trim().ifBlank { null }) }, enabled = !busy) {
                Text(if (busy) "Generating…" else "Generate plan")
            }
        }
        mealPrepErr?.let {
            item {
                Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
                TextButton(onClick = onClearErr) { Text("Dismiss") }
            }
        }
        plan?.let { p ->
            item {
                Text("~${p.estimatedPrepTime} min prep", style = MaterialTheme.typography.labelLarge)
            }
            items(p.batchInstructions) { line ->
                Text("· $line", style = MaterialTheme.typography.bodySmall)
            }
            item {
                Text("Recipes (${p.recipes.size})", style = MaterialTheme.typography.titleSmall)
            }
            items(p.recipes) { r ->
                Text(
                    "${r.name} · ${r.servings} servings · ${r.prepTime + r.cookTime} min",
                    style = MaterialTheme.typography.bodyMedium,
                )
            }
            item {
                val remaining = p.groceryList.count { !it.checked }
                Text("Grocery list ($remaining to buy)", style = MaterialTheme.typography.titleSmall)
            }
            items(p.groceryList, key = { it.item }) { g ->
                Row(
                    Modifier.fillMaxWidth().clickable { onToggleGrocery(g) },
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Checkbox(checked = g.checked, onCheckedChange = { onToggleGrocery(g) })
                    Column(Modifier.weight(1f)) {
                        Text(
                            g.item,
                            style = MaterialTheme.typography.bodyMedium,
                            textDecoration = if (g.checked) TextDecoration.LineThrough else null,
                        )
                        if (g.amount.isNotBlank() || g.category.isNotBlank()) {
                            Text(
                                listOf(g.amount, g.category).filter { it.isNotBlank() }.joinToString(" · "),
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                    IconButton(onClick = { onRemoveGrocery(g) }) {
                        Icon(Icons.Filled.Delete, contentDescription = "Remove ${g.item}")
                    }
                }
            }
            item {
                Row(
                    Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    OutlinedTextField(
                        value = newItem,
                        onValueChange = { newItem = it },
                        label = { Text("Add grocery item") },
                        modifier = Modifier.weight(1f),
                        singleLine = true,
                    )
                    Button(
                        onClick = {
                            onAddGrocery(newItem)
                            newItem = ""
                        },
                        enabled = newItem.trim().isNotEmpty(),
                    ) { Text("Add") }
                }
            }
        }
    }
}

@Composable
private fun SavedRecipesTab(
    recipes: List<SavedRecipeDto>,
    suggestions: List<ScoredRecipeSuggestionDto>,
    status: String?,
    busy: Boolean,
    onSuggest: () -> Unit,
    onSaveUrl: (String) -> Unit,
    onClearStatus: () -> Unit,
) {
    var urlInput by remember { mutableStateOf("") }
    LazyColumn(
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item {
            Text(
                "Save recipes from URLs and ask Ref what fits your remaining macros (parity with iOS/web).",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        item {
            OutlinedTextField(
                value = urlInput,
                onValueChange = { urlInput = it },
                label = { Text("Recipe URL") },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
            )
        }
        item {
            Button(
                onClick = {
                    onSaveUrl(urlInput)
                    urlInput = ""
                },
                enabled = !busy && urlInput.trim().isNotEmpty(),
            ) {
                Text(if (busy) "Saving…" else "Save recipe")
            }
        }
        item {
            Button(onClick = onSuggest, enabled = !busy) {
                Text(if (busy) "Ranking…" else "Ask Ref what to cook")
            }
        }
        status?.let { msg ->
            item {
                Text(msg, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                TextButton(onClick = onClearStatus) { Text("Dismiss") }
            }
        }
        if (suggestions.isNotEmpty()) {
            item {
                Text("Top picks for today", style = MaterialTheme.typography.titleSmall)
            }
            items(suggestions, key = { "${it.id}#${it.name}" }) { s ->
                Card(
                    elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainerLow),
                ) {
                    Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Text(s.name, style = MaterialTheme.typography.titleMedium)
                        Text(
                            "${s.calories} cal · ${s.protein}g P · score ${s.fitScore}",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                        Text(s.fitReason, style = MaterialTheme.typography.bodySmall)
                        s.recipeUrl?.let { link ->
                            Text(link, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.primary)
                        }
                    }
                }
            }
        }
        item {
            Text("Library (${recipes.size})", style = MaterialTheme.typography.titleSmall)
        }
        if (recipes.isEmpty()) {
            item {
                Text(
                    "No saved recipes yet. Paste a URL above or sync from the web app.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        } else {
            items(recipes, key = { it.id }) { r ->
                Card(
                    elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainerLow),
                ) {
                    Column(Modifier.padding(12.dp)) {
                        Text(r.name, style = MaterialTheme.typography.titleMedium)
                        Text(
                            "${r.calories} cal · ${r.protein}g P",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            }
        }
    }
}

