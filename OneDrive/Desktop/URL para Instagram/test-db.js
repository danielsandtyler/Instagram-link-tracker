const sqlite3 = require('sqlite3').verbose();

console.log('🧪 Probando conexión a la base de datos...');

const db = new sqlite3.Database('clicks.db', (err) => {
    if (err) {
        console.error('❌ Error conectando:', err.message);
        return;
    }
    console.log('✅ Conexión exitosa a clicks.db');
    
    // Contar registros
    db.get("SELECT COUNT(*) as count FROM clicks", (err, row) => {
        if (err) {
            console.error('❌ Error contando registros:', err.message);
        } else {
            console.log('📊 Total de registros:', row.count);
        }
        db.close();
    });
});