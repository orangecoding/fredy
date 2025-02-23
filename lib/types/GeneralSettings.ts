export interface GeneralSettings {
  interval?: number | undefined;
  lastRun?: number | null;
  port?: number | undefined;
  demoMode?: boolean;
  analyticsEnabled?: boolean | null;
  debug?: boolean;
  puppeteerHeadless?: boolean;
  puppeteerTimeout?: number;
  env?: {
    NODE_ENV: string;
  };
  workingHours: {
    from: string | null;
    to: string | null;
  } | null;
}
