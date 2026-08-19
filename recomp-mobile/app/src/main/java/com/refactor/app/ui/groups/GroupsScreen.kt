package com.refactor.app.ui.groups

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.RadioButton
import androidx.compose.material3.ScrollableTabRow
import androidx.compose.material3.Tab
import androidx.compose.foundation.background
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import android.content.Intent
import android.net.Uri
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import com.refactor.app.ui.legal.LegalUrls
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.refactor.app.api.GroupRepository
import com.refactor.app.api.dto.ChallengeDto
import com.refactor.app.api.dto.GroupDto
import com.refactor.app.api.dto.GroupMembershipDto

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun GroupsScreen(
    groupRepository: GroupRepository,
    userId: String,
    userDisplayName: String,
    /** Set when shown as an overlay (Groups is no longer a tab); renders a back action. */
    onBack: (() -> Unit)? = null,
) {
    val vm: GroupsViewModel = viewModel(factory = GroupsViewModel.Factory(groupRepository))
    val busy by vm.busy.collectAsStateWithLifecycle()
    val err by vm.error.collectAsStateWithLifecycle()
    val mine by vm.mine.collectAsStateWithLifecycle()
    val discover by vm.discover.collectAsStateWithLifecycle()
    val challenges by vm.challenges.collectAsStateWithLifecycle()
    val detail by vm.detail.collectAsStateWithLifecycle()

    var tab by remember { mutableIntStateOf(0) }
    var showCreate by remember { mutableStateOf(false) }
    var showJoin by remember { mutableStateOf(false) }
    var showCreateChallenge by remember { mutableStateOf(false) }
    var showSprintConfirm by remember { mutableStateOf(false) }

    if (detail != null) {
        GroupDetailScreen(
            ui = detail!!,
            busy = busy,
            onBack = { vm.closeGroup() },
            onSend = { text -> vm.sendChat(detail!!.group.id, text) {} },
            onLeave = { vm.leaveGroup(detail!!.group.id) },
        )
        return
    }

    Column(
        Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
    ) {
        TopAppBar(
            title = { Text("Groups") },
            navigationIcon = {
                onBack?.let {
                    IconButton(onClick = it) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                }
            },
            actions = {
                TextButton(onClick = { showJoin = true }, enabled = !busy) { Text("Join code") }
                TextButton(onClick = { showCreate = true }, enabled = !busy) { Text("New") }
                if (tab == 2) {
                    TextButton(onClick = { showSprintConfirm = true }, enabled = !busy) { Text("Sprint") }
                    TextButton(onClick = { showCreateChallenge = true }, enabled = !busy) { Text("Custom") }
                }
            },
        )
        ScrollableTabRow(selectedTabIndex = tab) {
            Tab(selected = tab == 0, onClick = { tab = 0 }, text = { Text("Mine") })
            Tab(selected = tab == 1, onClick = { tab = 1 }, text = { Text("Discover") })
            Tab(selected = tab == 2, onClick = { tab = 2 }, text = { Text("Challenges") })
        }
        if (busy) {
            Row(Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
                CircularProgressIndicator(Modifier.padding(end = 8.dp), strokeWidth = 2.dp)
                Text("Loading…")
            }
        }
        err?.let {
            Text(
                it,
                color = MaterialTheme.colorScheme.error,
                modifier = Modifier.padding(16.dp),
            )
            TextButton(onClick = { vm.clearError() }) { Text("Dismiss") }
        }
        when (tab) {
            0 -> LazyColumn(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                items(mine, key = { it.groupId }) { m ->
                    GroupMembershipRow(m) { vm.openGroup(m.groupId) }
                }
            }
            1 -> LazyColumn(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                items(discover, key = { it.id }) { g ->
                    DiscoverGroupRow(g) { vm.openGroup(g.id) }
                }
            }
                2 -> LazyColumn(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                items(challenges, key = { it.id }) { c ->
                    ChallengeRow(c, userId) { vm.joinChallenge(c.id, userDisplayName) }
                }
            }
        }
    }

    if (showCreate) {
        CreateGroupDialog(
            onDismiss = { showCreate = false },
            onConfirm = { name, desc, goal, access, track ->
                vm.createGroup(name, desc, goal, access, track)
                showCreate = false
            },
        )
    }
    if (showJoin) {
        JoinCodeDialog(
            onDismiss = { showJoin = false },
            onConfirm = { code ->
                vm.joinByCode(code)
                showJoin = false
            },
        )
    }
    if (showCreateChallenge) {
        CreateChallengeDialog(
            onDismiss = { showCreateChallenge = false },
            onConfirm = { title, metric, target, start, end ->
                vm.createChallenge(title, metric, target, start, end, userDisplayName)
                showCreateChallenge = false
            },
        )
    }
    if (showSprintConfirm) {
        SprintConfirmDialog(
            onDismiss = { showSprintConfirm = false },
            onConfirm = { metric ->
                val start = java.time.LocalDate.now().toString()
                val end = java.time.LocalDate.now().plusDays(7).toString()
                vm.createChallenge("7-Day Sprint", metric, if (metric == "steps") 70000.0 else 700.0, start, end, userDisplayName)
                showSprintConfirm = false
            },
        )
    }
}

@Composable
private fun GroupMembershipRow(m: GroupMembershipDto, onOpen: () -> Unit) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onOpen),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainerLow),
    ) {
        Column(Modifier.padding(14.dp)) {
            Text(m.groupName, style = MaterialTheme.typography.titleMedium)
            Text("${m.role} · joined ${m.joinedAt.take(10)}", style = MaterialTheme.typography.bodySmall)
        }
    }
}

@Composable
private fun DiscoverGroupRow(g: GroupDto, onOpen: () -> Unit) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onOpen),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainerLow),
    ) {
        Column(Modifier.padding(14.dp)) {
            Text(g.name, style = MaterialTheme.typography.titleMedium)
            Text(g.description, style = MaterialTheme.typography.bodySmall, maxLines = 3)
            Text("${g.memberCount} members · ${g.goalType}", style = MaterialTheme.typography.labelSmall)
        }
    }
}

@Composable
private fun ChallengeRow(c: ChallengeDto, userId: String, onJoin: () -> Unit) {
    val joined = userId.isNotBlank() && c.participants.any { it.userId == userId }
    val myProgress = c.participants.firstOrNull { it.userId == userId }?.progress ?: 0.0
    val progressFraction = if (c.target > 0) (myProgress / c.target).coerceIn(0.0, 1.0).toFloat() else 0f
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainerLow),
    ) {
        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text(c.title, style = MaterialTheme.typography.titleMedium)
            Text(c.description, style = MaterialTheme.typography.bodySmall, maxLines = 2)
            Text("${c.metric} · ends ${c.endDate} · ${c.status}", style = MaterialTheme.typography.labelSmall)
            if (joined && c.status == "active") {
                LinearProgressIndicator(
                    progress = { progressFraction },
                    modifier = Modifier.fillMaxWidth(),
                )
                Text(
                    "${myProgress.toInt()} / ${c.target.toInt()}",
                    style = MaterialTheme.typography.labelSmall,
                )
            } else {
                OutlinedButton(onClick = onJoin, enabled = !joined && c.status != "completed") {
                    Text(if (joined) "Joined" else "Join")
                }
            }
        }
    }
}

@Composable
private fun SprintConfirmDialog(onDismiss: () -> Unit, onConfirm: (metric: String) -> Unit) {
    var metric by remember { mutableStateOf("xp_gained") }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Start a 7-Day Sprint") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("A 7-day challenge starting today. Pick what you're competing on:", style = MaterialTheme.typography.bodyMedium)
                listOf(
                    "xp_gained" to "XP earned (overall effort)",
                    "meal_streak" to "Meal logging streak",
                    "steps" to "Total steps (70k target)",
                    "macro_accuracy" to "Macro accuracy",
                ).forEach { (value, label) ->
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable { metric = value }
                            .padding(vertical = 4.dp),
                    ) {
                        RadioButton(selected = metric == value, onClick = { metric = value })
                        Text(label, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(start = 8.dp))
                    }
                }
            }
        },
        confirmButton = {
            TextButton(onClick = { onConfirm(metric) }) { Text("Start Sprint") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    )
}

@Composable
private fun CreateGroupDialog(
    onDismiss: () -> Unit,
    onConfirm: (name: String, desc: String, goal: String, access: String, track: String) -> Unit,
) {
    var name by remember { mutableStateOf("") }
    var desc by remember { mutableStateOf("") }
    var goal by remember { mutableStateOf("consistency") }
    var access by remember { mutableStateOf("open") }
    var track by remember { mutableStateOf("both") }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("New group") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(value = name, onValueChange = { name = it }, label = { Text("Name") })
                OutlinedTextField(value = desc, onValueChange = { desc = it }, label = { Text("Description") })
                OutlinedTextField(value = goal, onValueChange = { goal = it }, label = { Text("Goal type") })
                OutlinedTextField(value = access, onValueChange = { access = it }, label = { Text("open / invite_only") })
                OutlinedTextField(value = track, onValueChange = { track = it }, label = { Text("aggregate / leaderboard / both") })
            }
        },
        confirmButton = {
            TextButton(
                onClick = {
                    if (name.isNotBlank()) onConfirm(name.trim(), desc.trim(), goal.trim(), access.trim(), track.trim())
                },
            ) { Text("Create") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    )
}

@Composable
private fun JoinCodeDialog(onDismiss: () -> Unit, onConfirm: (String) -> Unit) {
    var code by remember { mutableStateOf("") }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Join with code") },
        text = { OutlinedTextField(value = code, onValueChange = { code = it }, label = { Text("Invite code") }) },
        confirmButton = {
            TextButton(onClick = { if (code.isNotBlank()) onConfirm(code.trim()) }) { Text("Join") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    )
}

@Composable
private fun CreateChallengeDialog(
    onDismiss: () -> Unit,
    onConfirm: (title: String, metric: String, target: Double, start: String, end: String) -> Unit,
) {
    var title by remember { mutableStateOf("") }
    var metric by remember { mutableStateOf("steps") }
    var target by remember { mutableStateOf("10000") }
    var start by remember { mutableStateOf(java.time.LocalDate.now().toString()) }
    var end by remember { mutableStateOf(java.time.LocalDate.now().plusDays(7).toString()) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("New challenge") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(value = title, onValueChange = { title = it }, label = { Text("Title") })
                OutlinedTextField(value = metric, onValueChange = { metric = it }, label = { Text("Metric") })
                OutlinedTextField(value = target, onValueChange = { target = it }, label = { Text("Target") })
                OutlinedTextField(value = start, onValueChange = { start = it }, label = { Text("Start yyyy-MM-dd") })
                OutlinedTextField(value = end, onValueChange = { end = it }, label = { Text("End yyyy-MM-dd") })
            }
        },
        confirmButton = {
            TextButton(
                onClick = {
                    val t = target.toDoubleOrNull() ?: return@TextButton
                    if (title.isNotBlank()) onConfirm(title.trim(), metric.trim(), t, start.trim(), end.trim())
                },
            ) { Text("Create") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun GroupDetailScreen(
    ui: GroupDetailUi,
    busy: Boolean,
    onBack: () -> Unit,
    onSend: (String) -> Unit,
    onLeave: () -> Unit,
) {
    var sub by remember { mutableIntStateOf(0) }
    var draft by remember { mutableStateOf("") }
    val ctx = LocalContext.current
    Column(Modifier.fillMaxSize()) {
        TopAppBar(
            title = { Text(ui.group.name) },
            navigationIcon = {
                IconButton(onClick = onBack) {
                    Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                }
            },
            actions = {
                TextButton(onClick = onLeave, enabled = !busy) { Text("Leave") }
            },
        )
        ScrollableTabRow(selectedTabIndex = sub) {
            Tab(selected = sub == 0, onClick = { sub = 0 }, text = { Text("Chat") })
            Tab(selected = sub == 1, onClick = { sub = 1 }, text = { Text("Leaderboard") })
            Tab(selected = sub == 2, onClick = { sub = 2 }, text = { Text("Members") })
        }
        when (sub) {
            0 -> {
                LazyColumn(
                    Modifier.weight(1f).padding(horizontal = 16.dp),
                    verticalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    items(ui.messages, key = { it.id }) { m ->
                        Text("${m.authorName}: ${m.text}", style = MaterialTheme.typography.bodyMedium)
                    }
                }
                Row(
                    Modifier.fillMaxWidth().padding(8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    OutlinedTextField(
                        value = draft,
                        onValueChange = { draft = it },
                        modifier = Modifier.weight(1f),
                        label = { Text("Message") },
                    )
                    Button(
                        onClick = {
                            if (draft.isNotBlank()) {
                                onSend(draft)
                                draft = ""
                            }
                        },
                        enabled = !busy && draft.isNotBlank(),
                    ) { Text("Send") }
                }
                TextButton(
                    onClick = {
                        val subject = Uri.encode("Report group content: ${ui.group.name}")
                        val body = Uri.encode(
                            "Group ID: ${ui.group.id}\n" +
                                "Please describe the message or behavior you are reporting:\n\n",
                        )
                        ctx.startActivity(
                            Intent(Intent.ACTION_SENDTO).apply {
                                data = Uri.parse("mailto:${LegalUrls.SUPPORT_EMAIL}?subject=$subject&body=$body")
                            },
                        )
                    },
                    modifier = Modifier.padding(horizontal = 8.dp),
                ) {
                    Text("Report content", style = MaterialTheme.typography.labelMedium)
                }
            }
            1 -> LazyColumn(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                items(ui.leaderboard, key = { it.userId }) { row ->
                    Text("${row.name} · XP ${row.xp} · streak ${row.streakLength}", style = MaterialTheme.typography.bodyMedium)
                }
            }
            2 -> LazyColumn(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                items(ui.members, key = { it.groupId + it.joinedAt + it.role }) { mem ->
                    Text("${mem.role} · since ${mem.joinedAt.take(10)}", style = MaterialTheme.typography.bodyMedium)
                }
            }
        }
    }
}
