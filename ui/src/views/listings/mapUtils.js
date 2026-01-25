/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * Calculates the great-circle distance between two points on a sphere using the Haversine formula.
 *
 * I'm using the Haversine formula here because it accounts for the Earth's curvature.
 * By calculating the central angle (c) between two points and multiplying it by the Earth's radius (R ≈ 6371km),
 * we get a pretty accurate straight-line distance. It's basically some trigonometry involving
 * sines and cosines of the latitudes and longitudes to find the chord length (a) first.
 *
 * @param {number} lat1 - Latitude of the first point
 * @param {number} lon1 - Longitude of the first point
 * @param {number} lat2 - Latitude of the second point
 * @param {number} lon2 - Longitude of the second point
 * @returns {number} Distance in meters, rounded to one decimal place
 */
export const distanceMeters = (lat1, lon1, lat2, lon2) => {
  const R = 6371000;
  const toRad = (deg) => (deg * Math.PI) / 180;

  const phi1 = toRad(lat1);
  const phi2 = toRad(lat2);
  const dPhi = toRad(lat2 - lat1);
  const dLambda = toRad(lon2 - lon1);

  const a =
    Math.sin(dPhi / 2) * Math.sin(dPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLambda / 2) * Math.sin(dLambda / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return Math.round(R * c * 10) / 10;
};

/**
 * Generates an array of coordinates representing a circle on a map.
 *
 * To get this circle right, I'm approximating it with a polygon of 64 points.
 * Since the Earth isn't flat, I have to adjust the longitude distance based on the latitude
 * using the cosine of the latitude. The formula for the points is basically:
 * x = center_lon + radius_lon * cos(theta)
 * y = center_lat + radius_lat * sin(theta)
 * where theta ranges from 0 to 2π. This handles the slight "squishing" of distances as you move away from the equator.
 *
 * @param {number[]} center - [longitude, latitude] of the center
 * @param {number} radiusInKm - Radius of the circle in kilometers
 * @param {number} [points=64] - Number of points to generate for the polygon
 * @returns {number[][]} Array of [longitude, latitude] coordinates
 */
export const generateCircleCoords = (center, radiusInKm, points = 64) => {
  const [longitude, latitude] = center;
  const coords = [];

  // 1 degree of latitude is roughly 110.574 km
  // 1 degree of longitude is roughly 111.32 km * cos(latitude)
  const distanceX = radiusInKm / (111.32 * Math.cos((latitude * Math.PI) / 180));
  const distanceY = radiusInKm / 110.574;

  for (let i = 0; i < points; i++) {
    const theta = (i / points) * (2 * Math.PI);
    const x = distanceX * Math.cos(theta);
    const y = distanceY * Math.sin(theta);
    coords.push([longitude + x, latitude + y]);
  }
  // Close the polygon
  coords.push(coords[0]);

  return coords;
};

/**
 * Calculates the bounding box for a given center and radius.
 *
 * I'm calculating the bounds by offsetting the center coordinates by the radius.
 * Again, using the 110.574 km per degree latitude and the cosine-adjusted longitude
 * to make sure the bounds actually contain the circle, even at our latitudes.
 * I've added a bit of padding (15% by default) to make sure everything fits nicely on the screen.
 *
 * @param {number[]} center - [longitude, latitude] of the center
 * @param {number} radiusInKm - Radius in kilometers
 * @param {number} [padding=0.15] - Percentage of padding to add
 * @returns {number[][]} Bounding box coordinates [[minLon, minLat], [maxLon, maxLat]]
 */
export const getBoundsFromCenter = (center, radiusInKm, padding = 0.15) => {
  const [lng, lat] = center;
  const kmInDegLat = 1 / 110.574;
  const kmInDegLng = 1 / (111.32 * Math.cos((lat * Math.PI) / 180));

  const offsetLng = radiusInKm * kmInDegLng * (1 + padding);
  const offsetLat = radiusInKm * kmInDegLat * (1 + padding);

  return [
    [lng - offsetLng, lat - offsetLat],
    [lng + offsetLng, lat + offsetLat],
  ];
};
