import { Listing } from '#types/Listings.ts';

export interface ProviderConfig {
  url: string | null;
  crawlContainer: string;
  sortByDateParam: string;
  waitForSelector: string;
  crawlFields: Listing;
  normalize: (o: Listing) => Listing;
  filter: (o: Listing) => boolean;
  enabled?: boolean;
}

export interface ProviderMetaInformation {
  name: string;
  baseUrl: string;
  id: string;
}

export interface ProviderExport {
  config: ProviderConfig;
  metaInformation: ProviderMetaInformation;
  init: (sourceConfig: Partial<ProviderConfig>, blacklist: string[]) => void;
}
