# Upgrading from v1.x to v2.0.0

Fredy 2.0.0 introduced the concept of multiple jobs running within an instance of Fredy. For this to work, I had to change the config and the storage format.

### How to update?
##### Store
It's best to clear the store completely and let Fredy rewrite it. Be careful to disable all notification adapter the first time you run Fredy 2, as it will obviously treat
everything as new.

##### Config
The config format has changed. It now supports multiple jobs. It is probably easiest to simply copy the `config.example` from `/conf` and enter your urls in there.
The new format basically wraps the config in chunks.

```json
 "jobs": {
    "yourSearchJob": {
    ...
```
