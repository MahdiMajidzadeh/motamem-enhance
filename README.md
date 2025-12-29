# Motammem Blog Enhancer - Chrome Extension

A Chrome extension for saving and managing blog posts from Motammem blog to "to read" and "read" lists.

## Features

- ✅ Add posts to "To Read" or "Read" lists when visiting a post
- ✅ View all saved posts in a full-page interface with pagination
- ✅ Hover over links to quickly add them to lists
- ✅ Export and import your saved posts (JSON format)
- ✅ Modern, minimal UI design
- ✅ Automatic title and URL extraction
- ✅ Move posts between lists
- ✅ Remove posts from lists

## Installation

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" (toggle in top right)
3. Click "Load unpacked"
4. Select the `motamem-enhance` directory
5. The extension is now installed!

## Usage

### Adding Posts

**Method 1: On Post Pages**
- When visiting a blog post, you'll see floating action buttons in the bottom-right corner
- Click "📖 To Read" or "✓ Read" to add the current post

**Method 2: Via Extension Popup**
- Click the extension icon in Chrome toolbar
- Use the "Add to To Read" or "Add to Read" buttons

**Method 3: Hover on Links**
- Hover over any link on the blog (wait ~500ms)
- A tooltip will appear with quick-add buttons
- Click to add the linked post to your list

### Viewing Saved Posts

- Click the extension icon and select "View Saved Posts"
- Or open the extension popup and click "View Saved Posts"
- Switch between "To Read" and "Read" tabs
- Use pagination to navigate through your saved posts

### Managing Posts

- **Move between lists**: Click "Mark as Read" or "Move to To Read" buttons
- **Remove posts**: Click the "Remove" button
- **Open posts**: Click on the post title or URL

### Export/Import

- **Export**: Click "Export" in popup or saved posts page to download a JSON file
- **Import**: Click "Import" and select a previously exported JSON file
- Duplicate URLs are automatically skipped during import

## File Structure

```
motamem-enhance/
├── manifest.json              # Extension configuration
├── background/
│   └── service-worker.js       # Background service worker
├── content/
│   ├── content-script.js       # Content script for blog pages
│   └── content-script.css      # Styles for injected UI
├── popup/
│   ├── popup.html              # Extension popup UI
│   ├── popup.js                # Popup logic
│   └── popup.css               # Popup styles
├── pages/
│   ├── saved-posts.html        # Full-page saved posts view
│   ├── saved-posts.js          # Saved posts logic
│   └── saved-posts.css         # Saved posts styles
├── shared/
│   ├── storage.js              # Storage utility functions
│   └── utils.js                # Shared utilities
└── assets/
    └── icons/                  # Extension icons
```

## Technical Details

- **Manifest Version**: 3
- **Storage**: Chrome Storage API (local storage)
- **Permissions**: `storage`, `activeTab`, `tabs`
- **Host Permissions**: `*://motamem.org/*`, `*://*.motamem.org/*`

## Data Format

Saved posts are stored with the following structure:
```json
{
  "toRead": [
    {
      "url": "https://motamem.org/post/example",
      "title": "Post Title",
      "addedAt": 1234567890123
    }
  ],
  "read": [...]
}
```

## Development

The extension uses vanilla JavaScript with no external dependencies. All Chrome Extension APIs are used directly.

## Notes

- The extension only works on Motammem blog domains (`motamem.org`)
- Posts are stored locally in your browser
- Export your data regularly to backup your saved posts
- The extension automatically prevents duplicate entries

## License

MIT

