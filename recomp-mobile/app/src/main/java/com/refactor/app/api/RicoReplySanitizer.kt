package com.refactor.app.api

/** Removes temporary Rico meal-logging debug markup (e.g. `[DIAG today=…]` blocks). */
fun stripRicoDiagnosticMarkup(text: String): String =
    text.replace(Regex("""\[DIAG[\s\S]*?\]""", RegexOption.IGNORE_CASE), "")
        .replace(Regex("\n{3,}"), "\n\n")
        .trim()
