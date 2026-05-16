package com.recomp.app.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private val LightScheme = lightColorScheme(
    primary = Accent,
    onPrimary = Color.White,
    secondary = MutedForeground,
    onSecondary = Color.White,
    background = Background,
    surface = Surface,
    onBackground = Foreground,
    onSurface = Foreground,
    surfaceContainerLow = CardBg,
    outline = BorderSoft
)

private val DarkScheme = darkColorScheme(
    primary = Color(0xFF9CB85A),
    onPrimary = Color(0xFF1A1C16),
    secondary = Color(0xFFC4C4AF),
    background = Color(0xFF1A1916),
    surface = Color(0xFF23221E),
    onBackground = Color(0xFFE8E4DD),
    onSurface = Color(0xFFE8E4DD)
)

@Composable
fun RecompTheme(content: @Composable () -> Unit) {
    val colorScheme = if (isSystemInDarkTheme()) DarkScheme else LightScheme

    MaterialTheme(
        colorScheme = colorScheme,
        typography = RecompTypography,
        content = content
    )
}
