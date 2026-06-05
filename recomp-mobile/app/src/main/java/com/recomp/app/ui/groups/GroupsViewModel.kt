package com.recomp.app.ui.groups

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.recomp.app.api.GroupRepository
import com.recomp.app.api.dto.ChallengeDto
import com.recomp.app.api.dto.GroupDto
import com.recomp.app.api.dto.GroupMemberProgressDto
import com.recomp.app.api.dto.GroupMembershipDto
import com.recomp.app.api.dto.GroupMessageDto
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class GroupDetailUi(
    val group: GroupDto,
    val members: List<GroupMembershipDto>,
    val messages: List<GroupMessageDto>,
    val leaderboard: List<GroupMemberProgressDto>,
)

class GroupsViewModel(
    private val repo: GroupRepository,
) : ViewModel() {

    private val _busy = MutableStateFlow(false)
    val busy: StateFlow<Boolean> = _busy.asStateFlow()

    private val _error = MutableStateFlow<String?>(null)
    val error: StateFlow<String?> = _error.asStateFlow()

    private val _mine = MutableStateFlow<List<GroupMembershipDto>>(emptyList())
    val mine: StateFlow<List<GroupMembershipDto>> = _mine.asStateFlow()

    private val _discover = MutableStateFlow<List<GroupDto>>(emptyList())
    val discover: StateFlow<List<GroupDto>> = _discover.asStateFlow()

    private val _challenges = MutableStateFlow<List<ChallengeDto>>(emptyList())
    val challenges: StateFlow<List<ChallengeDto>> = _challenges.asStateFlow()

    private val _detail = MutableStateFlow<GroupDetailUi?>(null)
    val detail: StateFlow<GroupDetailUi?> = _detail.asStateFlow()

    init {
        refreshAll()
    }

    fun clearError() {
        _error.value = null
    }

    fun refreshAll() {
        viewModelScope.launch {
            _busy.value = true
            repo.listMine().onSuccess { _mine.value = it }.onFailure { _error.value = it.message }
            repo.discover().onSuccess { _discover.value = it }.onFailure { _error.value = it.message }
            repo.listChallenges().onSuccess { _challenges.value = it }.onFailure { /* optional */ }
            _busy.value = false
        }
    }

    fun openGroup(groupId: String) {
        viewModelScope.launch {
            _busy.value = true
            val d = repo.detail(groupId).getOrElse {
                _error.value = it.message
                _busy.value = false
                return@launch
            }
            val msgs = repo.messages(groupId).getOrElse { emptyList() }
            val board = repo.leaderboard(groupId).getOrElse { emptyList() }
            _detail.value = GroupDetailUi(d.group, d.members, msgs, board)
            _busy.value = false
        }
    }

    fun closeGroup() {
        _detail.value = null
    }

    fun sendChat(groupId: String, text: String, onDone: () -> Unit) {
        viewModelScope.launch {
            _busy.value = true
            repo.sendMessage(groupId, text).onFailure { _error.value = it.message }
            repo.messages(groupId).onSuccess { next ->
                _detail.value = _detail.value?.copy(messages = next)
            }
            _busy.value = false
            onDone()
        }
    }

    fun leaveGroup(groupId: String) {
        viewModelScope.launch {
            _busy.value = true
            repo.leave(groupId).onFailure { _error.value = it.message }
            closeGroup()
            refreshAll()
            _busy.value = false
        }
    }

    fun createGroup(
        name: String,
        description: String,
        goalType: String,
        accessMode: String,
        trackingMode: String,
    ) {
        viewModelScope.launch {
            _busy.value = true
            repo.create(name, description, goalType, null, accessMode, trackingMode)
                .onFailure { _error.value = it.message }
            refreshAll()
            _busy.value = false
        }
    }

    fun joinByCode(code: String) {
        viewModelScope.launch {
            _busy.value = true
            repo.joinByCode(code).onFailure { _error.value = it.message }
            refreshAll()
            _busy.value = false
        }
    }

    fun createChallenge(
        title: String,
        metric: String,
        target: Double,
        start: String,
        end: String,
        userName: String?,
    ) {
        viewModelScope.launch {
            _busy.value = true
            repo.createChallenge(
                type = "solo",
                title = title,
                description = "",
                metric = metric,
                target = target,
                startDate = start,
                endDate = end,
                stakes = null,
                groupId = null,
                userName = userName,
            ).onFailure { _error.value = it.message }
            repo.listChallenges().onSuccess { _challenges.value = it }
            _busy.value = false
        }
    }

    fun joinChallenge(id: String, userName: String?) {
        viewModelScope.launch {
            _busy.value = true
            repo.joinChallenge(id, userName).onFailure { _error.value = it.message }
            repo.listChallenges().onSuccess { _challenges.value = it }
            _busy.value = false
        }
    }

    class Factory(private val repo: GroupRepository) : ViewModelProvider.Factory {
        override fun <T : ViewModel> create(modelClass: Class<T>): T {
            require(modelClass.isAssignableFrom(GroupsViewModel::class.java))
            @Suppress("UNCHECKED_CAST")
            return GroupsViewModel(repo) as T
        }
    }
}
