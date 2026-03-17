import Foundation
import SwiftData

struct BodyScanPhotos: Codable, Sendable {
    var front: String?
    var side: String?
    var back: String?
}

@Model
final class BodyScan: @unchecked Sendable {
    @Attribute(.unique) var id: String
    var date: String
    var photos: BodyScanPhotos
    var analysis: String?
    var bodyFatEstimate: Double?
    var muscleAssessment: String?
    var notes: String?

    init(
        id: String = UUID().uuidString,
        date: String,
        photos: BodyScanPhotos = BodyScanPhotos(),
        analysis: String? = nil,
        bodyFatEstimate: Double? = nil,
        muscleAssessment: String? = nil,
        notes: String? = nil
    ) {
        self.id = id
        self.date = date
        self.photos = photos
        self.analysis = analysis
        self.bodyFatEstimate = bodyFatEstimate
        self.muscleAssessment = muscleAssessment
        self.notes = notes
    }
}
