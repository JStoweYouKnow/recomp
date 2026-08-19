package com.refactor.app.ui

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
import com.refactor.app.BuildConfig
import com.refactor.app.prefs.AppTheme
import com.refactor.app.prefs.BiometricPrefs
import com.refactor.app.push.PushRegistrar
import com.refactor.app.ui.security.BiometricGate
import kotlinx.coroutines.launch
import com.refactor.app.api.dto.RegisterRequest
import com.refactor.app.ui.auth.AuthHost
import com.refactor.app.ui.auth.AuthUiState
import com.refactor.app.ui.auth.LoginUiState
import com.refactor.app.api.CoachRepository
import com.refactor.app.api.GroupRepository
import com.refactor.app.api.HealthExtrasRepository
import com.refactor.app.api.MealPrepRepository
import com.refactor.app.api.MealRepository
import com.refactor.app.api.ResearchRepository
import com.refactor.app.api.SocialRepository
import com.refactor.app.api.SyncRepository
import com.refactor.app.api.WearableConnectRepository
import com.refactor.app.api.WorkoutExtrasRepository
import com.refactor.app.prefs.AiConsentPrefs
import com.refactor.app.prefs.NotificationPrefs
import com.refactor.app.billing.PlayBillingManager
import com.refactor.app.db.CoachMessageDao
import com.refactor.app.db.SyncCacheDao
import com.refactor.app.ui.dashboard.DashboardScreen
import com.refactor.app.ui.meals.MealsScreen
import com.refactor.app.ui.workouts.WorkoutsScreen
import com.refactor.app.ui.coach.CoachChatDialog
import com.refactor.app.ui.more.SyncAdjustScreen
import com.refactor.app.ui.more.SyncMilestonesScreen
import com.refactor.app.ui.groups.GroupsScreen
import com.refactor.app.ui.profile.ProfileHubScreen

private data class RootTab(val label: String, val icon: @Composable () -> Unit)

/** Destinations reachable from Profile and deep links, but not worth a tab slot. */
private enum class RootOverlay { Adjust, Groups }

@Composable
fun AppShell(
    loginUi: LoginUiState,
    onLogin: (String, String) -> Unit,
    onRegister: (RegisterRequest) -> Unit,
    onForgotPassword: (email: String, onSent: () -> Unit) -> Unit,
    onResetPassword: (email: String, code: String, newPassword: String, onDone: () -> Unit) -> Unit,
    onLogout: () -> Unit,
    onDemo: () -> Unit,
    onDismissLoginError: () -> Unit,
    userId: String,
    syncRepository: SyncRepository,
    coachRepository: CoachRepository,
    coachMessageDao: CoachMessageDao,
    syncCacheDao: SyncCacheDao,
    groupRepository: GroupRepository,
    researchRepository: ResearchRepository,
    mealPrepRepository: MealPrepRepository,
    mealRepository: MealRepository,
    workoutExtrasRepository: WorkoutExtrasRepository,
    healthExtrasRepository: HealthExtrasRepository,
    socialRepository: SocialRepository,
    wearableConnectRepository: WearableConnectRepository,
    aiConsentPrefs: AiConsentPrefs,
    notificationPrefs: NotificationPrefs,
    authRepository: com.refactor.app.api.AuthRepository,
    userToolsRepository: com.refactor.app.api.UserToolsRepository,
    musicPrefs: com.refactor.app.prefs.MusicPrefs,
    coachSchedulePrefs: com.refactor.app.prefs.CoachSchedulePrefs,
    playBilling: PlayBillingManager,
    themePreference: AppTheme = AppTheme.SYSTEM,
    onThemeChange: (AppTheme) -> Unit = {},
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
            AuthHost(
                busy = loginUi.busy,
                errorMessage = loginUi.loginError,
                infoMessage = loginUi.info,
                onLogin = onLogin,
                onRegister = onRegister,
                onForgot = onForgotPassword,
                onReset = onResetPassword,
                onDemo = onDemo,
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
                mealRepository = mealRepository,
                workoutExtrasRepository = workoutExtrasRepository,
                healthExtrasRepository = healthExtrasRepository,
                socialRepository = socialRepository,
                wearableConnectRepository = wearableConnectRepository,
                aiConsentPrefs = aiConsentPrefs,
                notificationPrefs = notificationPrefs,
                authRepository = authRepository,
                userToolsRepository = userToolsRepository,
                musicPrefs = musicPrefs,
                coachSchedulePrefs = coachSchedulePrefs,
                playBilling = playBilling,
                themePreference = themePreference,
                onThemeChange = onThemeChange,
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
    mealRepository: MealRepository,
    workoutExtrasRepository: WorkoutExtrasRepository,
    healthExtrasRepository: HealthExtrasRepository,
    socialRepository: SocialRepository,
    wearableConnectRepository: WearableConnectRepository,
    aiConsentPrefs: AiConsentPrefs,
    notificationPrefs: NotificationPrefs,
    authRepository: com.refactor.app.api.AuthRepository,
    userToolsRepository: com.refactor.app.api.UserToolsRepository,
    musicPrefs: com.refactor.app.prefs.MusicPrefs,
    coachSchedulePrefs: com.refactor.app.prefs.CoachSchedulePrefs,
    playBilling: PlayBillingManager,
    themePreference: AppTheme = AppTheme.SYSTEM,
    onThemeChange: (AppTheme) -> Unit = {},
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
    /** Full-screen destinations that are routable but no longer tabs. */
    var overlay by remember { mutableStateOf<RootOverlay?>(null) }

    // App-shortcut / deep-link routing (recomp://<host>): jump to the matching tab.
    LaunchedEffect(ShortcutRouter.pending) {
        when (ShortcutRouter.pending) {
            "workout", "workouts" -> tabIndex = 2
            "meal", "meals", "log-meal" -> tabIndex = 1
            "dashboard", "today", "calories", "log-water" -> tabIndex = 0
            "adjust" -> overlay = RootOverlay.Adjust
            "groups" -> overlay = RootOverlay.Groups
            else -> {}
        }
        if (ShortcutRouter.pending != null) ShortcutRouter.pending = null
    }
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

    // Five destinations, matching iOS. Material guidance caps a NavigationBar at 3–5:
    // at seven, labels are suppressed for unselected tabs and targets get cramped.
    // Adjust and Groups are still routable — they open as full-screen destinations
    // from Profile and from deep links, they are just not tabs.
    val tabs = remember {
        listOf(
            RootTab("Today") { Icon(Icons.Outlined.Home, contentDescription = null) },
            RootTab("Meals") { Icon(Icons.Outlined.RestaurantMenu, contentDescription = null) },
            RootTab("Train") { Icon(Icons.Outlined.FitnessCenter, contentDescription = null) },
            RootTab("Stats") { Icon(Icons.AutoMirrored.Outlined.ShowChart, contentDescription = null) },
            RootTab("Profile") { Icon(Icons.Outlined.Person, contentDescription = null) },
        )
    }

    BiometricGate(biometricEnabled = biometricEnabled) {
        Scaffold(
            floatingActionButton = {
                FloatingActionButton(onClick = { coachOpen = true }) {
                    Icon(Icons.AutoMirrored.Rounded.Chat, contentDescription = "Ref chat")
                }
            },
            bottomBar = {
                NavigationBar {
                    tabs.forEachIndexed { index, tab ->
                        NavigationBarItem(
                            selected = tabIndex == index,
                            onClick = { tabIndex = index },
                            icon = tab.icon,
                            label = { Text(tab.label, maxLines = 1) },
                            alwaysShowLabel = false,
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
                        mealRepository = mealRepository,
                        aiConsentPrefs = aiConsentPrefs,
                    )
                    2 -> WorkoutsScreen(
                        syncRepository = syncRepository,
                        syncCacheDao = syncCacheDao,
                        workoutExtrasRepository = workoutExtrasRepository,
                    )
                    3 -> SyncMilestonesScreen(onBack = null, syncCacheDao = syncCacheDao, syncRepository = syncRepository)
                    else -> ProfileHubScreen(
                        userId = userId,
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
                        themePreference = themePreference,
                        onThemeChange = onThemeChange,
                        syncRepository = syncRepository,
                        healthExtrasRepository = healthExtrasRepository,
                        socialRepository = socialRepository,
                        wearableConnectRepository = wearableConnectRepository,
                        aiConsentPrefs = aiConsentPrefs,
                        notificationPrefs = notificationPrefs,
                        authRepository = authRepository,
                        userToolsRepository = userToolsRepository,
                        musicPrefs = musicPrefs,
                        coachSchedulePrefs = coachSchedulePrefs,
                        onOpenAdjust = { overlay = RootOverlay.Adjust },
                        onOpenGroups = { overlay = RootOverlay.Groups },
                    )
                }

                // Adjust and Groups render over the shell with their own back affordance,
                // so losing their tab slots didn't cost reachability.
                when (overlay) {
                    RootOverlay.Adjust -> SyncAdjustScreen(
                        onBack = { overlay = null },
                        syncRepository = syncRepository,
                        syncCacheDao = syncCacheDao,
                    )
                    RootOverlay.Groups -> GroupsScreen(
                        groupRepository = groupRepository,
                        userId = userId,
                        userDisplayName = userLabel,
                        onBack = { overlay = null },
                    )
                    null -> {}
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
