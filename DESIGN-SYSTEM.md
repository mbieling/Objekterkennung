# BBS Design System

> Dieses Dokument beschreibt das Design-System aller BBS-Apps.
> Alle Konfigurationsdateien sind direkt kopierbar (siehe Abschnitt „Setup neue App").

---

## 1. Markenfarben

### Primär — BBS Orange
| Token | Hex | Verwendung |
|-------|-----|-----------|
| `bbs.orange.500` / `--primary` | `#f29000` | Buttons, Links, Fokus-Ring, aktive Zustände |
| `bbs.orange.100` | `#fff0d4` | Leichte Hintergründe, Hover-Flächen |
| `bbs.orange.600` | `#e37800` | Hover auf primären Buttons |
| `bbs.orange.800` | `#964808` | Text auf hellem Hintergrund |

### Sekundär — BBS Blau
| Token | Hex | Verwendung |
|-------|-----|-----------|
| `bbs.blue.500` / `--secondary` | `#007cba` | Sekundäre Aktionen, Links, Info-Badges |
| `bbs.blue.100` | `#d9ecff` | Hintergründe für Info-Bereiche |

### Grau / Neutral
| Token | Hex | Verwendung |
|-------|-----|-----------|
| `bbs.gray` | `#222221` | Primärer Textfarbe (fast Schwarz) |
| `bbs.gray-light` | `#404040` | Sekundärer Text |

---

## 2. CSS-Variablen (shadcn/ui kompatibel)

```css
:root {
  --background: 0 0% 98.5%;          /* Seitenhintergrund: fast weiß */
  --foreground: 220 15% 15%;         /* Primärer Text: dunkelgrau */
  --card: 0 0% 100%;                 /* Karten-Hintergrund: weiß */
  --card-foreground: 220 15% 15%;
  --popover: 0 0% 100%;
  --popover-foreground: 220 15% 15%;
  --primary: 38 100% 47.5%;          /* BBS Orange #f29000 */
  --primary-foreground: 0 0% 100%;   /* Weiß auf Orange */
  --secondary: 207 80% 38%;          /* BBS Blau #007cba */
  --secondary-foreground: 0 0% 100%;
  --muted: 220 14% 96%;              /* Gedämpfte Flächen */
  --muted-foreground: 220 10% 46%;   /* Gedämpfter Text */
  --accent: 38 100% 96%;             /* Sehr helles Orange */
  --accent-foreground: 38 100% 30%;
  --destructive: 0 84.2% 60.2%;      /* Rot für Fehler/Löschen */
  --destructive-foreground: 0 0% 98%;
  --border: 220 13% 91%;             /* Rahmenfarbe */
  --input: 220 13% 91%;              /* Input-Rahmen */
  --ring: 38 100% 47.5%;             /* Fokus-Ring: BBS Orange */
  --radius: 0.5rem;                  /* Einheitlicher Border-Radius */
}
```

---

## 3. Typografie

- **Font:** Inter (Google Fonts)
- **Import:** `https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap`
- **Fallback:** `system-ui, -apple-system, sans-serif`
- **Rendering:** `-webkit-font-smoothing: antialiased`

| Stil | Klassen | Verwendung |
|------|---------|-----------|
| Seitentitel | `text-2xl font-bold` | PageHeader h1 |
| Abschnittstitel | `text-lg font-semibold` | Karten-Überschriften |
| Body | `text-sm` | Standard-Text in der App |
| Hilfetexte | `text-xs text-muted-foreground` | Beschreibungen, Labels |
| Code/Mono | `font-mono text-xs` | IDs, Dateinamen, Pfade |

---

## 4. Abstände & Layout

- **Max-Breite:** `max-w-[1600px]` (sehr breite Bildschirme)
- **Seitenabstand:** `px-4 md:px-6 lg:px-8`
- **Seiten-Padding:** `py-4 md:py-8`
- **Karten-Abstand:** `gap-4` bis `gap-6`
- **Formular-Zeilen:** `space-y-4`
- **Tabellen-Zeilen:** `py-2` bis `py-3` vertikal, `px-3` bis `px-4` horizontal

---

## 5. Komponenten-Regeln

### Buttons
```tsx
// Primär (Hauptaktion)
<Button>Speichern</Button>

// Sekundär (Nebenartion)
<Button variant="outline">Abbrechen</Button>

// Gefahrenaktion
<Button variant="destructive">Löschen</Button>

// Icon-Button (klein)
<Button variant="ghost" size="sm"><Trash2 className="w-4 h-4" /></Button>
```

### Karten
```tsx
<Card>
  <CardHeader>
    <CardTitle>Titel</CardTitle>
  </CardHeader>
  <CardContent>Inhalt</CardContent>
</Card>
```

### Formulare
```tsx
<div className="space-y-1">
  <Label htmlFor="feld">Label</Label>
  <Input id="feld" placeholder="..." />
  <p className="text-xs text-muted-foreground">Hilfetext</p>
</div>
```

### Dialoge
```tsx
// Bestätigungen immer AlertDialog, niemals window.confirm()
<AlertDialog>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>Sicher?</AlertDialogTitle>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel>Abbrechen</AlertDialogCancel>
      <AlertDialogAction>Bestätigen</AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

### Feedback
```tsx
// Toasts für alle Aktionsergebnisse, niemals alert()
const { toast } = useToast();
toast({ title: 'Gespeichert' });
toast({ title: 'Fehler', variant: 'destructive' });
```

---

## 6. Status-Farben

| Status | Farbe | Klassen |
|--------|-------|---------|
| Erfolg | Grün | `bg-green-50 text-green-800` / `text-green-700` |
| Warnung | Amber | `bg-amber-50 text-amber-800` / `text-amber-500` |
| Fehler | Rot | `bg-red-50 text-red-800` / `text-red-600` |
| Info | Blau | `bg-blue-50 text-blue-800` / `text-blue-600` |
| Neutral | Grau | `bg-muted text-muted-foreground` |

---

## 7. Animationen

```css
/* Seitenübergang / Erscheinen */
.animate-fade-in {
  animation: fade-in 0.3s ease-out;
}

/* Elemente von unten */
.animate-slide-up {
  animation: slide-up 0.3s ease-out;
}

@keyframes fade-in {
  from { opacity: 0; }
  to   { opacity: 1; }
}

@keyframes slide-up {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
}
```

Verwendung: `className="animate-fade-in"` auf Seiten-Wrapper und Haupt-Tabs.

---

## 8. Icons

Bibliothek: **lucide-react** (konsistent, tree-shakeable)

```bash
npm install lucide-react
```

Standard-Größen:
- Navigation / Buttons: `w-4 h-4`
- Karten-Icons: `w-5 h-5`
- Leere Zustände: `w-10 h-10 text-muted-foreground`
- Status-Icons: `w-4 h-4 shrink-0`

---

## 9. Gemeinsame Seiten-Komponenten

### PageHeader
```tsx
<PageHeader
  title="Seitenname"
  description="Kurze Beschreibung was hier passiert"
  breadcrumbs={[{ label: 'Start', href: '/' }, { label: 'Aktuell' }]}
  actions={<Button>Neu anlegen</Button>}
/>
```

### EmptyState
```tsx
<EmptyState
  icon={FolderOpen}
  title="Noch keine Einträge"
  description="Legen Sie den ersten Eintrag an."
  action={{ label: 'Neu anlegen', onClick: () => {} }}
/>
```

### LoadingSkeleton
```tsx
<LoadingSkeleton variant="page" />      // Ganze Seite
<LoadingSkeleton variant="card-grid" /> // Karten-Raster
<LoadingSkeleton variant="table" />     // Tabelle
<LoadingSkeleton variant="form" />      // Formular
```

---

## 10. Dos & Don'ts

| ✅ Do | ❌ Don't |
|-------|----------|
| shadcn/ui-Komponenten nutzen | Eigene Button/Input/Modal bauen |
| `useToast()` für Feedback | `alert()` / `window.confirm()` |
| `<AlertDialog>` für Bestätigungen | native Browser-Dialoge |
| `text-muted-foreground` für Hilfetexte | Inline `color: gray` |
| Lucide-Icons durchgehend | Gemischte Icon-Bibliotheken |
| `font-medium` für Labels | Fette Labels (`font-bold`) |
| Responsive: `md:` / `lg:` Breakpoints | Feste Pixel-Breiten |

---

## Setup neue App

### 1. Pakete installieren
```bash
npm create vite@latest meine-app -- --template react-ts
cd meine-app
npm install tailwindcss @tailwindcss/typography tailwindcss-animate
npm install lucide-react @tanstack/react-query axios
npx shadcn@latest init
```

### 2. shadcn-Komponenten installieren
```bash
npx shadcn@latest add button input label card dialog alert-dialog \
  tabs select badge skeleton table separator tooltip sheet \
  breadcrumb textarea checkbox switch dropdown-menu
```

### 3. tailwind.config.ts kopieren
Datei `DESIGN-SYSTEM-files/tailwind.config.ts` aus diesem Repo kopieren.

### 4. index.css kopieren
Datei `DESIGN-SYSTEM-files/index.css` aus diesem Repo kopieren.

### 5. Gemeinsame Komponenten kopieren
Ordner `DESIGN-SYSTEM-files/components/` in `src/components/common/` kopieren:
- `PageHeader.tsx`
- `EmptyState.tsx`
- `LoadingSkeleton.tsx`

---

*Design-System Version 1.0 — Nexus App (BBS Automation Stuttgart GmbH)*
