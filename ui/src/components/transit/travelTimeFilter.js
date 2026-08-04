/*
 * Travel time filter helpers.
 */

export const TRAVEL_MODES = {
  TRANSIT: 'transit',
  CAR: 'car',
};

export function createTravelTimeFilter(mode = 'transit', maxMinutes = 45) {
  return {
    enabled: true,
    mode,
    maxMinutes,
  };
}
