import { GeneralSettingsState } from '../services/rematch/models/generalSettings';
import { ProviderState } from '../services/rematch/models/provider';
import { NotificationAdapterState } from '../services/rematch/models/notificationAdapter';
import { DemoModeState } from '../services/rematch/models/demoMode';
import { Job } from '#types/Jobs.ts';
import { Listing } from '#types/Listings.ts';
import { User } from '#types/User.ts';

export interface RootState {
  user: UserState;
  generalSettings: GeneralSettingsState;
  jobs: JobsState;
  provider: ProviderState;
  notificationAdapter: NotificationAdapterState;
  demoMode: DemoModeState;
}

export interface UserState {
  users: User[];
  currentUser: User | null;
}

export interface JobsState {
  jobs: Job[];
  insights: Record<string, Listing>;
  processingTimes: ProcessingTimes;
}

export interface ProcessingTimes {
  interval: number;
  lastRun?: number;
}

export interface Provider {
  id: string;
  name: string;
  url: string;
  baseUrl: string;
}

export interface JobInsightParams {
  jobId: string;
}
