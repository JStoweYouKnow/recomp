package com.refactor.app.ui.auth

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
import androidx.compose.material.icons.outlined.ArrowDropDown
import androidx.compose.material3.Button
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
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
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import com.refactor.app.api.dto.RegisterRequest

private enum class AuthMode { Login, SignUp, Forgot }

/**
 * Hosts the unauthenticated screens (login / sign-up / forgot-password) and the
 * local navigation between them. Auth operations and their busy/error/info status
 * come from [AuthViewModel] via the callbacks; mode switching is local UI state.
 */
@Composable
fun AuthHost(
    busy: Boolean,
    errorMessage: String?,
    infoMessage: String?,
    onLogin: (email: String, password: String) -> Unit,
    onRegister: (RegisterRequest) -> Unit,
    onForgot: (email: String, onSent: () -> Unit) -> Unit,
    onReset: (email: String, code: String, newPassword: String, onDone: () -> Unit) -> Unit,
    onDismissError: () -> Unit,
) {
    var mode by remember { mutableStateOf(AuthMode.Login) }

    fun switchTo(target: AuthMode) {
        onDismissError()
        mode = target
    }

    when (mode) {
        AuthMode.Login -> LoginScreen(
            busy = busy,
            errorMessage = errorMessage,
            infoMessage = infoMessage,
            onLogin = onLogin,
            onDismissError = onDismissError,
            onCreateAccount = { switchTo(AuthMode.SignUp) },
            onForgotPassword = { switchTo(AuthMode.Forgot) },
        )
        AuthMode.SignUp -> SignUpScreen(
            busy = busy,
            errorMessage = errorMessage,
            onRegister = onRegister,
            onBack = { switchTo(AuthMode.Login) },
        )
        AuthMode.Forgot -> ForgotPasswordScreen(
            busy = busy,
            errorMessage = errorMessage,
            infoMessage = infoMessage,
            onRequestCode = onForgot,
            onReset = onReset,
            onResetComplete = { switchTo(AuthMode.Login) },
            onBack = { switchTo(AuthMode.Login) },
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun SignUpScreen(
    busy: Boolean,
    errorMessage: String?,
    onRegister: (RegisterRequest) -> Unit,
    onBack: () -> Unit,
) {
    var name by remember { mutableStateOf("") }
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var age by remember { mutableStateOf("") }
    var gender by remember { mutableStateOf("other") }
    var unit by remember { mutableStateOf("us") }
    var weight by remember { mutableStateOf("") }
    var heightCm by remember { mutableStateOf("") }
    var heightIn by remember { mutableStateOf("") }
    var goal by remember { mutableStateOf("maintain") }
    var fitnessLevel by remember { mutableStateOf("intermediate") }
    var activity by remember { mutableStateOf("moderate") }
    var workoutDays by remember { mutableStateOf("") }
    var workoutLocation by remember { mutableStateOf("gym") }

    val emailValid = email.trim().contains("@") && email.trim().contains(".")
    val canSubmit = !busy && name.isNotBlank() && emailValid && password.length >= 8

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Create account") },
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
                .padding(horizontal = 24.dp)
                .verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Spacer(Modifier.height(4.dp))
            SectionLabel("Account")
            OutlinedTextField(
                value = name, onValueChange = { name = it },
                label = { Text("Name") }, singleLine = true, enabled = !busy,
                modifier = Modifier.fillMaxWidth(),
            )
            OutlinedTextField(
                value = email, onValueChange = { email = it },
                label = { Text("Email") }, singleLine = true, enabled = !busy,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email),
                modifier = Modifier.fillMaxWidth(),
            )
            OutlinedTextField(
                value = password, onValueChange = { password = it },
                label = { Text("Password (min 8 characters)") }, singleLine = true, enabled = !busy,
                visualTransformation = PasswordVisualTransformation(),
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
                modifier = Modifier.fillMaxWidth(),
            )

            SectionLabel("Body")
            OutlinedTextField(
                value = age, onValueChange = { age = it.filter(Char::isDigit) },
                label = { Text("Age") }, singleLine = true, enabled = !busy,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                modifier = Modifier.fillMaxWidth(),
            )
            SegmentedRow(
                options = listOf("male" to "Male", "female" to "Female", "other" to "Other"),
                selected = gender, onSelect = { gender = it }, enabled = !busy,
            )
            SegmentedRow(
                options = listOf("us" to "US (lbs, in)", "metric" to "Metric (kg, cm)"),
                selected = unit, onSelect = { unit = it }, enabled = !busy,
            )
            OutlinedTextField(
                value = weight, onValueChange = { weight = it.filter { c -> c.isDigit() || c == '.' } },
                label = { Text(if (unit == "metric") "Weight (kg)" else "Weight (lbs)") },
                singleLine = true, enabled = !busy,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                modifier = Modifier.fillMaxWidth(),
            )
            if (unit == "metric") {
                OutlinedTextField(
                    value = heightCm, onValueChange = { heightCm = it.filter { c -> c.isDigit() || c == '.' } },
                    label = { Text("Height (cm)") }, singleLine = true, enabled = !busy,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                    modifier = Modifier.fillMaxWidth(),
                )
            } else {
                OutlinedTextField(
                    value = heightIn, onValueChange = { heightIn = it.filter { c -> c.isDigit() || c == '.' } },
                    label = { Text("Height (total inches)") }, singleLine = true, enabled = !busy,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                    modifier = Modifier.fillMaxWidth(),
                )
            }

            SectionLabel("Goals")
            EnumDropdown(
                label = "Goal",
                options = listOf(
                    "lose_weight" to "Lose weight",
                    "maintain" to "Maintain",
                    "build_muscle" to "Build muscle",
                    "improve_endurance" to "Improve endurance",
                ),
                selectedValue = goal, onSelect = { goal = it }, enabled = !busy,
            )
            EnumDropdown(
                label = "Fitness level",
                options = listOf(
                    "beginner" to "Beginner",
                    "intermediate" to "Intermediate",
                    "advanced" to "Advanced",
                    "athlete" to "Athlete",
                ),
                selectedValue = fitnessLevel, onSelect = { fitnessLevel = it }, enabled = !busy,
            )
            EnumDropdown(
                label = "Daily activity",
                options = listOf(
                    "sedentary" to "Sedentary",
                    "light" to "Light",
                    "moderate" to "Moderate",
                    "active" to "Active",
                    "very_active" to "Very active",
                ),
                selectedValue = activity, onSelect = { activity = it }, enabled = !busy,
            )

            SectionLabel("Training")
            OutlinedTextField(
                value = workoutDays, onValueChange = { workoutDays = it.filter(Char::isDigit) },
                label = { Text("Workout days per week (2–7)") }, singleLine = true, enabled = !busy,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                modifier = Modifier.fillMaxWidth(),
            )
            EnumDropdown(
                label = "Workout location",
                options = listOf("home" to "Home", "gym" to "Gym", "outside" to "Outside"),
                selectedValue = workoutLocation, onSelect = { workoutLocation = it }, enabled = !busy,
            )

            errorMessage?.let {
                Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodyMedium)
            }

            Spacer(Modifier.height(4.dp))
            Button(
                onClick = {
                    val w = weight.toDoubleOrNull()
                    val submitWeightLbs = w
                        ?.let { if (unit == "metric") it * 2.20462 else it }
                        ?.takeIf { it in 20.0..500.0 }
                    val submitHeightCm = (
                        if (unit == "metric") heightCm.toDoubleOrNull()
                        else heightIn.toDoubleOrNull()?.let { it * 2.54 }
                        )?.takeIf { it in 80.0..260.0 }
                    onRegister(
                        RegisterRequest(
                            name = name.trim(),
                            email = email.trim(),
                            password = password,
                            age = age.toIntOrNull()?.takeIf { it in 10..120 },
                            weight = submitWeightLbs,
                            height = submitHeightCm,
                            gender = gender,
                            fitnessLevel = fitnessLevel,
                            goal = goal,
                            dailyActivityLevel = activity,
                            unitSystem = unit,
                            workoutLocation = workoutLocation,
                            workoutDaysPerWeek = workoutDays.toIntOrNull()?.takeIf { it in 2..7 },
                        )
                    )
                },
                enabled = canSubmit,
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text(if (busy) "Creating account…" else "Create account")
            }
            TextButton(onClick = onBack, enabled = !busy, modifier = Modifier.fillMaxWidth()) {
                Text("Already have an account? Sign in")
            }
            Spacer(Modifier.height(16.dp))
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ForgotPasswordScreen(
    busy: Boolean,
    errorMessage: String?,
    infoMessage: String?,
    onRequestCode: (email: String, onSent: () -> Unit) -> Unit,
    onReset: (email: String, code: String, newPassword: String, onDone: () -> Unit) -> Unit,
    onResetComplete: () -> Unit,
    onBack: () -> Unit,
) {
    var email by remember { mutableStateOf("") }
    var codeSent by remember { mutableStateOf(false) }
    var code by remember { mutableStateOf("") }
    var newPassword by remember { mutableStateOf("") }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Reset password") },
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
                .padding(horizontal = 24.dp)
                .verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Spacer(Modifier.height(8.dp))
            Text(
                if (!codeSent) {
                    "Enter your account email and we'll send a 6-digit reset code."
                } else {
                    "Enter the 6-digit code sent to your email and choose a new password."
                },
                style = MaterialTheme.typography.bodyMedium,
            )

            OutlinedTextField(
                value = email, onValueChange = { email = it },
                label = { Text("Email") }, singleLine = true, enabled = !busy && !codeSent,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email),
                modifier = Modifier.fillMaxWidth(),
            )

            if (codeSent) {
                OutlinedTextField(
                    value = code, onValueChange = { code = it.filter(Char::isDigit).take(6) },
                    label = { Text("6-digit code") }, singleLine = true, enabled = !busy,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    modifier = Modifier.fillMaxWidth(),
                )
                OutlinedTextField(
                    value = newPassword, onValueChange = { newPassword = it },
                    label = { Text("New password (min 8 characters)") }, singleLine = true, enabled = !busy,
                    visualTransformation = PasswordVisualTransformation(),
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
                    modifier = Modifier.fillMaxWidth(),
                )
            }

            infoMessage?.let {
                Text(it, color = MaterialTheme.colorScheme.primary, style = MaterialTheme.typography.bodyMedium)
            }
            errorMessage?.let {
                Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodyMedium)
            }

            Spacer(Modifier.height(4.dp))
            if (!codeSent) {
                Button(
                    onClick = { onRequestCode(email.trim()) { codeSent = true } },
                    enabled = !busy && email.trim().contains("@"),
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text(if (busy) "Sending…" else "Send reset code")
                }
            } else {
                Button(
                    onClick = { onReset(email.trim(), code, newPassword, onResetComplete) },
                    enabled = !busy && code.length == 6 && newPassword.length >= 8,
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text(if (busy) "Resetting…" else "Reset password")
                }
                TextButton(
                    onClick = { onRequestCode(email.trim()) { codeSent = true } },
                    enabled = !busy,
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text("Resend code")
                }
            }
            Spacer(Modifier.height(16.dp))
        }
    }
}

@Composable
private fun SectionLabel(title: String) {
    Text(
        title,
        style = MaterialTheme.typography.titleSmall,
        color = MaterialTheme.colorScheme.primary,
        modifier = Modifier.padding(top = 8.dp),
    )
}

@Composable
private fun SegmentedRow(
    options: List<Pair<String, String>>,
    selected: String,
    onSelect: (String) -> Unit,
    enabled: Boolean,
) {
    SingleChoiceSegmentedButtonRow(modifier = Modifier.fillMaxWidth()) {
        options.forEachIndexed { index, (value, label) ->
            SegmentedButton(
                selected = selected == value,
                onClick = { if (enabled) onSelect(value) },
                shape = SegmentedButtonDefaults.itemShape(index, options.size),
                enabled = enabled,
            ) {
                Text(label, style = MaterialTheme.typography.labelMedium)
            }
        }
    }
}

@Composable
private fun EnumDropdown(
    label: String,
    options: List<Pair<String, String>>,
    selectedValue: String,
    onSelect: (String) -> Unit,
    enabled: Boolean,
) {
    var expanded by remember { mutableStateOf(false) }
    val selectedLabel = options.firstOrNull { it.first == selectedValue }?.second ?: "Select"
    Column {
        Text(
            label,
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(bottom = 4.dp),
        )
        OutlinedButton(
            onClick = { expanded = true },
            enabled = enabled,
            modifier = Modifier.fillMaxWidth(),
        ) {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Text(selectedLabel, modifier = Modifier.weight(1f))
                Icon(Icons.Outlined.ArrowDropDown, contentDescription = null)
            }
        }
        DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
            options.forEach { (value, display) ->
                DropdownMenuItem(
                    text = { Text(display) },
                    onClick = {
                        onSelect(value)
                        expanded = false
                    },
                )
            }
        }
    }
}
