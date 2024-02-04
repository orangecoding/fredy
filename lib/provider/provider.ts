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
  normalize(o): any;
  filter(o): any;
};