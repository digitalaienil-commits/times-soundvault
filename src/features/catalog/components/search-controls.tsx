import { Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { catalogSearchInputToParams } from "@/lib/catalog-search/filters";
import type { CatalogSearchInput } from "@/types/catalog-search";

function HiddenParams({
  input,
  omit,
}: {
  input: CatalogSearchInput;
  omit: string[];
}) {
  const params = catalogSearchInputToParams(input);
  omit.forEach((name) => params.delete(name));
  return [...params.entries()].map(([name, value], index) => (
    <input
      key={`${name}-${value}-${index}`}
      type="hidden"
      name={name}
      value={value}
    />
  ));
}

export function SearchControls({ input }: { input: CatalogSearchInput }) {
  return (
    <div className="mt-7 flex flex-col gap-3 sm:flex-row">
      <form
        action="/library"
        role="search"
        className="flex min-w-0 flex-1 gap-2"
      >
        <HiddenParams input={input} omit={["q", "page"]} />
        <label className="sr-only" htmlFor="library-query">
          Search published library
        </label>
        <Input
          id="library-query"
          name="q"
          type="search"
          maxLength={200}
          defaultValue={input.query}
          placeholder='Search title, ID, mood, use case… Try "breaking news"'
          className="h-11"
        />
        <Button type="submit" size="lg" className="h-11 px-4">
          <Search aria-hidden="true" />
          Search
        </Button>
      </form>
      <form action="/library" className="flex gap-2">
        <HiddenParams input={input} omit={["sort", "page"]} />
        <label className="sr-only" htmlFor="library-sort">
          Sort results
        </label>
        <select
          id="library-sort"
          name="sort"
          defaultValue={input.sort}
          className="h-11 w-full rounded-lg border border-input bg-surface px-3 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/20 sm:w-44"
        >
          <option value="relevance">Relevance</option>
          <option value="newest">Newest</option>
          <option value="oldest">Oldest</option>
          <option value="title_asc">Title A–Z</option>
          <option value="shortest">Shortest</option>
          <option value="longest">Longest</option>
          <option value="bpm_asc">BPM low–high</option>
          <option value="bpm_desc">BPM high–low</option>
        </select>
        <Button type="submit" variant="outline" size="lg" className="h-11">
          Sort
        </Button>
      </form>
    </div>
  );
}
