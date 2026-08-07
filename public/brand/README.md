# Approved Mirchi brand asset

Supply one approved asset using one of these exact filenames:

1. `mirchi-logo.svg` — preferred
2. `mirchi-logo.png` — fallback

Use an official source, a transparent background, and a tightly fitted canvas.
SVG files should include a correct `viewBox`. Never stretch, recolour, trace, or
recreate the trademark from an unofficial reference.

`BrandLockup` checks for SVG before PNG at server render/build time and preserves
the supplied image inside a fixed-height, `object-contain` region. If neither
file exists, it renders real “Mirchi” and “Times SoundVault” text with a neutral
audio icon. That fallback is intentionally temporary and is not an official
logo.
