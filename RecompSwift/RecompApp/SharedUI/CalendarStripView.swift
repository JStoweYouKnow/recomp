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

    var body: some View {
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
        .padding(.horizontal)
        .frame(height: 72)
    }
}

#Preview {
    CalendarStripView(selectedDate: .constant(.now), dotDates: [DateHelpers.todayString()])
}
