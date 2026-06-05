import SwiftUI
import RefactorKit

struct ResearchView: View {
    @State private var researchService = ResearchService()
    @State private var query = ""
    @State private var searchError: String?
    @FocusState private var isSearchFocused: Bool

    var body: some View {
        NavigationStack {
            VStack(spacing: 16) {
                HStack {
                    TextField("Search nutrition & fitness research...", text: $query)
                        .textFieldStyle(.roundedBorder)
                        .focused($isSearchFocused)
                        .submitLabel(.search)
                        .onSubmit { search() }

                    Button {
                        search()
                    } label: {
                        Image(systemName: "magnifyingglass")
                    }
                    .disabled(query.isEmpty || researchService.isSearching)
                }
                .padding(.horizontal)

                if researchService.isSearching {
                    ProgressView("Searching...")
                        .frame(maxHeight: .infinity)
                } else if let error = searchError {
                    VStack(spacing: 8) {
                        Image(systemName: "exclamationmark.triangle")
                            .foregroundStyle(Color.appError)
                        Text(error)
                            .font(.caption)
                            .foregroundStyle(Color.appError)
                            .multilineTextAlignment(.center)
                    }
                    .padding()
                    .frame(maxHeight: .infinity)
                } else if let result = researchService.result {
                    ScrollView {
                        VStack(alignment: .leading, spacing: 16) {
                            Text(result.answer)
                                .font(.body)

                            if let sources = result.sources, !sources.isEmpty {
                                Divider()
                                Text("Sources")
                                    .font(.headline)
                                ForEach(sources) { source in
                                    if let url = URL(string: source.url) {
                                        Link(destination: url) {
                                            HStack {
                                                Text(source.title)
                                                    .font(.subheadline)
                                                    .foregroundStyle(Color.appAccent)
                                                Spacer()
                                                Image(systemName: "arrow.up.right.square")
                                                    .font(.caption)
                                            }
                                        }
                                    }
                                }
                            }
                        }
                        .padding()
                    }
                } else {
                    EmptyStateView(
                        icon: "globe",
                        title: "Research",
                        subtitle: "Search for nutrition tips, exercise science, and fitness guidelines"
                    )
                }
            }
            .navigationTitle("Research")
            .toolbar {
                ToolbarItemGroup(placement: .keyboard) {
                    Spacer()
                    Button("Done") { isSearchFocused = false }
                }
            }
        }
    }

    private func search() {
        searchError = nil
        Task {
            do {
                try await researchService.search(query: query)
            } catch {
                searchError = error.localizedDescription
            }
        }
    }
}
