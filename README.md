# SnapSortr

**Fast, private, browser-based image curation — your photos never leave your device.**

🌐 [snapsortr.com](https://snapsortr.com) &nbsp;·&nbsp; Works offline &nbsp;·&nbsp; No account required &nbsp;·&nbsp; Chrome / Edge

---

## What is SnapSortr?

SnapSortr is a high-performance web tool for rapidly reviewing and sorting large collections of local images. Select a folder from your disk, browse through images at speed, and mark each one as **Take**, **Drop**, or **Undecided** — then export only the photos you want, with your original folder structure preserved.

Built for photographers, content teams, and anyone who has ever stared at thousands of raw shots and wished there was a faster way to cull them.

---

## Privacy First

> **Your images never leave your device. Ever.**

- SnapSortr uses the [File System Access API](https://developer.mozilla.org/en-US/docs/Web/API/File_System_API) to read files directly from your local disk.
- No images, filenames, or metadata are uploaded to any server.
- No analytics on your files. No cloud sync. No account.
- All session progress is saved locally in your browser's IndexedDB.
- Works fully offline after the initial page load.

---

## Features

### Core workflow
- **Select a folder** — recursively scans all supported image formats instantly.
- **Review images** — single-image view or virtualized grid, whichever is faster for you.
- **Mark decisions** — Take ✓, Drop ✗, or leave Undecided. Changes auto-save as you go.
- **Export** — download a ZIP or copy files directly to a folder, preserving the original directory structure.

### Built for speed
- **Keyboard-first** — sort through images without touching the mouse.
- **Virtualized grid** — thousands of thumbnails rendered without lag.
- **Instant navigation** — blob URLs are created on demand and revoked immediately after use; no memory bloat.
- **Streaming scan** — images appear progressively as the folder is scanned.

### Never lose your progress
- Progress auto-saves to IndexedDB on every decision.
- **Session history** — resume any past session with one click, across browser restarts.
- **Export progress JSON** — download a full record of your decisions to back up or share.
- **Import progress JSON** — restore a previous session's decisions on any machine.

---

## Keyboard Shortcuts

| Key | Action |
|---|---|
| `→` / `l` | Next image |
| `←` / `h` | Previous image |
| `j` | **Take** + advance |
| `f` | **Drop** + advance |
| `t` | Mark taken (stay) |
| `d` | Mark dropped (stay) |
| `u` / `s` | Mark undecided (stay) |
| `z` / `Enter` | Open fullscreen viewer |
| `Escape` | Close fullscreen viewer |
| `g` | Toggle grid / single view |

---

## Supported Formats

`JPG` · `PNG` · `GIF` · `WebP` · `AVIF` · `BMP` · `TIFF` · `HEIC` · `HEIF` · `SVG`

---

## Browser Support

SnapSortr requires the **File System Access API**, which is available in:

| Browser | Supported |
|---|---|
| Chrome 86+ | ✅ |
| Edge 86+ | ✅ |
| Firefox | ❌ |
| Safari | ❌ |

---

## Export Options

### ZIP Download
Packages your selected images into a `.zip` file and triggers a browser download. Works in all supported browsers, no extra permissions needed.

### Save to Folder
Writes files directly to a folder you choose on your disk. Requires read/write permission via the File System Access API.

Both options support:
- **Preserve folder structure** — files are placed in the same subdirectory layout as the original.
- **Flat export** — all files in one flat directory.

Export targets: **Taken**, **Dropped**, **Undecided**, or **All**.

---

## Tech Stack

| Layer | Technology |
|---|---|
| UI | React 19 |
| Language | TypeScript 5.7 |
| State | Zustand 5 |
| Persistence | IndexedDB (`idb`) |
| Virtualisation | `@tanstack/react-virtual` |
| Fullscreen viewer | `yet-another-react-lightbox` |
| ZIP export | `jszip` |
| Styling | Tailwind CSS v3 |
| Build | Vite 6 |

---

## Running Locally

```bash
# Install dependencies
npm install

# Start dev server
npm run dev
# → http://localhost:5173

# Type-check
npx tsc --noEmit

# Production build
npm run build
```

---

## License

MIT

