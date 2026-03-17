import SwiftUI

struct SignUpFormView: View {
    @Environment(AuthService.self) private var auth
    let onBack: () -> Void

    @State private var step = 0
    @State private var name = ""
    @State private var email = ""
    @State private var password = ""
    @State private var age = 30
    @State private var weight: Double = 70
    @State private var height: Double = 170
    @State private var gender: Gender = .male
    @State private var fitnessLevel: FitnessLevel = .beginner
    @State private var goal: FitnessGoal = .loseWeight
    @State private var activityLevel: ActivityLevel = .moderate
    @State private var unitSystem: MeasurementSystem = .us
    @State private var workoutLocation: WorkoutLocation = .gym
    @State private var workoutDays = 4
    @State private var dietaryRestrictions: [String] = []
    @State private var restrictionInput = ""
    @State private var errorMessage: String?
    @State private var isSubmitting = false

    private let totalSteps = 4

    var body: some View {
        VStack(spacing: 0) {
            stepIndicator

            TabView(selection: $step) {
                basicInfoStep.tag(0)
                bodyStep.tag(1)
                goalsStep.tag(2)
                preferencesStep.tag(3)
            }
            .tabViewStyle(.page(indexDisplayMode: .never))
            .animation(.easeInOut(duration: 0.3), value: step)

            navigationButtons
        }
        .navigationTitle("Create Account")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarLeading) {
                Button("Back", action: onBack)
            }
        }
    }

    private var stepIndicator: some View {
        HStack(spacing: 4) {
            ForEach(0..<totalSteps, id: \.self) { i in
                RoundedRectangle(cornerRadius: 2)
                    .fill(i <= step ? .blue : .gray.opacity(0.3))
                    .frame(height: 4)
            }
        }
        .padding()
    }

    private var basicInfoStep: some View {
        Form {
            Section("About You") {
                TextField("Name", text: $name)
                    .textContentType(.name)
                TextField("Email (optional)", text: $email)
                    .textContentType(.emailAddress)
                    .keyboardType(.emailAddress)
                    .autocapitalization(.none)
                SecureField("Password (optional)", text: $password)
                    .textContentType(.newPassword)
            }

            Section("Measurement System") {
                Picker("Units", selection: $unitSystem) {
                    Text("US (lbs/in)").tag(MeasurementSystem.us)
                    Text("Metric (kg/cm)").tag(MeasurementSystem.metric)
                }
                .pickerStyle(.segmented)
            }
        }
    }

    private var bodyStep: some View {
        Form {
            Section("Body Stats") {
                Stepper("Age: \(age)", value: $age, in: 13...100)

                HStack {
                    Text(unitSystem == .metric ? "Weight (kg)" : "Weight (lbs)")
                    Spacer()
                    TextField("", value: $weight, format: .number)
                        .keyboardType(.decimalPad)
                        .multilineTextAlignment(.trailing)
                        .frame(width: 80)
                }

                HStack {
                    Text(unitSystem == .metric ? "Height (cm)" : "Height (in)")
                    Spacer()
                    TextField("", value: $height, format: .number)
                        .keyboardType(.decimalPad)
                        .multilineTextAlignment(.trailing)
                        .frame(width: 80)
                }
            }

            Section("Gender") {
                Picker("Gender", selection: $gender) {
                    ForEach(Gender.allCases) { g in
                        Text(g.rawValue.capitalized).tag(g)
                    }
                }
                .pickerStyle(.segmented)
            }
        }
    }

    private var goalsStep: some View {
        Form {
            Section("Fitness Level") {
                Picker("Level", selection: $fitnessLevel) {
                    ForEach(FitnessLevel.allCases) { level in
                        Text(level.rawValue.capitalized).tag(level)
                    }
                }
            }

            Section("Goal") {
                Picker("Goal", selection: $goal) {
                    Text("Lose Weight").tag(FitnessGoal.loseWeight)
                    Text("Build Muscle").tag(FitnessGoal.buildMuscle)
                    Text("Maintain").tag(FitnessGoal.maintain)
                    Text("Improve Endurance").tag(FitnessGoal.improveEndurance)
                }
            }

            Section("Daily Activity Level") {
                Picker("Activity", selection: $activityLevel) {
                    ForEach(ActivityLevel.allCases) { level in
                        Text(level.rawValue.capitalized).tag(level)
                    }
                }
            }
        }
    }

    private var preferencesStep: some View {
        Form {
            Section("Workout Preferences") {
                Picker("Location", selection: $workoutLocation) {
                    ForEach(WorkoutLocation.allCases) { loc in
                        Text(loc.rawValue.capitalized).tag(loc)
                    }
                }
                Stepper("Days/week: \(workoutDays)", value: $workoutDays, in: 2...7)
            }

            Section("Dietary Restrictions") {
                HStack {
                    TextField("e.g. vegetarian, gluten-free", text: $restrictionInput)
                    Button("Add") {
                        let trimmed = restrictionInput.trimmingCharacters(in: .whitespaces)
                        if !trimmed.isEmpty {
                            dietaryRestrictions.append(trimmed)
                            restrictionInput = ""
                        }
                    }
                    .disabled(restrictionInput.isEmpty)
                }

                ForEach(dietaryRestrictions, id: \.self) { restriction in
                    Text(restriction)
                }
                .onDelete { indices in
                    dietaryRestrictions.remove(atOffsets: indices)
                }
            }

            if let errorMessage {
                Section {
                    Text(errorMessage).foregroundStyle(.red).font(.caption)
                }
            }
        }
    }

    private var navigationButtons: some View {
        HStack {
            if step > 0 {
                Button("Previous") {
                    withAnimation { step -= 1 }
                }
                .buttonStyle(.bordered)
            }

            Spacer()

            if step < totalSteps - 1 {
                Button("Next") {
                    withAnimation { step += 1 }
                }
                .buttonStyle(.borderedProminent)
                .disabled(step == 0 && name.isEmpty)
            } else {
                Button {
                    submit()
                } label: {
                    if isSubmitting {
                        ProgressView()
                    } else {
                        Text("Create Account")
                    }
                }
                .buttonStyle(.borderedProminent)
                .disabled(name.isEmpty || isSubmitting)
            }
        }
        .padding()
    }

    private func submit() {
        isSubmitting = true
        let payload = SignUpPayload(
            name: name,
            email: email.isEmpty ? nil : email,
            password: password.isEmpty ? nil : password,
            age: age,
            weight: weight,
            height: height,
            gender: gender.rawValue,
            fitnessLevel: fitnessLevel.rawValue,
            goal: goal.rawValue,
            dietaryRestrictions: dietaryRestrictions,
            injuriesOrLimitations: [],
            dailyActivityLevel: activityLevel.rawValue,
            unitSystem: unitSystem.rawValue,
            workoutLocation: workoutLocation.rawValue,
            workoutDaysPerWeek: workoutDays
        )

        Task {
            do {
                try await auth.register(payload)
            } catch {
                errorMessage = error.localizedDescription
            }
            isSubmitting = false
        }
    }
}
