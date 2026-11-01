package usecase

import "math"

const earthRadiusMeters = 6_371_000.0

// HaversineMeters returns the great-circle distance in meters between two
// WGS84 coordinates. Used for the attendance geofence check (a distance is not
// money, so float math is appropriate here).
func HaversineMeters(lat1, lng1, lat2, lng2 float64) float64 {
	toRad := func(d float64) float64 { return d * math.Pi / 180 }
	dLat := toRad(lat2 - lat1)
	dLng := toRad(lng2 - lng1)
	a := math.Sin(dLat/2)*math.Sin(dLat/2) +
		math.Cos(toRad(lat1))*math.Cos(toRad(lat2))*math.Sin(dLng/2)*math.Sin(dLng/2)
	return 2 * earthRadiusMeters * math.Asin(math.Min(1, math.Sqrt(a)))
}
