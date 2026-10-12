import Foundation

public enum WeekdayMacroKey: String, CaseIterable, Sendable {
    case mon, tue, wed, thu, fri, sat, sun

    public var shortLabel: String {
        switch self {
        case .mon: "Mon"
        case .tue: "Tue"
        case .wed: "Wed"
        case .thu: "Thu"
        case .fri: "Fri"
        case .sat: "Sat"
        case .sun: "Sun"
        }
    }

    public static func from(date: Date) -> WeekdayMacroKey {
        let dow = Calendar.current.component(.weekday, from: date) // 1 = Sun … 7 = Sat
        let order: [WeekdayMacroKey] = [.sun, .mon, .tue, .wed, .thu, .fri, .sat]
        return order[dow - 1]
    }

    public static func from(dateString: String) -> WeekdayMacroKey {
        if let d = DateHelpers.date(from: dateString) {
            return from(date: d)
        }
        return .mon
    }
}

public enum WeekdayMacros {

    public static func hasExplicit(_ map: [String: Macros]?) -> Bool {
        guard let map else { return false }
        return WeekdayMacroKey.allCases.contains { (map[$0.rawValue]?.calories ?? 0) > 0 }
    }

    private static func trainingRestPair(diet: DietPlan) -> (training: Macros, rest: Macros) {
        let base = diet.dailyTargets
        let training = (diet.trainingTargets?.calories ?? 0) > 0
            ? diet.trainingTargets!
            : Macros(
                calories: base.calories + 200,
                protein: base.protein,
                carbs: base.carbs + 50,
                fat: base.fat
            )
        let rest = (diet.restTargets?.calories ?? 0) > 0
            ? diet.restTargets!
            : Macros(
                calories: max(0, base.calories - 200),
                protein: base.protein,
                carbs: max(0, base.carbs - 50),
                fat: base.fat
            )
        return (training, rest)
    }

    private static func isRestFocus(_ focus: String) -> Bool {
        let f = focus.lowercased()
        return f.contains("rest") || f.contains("recovery") || f.contains("off")
    }

    private static func dayLabelToKey(_ dayLabel: String) -> WeekdayMacroKey? {
        let p = dayLabel.lowercased().trimmingCharacters(in: .whitespaces)
        if p.hasPrefix("mon") { return .mon }
        if p.hasPrefix("tue") { return .tue }
        if p.hasPrefix("wed") { return .wed }
        if p.hasPrefix("thu") { return .thu }
        if p.hasPrefix("fri") { return .fri }
        if p.hasPrefix("sat") { return .sat }
        if p.hasPrefix("sun") { return .sun }
        return nil
    }

    public static func legacyTargets(for plan: FitnessPlan, date: Date) -> Macros {
        let fallback = plan.dietPlan.dailyTargets
        let pair = trainingRestPair(diet: plan.dietPlan)
        if let idx = WorkoutProgramSchedule.planIndex(for: plan, date: date),
           idx < plan.workoutPlan.weeklyPlan.count {
            let w = plan.workoutPlan.weeklyPlan[idx]
            return isRestFocus(w.focus) ? pair.rest : pair.training
        }
        if pair.rest.calories > 0 { return pair.rest }
        return fallback.calories > 0 ? fallback : Macros(calories: 2000, protein: 150, carbs: 200, fat: 65)
    }

    public static func resolve(for plan: FitnessPlan, date: Date) -> Macros {
        let key = WeekdayMacroKey.from(date: date).rawValue
        if let m = plan.dietPlan.weekdayTargets?[key], m.calories > 0 { return m }
        return legacyTargets(for: plan, date: date)
    }

    public static func resolve(for plan: FitnessPlan, dateString: String) -> Macros {
        if let d = DateHelpers.date(from: dateString) {
            return resolve(for: plan, date: d)
        }
        let key = WeekdayMacroKey.from(dateString: dateString).rawValue
        if let m = plan.dietPlan.weekdayTargets?[key], m.calories > 0 { return m }
        return legacyTargets(for: plan, date: .now)
    }

    public static func effectiveWeekdayMap(for plan: FitnessPlan) -> [WeekdayMacroKey: Macros] {
        let base = plan.dietPlan.dailyTargets
        let pair = trainingRestPair(diet: plan.dietPlan)
        var out = Dictionary(uniqueKeysWithValues: WeekdayMacroKey.allCases.map { ($0, pair.rest) })

        if hasExplicit(plan.dietPlan.weekdayTargets) {
            for key in WeekdayMacroKey.allCases {
                if let m = plan.dietPlan.weekdayTargets?[key.rawValue], m.calories > 0 {
                    out[key] = m
                } else {
                    out[key] = base
                }
            }
            return out
        }

        let wp = plan.workoutPlan.weeklyPlan
        for day in wp {
            if let key = dayLabelToKey(day.day) {
                out[key] = isRestFocus(day.focus) ? pair.rest : pair.training
            }
        }
        if !wp.isEmpty, !wp.contains(where: { dayLabelToKey($0.day) != nil }) {
            let monFirst: [WeekdayMacroKey] = [.mon, .tue, .wed, .thu, .fri, .sat, .sun]
            for i in 0..<min(wp.count, monFirst.count) {
                out[monFirst[i]] = isRestFocus(wp[i].focus) ? pair.rest : pair.training
            }
        }
        return out
    }

    public static func seedFromSchedule(
        training: Macros,
        rest: Macros,
        workoutDays: [WorkoutDay]
    ) -> [String: Macros] {
        var out = Dictionary(uniqueKeysWithValues: WeekdayMacroKey.allCases.map { ($0.rawValue, rest) })
        for day in workoutDays {
            if let key = dayLabelToKey(day.day) {
                out[key.rawValue] = isRestFocus(day.focus) ? rest : training
            }
        }
        if !workoutDays.isEmpty, !workoutDays.contains(where: { dayLabelToKey($0.day) != nil }) {
            let monFirst: [WeekdayMacroKey] = [.mon, .tue, .wed, .thu, .fri, .sat, .sun]
            for i in 0..<min(workoutDays.count, monFirst.count) {
                let w = workoutDays[i]
                out[monFirst[i].rawValue] = isRestFocus(w.focus) ? rest : training
            }
        }
        return out
    }

    public static func average(_ map: [WeekdayMacroKey: Macros]) -> Macros {
        var cal = 0.0, pro = 0.0, carb = 0.0, fat = 0.0
        for key in WeekdayMacroKey.allCases {
            let m = map[key] ?? Macros(calories: 0, protein: 0, carbs: 0, fat: 0)
            cal += Double(m.calories)
            pro += m.protein
            carb += m.carbs
            fat += m.fat
        }
        let n = Double(WeekdayMacroKey.allCases.count)
        return Macros(
            calories: Int(cal / n),
            protein: pro / n,
            carbs: carb / n,
            fat: fat / n
        )
    }

    public static func averageStringKeyed(_ map: [String: Macros]) -> Macros {
        var keyed = [WeekdayMacroKey: Macros]()
        for key in WeekdayMacroKey.allCases {
            keyed[key] = map[key.rawValue] ?? Macros(calories: 0, protein: 0, carbs: 0, fat: 0)
        }
        return average(keyed)
    }
}
