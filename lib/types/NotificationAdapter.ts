import { Listing } from './Listings';

export interface NotificationAdapterExport {
  send: (args: SendNotificationArgs) => Promise<void>;
  config: NotificationAdapterConfig;
}

export interface NotificationAdapterConfig {
  id: string;
  name?: string;
  description?: string;
  readme?: string;
  enabled?: boolean;
  fields: NotificationAdapterFields;
}

export type NotificationAdapterFields = Record<string, NotificationAdapterFieldsValue>;

export type NotificationAdapterFieldsValue = {
  type: 'text' | 'email' | 'number' | 'boolean';
  label: string;
  description: string;
  value?: string | boolean | number;
};

export interface SendNotificationArgs {
  serviceName: string;
  newListings: Listing[];
  notificationConfig: NotificationAdapterConfig[];
  jobKey: string;
}
