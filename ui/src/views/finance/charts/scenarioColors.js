/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { shareRamp } from '../../../components/cards/chartTheme.js';

/**
 * How many rate scenarios can be told apart: one per step of the greyscale ramp.
 *
 * @type {number}
 */
export const SCENARIO_COLOR_COUNT = 5;

/**
 * The colour of each rate scenario, in the order the scenarios are listed.
 *
 * Steps of the greyscale ramp rather than a set of hues: the first scenario - the one every
 * headline figure is computed from - is the brightest line, and every other one reads as a
 * comparison a step further back. The scenario form paints its swatches from the same list, so a
 * row there and a line on the trajectory chart need no legend between them.
 *
 * A function rather than a constant, because the ramp belongs to whichever theme is on screen when
 * the chart draws.
 *
 * @returns {string[]}
 */
export function scenarioColors() {
  return shareRamp().slice(0, SCENARIO_COLOR_COUNT);
}
