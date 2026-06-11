### SQLite Adapter

> ⚠️ **Breaking change (security fix):** The database path (`dbPath`) is now validated to prevent path traversal attacks. **Absolute paths** and paths that resolve outside the application directory (e.g., using `../`) **are no longer accepted**. If your existing configuration uses an absolute path like `/data/fredy/listings.db`, you will need to update it to a relative path such as `db/listings.db`. The adapter will log a warning with instructions if your current path is rejected.

This adapter stores search results in an SQLite database. By default, the database is located at `db/listings.db`, but you can configure a custom location within the application directory. The file can be used for analysis later.

#### Path requirements

- Must be a **relative** path (no leading `/`)
- Must stay **within** the application directory (no `../` escaping)
- Must end with **`.db`**

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
