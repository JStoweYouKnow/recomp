import SwiftUI
import RefactorKit

struct CalendarStripView: View {
    @Binding var selectedDate: Date
    var dotDates: Set<String> = []

    /// Seven dates (Sun–Sat) for the week containing the current selection.
    /// Dates are normalized to start-of-day so `id` values are stable across renders.
    private var dates: [Date] {
        let cal = Calendar.current
        return DateHelpers.weekDates(around: selectedDate).map { cal.startOfDay(for: $0) }
    }

    private var monthYearLabel: String {
        let formatter = DateFormatter()
        formatter.dateFormat = "MMMM yyyy"
        // Use the middle of the week (Wednesday) to avoid month-boundary edge cases
        let midWeek = Calendar.current.date(byAdding: .day, value: 3, to: dates.first ?? selectedDate) ?? selectedDate
        return formatter.string(from: midWeek)
    }

    private func shiftWeek(by weeks: Int) {
        let shifted = Calendar.current.date(byAdding: .day, value: weeks * 7, to: selectedDate) ?? selectedDate
        withAnimation(.spring(duration: 0.25)) { selectedDate = shifted }
    }

    var body: some View {
        VStack(spacing: 6) {
            HStack {
                Button { shiftWeek(by: -1) } label: {
                    Image(systemName: "chevron.left")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(Color.appAccent)
                        .frame(width: 44, height: 44)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)

                Spacer()

                Text(monthYearLabel)
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)

                Spacer()

                Button { shiftWeek(by: 1) } label: {
                    Image(systemName: "chevron.right")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(Color.appAccent)
                        .frame(width: 44, height: 44)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
            .padding(.horizontal, 4)

            HStack(spacing: 4) {
                ForEach(dates, id: \.self) { date in
                    let dateStr = DateHelpers.dateString(from: date)
                    let isSelected = DateHelpers.dateString(from: selectedDate) == dateStr
                    let hasDot = dotDates.contains(dateStr)

                    Button {
                        withAnimation(.spring(duration: 0.2)) {
                            selectedDate = date
                        }
                    } label: {
                        VStack(spacing: 4) {
                            Text(DateHelpers.dayOfWeekShort(date))
                                .font(.caption2)
                                .foregroundStyle(isSelected ? .white : .secondary)

                            Text("\(DateHelpers.dayNumber(date))")
                                .font(.system(.body, design: .rounded, weight: .semibold))
                                .foregroundStyle(isSelected ? .white : .primary)

                            Circle()
                                .fill(hasDot ? (isSelected ? Color.white : Color.appAccent) : Color.clear)
                                .frame(width: 5, height: 5)
                        }
                        .frame(maxWidth: .infinity, minHeight: 64)
                        .background(
                            RoundedRectangle(cornerRadius: 12)
                                .fill(isSelected ? Color.appAccent : Color.clear)
                        )
                    }
                    .buttonStyle(.plain)
                }
            }
        }
        .padding(.bottom, 4)
    }
}

#Preview {
    CalendarStripView(selectedDate: .constant(.now), dotDates: [DateHelpers.todayString()])
}
