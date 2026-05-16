package com.recomp.app.ui.auth

import android.app.Application
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.recomp.app.api.AuthRepository
import com.recomp.app.api.ApiException
import com.recomp.app.db.CoachMessageDao
import com.recomp.app.push.PushRegistrar
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

sealed interface AuthUiState {
    /** Cold start / `GET /api/auth/me` */
    data object CheckingSession : AuthUiState
    data object LoggedOut : AuthUiState
    /** Login button pressed; keep login form visible with spinner. */
    data object LoggingIn : AuthUiState
    data class LoggedIn(val displayName: String) : AuthUiState
}

data class LoginUiState(
    val auth: AuthUiState = AuthUiState.CheckingSession,
    val loginError: String? = null,
)

class AuthViewModel(
    private val authRepository: AuthRepository,
    private val coachMessageDao: CoachMessageDao,
    private val application: Application,
) : ViewModel() {

    private val _ui = MutableStateFlow(LoginUiState())
    val ui: StateFlow<LoginUiState> = _ui.asStateFlow()

    init {
        refreshSession()
    }

    fun refreshSession() {
        viewModelScope.launch {
            _ui.update { it.copy(auth = AuthUiState.CheckingSession, loginError = null) }
            authRepository.me().fold(
                onSuccess = { me ->
                    val profile = me.profile
                    if (me.authenticated && profile != null) {
                        _ui.update {
                            it.copy(auth = AuthUiState.LoggedIn(profile.name), loginError = null)
                        }
                    } else {
                        _ui.update { it.copy(auth = AuthUiState.LoggedOut, loginError = null) }
                    }
                },
                onFailure = {
                    _ui.update { it.copy(auth = AuthUiState.LoggedOut, loginError = null) }
                }
            )
        }
    }

    fun login(email: String, password: String) {
        viewModelScope.launch {
            _ui.update { it.copy(auth = AuthUiState.LoggingIn, loginError = null) }
            authRepository.login(email, password).fold(
                onSuccess = { res ->
                    val profile = res.profile
                    if (profile != null && res.userId != null) {
                        _ui.update {
                            it.copy(auth = AuthUiState.LoggedIn(profile.name), loginError = null)
                        }
                    } else {
                        _ui.update {
                            it.copy(
                                auth = AuthUiState.LoggedOut,
                                loginError = "Sign-in did not return a profile.",
                            )
                        }
                    }
                },
                onFailure = { e ->
                    val msg = when (e) {
                        is ApiException -> e.message
                        else -> e.message ?: "Network error"
                    }
                    _ui.update {
                        it.copy(auth = AuthUiState.LoggedOut, loginError = msg)
                    }
                }
            )
        }
    }

    fun logout() {
        authRepository.logout()
        viewModelScope.launch {
            runCatching { PushRegistrar.unsubscribe(application) }
            runCatching { coachMessageDao.clearAll() }
        }
        _ui.update { LoginUiState(auth = AuthUiState.LoggedOut) }
    }

    fun dismissLoginError() {
        _ui.update { it.copy(loginError = null) }
    }

    class Factory(
        private val authRepository: AuthRepository,
        private val coachMessageDao: CoachMessageDao,
        private val application: Application,
    ) : ViewModelProvider.Factory {
        @Suppress("UNCHECKED_CAST")
        override fun <T : ViewModel> create(modelClass: Class<T>): T {
            require(modelClass.isAssignableFrom(AuthViewModel::class.java))
            return AuthViewModel(authRepository, coachMessageDao, application) as T
        }
    }
}
