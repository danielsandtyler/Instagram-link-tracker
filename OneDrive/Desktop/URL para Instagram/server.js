// server.js (versión mejorada)
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const cors = require('cors');
const crypto = require('crypto');
const fs = require('fs');
const { getCountryFromIP, normalizeIP, getClientIp } = require('./geo-utils');

// Crear la aplicación Express
const app = express();

// IMPORTANT: confiar en el proxy (Railway / vercel / heroku)
// Esto permite leer la IP real desde X-Forwarded-For
app.set('trust proxy', true);

// Puerto (Railway asigna PORT por variable de entorno)
const PORT = process.env.PORT || 3000;

// Función para generar nonces seguros (para CSP inline)
function generateNonce() {
    return crypto.randomBytes(16).toString('base64');
}

// Middlewares
app.use(compression());
app.use(cors());

// Rate limiter básico
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: 100,
    message: 'Demasiadas solicitudes desde esta IP, intenta nuevamente en 15 minutos.'
});
app.use(limiter);

// Body parsers
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Helmet con CSP y nonce dinámico (para scripts/styles inline permitidos por nonce)
app.use((req, res, next) => {
    const nonce = generateNonce();
    res.locals.nonce = nonce;

    // Usamos helmet como middleware con configuración personalizada
    helmet({
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'"],
                scriptSrc: ["'self'", `'nonce-${nonce}'`],
                scriptSrcAttr: ["'none'"],
                styleSrc: ["'self'", "'unsafe-inline'"],
                imgSrc: ["'self'", "data:", "https:"],
                connectSrc: ["'self'"],
                fontSrc: ["'self'"],
                objectSrc: ["'none'"],
                baseUri: ["'self'"],
                frameAncestors: ["'none'"]
            }
        },
        crossOriginEmbedderPolicy: false,
        crossOriginResourcePolicy: { policy: "cross-origin" }
    })(req, res, next);
});

// Asegurar carpeta de backups existe
const BACKUP_DIR = path.join(__dirname, 'backups');
try {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
} catch (err) {
    console.warn('No se pudo crear backups/:', err.message);
}

// Conexión a la base de datos SQLite
const DB_FILE = path.join(__dirname, 'clicks.db');
const db = new sqlite3.Database(DB_FILE, (err) => {
    if (err) {
        console.error('❌ Error abriendo clicks.db:', err.message);
    } else {
        console.log('✅ Conectado a clicks.db');

        // Crear tabla si no existe
        db.run(`
            CREATE TABLE IF NOT EXISTS clicks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                ip_address TEXT,
                user_agent TEXT,
                referer TEXT,
                country TEXT DEFAULT 'Desconocido',
                click_count INTEGER DEFAULT 1,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `, (err) => {
            if (err) console.error('❌ Error creando tabla clicks:', err.message);
            else console.log('✅ Tabla "clicks" lista');
        });

        // Intentar añadir columnas si faltan (seguro-ignorar si ya existen)
        db.run(`ALTER TABLE clicks ADD COLUMN country TEXT DEFAULT 'Desconocido'`, (err) => {
            if (err && !/duplicate column name/i.test(err.message)) {
                console.error('❌ Error agregando columna country:', err.message);
            }
        });
        db.run(`ALTER TABLE clicks ADD COLUMN click_count INTEGER DEFAULT 1`, (err) => {
            if (err && !/duplicate column name/i.test(err.message)) {
                console.error('❌ Error agregando columna click_count:', err.message);
            }
        });
    }
});

// Autenticación básica para /admin (mejor en env var, esto es mínimo)
const authMiddleware = (req, res, next) => {
    const auth = {
        login: process.env.ADMIN_USER || 'admin',
        password: process.env.ADMIN_PASS || 'quechuchasapeasgil@' // considera cambiar a env var
    };

    const b64auth = (req.headers.authorization || '').split(' ')[1] || '';
    const [login, password] = Buffer.from(b64auth, 'base64').toString().split(':');

    if (login && password && login === auth.login && password === auth.password) {
        return next();
    }

    res.set('WWW-Authenticate', 'Basic realm="Panel Admin"');
    res.status(401).send(`
        <div style="text-align:center;padding:50px;">
            <h2>🔒 Acceso restringido</h2>
            <p>Se requiere autenticación para acceder al panel de administración</p>
            <a href="/inicio">Volver al inicio</a>
        </div>
    `);
};

// Rutas
app.get('/inicio', (req, res) => {
    const nonce = res.locals.nonce;
    res.send(`
        <!DOCTYPE html>
        <html><head><title>Mi Tracker</title>
        <style nonce="${nonce}">
            body{font-family:Arial;text-align:center;padding:50px;background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);color:#fff}
            a{display:inline-block;margin:10px;padding:10px 20px;background:rgba(255,255,255,0.2);color:#fff;text-decoration:none;border-radius:5px}
        </style>
        </head>
        <body>
            <h1>🚀 Instagram Link Tracker</h1>
            <p>Servidor funcionando correctamente</p>
            <div>
                <a href="/">Probar link de tracking</a>
                <a href="/admin">Ver panel de administración</a>
            </div>
        </body></html>
    `);
});

// Ruta principal de tracking (aquí obtenemos IP real y país)
app.get('/', async (req, res) => {
    // Obtener IP real del cliente (considera proxies)
    const ipAddress = getClientIp(req);
    const userAgent = req.get('User-Agent') || 'Desconocido';
    const referer = req.get('Referer') || 'Directo';

    console.log('📥 Click registrado - IP (raw):', ipAddress);

    try {
        // Obtener país a partir de la IP
        const country = await getCountryFromIP(ipAddress);
        console.log(`🌍 Nueva visita - IP: ${ipAddress}, País: ${country}`);

        // Verificar si la IP ya hizo click hoy (y actualizar o insertar)
        db.get(
            `SELECT id, click_count FROM clicks WHERE ip_address = ? AND DATE(timestamp) = DATE('now')`,
            [ipAddress],
            (err, row) => {
                if (err) {
                    console.error('❌ Error verificando IP en DB:', err.message);
                    return res.redirect('https://www.instagram.com/daniel_sandoval_ch/');
                }

                if (row) {
                    // Actualizar contador
                    db.run(
                        `UPDATE clicks SET click_count = click_count + 1 WHERE id = ?`,
                        [row.id],
                        function (err) {
                            if (err) console.error('❌ Error actualizando click:', err.message);
                            else console.log(`✅ Click actualizado para IP: ${ipAddress}`);
                        }
                    );
                } else {
                    // Insertar nuevo registro
                    db.run(
                        `INSERT INTO clicks (ip_address, user_agent, referer, country) VALUES (?, ?, ?, ?)`,
                        [ipAddress, userAgent, referer, country],
                        function (err) {
                            if (err) console.error('❌ Error insertando click:', err.message);
                            else console.log(`✅ Nuevo click guardado ID: ${this.lastID} desde: ${country}`);
                        }
                    );
                }

                // Redirigir al destino final
                res.redirect('https://www.instagram.com/daniel_sandoval_ch/');
            }
        );
    } catch (error) {
        console.error('❌ Error en tracking:', error);
        res.redirect('https://www.instagram.com/daniel_sandoval_ch/');
    }
});

// API simple para ver clicks
app.get('/api/clicks', (req, res) => {
    const sql = `SELECT * FROM clicks ORDER BY timestamp DESC LIMIT 100`;
    db.all(sql, [], (err, rows) => {
        if (err) {
            console.error('❌ Error leyendo clicks:', err.message);
            return res.status(500).json({ error: 'Error interno del servidor' });
        }
        res.json(rows);
    });
});

// API estadísticas avanzadas
app.get('/api/advanced-stats', (req, res) => {
    const sql = `
        SELECT 
            COUNT(*) as total_clicks,
            COUNT(DISTINCT ip_address) as unique_ips,
            SUM(click_count) - COUNT(*) as repeated_clicks,
            GROUP_CONCAT(DISTINCT country) as countries,
            COUNT(DISTINCT country) as unique_countries
        FROM clicks
    `;
    db.get(sql, [], (err, row) => {
        if (err) {
            console.error('❌ Error en stats avanzadas:', err.message);
            return res.status(500).json({ error: err.message });
        }
        res.json(row);
    });
});

// Panel admin protegido
app.get('/admin', authMiddleware, (req, res) => {
    const nonce = res.locals.nonce;
    const adminHtmlPath = path.join(__dirname, 'public', 'admin.html');
    if (!fs.existsSync(adminHtmlPath)) {
        return res.status(404).send(`
            <div style="text-align:center;padding:50px;">
                <h2>Error: admin.html no encontrado</h2>
                <p>El archivo admin.html no existe en la carpeta public/</p>
                <a href="/inicio">Volver al inicio</a>
            </div>
        `);
    }
    try {
        let adminHtml = fs.readFileSync(adminHtmlPath, 'utf8');
        adminHtml = adminHtml.replace(/<script(?![^>]*nonce)([^>]*)>/g, `<script nonce="${nonce}"$1>`);
        adminHtml = adminHtml.replace(/<style(?![^>]*nonce)([^>]*)>/g, `<style nonce="${nonce}"$1>`);
        res.send(adminHtml);
    } catch (err) {
        console.error('❌ Error leyendo admin.html:', err.message);
        res.status(500).send('Error interno del servidor');
    }
});

// Archivos estáticos
app.use(express.static('public', {
    setHeaders: (res, path) => {
        if (path.endsWith('.js')) res.setHeader('Content-Type', 'application/javascript');
    }
}));

// Error handler global
app.use((err, req, res, next) => {
    console.error('❌ Error no manejado:', err.stack || err);
    res.status(500).send(`
        <div style="text-align:center;padding:50px;">
            <h2>Error del servidor</h2>
            <p>Algo salió mal. Por favor, intenta más tarde.</p>
            <a href="/inicio">Volver al inicio</a>
        </div>
    `);
});

// 404
app.use((req, res) => {
    res.status(404).send(`
        <div style="text-align:center;padding:50px;">
            <h2>404 - Página no encontrada</h2>
            <a href="/inicio">Volver al inicio</a>
        </div>
    `);
});

// Iniciar servidor
const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`
🚀 Servidor ejecutándose en: http://0.0.0.0:${PORT}
👉 Link de tracking: /
👉 Panel admin: /admin
👉 API clicks: /api/clicks
    `);
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n🛑 Apagando servidor graceful...');
    server.close(() => {
        console.log('✅ Servidor cerrado.');
        db.close((err) => {
            if (err) console.error('❌ Error cerrando DB:', err.message);
            else console.log('✅ DB cerrada.');
            process.exit(0);
        });
    });
});

// Backup automático diario (intenta usar sqlite backup; si falla, copia simple)
setInterval(() => {
    try {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupFile = path.join(BACKUP_DIR, `clicks_auto_${timestamp}.db`);
        // Intentar usar backup API si existe
        if (typeof db.backup === 'function') {
            const destDb = new sqlite3.Database(backupFile);
            db.backup(destDb, (err) => {
                if (err) console.error('❌ Backup automático falló (db.backup):', err);
                else console.log('✅ Backup automático realizado:', backupFile);
                destDb.close();
            });
        } else {
            // Fallback: copiar archivo
            fs.copyFileSync(DB_FILE, backupFile);
            console.log('✅ Backup automático (copy):', backupFile);
        }
    } catch (err) {
        console.error('❌ Error en backup automático:', err.message);
    }
}, 24 * 60 * 60 * 1000); // cada 24 horas
