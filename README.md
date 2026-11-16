# T7P Arcade

Anime, Marvel and DC character games by TEAM7PIRATES. An offline-first web app (PWA): open it once with internet, install it to your home screen, and it works without internet after that.

## What's in here

| Folder / file | What it is |
| --- | --- |
| `index.html` | The page that loads the app |
| `manifest.webmanifest` | Name, icons and colors used when the app is installed |
| `sw.js` | Offline support: saves every file on the phone |
| `core/` | The shared code every mode uses (saves, settings, characters, screens) |
| `core/screens/` | Loading screen, main menu, Pick Your Icon, Settings, About, My Records |
| `core/grid.js`, `core/grid-board.js` | Grid core: makes solvable grids and draws the board (Grids, Gauntlet) |
| `modes/` | One file per mode: `grids.js`, `gauntlet.js` (Wave 1); more added wave by wave |
| `styles/` | Colors and text styles from the T7P Arcade Design System |
| `fonts/` | Poppins and Inter, bundled for offline play (SIL Open Font License) |
| `icons/` | App icons and logos |
| `data/roster.json` | The character roster, exported from Supabase |
| `portraits/` | Character portraits named by ID (`212.webp`), added later |

## Releasing an update

1. Change the files.
2. Bump the version to the same number in **both** `core/version.js` (`APP_VERSION`) and `sw.js` (`CACHE_VERSION`).
3. Add a new entry at the top of `whats-new.json` with the same version number and a list of what changed. Players see it in the update pop-up and on the About page.
4. If you added a new file, add it to the `APP_FILES` list in `sw.js`.
5. Commit and push. Players get a pop-up with what's new and an Update now button.

## Testing on your computer

The app must be served over http, not opened as a file. From this folder:

```
python -m http.server 8000
```

Then open http://localhost:8000.
