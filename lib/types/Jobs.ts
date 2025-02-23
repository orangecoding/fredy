import { Provider } from 'ui/src/types';
import { NotificationAdapterConfig } from './NotificationAdapter';

export interface Job {
  blacklist: string[];
  enabled: boolean;
  id: string;
  name: string;
  notificationAdapter: NotificationAdapterConfig[];
  numberOfFoundListings?: number;
  provider: Provider[];
  userId: string;
}
