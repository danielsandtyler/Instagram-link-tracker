const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');

console.log('🔧 Iniciando reparación de base de datos...');

// 1. Hacer backup de la base de datos vieja si existe
if (fs.existsSync('clicks.db')) {
    const backupName = 'clicks_backup_' + new Date().getTime() + '.db';
    fs.copyFileSync('clicks.db', backupName);
    console.log('✅ Backup creado:', backupName);
}

// 2. Crear nueva base de datos
const db = new sqlite3.Database('clicks.db', (err) => {
    if (err) {
        console.error('❌ Error creando base de datos:', err.message);
        return;
    }
    console.log('✅ Base de datos clicks.db creada/abierta');
});

// 3. Crear la tabla con la estructura correcta
const createTableSQL = `
CREATE TABLE IF NOT EXISTS clicks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ip_address TEXT,
    user_agent TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    referer TEXT
)`;

db.run(createTableSQL, (err) => {
    if (err) {
        console.error('❌ Error creando tabla:', err.message);
    } else {
        console.log('✅ Tabla "clicks" creada correctamente');
    }
});

// 4. Insertar dato de prueba
const insertTestSQL = `
INSERT INTO clicks (ip_address, user_agent, referer)
VALUES ('192.168.1.1', 'Navegador de prueba', 'http://ejemplo.com')
`;

db.run(insertTestSQL, function(err) {
    if (err) {
        console.error('❌ Error insertando dato de prueba:', err.message);
    } else {
        console.log('✅ Dato de prueba insertado, ID:', this.lastID);
    }
});

// 5. Verificar que todo funciona
db.all("SELECT * FROM clicks", (err, rows) => {
    if (err) {
        console.error('❌ Error leyendo datos:', err.message);
    } else {
        console.log('📊 Datos en la tabla:', rows.length, 'registros encontrados');
        if (rows.length > 0) {
            console.log('📋 Primer registro:', rows[0]);
        }
    }
    
    // 6. Cerrar conexión
    db.close((err) => {
        if (err) {
            console.error('❌ Error cerrando base de datos:', err.message);
        } else {
            console.log('🎉 ¡Reparación completada!');
            console.log('📁 Base de datos lista para usar: clicks.db');
        }
    });
});