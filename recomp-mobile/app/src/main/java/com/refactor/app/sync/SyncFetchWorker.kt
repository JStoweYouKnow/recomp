package com.refactor.app.sync

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.refactor.app.RefactorAndroidApp
import com.refactor.app.api.ApiException
import com.refactor.app.api.SyncRepository
import com.refactor.app.widget.RecompWidgetUpdater
import com.refactor.app.network.createHttpClient
import com.refactor.app.session.SessionStore

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
