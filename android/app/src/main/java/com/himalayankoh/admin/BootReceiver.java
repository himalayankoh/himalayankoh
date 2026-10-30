package com.himalayankoh.admin;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/**
 * Ensures background alert sync resumes immediately after phone reboot or app update.
 */
public class BootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent != null) {
            String action = intent.getAction();
            if (Intent.ACTION_BOOT_COMPLETED.equals(action) || Intent.ACTION_MY_PACKAGE_REPLACED.equals(action)) {
                HimalayanKohNotificationHelper.initChannel(context);
                HimalayanKohSyncJobService.schedule(context);
            }
        }
    }
}
