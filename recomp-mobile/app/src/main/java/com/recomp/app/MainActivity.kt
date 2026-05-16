package com.recomp.app

import android.os.Bundle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.fragment.app.FragmentActivity
import androidx.compose.runtime.getValue
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.recomp.app.api.AuthRepository
import com.recomp.app.api.BillingRepository
import com.recomp.app.api.CoachRepository
import com.recomp.app.api.GroupRepository
import com.recomp.app.api.MealPrepRepository
import com.recomp.app.api.ResearchRepository
import com.recomp.app.api.SyncRepository
import com.recomp.app.api.WorkoutExtrasRepository
import com.recomp.app.network.createHttpClient
import com.recomp.app.session.SessionStore
import com.recomp.app.billing.PlayBillingManager
import com.recomp.app.ui.AppShell
import com.recomp.app.ui.auth.AuthViewModel
import com.recomp.app.ui.theme.RecompTheme
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

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        val factory = AuthViewModel.Factory(authRepository, appDb.coachMessageDao(), application)
        setContent {
            val viewModel: AuthViewModel = viewModel(factory = factory)
            val loginUi by viewModel.ui.collectAsStateWithLifecycle()
            RecompTheme {
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
                )
            }
        }
    }
}
