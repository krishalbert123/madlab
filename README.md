# CodeArena + Flutter Scaffold

This workspace contains:

- A browser-based CodeArena web app extracted into modular files:
  - `index.html`
  - `css/style.css`
  - `js/questions.js`
  - `js/app.js`
- A Flutter app scaffold under `flutter_app/` for a native mobile experience.

## Web app

Open `index.html` in a browser, or serve the folder with a static server:

```bash
cd /workspaces/madlab
python3 -m http.server 8000
```

Then open http://localhost:8000.

## Flutter app

The Flutter project is scaffolded in `flutter_app/` but this environment currently does not have Flutter installed or available on PATH, so it could not be executed here. The app is laid out as a standard Flutter project and is ready to run on a machine with the Flutter SDK installed.

```bash
cd /workspaces/madlab/flutter_app
flutter pub get
flutter run
```

## Notes

- The original single-file web implementation was preserved as a starting point and then split into separate HTML/CSS/JS files.
- The browser app intentionally keeps the original functionality and UX while being easier to maintain.
- The Flutter app is a starter implementation based on the same CodeArena concept and can be expanded into a full feature set once the SDK is available.
