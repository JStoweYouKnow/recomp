package com.recomp.app

import android.app.Application
import androidx.room.Room
import com.recomp.app.db.AppDatabase
import com.recomp.app.push.FirebaseBootstrap
import com.recomp.app.push.RefactorNotifications
import com.recomp.app.sync.SyncScheduler

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
