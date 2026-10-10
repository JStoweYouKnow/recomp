package com.refactor.app.ui.meals

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.refactor.app.api.dto.MenuPickDto
import kotlin.math.roundToInt

/**
 * A restaurant menu item ranked against the remaining macro budget, with a
 * "macro approved" badge and one-tap logging. Used by menu scan and Ref's
 * restaurant recommendations.
 */
@Composable
fun MenuPickRow(
    pick: MenuPickDto,
    onLog: () -> Unit,
    modifier: Modifier = Modifier,
    isLogged: Boolean = false,
    onEdit: (() -> Unit)? = null,
) {
    val shape = RoundedCornerShape(10.dp)
    val accent = MaterialTheme.colorScheme.primary
    Row(
        modifier
            .fillMaxWidth()
            .border(1.dp, if (pick.recommended) accent.copy(alpha = 0.5f) else MaterialTheme.colorScheme.outlineVariant, shape)
            .background(if (pick.recommended) accent.copy(alpha = 0.06f) else MaterialTheme.colorScheme.surface, shape)
            .padding(horizontal = 10.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Column(
            Modifier
                .weight(1f)
                .let { if (onEdit != null) it.clickable(onClick = onEdit) else it },
        ) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                Text(
                    pick.name,
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.Medium,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f, fill = false),
                )
                if (pick.recommended) {
                    Text(
                        "MACRO APPROVED",
                        style = MaterialTheme.typography.labelSmall,
                        fontWeight = FontWeight.SemiBold,
                        color = MaterialTheme.colorScheme.onPrimary,
                        modifier = Modifier
                            .background(accent, RoundedCornerShape(50))
                            .padding(horizontal = 6.dp, vertical = 2.dp),
                    )
                }
            }
            val m = pick.estimatedMacros
            Text(
                "${m.calories.roundToInt()} cal · ${m.protein.roundToInt()}g P · ${m.carbs.roundToInt()}g C · ${m.fat.roundToInt()}g F" +
                    if (pick.source == "official") "" else " · est.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            pick.fitReason?.takeIf { it.isNotBlank() }?.let {
                Text(
                    it,
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
        Button(
            onClick = onLog,
            enabled = !isLogged,
            contentPadding = ButtonDefaults.TextButtonContentPadding,
        ) { Text(if (isLogged) "Logged" else "Log") }
    }
}
