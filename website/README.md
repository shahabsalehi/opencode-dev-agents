# Agents Website

Professional landing page for the opencode-dev-agents project.

## Logo Setup

1. Replace `public/logo.svg` with your actual logo
2. Replace `public/favicon.svg` with your favicon
3. Ensure the logo works in both light and dark modes

## Development

```bash
cd website
npm install
npm run dev
```

## Build

```bash
npm run build
```

## Deployment

This site is configured for Vercel deployment. Push to GitHub and connect to Vercel.

## Structure

- `src/components/` - Astro components for each section
- `src/layouts/` - Page layouts
- `src/pages/` - Pages (currently just index)
- `public/` - Static assets (logo, favicon)

## Notes

- Dark mode is default, toggle available in header
- All links to OpenCode are clearly marked as third-party
- Includes disclaimer about not being affiliated with OpenCode
- Copy-to-clipboard functionality for install commands
