package com.refactor.app.ui.consent

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp

@Composable
fun AIConsentDialog(
    onAccept: () -> Unit,
    onDecline: () -> Unit,
) {
    val ctx = LocalContext.current
    AlertDialog(
        onDismissRequest = onDecline,
        title = { Text("AI-Powered Features", fontWeight = FontWeight.Bold) },
        text = {
            Column(
                Modifier
                    .verticalScroll(rememberScrollState())
                    .padding(vertical = 4.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Text(
                    "Your permission is required before Refactor can share your data with a third-party AI service.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                DisclosureBlock(
                    title = "What data is shared",
                    body = "Your profile, meal logs, workout history, biofeedback, supplement names and dosages, and lab photos you upload.",
                )
                DisclosureBlock(
                    title = "Who receives your data",
                    body = "Data is sent to Amazon Web Services (AWS Bedrock) to generate responses. AWS does not use it to train AI models.",
                )
                DisclosureBlock(
                    title = "How it is protected",
                    body = "Transmitted over encrypted connections (TLS). No data is sold to third parties.",
                )
                DisclosureBlock(
                    title = "Your control",
                    body = "Revoke anytime in Profile → Revoke AI Access.",
                )
                TextButton(
                    onClick = {
                        ctx.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("https://refactoryourbody.com/privacy")))
                    },
                ) { Text("View Privacy Policy") }
            }
        },
        confirmButton = {
            Button(onClick = onAccept) { Text("Allow & Enable AI") }
        },
        dismissButton = {
            TextButton(onClick = onDecline) { Text("No Thanks") }
        },
    )
}

@Composable
private fun DisclosureBlock(title: String, body: String) {
    Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
        Text(title, style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.SemiBold)
        Text(body, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}
