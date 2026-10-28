```
--color-space-indigo-50: oklch(95% 0.015 273.85);
--color-space-indigo-100: oklch(89.84% 0.032 277.90);
--color-space-indigo-200: oklch(79.52% 0.066 277.09);
--color-space-indigo-300: oklch(69.09% 0.102 275.83);
--color-space-indigo-400: oklch(58.65% 0.141 273.83);
--color-space-indigo-500: oklch(48.57% 0.180 270.64);
--color-space-indigo-600: oklch(41.58% 0.150 270.89);
--color-space-indigo-700: oklch(34.29% 0.119 271.28);
--color-space-indigo-800: oklch(26.61% 0.085 271.96);
--color-space-indigo-900: oklch(18.38% 0.047 273.47);
--color-space-indigo-950: oklch(15.64% 0.034 273.44);

--color-ocean-deep-50: oklch(95.79% 0.012 247.95);
--color-ocean-deep-100: oklch(91.59% 0.025 249.96);
--color-ocean-deep-200: oklch(83.13% 0.052 250.25);
--color-ocean-deep-300: oklch(74.69% 0.078 250.66);
--color-ocean-deep-400: oklch(66.29% 0.106 251.27);
--color-ocean-deep-500: oklch(58.14% 0.134 252.50);
--color-ocean-deep-600: oklch(49.57% 0.111 252.38);
--color-ocean-deep-700: oklch(40.61% 0.087 252.20);
--color-ocean-deep-800: oklch(31.16% 0.064 251.98);
--color-ocean-deep-900: oklch(20.92% 0.036 251.41);
--color-ocean-deep-950: oklch(17.80% 0.026 249.14);

--color-dark-amaranth-50: oklch(94.58% 0.031 352.44);
--color-dark-amaranth-100: oklch(89.53% 0.063 352.98);
--color-dark-amaranth-200: oklch(79.89% 0.129 356.01);
--color-dark-amaranth-300: oklch(71.86% 0.193 359.18);
--color-dark-amaranth-400: oklch(66.29% 0.239 4.41);
--color-dark-amaranth-500: oklch(63.79% 0.255 11.71);
--color-dark-amaranth-600: oklch(53.94% 0.216 11.25);
--color-dark-amaranth-700: oklch(43.65% 0.175 10.03);
--color-dark-amaranth-800: oklch(32.68% 0.131 8.40);
--color-dark-amaranth-900: oklch(20.71% 0.083 2.86);
--color-dark-amaranth-950: oklch(16.87% 0.068 359.76);

--color-bright-amber-50: oklch(98.31% 0.025 97.11);
--color-bright-amber-100: oklch(96.46% 0.050 96.17);
--color-bright-amber-200: oklch(93.08% 0.096 96.94);
--color-bright-amber-300: oklch(90.22% 0.136 97.13);
--color-bright-amber-400: oklch(87.41% 0.163 95.80);
--color-bright-amber-500: oklch(84.86% 0.172 93.05);
--color-bright-amber-600: oklch(71.88% 0.146 93.48);
--color-bright-amber-700: oklch(58.28% 0.118 94.16);
--color-bright-amber-800: oklch(43.59% 0.087 94.33);
--color-bright-amber-900: oklch(27.89% 0.055 95.32);
--color-bright-amber-950: oklch(22.70% 0.043 96.88);

--color-soft-periwinkle-50: oklch(93.73% 0.028 285.84);
--color-soft-periwinkle-100: oklch(87.47% 0.056 286.29);
--color-soft-periwinkle-200: oklch(74.75% 0.120 284.74);
--color-soft-periwinkle-300: oklch(62.49% 0.182 281.17);
--color-soft-periwinkle-400: oklch(51.40% 0.241 275.32);
--color-soft-periwinkle-500: oklch(43.75% 0.280 267.36);
--color-soft-periwinkle-600: oklch(37.28% 0.236 267.81);
--color-soft-periwinkle-700: oklch(30.50% 0.188 268.62);
--color-soft-periwinkle-800: oklch(23.45% 0.138 270.17);
--color-soft-periwinkle-900: oklch(15.88% 0.080 273.91);
--color-soft-periwinkle-950: oklch(13.11% 0.063 275.84);
```

Rules:

**For light mode:**

- Main page background color => neutral white
- Foreground text => neutral gray-950
- Muted text => neutral gray-600
- Surfaces => neutral gray-50/gray-200
- Borders => 10% black
- Primary => soft-periwinkle-400
- Secondary and accent => neutral gray

**For dark mode:**

- Site background color => neutral gray-950
- Foreground text => neutral gray-50
- Muted text => neutral gray-400
- Surfaces => neutral gray-900/gray-800
- Primary, secondary, and accent => neutral gray

## Admin palette

The CMS uses the `admin` accent (`data-accent='admin'`): neutral backgrounds
and surfaces so content previews read true, with a space-indigo accent family
(space-indigo-500 light, space-indigo-400 dark) that marks the CMS apart from
every publication palette. Decided 2026-10-28.

## Publication palettes

Each publication keeps the neutral site background in both color modes
(decided 2026-10-28); its `accent` identity now overrides only the accent
family (accent, accent-foreground, accent-soft, on-accent) used by buttons
and badges:

| Publication | Accent ramp |
| --- | --- |
| The Sore Transition | space-indigo (greyed light-mode accent) |
| The Rebellious Flame | dark-amaranth |
| My Soulful Incantations | ocean-deep |
