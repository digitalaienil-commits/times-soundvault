# Times SoundVault brand asset

The repository currently includes the supplied Gaana/Mirchi partner lockup as:

`mirchi-logo.svg`

The original vector paths, colours and aspect ratio must be preserved. Do not
stretch, recolour, trace, crop or recreate the mark.

`BrandLockup` also supports one of these exact filenames when an approved asset
is replaced in future:

1. `mirchi-logo.svg` — preferred
2. `mirchi-logo.png` — fallback

Use an approved source, a transparent background, and a tightly fitted canvas.
SVG files should include a correct `viewBox`.

`BrandLockup` checks for SVG before PNG at server render/build time and preserves
the supplied image with `object-contain`. It uses a spacious stacked treatment
in desktop and sheet navigation and a compact treatment in the mobile top bar.
If neither file exists, it renders real “Mirchi” and “Times SoundVault” text
with a neutral audio icon. That fallback is not an official logo.
