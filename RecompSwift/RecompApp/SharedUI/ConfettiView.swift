import SwiftUI

struct ConfettiView: View {
    @State private var particles: [ConfettiParticle] = []
    @State private var isAnimating = false

    let colors: [Color] = [.red, .blue, .green, .yellow, .purple, .orange, .pink]

    var body: some View {
        GeometryReader { geo in
            ZStack {
                ForEach(particles) { particle in
                    Circle()
                        .fill(particle.color)
                        .frame(width: particle.size, height: particle.size)
                        .position(
                            x: particle.x,
                            y: isAnimating ? geo.size.height + 20 : particle.y
                        )
                        .opacity(isAnimating ? 0 : 1)
                        .rotationEffect(.degrees(isAnimating ? particle.rotation : 0))
                }
            }
        }
        .allowsHitTesting(false)
        .onAppear { burst() }
    }

    private func burst() {
        particles = (0..<50).map { _ in
            ConfettiParticle(
                x: CGFloat.random(in: 0...400),
                y: CGFloat.random(in: -100...0),
                size: CGFloat.random(in: 4...10),
                color: colors.randomElement()!,
                rotation: Double.random(in: 0...720)
            )
        }

        withAnimation(.easeOut(duration: 2.0)) {
            isAnimating = true
        }
    }
}

struct ConfettiParticle: Identifiable {
    let id = UUID()
    var x: CGFloat
    var y: CGFloat
    var size: CGFloat
    var color: Color
    var rotation: Double
}
