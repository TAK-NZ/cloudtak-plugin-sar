# SAR (Search and Rescue)

CloudTAK plugin for search and rescue planning in New Zealand: terrain-aware range rings around an Initial Planning
Point (IPP) and travel-time isochrones, drawn as features on the CloudTAK map.

**Status: scaffold only. There is no plugin code yet, and nothing here is usable.**

## Planned scope

* Pick an IPP on the map, choose a subject profile or a travel speed, and run an analysis.
* **Travel Time mode** (first): reachability contours at chosen time bands, from terrain, land cover and walking speed.
* **TARR mode** (later): Lost Person Behavior percentile rings. These are **not calibrated for New Zealand** (no NZ
  incident data yet), so they will be labelled as indicative and shown next to the plain Koester circle.

## Architecture

The plugin is a thin Vue 3 + TypeScript module compiled into the CloudTAK web bundle, like
[`cloudtak-plugin-weather`](https://github.com/TAK-NZ/cloudtak-plugin-weather). The analysis runs elsewhere:

```
cloudtak-plugin-sar  ->  /api/sar/*  (TAK-NZ CloudTAK fork relay)  ->  sar-engine Lambda (deployed by utils-infra)
```

* Engine: [TAK-NZ/sar-engine](https://github.com/TAK-NZ/sar-engine), a fork of WiSAR Terrain-Aware Range Rings.
* Deployment: [TAK-NZ/utils-infra](https://github.com/TAK-NZ/utils-infra).
* The CloudTAK server holds the service key; it never reaches the browser.

## Licence

GNU Affero General Public License v3.0 only. See [LICENSE](LICENSE) and [NOTICE](NOTICE).
