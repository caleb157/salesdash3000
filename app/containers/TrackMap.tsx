"use client";

import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";
import type { ContainerTrack } from "@/lib/containers/types";

export interface MapEntry {
  key: string;
  track: ContainerTrack;
}

interface Props {
  entries: MapEntry[];
  selected: string | null;
  onSelect: (key: string) => void;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export function currentPoint(t: ContainerTrack) {
  if (t.current.kind === "vessel") return { lat: t.current.vessel.lat, lon: t.current.vessel.lon };
  if (t.current.kind === "place") return t.current.point;
  return null;
}

/** OpenStreetMap + Leaflet: one pin per container (a ship arrow when it's at sea), with its route when selected. */
export default function TrackMap({ entries, selected, onSelect }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<import("leaflet").Map | null>(null);
  const layer = useRef<import("leaflet").LayerGroup | null>(null);
  const L = useRef<typeof import("leaflet") | null>(null);
  const fitted = useRef("");
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  useEffect(() => {
    let cancelled = false;
    import("leaflet").then((mod) => {
      if (cancelled || !el.current || map.current) return;
      L.current = mod;
      map.current = mod.map(el.current, { worldCopyJump: true, zoomControl: true }).setView([20, 60], 2);
      mod.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 18,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }).addTo(map.current);
      layer.current = mod.layerGroup().addTo(map.current);
      draw();
    });
    return () => {
      cancelled = true;
      map.current?.remove();
      map.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(draw);

  function draw() {
    const Lf = L.current, m = map.current, g = layer.current;
    if (!Lf || !m || !g) return;
    g.clearLayers();
    const bounds: [number, number][] = [];

    const sel = entries.find((e) => e.key === selected);
    if (sel) {
      // Route: origin → last port → ship (if at sea) → next port → destination.
      const order = ["origin", "last", "next", "destination"] as const;
      const pts: [number, number][] = [];
      for (const role of order) {
        const s = sel.track.stops.find((x) => x.role === role);
        if (role === "next" && sel.track.current.kind === "vessel") pts.push([sel.track.current.vessel.lat, sel.track.current.vessel.lon]);
        if (!s) continue;
        pts.push([s.point.lat, s.point.lon]);
        Lf.circleMarker([s.point.lat, s.point.lon], { radius: 5, weight: 2, color: "#7a7974", fillColor: "#fff", fillOpacity: 1 })
          .bindTooltip(`${role === "last" ? "Last port" : role === "next" ? "Next port" : role[0].toUpperCase() + role.slice(1)}: ${esc(s.label)}`)
          .addTo(g);
        bounds.push([s.point.lat, s.point.lon]);
      }
      if (pts.length > 1) Lf.polyline(pts, { color: "#2a78d6", weight: 2, dashArray: "6 6", opacity: 0.8 }).addTo(g);
    }

    for (const e of entries) {
      const p = currentPoint(e.track);
      if (!p) continue;
      const on = e.key === selected;
      const cur = e.track.current;
      const marker = cur.kind === "vessel"
        ? Lf.marker([p.lat, p.lon], {
            icon: Lf.divIcon({
              className: "",
              html: `<div class="ship-pin${on ? " on" : ""}" style="transform:rotate(${cur.vessel.course ?? cur.vessel.heading ?? 0}deg)"></div>`,
              iconSize: [22, 22], iconAnchor: [11, 11],
            }),
            zIndexOffset: on ? 1000 : 0,
          })
        : Lf.circleMarker([p.lat, p.lon], { radius: on ? 9 : 7, weight: 2, color: "#fff", fillColor: "#eb6834", fillOpacity: 1 });
      marker.bindTooltip(`<b>${esc(e.track.number)}</b><br>${esc(cur.label)}`).on("click", () => onSelectRef.current(e.key)).addTo(g);
      if (!sel || on) bounds.push([p.lat, p.lon]);
    }

    // Re-frame only when the selection or set of pins changes, not on every render.
    const sig = `${selected}|${bounds.map((b) => b.join(",")).join(";")}`;
    if (sig !== fitted.current && bounds.length) {
      fitted.current = sig;
      if (bounds.length === 1) m.setView(bounds[0], sel ? 6 : 4);
      else m.fitBounds(bounds, { padding: [30, 30], maxZoom: 7 });
    }
  }

  return <div ref={el} className="track-map" role="region" aria-label="Map of container locations" />;
}
