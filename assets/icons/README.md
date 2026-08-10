# Icon Generation

This extension requires PNG icons in three sizes: 16x16, 48x48, and 128x128 pixels.

## Quick Setup

1. Use the provided `icon.svg` file
2. Convert it to PNG using one of these methods:

### Option 1: Online Converter
- Visit https://cloudconvert.com/svg-to-png or similar
- Upload `icon.svg`
- Generate sizes: 16x16, 48x48, 128x128
- Save as `icon16.png`, `icon48.png`, `icon128.png` in this directory

### Option 2: ImageMagick (Command Line)
```bash
convert icon.svg -resize 16x16 icon16.png
convert icon.svg -resize 48x48 icon48.png
convert icon.svg -resize 128x128 icon128.png
```

### Option 3: Create Simple Colored Icons
If you prefer, you can create simple colored square icons with a book emoji or "M" letter using any image editor.

## Icon Design
The icon uses a gradient background (purple to violet) with a book emoji, matching the extension's theme.

