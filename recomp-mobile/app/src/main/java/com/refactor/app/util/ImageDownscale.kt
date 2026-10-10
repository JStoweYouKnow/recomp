package com.refactor.app.util

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import java.io.ByteArrayOutputStream

/** Shrinks shared images before upload so tall delivery-app screenshots stay under the API body limit. */
object ImageDownscale {
    private const val MAX_EDGE = 2000

    fun jpegFromUri(context: Context, uri: Uri, quality: Int = 85): ByteArray? {
        val resolver = context.contentResolver
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        resolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, bounds) } ?: return null
        if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return null

        var sample = 1
        while (maxOf(bounds.outWidth, bounds.outHeight) / (sample * 2) >= MAX_EDGE) sample *= 2
        val decoded = resolver.openInputStream(uri)?.use {
            BitmapFactory.decodeStream(it, null, BitmapFactory.Options().apply { inSampleSize = sample })
        } ?: return null

        val longest = maxOf(decoded.width, decoded.height)
        val scaled = if (longest > MAX_EDGE) {
            val f = MAX_EDGE.toFloat() / longest
            Bitmap.createScaledBitmap(decoded, (decoded.width * f).toInt(), (decoded.height * f).toInt(), true)
                .also { if (it !== decoded) decoded.recycle() }
        } else {
            decoded
        }
        return ByteArrayOutputStream().use { out ->
            scaled.compress(Bitmap.CompressFormat.JPEG, quality, out)
            scaled.recycle()
            out.toByteArray()
        }
    }
}
