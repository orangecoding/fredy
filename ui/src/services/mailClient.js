/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { xhrDelete, xhrGet, xhrPost, xhrPut } from './xhr.js';

const json = (response) => response.json;

export const getMailAccount = () => xhrGet('/api/mail/account').then(json);
export const saveMailAccount = (account) => xhrPut('/api/mail/account', account).then(json);
export const deleteMailAccount = () => xhrDelete('/api/mail/account').then(json);
export const testMailAccount = () => xhrPost('/api/mail/account/test').then(json);
export const syncMail = () => xhrPost('/api/mail/sync').then(json);
export const matchMail = () => xhrPost('/api/mail/match').then(json);
export const getMailMessages = (limit = 200) => xhrGet(`/api/mail/messages?limit=${limit}`).then(json);
export const searchMailListings = (query = '', limit = 100) =>
  xhrGet(`/api/mail/listings?query=${encodeURIComponent(query)}&limit=${limit}`).then(json);
export const assignMailMessage = (messageId, listingId, status) =>
  xhrPut(`/api/mail/messages/${encodeURIComponent(messageId)}/listing`, { listingId, status }).then(json);
export const removeMailMessageMatch = (messageId) =>
  xhrDelete(`/api/mail/messages/${encodeURIComponent(messageId)}/listing`).then(json);
export const updateMailListingStatus = (listingId, status) =>
  xhrPost(`/api/listings/${encodeURIComponent(listingId)}/status`, { status });
