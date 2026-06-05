package com.recomp.app.ui.security

import androidx.biometric.BiometricPrompt
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import androidx.fragment.app.FragmentActivity
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner

/**
 * When biometric gate is enabled, blocks UI after the activity has been stopped (e.g. app backgrounded)
 * until the user passes [BiometricPrompt].
 */
@Composable
fun BiometricGate(
    biometricEnabled: Boolean,
    content: @Composable () -> Unit,
) {
    val context = LocalContext.current
    val activity = context as? FragmentActivity ?: run {
        content()
        return
    }
    val lifecycleOwner = LocalLifecycleOwner.current
    var needsUnlock by remember { mutableStateOf(false) }

    LaunchedEffect(biometricEnabled) {
        if (!biometricEnabled) needsUnlock = false
    }

    DisposableEffect(lifecycleOwner, biometricEnabled) {
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_STOP && biometricEnabled) {
                needsUnlock = true
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
    }

    if (!biometricEnabled || !needsUnlock) {
        content()
        return
    }

    Surface(Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.surface) {
        Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(16.dp),
            ) {
                Text("Unlock Refactor", style = MaterialTheme.typography.titleLarge)
                Button(
                    onClick = {
                        val executor = ContextCompat.getMainExecutor(activity)
                        val prompt = BiometricPrompt(
                            activity,
                            executor,
                            object : BiometricPrompt.AuthenticationCallback() {
                                override fun onAuthenticationSucceeded(
                                    result: BiometricPrompt.AuthenticationResult,
                                ) {
                                    needsUnlock = false
                                }
                            },
                        )
                        val info = BiometricPrompt.PromptInfo.Builder()
                            .setTitle("Unlock Refactor")
                            .setSubtitle("Confirm your identity")
                            .setNegativeButtonText("Cancel")
                            .build()
                        prompt.authenticate(info)
                    },
                ) {
                    Text("Use biometrics")
                }
            }
        }
    }
}
