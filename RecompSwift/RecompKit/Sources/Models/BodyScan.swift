import Foundation
import SwiftData

public struct BodyScanPhotos: Codable, Sendable {
    public var front: String?
    public var side: String?
    public var back: String?
}

@Model
public final class BodyScan: @unchecked Sendable {
    @Attribute(.unique) var id: String
    public var date: String
    public var photos: BodyScanPhotos
    public var analysis: String?
    public var bodyFatEstimate: Double?
    public var muscleAssessment: String?
    public var notes: String?

    public init(
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
