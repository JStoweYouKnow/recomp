import SwiftUI
import SwiftData

struct PantryView: View {
    @Environment(\.modelContext) private var context
    @Query(sort: \PantryItem.addedAt, order: .reverse)
    private var items: [PantryItem]

    @State private var showAdd = false
    @State private var newName = ""
    @State private var newCategory: PantryCategory = .protein

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
                }
            }
            Button("Cancel", role: .cancel) {}
        }
    }
}
