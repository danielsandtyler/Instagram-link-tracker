const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const cors = require('cors');
const crypto = require('crypto');
const fs = require('fs');
const { getCountryFromIP, normalizeIP } = require('./geo-utils');

// 1. Crear la aplicación Express
const app = express();
const PORT = process.env.PORT || 3000;

// Función para generar nonces seguros
function generateNonce() {
    return crypto.randomBytes(16).toString('base64');
}

// 2. Middleware de seguridad y compresión
app.use(compression());
app.use(cors());

// 3. ✅ CONFIGURACIÓN SEGURA DE TRUST PROXY (Corregido)
app.set('trust proxy', 1);

// 4. Limitador de tasa para prevenir abusos
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: 'Demasiadas solicitudes desde esta IP, intenta nuevamente en 15 minutos.'
});
app.use(limiter);

// 5. Middleware para parsing de datos
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 6. ✅ CSP CONFIGURADO CORRECTAMENTE 
app.use((req, res, next) => {
    const nonce = generateNonce();
    res.locals.nonce = nonce;
    
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

// 7. ✅ CONEXIÓN A BASE DE DATOS MEJORADA
const db = new sqlite3.Database('clicks.db', (err) => {
    if (err) {
        console.error('❌ Error con la base de datos:', err.message);
    } else {
        console.log('✅ Conectado a la base de datos SQLite.');
        
        // ✅ CREAR TABLA MEJORADA
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
            if (err) {
                console.error('❌ Error creando tabla:', err.message);
            } else {
                console.log('✅ Tabla "clicks" verificada/creada correctamente.');
                
                // Intentar agregar columnas si no existen (ignorar errores si ya existen)
db.run(`ALTER TABLE clicks ADD COLUMN country TEXT DEFAULT 'Desconocido'`, (err) => {
    if (err && !err.message.includes('duplicate column name')) {
        console.error('❌ Error agregando columna country:', err.message);
    }
});

db.run(`ALTER TABLE clicks ADD COLUMN click_count INTEGER DEFAULT 1`, (err) => {
    if (err && !err.message.includes('duplicate column name')) {
        console.error('❌ Error agregando columna click_count:', err.message);
    }
});
            }
        });
    }
});

// 🔐 MIDDLEWARE DE AUTENTICACIÓN PARA ADMIN
const authMiddleware = (req, res, next) => {
    const auth = { login: 'admin', password: 'quechuchasapeasgil@' };
    
    const b64auth = (req.headers.authorization || '').split(' ')[1] || '';
    const [login, password] = Buffer.from(b64auth, 'base64').toString().split(':');
    
    if (login && password && login === auth.login && password === auth.password) {
        return next();
    }
    
    res.set('WWW-Authenticate', 'Basic realm="Panel Admin"');
    res.status(401).send(`
        <div style="text-align: center; padding: 50px;">
            <h2>🔒 Acceso restringido</h2>
            <p>Se requiere autenticación para acceder al panel de administración</p>
            <a href="/inicio">Volver al inicio</a>
        </div>
    `);
};

// 8. RUTAS PRINCIPALES
app.get('/inicio', (req, res) => {
    const nonce = res.locals.nonce;
    
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Mi Tracker</title>
            <style nonce="${nonce}">
                body { 
                    font-family: Arial, sans-serif; 
                    text-align: center; 
                    padding: 50px; 
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    color: white;
                }
                a {
                    display: inline-block;
                    margin: 10px;
                    padding: 10px 20px;
                    background: rgba(255, 255, 255, 0.2);
                    color: white;
                    text-decoration: none;
                    border-radius: 5px;
                }
                a:hover {
                    background: rgba(255, 255, 255, 0.3);
                }
            </style>
        </head>
        <body>
            <h1>🚀 Instagram Link Tracker</h1>
            <p>Servidor funcionando correctamente</p>
            <div>
                <a href="/">Probar link de tracking</a>
                <a href="/admin">Ver panel de administración</a>
            </div>
        </body>
        </html>
    `);
});

// Ruta de Tracking Principal MEJORADA
app.get('/', async (req, res) => {
    const rawIP = req.ip || req.connection.remoteAddress;
    const ipAddress = normalizeIP(rawIP);
    const userAgent = req.get('User-Agent') || 'Desconocido';
    const referer = req.get('Referer') || 'Directo';

    console.log('📥 Click registrado desde IP:', ipAddress);

    try {
        // Obtener país de la IP
        const country = await getCountryFromIP(ipAddress);
        
        // Verificar si la IP ya hizo click hoy
        db.get(
            `SELECT id, click_count FROM clicks WHERE ip_address = ? AND DATE(timestamp) = DATE('now')`,
            [ipAddress],
            async (err, row) => {
                if (err) {
                    console.error('❌ Error verificando IP:', err.message);
                    return res.redirect('https://www.instagram.com/daniel_sandoval_ch/');
                }

                if (row) {
                    // Actualizar contador existente
                    db.run(
                        `UPDATE clicks SET click_count = click_count + 1 WHERE id = ?`,
                        [row.id],
                        function(err) {
                            if (err) console.error('❌ Error actualizando click:', err.message);
                            else console.log(`✅ Click #${this.changes} actualizado para IP: ${ipAddress}`);
                        }
                    );
                } else {
                    // Insertar nuevo registro
                    db.run(
                        `INSERT INTO clicks (ip_address, user_agent, referer, country) VALUES (?, ?, ?, ?)`,
                        [ipAddress, userAgent, referer, country],
                        function(err) {
                            if (err) console.error('❌ Error insertando click:', err.message);
                            else console.log(`✅ Nuevo click guardado ID: ${this.lastID} desde: ${country}`);
                        }
                    );
                }
                
                // Redirigir siempre a Instagram
                res.redirect('https://www.instagram.com/daniel_sandoval_ch/');
            }
        );
    } catch (error) {
        console.error('❌ Error en tracking:', error);
        res.redirect('https://www.instagram.com/daniel_sandoval_ch/');
    }
});

// API de clicks MEJORADA
app.get('/api/clicks', (req, res) => {
    const sql = `SELECT * FROM clicks ORDER BY timestamp DESC LIMIT 100`;
    db.all(sql, [], (err, rows) => {
        if (err) {
            console.error('❌ Error leyendo datos:', err.message);
            return res.status(500).json({ error: 'Error interno del servidor' });
        }
        res.json(rows);
    });
});

// NUEVA API: Estadísticas avanzadas
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

// 🔐 Panel de admin con autenticación
app.get('/admin', authMiddleware, (req, res) => {
    const nonce = res.locals.nonce;
    
    try {
        const adminHtmlPath = path.join(__dirname, 'public', 'admin.html');
        
        if (!fs.existsSync(adminHtmlPath)) {
            return res.status(404).send(`
                <div style="text-align: center; padding: 50px;">
                    <h2>Error: admin.html no encontrado</h2>
                    <p>El archivo admin.html no existe en la carpeta public/</p>
                    <a href="/inicio">Volver al inicio</a>
                </div>
            `);
        }
        
        let adminHtml = fs.readFileSync(adminHtmlPath, 'utf8');
        adminHtml = adminHtml.replace(/<script(?![^>]*nonce)([^>]*)>/g, `<script nonce="${nonce}"$1>`);
        adminHtml = adminHtml.replace(/<style(?![^>]*nonce)([^>]*)>/g, `<style nonce="${nonce}"$1>`);
        
        res.send(adminHtml);
    } catch (error) {
        console.error('❌ Error leyendo admin.html:', error.message);
        res.status(500).send('Error interno del servidor');
    }
});

// 9. Middleware para archivos estáticos
app.use(express.static('public', {
    setHeaders: (res, path) => {
        if (path.endsWith('.js')) {
            res.setHeader('Content-Type', 'application/javascript');
        }
    }
}));

// 10. Manejo de errores global
app.use((err, req, res, next) => {
    console.error('❌ Error no manejado:', err.stack);
    res.status(500).send(`
        <div style="text-align: center; padding: 50px;">
            <h2>Error del servidor</h2>
            <p>Algo salió mal. Por favor, intenta más tarde.</p>
            <a href="/inicio">Volver al inicio</a>
        </div>
    `);
});

// 11. Manejo de rutas no encontradas
app.use((req, res) => {
    res.status(404).send(`
        <div style="text-align: center; padding: 50px;">
            <h2>404 - Página no encontrada</h2>
            <p>La página que buscas no existe.</p>
            <a href="/inicio">Volver al inicio</a>
        </div>
    `);
});

// 12. Iniciar el servidor
const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`
✨✨✨✨✨✨✨✨✨✨✨✨✨✨✨✨✨✨✨✨✨✨✨✨✨
🚀 Servidor ejecutándose en: http://localhost:${PORT}

👉 Link de tracking: http://localhost:${PORT}/
👁️  Panel de admin:    http://localhost:${PORT}/admin
📊 API de datos:       http://localhost:${PORT}/api/clicks
📈 API de stats:       http://localhost:${PORT}/api/advanced-stats
✨✨✨✨✨✨✨✨✨✨✨✨✨✨✨✨✨✨✨✨✨✨✨✨✨
    `);
});

// 13. Manejo graceful de cierre
process.on('SIGINT', () => {
    console.log('\n🛑 Apagando servidor gracefully...');
    server.close(() => {
        console.log('✅ Servidor cerrado.');
        db.close((err) => {
            if (err) {
                console.error('❌ Error cerrando base de datos:', err.message);
            } else {
                console.log('✅ Base de datos cerrada.');
            }
            process.exit(0);
        });
    });
});

// Backup automático
setInterval(() => {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFile = `backups/clicks_auto_${timestamp}.db`;
    
    const backupDb = new sqlite3.Database(backupFile);
    db.backup(backupDb, function(err) {
        if (err) console.error('❌ Backup automático falló:', err);
        else console.log(`✅ Backup automático: ${backupFile}`);
        backupDb.close();
    });
}, 24 * 60 * 60 * 1000);