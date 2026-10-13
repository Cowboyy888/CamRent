import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ListingsEmptyState } from "@/components/property/listings-empty-state";
import { PropertyCard } from "@/components/property/property-card";
import { SearchPanel } from "@/components/property/search-panel";
import { loadDictionary } from "@/i18n/dictionaries";
import type { PropertyCardData } from "@/types/property";

/** Test fixture only. The website never renders invented listings. */
const fixture: PropertyCardData = {
  reference: "PP-R-SA-00123",
  href: "/en/rent/residential/phnom-penh/bkk1/test-pp-r-sa-00123",
  category: "residential",
  type: "serviced_apartment",
  title: "2-Bed Serviced Apartment",
  areaName: "BKK1, Chamkarmon",
  rent: { amountMinor: 120_000, currency: "USD" },
  bedrooms: 2,
  bathrooms: 2,
  floorArea: { value: 95, unit: "sqm" },
  availability: "available_from",
  availableFrom: "2026-11-01",
  coverImage: null,
};

describe("PropertyCard", () => {
  it("shows facts first: price, area, key facts, availability and reference", async () => {
    const html = renderToStaticMarkup(
      <PropertyCard property={fixture} locale="en" dict={await loadDictionary("en")} />,
    );
    expect(html).toContain("USD 1,200");
    expect(html).toContain("/ month");
    expect(html).toContain("BKK1, Chamkarmon");
    expect(html).toContain("2 bd");
    expect(html).toContain("95 m²");
    expect(html).toContain("Available from 1 Nov 2026");
    expect(html).toContain("Ref. PP-R-SA-00123");
    expect(html).toContain(`href="${fixture.href}"`);
  });

  it("marks reserved units and shows studios correctly", async () => {
    const html = renderToStaticMarkup(
      <PropertyCard
        property={{ ...fixture, availability: "reserved", bedrooms: 0 }}
        locale="en"
        dict={await loadDictionary("en")}
      />,
    );
    expect(html).toContain("Reserved");
    expect(html).toContain("Studio");
  });

  it("renders the same price in every language", async () => {
    for (const locale of ["en", "km", "zh"] as const) {
      const html = renderToStaticMarkup(
        <PropertyCard property={fixture} locale={locale} dict={await loadDictionary(locale)} />,
      );
      expect(html).toContain("USD 1,200");
    }
  });
});

describe("SearchPanel", () => {
  it("is a GET form to the localised search page with a label for every control", async () => {
    const html = renderToStaticMarkup(
      <SearchPanel locale="km" dict={await loadDictionary("km")} idPrefix="t" />,
    );
    expect(html).toContain('action="/km/properties"');
    expect(html).toContain('method="get"');
    expect(html).toContain('role="search"');

    const ids = [...html.matchAll(/<(?:input|select)[^>]*\sid="([^"]+)"/g)].map((m) => m[1]);
    expect(ids.length).toBeGreaterThanOrEqual(5);
    for (const id of ids) {
      expect(html, `label for #${id}`).toContain(`for="${id}"`);
    }
  });

  it("prefills from parsed criteria", async () => {
    const html = renderToStaticMarkup(
      <SearchPanel
        locale="en"
        dict={await loadDictionary("en")}
        initial={{ category: "commercial", area: "Toul Kork", minPrice: 500, sort: "newest", page: 1 }}
      />,
    );
    expect(html).toMatch(/value="commercial"[^>]*checked|checked[^>]*value="commercial"/);
    expect(html).toContain('value="Toul Kork"');
    expect(html).toContain('value="500"');
  });
});

describe("ListingsEmptyState", () => {
  it("renders a heading, explanation and call to action", () => {
    const html = renderToStaticMarkup(
      <ListingsEmptyState title="No listings yet" body="Coming soon" ctaLabel="Contact" ctaHref="/en/contact" headingLevel="h2" />,
    );
    expect(html).toContain("<h2");
    expect(html).toContain("No listings yet");
    expect(html).toContain('href="/en/contact"');
  });
});
