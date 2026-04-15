# Editor Markdown WYSIWYG — Arquitectura

Guía breve para replicar el editor de Daily Check en Swift nativo (macOS/iOS).

## Referencia visual

**Typora** (https://typora.io/) — el editor que queremos replicar. Características clave:

- **WYSIWYG puro**: no hay split view (raw/preview), el usuario edita directamente el markdown renderizado
- **Transformación inline**: escribes `**bold**` y al cerrar el segundo `**` se convierte en **bold** al instante
- **Sin toolbars pesadas**: la interfaz es solo el texto, máximo minimalismo
- **Sin exports**: en nuestro caso, solo queremos edición y guardado como `.md` puro. Nada de PDF, Word, HTML export

El concepto técnico se llama **WYSIWYG Markdown Editor** (también conocido como "live preview editor"). A diferencia de editores split-view (VSCode markdown preview), el usuario ve y edita el mismo canvas renderizado.

## Cómo funciona

Editor inline donde el usuario escribe en el render HTML (no en markdown crudo). Al guardar, el HTML se convierte a markdown.

```
┌─────────────────────────────────────┐
│  Load:                              │
│  markdown → marked → HTML → editor  │
│                                     │
│  Edit:                              │
│  usuario escribe en contenteditable │
│                                     │
│  Save:                              │
│  editor.innerHTML → turndown → md   │
│  → debounce 800ms → API             │
└─────────────────────────────────────┘
```

## Stack (web)

| Librería | Rol | Repo |
|----------|-----|------|
| **marked** | Markdown → HTML | https://github.com/markedjs/marked |
| **turndown** | HTML → Markdown | https://github.com/mixmark-io/turndown |
| **contenteditable** | Editor nativo del navegador | (built-in) |
| **@tailwindcss/typography** | Estilos `.prose` para el HTML | https://github.com/tailwindlabs/tailwindcss-typography |

### Configuración turndown (importante para consistencia)

```ts
new TurndownService({
  headingStyle: 'atx',        // ## en vez de ===
  bulletListMarker: '-',
  codeBlockStyle: 'fenced',   // ``` en vez de indent
  emDelimiter: '_',           // _italic_
  strongDelimiter: '**',      // **bold**
});
```

## Equivalentes en Swift nativo

El patrón se replica así:

| Web | Swift (macOS/iOS) |
|-----|-------------------|
| `contenteditable` div | **NSTextView** (macOS) / **UITextView** (iOS) con `NSAttributedString` |
| `marked` (MD→HTML) | **swift-markdown** de Apple → AST → `NSAttributedString` |
| `turndown` (HTML→MD) | Recorrer el `NSAttributedString` y mapear atributos → markdown |
| `.prose` styles | `NSAttributedString` attributes + `NSParagraphStyle` |

### Librerías sugeridas en Swift

| Necesidad | Librería | Repo |
|-----------|----------|------|
| **Parser MD → AST** (oficial Apple) | swift-markdown | https://github.com/apple/swift-markdown |
| **Render rich + edición** | Down (CommonMark vía cmark) | https://github.com/johnxnguyen/Down |
| **Editor con highlight en vivo** | HighlightedTextEditor | https://github.com/kyle-n/HighlightedTextEditor |
| **Render-only SwiftUI** | MarkdownUI | https://github.com/gonzalezreal/swift-markdown-ui |

**Recomendación para un Typora-like**:

El enfoque más directo es usar **NSTextView** (macOS) o **UITextView** (iOS) trabajando directamente sobre `NSAttributedString`. No uses un WebView — mata la sensación nativa.

El flujo técnico para lograr la transformación inline tipo Typora:

1. **Parser**: `swift-markdown` (oficial Apple) para convertir el texto del buffer a un AST en cada cambio
2. **Renderer**: recorrer el AST y aplicar atributos al `NSTextStorage` del text view (negritas, cursivas, tamaños de heading, colores de code blocks)
3. **Trigger de transformación**: en cada keystroke, detectar si el último patrón completado es un marcador markdown (ej: acabas de escribir el segundo `**`) y re-aplicar los atributos de ese rango
4. **Serializer**: al guardar, el buffer del text view YA es markdown crudo — no necesitas convertir nada, solo leer `textView.string`. Esto es la clave: a diferencia del enfoque web (HTML↔MD), en Swift puedes trabajar directamente con el texto markdown y solo "pintar" los estilos encima

**Ventaja del enfoque Swift nativo sobre el web**: no hay conversión HTML↔MD. El buffer siempre es markdown. Los atributos (bold, italic, heading) son solo decoración visual aplicada al rango correspondiente. Esto elimina clases enteras de bugs que tenemos en `turndown`.

## Flujo equivalente en Swift (Typora-like)

El truco: **el buffer siempre es markdown**. Los atributos se aplican encima como "pintura" visual.

```swift
import Markdown

class MarkdownEditor: NSTextView, NSTextStorageDelegate {

    // Load: markdown crudo directo al buffer
    func load(_ markdown: String) {
        self.string = markdown
        restyleAll()
    }

    // Edit: cada vez que el usuario escribe, reestiliza
    func textStorage(_ textStorage: NSTextStorage,
                     didProcessEditing editedMask: NSTextStorageEditActions,
                     range editedRange: NSRange,
                     changeInLength delta: Int) {
        restyleAll()  // o restyle solo la línea/párrafo editado
    }

    // Restyle: parsea con swift-markdown y aplica atributos
    private func restyleAll() {
        guard let storage = self.textStorage else { return }
        let document = Document(parsing: storage.string)

        // Limpiar atributos
        let fullRange = NSRange(location: 0, length: storage.length)
        storage.setAttributes([.font: NSFont.systemFont(ofSize: 15)], range: fullRange)

        // Recorrer AST y aplicar estilos
        for child in document.children {
            applyStyle(for: child, in: storage)
        }
    }

    private func applyStyle(for node: Markup, in storage: NSTextStorage) {
        // Heading → tamaño grande + bold
        if let heading = node as? Heading {
            // calcular rango en el texto y aplicar .font con tamaño según heading.level
        }
        // Strong (bold) → .font con trait bold
        // Emphasis (italic) → .font con trait italic
        // CodeBlock → fondo gris + monospace
        // etc.
    }

    // Save: el buffer YA es markdown
    func save() async {
        let markdown = self.string
        await api.save(markdown)
    }
}
```

## Claves del enfoque Typora-like en Swift

1. **Nunca conviertas HTML↔MD**: el buffer es markdown siempre. Los atributos son solo visuales
2. **Restyle incremental**: en archivos grandes, solo re-parsea el párrafo editado (no todo el documento) por performance
3. **Mostrar marcadores MD en la línea activa**: Typora oculta los `**` en líneas que no tienes el cursor, y los muestra en la línea activa para que puedas editarlos. Esto se logra con `NSLayoutManager` aplicando `.foregroundColor` transparente a los marcadores fuera de la línea del cursor
4. **Debounce del save**: 800ms tras la última tecla
5. **Headings**: usar `NSFont` con diferentes tamaños (34pt H1, 28pt H2, 22pt H3…) y `NSParagraphStyle` con más `paragraphSpacingBefore`
6. **Code blocks**: fondo con `NSBackgroundColor` + `NSFont.monospacedSystemFont` + padding via `headIndent`/`tailIndent`
7. **Lists**: el prefijo `- ` se queda en el buffer. Solo aplica `headIndent` para que el wrapping se alinee con el primer carácter del item

## Claves de implementación (web actual)

1. **Debounce al guardar**: 800ms tras la última tecla (evita saves excesivos)
2. **Separar estado local de estado remoto**: el editor no debe re-renderizar por cambios del signal de estado — solo en mount inicial
3. **Placeholder**: detectar si el contenido está vacío y mostrar un texto guía
4. **Wiki links** (opcional): regex `\[\[(.+?)(?:\|(.+?))?\]\]` para detectar `[[target|display]]` y convertir a attributed strings con `.link` attribute
5. **Estado de guardado**: mostrar indicador `idle / saving / saved / error` para feedback al usuario

## Referencias de código abierto Typora-like

Editores WYSIWYG markdown open source que puedes estudiar:

| Proyecto | Lenguaje | Repo |
|----------|----------|------|
| **MarkText** | JS/Electron (mejor alternativa a Typora) | https://github.com/marktext/marktext |
| **Zettlr** | JS/Electron (usa CodeMirror) | https://github.com/Zettlr/Zettlr |
| **MacDown** | Objective-C/macOS (split view pero nativo) | https://github.com/MacDownApp/macdown |

**MarkText** es el más cercano conceptualmente a lo que queremos — vale la pena revisar cómo maneja la transformación inline.

## Repo de referencia propio

**Daily Check (SolidJS, web)**: https://github.com/teriodev95/daily-v2-solidjs

Archivos clave:
- `src/v2/components/ContentEditor.tsx` — editor WYSIWYG con marked + turndown
- `src/v2/lib/wikiLinks.ts` — procesamiento de `[[wiki links]]`
