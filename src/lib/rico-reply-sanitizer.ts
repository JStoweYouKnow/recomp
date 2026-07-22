/** Strip temporary Rico meal-logging debug markup from chat replies. */
export function stripRicoDiagnosticMarkup(text: string): string {
  return text
    .replace(/\[DIAG[\s\S]*?\]/gi, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
