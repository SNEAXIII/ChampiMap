package fr.champimap

import android.content.Context
import android.hardware.GeomagneticField
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.os.SystemClock
import kotlin.math.abs

/**
 * Cap du téléphone tenu à plat, en degrés par rapport au nord vrai.
 * Émet au plus toutes les 100 ms, et seulement si le cap bouge d'au moins 1° ou si l'état change.
 */
class HeadingSensor(
    context: Context,
    private val onChange: (heading: Double, tilted: Boolean, needsCalibration: Boolean) -> Unit,
) : SensorEventListener {

    private val sensors = context.getSystemService(SensorManager::class.java)
    private val rotationVector: Sensor? = sensors.getDefaultSensor(Sensor.TYPE_ROTATION_VECTOR)
    private val magnetometer: Sensor? = sensors.getDefaultSensor(Sensor.TYPE_MAGNETIC_FIELD)
    private val matrix = FloatArray(9)
    private val angles = FloatArray(3)

    private var needsCalibration = false
    private var lastEmitAt = 0L
    private var lastHeading = Double.NaN
    private var lastTilted = false
    private var lastCalibration = false
    private var declinationFixTime = Long.MIN_VALUE
    private var declination = 0f

    fun start() {
        rotationVector?.let { sensors.registerListener(this, it, SensorManager.SENSOR_DELAY_UI) }
        // Le magnétomètre n'est écouté que pour sa précision (besoin de calibration).
        magnetometer?.let { sensors.registerListener(this, it, SensorManager.SENSOR_DELAY_NORMAL) }
    }

    fun stop() {
        sensors.unregisterListener(this)
    }

    override fun onAccuracyChanged(sensor: Sensor, accuracy: Int) {
        if (sensor.type == Sensor.TYPE_MAGNETIC_FIELD) {
            needsCalibration = accuracy <= SensorManager.SENSOR_STATUS_ACCURACY_LOW
        }
    }

    override fun onSensorChanged(event: SensorEvent) {
        if (event.sensor.type != Sensor.TYPE_ROTATION_VECTOR) return
        val now = SystemClock.elapsedRealtime()
        if (now - lastEmitAt < MIN_INTERVAL_MS) return

        SensorManager.getRotationMatrixFromVector(matrix, event.values)
        SensorManager.getOrientation(matrix, angles)
        val magneticHeading = Math.toDegrees(angles[0].toDouble())
        val heading = ((magneticHeading + currentDeclination()) % 360 + 360) % 360
        val tilted = abs(Math.toDegrees(angles[1].toDouble())) > MAX_TILT_DEGREES ||
            abs(Math.toDegrees(angles[2].toDouble())) > MAX_TILT_DEGREES

        val unchanged = !lastHeading.isNaN() &&
            angleBetween(heading, lastHeading) < MIN_DELTA_DEGREES &&
            tilted == lastTilted &&
            needsCalibration == lastCalibration
        if (unchanged) return

        lastEmitAt = now
        lastHeading = heading
        lastTilted = tilted
        lastCalibration = needsCalibration
        onChange(heading, tilted, needsCalibration)
    }

    /** Écart nord magnétique → nord vrai à la dernière position (0 tant qu'on n'a pas de position). */
    private fun currentDeclination(): Float {
        val fix = LocationHub.lastFix ?: return 0f
        if (fix.time != declinationFixTime) {
            declinationFixTime = fix.time
            declination = GeomagneticField(
                fix.latitude.toFloat(),
                fix.longitude.toFloat(),
                fix.altitude.toFloat(),
                System.currentTimeMillis(),
            ).declination
        }
        return declination
    }

    private fun angleBetween(a: Double, b: Double): Double {
        val diff = abs(a - b) % 360
        return if (diff > 180) 360 - diff else diff
    }

    private companion object {
        const val MIN_INTERVAL_MS = 100L
        const val MIN_DELTA_DEGREES = 1.0
        const val MAX_TILT_DEGREES = 60.0
    }
}
