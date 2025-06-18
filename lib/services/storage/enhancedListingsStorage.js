import { JSONFileSync } from 'lowdb/node';
import { getDirName } from '../../utils/utils.js';
import path from 'path';
import LowdashAdapter from './LowDashAdapter.js';
import fs from 'fs';
import _ from 'lodash';
import { nanoid } from 'nanoid';
import * as jobStorage from './jobStorage.js';
import logger from '../../utils/logger.js';

const DB_DIR = path.join(getDirName(), '../', 'db/enhanced-listings');

// Ensure directory exists
if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

const getDbForJob = (jobId) => {
  const file = path.join(DB_DIR, `${jobId}.json`);
  const adapter = new JSONFileSync(file);
  const db = new LowdashAdapter(adapter);
  db.read();
  return db;
};

export const init = (jobId) => {
  const db = getDbForJob(jobId);
  const enhancedListings = db.chain.get('enhancedListings').value();
  const schema = db.chain.get('schema').value();
  if (enhancedListings === undefined) {
    db.chain.set('enhancedListings', {}).value();
  }
  if (schema === undefined) {
    const job = jobStorage.getJob(jobId);
    db.chain.set('schema', generateSchemaFromJobConfig(job)).value();
  }
  db.write();
};

// Basic fields always present in a listing
const basicFields = [
  { id: 'id', display_name: 'ID', type: 'basic', visible: true },
  { id: 'title', display_name: 'Title', type: 'basic', visible: true },
  { id: 'price', display_name: 'Price', type: 'basic', visible: true },
  { id: 'size', display_name: 'Size', type: 'basic', visible: true },
  { id: 'link', display_name: 'Link', type: 'basic', visible: true },
  { id: 'date_found', display_name: 'Date Found', type: 'basic', visible: true },
  { id: 'details', display_name: 'Details', type: 'basic', visible: true },
];

// Export basic fields for use in other modules
export { basicFields };

// Helper: ensure all basic fields exist in a listing
export function ensureBasicFields(listing) {
  const result = { ...listing };
  basicFields.forEach(field => {
    if (!(field.id in result)) {
      logger.debug(`[enhancedListingsStorage] Adding missing basic field '${field.id}' to listing ${listing.id || 'unknown'}`);
      result[field.id] = '';
    }
  });
  return result;
}

// Helper: check if a listing fits the schema (all required keys present)
function validateWithSchema(listing, schema) {
  return schema.every(col => Object.prototype.hasOwnProperty.call(listing, col.id));
}

export const addListings = (jobId, listings) => {
  const db = getDbForJob(jobId);
  const currentListings = db.chain.get('enhancedListings').value() || {};
  const schema = getSchema(jobId);
  const newListings = {};

  // Accept both array and object input for listings
  const listingsArr = Array.isArray(listings) ? listings : Object.values(listings);

  // Validate each new listing
  listingsArr.forEach(l => {
    if (!validateWithSchema(l, schema)) {
      throw new Error(`Listing does not fit schema. Missing keys: ${schema.filter(col => !(col.id in l)).map(col => col.id).join(', ')}`);
    } else {
      if (currentListings[l.id]) {
        logger.info(`[enhancedListingsStorage] Overwriting existing listing with id: ${l.id}, old content: ${JSON.stringify(currentListings[l.id])}`);
      }
      newListings[l.id] = l;
    }
  });
  db.read();
  db.chain.set('enhancedListings', { ...currentListings, ...newListings }).value();
  db.write();
};

export const getListings = (jobId) => {
  const db = getDbForJob(jobId);
  const obj = db.chain.get('enhancedListings').value() || {};
  return Object.values(obj);
};

export const getListingByUrl = (jobId, url) => {
  const db = getDbForJob(jobId);
  const obj = db.chain.get('enhancedListings').value() || {};
  return Object.values(obj).find(l => l.url === url) || null;
};

export const deleteAllListings = (jobId) => {
  const db = getDbForJob(jobId);
  db.chain.set('enhancedListings', {}).value();
  db.write();
};

export const deleteJobFile = (jobId) => {
  const file = path.join(DB_DIR, `${jobId}.json`);
  if (fs.existsSync(file)) {
    fs.unlinkSync(file);
  }
};

export const getSchema = (jobId) => {
  const db = getDbForJob(jobId);
  return db.chain.get('schema').value() || [];
};

export const setSchema = (jobId, schema) => {
  const db = getDbForJob(jobId);
  db.chain.set('schema', schema).value();
  db.write();
};

export const addOrUpdateColumns = (jobId, addedColumns = []) => {
  const db = getDbForJob(jobId);
  let schema = getSchema(jobId);
  // For each added column, update or add with defaults
  addedColumns.forEach(col => {
    // Find by id
    let idx = col.id ? schema.findIndex(s => s.id === col.id) : -1;
    const newCol = {
      id: col.id || nanoid(),
      display_name: col.display_name || col.id || '',
      type: col.type || 'basic',
      visible: typeof col.visible === 'boolean' ? col.visible : true
    };
    if (idx !== -1) {
      // Update all properties for existing column
      schema[idx] = { ...schema[idx], ...newCol };
    } else {
      schema.push(newCol);
    }
  });
  setSchema(jobId, schema);
  // Backfill all listings to add the new columns with default values
  let listingsObj = db.chain.get('enhancedListings').value() || {};
  let updatedObj = {};
  Object.values(listingsObj).forEach(listing => {
    const updated = { ...listing };
    addedColumns.forEach(col => {
      const colId = col.id || '';
      if (colId && !(colId in updated)) {
        updated[colId] = '';
      }
    });
    updatedObj[updated.id] = updated;
  });
  db.read();
  db.chain.set('enhancedListings', updatedObj).value();
  db.write();
};

export const deleteColumns = (jobId, deletedColumnIds = []) => {
  const db = getDbForJob(jobId);
  let schema = getSchema(jobId);
  // Only delete columns whose ids exist in the schema
  const schemaIds = new Set(schema.map(col => col.id));
  const idsToDelete = deletedColumnIds.filter(id => schemaIds.has(id));
  // Remove columns from schema by id
  schema = schema.filter(col => !idsToDelete.includes(col.id));
  setSchema(jobId, schema);
  // Remove columns from all listings by id
  let listingsObj = db.chain.get('enhancedListings').value() || {};
  let updatedObj = {};
  Object.values(listingsObj).forEach(listing => {
    const updated = { ...listing };
    idsToDelete.forEach(id => {
      delete updated[id];
    });
    updatedObj[updated.id] = updated;
  });
  db.read();
  db.chain.set('enhancedListings', updatedObj).value();
  db.write();
};

// generate waypoint columns for multiple waypoints
export function transformWaypointsToColumns(waypoints, visible = true) {
  const transportModeLabels = {
    'transit': 'Public Transport',
    'driving': 'Car',
    'walking': 'Walking',
    'bicycling': 'Cycling'
  };

  if (!waypoints || !Array.isArray(waypoints)) {
    return [];
  }

  return waypoints.flatMap(wp => {
    const transportLabel = transportModeLabels[wp.transportMode] || wp.transportMode;
    // Ensure waypoint ID is a string for consistency
    const waypointId = String(wp.id);
    return [
      {
        id: `travelTime_${waypointId}`,
        display_name: `Travel time to ${wp.name} (${transportLabel})`,
        type: 'waypoint',
        visible: visible
      },
      {
        id: `travelDistance_${waypointId}`,
        display_name: `Distance to ${wp.name} (${transportLabel})`,
        type: 'waypoint',
        visible: visible
      }
    ];
  });
}

// Helper: generate schema from job config (customFields, waypoints, and basic fields)
export function generateSchemaFromJobConfig(job, writeToDb = false) {
  // Custom fields from job config
  const customFieldColumns = (job.customFields?.length ? job.customFields : []).map(f => ({
    id: f.id || nanoid() || f.name,
    display_name: f.name,
    type: 'custom',
    visible: true
  }));
  // Waypoint columns from job config using the new function
  const waypointColumns = transformWaypointsToColumns(job.waypoints);
  const schema = [...basicFields, ...customFieldColumns, ...waypointColumns];
  if (writeToDb && job.id) {
    setSchema(job.id, schema);
  }
  return schema;
} 