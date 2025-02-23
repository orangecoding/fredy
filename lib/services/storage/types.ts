import { Job } from '#types/Jobs.ts';
import { User } from '#types/User.ts';

export interface JobsDbData {
  jobs: Job[];
}

/* ******************************************************* */
export interface KnownListingsDb {
  [jobId: string]: KnownListingsDbData;
}
export interface KnownListingsDbData {
  providerData: KnownListingsDbProviderData;
  lastExecution: number;
}
export type KnownListingsDbProviderData = {
  [providerId: string]: KnownListingsDbListingList;
};

export interface KnownListingsDbListingList {
  [listingId: string]: number;
}

/* ******************************************************* */
export interface UsersDbData {
  user: User[];
}
