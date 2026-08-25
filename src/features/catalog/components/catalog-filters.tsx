"use client";

import { Filter } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { countActiveCatalogFilters } from "@/lib/catalog-search/filters";
import type {
  CatalogFacetGroup,
  CatalogSearchInput,
} from "@/types/catalog-search";

const textInput =
  "h-10 w-full rounded-lg border border-input bg-surface px-3 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/20";

function FilterFields({
  input,
  facets,
}: {
  input: CatalogSearchInput;
  facets: CatalogFacetGroup[];
}) {
  return (
    <div className="space-y-6">
      <input type="hidden" name="q" value={input.query} />
      <input type="hidden" name="sort" value={input.sort} />
      <fieldset>
        <legend className="mb-3 text-sm font-semibold text-foreground">
          Track type
        </legend>
        <div className="space-y-2">
          {[
            ["music", "Music"],
            ["sound_effect", "Sound effect"],
            ["ambience", "Ambience"],
          ].map(([value, label]) => (
            <label
              key={value}
              className="flex min-h-8 items-center gap-2 text-sm text-foreground"
            >
              <input
                type="checkbox"
                name="type"
                value={value}
                defaultChecked={input.assetKinds.includes(
                  value as CatalogSearchInput["assetKinds"][number],
                )}
              />
              {label}
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend className="mb-3 text-sm font-semibold text-foreground">
          Version
        </legend>
        <div className="grid grid-cols-2 gap-2">
          {[
            ["original", "Original"],
            ["alternate", "Alternate"],
            ["cutdown", "Cutdown"],
            ["instrumental", "Instrumental"],
            ["remix", "Remix"],
            ["other", "Other"],
          ].map(([value, label]) => (
            <label
              key={value}
              className="flex min-h-8 items-center gap-2 text-sm text-foreground"
            >
              <input
                type="checkbox"
                name="version"
                value={value}
                defaultChecked={input.versionTypes.includes(
                  value as CatalogSearchInput["versionTypes"][number],
                )}
              />
              {label}
            </label>
          ))}
        </div>
      </fieldset>
      {facets.map((group) => {
        const parameter =
          group.category === "use_case"
            ? "useCase"
            : group.category === "geo_genre"
              ? "geoGenre"
              : group.category === "geo_subgenre"
                ? "geoSubgenre"
                : group.category.replace("_", "");
        const selected = new Set(
          group.category === "use_case"
            ? input.useCases
            : group.category === "format"
              ? input.formats
              : group.category === "genre"
                ? input.genres
                : group.category === "subgenre"
                  ? input.subgenres
                  : group.category === "mood"
                    ? input.moods
                    : group.category === "instrument"
                      ? input.instruments
                      : group.category === "theme"
                        ? input.themes
                        : group.category === "festival"
                          ? input.festivals
                          : group.category === "character"
                            ? input.characters
                            : group.category === "movement"
                              ? input.movements
                              : group.category === "era"
                                ? input.eras
                                : group.category === "geo_genre"
                                  ? input.geoGenres
                                  : input.geoSubgenres,
        );
        return (
          <fieldset key={group.category}>
            <legend className="mb-3 text-sm font-semibold text-foreground">
              {group.label}
            </legend>
            <div className="max-h-44 space-y-2 overflow-y-auto pr-1">
              {group.options.map((option) => (
                <label
                  key={option.slug}
                  className="flex min-h-8 items-center gap-2 text-sm text-foreground"
                >
                  <input
                    type="checkbox"
                    name={parameter}
                    value={option.slug}
                    defaultChecked={selected.has(option.slug)}
                  />
                  <span className="min-w-0 flex-1">{option.label}</span>
                  {option.count !== null ? (
                    <span className="text-xs text-muted-foreground">
                      {option.count}
                    </span>
                  ) : null}
                </label>
              ))}
            </div>
          </fieldset>
        );
      })}
      <fieldset>
        <legend className="mb-3 text-sm font-semibold text-foreground">
          Music details
        </legend>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-xs text-muted-foreground">
            Min BPM
            <input
              className={`${textInput} mt-1`}
              type="number"
              name="bpmMin"
              min="1"
              max="400"
              defaultValue={input.bpmMin ?? ""}
            />
          </label>
          <label className="text-xs text-muted-foreground">
            Max BPM
            <input
              className={`${textInput} mt-1`}
              type="number"
              name="bpmMax"
              min="1"
              max="400"
              defaultValue={input.bpmMax ?? ""}
            />
          </label>
          <label className="text-xs text-muted-foreground">
            Min seconds
            <input
              className={`${textInput} mt-1`}
              type="number"
              name="durationMin"
              min="0"
              defaultValue={input.durationMinSeconds ?? ""}
            />
          </label>
          <label className="text-xs text-muted-foreground">
            Max seconds
            <input
              className={`${textInput} mt-1`}
              type="number"
              name="durationMax"
              min="0"
              defaultValue={input.durationMaxSeconds ?? ""}
            />
          </label>
          <label className="text-xs text-muted-foreground">
            Key
            <input
              className={`${textInput} mt-1`}
              name="key"
              maxLength={10}
              defaultValue={input.keyTonic ?? ""}
            />
          </label>
          <label className="text-xs text-muted-foreground">
            Mode
            <select
              className={`${textInput} mt-1`}
              name="mode"
              defaultValue={input.keyMode ?? ""}
            >
              <option value="">Any</option>
              <option value="major">Major</option>
              <option value="minor">Minor</option>
            </select>
          </label>
          <label className="text-xs text-muted-foreground">
            Min energy %
            <input
              className={`${textInput} mt-1`}
              type="number"
              name="energyMin"
              min="0"
              max="100"
              defaultValue={
                input.energyMin === null
                  ? ""
                  : Math.round(input.energyMin * 100)
              }
            />
          </label>
          <label className="text-xs text-muted-foreground">
            Max energy %
            <input
              className={`${textInput} mt-1`}
              type="number"
              name="energyMax"
              min="0"
              max="100"
              defaultValue={
                input.energyMax === null
                  ? ""
                  : Math.round(input.energyMax * 100)
              }
            />
          </label>
        </div>
      </fieldset>
      <fieldset>
        <legend className="mb-3 text-sm font-semibold text-foreground">
          Editorial use
        </legend>
        <div className="space-y-3">
          {[
            ["underDialogue", "Works under dialogue", input.underDialogue],
            ["loopable", "Loopable", input.loopable],
            ["hasStems", "Has stems", input.hasStems],
          ].map(([name, label, value]) => (
            <label
              key={String(name)}
              className="block text-xs text-muted-foreground"
            >
              {String(label)}
              <select
                className={`${textInput} mt-1`}
                name={String(name)}
                defaultValue={value === null ? "" : value ? "yes" : "no"}
              >
                <option value="">Any</option>
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </select>
            </label>
          ))}
          <label className="block text-xs text-muted-foreground">
            Vocal state
            <select
              className={`${textInput} mt-1`}
              name="vocal"
              defaultValue={input.vocalStates[0] ?? ""}
            >
              <option value="">Any</option>
              <option value="instrumental">Instrumental</option>
              <option value="vocal">Vocal</option>
              <option value="mixed">Mixed</option>
            </select>
          </label>
          <label className="block text-xs text-muted-foreground">
            Ending
            <select
              className={`${textInput} mt-1`}
              name="ending"
              defaultValue={input.endingTypes[0] ?? ""}
            >
              <option value="">Any</option>
              <option value="clean_stop">Clean stop</option>
              <option value="final_hit">Final hit</option>
              <option value="fade">Fade</option>
              <option value="open">Open</option>
            </select>
          </label>
        </div>
      </fieldset>
      <fieldset>
        <legend className="mb-3 text-sm font-semibold text-foreground">
          Published date
        </legend>
        <div className="space-y-3">
          <label className="block text-xs text-muted-foreground">
            From
            <input
              className={`${textInput} mt-1`}
              type="date"
              name="publishedAfter"
              defaultValue={input.publishedAfter ?? ""}
            />
          </label>
          <label className="block text-xs text-muted-foreground">
            To
            <input
              className={`${textInput} mt-1`}
              type="date"
              name="publishedBefore"
              defaultValue={input.publishedBefore ?? ""}
            />
          </label>
        </div>
      </fieldset>
      <div className="flex gap-2">
        <Button type="submit" size="lg" className="flex-1">
          Apply filters
        </Button>
        <Button asChild type="button" variant="outline" size="lg">
          <a
            href={
              input.query
                ? `/library?q=${encodeURIComponent(input.query)}`
                : "/library"
            }
          >
            Clear
          </a>
        </Button>
      </div>
    </div>
  );
}

export function CatalogFilters({
  input,
  facets,
}: {
  input: CatalogSearchInput;
  facets: CatalogFacetGroup[];
}) {
  const count = countActiveCatalogFilters(input);
  return (
    <>
      <aside
        className="hidden w-64 shrink-0 lg:block"
        aria-label="Library filters"
      >
        <form
          action="/library"
          className="rounded-xl border border-border bg-surface p-5"
        >
          <FilterFields input={input} facets={facets} />
        </form>
      </aside>
      <div className="lg:hidden">
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="outline" size="lg">
              <Filter aria-hidden="true" />
              Filters{count ? ` (${count})` : ""}
            </Button>
          </SheetTrigger>
          <SheetContent
            className="overflow-y-auto"
            aria-label="Library filters"
          >
            <SheetHeader>
              <SheetTitle>Filter library</SheetTitle>
              <SheetDescription>
                Narrow published music by approved catalog metadata.
              </SheetDescription>
            </SheetHeader>
            <form action="/library" className="px-4 pb-6">
              <FilterFields input={input} facets={facets} />
            </form>
          </SheetContent>
        </Sheet>
      </div>
    </>
  );
}
