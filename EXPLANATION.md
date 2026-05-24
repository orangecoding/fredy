# Bug Explanation & Resolution: Missing Notifications & Soft-Delete Failures

This document explains the root cause and the resolution for the bug where newly scraped listings were stored in the database but logged as "no new listings found," remained visible in the web UI, and never triggered Telegram notifications.

---

## 1. Symptoms & Observations

During execution, the following sequence was logged:
```
[2026-05-22 06:07:12] DEBUG: Checking 2 listings for new entries (Provider: 'immoscout')
[2026-05-22 06:07:13] DEBUG: Storing 2 new listings (Provider: 'immoscout')
[2026-05-22 06:07:13] DEBUG: No new listings found (Provider: 'immoscout')
```
* **Issue A**: Why did the pipeline log `Storing 2 new listings` but immediately follow with `No new listings found`?
* **Issue B**: Why did these listings still appear in the Web UI, even though no Telegram notification was dispatched?

---

## 2. The Root Cause

The issue was caused by a mismatch between in-memory listing IDs and the database primary key format.

### Mismatch details:
1. **Pipeline Execution Flow** (`FredyPipelineExecutioner.js`):
   * `_findNew`: Identifies 2 listings not currently in the database.
   * `_save`: Calls `storeListings(...)` to write them to SQLite.
   * **Filters**: Runs the listings through spatial, specification (price, size, rooms), and similarity filters. If a listing is filtered out, it is soft-deleted in the database using `deleteListingsById(ids)` and removed from the active in-memory array.
   * `_notify`: Dispatches notifications. If the active array is empty, it throws a `NoNewListingsWarning` (leading to the `No new listings found` log).

2. **The ID Bug** (`listingsStorage.js`):
   * Inside `storeListings`, Fredy generates a new random `nanoid()` as the database primary key `id`, while storing the crawler's original ID (e.g. `12345678`) in the `hash` column.
   * However, the pipeline's memory array **still retained the crawler's ID** in `item.id`.
   * When filters aussortiert (filtered out) the listings, they called `deleteListingsById` with the crawler IDs.
   * The database delete query looks up rows by the `id` column:
     ```sql
     UPDATE listings SET manually_deleted = 1 WHERE id IN ('12345678')
     ```
   * Since `id` contains the `nanoid()` rather than `12345678`, the update statement modified **0 rows**.
   * Consequently, the listings were **never marked as deleted** in SQLite, so they continued to show up in the UI. But because they were filtered out of the in-memory array, **no Telegram notifications were sent**.

### Collateral Bugs:
This same ID mismatch also silently broke:
* **Distance calculations**: `updateListingDistance` tried to update distance by `id` using the crawler ID, failing to save distances.
* **Notification links**: "Open in Fredy" notification URLs were built with the crawler ID (`/listings/listing/12345678`), resulting in `404 Listing not found` when clicked, since the router queries by the `nanoid()`.

---

## 3. The Solution

The issue has been resolved by mapping the database primary key back onto the in-memory listing object immediately upon insertion.

In `lib/services/storage/listingsStorage.js` (`storeListings` function):
```javascript
for (const item of listings) {
  const dbId = nanoid();
  const params = {
    id: dbId,
    hash: item.id,
    // ...
  };
  stmt.run(params);
  
  // FIX: Update the memory reference so that subsequent 
  // pipeline steps use the correct database primary key.
  item.id = dbId;
}
```

### Results of the fix:
* **Correct DB Soft-Deletes**: Aussortierte (filtered out) listings are now correctly soft-deleted (`manually_deleted = 1`) and will no longer show up in the UI.
* **Working Telegram Links**: Successful listings that pass the filters will trigger Telegram notifications with fully functional, working "Open in Fredy" links.
* **Working Distance Updates**: Distance to destination calculations are now correctly persisted in the database.

---

## 4. Geocoding Failure Fallback (-1, -1 Coordinates)

### Symptoms:
Listings whose addresses could not be resolved by Nominatim (the geocoding API) were stored with placeholder coordinates of `latitude: -1` and `longitude: -1`. 
* **The bug**: Because `-1` is a valid numerical coordinate, the spatial/area filter (`_filterByArea`) attempted to check whether the point `[-1, -1]` fell within the user's geofenced area.
* **The outcome**: The coordinate `[-1, -1]` is located in the Gulf of Guinea (off the coast of West Africa), far outside any German geofence. The area filter would therefore incorrectly identify the listing as "outside the area", soft-delete it from the database, and drop it from the array, causing it to be aussortiert (filtered out).

### The Solution:
We refined the `_geocode` method in `lib/FredyPipelineExecutioner.js` to only assign coordinates to the listing if the geocoding client returned valid, non-placeholder coordinates (not `-1`). If geocoding fails, `latitude` and `longitude` are left as `null` or `undefined`. 

```javascript
async _geocode(newListings) {
  for (const listing of newListings) {
    if (listing.address) {
      const coords = await geocodeAddress(listing.address);
      if (coords && coords.lat !== -1 && coords.lng !== -1) {
        listing.latitude = coords.lat;
        listing.longitude = coords.lng;
      }
    }
  }
  return newListings;
}
```

Since the area filter (`_filterByArea`) is designed to skip filtering and **keep** listings that do not have any coordinates (falling back to manual inspection), these listings are now correctly kept in the pipeline, sent via Telegram, and displayed in the UI, while SQLite stores them as standard `NULL` values instead of the magic `-1` placeholder.

