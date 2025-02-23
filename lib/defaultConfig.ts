import { GeneralSettings } from '#types/GeneralSettings.ts';

export const DEFAULT_CONFIG: GeneralSettings = {
  interval: 60,
  port: 9998,
  workingHours: { from: '', to: '' },
  demoMode: false,
  analyticsEnabled: false,
  debug: false,
  puppeteerTimeout: 60_000,
  puppeteerHeadless: true,
};
