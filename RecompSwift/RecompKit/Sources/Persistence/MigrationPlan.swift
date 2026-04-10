import Foundation
import SwiftData

public enum RecompMigrationPlan: SchemaMigrationPlan {
    public static var schemas: [any VersionedSchema.Type] {
        [RecompSchemaV1.self]
    }

    public static var stages: [MigrationStage] {
        []
    }
}

public enum RecompSchemaV1: VersionedSchema {
    public static var versionIdentifier = Schema.Version(1, 0, 0)
    public static var models: [any PersistentModel.Type] { RecompSchema.models }
}
