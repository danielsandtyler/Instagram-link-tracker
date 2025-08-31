const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');

console.log('🔍 INICIANDO VERIFICACIÓN DE BASE DE DATOS');
console.log('==========================================');

// Verificar que el archivo existe
if (!fs.existsSync('clicks.db')) {
    console.log('❌ ERROR: clicks.db no existe');
    process.exit(1);
}

console.log('✅ clicks.db encontrado');

const db = new sqlite3.Database('clicks.db', (err) => {
    if (err) {
        console.error('❌ Error abriendo la base de datos:', err.message);
        return;
    }
    console.log('✅ Conexión exitosa a la base de datos');
});

// 1. Ver tablas existentes
db.all("SELECT name FROM sqlite_master WHERE type='table'", (err, tables) => {
    if (err) {
        console.error('❌ Error obteniendo tablas:', err.message);
    } else {
        console.log('\n📊 TABLAS ENCONTRADAS:');
        if (tables.length === 0) {
            console.log('⚠️  No hay tablas en la base de datos');
        } else {
            tables.forEach(table => {
                console.log(`- ${table.name}`);
            });
        }
    }

    // 2. Ver estructura de la tabla clicks (si existe)
    db.all("PRAGMA table_info(clicks)", (err, columns) => {
        if (err) {
            console.log('\n⚠️  No se puede leer la tabla clicks (puede que no exista)');
        } else {
            console.log('\n📋 ESTRUCTURA DE TABLA "clicks":');
            if (columns.length === 0) {
                console.log('⚠️  La tabla clicks está vacía o no existe');
            } else {
                columns.forEach(col => {
                    console.log(`- ${col.name} (${col.type}) ${col.pk ? 'PRIMARY KEY' : ''}`);
                });
            }
        }

        // 3. Contar registros en clicks
        db.get("SELECT COUNT(*) as count FROM clicks", (err, row) => {
            if (err) {
                console.log('\n⚠️  No se puede contar registros (tabla puede no existir)');
            } else {
                console.log(`\n📈 TOTAL DE REGISTROS: ${row.count}`);
                
                // 4. Mostrar últimos 3 registros si hay datos
                if (row.count > 0) {
                    db.all("SELECT * FROM clicks ORDER BY id DESC LIMIT 3", (err, rows) => {
                        if (!err) {
                            console.log('\n📝 ÚLTIMOS 3 REGISTROS:');
                            rows.forEach(row => {
                                console.log(`ID: ${row.id} | IP: ${row.ip_address} | Fecha: ${row.timestamp}`);
                            });
                        }
                        finishCheck();
                    });
                } else {
                    finishCheck();
                }
            }
        });
    });
});

function finishCheck() {
    db.close((err) => {
        if (err) {
            console.error('❌ Error cerrando base de datos:', err.message);
        } else {
            console.log('\n==========================================');
            console.log('✅ VERIFICACIÓN COMPLETADA');
            console.log('✅ Tu base de datos está lista para usar');
            console.log('✅ Ejecuta: node server.js');
        }
    });
}
