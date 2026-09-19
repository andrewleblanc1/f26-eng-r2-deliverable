"use client";

import { max } from "d3-array";
import { axisBottom, axisLeft } from "d3-axis";
import { csv } from "d3-fetch";
import { scaleBand, scaleLinear, scaleOrdinal } from "d3-scale";
import { select } from "d3-selection";
import { useTheme } from "next-themes";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/* -------------------------------------------------------------------------- */
/*  Types                                                                      */
/* -------------------------------------------------------------------------- */

export const DIETS = ["herbivore", "omnivore", "carnivore"] as const;

export type Diet = (typeof DIETS)[number];

export interface AnimalDatum {
  name: string;
  speed: number;
  diet: Diet;
}

/* -------------------------------------------------------------------------- */
/*  Configuration                                                              */
/* -------------------------------------------------------------------------- */

/** Drop the CSV at `public/sample_animals.csv` and it is served from this path. */
const CSV_PATH = "/sample_animals.csv";

/**
 * Categorical palette, three slots, selected per theme (the dark column is the
 * same three hues re-stepped for a dark surface, not an automatic flip). Colour
 * is bound to the diet itself, so filtering never repaints the survivors.
 */
const DIET_COLORS: Record<"light" | "dark", Record<Diet, string>> = {
  light: { herbivore: "#1baf7a", omnivore: "#2a78d6", carnivore: "#eb6834" },
  dark: { herbivore: "#199e70", omnivore: "#3987e5", carnivore: "#d95926" },
};

const INK: Record<"light" | "dark", { primary: string; secondary: string; grid: string; surface: string }> = {
  light: { primary: "#0b0b0b", secondary: "#52514e", grid: "#e5e4e0", surface: "#ffffff" },
  dark: { primary: "#ffffff", secondary: "#c3c2b7", grid: "#2b2f3a", surface: "#030711" },
};

/** How many bars to show at once. "All" is available but is not the default. */
const TOP_N_OPTIONS = [10, 20, 30, 50] as const;
const DEFAULT_TOP_N = 20;

/* -------------------------------------------------------------------------- */
/*  CSV parsing helpers                                                        */
/* -------------------------------------------------------------------------- */

type RawRow = Record<string, string | undefined>;

const normalizeKey = (key: string) => key.trim().toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * Reads the first column whose header matches one of `candidates` (in priority
 * order, ignoring case/spacing/punctuation). This keeps the component working
 * whether the CSV ships `name,speed,diet` or `Animal,Top Speed (km/h),Diet`.
 */
function pickField(row: RawRow, candidates: readonly string[]): string | undefined {
  const keys = Object.keys(row);
  for (const candidate of candidates) {
    const hit = keys.find((key) => normalizeKey(key) === candidate);
    if (hit !== undefined) return row[hit];
  }
  return undefined;
}

const NAME_KEYS = ["name", "animal", "animalname", "species", "commonname"] as const;
const SPEED_KEYS = ["speed", "speedkmh", "speedkph", "topspeed", "maxspeed", "velocity", "speedkmhr"] as const;
const DIET_KEYS = ["diet", "diettype", "dietarycategory", "feedingtype", "category"] as const;

function parseSpeed(raw: string | undefined): number | null {
  if (raw === undefined) return null;
  // Tolerates "45", "45.5 km/h", "1,200" etc.
  const cleaned = raw.replace(/,/g, "").replace(/[^0-9.+-]/g, "");
  const value = Number.parseFloat(cleaned);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function parseDiet(raw: string | undefined): Diet | null {
  if (raw === undefined) return null;
  const cleaned = raw.trim().toLowerCase();
  return DIETS.find((diet) => cleaned === diet || cleaned.startsWith(diet)) ?? null;
}

/** Validates a raw CSV row, returning `null` for anything unusable. */
function toAnimalDatum(row: RawRow): AnimalDatum | null {
  const name = pickField(row, NAME_KEYS)?.trim();
  const speed = parseSpeed(pickField(row, SPEED_KEYS));
  const diet = parseDiet(pickField(row, DIET_KEYS));
  if (!name || speed === null || diet === null) return null;
  return { name, speed, diet };
}

/** Collapses repeated animals to their fastest recorded speed (unique x-domain). */
function dedupeByName(rows: AnimalDatum[]): AnimalDatum[] {
  const byName = new Map<string, AnimalDatum>();
  for (const row of rows) {
    const key = row.name.toLowerCase();
    const existing = byName.get(key);
    if (!existing || row.speed > existing.speed) byName.set(key, row);
  }
  return [...byName.values()];
}

/* -------------------------------------------------------------------------- */
/*  Geometry helpers                                                           */
/* -------------------------------------------------------------------------- */

/** A bar with a 4px rounded cap and a square foot on the baseline. */
function barPath(x: number, y: number, width: number, height: number, radius = 4): string {
  const r = Math.max(0, Math.min(radius, width / 2, height));
  return [
    `M${x},${y + height}`,
    `L${x},${y + r}`,
    `Q${x},${y} ${x + r},${y}`,
    `L${x + width - r},${y}`,
    `Q${x + width},${y} ${x + width},${y + r}`,
    `L${x + width},${y + height}`,
    "Z",
  ].join(" ");
}

/* -------------------------------------------------------------------------- */
/*  Component                                                                  */
/* -------------------------------------------------------------------------- */

type LoadState = "loading" | "ready" | "empty" | "error";

interface Tooltip {
  x: number;
  y: number;
  datum: AnimalDatum;
}

export default function AnimalSpeedGraph() {
  // useRef creates a reference to the div where D3 will draw the chart.
  // https://react.dev/reference/react/useRef
  const graphRef = useRef<HTMLDivElement>(null);

  const [animalData, setAnimalData] = useState<AnimalDatum[]>([]);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [loadError, setLoadError] = useState<string | null>(null);

  const [activeDiets, setActiveDiets] = useState<Diet[]>([...DIETS]);
  const [topN, setTopN] = useState<number | "all">(DEFAULT_TOP_N);
  const [showTable, setShowTable] = useState(false);
  const [tooltip, setTooltip] = useState<Tooltip | null>(null);
  const [containerWidth, setContainerWidth] = useState(0);

  const { resolvedTheme } = useTheme();
  const mode: "light" | "dark" = resolvedTheme === "dark" ? "dark" : "light";

  /* ---------------------------------------------------------------------- */
  /*  Load the CSV                                                           */
  /* ---------------------------------------------------------------------- */

  useEffect(() => {
    let cancelled = false;

    void csv(CSV_PATH)
      .then((rows) => {
        if (cancelled) return;
        const parsed = dedupeByName((rows as RawRow[]).map(toAnimalDatum).filter((row): row is AnimalDatum => row !== null));
        setAnimalData(parsed);
        // A missing file still "succeeds" in dev (Next serves a 404 HTML page),
        // so an empty result after parsing is the real signal that it is absent.
        setLoadState(parsed.length > 0 ? "ready" : "empty");
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setLoadError(error instanceof Error ? error.message : String(error));
        setLoadState("error");
      });

    return () => {
      cancelled = true;
    };
  }, []);

  /* ---------------------------------------------------------------------- */
  /*  Track container width so the chart is responsive                       */
  /* ---------------------------------------------------------------------- */

  useEffect(() => {
    const node = graphRef.current;
    if (!node) return;

    setContainerWidth(node.clientWidth);
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setContainerWidth(entry.contentRect.width);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  /* ---------------------------------------------------------------------- */
  /*  Derive what actually gets drawn                                        */
  /* ---------------------------------------------------------------------- */

  const dietCounts = useMemo(() => {
    const counts = { herbivore: 0, omnivore: 0, carnivore: 0 } satisfies Record<Diet, number>;
    for (const animal of animalData) counts[animal.diet] += 1;
    return counts;
  }, [animalData]);

  /**
   * Usability call: rather than cramming every row onto one axis, we filter by
   * diet, rank by speed, and render the fastest N. Bars stay wide enough to read
   * and the names never collide; the rest of the data stays reachable through
   * the "All" option and the table view.
   */
  const visibleData = useMemo(() => {
    const filtered = animalData.filter((animal) => activeDiets.includes(animal.diet));
    const ranked = [...filtered].sort((a, b) => b.speed - a.speed || a.name.localeCompare(b.name));
    return topN === "all" ? ranked : ranked.slice(0, topN);
  }, [animalData, activeDiets, topN]);

  const toggleDiet = useCallback((diet: Diet) => {
    setActiveDiets((current) =>
      current.includes(diet) ? current.filter((entry) => entry !== diet) : DIETS.filter((entry) => current.includes(entry) || entry === diet),
    );
  }, []);

  /* ---------------------------------------------------------------------- */
  /*  Draw with D3                                                           */
  /* ---------------------------------------------------------------------- */

  useEffect(() => {
    // Clear any previous SVG to avoid duplicates when React hot-reloads
    if (graphRef.current) {
      graphRef.current.innerHTML = "";
    }

    if (visibleData.length === 0 || containerWidth === 0) return;

    const ink = INK[mode];
    const colors = DIET_COLORS[mode];

    // Rotated tick labels need room proportional to the longest animal name.
    const longestName = visibleData.reduce((longest, animal) => Math.max(longest, animal.name.length), 0);
    const labelRoom = Math.min(150, Math.round(longestName * 6.2 * 0.64) + 12);

    const margin = { top: 16, right: 16, bottom: 48 + labelRoom, left: 68 };
    const width = Math.max(containerWidth, 320);
    const plotWidth = width - margin.left - margin.right;
    const plotHeight = 360;
    const height = plotHeight + margin.top + margin.bottom;

    // Create the SVG element where D3 will draw the chart
    // https://github.com/d3/d3-selection
    const svg = select(graphRef.current!)
      .append<SVGSVGElement>("svg")
      .attr("width", width)
      .attr("height", height)
      .attr("viewBox", `0 0 ${width} ${height}`)
      .attr("role", "img")
      .attr(
        "aria-label",
        `Bar chart of the top ${visibleData.length} animal running speeds in kilometres per hour, coloured by diet.`,
      );

    const plot = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

    /* --- Scales ---------------------------------------------------------- */

    // https://github.com/d3/d3-scale#band-scales
    const x = scaleBand<string>()
      .domain(visibleData.map((animal) => animal.name))
      .range([0, plotWidth])
      .paddingInner(0.25)
      .paddingOuter(0.1);

    // https://github.com/d3/d3-scale#linear-scales
    const y = scaleLinear()
      .domain([0, max(visibleData, (animal) => animal.speed) ?? 1])
      .nice()
      .range([plotHeight, 0]);

    // https://github.com/d3/d3-scale#ordinal-scales
    const color = scaleOrdinal<Diet, string>()
      .domain([...DIETS])
      .range(DIETS.map((diet) => colors[diet]));

    /* --- Gridlines (recessive, behind the bars) -------------------------- */

    plot
      .append("g")
      .attr("aria-hidden", "true")
      .selectAll("line")
      .data(y.ticks(6))
      .join("line")
      .attr("x1", 0)
      .attr("x2", plotWidth)
      .attr("y1", (tick) => y(tick))
      .attr("y2", (tick) => y(tick))
      .attr("stroke", ink.grid)
      .attr("stroke-width", 1);

    /* --- Bars ------------------------------------------------------------ */

    // Cap the bar thickness so a short list does not turn into slabs; the
    // leftover band width simply becomes air.
    const barWidth = Math.min(24, x.bandwidth());
    const barOffset = (x.bandwidth() - barWidth) / 2;

    plot
      .append("g")
      .selectAll("path")
      .data(visibleData)
      .join("path")
      .attr("d", (animal) =>
        barPath((x(animal.name) ?? 0) + barOffset, y(animal.speed), barWidth, plotHeight - y(animal.speed)),
      )
      .attr("fill", (animal) => color(animal.diet))
      .attr("cursor", "pointer")
      .on("mousemove", function (event: MouseEvent, animal: AnimalDatum) {
        const bounds = graphRef.current?.getBoundingClientRect();
        select(this).attr("fill-opacity", 0.75);
        setTooltip({
          x: event.clientX - (bounds?.left ?? 0),
          y: event.clientY - (bounds?.top ?? 0),
          datum: animal,
        });
      })
      .on("mouseleave", function () {
        select(this).attr("fill-opacity", 1);
        setTooltip(null);
      });

    /* --- Direct label on the fastest animal ------------------------------ */

    const fastest = visibleData[0];
    if (fastest) {
      plot
        .append("text")
        .attr("x", (x(fastest.name) ?? 0) + x.bandwidth() / 2)
        .attr("y", y(fastest.speed) - 8)
        .attr("text-anchor", "middle")
        .attr("font-size", 11)
        .attr("font-weight", 600)
        .attr("fill", ink.primary)
        .text(`${fastest.speed} km/h`);
    }

    /* --- Axes ------------------------------------------------------------ */
    // https://github.com/d3/d3-axis

    const xAxis = plot
      .append("g")
      .attr("transform", `translate(0,${plotHeight})`)
      .call(axisBottom(x).tickSizeOuter(0));

    xAxis.selectAll("path, line").attr("stroke", ink.grid);
    xAxis
      .selectAll("text")
      .attr("fill", ink.secondary)
      .attr("font-size", 11)
      .attr("text-anchor", "end")
      .attr("dx", "-0.6em")
      .attr("dy", "0.15em")
      .attr("transform", "rotate(-40)");

    const yAxis = plot.append("g").call(axisLeft(y).ticks(6).tickSizeOuter(0));
    yAxis.selectAll("path, line").attr("stroke", ink.grid);
    yAxis.selectAll("text").attr("fill", ink.secondary).attr("font-size", 11);

    /* --- Axis titles ----------------------------------------------------- */

    svg
      .append("text")
      .attr("x", margin.left + plotWidth / 2)
      .attr("y", height - 10)
      .attr("text-anchor", "middle")
      .attr("font-size", 12)
      .attr("font-weight", 500)
      .attr("fill", ink.secondary)
      .text("Animal");

    svg
      .append("text")
      .attr("transform", `translate(18,${margin.top + plotHeight / 2}) rotate(-90)`)
      .attr("text-anchor", "middle")
      .attr("font-size", 12)
      .attr("font-weight", 500)
      .attr("fill", ink.secondary)
      .text("Speed (km/h)");
  }, [visibleData, containerWidth, mode]);

  /* ---------------------------------------------------------------------- */
  /*  Render                                                                 */
  /* ---------------------------------------------------------------------- */

  const totalShown = visibleData.length;
  const totalAvailable = animalData.filter((animal) => activeDiets.includes(animal.diet)).length;

  return (
    <div className="rounded-lg border bg-card p-4 md:p-6">
      {/* Header: caption on the left, legend top-right so it never covers a bar */}
      <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h3 className="text-base font-semibold">Top speeds by diet</h3>
          <p className="text-sm text-muted-foreground">
            {loadState === "ready"
              ? `Showing the ${totalShown} fastest of ${totalAvailable} animals in the current selection.`
              : "Ranked fastest to slowest."}
          </p>
        </div>

        <ul className="flex flex-wrap items-center gap-2" aria-label="Diet legend and filter">
          {DIETS.map((diet) => {
            const active = activeDiets.includes(diet);
            return (
              <li key={diet}>
                <button
                  type="button"
                  onClick={() => toggleDiet(diet)}
                  aria-pressed={active}
                  className={`flex items-center gap-2 rounded-md border px-2.5 py-1 text-xs font-medium capitalize transition-opacity ${
                    active ? "opacity-100" : "opacity-40"
                  }`}
                  title={`${active ? "Hide" : "Show"} ${diet}s`}
                >
                  <span
                    aria-hidden="true"
                    className="h-3 w-3 rounded-sm"
                    style={{ backgroundColor: DIET_COLORS[mode][diet] }}
                  />
                  {diet}
                  <span className="text-muted-foreground">{dietCounts[diet]}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      {/* Controls */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground">Show</span>
        {TOP_N_OPTIONS.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setTopN(option)}
            aria-pressed={topN === option}
            className={`rounded-md border px-2.5 py-1 text-xs font-medium ${
              topN === option ? "bg-primary text-primary-foreground" : "hover:bg-accent"
            }`}
          >
            Top {option}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setTopN("all")}
          aria-pressed={topN === "all"}
          className={`rounded-md border px-2.5 py-1 text-xs font-medium ${
            topN === "all" ? "bg-primary text-primary-foreground" : "hover:bg-accent"
          }`}
        >
          All
        </button>
        <button
          type="button"
          onClick={() => setShowTable((shown) => !shown)}
          aria-pressed={showTable}
          className="ml-auto rounded-md border px-2.5 py-1 text-xs font-medium hover:bg-accent"
        >
          {showTable ? "Hide table" : "View as table"}
        </button>
      </div>

      {/* Chart / states */}
      <div className="relative">
        <div ref={graphRef} className="w-full" />

        {loadState === "loading" && (
          <p className="py-16 text-center text-sm text-muted-foreground">Loading animal data…</p>
        )}

        {(loadState === "empty" || loadState === "error") && (
          <div className="rounded-md border border-dashed p-8 text-center">
            <p className="text-sm font-medium">No animal data found</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Add your CSV at <code className="rounded bg-muted px-1 py-0.5">public/sample_animals.csv</code> with{" "}
              <code className="rounded bg-muted px-1 py-0.5">name</code>,{" "}
              <code className="rounded bg-muted px-1 py-0.5">speed</code>, and{" "}
              <code className="rounded bg-muted px-1 py-0.5">diet</code> columns, then reload.
            </p>
            {loadError && <p className="mt-2 text-xs text-muted-foreground">({loadError})</p>}
          </div>
        )}

        {loadState === "ready" && visibleData.length === 0 && (
          <p className="py-16 text-center text-sm text-muted-foreground">
            No animals match the current filter — re-enable a diet above.
          </p>
        )}

        {tooltip && (
          <div
            role="tooltip"
            className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-md border bg-popover px-2.5 py-1.5 text-xs shadow-md"
            style={{ left: tooltip.x, top: tooltip.y - 10 }}
          >
            <div className="font-medium">{tooltip.datum.name}</div>
            <div className="text-muted-foreground">
              {tooltip.datum.speed} km/h · <span className="capitalize">{tooltip.datum.diet}</span>
            </div>
          </div>
        )}
      </div>

      {/* Table view: every visible value in text, for screen readers and for
          anyone who cannot separate the fills by colour alone. */}
      {showTable && visibleData.length > 0 && (
        <div className="mt-6 max-h-80 overflow-auto rounded-md border">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 bg-muted">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium">
                  #
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  Animal
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  Diet
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  Speed (km/h)
                </th>
              </tr>
            </thead>
            <tbody>
              {visibleData.map((animal, index) => (
                <tr key={animal.name} className="border-t">
                  <td className="px-3 py-1.5 text-muted-foreground">{index + 1}</td>
                  <td className="px-3 py-1.5">{animal.name}</td>
                  <td className="px-3 py-1.5 capitalize">
                    <span className="flex items-center gap-2">
                      <span
                        aria-hidden="true"
                        className="h-2.5 w-2.5 rounded-sm"
                        style={{ backgroundColor: DIET_COLORS[mode][animal.diet] }}
                      />
                      {animal.diet}
                    </span>
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{animal.speed}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
