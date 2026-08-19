import SwiftUI

/// Cold-launch placeholder shown while the first pull-merge sync runs.
///
/// The tab shell genuinely cannot mount yet — mounting `@Query` observers while
/// `fetchAndApply` bulk-deletes and reinserts rows crashed SwiftData on iOS 26. But the
/// previous stand-in was a centred spinner on an empty background, which reads as a slow
/// app. Rendering the dashboard's actual shape means the first frame has structure, and
/// the real content lands in the same layout rather than replacing a blank screen.
struct LaunchSkeletonView: View {
    var body: some View {
        VStack(spacing: 16) {
            greeting
            calorieCard
            workoutCard
            widgetGrid
            Spacer(minLength: 0)
        }
        .padding(.vertical)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .background(Color.recompBackground)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Syncing your data")
        .accessibilityAddTraits(.updatesFrequently)
    }

    private var greeting: some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 6) {
                SkeletonBlock(width: 180, height: 22, cornerRadius: 6)
                SkeletonBlock(width: 110, height: 13)
            }
            Spacer()
            SkeletonBlock(width: 44, height: 44, cornerRadius: 22)
        }
        .padding(.horizontal)
    }

    private var calorieCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 8) {
                    SkeletonBlock(width: 84, height: 11)
                    SkeletonBlock(width: 132, height: 40, cornerRadius: 8)
                }
                Spacer()
                VStack(alignment: .trailing, spacing: 8) {
                    SkeletonBlock(width: 54, height: 18)
                    SkeletonBlock(width: 96, height: 12)
                }
            }
            SkeletonBlock(height: 16, cornerRadius: 8)
        }
        .padding(16)
        .background(Color.recompSurface, in: RoundedRectangle(cornerRadius: 20))
        .overlay(
            RoundedRectangle(cornerRadius: 20)
                .stroke(Color.recompBorder, lineWidth: 1)
        )
        .padding(.horizontal)
    }

    private var workoutCard: some View {
        HStack(spacing: 14) {
            SkeletonBlock(width: 48, height: 48, cornerRadius: 12)
            VStack(alignment: .leading, spacing: 7) {
                SkeletonBlock(width: 96, height: 10)
                SkeletonBlock(width: 140, height: 15)
                SkeletonBlock(width: 112, height: 12)
            }
            Spacer()
        }
        .padding(14)
        .background(Color.recompSurface, in: RoundedRectangle(cornerRadius: 18))
        .overlay(
            RoundedRectangle(cornerRadius: 18)
                .stroke(Color.recompBorder, lineWidth: 1)
        )
        .padding(.horizontal)
    }

    private var widgetGrid: some View {
        LazyVGrid(columns: [.init(.flexible()), .init(.flexible())], spacing: 12) {
            ForEach(0..<4, id: \.self) { _ in
                VStack(alignment: .leading, spacing: 10) {
                    SkeletonBlock(width: 72, height: 12)
                    SkeletonBlock(width: 52, height: 24, cornerRadius: 6)
                    SkeletonBlock(height: 8, cornerRadius: 4)
                }
                .padding(14)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(Color.recompSurface, in: RoundedRectangle(cornerRadius: 16))
                .overlay(
                    RoundedRectangle(cornerRadius: 16)
                        .stroke(Color.recompBorder, lineWidth: 1)
                )
            }
        }
        .padding(.horizontal)
    }
}
