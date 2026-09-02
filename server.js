const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();
const pool = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Servir todos los archivos estáticos de la carpeta public (css, js, imágenes)
app.use(express.static(path.join(__dirname, 'public')));

// Ruta raíz "/": Carga directamente el MAPA al abrir la dirección web
app.get('/', (req, res) => {
  // Cambiá 'index.html' por 'mapa.html' si tu archivo se llama diferente
  res.sendFile(path.join(__dirname, 'public', 'index.html')); 
});

// Endpoint de prueba de salud
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    mensaje: 'Servidor del Sistema de Alumbrado Público funcionando correctamente'
  });
});

// Endpoint para obtener todas las luminarias desde PostgreSQL + PostGIS
app.get('/api/luminarias', async (req, res) => {
  try {
    const query = `
      SELECT id, codigo, direccion, estado, tipo_lampara,
             ST_X(ubicacion::geometry) AS longitud,
             ST_Y(ubicacion::geometry) AS latitud
      FROM luminarias;
    `;
    const result = await pool.query(query);
    res.json(result.rows);
  } catch (err) {
    console.error('Error al consultar luminarias:', err);
    res.status(500).json({ error: 'Error al consultar la base de datos' });
  }
});

// Endpoint para guardar una nueva luminaria
app.post('/api/luminarias', async (req, res) => {
  const { codigo, direccion, tipo_lampara, latitud, longitud } = req.body;
  
  if (!codigo || !latitud || !longitud) {
    return res.status(400).json({ error: 'Faltan parámetros requeridos (código, latitud o longitud).' });
  }

  try {
    const query = `
      INSERT INTO luminarias (codigo, direccion, tipo_lampara, ubicacion)
      VALUES ($1, $2, $3, ST_SetSRID(ST_MakePoint($4, $5), 4326))
      RETURNING id, codigo, direccion, estado, tipo_lampara;
    `;
    const result = await pool.query(query, [codigo, direccion, tipo_lampara, parseFloat(longitud), parseFloat(latitud)]);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error al insertar luminaria:', err);
    res.status(500).json({ error: 'Error al registrar la luminaria en la base de datos: ' + err.message });
  }
});

// Endpoint para reportar una falla
app.put('/api/luminarias/:id/reportar', async (req, res) => {
  const { id } = req.params;
  const { descripcion, estado } = req.body;
  try {
    await pool.query('UPDATE luminarias SET estado = $1 WHERE id = $2', [estado || 'fallando', id]);
    
    const queryReporte = `
      INSERT INTO reportes (luminaria_id, descripcion, prioridad)
      VALUES ($1, $2, 'alta')
      RETURNING *;
    `;
    const result = await pool.query(queryReporte, [id, descripcion]);
    
    res.json({ mensaje: 'Reporte registrado con éxito', reporte: result.rows[0] });
  } catch (err) {
    console.error('Error al reportar falla:', err);
    res.status(500).json({ error: 'Error al guardar el reporte' });
  }
});

// Endpoint para obtener todos los reportes activos
app.get('/api/reportes', async (req, res) => {
  try {
    const query = `
      SELECT r.id, r.descripcion, r.fecha_reporte, l.codigo, l.direccion, l.id AS luminaria_id
      FROM reportes r
      JOIN luminarias l ON r.luminaria_id = l.id
      WHERE r.estado_reporte = 'pendiente'
      ORDER BY r.fecha_reporte DESC;
    `;
    const result = await pool.query(query);
    res.json(result.rows);
  } catch (err) {
    console.error('Error al obtener reportes:', err);
    res.status(500).json({ error: 'Error al consultar reportes' });
  }
});

// Endpoint para resolver una falla
app.put('/api/reportes/:id/resolver', async (req, res) => {
  const { id } = req.params;
  const { luminaria_id } = req.body;
  try {
    await pool.query("UPDATE reportes SET estado_reporte = 'resuelto' WHERE id = $1", [id]);
    await pool.query("UPDATE luminarias SET estado = 'operativa' WHERE id = $1", [luminaria_id]);
    
    res.json({ mensaje: 'Reporte resuelto y luminaria operativa' });
  } catch (err) {
    console.error('Error al resolver reporte:', err);
    res.status(500).json({ error: 'Error al actualizar reporte' });
  }
});

// Endpoint para eliminar una luminaria
app.delete('/api/luminarias/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM luminarias WHERE id = $1', [id]);
    res.json({ mensaje: 'Luminaria eliminada correctamente' });
  } catch (err) {
    console.error('Error al eliminar la luminaria:', err);
    res.status(500).json({ error: 'Error al eliminar la luminaria de la base de datos' });
  }
});

// Endpoint para el historial de intervenciones
app.get('/api/luminarias/:id/historial', async (req, res) => {
  const { id } = req.params;
  try {
    const query = `
      SELECT id, descripcion, prioridad, estado_reporte, fecha_reporte
      FROM reportes
      WHERE luminaria_id = $1
      ORDER BY fecha_reporte DESC;
    `;
    const result = await pool.query(query, [id]);
    res.json(result.rows);
  } catch (err) {
    console.error('Error al consultar el historial:', err);
    res.status(500).json({ error: 'Error al obtener el historial' });
  }
});

// Endpoint para buscar calles en la base de datos
app.get('/api/luminarias-entre-calles', async (req, res) => {
  const { callePrincipal, cruce1, cruce2 } = req.query;

  if (!callePrincipal || !cruce1 || !cruce2) {
    return res.status(400).json({ error: 'Debes ingresar la calle principal y los dos cruces.' });
  }

  try {
    // Normalizar términos para buscar con ILIKE sin importar si pusieron "Calle" o no
    const p = `%${callePrincipal.trim().replace(/^calle\s+/i, '')}%`;
    const c1 = `%${cruce1.trim().replace(/^calle\s+/i, '')}%`;
    const c2 = `%${cruce2.trim().replace(/^calle\s+/i, '')}%`;

    const query = `
      WITH principal AS (
        SELECT ST_Collect(ubicacion) AS geom 
        FROM calles 
        WHERE nombre ILIKE $1
      ),
      cruce_a AS (
        SELECT ST_Collect(ubicacion) AS geom 
        FROM calles 
        WHERE nombre ILIKE $2
      ),
      cruce_b AS (
        SELECT ST_Collect(ubicacion) AS geom 
        FROM calles 
        WHERE nombre ILIKE $3
      ),
      intersecciones AS (
        SELECT 
          ST_ClosestPoint(p.geom, a.geom) AS pt1,
          ST_ClosestPoint(p.geom, b.geom) AS pt2
        FROM principal p, cruce_a a, cruce_b b
        WHERE p.geom IS NOT NULL AND a.geom IS NOT NULL AND b.geom IS NOT NULL
      ),
      buffer_area AS (
        SELECT ST_Buffer(
          ST_MakeLine(pt1, pt2)::geography, 
          25
        )::geometry AS geom_buffer
        FROM intersecciones
        WHERE ST_Distance(pt1::geography, pt2::geography) > 5
      )
      SELECT 
        l.id, 
        l.codigo, 
        l.direccion, 
        l.estado,
        ST_Y(l.ubicacion::geometry) AS latitud,
        ST_X(l.ubicacion::geometry) AS longitud,
        (SELECT ST_AsGeoJSON(geom_buffer) FROM buffer_area) AS tramo_geojson
      FROM buffer_area ba
      LEFT JOIN luminarias l ON ST_Contains(ba.geom_buffer, l.ubicacion::geometry);
    `;

    const result = await pool.query(query, [p, c1, c2]);

    if (result.rows.length === 0 || !result.rows[0].tramo_geojson) {
      return res.status(404).json({ 
        error: `No fue posible conectar las esquinas entre "${callePrincipal}" y los cruces especificados. Comprueba que las calles crucen entre sí.` 
      });
    }

    const luminarias = result.rows.filter(r => r.id !== null);

    res.json({
      tramo_geojson: result.rows[0].tramo_geojson,
      luminarias: luminarias
    });

  } catch (err) {
    console.error('❌ Error en /api/luminarias-entre-calles:', err.message);
    res.status(500).json({ error: 'Error interno en la consulta: ' + err.message });
  }
});
app.listen(PORT, () => {
  console.log(`=================================`);
  console.log(`Servidor corriendo en el puerto: ${PORT}`);
  console.log(`=================================`);
});