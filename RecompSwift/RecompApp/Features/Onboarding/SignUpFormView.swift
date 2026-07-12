import SwiftUI
import RefactorKit

struct SignUpFormView: View {
    @Environment(AuthService.self) private var auth
    let onBack: () -> Void

    @State private var step = 0
    @State private var name = ""
    @State private var email = ""
    @State private var password = ""
    @State private var age = 30
    @State private var weight: Double = 165       // lbs (US default)
    @State private var height: Double = 70        // total inches (US default)
    @State private var heightFeet: Int = 5
    @State private var heightInches: Int = 10
    @State private var heightCm: Double = 177.8   // cm (metric branch)
    @State private var unitSystem: MeasurementSystem = .us
    @State private var gender: Gender = .male
    @State private var fitnessLevel: FitnessLevel = .beginner
    @State private var goal: FitnessGoal = .loseWeight
    @State private var activityLevel: ActivityLevel = .moderate
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
        .onAppear {
            height = Double(heightFeet * 12 + heightInches)
            heightCm = height * 2.54
        }
    }

    private var stepIndicator: some View {
        HStack(spacing: 4) {
            ForEach(0..<totalSteps, id: \.self) { i in
                RoundedRectangle(cornerRadius: 2)
                    .fill(i <= step ? Color.appAccent : Color.secondary.opacity(0.3))
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
                TextField("Email", text: $email)
                    .textContentType(.emailAddress)
                    .keyboardType(.emailAddress)
                    .autocapitalization(.none)
                    .autocorrectionDisabled()
                SecureField("Password", text: $password)
                    .textContentType(.newPassword)
            }

            if step == 0 && (!email.isEmpty && !isValidEmail(email)) {
                Section {
                    Text("Enter a valid email address.")
                        .font(.caption)
                        .foregroundStyle(Color.appError)
                }
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

                if unitSystem == .metric {
                    HStack {
                        Text("Height (cm)")
                        Spacer()
                        TextField("", value: $heightCm, format: .number)
                            .keyboardType(.decimalPad)
                            .multilineTextAlignment(.trailing)
                            .frame(width: 80)
                    }
                } else {
                    HStack {
                        Text("Height")
                        Spacer()
                        Picker("Feet", selection: $heightFeet) {
                            ForEach(4...7, id: \.self) { ft in
                                Text("\(ft) ft").tag(ft)
                            }
                        }
                        .pickerStyle(.wheel)
                        .frame(width: 80, height: 100)
                        .clipped()
                        Picker("Inches", selection: $heightInches) {
                            ForEach(0...11, id: \.self) { ins in
                                Text("\(ins) in").tag(ins)
                            }
                        }
                        .pickerStyle(.wheel)
                        .frame(width: 80, height: 100)
                        .clipped()
                    }
                    .onChange(of: heightFeet) { _, _ in height = Double(heightFeet * 12 + heightInches) }
                    .onChange(of: heightInches) { _, _ in height = Double(heightFeet * 12 + heightInches) }
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
            Section("Measurement System") {
                Picker("Units", selection: $unitSystem) {
                    Text("US (lbs, ft)").tag(MeasurementSystem.us)
                    Text("Metric (kg, cm)").tag(MeasurementSystem.metric)
                }
                .pickerStyle(.segmented)
                .onChange(of: unitSystem) { _, newVal in
                    if newVal == .metric {
                        weight = (weight * 0.45359237 * 10).rounded() / 10
                        heightCm = (height * 2.54 * 10).rounded() / 10
                    } else {
                        weight = (weight * 2.20462 * 10).rounded() / 10
                        height = (heightCm / 2.54 * 10).rounded() / 10
                        heightFeet = Int(height) / 12
                        heightInches = Int(height) % 12
                    }
                }
            }

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
                    Text(errorMessage).foregroundStyle(Color.appError).font(.caption)
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
                .disabled(step == 0 && !step0Valid)
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
                .disabled(!step0Valid || isSubmitting)
            }
        }
        .padding()
    }

    private var step0Valid: Bool {
        !name.isEmpty && isValidEmail(email) && password.count >= 8
    }

    private func isValidEmail(_ value: String) -> Bool {
        value.contains("@") && value.contains(".")
    }

    private func submit() {
        isSubmitting = true
        // Server stores weight in lbs and height in centimeters.
        let submitWeight = unitSystem == .metric ? weight * 2.20462 : weight
        let submitHeight = unitSystem == .metric ? heightCm : height * 2.54
        let payload = SignUpPayload(
            name: name,
            email: email,
            password: password,
            age: age,
            weight: submitWeight,
            height: submitHeight,
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
