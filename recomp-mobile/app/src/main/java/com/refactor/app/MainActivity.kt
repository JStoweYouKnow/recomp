package com.refactor.app

import android.os.Bundle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.fragment.app.FragmentActivity
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.refactor.app.api.AuthRepository
import com.refactor.app.api.BillingRepository
import com.refactor.app.api.CoachRepository
import com.refactor.app.api.GroupRepository
import com.refactor.app.api.MealPrepRepository
import com.refactor.app.api.ResearchRepository
import com.refactor.app.api.SyncRepository
import com.refactor.app.api.WorkoutExtrasRepository
import com.refactor.app.network.createHttpClient
import com.refactor.app.prefs.AppTheme
import com.refactor.app.prefs.ThemePrefs
import com.refactor.app.session.SessionStore
import com.refactor.app.billing.PlayBillingManager
import com.refactor.app.ui.AppShell
import com.refactor.app.ui.auth.AuthViewModel
import com.refactor.app.ui.theme.RecompTheme
import androidx.lifecycle.lifecycleScope

class MainActivity : FragmentActivity() {

    private val sessionStore by lazy { SessionStore(applicationContext) }
    private val httpClient by lazy { createHttpClient(sessionStore) }
    private val authRepository by lazy { AuthRepository(httpClient, sessionStore) }
    private val billingRepository by lazy { BillingRepository(httpClient) }
    private val playBilling by lazy { PlayBillingManager(application, lifecycleScope, billingRepository) }
    private val appDb by lazy { (application as RefactorAndroidApp).database }
    private val syncRepository by lazy { SyncRepository(httpClient, appDb.syncCacheDao()) }
    private val coachRepository by lazy { CoachRepository(httpClient) }
    private val groupRepository by lazy { GroupRepository(httpClient) }
    private val researchRepository by lazy { ResearchRepository(httpClient) }
    private val mealPrepRepository by lazy { MealPrepRepository(httpClient) }
    private val workoutExtrasRepository by lazy { WorkoutExtrasRepository(httpClient) }
    private val themePrefs by lazy { ThemePrefs(applicationContext) }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        val factory = AuthViewModel.Factory(authRepository, appDb.coachMessageDao(), application)
        setContent {
            val viewModel: AuthViewModel = viewModel(factory = factory)
            val loginUi by viewModel.ui.collectAsStateWithLifecycle()
            var themePreference by remember { mutableStateOf(themePrefs.getTheme()) }
            val systemDark = isSystemInDarkTheme()
            val useDark = when (themePreference) {
                AppTheme.DARK -> true
                AppTheme.LIGHT -> false
                AppTheme.SYSTEM -> systemDark
            }
            RecompTheme(darkTheme = useDark) {
                AppShell(
                    loginUi = loginUi,
                    onLogin = viewModel::login,
                    onLogout = viewModel::logout,
                    onDismissLoginError = viewModel::dismissLoginError,
                    userId = sessionStore.getUserId().orEmpty(),
                    syncRepository = syncRepository,
                    coachRepository = coachRepository,
                    coachMessageDao = appDb.coachMessageDao(),
                    syncCacheDao = appDb.syncCacheDao(),
                    groupRepository = groupRepository,
                    researchRepository = researchRepository,
                    mealPrepRepository = mealPrepRepository,
                    workoutExtrasRepository = workoutExtrasRepository,
                    playBilling = playBilling,
                    themePreference = themePreference,
                    onThemeChange = { theme ->
                        themePreference = theme
                        themePrefs.setTheme(theme)
                    },
                )
            }
        }
    }
}
