export interface Listing {
  price: string;
  size: string;
  title: string;
  description: string;
  link: string;
  address: string;
  id: string;
  notificationText: string;
  providerId: string;
}

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