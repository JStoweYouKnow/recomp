import SwiftUI
import RefactorKit

struct CalendarStripView: View {
    @Binding var selectedDate: Date
    var dotDates: Set<String> = []

    private let dates = DateHelpers.weekDates()

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(dates, id: \.self) { date in
                    let dateStr = DateHelpers.dateString(from: date)
                    let isSelected = DateHelpers.dateString(from: selectedDate) == dateStr
                    let hasDot = dotDates.contains(dateStr)

                    VStack(spacing: 4) {
                        Text(DateHelpers.dayOfWeekShort(date))
                            .font(.caption2)
                            .foregroundStyle(isSelected ? .white : .secondary)

                        Text("\(DateHelpers.dayNumber(date))")
                            .font(.system(.body, design: .rounded, weight: .semibold))
                            .foregroundStyle(isSelected ? .white : .primary)

                        Circle()
                            .fill(hasDot ? (isSelected ? .white : .blue) : .clear)
                            .frame(width: 5, height: 5)
                    }
                    .frame(width: 44, height: 64)
                    .background(
                        RoundedRectangle(cornerRadius: 12)
                            .fill(isSelected ? .blue : .clear)
                    )
                    .onTapGesture {
                        withAnimation(.spring(duration: 0.2)) {
                            selectedDate = date
                        }
                    }
                }
            }
            .padding(.horizontal)
        }
    }
}

#Preview {
    CalendarStripView(selectedDate: .constant(.now), dotDates: [DateHelpers.todayString()])
}
