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
