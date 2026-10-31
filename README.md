# SAR planning
CloudTAK plugin for search and rescue planning in New Zealand. Pick an Initial Planning Point (IPP), then choose one of two analysis modes. **Travel Time** draws nested contours that show how far a person could travel in each time band over New Zealand terrain, land cover, trails, roads and power-line corridors. **TARR Analysis** draws Terrain-Aware Range Rings from a Lost Person Behavior subject profile. The results become ordinary CloudTAK map features that you can select, edit, add to a Data Sync, put in a data package or download as KML and GeoJSON.

## What it does
* A **SAR planning** entry in the right-side menu opens a pane in the side menu, the same way the Rubber Sheet plugin does. On a phone the host shows it as a full-screen menu. The features stay on the map when the pane closes.
* **Mode.** A radio group chooses **Travel Time** or **TARR Analysis**. Each has a one-line description and a "What's Travel Time?" or "What's a TARR?" explainer under the selector, written for New Zealand data (LCDB land cover, OpenStreetMap trails, roads and waterways). TARR is greyed out with the text "Not available on this server" when the relay does not list it.
* **Start point.** Choose one of three ways: **Pick on map** (the cursor becomes a crosshair, a banner says "Tap the map to set the start point", one click sets it, Cancel or Escape stops), **Choose a marker** (a filterable list of the point markers on your map, first 100 by name), or type the latitude and longitude. The start point is previewed as a dot as soon as it is valid. On a phone the pane closes while you pick and opens again after the click.
* **Travel Time settings.**
  * **Speed** in km/h (default 2.5) with four presets: 0.8 km/h Impaired, 1.6 km/h Slow, 3.2 km/h Moderate and 5.0 km/h Fit hiker (0.5, 1, 2 and 3.1 mph). There is no mph toggle. The hint says the speed is the assumed speed on flat, unobstructed ground and that the model adjusts for slope, land cover and trails.
  * **Time bands** as chips (default 1, 2, 4 and 8 h). Add a band with the field and **Add band**, or with the quick-add buttons **Add 6 h**, **Add 10 h** and **Add 12 h**. Remove one with the x on its chip. One to eight bands, each 0.25 to 24 h. Duplicates collapse and the chips stay in time order.
  * **Radius** in km (optional, default 10). Larger radii take longer. In cities, large radii are slow.
* **TARR settings.** Choose a **Subject profile** (28 profiles from the Koester tables). **Ecoregion** and **Terrain** selects appear when the profile has rows for them; "Other / default" uses the profile's general row. The pane shows the Koester 25%, 50% and 75% distances for the choice and the source. There is no radius or speed: the engine works out the analysis area.
* **Run** is disabled until the start point and the mode's inputs are set (a speed for Travel Time, a profile for TARR), and a hint says what is missing. While it runs the inputs are disabled and the pane shows the elapsed seconds and **Cancel**. A calculation can take up to a minute, especially the first one after a quiet period. A response that arrives after Cancel is ignored.
* **Result.** The pane lists each band or ring with a colour swatch and its name, the warnings (prefixed **Warning:** or **Note:**), the engine's disclaimer, the data attribution and the date of the roads and trails data. The map fits the result, leaving room for the open pane.
* **Clear** removes the features, the preview dot and the start point. Mode, speed, bands, radius and the profile choice are kept; they are stored in the browser (`taknz-sar:v1`). The start point is never stored.

## Reading the contours
### Travel Time
The contours are travel time: they show how far a person walking at the chosen speed could get in each time band, given the terrain, land cover, trails, roads and power-line corridors around the start point. They do not say where a person is. A smaller contour is not a better place to search.
* The method comes from the WiSAR project and has not been calibrated for New Zealand. The engine sends a disclaimer with every result and the pane shows it word for word next to the result.
* The contours are the largest contiguous area reached in each band. A band can have no contour; the pane then lists a note.
* Colour is not the only signal: every band is also written out as text, in the list and in the feature name.

### TARR Analysis
A Terrain-Aware Range Ring (TARR) starts from a Lost Person Behavior distance for the subject profile (Koester, 2008, via Ferguson, 2013). It bends the ring around terrain, land cover and trails, so it stretches along easy ground and pulls in against steep or dense ground. This is a distance-based mode, not an incident statistics mode.
* **The numbers are not New Zealand numbers.** The distances come from United States search records. Before the terrain model runs, the engine scales them by a multiplier fitted to search records from Coconino County, Arizona (for example 1.15 for Hikers, 1.40 for a profile without its own value). Neither the distances nor the multipliers are calibrated for New Zealand. The ring percentages are not the chance of finding someone in New Zealand.
* The pane and every feature say so: the notice before the run, the multiplier used and its region in the result, and the remarks of each ring.
* **Each terrain ring has a plain circle next to it.** The solid, filled ring is terrain-adjusted. The dashed circle with no fill is the plain Koester distance, without terrain and without multiplier, so you can see how far the terrain moved the ring.
* Rings are named by source, percentage, kind and distance, for example `Koester 50%, terrain-adjusted (2.036 km)` and `Koester 50%, plain circle (1.77 km)`. The distance of a terrain ring is the calibrated one that was used.
* A terrain ring can be missing (too small to leave the start cell, or blocked by water). The plain circle is still drawn and the pane lists a note.
* The analysis radius is the calibrated 75% distance plus 2 km, at most 30 km. The pane tells you when a ring is clipped.
* The multiplier set can be changed by the operator of the engine without a code change; the result always reports the set that was used.

## Limits
| Input | Limit |
|---|---|
| Latitude | -48 to -33.5 |
| Longitude | 165.5 to 179.5 |
| Start point | On land. A point in the sea or a lake is refused |
| Travel Time: speed | 0.1 to 10 km/h |
| Travel Time: time bands | 1 to 8, each 0.25 to 24 h |
| Travel Time: radius | Optional, 1 to 30 km. Default 10 |
| TARR: subject profile | One of the 28 Koester profiles |
| TARR: ecoregion, terrain | Only the values the table has for the profile (Temperate, Dry, Urban; Mountainous, Flat) |
| TARR: analysis radius | The calibrated 75% distance plus 2 km, clipped at 30 km. Not an input |
| Request size | At most 8 KB |

For Travel Time the engine uses the larger of the radius you enter and the speed times the longest band plus 2 km, clipped at 30 km, and tells you with a warning when it clips. The pane shows the effective radius from the response.

Timing guide: a bush area with a 10 km radius usually takes a few seconds. Large city areas with a large radius take much longer, up to most of a minute. The first request after a quiet period is slower. TARR takes about as long as Travel Time. The relay waits up to 70 seconds for the engine.

### Dense areas
In dense city areas the engine can refuse a calculation instead of running until it times out. The pane then shows the engine's message word for word.
* **Travel Time.** Depending on what the engine suggests, the pane also offers **Try {n} km**, when the engine suggests a smaller radius (it fills the radius field), and **Set longest band to {h} h**, when the engine suggests a shorter longest band. That button makes the value the longest band: the largest chip becomes that value and any chip above it is removed. If the engine suggested a radius as well, it sets both. The buttons only edit the inputs. Nothing is sent until you press **Run**. The plugin never makes up a suggestion: a number that is not finite, or outside the plugin's own limits (radius 1 to 30 km, band 0.25 to 24 h), is ignored and never rounded into range.
* **TARR.** There is no radius or band to change, so there are no buttons. The message tells you to move the start point or choose a profile with a shorter search distance.
* Other refusals, such as a start point in the sea, show their message and no button.

## Map features and exports
A result is added to the map as CloudTAK features, filed under the folder `/SAR/`, expiring after 24 hours:
* **One polygon per band or ring** (CoT type `u-d-f`, a drawn shape), with the band or ring colour, a 15 % fill (none for the plain TARR circles, which are dashed) and remarks that give the parameters (speed and bands, or subject profile, Koester distance, multiplier and calibrated distance), the start point, the run time in UTC, the reach or not-calibrated statement and the engine's disclaimer. Travel Time features are named `SAR 2 h`; TARR features as described above.
* **The start point as a point** (CoT type `u-d-p`, a plain marker, yellow) with the callsign `SAR IPP` and remarks that give the mode, the speed and bands or the subject profile, and the time of the run.
* They are real features: select them, edit them, change their style or delete them like any other. While no result exists the start point is only a dot on the map; once a result exists the `SAR IPP` feature replaces the dot, so there are no duplicates. **Run** again replaces the previous result's features. **Clear** removes the features and the dot. Disabling the plugin leaves the features on the map.
* A MultiPolygon contour becomes one feature per part (`SAR 2 h`, `SAR 2 h (2)` and so on).

After a result the pane offers three actions. They use the features as they are on the map, so edits are included.
* **Add to Data Sync** lists the Data Syncs you are subscribed to and can write to, the same list as the CloudTAK Share dialog. It files a copy of the features (new ids) in each Data Sync you choose, which pushes them to the TAK Server. The originals leave your map, as with the CloudTAK Share dialog. Adding to another Data Sync afterwards rebuilds the features from the result.
* **Create data package** asks CloudTAK's server to build a TAK data package from the features. It is private to you and downloads as a zip of CoT files. You can also file it in Data Syncs. The package list in CloudTAK shows only shared packages, so a private one is downloaded, not listed.
* **Download KML and GeoJSON** builds a zip in the browser with a KML, a GeoJSON and a README with the parameters, disclaimer and attribution. Nothing is uploaded. The KML has a style per colour, one Placemark per feature, inner rings, and the start point as a Point.

Holes: the server writes polygons without inner rings, so a ring with a hole loses the hole in a Data Sync and in a data package. The map features, the KML and the GeoJSON keep it.

## Troubleshooting
| Message | What to do |
|---|---|
| The engine's own message, for example about a dense area or the sea | Follow the message. Move the start point, use a smaller radius or a shorter longest band, then press Run |
| The calculation took too long. Try a smaller radius. | Press **Retry**, or lower the radius. The first request after a quiet period can be slow |
| Too many requests. Try again in {n} seconds. | The server limits each user (default 6 calculations a minute, both modes together). Wait, then press **Retry** |
| SAR planning is unavailable. Contact your administrator. | The relay is switched off, misconfigured or cannot reach the engine. For TARR it also appears when the engine is older than the relay and does not know the TARR route |
| The values were not accepted. Check the start point and the settings. | The server refused the request. For TARR the profile may not be in the engine's table; choose another |
| Analysis failed. Try again, or try a smaller area. | Press **Retry**, or use a smaller area. For TARR it can also mean the multiplier set of the engine is misconfigured |
| Could not reach the server. Check your connection and try again. | Check the connection, then **Retry** |
| Could not add to "{name}": ... ({n} of {m} done) | The Data Sync did not take the features, for example because you are no longer subscribed. The features stay on your map |

If the menu entry is missing, the relay is switched off or unreachable, and the plugin adds nothing to the app.

## Data and attribution
The pane shows the attribution list and the disclaimer from the engine next to the result, and the exports carry them too (the KML description, the GeoJSON and the README). Nothing is added to the map's attribution control. The data are:
* Land cover: LCDB v6.0, Landcare Research, CC BY 4.0
* Elevation: LINZ NZ Elevation, CC BY 4.0, with Copernicus GLO-30
* Roads and trails: OpenStreetMap contributors, ODbL, https://www.openstreetmap.org/copyright
* Method: WiSAR, AGPL-3.0
* TARR only: subject distances from Koester (2008), Lost Person Behavior, via Ferguson (2013), IGT4SAR; multipliers from WiSAR, Coconino County, Arizona (not calibrated for New Zealand)

See [NOTICE](NOTICE).

## Honesty statement
This is a planning aid. Travel Time shows reach, not where a person is. TARR rings are not calibrated for New Zealand: the distances and the multipliers come from United States records, the terrain model has not been checked against New Zealand search and rescue data, and the percentages are not the chance of finding someone in New Zealand. Use the results as one input among many, with the judgment of search planners and incident command.

## Screenshots
Screenshots are to be added. They need a running CloudTAK and a browser, which were not available when this version was written.

## Requirements
The [TAK-NZ CloudTAK fork](https://github.com/TAK-NZ/CloudTAK), which provides:
* `/api/sar/status`, `/api/sar/travel-time` and `/api/sar/tarr`. If the endpoint is missing or switched off, the plugin adds nothing to the app. The status route lists the modes the relay can route (`modes`); a relay without that list is treated as Travel Time only. The server holds the engine key and relays the request; the key never reaches the browser. TARR also needs a SAR engine that has the `/tarr` route.
* `PluginAPI.feature.add` and `PluginAPI.feature.remove`, a small addition of the fork to `app/plugin.ts` (the upstream plugin API can only read features). The plugin uses them to put the result on the map and to file copies in a Data Sync.

Set these environment variables on the CloudTAK API task:

| Variable | Meaning |
|---|---|
| `SAR_SERVICE_URL` | HTTPS base URL of the SAR engine, for example `https://utils.example.com/sar` |
| `SAR_SERVICE_KEY` | The engine client key. It never reaches the browser |
| `SAR_RATE_LIMIT` | Optional. Calculations per user per minute, 1 to 60, default 6. Both modes count |

The plugin imports a few files of the CloudTAK app by relative path, as the Rubber Sheet plugin does: `src/std.ts` (server URL, session token, file download), `src/stores/app.ts` (the mobile flag), `src/base/subscription.ts` (the Data Sync list) and the menu template `src/components/CloudTAK/util/MenuTemplate.vue`. It therefore runs only when it is built into CloudTAK at `app/plugins/cloudtak-plugin-sar`.

## Install
The plugin is compiled into the CloudTAK web bundle when the CloudTAK image is built. List its URL in the `webPlugins` setting of the CDK context (several plugins can be separated by commas or spaces):

```json
"webPlugins": "https://github.com/TAK-NZ/cloudtak-plugin-sar.git"
```

The build clones the default branch (`main`) with `--depth 1`. A change to this repository alone does not change the image hash, so re-run the image build with `force_rebuild` or change a file under `app/` or `api/`. Users then choose **Settings → Refresh App**, because the service worker caches the old app.

## Development
Put a clone, or a symlink to one, at `app/plugins/cloudtak-plugin-sar` inside a CloudTAK checkout of the fork (the folder is git-ignored by CloudTAK). The name must be `cloudtak-plugin-sar`. The app's own ESLint, `vue-tsc` and Vitest configuration apply, and the plugin's host imports (see Requirements) only resolve there, so the scripts work only from inside `app/plugins/`:

```bash
npm run test    # Vitest, plugin specs only
npm run lint
npm run check   # vue-tsc for the whole app
```

With a symlink, Vitest 5 resolves the real path of the specs, which is outside the app root, and cannot load them (`npm run test` then finds no tests). Use a Vitest config that sets `resolve.preserveSymlinks` (merge it into the app's `vite.config.ts` and pass it with `--config`), then run `npx vitest run --config <that config> plugins/cloudtak-plugin-sar` from `app/`. A real clone inside `app/plugins/` needs no workaround. `npm run lint` and `npm run check` work through the symlink.

## Follow-ups
* Attach the KML as a file to a Data Sync (today a Data Sync receives CoT features).
* A native share sheet for the downloads on phones.
* The diagrams of the reference tool in the explainers (they are text only here).
* Editable Koester distances.
* Decide on the per-band multiplier set of the reference tool (the engine ships the single values per profile; the per-band set is a configuration change).
* A New Zealand calibration of the multipliers and the Koester distances.
* Screenshots for this README.
* Check in a browser: the pane at desktop width and at 390 x 844, the phone pick flow, the fit padding with the pane open, a click while picking that can also select a marker in CloudTAK, selecting and editing the created features, Add to Data Sync against a real TAK Server, the data package download, and the KML in Google Earth or QGIS.

## Licence
GNU Affero General Public License v3.0 only. See [LICENSE](LICENSE) and [NOTICE](NOTICE).
