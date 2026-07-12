import SwiftUI
import SwiftData
import RefactorKit

struct PantryView: View {
    @Environment(\.modelContext) private var context
    @Environment(\.syncEngine) private var syncEngine
    @Query(sort: \PantryItem.addedAt, order: .reverse)
    private var items: [PantryItem]

    @State private var showAdd = false
    @State private var newName = ""
    @State private var newCategory: PantryCategory = .protein
    @State private var saveError: String?

    var body: some View {
        Group {
            if items.isEmpty {
                EmptyStateView(
                    icon: "refrigerator",
                    title: "Pantry Empty",
                    subtitle: "Add items to get personalized meal suggestions",
                    actionTitle: "Add Item"
                ) { showAdd = true }
            } else {
                List {
                    ForEach(PantryCategory.allCases) { category in
                        let categoryItems = items.filter { $0.category == category }
                        if !categoryItems.isEmpty {
                            Section(category.rawValue.capitalized) {
                                ForEach(categoryItems, id: \.id) { item in
                                    HStack {
                                        Text(item.name)
                                        Spacer()
                                        if let exp = item.expiresAt {
                                            Text(exp, style: .date)
                                                .font(.caption)
                                                .foregroundStyle(.secondary)
                                        }
                                    }
                                }
                                .onDelete { indices in
                                    for i in indices { context.delete(categoryItems[i]) }
                                    do { try context.save() } catch { saveError = error.localizedDescription }
                                    Task { await syncEngine?.markDirty() }
                                }
                            }
                        }
                    }
                }
                .listStyle(.insetGrouped)
            }
        }
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button { showAdd = true } label: {
                    Image(systemName: "plus")
                }
            }
        }
        .alert("Add Pantry Item", isPresented: $showAdd) {
            TextField("Item name", text: $newName)
            Button("Add") {
                if !newName.isEmpty {
                    context.insert(PantryItem(name: newName, category: newCategory))
                    newName = ""
                    do { try context.save() } catch { saveError = error.localizedDescription }
                    Task { await syncEngine?.markDirty() }
                }
            }
            Button("Cancel", role: .cancel) {}
        }
        .alert("Save Failed", isPresented: Binding(
            get: { saveError != nil },
            set: { if !$0 { saveError = nil } }
        )) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(saveError ?? "")
        }
    }
}
