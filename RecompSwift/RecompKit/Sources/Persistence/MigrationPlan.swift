import Foundation
import SwiftData

enum RecompMigrationPlan: SchemaMigrationPlan {
    static var schemas: [any VersionedSchema.Type] {
        [RecompSchemaV1.self]
    }

    static var stages: [MigrationStage] {
        []
    }
}

enum RecompSchemaV1: VersionedSchema {
    static var versionIdentifier = Schema.Version(1, 0, 0)
    static var models: [any PersistentModel.Type] { RecompSchema.models }
}
