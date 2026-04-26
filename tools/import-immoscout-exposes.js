/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

#!/usr/bin/env node

/*
 * Import ImmoScout24 expose JSON files into Fredy database
 *
 * Usage:
 *   node tools/import-immoscout-exposes.js <job-id> [expose-file-or-directory]
 *
 * Examples:
 *   node tools/import-immoscout-exposes.js my-job-id immoscout24_exposes/expose-166733695.json
 *   node tools/import-immoscout-exposes.js my-job-id immoscout24_exposes/
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { join, resolve } from 'path';
import { createHash } from 'crypto';
import { nanoid } from 'nanoid';
import SqliteConnection from '../lib/services/storage/SqliteConnection.js';

/**
 * Build a sha256 hash string from the provided inputs (like utils.js buildHash)
 */
function buildHash(...inputs) {
  if (inputs == null) {
    return null;
  }
  const cleaned = inputs.filter((i) => i != null && i.length > 0 && i !== 'null');
  if (cleaned.length === 0) {
    return null;
  }
  return createHash('sha256').update(cleaned.join(',')).digest('hex');
}

/**
 * Extract listing data from ImmoScout24 expose JSON
 */
function extractListingFromExpose(exposeData) {
  const sections = exposeData.sections || [];

  // Extract ID from header
  const id = exposeData.header?.id;
  if (!id) {
    throw new Error('No ID found in expose header');
  }

  // Extract title
  const titleSection = sections.find((s) => s.type === 'TITLE');
  const title = titleSection?.title || null;

  // Extract address and coordinates from MAP section
  const mapSection = sections.find((s) => s.type === 'MAP');
  let address = null;
  let latitude = null;
  let longitude = null;

  if (mapSection) {
    const addressLine1 = mapSection.addressLine1 || '';
    const addressLine2 = mapSection.addressLine2 || '';
    address = [addressLine1, addressLine2].filter(Boolean).join(', ');
    latitude = mapSection.location?.lat || null;
    longitude = mapSection.location?.lng || null;
  }

  // Extract price and size from TOP_ATTRIBUTES section (primary source)
  let price = null;
  let size = null;

  const topAttributesSection = sections.find((s) => s.type === 'TOP_ATTRIBUTES');

  if (topAttributesSection?.attributes) {
    for (const attr of topAttributesSection.attributes) {
      // Find Kaufpreis (purchase price)
      if (attr.label?.includes('Kaufpreis') && attr.text) {
        price = extractNumber(attr.text);
      }
      // Find Wohnfläche (living space)
      if (attr.label?.includes('Wohnfläche') && attr.text) {
        size = extractNumber(attr.text);
      }
    }
  }

  // Fallback to ATTRIBUTE_LIST with title "Hauptkriterien" if TOP_ATTRIBUTES didn't have the data
  if (price === null || size === null) {
    const mainAttributesSection = sections.find((s) => s.type === 'ATTRIBUTE_LIST' && s.title === 'Hauptkriterien');

    if (mainAttributesSection?.attributes) {
      for (const attr of mainAttributesSection.attributes) {
        // Find Kaufpreis (purchase price)
        if (price === null && attr.label?.includes('Kaufpreis') && attr.text) {
          price = extractNumber(attr.text);
        }
        // Find Wohnfläche or Wohnraum (living space)
        if (size === null && (attr.label?.includes('Wohnfläche') || attr.label?.includes('Wohnraum')) && attr.text) {
          size = extractNumber(attr.text);
        }
      }
    }
  }

  // Extract first image from MEDIA section
  let imageUrl = null;
  const mediaSection = sections.find((s) => s.type === 'MEDIA');
  if (mediaSection?.media && mediaSection.media.length > 0) {
    const firstImage = mediaSection.media.find((m) => m.type === 'PICTURE');
    imageUrl = firstImage?.fullImageUrl || firstImage?.previewImageUrl || null;
  }

  // Extract description from TEXT_AREA sections
  const descriptionSections = sections.filter((s) => s.type === 'TEXT_AREA');
  const descriptionParts = descriptionSections.map((s) => s.text).filter(Boolean);
  const description = descriptionParts.join('\n\n') || null;

  // Construct link
  const link = `https://www.immobilienscout24.de/expose/${id}`;

  // Generate hash like the immoscout provider does: buildHash(id, price)
  const hash = buildHash(id, price != null ? price.toString() : null);

  return {
    id,
    hash,
    title,
    price,
    size,
    address,
    latitude,
    longitude,
    imageUrl,
    description,
    link,
  };
}

/**
 * Extract first number from a string like "375.000 €" or "58 m²"
 */
function extractNumber(str) {
  if (!str) return null;
  const cleaned = str.replace(/\./g, '').replace(',', '.');
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

/**
 * Insert listing into database
 */
function insertListing(jobId, listingData) {
  const params = {
    id: nanoid(),
    hash: listingData.hash,
    provider: 'immoscout',
    job_id: jobId,
    price: listingData.price,
    size: listingData.size,
    title: listingData.title,
    image_url: listingData.imageUrl,
    description: listingData.description,
    address: listingData.address,
    link: listingData.link,
    created_at: Date.now(),
    is_active: 1, // Assume active by default
    latitude: listingData.latitude,
    longitude: listingData.longitude,
  };

  const result = SqliteConnection.execute(
    `INSERT INTO listings (id, hash, provider, job_id, price, size, title, image_url, description, address,
                           link, created_at, is_active, latitude, longitude)
     VALUES (@id, @hash, @provider, @job_id, @price, @size, @title, @image_url, @description, @address, @link,
             @created_at, @is_active, @latitude, @longitude)
     ON CONFLICT(job_id, hash) DO NOTHING`,
    params,
  );

  return result.changes > 0;
}

/**
 * Process a single JSON file
 */
function processFile(filePath, jobId) {
  try {
    console.warn(`Processing: ${filePath}`);
    const content = readFileSync(filePath, 'utf-8');
    const exposeData = JSON.parse(content);

    const listingData = extractListingFromExpose(exposeData);
    const inserted = insertListing(jobId, listingData);

    if (inserted) {
      console.warn(`✓ Imported listing ${listingData.id}: ${listingData.title}`);
      console.warn(`  Hash: ${listingData.hash}, Price: ${listingData.price}, Size: ${listingData.size}`);
    } else {
      console.warn(`⊘ Skipped listing ${listingData.id} (already exists)`);
    }

    return { success: true, inserted };
  } catch (error) {
    console.error(`✗ Error processing ${filePath}:`, error.message);
    return { success: false, inserted: false };
  }
}

/**
 * Main function
 */
function main() {
  const args = process.argv.slice(2);

  if (args.length < 1) {
    console.error('Usage: node tools/import-immoscout-exposes.js <job-id> [expose-file-or-directory]');
    console.error('');
    console.error('Examples:');
    console.error('  node tools/import-immoscout-exposes.js my-job-id immoscout24_exposes/expose-166733695.json');
    console.error('  node tools/import-immoscout-exposes.js my-job-id immoscout24_exposes/');
    process.exit(1);
  }

  const jobId = args[0];
  const targetPath = args[1] || 'immoscout24_exposes/';
  const resolvedPath = resolve(targetPath);

  console.warn(`Job ID: ${jobId}`);
  console.warn(`Target: ${resolvedPath}\n`);

  // Collect files to process
  let filesToProcess = [];

  try {
    const stats = statSync(resolvedPath);

    if (stats.isDirectory()) {
      const files = readdirSync(resolvedPath);
      filesToProcess = files.filter((f) => f.endsWith('.json')).map((f) => join(resolvedPath, f));
    } else if (stats.isFile() && resolvedPath.endsWith('.json')) {
      filesToProcess = [resolvedPath];
    } else {
      console.error('Error: Target must be a JSON file or directory');
      process.exit(1);
    }
  } catch (error) {
    console.error(`Error accessing ${resolvedPath}:`, error.message);
    process.exit(1);
  }

  if (filesToProcess.length === 0) {
    console.warn('No JSON files found to process.');
    process.exit(0);
  }

  console.warn(`Found ${filesToProcess.length} file(s) to process\n`);

  // Process files
  let totalProcessed = 0;
  let totalInserted = 0;
  let totalFailed = 0;

  for (const file of filesToProcess) {
    const result = processFile(file, jobId);
    totalProcessed++;
    if (result.success && result.inserted) {
      totalInserted++;
    } else if (!result.success) {
      totalFailed++;
    }
  }

  // Summary
  console.warn('\n' + '='.repeat(50));
  console.warn('Summary:');
  console.warn(`  Total files processed: ${totalProcessed}`);
  console.warn(`  Successfully imported:  ${totalInserted}`);
  console.warn(`  Skipped (duplicates):   ${totalProcessed - totalInserted - totalFailed}`);
  console.warn(`  Failed:                 ${totalFailed}`);
  console.warn('='.repeat(50));
}

main();
