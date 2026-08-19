import Foundation

// MARK: - User Profile Enums

public enum Gender: String, Codable, CaseIterable, Identifiable {
    case male, female, other
    public var id: String { rawValue }
}

public enum FitnessLevel: String, Codable, CaseIterable, Identifiable {
    case beginner, intermediate, advanced, athlete
    public var id: String { rawValue }
}

public enum FitnessGoal: String, Codable, CaseIterable, Identifiable {
    case loseWeight = "lose_weight"
    case maintain
    case buildMuscle = "build_muscle"
    case improveEndurance = "improve_endurance"
    public var id: String { rawValue }
}

public enum ActivityLevel: String, Codable, CaseIterable, Identifiable {
    case sedentary, light, moderate, active
    case veryActive = "very_active"
    public var id: String { rawValue }
}

public enum MeasurementSystem: String, Codable, CaseIterable {
    case us, metric
}

public enum WorkoutLocation: String, Codable, CaseIterable, Identifiable {
    case home, gym, outside
    public var id: String { rawValue }
}

public enum WorkoutEquipment: String, Codable, CaseIterable, Identifiable {
    case bodyweight
    case freeWeights = "free_weights"
    case barbells
    case kettlebells
    case machines
    case resistanceBands = "resistance_bands"
    case cardioMachines = "cardio_machines"
    case pullUpBar = "pull_up_bar"
    case cableMachine = "cable_machine"
    public var id: String { rawValue }
}

public enum WorkoutTimeframe: String, Codable, CaseIterable {
    case morning, afternoon, evening, flexible
}

// MARK: - Meal Enums

public enum MealType: String, Codable, CaseIterable, Identifiable {
    case breakfast, lunch, dinner, snack
    public var id: String { rawValue }
}

// MARK: - Wearable Enums

public enum WearableProvider: String, Codable, CaseIterable, Identifiable {
    case oura, fitbit, apple, garmin, android, scale
    public var id: String { rawValue }
}

// MARK: - Milestone Enums

public enum MilestoneType: String, Codable, CaseIterable, Identifiable {
    case firstMeal = "first_meal"
    case mealStreak3 = "meal_streak_3"
    case mealStreak7 = "meal_streak_7"
    case mealStreak14 = "meal_streak_14"
    case mealStreak30 = "meal_streak_30"
    case macroHitWeek = "macro_hit_week"
    case macroHitMonth = "macro_hit_month"
    case weekWarrior = "week_warrior"
    case planAdjuster = "plan_adjuster"
    case earlyAdopter = "early_adopter"
    case wearableSynced = "wearable_synced"
    case hydrationStreak3 = "hydration_streak_3"
    case hydrationStreak7 = "hydration_streak_7"
    case firstFast = "first_fast"
    case fastingStreak7 = "fasting_streak_7"
    case biofeedbackStreak7 = "biofeedback_streak_7"
    case metabolicModeled = "metabolic_modeled"
    case recoveryListener = "recovery_listener"
    case pantryStocked = "pantry_stocked"
    case firstMealPrep = "first_meal_prep"
    case menuScanner = "menu_scanner"
    case coachCheckInStreak7 = "coach_check_in_streak_7"
    case firstChallengeWon = "first_challenge_won"
    case challengeCreator = "challenge_creator"
    case musicConnected = "music_connected"
    case supplementTracker = "supplement_tracker"
    case bloodWorkUploaded = "blood_work_uploaded"

    /*
     * Transformation outcomes. Every case above rewards using the app; these reward the body
     * actually changing, which is the thing the user came for.
     */
    case firstPR = "first_pr"
    case strengthUp5 = "strength_up_5"
    case strengthUp10 = "strength_up_10"
    case strengthUp25 = "strength_up_25"
    case volumeBalanced = "volume_balanced"
    case deloadCompleted = "deload_completed"
    case consistentLifter = "consistent_lifter"
    case trendDown5 = "trend_down_5"
    case trendDown15 = "trend_down_15"
    case trendDown30 = "trend_down_30"
    case bodyfatDown2 = "bodyfat_down_2"
    case bodyfatDown5 = "bodyfat_down_5"
    case leanMassGained = "lean_mass_gained"
    case recompAchieved = "recomp_achieved"

    public var id: String { rawValue }

    /// Badges that mark the body changing rather than the app being used.
    public static let outcomeBadges: [MilestoneType] = [
        .firstPR, .strengthUp5, .strengthUp10, .strengthUp25,
        .volumeBalanced, .deloadCompleted, .consistentLifter,
        .trendDown5, .trendDown15, .trendDown30,
        .bodyfatDown2, .bodyfatDown5, .leanMassGained, .recompAchieved,
    ]

    public var isOutcome: Bool { Self.outcomeBadges.contains(self) }
}

// MARK: - Activity Enums

public enum ActivityType: String, Codable, CaseIterable {
    case workout, walking, running, cycling, swimming
    case hiit, yoga, sports
    case manualLabor = "manual_labor"
    case other
}

public enum SedentaryType: String, Codable, CaseIterable {
    case deskWork = "desk_work"
    case gaming
    case watchingTV = "watching_tv"
    case nap, travel, other
}

public enum ActivityCategory: Codable {
    case activity(ActivityType)
    case sedentary(SedentaryType)

    public init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        let value = try container.decode(String.self)
        if let at = ActivityType(rawValue: value) {
            self = .activity(at)
        } else if let st = SedentaryType(rawValue: value) {
            self = .sedentary(st)
        } else {
            self = .activity(.other)
        }
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch self {
        case .activity(let t): try container.encode(t.rawValue)
        case .sedentary(let t): try container.encode(t.rawValue)
        }
    }
}

// MARK: - Social & Groups

public enum ProfileVisibility: String, Codable, CaseIterable, Identifiable {
    case badgesOnly = "badges_only"
    case badgesStats = "badges_stats"
    case fullTransparency = "full_transparency"
    public var id: String { rawValue }
}

public enum GroupAccessMode: String, Codable, CaseIterable {
    case open
    case inviteOnly = "invite_only"
}

public enum GroupTrackingMode: String, Codable, CaseIterable {
    case aggregate, leaderboard, both
}

public enum GroupGoalType: String, Codable, CaseIterable, Identifiable {
    case loseWeight = "lose_weight"
    case buildMuscle = "build_muscle"
    case consistency
    case macroTargets = "macro_targets"
    case custom
    public var id: String { rawValue }
}

public enum GroupRole: String, Codable {
    case owner, member
}

// MARK: - Cooking App

public enum CookingAppProvider: String, Codable, CaseIterable, Identifiable {
    case whisk, mealime, yummly, paprika, cronometer
    case myfitnesspal, loseit, recipekeeper, nytcooking, custom
    public var id: String { rawValue }
}

// MARK: - Hydration

public enum HydrationSource: String, Codable, CaseIterable {
    case water, coffee, tea
    case sportsDrink = "sports_drink"
    case other
}

// MARK: - Fasting

public enum FastingProtocol: String, Codable, CaseIterable, Identifiable {
    case sixteenEight = "16:8"
    case eighteenSix = "18:6"
    case twentyFour = "20:4"
    case omad = "OMAD"
    case custom
    public var id: String { rawValue }
}

public enum FastingPhase: String, Codable {
    case fed
    case earlyFasting = "early_fasting"
    case fatBurning = "fat_burning"
    case ketosis
    case deepKetosis = "deep_ketosis"
}

// MARK: - Challenge

public enum ChallengeMetric: String, Codable, CaseIterable {
    case mealStreak = "meal_streak"
    case macroAccuracy = "macro_accuracy"
    case workoutCompletion = "workout_completion"
    case steps
    case xpGained = "xp_gained"
}

public enum ChallengeStatus: String, Codable {
    case pending, active, completed, cancelled
}

public enum ChallengeType: String, Codable {
    case solo, group, duel
}

// MARK: - Music

public enum MusicProvider: String, Codable, CaseIterable {
    case spotify
    case appleMusic = "apple_music"
}

// MARK: - Pantry

public enum PantryCategory: String, Codable, CaseIterable, Identifiable {
    case protein, carb, fat, produce, dairy, spice, other
    public var id: String { rawValue }
}

// MARK: - Supplements

public enum SupplementFrequency: String, Codable, CaseIterable {
    case daily
    case twiceDaily = "twice_daily"
    case weekly
    case asNeeded = "as_needed"
}

public enum SupplementTiming: String, Codable, CaseIterable {
    case morning, afternoon, evening
    case withMeals = "with_meals"
    case beforeBed = "before_bed"
}

// MARK: - Blood Work

public enum BloodWorkStatus: String, Codable {
    case low, normal, high
}

// MARK: - Recovery

public enum RecoveryLevel: String, Codable {
    case low, moderate, high, optimal
}

public enum ImpactType: String, Codable {
    case positive, negative, neutral
}

// MARK: - Coach

public enum CoachPersona: String, Codable, CaseIterable, Identifiable {
    case `default`, motivator, scientist, toughLove, chillFriend
    public var id: String { rawValue }
}

public enum CoachMessageRole: String, Codable {
    case user, assistant
}

// MARK: - Confidence

public enum ConfidenceLevel: String, Codable {
    case high, medium, low
}
