//
//  RefactorWidgetsBundle.swift
//  RefactorWidgets (watchOS complications)
//

import WidgetKit
import SwiftUI

@main
struct RefactorWidgetsBundle: WidgetBundle {
    var body: some Widget {
        CalorieCircularComplication()
        MacroRectangularComplication()
        CalorieInlineComplication()
    }
}
