// Migration: Adding a settings table to store important (config) settings instead of using config file
import fs from 'fs';
import path from 'path';
import { nanoid } from 'nanoid';
import logger from '../../../logger.js';
import { DEFAULT_CONFIG } from '../../../../defaultConfig.js';
import { getDirName } from '../../../../utils.js';

export function up(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings
    (
      id           TEXT PRIMARY KEY,
      create_date  INTEGER NOT NULL,
      user_id      TEXT,
      name         TEXT    NOT NULL,
      value        jsonb   NOT NULL
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_settings_name ON settings (name);
  `);

  // Helper to insert one setting row
  const insertSetting = (name, rawValue) => {
    try {
      const id = nanoid();
      const createDate = Date.now();
      const value = JSON.stringify(rawValue);
      db.prepare(
        `INSERT INTO settings (id, create_date, name, value)
         VALUES (@id, @create_date, @name, @value)`,
      ).run({ id, create_date: createDate, name, value });
    } catch {
      // Ignore duplicate inserts if any (unique by name)
    }
  };

  // Migrate currently existing config.json into settings
  try {
    const configPath = path.resolve(process.cwd(), 'conf', 'config.json');

    // Defaults
    const defaults = {
      interval: '60',
      port: 9998,
      workingHours: { from: '', to: '' },
      demoMode: false,
      analyticsEnabled: true,
    };

    let config = {};
    if (fs.existsSync(configPath)) {
      const file = fs.readFileSync(configPath, 'utf8');
      try {
        config = JSON.parse(file) || {};
      } catch (parseErr) {
        // If parsing fails, still proceed with defaults
        logger.error(parseErr);
        config = {};
      }
    }

    // Insert each known setting, using the value from config when present, otherwise default
    insertSetting('interval', config.interval != null ? config.interval : defaults.interval);
    insertSetting('port', config.port != null ? config.port : defaults.port);
    insertSetting('workingHours', config.workingHours != null ? config.workingHours : defaults.workingHours);
    insertSetting('demoMode', config.demoMode != null ? config.demoMode : defaults.demoMode);
    insertSetting(
      'analyticsEnabled',
      config.analyticsEnabled != null ? config.analyticsEnabled : defaults.analyticsEnabled,
    );

    //now making sure only sqlite path remains in the config
    const sqlitepath = config.sqlitepath || DEFAULT_CONFIG.sqlitepath;
    fs.writeFileSync(`${getDirName()}/../conf/config.json`, JSON.stringify({ sqlitepath }));
  } catch (e) {
    logger.error(e);
  }
}
