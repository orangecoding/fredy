# 🚆 Travel Time & Public Transport

Two flats the same kilometre from your office can be eight minutes and fifty minutes away from it.
Fredy measures the journey instead of the distance.

## Setting it up

Set your addresses under **Settings → Travel time**. Each gets a name and a mode: public transport,
car, or on foot. For public transport you also pick a time of day, since a journey at eight in the
morning is not the journey at midnight. The day is always the next working day, so every listing is
measured against the same timetable.

Besides your own addresses you can add a **place type** (supermarket, bakery, pharmacy, doctor,
nursery, school, gym, park, restaurant, post office, bus stop, train station), and every listing is
measured to the nearest one Fredy can find in OpenStreetMap.

Travel times then show up wherever the distance already did: on listing cards and in the table, in
the map popup, in your notifications, and on the listing detail page.

## Filtering

Both the listings overview and the map have a **"reachable within"** filter. Pick a mode and a
ceiling, for example public transport within 30 minutes, and the list or the map drops everything
above it. Listings Fredy has not measured yet are hidden by the filter.

## Seeing the route

On a listing's detail page, **Show route** draws the journey on the map: the straight line, the
drive, the walk, or the public transport connection leg by leg in the operators' own line colours.
Hovering the public transport time opens the journey itself, one row per leg with the line, the stop
it goes to and how long that part takes.

## Estimated and exact

Fredy reports two kinds of number and always labels which one you are looking at.

**Estimated** comes from the background sweep. Once per address, Fredy asks how long it takes to
reach every stop in the region, then adds the walk from the closest stop to the front door. That is
one request per address no matter how many listings you have, which keeps the load on a
volunteer-run service low. Hover the *Estimated* chip to see the stops it used. Compared against
exact routing across Berlin, it lands within a few minutes.

**Exact** is fetched when you open a listing. Fredy requests the real journey, which also fills in
the car, bike and walking times and the drawable routes, and stores it so it is only requested once.

A mode that could not be routed is left out rather than shown as zero, and a listing that has not
been measured yet says so. The straight-line distance is still shown, so a failed lookup leaves you
no worse off than before.

## Public transport on the map

"Gute Verkehrsanbindung" in a listing tells you nothing. Fredy shows the actual connection, on the
map and on every listing, without a detour to a timetable site.

The map view has a **public transport layer**, switched on by default. It draws the rail, S-Bahn,
U-Bahn, tram and light rail network, colour-coded by mode, and marks every station and bus stop with
its own icon. It works on the standard map and on the satellite view.

Point at a stop and Fredy opens its **departure board**:

- which lines call there, as colored badges
- where each departure is headed
- when it leaves, how many minutes that is from now, and how late it is running

The layer can be turned off with the **ÖPNV** switch in the map panel. The setting lives in the URL,
so a link you bookmark or share keeps it.

The marker popup on the map and the listing detail page both show the **three nearest stops** with
their walking distance. Each opens the same departure board, so "how do I get to work from here" is
answered without leaving the listing.

## For operators

Defaults that normally need no change:

| Setting | Default | What it does |
|---|---|---|
| `motisBaseUrl` | `https://api.transitous.org/api` | Point at your own MOTIS instance if you outgrow the public one. |
| `travelTimeMaxMinutes` | `90` | How far the region-wide lookup reaches, and the main size dial. |
| `travelTimeStreetLookupsPerRun` | `15` | Ceiling on street routings per sweep. `0` turns them off. |
| `travelTimeLimitPerRun` | `500` | Listings one sweep works through. Not a request count. |
| `travelTimeMaxAgeDays` | `30` | When a stored travel time is looked up again. |

The sweep runs every two hours and never at startup. Street routing happens only where public
transport cannot answer at all, where you asked for car or walking, and when you open a listing.
