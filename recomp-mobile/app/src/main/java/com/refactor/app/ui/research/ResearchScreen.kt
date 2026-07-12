package com.refactor.app.ui.research

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.Alignment
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.unit.dp
import com.refactor.app.api.ResearchRepository
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ResearchScreen(
    researchRepository: ResearchRepository,
    onBack: (() -> Unit)? = null,
) {
    var query by remember { mutableStateOf("") }
    var answer by remember { mutableStateOf<String?>(null) }
    var sources by remember { mutableStateOf<List<Pair<String, String>>>(emptyList()) }
    var err by remember { mutableStateOf<String?>(null) }
    var searching by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    val uri = LocalUriHandler.current

    fun runSearch() {
        if (query.isBlank()) return
        searching = true
        err = null
        scope.launch {
            researchRepository.search(query.trim()).fold(
                onSuccess = { r ->
                    answer = r.answer
                    sources = r.sources?.map { it.title to it.url }.orEmpty()
                    searching = false
                },
                onFailure = {
                    err = it.message
                    searching = false
                },
            )
        }
    }

    Column(Modifier.fillMaxSize()) {
        TopAppBar(
            title = { Text("Research") },
            navigationIcon = {
                if (onBack != null) {
                    TextButton(onClick = onBack) { Text("Back") }
                }
            },
        )
        Column(
            Modifier
                .padding(16.dp)
                .verticalScroll(rememberScrollState()),
        ) {
            OutlinedTextField(
                value = query,
                onValueChange = { query = it },
                label = { Text("Search nutrition & fitness…") },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
            )
            Button(
                onClick = { runSearch() },
                enabled = !searching && query.isNotBlank(),
                modifier = Modifier.padding(top = 8.dp),
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Filled.Search, contentDescription = null)
                    Spacer(Modifier.width(8.dp))
                    Text("Search")
                }
            }
            if (searching) {
                CircularProgressIndicator(modifier = Modifier.padding(top = 16.dp))
            }
            err?.let {
                Text(it, color = MaterialTheme.colorScheme.error, modifier = Modifier.padding(top = 12.dp))
            }
            answer?.let { a ->
                Text(a, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(top = 12.dp))
                if (sources.isNotEmpty()) {
                    Text("Sources", style = MaterialTheme.typography.titleSmall, modifier = Modifier.padding(top = 16.dp))
                    for ((title, url) in sources) {
                        Text(
                            title,
                            color = MaterialTheme.colorScheme.primary,
                            style = MaterialTheme.typography.bodySmall,
                            modifier = Modifier
                                .padding(top = 6.dp)
                                .fillMaxWidth()
                                .clickable { runCatching { uri.openUri(url) } },
                        )
                    }
                }
            }
        }
    }
}
