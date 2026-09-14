# 🛠️ Development

Requirement: **Node.js 22.22.0 or higher** (see `engines` in `package.json`).

## Development mode

``` bash
yarn
yarn run start:backend:dev
yarn run start:frontend:dev
```

Check your terminal to see what port the frontend is running on.

## Tests

``` bash
yarn run test                    # "online": runs against the actual providers
yarn run test:offline            # "offline": runs against test fixtures, much faster
yarn run test:download-fixtures  # refresh fixtures after a provider changed its code
```

The offline suite uses fixtures instead of live providers and is good enough to test the core
functionality.

## Adding a new language

Fredy's UI is fully multilingual. Translation files live in `ui/src/locales/`. To add a new
language, create a single JSON file there, no code changes required.

**Example: `ui/src/locales/fr.json`**

```json
{
  "_meta": {
    "flag": "🇫🇷",
    "name": "Français",
    "locale": "fr-FR",
    "semiLocale": "fr"
  },
  "nav.dashboard": "Tableau de bord",
  "common.save": "Enregistrer"
}
```

The `_meta` fields:

| Field | Description |
|---|---|
| `flag` | Unicode flag emoji shown in the language selector |
| `name` | Display name shown in the language selector |
| `locale` | BCP 47 locale string used for date and number formatting (e.g. `fr-FR`) |
| `semiLocale` | Semi UI locale key for component-level strings (date pickers, pagination, etc.) |

> **Important:** `semiLocale` must exactly match a locale filename from the Semi UI locale sources
> (without the `.js` extension). See the
> [available Semi UI locales on GitHub](https://github.com/DouyinFE/semi-design/tree/main/packages/semi-ui/locale/source)
> for the full list.

After adding the file, rebuild the frontend (`yarn build:frontend` or restart the dev server) and the
new language appears automatically in **Settings → Preferences → Language**.

## Writing a provider or a notification adapter

See [CONTRIBUTING.md](../CONTRIBUTING.md).
