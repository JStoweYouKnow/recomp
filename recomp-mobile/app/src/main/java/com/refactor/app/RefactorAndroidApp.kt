package com.refactor.app

import android.app.Application
import androidx.room.Room
import com.refactor.app.db.AppDatabase
import com.refactor.app.push.FirebaseBootstrap
import com.refactor.app.push.RefactorNotifications
import com.refactor.app.sync.SyncScheduler

class RefactorAndroidApp : Application() {

    val database: AppDatabase by lazy {
        Room.databaseBuilder(this, AppDatabase::class.java, "refactor.db")
            .fallbackToDestructiveMigration()
            .build()
    }

    override fun onCreate() {
        super.onCreate()
        FirebaseBootstrap.init(this)
        RefactorNotifications.ensurePushChannel(this)
        SyncScheduler.schedule(this)
    }
}
