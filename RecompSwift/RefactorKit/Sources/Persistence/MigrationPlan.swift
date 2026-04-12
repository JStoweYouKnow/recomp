import Foundation
import SwiftData

public enum RefactorMigrationPlan: SchemaMigrationPlan {
    public static var schemas: [any VersionedSchema.Type] {
        [RefactorSchemaV1.self]
    }

    public static var stages: [MigrationStage] {
        []
    }
}

public enum RefactorSchemaV1: VersionedSchema {
    public static var versionIdentifier = Schema.Version(1, 0, 0)
    public static var models: [any PersistentModel.Type] { RefactorSchema.models }
}
