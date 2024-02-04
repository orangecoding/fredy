import * as einsAImmobilien from './einsAImmobilien.js';
import * as immobilienDe from './immobilienDe.js';
import * as immonet from './immonet.js';
import * as immoscout from './immoscout.js';
import * as immoswp from './immoswp.js';
import * as immowelt from './immowelt.js';
import * as kleinanzeigen from './kleinanzeigen.js';
import * as neubauKompass from './neubauKompass.js';
import * as wgGesucht from './wgGesucht.js';

export const providers: Provider[] = [
  einsAImmobilien,
  immobilienDe,
  immonet,
  immoscout,
  immoswp,
  immowelt,
  kleinanzeigen,
  neubauKompass,
  wgGesucht,
];

export interface Listing {
  price: string;
  size: string;
  title: string;
  description: string;
  link: string;
  address: string;
  id: string;
  rooms?: string;
  notificationText?: string;
  providerId: string;
}
export type Provider = {
  init(sourceConfig: ProviderJobInformation, blacklist: string[], blacklistedDistricts?): void;
  metaInformation: ProviderMetaInformation;
  config: ProviderConfig;
};

export enum Providers {
  einsAImmobilien = 'einsAImmobilien',
  immobilienDe = 'immobilienDe',
  immonet = 'immonet',
  immoscout = 'immoscout',
  immoswp = 'immoswp',
  immowelt = 'immowelt',
  kleinanzeigen = 'kleinanzeigen',
  neubauKompass = 'neubauKompass',
  wgGesucht = 'wgGesucht',
}

export type ProviderMetaInformation = {
  name: string;
  baseUrl: string;
  id: string;
};

export type ProviderJobInformation = {
  name: string;
  url: string;
  id: string;
};

export type ProviderConfig = {
  enabled?: boolean;
  url?: string;
  crawlContainer: string;
  sortByDateParam: string;
  crawlFields: {
    id?: string;
    price: string;
    size?: string;
    rooms?: string;
    title: string;
    link?: string;
    description?: string;
    address?: string;
  };
  paginate?: string;
  normalize(listing: Listing): Listing;
  filter(listing: Listing): boolean;
};
