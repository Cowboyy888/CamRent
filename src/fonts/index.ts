import localFont from "next/font/local";

/**
 * Self-hosted variable fonts (SIL Open Font License, see LICENSE-*.txt).
 * Self-hosting avoids a build-time dependency on Google Fonts, so builds work
 * offline and in locked-down CI. Simplified Chinese uses system fonts.
 */
export const inter = localFont({
  src: "./inter-latin-variable.woff2",
  weight: "100 900",
  variable: "--font-inter",
  display: "swap",
});

export const jakarta = localFont({
  src: "./plus-jakarta-sans-latin-variable.woff2",
  weight: "200 800",
  variable: "--font-jakarta",
  display: "swap",
});

/**
 * Khmer script only. Not preloaded: the browser downloads it only on pages
 * that actually render Khmer text.
 */
export const kantumruy = localFont({
  src: "./kantumruy-pro-khmer-variable.woff2",
  weight: "100 700",
  variable: "--font-kantumruy",
  display: "swap",
  preload: false,
});

export const fontVariables = [inter.variable, jakarta.variable, kantumruy.variable].join(" ");
