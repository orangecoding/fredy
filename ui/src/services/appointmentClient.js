/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { xhrGet, xhrPost, xhrPut } from './xhr.js';

export async function getAppointments(includeArchived = true) {
  return (await xhrGet(`/api/appointments?includeArchived=${includeArchived}`)).json;
}

export async function saveAppointment(payload) {
  return (await xhrPost('/api/appointments', payload)).json;
}

export async function setAppointmentState(appointmentId, state) {
  return (await xhrPut(`/api/appointments/${appointmentId}/state`, { state })).json;
}
