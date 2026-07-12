package com.refactor.app.ui.auth

import android.app.Application
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.refactor.app.api.AuthRepository
import com.refactor.app.api.ApiException
import com.refactor.app.api.dto.RegisterRequest
import com.refactor.app.db.CoachMessageDao
import com.refactor.app.push.PushRegistrar
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

sealed interface AuthUiState {
    /** Cold start / `GET /api/auth/me` */
    data object CheckingSession : AuthUiState
    data object LoggedOut : AuthUiState
    data class LoggedIn(val displayName: String) : AuthUiState
}

data class LoginUiState(
    val auth: AuthUiState = AuthUiState.CheckingSession,
    /** An auth operation (login/register/forgot/reset) is in flight. */
    val busy: Boolean = false,
    val loginError: String? = null,
    /** Non-error status text shown on auth screens (e.g. "reset code sent"). */
    val info: String? = null,
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

    fun demo() {
        viewModelScope.launch {
            _ui.update { it.copy(busy = true, loginError = null, info = null) }
            authRepository.demo().fold(
                onSuccess = { res ->
                    val profile = res.profile
                    if (profile != null && res.userId != null) {
                        _ui.update {
                            it.copy(auth = AuthUiState.LoggedIn(profile.name), busy = false, loginError = null)
                        }
                    } else {
                        _ui.update {
                            it.copy(busy = false, loginError = "Demo sign-in did not return a profile.")
                        }
                    }
                },
                onFailure = { e -> _ui.update { it.copy(busy = false, loginError = errorMessage(e)) } },
            )
        }
    }

    fun login(email: String, password: String) {
        viewModelScope.launch {
            _ui.update { it.copy(busy = true, loginError = null, info = null) }
            authRepository.login(email, password).fold(
                onSuccess = { res ->
                    val profile = res.profile
                    if (profile != null && res.userId != null) {
                        _ui.update {
                            it.copy(auth = AuthUiState.LoggedIn(profile.name), busy = false, loginError = null)
                        }
                    } else {
                        _ui.update {
                            it.copy(busy = false, loginError = "Sign-in did not return a profile.")
                        }
                    }
                },
                onFailure = { e -> _ui.update { it.copy(busy = false, loginError = errorMessage(e)) } }
            )
        }
    }

    fun register(request: RegisterRequest) {
        viewModelScope.launch {
            _ui.update { it.copy(busy = true, loginError = null, info = null) }
            authRepository.register(request).fold(
                onSuccess = { res ->
                    val profile = res.profile
                    if (profile != null && res.userId != null) {
                        _ui.update {
                            it.copy(auth = AuthUiState.LoggedIn(profile.name), busy = false, loginError = null)
                        }
                    } else {
                        _ui.update {
                            it.copy(busy = false, loginError = "Account creation did not return a profile.")
                        }
                    }
                },
                onFailure = { e -> _ui.update { it.copy(busy = false, loginError = errorMessage(e)) } }
            )
        }
    }

    /** Step 1 of password reset; [onSent] advances the UI to the code-entry step. */
    fun forgotPassword(email: String, onSent: () -> Unit) {
        viewModelScope.launch {
            _ui.update { it.copy(busy = true, loginError = null, info = null) }
            authRepository.forgotPassword(email).fold(
                onSuccess = {
                    _ui.update {
                        it.copy(
                            busy = false,
                            info = "If an account exists for that email, a 6-digit code is on its way.",
                        )
                    }
                    onSent()
                },
                onFailure = { e -> _ui.update { it.copy(busy = false, loginError = errorMessage(e)) } }
            )
        }
    }

    /** Step 2 of password reset; [onDone] returns the UI to the login screen on success. */
    fun resetPassword(email: String, code: String, newPassword: String, onDone: () -> Unit) {
        viewModelScope.launch {
            _ui.update { it.copy(busy = true, loginError = null, info = null) }
            authRepository.resetPassword(email, code, newPassword).fold(
                onSuccess = {
                    _ui.update {
                        it.copy(busy = false, info = "Password updated. Sign in with your new password.")
                    }
                    onDone()
                },
                onFailure = { e -> _ui.update { it.copy(busy = false, loginError = errorMessage(e)) } }
            )
        }
    }

    private fun errorMessage(e: Throwable): String = when (e) {
        is ApiException -> e.message ?: "Request failed (${e.code})"
        else -> e.message ?: "Network error"
    }

    fun logout() {
        authRepository.logout()
        viewModelScope.launch {
            runCatching { PushRegistrar.unsubscribe(application) }
            runCatching { coachMessageDao.clearAll() }
        }
        _ui.update { LoginUiState(auth = AuthUiState.LoggedOut) }
    }

    /** Called after [AuthRepository.deleteAccount] clears the session in Profile. */
    fun onAccountDeleted() {
        viewModelScope.launch {
            runCatching { PushRegistrar.unsubscribe(application) }
            runCatching { coachMessageDao.clearAll() }
        }
        _ui.update { LoginUiState(auth = AuthUiState.LoggedOut) }
    }

    fun dismissLoginError() {
        _ui.update { it.copy(loginError = null, info = null) }
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
