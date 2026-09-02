const fs = require('fs');
const path = require('path');
const pool = require('./db');

async function importarCallesReales() {
  console.log('🚀 Iniciando importación de calles con nombres reales...');

  const rutaJson = path.join(__dirname, 'calles_completas.json');

  if (!fs.existsSync(rutaJson)) {
    console.error('❌ ERROR: No se encontró calles_completas.json');
    process.exit(1);
  }

  try {
    const rawData = fs.readFileSync(rutaJson, 'utf-8');
    const geojson = JSON.parse(rawData);
    const features = geojson.features || [];

    console.log(`📡 Analizando ${features.length} geometrías...`);

    await pool.query('CREATE EXTENSION IF NOT EXISTS postgis;');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS calles (
        id SERIAL PRIMARY KEY,
        nombre VARCHAR(150) NOT NULL,
        tipo VARCHAR(50) DEFAULT 'calle',
        ubicacion GEOMETRY(Geometry, 4326)
      );
    `);

    // Limpiar tabla por completo
    await pool.query('TRUNCATE TABLE calles RESTART IDENTITY;');

    let guardadas = 0;

    for (const f of features) {
      if (!f.geometry) continue;

      const p = f.properties || {};
      const t = p.tags || {};

      // 🔍 Buscar en la raíz del Feature, en properties y en tags
      // Se prioriza alt_name si existe (para tramos como "Calle Javier Mina")
      let nombreReal = 
        f.alt_name || 
        p.alt_name || 
        t.alt_name || 
        f.name || 
        p.name || 
        t.name || 
        f['name:es'] || 
        p['name:es'] || 
        t['name:es'] || 
        null;

      let tipo = f.highway || p.highway || t.highway || 'calle';

      // Si no tiene nombre real, se omite
      if (!nombreReal || typeof nombreReal !== 'string' || nombreReal.trim().length === 0) {
        continue;
      }

      const geomJson = JSON.stringify(f.geometry);
      const query = `
        INSERT INTO calles (nombre, tipo, ubicacion)
        VALUES ($1, $2, ST_SetSRID(ST_GeomFromGeoJSON($3), 4326));
      `;

      await pool.query(query, [nombreReal.trim(), tipo, geomJson]);
      guardadas++;
    }

    console.log(`✅ ¡ÉXITO! Se guardaron exactamente ${guardadas} calles con nombres oficiales.`);
  } catch (err) {
    console.error('❌ Error durante la importación:', err.message);
  } finally {
    await pool.end();
    process.exit(0);
  }
}

importarCallesReales();