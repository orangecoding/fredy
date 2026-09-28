### SQLite Adapter

This adapter stores search results in an SQLite database. By default, the database is located at `db/listings.db`, but you can configure a custom location. The file can be used for analysis later.

The table contains the following columns (all stored as `TEXT`):

```json
[
  "serviceName",
  "jobKey",
  "id",
  "size",
  "rooms",
  "price",
  "address",
  "title",
  "link",
  "description",
  "image"
]
```

### Price changes

When price tracking is enabled (Settings > Price tracking, off by default), price changes are appended to a separate `price_change` table in the same database file, with columns `serviceName, jobKey, id, title, address, link, oldPrice, newPrice, changePercent, direction, observedAt`. The `listing` table is left alone, so a query that reads it for new listings does not have to learn to exclude anything.
