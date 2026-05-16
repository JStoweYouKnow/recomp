package com.recomp.app.sync

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.recomp.app.RefactorAndroidApp
import com.recomp.app.api.ApiException
import com.recomp.app.api.SyncRepository
import com.recomp.app.widget.RecompWidgetUpdater
import com.recomp.app.network.createHttpClient
import com.recomp.app.session.SessionStore

/**
 * Periodic background pull of **`GET /api/data/sync`** when online (does nothing if logged out).
 */
class SyncFetchWorker(
    context: Context,
    params: WorkerParameters,
) : CoroutineWorker(context, params) {

    override suspend fun doWork(): Result {
        val session = SessionStore(applicationContext)
        if (session.getUserId().isNullOrBlank()) return Result.success()

        val app = applicationContext.applicationContext as? RefactorAndroidApp
            ?: return Result.success()

        val client = createHttpClient(session)
        val repo = SyncRepository(client, app.database.syncCacheDao())

        return repo.fetchSnapshot().fold(
            onSuccess = { snap ->
                RecompWidgetUpdater.updateFromSnapshot(applicationContext, snap)
                Result.success()
            },
            onFailure = { e ->
                when (e) {
                    is ApiException -> if (e.code == 401 || e.code == 403 || e.code == 404) {
                        Result.success()
                    } else {
                        Result.retry()
                    }
                    else -> Result.retry()
                }
            },
        )
    }
}
