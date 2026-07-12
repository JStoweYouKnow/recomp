package com.refactor.app.ui.coach

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Bundle
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.refactor.app.api.CoachRepository
import com.refactor.app.api.SyncRepository
import com.refactor.app.db.CoachMessageDao
import com.refactor.app.db.SyncCacheDao
import com.refactor.app.ui.legal.MedicalDisclaimerText

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CoachChatDialog(
    coachRepository: CoachRepository,
    syncRepository: SyncRepository,
    syncCacheDao: SyncCacheDao,
    coachMessageDao: CoachMessageDao,
    onDismiss: () -> Unit,
) {
    val vm: CoachViewModel = viewModel(
        factory = CoachViewModel.Factory(
            coachRepository,
            syncRepository,
            syncCacheDao,
            coachMessageDao,
        )
    )
    val lines by vm.lines.collectAsStateWithLifecycle()
    val busy by vm.busy.collectAsStateWithLifecycle()
    val regeneratingPlan by vm.regeneratingPlan.collectAsStateWithLifecycle()
    val err by vm.error.collectAsStateWithLifecycle()
    val pushNote by vm.lastPushNote.collectAsStateWithLifecycle()
    var draft by remember { mutableStateOf("") }
    val context = LocalContext.current
    val speech = remember(context) { SpeechRecognizer.createSpeechRecognizer(context) }
    DisposableEffect(speech) {
        onDispose { speech.destroy() }
    }
    val audioPermission = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission(),
    ) { granted ->
        if (granted) {
            startSpeechListen(context, speech) { text ->
                if (text.isNotBlank()) draft = if (draft.isBlank()) text else "$draft $text"
            }
        }
    }

    AlertDialog(
        onDismissRequest = onDismiss,
        modifier = Modifier.fillMaxWidth(),
        title = { Text("Ref") },
        text = {
            Surface(shape = MaterialTheme.shapes.medium) {
                Column(
                    Modifier
                        .fillMaxWidth()
                        .padding(4.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    err?.let {
                        Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
                    }
                    pushNote?.let {
                        Text(
                            it,
                            color = MaterialTheme.colorScheme.primary,
                            style = MaterialTheme.typography.bodySmall,
                        )
                    }
                    if (regeneratingPlan) {
                        Row(
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            CircularProgressIndicator(strokeWidth = 2.dp)
                            Text(
                                "Building your new plan… (multi-week programs may take a few minutes)",
                                style = MaterialTheme.typography.bodySmall,
                            )
                        }
                    }
                    MedicalDisclaimerText()
                    LazyColumn(
                        Modifier
                            .fillMaxWidth()
                            .heightIn(min = 120.dp, max = 320.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        itemsIndexed(lines) { _, line ->
                            val style = when (line.role) {
                                ChatRole.User -> MaterialTheme.typography.bodyMedium to MaterialTheme.colorScheme.primary
                                ChatRole.Assistant -> MaterialTheme.typography.bodyMedium to MaterialTheme.colorScheme.onSurface
                            }
                            Text(
                                when (line.role) {
                                    ChatRole.User -> "You · ${line.content}"
                                    ChatRole.Assistant -> "Ref · ${line.content}"
                                },
                                style = style.first,
                                color = style.second,
                            )
                        }
                    }
                    Row(
                        Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(4.dp),
                    ) {
                        OutlinedTextField(
                            value = draft,
                            onValueChange = { draft = it },
                            modifier = Modifier.weight(1f),
                            placeholder = { Text("Message…") },
                            enabled = !busy && !regeneratingPlan,
                            singleLine = false,
                            maxLines = 4,
                        )
                        IconButton(
                            onClick = {
                                when {
                                    ContextCompat.checkSelfPermission(
                                        context,
                                        Manifest.permission.RECORD_AUDIO,
                                    ) != PackageManager.PERMISSION_GRANTED ->
                                        audioPermission.launch(Manifest.permission.RECORD_AUDIO)
                                    SpeechRecognizer.isRecognitionAvailable(context) ->
                                        startSpeechListen(context, speech) { text ->
                                            if (text.isNotBlank()) {
                                                draft = if (draft.isBlank()) text else "$draft $text"
                                            }
                                        }
                                    else -> Unit
                                }
                            },
                            enabled = !busy && !regeneratingPlan,
                        ) {
                            Icon(Icons.Filled.Mic, contentDescription = "Speech to text")
                        }
                        IconButton(
                            onClick = {
                                vm.send(draft.trim())
                                draft = ""
                            },
                            enabled = !busy && !regeneratingPlan && draft.isNotBlank(),
                        ) {
                            if (busy) {
                                CircularProgressIndicator(Modifier.padding(8.dp), strokeWidth = 2.dp)
                            } else {
                                Icon(Icons.AutoMirrored.Filled.Send, contentDescription = "Send")
                            }
                        }
                    }
                }
            }
        },
        confirmButton = {
            TextButton(onClick = onDismiss) { Text("Close") }
        },
    )
}

private fun startSpeechListen(
    context: android.content.Context,
    speech: SpeechRecognizer,
    onText: (String) -> Unit,
) {
    if (!SpeechRecognizer.isRecognitionAvailable(context)) return
    val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
        putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
    }
    speech.setRecognitionListener(object : RecognitionListener {
        override fun onReadyForSpeech(params: Bundle?) {}
        override fun onBeginningOfSpeech() {}
        override fun onRmsChanged(rmsdB: Float) {}
        override fun onBufferReceived(buffer: ByteArray?) {}
        override fun onEndOfSpeech() {}
        override fun onError(error: Int) {
            onText("")
        }

        override fun onResults(results: Bundle?) {
            val matches = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
            onText(matches?.firstOrNull().orEmpty())
        }

        override fun onPartialResults(partialResults: Bundle?) {}
        override fun onEvent(eventType: Int, params: Bundle?) {}
    })
    speech.startListening(intent)
}
