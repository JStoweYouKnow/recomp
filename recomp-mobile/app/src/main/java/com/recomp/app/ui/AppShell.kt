package com.recomp.app.ui

import android.Manifest
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.consumeWindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.FitnessCenter
import androidx.compose.material.icons.outlined.Groups
import androidx.compose.material.icons.outlined.Home
import androidx.compose.material.icons.outlined.Person
import androidx.compose.material.icons.outlined.RestaurantMenu
import androidx.compose.material.icons.outlined.Tune
import androidx.compose.material.icons.automirrored.outlined.ShowChart
import androidx.compose.material.icons.automirrored.rounded.Chat
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.core.content.ContextCompat
import com.recomp.app.BuildConfig
import com.recomp.app.prefs.BiometricPrefs
import com.recomp.app.push.PushRegistrar
import com.recomp.app.ui.security.BiometricGate
import kotlinx.coroutines.launch
import com.recomp.app.ui.auth.AuthUiState
import com.recomp.app.ui.auth.LoginScreen
import com.recomp.app.ui.auth.LoginUiState
import com.recomp.app.api.CoachRepository
import com.recomp.app.api.GroupRepository
import com.recomp.app.api.MealPrepRepository
import com.recomp.app.api.ResearchRepository
import com.recomp.app.api.SyncRepository
import com.recomp.app.api.WorkoutExtrasRepository
import com.recomp.app.billing.PlayBillingManager
import com.recomp.app.db.CoachMessageDao
import com.recomp.app.db.SyncCacheDao
import com.recomp.app.ui.dashboard.DashboardScreen
import com.recomp.app.ui.meals.MealsScreen
import com.recomp.app.ui.workouts.WorkoutsScreen
import com.recomp.app.ui.coach.CoachChatDialog
import com.recomp.app.ui.more.SyncAdjustScreen
import com.recomp.app.ui.more.SyncMilestonesScreen
import com.recomp.app.ui.groups.GroupsScreen
import com.recomp.app.ui.profile.ProfileHubScreen

private data class RootTab(val label: String, val icon: @Composable () -> Unit)

@Composable
fun AppShell(
    loginUi: LoginUiState,
    onLogin: (String, String) -> Unit,
    onLogout: () -> Unit,
    onDismissLoginError: () -> Unit,
    userId: String,
    syncRepository: SyncRepository,
    coachRepository: CoachRepository,
    coachMessageDao: CoachMessageDao,
    syncCacheDao: SyncCacheDao,
    groupRepository: GroupRepository,
    researchRepository: ResearchRepository,
    mealPrepRepository: MealPrepRepository,
    workoutExtrasRepository: WorkoutExtrasRepository,
    playBilling: PlayBillingManager,
) {
    when (val auth = loginUi.auth) {
        AuthUiState.CheckingSession -> {
            Box(
                Modifier.fillMaxSize(),
                contentAlignment = Alignment.Center
            ) {
                CircularProgressIndicator()
            }
        }
        AuthUiState.LoggedOut -> {
            LoginScreen(
                busy = false,
                errorMessage = loginUi.loginError,
                onLogin = onLogin,
                onDismissError = onDismissLoginError,
            )
        }
        AuthUiState.LoggingIn -> {
            LoginScreen(
                busy = true,
                errorMessage = loginUi.loginError,
                onLogin = onLogin,
                onDismissError = onDismissLoginError,
            )
        }
        is AuthUiState.LoggedIn -> {
            MainShell(
                userLabel = auth.displayName,
                userId = userId,
                onLogout = onLogout,
                syncRepository = syncRepository,
                coachRepository = coachRepository,
                coachMessageDao = coachMessageDao,
                syncCacheDao = syncCacheDao,
                groupRepository = groupRepository,
                researchRepository = researchRepository,
                mealPrepRepository = mealPrepRepository,
                workoutExtrasRepository = workoutExtrasRepository,
                playBilling = playBilling,
            )
        }
    }
}

@Composable
private fun MainShell(
    userLabel: String,
    userId: String,
    onLogout: () -> Unit,
    syncRepository: SyncRepository,
    coachRepository: CoachRepository,
    coachMessageDao: CoachMessageDao,
    syncCacheDao: SyncCacheDao,
    groupRepository: GroupRepository,
    researchRepository: ResearchRepository,
    mealPrepRepository: MealPrepRepository,
    workoutExtrasRepository: WorkoutExtrasRepository,
    playBilling: PlayBillingManager,
) {
    DisposableEffect(Unit) {
        playBilling.startConnection()
        onDispose { playBilling.endConnection() }
    }

    val context = LocalContext.current
    val appCtx = context.applicationContext
    val bioPrefs = remember { BiometricPrefs(appCtx) }
    var biometricEnabled by remember { mutableStateOf(bioPrefs.isEnabled()) }

    var coachOpen by remember { mutableStateOf(false) }
    var tabIndex by remember { mutableIntStateOf(0) }
    val scope = rememberCoroutineScope()

    val notificationPermissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission(),
    ) { /* optional — registering FCM token does not depend on notification permission */ }

    LaunchedEffect(Unit) {
        if (!BuildConfig.FIREBASE_PROJECT_ID.isBlank()) {
            scope.launch { PushRegistrar.register(appCtx) }
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) !=
            android.content.pm.PackageManager.PERMISSION_GRANTED
        ) {
            notificationPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
        }
    }

    val tabs = remember {
        listOf(
            RootTab("Today") { Icon(Icons.Outlined.Home, contentDescription = null) },
            RootTab("Meals") { Icon(Icons.Outlined.RestaurantMenu, contentDescription = null) },
            RootTab("Training") { Icon(Icons.Outlined.FitnessCenter, contentDescription = null) },
            RootTab("Adjust") { Icon(Icons.Outlined.Tune, contentDescription = null) },
            RootTab("Progress") { Icon(Icons.AutoMirrored.Outlined.ShowChart, contentDescription = null) },
            RootTab("Groups") { Icon(Icons.Outlined.Groups, contentDescription = null) },
            RootTab("Profile") { Icon(Icons.Outlined.Person, contentDescription = null) },
        )
    }

    BiometricGate(biometricEnabled = biometricEnabled) {
        Scaffold(
            floatingActionButton = {
                FloatingActionButton(onClick = { coachOpen = true }) {
                    Icon(Icons.AutoMirrored.Rounded.Chat, contentDescription = "Coach chat")
                }
            },
            bottomBar = {
                NavigationBar {
                    tabs.forEachIndexed { index, tab ->
                        NavigationBarItem(
                            selected = tabIndex == index,
                            onClick = { tabIndex = index },
                            icon = tab.icon,
                            label = { Text(tab.label) }
                        )
                    }
                }
            }
        ) { padding ->
            Box(
                Modifier
                    .padding(padding)
                    .consumeWindowInsets(padding)
                    .fillMaxSize()
            ) {
                when (tabIndex) {
                    0 -> DashboardScreen(
                        authDisplayName = userLabel,
                        syncRepository = syncRepository,
                        syncCacheDao = syncCacheDao,
                    )
                    1 -> MealsScreen(
                        syncRepository = syncRepository,
                        syncCacheDao = syncCacheDao,
                        mealPrepRepository = mealPrepRepository,
                    )
                    2 -> WorkoutsScreen(
                        syncRepository = syncRepository,
                        syncCacheDao = syncCacheDao,
                        workoutExtrasRepository = workoutExtrasRepository,
                    )
                    3 -> SyncAdjustScreen(
                        onBack = null,
                        syncRepository = syncRepository,
                        syncCacheDao = syncCacheDao,
                    )
                    4 -> SyncMilestonesScreen(onBack = null, syncCacheDao = syncCacheDao)
                    5 -> GroupsScreen(
                        groupRepository = groupRepository,
                        userId = userId,
                        userDisplayName = userLabel,
                    )
                    else -> ProfileHubScreen(
                        userDisplayName = userLabel,
                        onLogout = onLogout,
                        biometricEnabled = biometricEnabled,
                        onBiometricEnabledChange = { enabled ->
                            biometricEnabled = enabled
                            bioPrefs.setEnabled(enabled)
                        },
                        syncCacheDao = syncCacheDao,
                        researchRepository = researchRepository,
                        playBilling = playBilling,
                    )
                }
                if (coachOpen) {
                    CoachChatDialog(
                        coachRepository = coachRepository,
                        syncRepository = syncRepository,
                        syncCacheDao = syncCacheDao,
                        coachMessageDao = coachMessageDao,
                        onDismiss = { coachOpen = false },
                    )
                }
            }
        }
    }
}
