import SwiftUI
import SwiftData
import PhotosUI
import RefactorKit

struct ProfileEditView: View {
    @Environment(\.modelContext) private var modelContext
    @Environment(\.syncEngine) private var syncEngine
    @Environment(\.dismiss) private var dismiss

    let user: UserProfile

    @State private var name: String
    @State private var age: Int
    @State private var unitSystem: MeasurementSystem
    // Display values — stored in kg/cm, displayed in the chosen unit
    @State private var weightLbs: Double
    @State private var weightKg: Double
    @State private var heightFt: Int
    @State private var heightIn: Int
    @State private var heightCm: Double
    @State private var gender: Gender
    @State private var fitnessLevel: FitnessLevel
    @State private var goal: FitnessGoal
    @State private var activityLevel: ActivityLevel
    @State private var workoutLocation: WorkoutLocation
    @State private var equipment: Set<WorkoutEquipment>
    @State private var daysPerWeek: Int
    @State private var workoutTimeframe: WorkoutTimeframe
    @State private var dietaryText: String
    @State private var injuriesText: String
    @State private var avatarDataUrl: String?
    @State private var selectedPhoto: PhotosPickerItem?
    @State private var isSaving = false
    @State private var saveError: String?

    init(user: UserProfile) {
        self.user = user
        let totalIn = user.height / 2.54
        _name = State(initialValue: user.name)
        _age = State(initialValue: user.age)
        _unitSystem = State(initialValue: user.unitSystem)
        _weightLbs = State(initialValue: user.weight * 2.20462)
        _weightKg = State(initialValue: user.weight)
        _heightFt = State(initialValue: max(0, Int(totalIn) / 12))
        _heightIn = State(initialValue: max(0, Int(totalIn) % 12))
        _heightCm = State(initialValue: user.height)
        _gender = State(initialValue: user.gender)
        _fitnessLevel = State(initialValue: user.fitnessLevel)
        _goal = State(initialValue: user.goal)
        _activityLevel = State(initialValue: user.dailyActivityLevel)
        _workoutLocation = State(initialValue: user.workoutLocation ?? .gym)
        _equipment = State(initialValue: Set(user.workoutEquipment))
        _daysPerWeek = State(initialValue: user.workoutDaysPerWeek)
        _workoutTimeframe = State(initialValue: user.workoutTimeframe ?? .flexible)
        _dietaryText = State(initialValue: user.dietaryRestrictions.joined(separator: ", "))
        _injuriesText = State(initialValue: user.injuriesOrLimitations.joined(separator: ", "))
        _avatarDataUrl = State(initialValue: user.avatarDataUrl)
    }

    var body: some View {
        NavigationStack {
            Form {
                avatarSection
                identitySection
                measurementsSection
                fitnessSection
                workoutSection
                restrictionsSection

                if let saveError {
                    Section {
                        Text(saveError).font(.caption).foregroundStyle(Color.appError)
                    }
                }
            }
            .navigationTitle("Edit Profile")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    if isSaving {
                        ProgressView().scaleEffect(0.8)
                    } else {
                        Button("Save") { Task { await save() } }
                            .disabled(name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                    }
                }
            }
        }
    }

    // MARK: - Sections

    private var avatarSection: some View {
        Section {
            HStack {
                Spacer()
                VStack(spacing: 8) {
                    AvatarView(dataUrl: avatarDataUrl, name: name, size: 80)
                    PhotosPicker(selection: $selectedPhoto, matching: .images) {
                        Text("Change Photo").font(.caption)
                    }
                    .onChange(of: selectedPhoto) { _, item in
                        guard let item else { return }
                        Task { await loadAvatar(item) }
                    }
                }
                Spacer()
            }
            .padding(.vertical, 4)
        }
    }

    private var identitySection: some View {
        Section("Identity") {
            TextField("Name", text: $name)
            Stepper("Age: \(age)", value: $age, in: 13...100)
            Picker("Gender", selection: $gender) {
                ForEach(Gender.allCases) { g in
                    Text(g.rawValue.capitalized).tag(g)
                }
            }
        }
    }

    private var measurementsSection: some View {
        Section("Measurements") {
            Picker("Units", selection: $unitSystem) {
                Text("US (lbs · ft·in)").tag(MeasurementSystem.us)
                Text("Metric (kg · cm)").tag(MeasurementSystem.metric)
            }

            if unitSystem == .us {
                HStack {
                    Text("Weight")
                    Spacer()
                    TextField("", value: $weightLbs, format: .number.precision(.fractionLength(1)))
                        .keyboardType(.decimalPad)
                        .multilineTextAlignment(.trailing)
                        .frame(width: 72)
                    Text("lbs").foregroundStyle(.secondary)
                }
                HStack {
                    Text("Height")
                    Spacer()
                    Picker("", selection: $heightFt) {
                        ForEach(3...8, id: \.self) { Text("\($0) ft").tag($0) }
                    }
                    .pickerStyle(.menu)
                    .labelsHidden()
                    Picker("", selection: $heightIn) {
                        ForEach(0...11, id: \.self) { Text("\($0) in").tag($0) }
                    }
                    .pickerStyle(.menu)
                    .labelsHidden()
                }
            } else {
                HStack {
                    Text("Weight")
                    Spacer()
                    TextField("", value: $weightKg, format: .number.precision(.fractionLength(1)))
                        .keyboardType(.decimalPad)
                        .multilineTextAlignment(.trailing)
                        .frame(width: 72)
                    Text("kg").foregroundStyle(.secondary)
                }
                HStack {
                    Text("Height")
                    Spacer()
                    TextField("", value: $heightCm, format: .number.precision(.fractionLength(0)))
                        .keyboardType(.decimalPad)
                        .multilineTextAlignment(.trailing)
                        .frame(width: 72)
                    Text("cm").foregroundStyle(.secondary)
                }
            }
        }
    }

    private var fitnessSection: some View {
        Section("Fitness") {
            Picker("Goal", selection: $goal) {
                ForEach(FitnessGoal.allCases) { g in
                    Text(g.rawValue.replacingOccurrences(of: "_", with: " ").capitalized).tag(g)
                }
            }
            Picker("Level", selection: $fitnessLevel) {
                ForEach(FitnessLevel.allCases) { l in
                    Text(l.rawValue.capitalized).tag(l)
                }
            }
            Picker("Daily Activity", selection: $activityLevel) {
                ForEach(ActivityLevel.allCases) { a in
                    Text(a.rawValue.replacingOccurrences(of: "_", with: " ").capitalized).tag(a)
                }
            }
        }
    }

    private var workoutSection: some View {
        Section("Workouts") {
            Picker("Location", selection: $workoutLocation) {
                ForEach(WorkoutLocation.allCases) { l in
                    Text(l.rawValue.capitalized).tag(l)
                }
            }
            Stepper("Days per week: \(daysPerWeek)", value: $daysPerWeek, in: 1...7)
            Picker("Preferred Time", selection: $workoutTimeframe) {
                ForEach(WorkoutTimeframe.allCases, id: \.self) { t in
                    Text(t.rawValue.capitalized).tag(t)
                }
            }
            DisclosureGroup("Equipment (\(equipment.count) selected)") {
                ForEach(WorkoutEquipment.allCases) { eq in
                    let label = eq.rawValue.replacingOccurrences(of: "_", with: " ").capitalized
                    Toggle(label, isOn: Binding(
                        get: { equipment.contains(eq) },
                        set: { on in if on { equipment.insert(eq) } else { equipment.remove(eq) } }
                    ))
                }
            }
        }
    }

    private var restrictionsSection: some View {
        Section {
            VStack(alignment: .leading, spacing: 4) {
                Text("Dietary Restrictions").font(.subheadline)
                TextField("e.g. vegetarian, gluten-free", text: $dietaryText)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
            VStack(alignment: .leading, spacing: 4) {
                Text("Injuries / Limitations").font(.subheadline)
                TextField("e.g. knee pain, lower back", text: $injuriesText)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
        } header: {
            Text("Health & Restrictions")
        } footer: {
            Text("Separate multiple items with commas.")
        }
    }

    // MARK: - Actions

    private func loadAvatar(_ item: PhotosPickerItem) async {
        guard let data = try? await item.loadTransferable(type: Data.self),
              let image = UIImage(data: data),
              let jpeg = ImageResizer.resizeForAPI(image) else { return }
        let b64 = jpeg.base64EncodedString()
        avatarDataUrl = "data:image/jpeg;base64,\(b64)"
    }

    private func save() async {
        isSaving = true
        saveError = nil
        defer { isSaving = false }

        let finalWeightKg: Double
        let finalHeightCm: Double
        if unitSystem == .us {
            finalWeightKg = weightLbs / 2.20462
            finalHeightCm = Double(heightFt * 12 + heightIn) * 2.54
        } else {
            finalWeightKg = weightKg
            finalHeightCm = heightCm
        }

        user.name = name.trimmingCharacters(in: .whitespacesAndNewlines)
        user.age = age
        user.weight = finalWeightKg
        user.height = finalHeightCm
        user.gender = gender
        user.unitSystem = unitSystem
        user.fitnessLevel = fitnessLevel
        user.goal = goal
        user.dailyActivityLevel = activityLevel
        user.workoutLocation = workoutLocation
        user.workoutEquipment = Array(equipment)
        user.workoutDaysPerWeek = daysPerWeek
        user.workoutTimeframe = workoutTimeframe
        user.avatarDataUrl = avatarDataUrl
        user.dietaryRestrictions = dietaryText
            .split(separator: ",")
            .map { $0.trimmingCharacters(in: .whitespaces) }
            .filter { !$0.isEmpty }
        user.injuriesOrLimitations = injuriesText
            .split(separator: ",")
            .map { $0.trimmingCharacters(in: .whitespaces) }
            .filter { !$0.isEmpty }

        do {
            try modelContext.save()
            Task { await syncEngine?.markDirty() }
            dismiss()
        } catch {
            saveError = error.localizedDescription
        }
    }
}
