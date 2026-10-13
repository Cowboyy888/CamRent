import Link from "next/link";
import { Field, Input, Select } from "@/components/ui/field";
import { Icon } from "@/components/ui/icon";
import { buttonClasses } from "@/components/ui/button";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries";
import { localizedPath } from "@/i18n/paths";
import { cn } from "@/lib/cn";
import {
  MAX_SEARCH_PRICE_USD,
  type PropertySearchCriteria,
} from "@/lib/validation/property-search";
import {
  availabilityFilters,
  bathroomOptions,
  bedroomOptions,
  commercialTypes,
  furnishingStatuses,
  propertyCategories,
  residentialTypes,
  sortOptions,
} from "@/types/property";

interface SearchPanelProps {
  locale: Locale;
  dict: Dictionary;
  initial?: Partial<PropertySearchCriteria>;
  /** Show bathrooms, furnishing, availability and sort as well. */
  extended?: boolean;
  /** Prefix for element ids when more than one panel is on a page. */
  idPrefix?: string;
  className?: string;
}

/**
 * Property search form. A plain GET form to /{locale}/properties: it works
 * without JavaScript and every filter ends up in a shareable URL.
 */
export function SearchPanel({
  locale,
  dict,
  initial,
  extended = false,
  idPrefix = "search",
  className,
}: SearchPanelProps) {
  const t = dict.search;
  const id = (name: string) => `${idPrefix}-${name}`;
  const categoryChoices = [
    { value: "", label: t.any },
    ...propertyCategories.map((value) => ({ value, label: t[value] })),
  ];

  return (
    <form
      action={localizedPath(locale, "/properties")}
      method="get"
      role="search"
      aria-label={t.formLabel}
      className={cn("rounded-panel bg-white p-4 shadow-panel sm:p-6", className)}
    >
      <fieldset>
        <legend className="sr-only">{t.category}</legend>
        <div className="flex flex-wrap gap-2">
          {categoryChoices.map((choice) => (
            <label
              key={choice.value || "any"}
              className="relative cursor-pointer rounded-full bg-sand-100 px-4 py-2 text-sm font-semibold text-ink-soft transition-colors has-checked:bg-ink has-checked:text-white has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-mekong-500"
            >
              <input
                type="radio"
                name="category"
                value={choice.value}
                defaultChecked={(initial?.category ?? "") === choice.value}
                className="sr-only"
              />
              {choice.label}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4 lg:items-end">
        <Field id={id("area")} label={t.area}>
          <Input
            id={id("area")}
            name="area"
            type="text"
            maxLength={80}
            autoComplete="off"
            placeholder={t.areaPlaceholder}
            defaultValue={initial?.area ?? ""}
          />
        </Field>

        <Field id={id("type")} label={t.propertyType}>
          <Select id={id("type")} name="type" defaultValue={initial?.type ?? ""}>
            <option value="">{t.anyType}</option>
            <optgroup label={t.residential}>
              {residentialTypes.map((type) => (
                <option key={type} value={type}>
                  {dict.propertyTypes[type]}
                </option>
              ))}
            </optgroup>
            <optgroup label={t.commercial}>
              {commercialTypes.map((type) => (
                <option key={type} value={type}>
                  {dict.propertyTypes[type]}
                </option>
              ))}
            </optgroup>
          </Select>
        </Field>

        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-1.5 text-sm font-semibold text-ink-soft">{t.budget}</legend>
          <div className="flex items-center gap-2">
            <label htmlFor={id("min")} className="sr-only">
              {t.minPrice}
            </label>
            <Input
              id={id("min")}
              name="minPrice"
              type="number"
              inputMode="numeric"
              min={0}
              max={MAX_SEARCH_PRICE_USD}
              step={50}
              placeholder={t.minPrice}
              defaultValue={initial?.minPrice ?? ""}
            />
            <span aria-hidden="true" className="text-muted">
              –
            </span>
            <label htmlFor={id("max")} className="sr-only">
              {t.maxPrice}
            </label>
            <Input
              id={id("max")}
              name="maxPrice"
              type="number"
              inputMode="numeric"
              min={0}
              max={MAX_SEARCH_PRICE_USD}
              step={50}
              placeholder={t.maxPrice}
              defaultValue={initial?.maxPrice ?? ""}
            />
          </div>
        </fieldset>

        <Field id={id("beds")} label={t.bedrooms}>
          <Select id={id("beds")} name="beds" defaultValue={initial?.beds ?? ""}>
            <option value="">{t.anyBedrooms}</option>
            {bedroomOptions.map((option) => (
              <option key={option} value={option}>
                {dict.bedroomOptions[option]}
              </option>
            ))}
          </Select>
        </Field>

        {extended ? (
          <>
            <Field id={id("baths")} label={t.bathrooms}>
              <Select id={id("baths")} name="baths" defaultValue={initial?.baths ?? ""}>
                <option value="">{t.anyBathrooms}</option>
                {bathroomOptions.map((option) => (
                  <option key={option} value={option}>
                    {dict.bathroomOptions[option]}
                  </option>
                ))}
              </Select>
            </Field>

            <Field id={id("furnishing")} label={t.furnishing}>
              <Select
                id={id("furnishing")}
                name="furnishing"
                defaultValue={initial?.furnishing ?? ""}
              >
                <option value="">{t.anyFurnishing}</option>
                {furnishingStatuses.map((option) => (
                  <option key={option} value={option}>
                    {dict.furnishingOptions[option]}
                  </option>
                ))}
              </Select>
            </Field>

            <Field id={id("availability")} label={t.availability}>
              <Select
                id={id("availability")}
                name="availability"
                defaultValue={initial?.availability ?? ""}
              >
                <option value="">{t.anyAvailability}</option>
                {availabilityFilters.map((option) => (
                  <option key={option} value={option}>
                    {dict.availabilityOptions[option]}
                  </option>
                ))}
              </Select>
            </Field>

            <Field id={id("sort")} label={t.sort}>
              <Select id={id("sort")} name="sort" defaultValue={initial?.sort ?? "newest"}>
                {sortOptions.map((option) => (
                  <option key={option} value={option}>
                    {dict.sortOptions[option]}
                  </option>
                ))}
              </Select>
            </Field>
          </>
        ) : null}
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button type="submit" className={buttonClasses({ size: "lg", className: "w-full sm:w-auto" })}>
          <Icon name="search" className="size-5" />
          {t.submit}
        </button>
        {extended ? (
          <Link
            href={localizedPath(locale, "/properties")}
            className="text-sm font-semibold text-mekong-700 hover:underline"
          >
            {t.reset}
          </Link>
        ) : null}
      </div>
    </form>
  );
}
