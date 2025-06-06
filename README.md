# 📅 Daily Check - Aplicación de Reportes Diarios

Una aplicación web moderna para gestionar reportes diarios, desarrollada con SolidJS, TypeScript, Tailwind CSS y CouchDB.

## ✨ Características

- **📱 Formulario interactivo** para capturar reportes diarios
- **📊 Cálculo automático** de fecha y número de semana
- **💾 Autoguardado** cada 30 segundos
- **👁️ Vista previa** en tiempo real del reporte formateado
- **📋 Función de copia** para compartir por Telegram
- **🎨 Tema claro/oscuro** con persistencia
- **💽 Base de datos local** con PouchDB/CouchDB
- **📱 Diseño responsive** con DaisyUI

## 🏗️ Stack Tecnológico

- **SolidJS** - Framework reactivo
- **TypeScript** - Tipado estático
- **Vite** - Bundler y servidor de desarrollo
- **Tailwind CSS** - Framework de CSS utilitario
- **DaisyUI** - Componentes de UI
- **PouchDB** - Base de datos local
- **CouchDB** - Sincronización remota (opcional)

## 🚀 Instalación y Uso

### Prerequisitos

- Node.js (versión 16 o superior)
- npm o yarn

### Instalación

1. **Clonar el repositorio**
   ```bash
   git clone <url-del-repositorio>
   cd solidjs-daily-app
   ```

2. **Instalar dependencias**
   ```bash
   npm install
   ```

3. **Iniciar servidor de desarrollo**
   ```bash
   npm run dev
   ```

4. **Abrir en el navegador**
   ```
   http://localhost:3000
   ```

### Compilación para producción

```bash
npm run build
```

Los archivos compilados se generarán en la carpeta `dist/`.

## 📋 Formato del Reporte

La aplicación genera reportes en el siguiente formato:

```
📅 Daily Check - martes, 3 de junio de 2025
📊 Semana 23

✅ Ayer completé:
• ENVIO Y REVISIÓN DEL LAS ACTUALIZACIONES DEL NUEVO SITIO WEB DE FT
• TUTORIAL PARA SOLICITUD DE CORRECCIONES EN PGS

🎯 Hoy trabajaré en:
• COBERTURA DE CIERRES
• TRABAJAR EN LOS PROYECTOS UI DE REPORTE DIARIO AGENCIAS Y GERENCIAS

🎯 Objetivos de la semana:
• Desplegar una versión simplificada y funcional para los usuarios
• Completar la primera versión del servicio para reportes diarios

📚 Aprendizaje en Curso:
• Técnico: SEO con WordPress
• Crecimiento: Steven Bartlett – Diario de un CEO
• Crecimiento: Robin Sharma – La riqueza que el dinero no puede comprar
```

## 🗄️ Base de Datos

### Configuración Local

La aplicación usa PouchDB para almacenamiento local automático. No se requiere configuración adicional.

### Sincronización con CouchDB (Opcional)

Para sincronizar con un servidor CouchDB remoto, modifica el archivo `src/utils/database.ts`:

```typescript
import { setupSync } from '../utils/database';

// Configurar sincronización
setupSync('http://localhost:5984/daily-reports');
```

## 🎨 Personalización

### Temas

La aplicación incluye soporte para múltiples temas de DaisyUI. Para cambiar los temas disponibles, edita `tailwind.config.js`:

```javascript
daisyui: {
  themes: ["light", "dark", "cupcake", "cyberpunk", ...],
}
```

### Campos del Formulario

Para modificar los campos del reporte, actualiza la interfaz `DailyReport` en `src/types/index.ts`.

## 🛠️ Comandos Disponibles

```bash
# Desarrollo
npm run dev          # Iniciar servidor de desarrollo
npm run build        # Compilar para producción
npm run serve        # Servir build de producción
npm run preview      # Vista previa del build

# Linting y formateo
npm run lint         # Verificar código con ESLint
npm run format       # Formatear código con Prettier
```

## 📁 Estructura del Proyecto

```
solidjs-daily-app/
├── src/
│   ├── components/
│   │   └── DailyForm.tsx        # Componente principal del formulario
│   ├── types/
│   │   └── index.ts             # Tipos TypeScript
│   ├── utils/
│   │   ├── database.ts          # Funciones de base de datos
│   │   ├── dateUtils.ts         # Utilidades de fecha
│   │   └── formatUtils.ts       # Formateo y clipboard
│   ├── App.tsx                  # Componente raíz
│   ├── index.tsx                # Punto de entrada
│   └── index.css                # Estilos globales
├── public/                      # Archivos estáticos
├── tailwind.config.js           # Configuración de Tailwind
├── postcss.config.js            # Configuración de PostCSS
├── vite.config.ts               # Configuración de Vite
└── package.json
```

## 🤝 Contribución

1. Fork el proyecto
2. Crea una rama para tu feature (`git checkout -b feature/nueva-caracteristica`)
3. Commit tus cambios (`git commit -m 'Agregar nueva característica'`)
4. Push a la rama (`git push origin feature/nueva-caracteristica`)
5. Abre un Pull Request

## 📝 Licencia

Este proyecto está bajo la Licencia MIT. Ver el archivo `LICENSE` para más detalles.

## 💡 Características Futuras

- [ ] Historial de reportes con búsqueda
- [ ] Exportar reportes a PDF
- [ ] Plantillas personalizables
- [ ] Notificaciones de recordatorio
- [ ] Métricas y estadísticas
- [ ] Integración con APIs de calendario
- [ ] Modo offline completo
- [ ] Sincronización multi-dispositivo

## 🐛 Reportar Problemas

Si encuentras algún problema, por favor [crea un issue](../../issues) describiendo:

- Pasos para reproducir el problema
- Comportamiento esperado vs. comportamiento actual
- Capturas de pantalla (si aplica)
- Información del navegador y sistema operativo

---

Desarrollado con ❤️ usando [SolidJS](https://solidjs.com), [Tailwind CSS](https://tailwindcss.com) y [DaisyUI](https://daisyui.com)
