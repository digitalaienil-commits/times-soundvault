# Design system

## Principles

Times SoundVault is editorial, calm, precise, and professional. Premium means
clear hierarchy, generous rhythm, consistent details, and restrained surfaces.
It does not mean decorative effects or consumer streaming conventions.

## Semantic colour tokens

The light-only V1 palette is defined once in `src/app/globals.css`:

| Token                          | Value     | Use                               |
| ------------------------------ | --------- | --------------------------------- |
| `background`                   | `#F7F6F2` | Warm application canvas           |
| `surface` / `surface-elevated` | `#FFFFFF` | Primary surfaces                  |
| `muted`                        | `#F1F0EB` | Quiet controls and icon wells     |
| `foreground`                   | `#181817` | Strong typography                 |
| `muted-foreground`             | `#6E6D68` | Supporting copy                   |
| `border`                       | `#E5E2DA` | Structural separation             |
| `brand`                        | `#C9342D` | Active states and primary actions |
| `brand-hover`                  | `#A92B25` | Brand interaction state           |
| `brand-soft`                   | `#FCEAE8` | Selected and welcome surfaces     |
| `ring`                         | `#C9342D` | Keyboard focus                    |

Destructive, success, and warning also have semantic tokens. Product components
use token utilities, never repeated palette values. Mirchi red is provisional
and can be updated in one token when official guidance arrives.

## Type, rhythm, and shape

Geist Sans is the interface face and Geist Mono is reserved for identifiers and
tabular numerals. Headings use compact letter spacing; body copy keeps generous
line height. Spacing follows an 8px rhythm with deliberate 4px half-steps for
small alignment. The base radius is 14px, with 12–16px the normal surface
range. Shadows are quiet and secondary to borders.

## Icons and focus

Lucide icons use consistent 16–20px sizes and roughly 1.75px strokes. Decorative
icons are hidden from assistive technology; icon-only controls require explicit
accessible names. Browser focus is never removed without a high-contrast brand
ring and offset.

## Responsive behavior

The desktop shell begins at the `lg` breakpoint with a 256px fixed sidebar and
sticky top bar. Below it, the sidebar becomes an accessible modal sheet with
scroll locking and focus management. Content padding steps from 16px to 24px to
40px. Touch controls target approximately 44px where practical.

## Brand treatment

The navigation shell uses the supplied Gaana/Mirchi partner lockup without
recolouring, tracing or changing its aspect ratio. Desktop and sheet navigation
give the horizontal mark room to breathe and pair it with a restrained
Times SoundVault product label. The mobile top bar uses the compact mark while
keeping the product name available to assistive technology. If the asset is
removed, `BrandLockup` retains a neutral text-and-audio fallback. The browser
app icon remains a provisional audio motif and is not a Mirchi trademark.

## Acceptable and unacceptable styling

Acceptable: warm neutral canvases, white surfaces, semantic borders, one brand
accent, readable supporting copy, restrained hover movement, and clear active
navigation that uses shape plus colour.

Unacceptable: visible gradients, glassmorphism, decorative blobs, random card
colours, excessive pills or badges, tiny low-contrast text, emoji icons, heavy
shadows, unmodified demo styling, or red applied indiscriminately.
