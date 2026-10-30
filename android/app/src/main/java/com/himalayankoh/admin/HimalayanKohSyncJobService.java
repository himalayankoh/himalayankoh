package com.himalayankoh.admin;

import android.app.job.JobInfo;
import android.app.job.JobParameters;
import android.app.job.JobScheduler;
import android.app.job.JobService;
import android.content.ComponentName;
import android.content.Context;
import android.content.SharedPreferences;
import android.os.Build;
import android.util.Log;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Native background job that checks for new wholesale inquiries and customer emails
 * even when the Himalayan Koh Admin APK is in the background or device screen is locked.
 */
public class HimalayanKohSyncJobService extends JobService {

    private static final String TAG = "HKSyncJobService";
    public static final int JOB_ID = 8002;
    private static final String PREFS_NAME = "hk_admin_prefs";
    private static final String KEY_AUTH_TOKEN = "auth_token";
    private static final String KEY_LAST_NOTIFIED_ALERT_ID = "last_notified_alert_id";

    private final ExecutorService executor = Executors.newSingleThreadExecutor();

    public static void schedule(Context context) {
        JobScheduler scheduler = (JobScheduler) context.getSystemService(Context.JOB_SCHEDULER_SERVICE);
        if (scheduler == null) return;

        ComponentName componentName = new ComponentName(context, HimalayanKohSyncJobService.class);
        JobInfo.Builder builder = new JobInfo.Builder(JOB_ID, componentName)
                .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
                .setPersisted(true);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            // Periodic minimum interval on Android 7.0+ is 15 minutes
            builder.setPeriodic(15 * 60 * 1000L);
        } else {
            builder.setPeriodic(15 * 60 * 1000L);
        }

        try {
            scheduler.schedule(builder.build());
            Log.d(TAG, "Himalayan Koh background sync job successfully scheduled.");
        } catch (Exception e) {
            Log.e(TAG, "Failed to schedule background sync job", e);
        }
    }

    @Override
    public boolean onStartJob(JobParameters params) {
        executor.execute(() -> {
            try {
                checkForNewAlerts();
            } catch (Exception e) {
                Log.e(TAG, "Error checking alerts in background job", e);
            } finally {
                jobFinished(params, false);
            }
        });
        return true;
    }

    @Override
    public boolean onStopJob(JobParameters params) {
        return true; // Reschedule if interrupted
    }

    private void checkForNewAlerts() {
        SharedPreferences prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
        String authToken = prefs.getString(KEY_AUTH_TOKEN, "");
        if (authToken == null || authToken.trim().isEmpty()) {
            return; // Not signed in yet
        }

        HttpURLConnection connection = null;
        try {
            URL url = new URL("https://himalayankoh.com/api/admin/notifications/check");
            connection = (HttpURLConnection) url.openConnection();
            connection.setRequestMethod("GET");
            connection.setConnectTimeout(10000);
            connection.setReadTimeout(15000);
            connection.setRequestProperty("Authorization", "Bearer " + authToken.trim());
            connection.setRequestProperty("Accept", "application/json");

            int responseCode = connection.getResponseCode();
            if (responseCode != 200) {
                return;
            }

            BufferedReader reader = new BufferedReader(new InputStreamReader(connection.getInputStream()));
            StringBuilder sb = new StringBuilder();
            String line;
            while ((line = reader.readLine()) != null) {
                sb.append(line);
            }
            reader.close();

            JSONObject json = new JSONObject(sb.toString());
            if (!json.optBoolean("ok", false)) {
                return;
            }

            if (!json.has("latestAlert") || json.isNull("latestAlert")) {
                return;
            }

            JSONObject latestAlert = json.getJSONObject("latestAlert");
            String alertId = latestAlert.optString("id", "");
            String title = latestAlert.optString("title", "Himalayan Koh Alert");
            String message = latestAlert.optString("message", "New activity in Admin Console");
            String targetUrl = latestAlert.optString("url", "/admin/wholesale/inquiries");

            String lastNotifiedId = prefs.getString(KEY_LAST_NOTIFIED_ALERT_ID, "");
            if (!alertId.isEmpty() && !alertId.equals(lastNotifiedId)) {
                // Post high priority lockscreen notification
                HimalayanKohNotificationHelper.showLockscreenNotification(
                        this,
                        title,
                        message,
                        targetUrl,
                        alertId.hashCode()
                );

                // Remember this alert ID so we don't repeat notification
                prefs.edit().putString(KEY_LAST_NOTIFIED_ALERT_ID, alertId).apply();
            }
        } catch (Exception e) {
            Log.w(TAG, "Network or JSON error during background alert check: " + e.getMessage());
        } finally {
            if (connection != null) {
                connection.disconnect();
            }
        }
    }
}
