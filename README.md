# SAR travel time
CloudTAK plugin for search and rescue planning in New Zealand. Pick an Initial Planning Point (IPP), enter a walking speed and one or more time bands, and the plugin draws nested contours on the map that show how far a person could travel in each band over New Zealand terrain, land cover, trails, roads and power-line corridors.
## What it does
* A **Travel time** entry in the right-side menu opens a panel at the bottom of the map. Close it with the close button or Escape. The contours stay on the map after the panel closes.
* **Start point.** Choose one of three ways: **Pick on map** (the cursor becomes a crosshair, a banner says "Tap the map to set the start point", one click sets it, Cancel or Escape stops), **Choose a marker** (a filterable list of the point markers on your map, first 100 by name), or type the latitude and longitude. The start point is drawn as a dot as soon as it is valid.
* **Speed** in km/h (default 2.5).
* **Time bands** as chips (default 1, 2, 4 and 8 h). Add a band with the field and **Add band**, remove one with the x on its chip. One to eight bands, each 0.25 to 24 h. Duplicates collapse and the chips stay in time order.
* **Radius** in km (optional, default 10). Larger radii take longer. In cities, large radii are slow.
* **Run** sends the calculation. While it runs the inputs are disabled and the panel shows the elapsed seconds and **Cancel**. A calculation can take up to a minute, especially the first one after a quiet period. A response that arrives after Cancel is ignored.
* **Result.** Larger bands are drawn underneath smaller ones, each with a fill, an outline and a label such as `2 h`. The map fits the result. The panel lists the effective radius, each band with a colour swatch and its label, the warnings (prefixed **Warning:** or **Note:**), the engine's disclaimer, the data attribution and the date of the roads and trails data.
* **Clear** removes the contours and the start point from the map and the panel. Speed, bands and radius are kept; they are stored in the browser (`taknz-sar:v1`). The start point is never stored.
* **Other plugins.** When another plugin opens its own panel at the bottom of the map, the travel-time panel closes. While a calculation is running it hides instead, and a dot on the menu entry shows that it is waiting. It comes back when the other panel closes, or when you choose the menu entry. The plugins tell each other through the `cloudtak-plugin:panel-open` and `cloudtak-plugin:panel-close` events on `window`; the shared helper is `lib/panel-coordinator.ts` (MIT-0).
## Reading the contours
The contours are travel time: they show how far a person walking at the chosen speed could get in each time band, given the terrain, land cover, trails, roads and power-line corridors around the start point. They do not say where a person is. A smaller contour is not a better place to search.
* The method comes from the WiSAR project and has not been calibrated for New Zealand. The engine sends a disclaimer with every result and the panel shows it word for word next to the contours.
* The contours are the largest contiguous area reached in each band. A band can have no contour; the panel then lists a note.
* There is no incident statistics mode.
* Colour is not the only signal: every band is also written out as text, in the list and on the map. With more than six bands colours repeat.
## Limits
| Input | Limit |
|---|---|
| Latitude | -48 to -33.5 |
| Longitude | 165.5 to 179.5 |
| Start point | On land. A point in the sea or a lake is refused |
| Speed | 0.1 to 10 km/h |
| Time bands | 1 to 8, each 0.25 to 24 h |
| Radius | Optional, 1 to 30 km. Default 10 |
| Request size | At most 8 KB |
The engine uses the larger of the radius you enter and the speed times the longest band plus 2 km, clipped at 30 km, and tells you with a warning when it clips. The panel shows the effective radius from the response.
Timing guide: a bush area with a 10 km radius usually takes a few seconds. Large city areas with a large radius take much longer, up to most of a minute. The first request after a quiet period is slower. The relay waits up to 70 seconds for the engine.
### Dense areas
In dense city areas the engine can refuse a calculation in about ten seconds instead of running until it times out. The panel then shows the engine's message word for word. Depending on what the engine suggests, it also offers:
* **Try {n} km**, when the engine suggests a smaller radius. It fills the radius field.
* **Set longest band to {h} h**, when the engine suggests a shorter longest band. It replaces the largest chip with that value, then removes duplicates and keeps the chips in order. If the engine suggested a radius as well, this button sets both the radius and the longest band.
The buttons only edit the inputs. Nothing is sent until you press **Run**. The plugin never makes up a suggestion: it uses the numbers in the response. A number that is not a finite number, or that is outside the plugin's own limits (radius 1 to 30 km, band 0.25 to 24 h), is ignored and never rounded into range; the message is still shown. When neither suggestion is usable there is no button. Other refusals, such as a start point in the sea, show their message and no button.
## Troubleshooting
| Message | What to do |
|---|---|
| The engine's own message, for example about a dense area or the sea | Follow the message. Move the start point, use a smaller radius or a shorter longest band, then press Run |
| The calculation took too long. Try a smaller radius. | Press **Retry**, or lower the radius. The first request after a quiet period can be slow |
| Too many requests. Try again in {n} seconds. | The server limits each user (default 6 calculations a minute). Wait, then press **Retry** |
| SAR planning is unavailable. Contact your administrator. | The relay is switched off, misconfigured or cannot reach the engine |
| Analysis failed. Try again, or try a smaller area. | Press **Retry**, or use a smaller area |
| Could not reach the server. Check your connection and try again. | Check the connection, then **Retry** |
If the menu entry is missing, the relay is switched off or unreachable, and the plugin adds nothing to the app.
## Data and attribution
The panel shows the attribution list from the engine whenever contours are visible. The data are:
* Land cover: LCDB v6.0, Landcare Research, CC BY 4.0
* Elevation: LINZ NZ Elevation, CC BY 4.0, with Copernicus GLO-30
* Roads and trails: OpenStreetMap contributors, ODbL, https://www.openstreetmap.org/copyright
* Method: WiSAR, AGPL-3.0
See [NOTICE](NOTICE).
## Screenshots
Screenshots are to be added. They need a running CloudTAK and a browser, which were not available when this version was written.
## Requirements
CloudTAK **13.102** or newer, because the panel uses the bottom bar plugin API that first appeared in 13.102.0.
A CloudTAK server that provides `/api/sar/status` and `/api/sar/travel-time`, which is the [TAK-NZ CloudTAK fork](https://github.com/TAK-NZ/CloudTAK). If the endpoint is missing or switched off, the plugin adds nothing to the app. The server holds the engine key and relays the request; the key never reaches the browser. Set these environment variables on the CloudTAK API task:
| Variable | Meaning |
|---|---|
| `SAR_SERVICE_URL` | HTTPS base URL of the SAR engine, for example `https://utils.example.com/sar` |
| `SAR_SERVICE_KEY` | The engine client key. It never reaches the browser |
| `SAR_RATE_LIMIT` | Optional. Calculations per user per minute, 1 to 60, default 6 |
## Install
The plugin is compiled into the CloudTAK web bundle when the CloudTAK image is built. List its URL in the `webPlugins` setting of the CDK context (several plugins can be separated by commas or spaces):
```json
"webPlugins": "https://github.com/TAK-NZ/cloudtak-plugin-sar.git"
```
The build clones the default branch (`main`) with `--depth 1`. A change to this repository alone does not change the image hash, so re-run the image build with `force_rebuild` or change a file under `api/` or `app/`. Users then choose **Settings → Refresh App**, because the service worker caches the old app.
## Development
Put a clone, or a symlink to one, at `app/plugins/cloudtak-plugin-sar` inside a CloudTAK checkout (the folder is git-ignored by CloudTAK). The name must be `cloudtak-plugin-sar`. The app's own ESLint, `vue-tsc` and Vitest configuration apply, so the scripts work only from inside `app/plugins/`:
```bash
npm run test    # Vitest, plugin specs only
npm run lint
npm run check   # vue-tsc for the whole app
```
With a symlink, Vitest 5 resolves the real path of the specs, which is outside the app root, and cannot load them. Use a Vitest config that sets `resolve.preserveSymlinks` (merge it into the app's `vite.config.ts` and pass it with `--config`), then run `npx vitest run --config <that config> plugins/cloudtak-plugin-sar` from `app/`. A real clone inside `app/plugins/` needs no workaround.
## Follow-ups
* Share the contours with other TAK users, as CoT polygons or as a mission.
* Screenshots for this README.
* Check in a browser: a click while picking the start point can also select a marker in CloudTAK, and the layout at 390 x 844 and 844 x 390.
## Licence
GNU Affero General Public License v3.0 only. See [LICENSE](LICENSE) and [NOTICE](NOTICE).
