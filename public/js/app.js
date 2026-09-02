// Variables globales para que sean accesibles en todo el script y desde la consola
let map = null;
let marcadoresPorId = {};
let todasLasLuminarias = [];
let capaResaltadoTramo = null;

document.addEventListener('DOMContentLoaded', () => {
  const statusElement = document.getElementById('server-status');
  const statOperativas = document.getElementById('stat-operativas');
  const statFallando = document.getElementById('stat-fallando');
  const listaReportes = document.getElementById('lista-reportes');
  const filtroEstado = document.getElementById('filtro-estado');
  const btnExportar = document.getElementById('btn-exportar');
  const btnModoAgregar = document.getElementById('btn-modo-agregar');

  // Elementos de la Búsqueda
  const inputBusqueda = document.getElementById('input-busqueda');
  const btnLimpiar = document.getElementById('btn-limpiar-busqueda');
  const resultadosBusqueda = document.getElementById('resultados-busqueda');

  // Elementos del Modo Recorrido (GPS)
  const toggleGPSMode = document.getElementById('toggle-gps-mode');
  const statusGPSMode = document.getElementById('status-gps-mode');
  const btnGPS = document.getElementById('btn-gps');

  const pajacuaranCoords = [20.1220, -102.5617];
  let contadorPostes = 1;

  // Inicialización del mapa asignándolo a la variable global y a window
 // 1. Capa Estándar (OpenStreetMap)
  const capaCalles = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© OpenStreetMap'
  });

  // 2. Capa Satelital Híbrida de Google (Fotografía de alta definición + Nombres de calles)
  const satelitalHibrido = L.tileLayer('https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', {
    maxZoom: 21,
    maxNativeZoom: 19,
    attribution: '© Google Maps'
  });

  // 3. Capa de Relieve / Terreno
  const capaRelieve = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
    maxZoom: 17,
    attribution: 'Map data: © OpenStreetMap, SRTM | Style: © OpenTopoMap'
  });

  // Inicializar mapa con Google Satelital Híbrido por defecto
  map = L.map('map', { 
    zoomControl: false,
    layers: [satelitalHibrido]
  }).setView(pajacuaranCoords, 17);
  window.map = map;

  L.control.zoom({ position: 'topright' }).addTo(map);

  // Selector de capas
  const mapasBase = {
    "🛰️ Satelital HD (Google)": satelitalHibrido,
    "🗺️ Mapa Urbano": capaCalles,
    "⛰️ Relieve y Terreno": capaRelieve
  };

  L.control.layers(mapasBase, null, { position: 'topright', collapsed: true }).addTo(map);
  const markersGroup = L.layerGroup().addTo(map);
  let heatLayer = null;
  let modoAgregarActivo = false;

  let userLatLng = null;
  let userLocationMarker = null;
  let userAccuracyCircle = null;
  let watchId = null;

  function crearIconoEstado(color) {
    const svgIcon = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="32" height="32">
        <path fill="${color}" stroke="#FFFFFF" stroke-width="1.5" d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5-2.5z"/>
      </svg>`;

    return L.divIcon({
      className: 'custom-leaflet-icon',
      html: svgIcon,
      iconSize: [32, 32],
      iconAnchor: [16, 32],
      popupAnchor: [0, -32]
    });
  }

  const iconOperativa = crearIconoEstado('#28a745');
  const iconFallando = crearIconoEstado('#dc3545');

  const userIcon = L.divIcon({
    className: 'user-gps-marker',
    html: `<div style="background-color: #007bff; width: 18px; height: 18px; border-radius: 50%; border: 3px solid white; box-shadow: 0 0 8px rgba(0,123,255,0.8);"></div>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9]
  });

  fetch('/api/health')
    .then(res => res.json())
    .then(data => {
      statusElement.textContent = data.mensaje;
      statusElement.style.color = 'green';
    })
    .catch(() => {
      statusElement.textContent = 'Error al conectar con la API.';
      statusElement.style.color = 'red';
    });

  // GPS Bajo Demanda
  toggleGPSMode.addEventListener('change', (e) => {
    const activo = e.target.checked;

    if (activo) {
      if (!navigator.geolocation) {
        alert('Tu dispositivo no soporta geolocalización GPS.');
        toggleGPSMode.checked = false;
        return;
      }

      statusGPSMode.textContent = '📡 Modo Recorrido: ON';
      statusGPSMode.style.color = '#28a745';
      btnGPS.style.display = 'inline-block';

      watchId = navigator.geolocation.watchPosition(
        (position) => {
          const lat = position.coords.latitude;
          const lng = position.coords.longitude;
          const accuracy = position.coords.accuracy;

          userLatLng = [lat, lng];

          if (!userLocationMarker) {
            userLocationMarker = L.marker(userLatLng, { icon: userIcon, zIndexOffset: 1000 }).addTo(map);
            userLocationMarker.bindPopup('<b>📍 Tu posición actual</b>');
            
            userAccuracyCircle = L.circle(userLatLng, {
              radius: accuracy,
              color: '#007bff',
              fillColor: '#007bff',
              fillOpacity: 0.15,
              stroke: false
            }).addTo(map);

            map.setView(userLatLng, 18);
          } else {
            userLocationMarker.setLatLng(userLatLng);
            userAccuracyCircle.setLatLng(userLatLng);
            userAccuracyCircle.setRadius(accuracy);
          }
        },
        (error) => console.warn('Error GPS:', error.message),
        { enableHighAccuracy: true, maximumAge: 1000, timeout: 10000 }
      );

    } else {
      statusGPSMode.textContent = '📡 Modo Recorrido: OFF';
      statusGPSMode.style.color = '#333';
      btnGPS.style.display = 'none';

      if (watchId !== null) {
        navigator.geolocation.clearWatch(watchId);
        watchId = null;
      }

      if (userLocationMarker) {
        map.removeLayer(userLocationMarker);
        map.removeLayer(userAccuracyCircle);
        userLocationMarker = null;
        userAccuracyCircle = null;
      }
      userLatLng = null;
    }
  });

  // Marcar Poste GPS
  btnGPS.addEventListener('click', () => {
    if (!userLatLng) return alert('Esperá a que el punto azul detecte tu ubicación.');

    btnGPS.textContent = '⏳ Guardando...';
    btnGPS.style.background = '#ffc107';
    btnGPS.disabled = true;

    const lat = userLatLng[0];
    const lng = userLatLng[1];

    const timestamp = Date.now().toString().slice(-4);
    const codigoAuto = `POSTE-GPS-${timestamp}`;
    const direccionAuto = prompt('¿Alguna referencia o número de calle para este poste?:', 'Registrado en recorrido GPS');

    if (direccionAuto === null) {
      btnGPS.textContent = '📍 MARCAR POSTE AQUÍ';
      btnGPS.style.background = '#28a745';
      btnGPS.disabled = false;
      return;
    }

    fetch('/api/luminarias', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        codigo: codigoAuto,
        direccion: direccionAuto || 'Registrado en recorrido GPS',
        tipo_lampara: 'LED 100W',
        latitud: lat,
        longitud: lng
      })
    })
    .then(async (res) => {
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Error al guardar en base de datos');
      }
      return data;
    })
    .then(() => {
      contadorPostes++;
      btnGPS.textContent = '✅ ¡Poste Guardado!';
      btnGPS.style.background = '#28a745';

      cargarDatos();
      map.flyTo([lat, lng], 19, { duration: 1 });

      setTimeout(() => {
        btnGPS.textContent = '📍 MARCAR POSTE AQUÍ';
        btnGPS.disabled = false;
      }, 1500);
    })
    .catch((err) => {
      console.error('Error al guardar poste por GPS:', err);
      alert(`❌ No se pudo guardar el poste: ${err.message}`);
      btnGPS.textContent = '📍 MARCAR POSTE AQUÍ';
      btnGPS.style.background = '#28a745';
      btnGPS.disabled = false;
    });
  });

  function renderizarMapa(filtro = 'todas') {
    markersGroup.clearLayers();
    Object.keys(marcadoresPorId).forEach(key => delete marcadoresPorId[key]);

    if (heatLayer) {
      map.removeLayer(heatLayer);
      heatLayer = null;
    }

    if (filtro === 'heatmap') {
      const heatPoints = [];
      todasLasLuminarias.forEach(lum => {
        if (lum.estado === 'fallando') {
          const lat = parseFloat(lum.latitud);
          const lng = parseFloat(lum.longitud);
          if (!isNaN(lat) && !isNaN(lng)) heatPoints.push([lat, lng, 1.0]);
        }
      });

      if (heatPoints.length === 0) return alert('No hay luminarias con fallas.');

      heatLayer = L.heatLayer(heatPoints, {
        radius: 25, blur: 15, maxZoom: 17,
        gradient: { 0.4: 'blue', 0.65: 'lime', 1: 'red' }
      }).addTo(map);

      return;
    }

    todasLasLuminarias.forEach(lum => {
      if (filtro !== 'todas' && lum.estado !== filtro) return;

      const lat = parseFloat(lum.latitud);
      const lng = parseFloat(lum.longitud);

      if (!isNaN(lat) && !isNaN(lng)) {
        const icono = lum.estado === 'operativa' ? iconOperativa : iconFallando;
        const marker = L.marker([lat, lng], { icon: icono });

        marker.bindPopup(`
          <div style="font-family: Arial, sans-serif; min-width: 200px;">
            <h3 style="margin-bottom: 5px; color: #003366;">${lum.codigo}</h3>
            <p style="margin: 3px 0;"><b>Dirección:</b> ${lum.direccion}</p>
            <p style="margin: 3px 0;"><b>Tipo:</b> ${lum.tipo_lampara}</p>
            <p style="margin: 3px 0;"><b>Estado:</b> <strong style="color: ${lum.estado === 'operativa' ? 'green' : 'red'};">${lum.estado.toUpperCase()}</strong></p>
            <hr style="margin: 8px 0; border: 0; border-top: 1px solid #ccc;">

            <button onclick="abrirStreetView('${lum.codigo}', ${lat}, ${lng})" 
                    style="background: #0284c7; color: white; border: none; padding: 7px 10px; border-radius: 4px; cursor: pointer; width: 100%; margin-bottom: 6px; font-weight: bold; font-size: 0.82rem; display: flex; align-items: center; justify-content: center; gap: 6px;">
              🌐 Inspección 360° y Solar
            </button>

            ${lum.estado === 'operativa' ? `
              <button onclick="reportarFalla(${lum.id})" style="background: #dc3545; color: white; border: none; padding: 5px 10px; border-radius: 4px; cursor: pointer; width: 100%; margin-bottom: 5px;">
                Reportar Falla
              </button>
            ` : ''}
            <button onclick="verHistorial(${lum.id}, '${lum.codigo}')" class="btn-historial" style="margin-bottom: 5px;">
              📋 Ver Historial
            </button>
            <button onclick="eliminarLuminaria(${lum.id})" class="btn-eliminar">
              🗑️ Eliminar Luminaria
            </button>
          </div>
        `);

        markersGroup.addLayer(marker);
        marcadoresPorId[lum.id] = marker;
      }
    });
  }

  function cargarDatos() {
    fetch('/api/luminarias')
      .then(res => res.json())
      .then(luminarias => {
        todasLasLuminarias = luminarias;
        contadorPostes = luminarias.length + 1;

        statOperativas.textContent = luminarias.filter(l => l.estado === 'operativa').length;
        statFallando.textContent = luminarias.filter(l => l.estado === 'fallando').length;

        renderizarMapa(filtroEstado.value);
      });

    fetch('/api/reportes')
      .then(res => res.json())
      .then(reportes => {
        listaReportes.innerHTML = '';
        if (reportes.length === 0) {
          listaReportes.innerHTML = '<li>Sin reportes pendientes 🎉</li>';
          return;
        }

        reportes.forEach(rep => {
          const li = document.createElement('li');
          li.className = 'reporte-card';
          li.innerHTML = `
            <strong>${rep.codigo}</strong> (${rep.direccion})<br>
            <em>"${rep.descripcion}"</em><br>
            <button class="btn-resolver" onclick="resolverFalla(${rep.id}, ${rep.luminaria_id})">Marcar Reparado</button>
          `;
          listaReportes.appendChild(li);
        });
      });
  }

  // ==========================================
  // MOTOR DE BÚSQUEDA INTERNO DE CALLES Y LUMINARIAS
  // ==========================================
  function normalizarTexto(str) {
    if (!str) return '';
    return str.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
  }

  let tempMarker = null;
  let searchDebounce = null;

  async function ejecutarBusquedaCalles(query) {
    if (!query || query.length < 2) {
      resultadosBusqueda.style.display = 'none';
      if (btnLimpiar) btnLimpiar.style.display = 'none';
      return;
    }

    if (btnLimpiar) btnLimpiar.style.display = 'block';
    resultadosBusqueda.innerHTML = '';

    try {
      // 1. Luminarias en memoria
      const queryNorm = normalizarTexto(query);
      const lums = (todasLasLuminarias || []).filter(l => 
        normalizarTexto(l.codigo).includes(queryNorm) || 
        normalizarTexto(l.direccion).includes(queryNorm)
      );

      if (lums.length > 0) {
        const headerLum = document.createElement('li');
        headerLum.style.cssText = "background:#e9ecef;font-weight:bold;font-size:0.75rem;color:#555;padding:6px 12px;cursor:default;";
        headerLum.textContent = '💡 LUMINARIAS';
        resultadosBusqueda.appendChild(headerLum);

        lums.slice(0, 3).forEach(lum => {
          const li = document.createElement('li');
          li.className = 'search-item';
          li.innerHTML = `<strong>${lum.codigo}</strong> <span>📍 ${lum.direccion}</span>`;
          li.onclick = () => {
            map.flyTo([parseFloat(lum.latitud), parseFloat(lum.longitud)], 19, { duration: 1.2 });
            if (marcadoresPorId[lum.id]) marcadoresPorId[lum.id].openPopup();
            resultadosBusqueda.style.display = 'none';
            inputBusqueda.value = `${lum.codigo} - ${lum.direccion}`;
          };
          resultadosBusqueda.appendChild(li);
        });
      }

      // 2. Consulta a PostgreSQL
      const res = await fetch(`/api/buscar-calles?q=${encodeURIComponent(query)}`);
      const calles = await res.json();

      if (Array.isArray(calles) && calles.length > 0) {
        const headerCalles = document.createElement('li');
        headerCalles.style.cssText = "background:#e9ecef;font-weight:bold;font-size:0.75rem;color:#555;padding:6px 12px;cursor:default;";
        headerCalles.textContent = '🗺️ CALLES ENCONTRADAS';
        resultadosBusqueda.appendChild(headerCalles);

        calles.forEach(calle => {
          const li = document.createElement('li');
          li.className = 'search-item';
          li.innerHTML = `
            <strong>📍 ${calle.nombre}</strong>
            <span style="color: #666; font-size: 0.75rem;">Pajacuarán, Michoacán</span>
          `;

          li.onclick = () => {
            const lat = parseFloat(calle.latitud);
            const lon = parseFloat(calle.longitud);

            map.flyTo([lat, lon], 18, { duration: 1.2 });

            if (tempMarker) map.removeLayer(tempMarker);
            tempMarker = L.marker([lat, lon], {
              icon: L.divIcon({
                className: 'temp-search-marker',
                html: `<div style="background:#ff3333;width:14px;height:14px;border-radius:50%;border:2px solid white;box-shadow:0 0 10px rgba(255,0,0,0.8);"></div>`,
                iconSize: [14, 14],
                iconAnchor: [7, 7]
              })
            }).addTo(map);

            tempMarker.bindPopup(`<b>📍 ${calle.nombre}</b><br>Pajacuarán, Michoacán`).openPopup();
            resultadosBusqueda.style.display = 'none';
            inputBusqueda.value = calle.nombre;
          };

          resultadosBusqueda.appendChild(li);
        });
      }

      if (resultadosBusqueda.children.length === 0) {
        resultadosBusqueda.innerHTML = '<li class="search-empty" style="color:#777;padding:10px;cursor:default;">Sin resultados</li>';
      }

      resultadosBusqueda.style.display = 'block';

    } catch (err) {
      console.error('Error al realizar búsqueda:', err);
    }
  }

  if (inputBusqueda) {
    inputBusqueda.addEventListener('input', (e) => {
      const query = e.target.value.trim();
      if (searchDebounce) clearTimeout(searchDebounce);
      searchDebounce = setTimeout(() => ejecutarBusquedaCalles(query), 200);
    });

    inputBusqueda.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (searchDebounce) clearTimeout(searchDebounce);
        ejecutarBusquedaCalles(inputBusqueda.value.trim());
      }
    });
  }

  // Modo Agregar Manual Clic
  btnModoAgregar.addEventListener('click', () => {
    modoAgregarActivo = !modoAgregarActivo;

    if (modoAgregarActivo) {
      btnModoAgregar.textContent = '✕ Cancelar';
      btnModoAgregar.classList.add('activo');
      map.getContainer().classList.add('mapa-modo-agregar');
    } else {
      btnModoAgregar.textContent = '➕ Clic en Mapa';
      btnModoAgregar.classList.remove('activo');
      map.getContainer().classList.remove('mapa-modo-agregar');
    }
  });

  map.on('click', (e) => {
    if (!modoAgregarActivo) return;

    const { lat, lng } = e.latlng;
    const codigo = prompt('Ingrese el código de la farola (ej: LUM-002):');
    if (!codigo) return;
    const direccion = prompt('Ingrese la calle o referencia (ej: Javier Mina #180):');

    fetch('/api/luminarias', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        codigo: codigo,
        direccion: direccion || 'Sin referencia',
        tipo_lampara: 'LED 100W',
        latitud: lat,
        longitud: lng
      })
    })
    .then(res => res.json())
    .then(() => {
      modoAgregarActivo = false;
      btnModoAgregar.textContent = '➕ Clic en Mapa';
      btnModoAgregar.classList.remove('activo');
      map.getContainer().classList.remove('mapa-modo-agregar');
      cargarDatos();
    });
  });

  filtroEstado.addEventListener('change', (e) => renderizarMapa(e.target.value));

  btnExportar.addEventListener('click', () => {
    if (todasLasLuminarias.length === 0) return alert('No hay datos para exportar');

    let csvContent = "data:text/csv;charset=utf-8,ID,Codigo,Direccion,Estado,Tipo,Latitud,Longitud\n";
    todasLasLuminarias.forEach(l => {
      csvContent += `${l.id},"${l.codigo}","${l.direccion}",${l.estado},"${l.tipo_lampara}",${l.latitud},${l.longitud}\n`;
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `reporte_luminarias_pajacuaran.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  });

  const sidebar = document.getElementById('sidebar');
  const toggleBtn = document.getElementById('toggle-sidebar');
  const closeBtn = document.getElementById('close-sidebar');
  const overlay = document.getElementById('overlay');

  toggleBtn.addEventListener('click', () => {
    sidebar.classList.add('active');
    overlay.classList.add('active');
  });

  const cerrarMenu = () => {
    sidebar.classList.remove('active');
    overlay.classList.remove('active');
  };

  closeBtn.addEventListener('click', cerrarMenu);
  overlay.addEventListener('click', cerrarMenu);

  window.cargarDatos = cargarDatos;
  cargarDatos();
});

// ==========================================
// FUNCIONES GLOBALES
// ==========================================
function eliminarLuminaria(id) {
  if (confirm('¿Deseas eliminar esta luminaria de la base de datos?')) {
    fetch(`/api/luminarias/${id}`, { method: 'DELETE' })
      .then(res => res.json())
      .then(() => window.cargarDatos());
  }
}

function reportarFalla(id) {
  const descripcion = prompt('Describa el problema:');
  if (!descripcion) return;

  fetch(`/api/luminarias/${id}/reportar`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ descripcion, estado: 'fallando' })
  }).then(() => window.cargarDatos());
}

function resolverFalla(reporteId, luminariaId) {
  fetch(`/api/reportes/${reporteId}/resolver`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ luminaria_id: luminariaId })
  }).then(() => window.cargarDatos());
}

function verHistorial(id, codigo) {
  const modal = document.getElementById('modal-historial');
  const titulo = document.getElementById('titulo-historial');
  const cuerpo = document.getElementById('cuerpo-historial');
  const cerrarBtn = document.getElementById('cerrar-modal');

  titulo.textContent = `Historial: ${codigo}`;
  cuerpo.innerHTML = '<p>Cargando intervenciones...</p>';
  modal.classList.add('activo');

  fetch(`/api/luminarias/${id}/historial`)
    .then(res => res.json())
    .then(reportes => {
      if (reportes.length === 0) {
        cuerpo.innerHTML = '<p>Esta luminaria no tiene reportes ni intervenciones registradas.</p>';
        return;
      }

      cuerpo.innerHTML = '';
      reportes.forEach(rep => {
        const fecha = new Date(rep.fecha_reporte).toLocaleString('es-MX');
        const div = document.createElement('div');
        div.className = `item-historial ${rep.estado_reporte === 'resuelto' ? 'resuelto' : ''}`;
        div.innerHTML = `
          <strong>Estado:</strong> <span style="color: ${rep.estado_reporte === 'resuelto' ? 'green' : 'red'};">${rep.estado_reporte.toUpperCase()}</span><br>
          <strong>Fecha:</strong> ${fecha}<br>
          <strong>Detalle:</strong> "${rep.descripcion}"
        `;
        cuerpo.appendChild(div);
      });
    })
    .catch(() => {
      cuerpo.innerHTML = '<p>Error al cargar el historial.</p>';
    });

  cerrarBtn.onclick = () => modal.classList.remove('activo');
  window.onclick = (e) => { if (e.target === modal) modal.classList.remove('activo'); };
}

// ==========================================
// BÚSQUEDA DE TRAMO ENTRE DOS CRUCES (GLOBAL)
// ==========================================
window.buscarPorTramo = async function () {
  if (!map || typeof map.addLayer !== 'function') {
    alert('El mapa aún se está cargando. Espera un segundo.');
    return;
  }

  const elemPrincipal = document.getElementById('busqPrincipal');
  const elemC1 = document.getElementById('busqCruce1');
  const elemC2 = document.getElementById('busqCruce2');

  const principal = elemPrincipal ? elemPrincipal.value.trim() : '';
  const c1 = elemC1 ? elemC1.value.trim() : '';
  const c2 = elemC2 ? elemC2.value.trim() : '';

  if (!principal || !c1 || !c2) {
    alert('Ingresa la calle principal y los dos cruces.');
    return;
  }

  try {
    const url = `/api/luminarias-entre-calles?callePrincipal=${encodeURIComponent(principal)}&cruce1=${encodeURIComponent(c1)}&cruce2=${encodeURIComponent(c2)}`;
    const res = await fetch(url);
    const data = await res.json();

    if (!res.ok) {
      alert(data.error || 'No se encontró el tramo solicitado.');
      return;
    }

    if (capaResaltadoTramo && map.hasLayer(capaResaltadoTramo)) {
      map.removeLayer(capaResaltadoTramo);
      capaResaltadoTramo = null;
    }

    if (data.tramo_geojson) {
      const geojsonGeom = JSON.parse(data.tramo_geojson);
      capaResaltadoTramo = L.geoJSON(geojsonGeom, {
        style: {
          color: '#0284c7',
          weight: 3,
          fillColor: '#38bdf8',
          fillOpacity: 0.35,
          dashArray: '5, 5'
        }
      }).addTo(map);

      map.fitBounds(capaResaltadoTramo.getBounds(), { padding: [50, 50], maxZoom: 18 });
    }

    if (!data.luminarias || data.luminarias.length === 0) {
      alert('Tramo delimitado con éxito. No hay luminarias registradas en este segmento.');
    } else {
      console.log(`💡 Se detectaron ${data.luminarias.length} luminarias en este tramo.`);
      const primerId = data.luminarias[0].id;
      if (marcadoresPorId && marcadoresPorId[primerId]) {
        marcadoresPorId[primerId].openPopup();
      }
    }
  } catch (err) {
    console.error('Error al procesar el tramo:', err);
    alert('Ocurrió un error al contactar el servidor.');
  }
};

// ==========================================
// LIMPIAR TRAMO Y RESTABLECER VISTA
// ==========================================
window.limpiarTramo = function () {
  if (capaResaltadoTramo && map && map.hasLayer(capaResaltadoTramo)) {
    map.removeLayer(capaResaltadoTramo);
    capaResaltadoTramo = null;
  }

  // Limpiar campos de texto
  const elemPrincipal = document.getElementById('busqPrincipal');
  const elemC1 = document.getElementById('busqCruce1');
  const elemC2 = document.getElementById('busqCruce2');

  if (elemPrincipal) elemPrincipal.value = '';
  if (elemC1) elemC1.value = '';
  if (elemC2) elemC2.value = '';

  // Cerrar cualquier popup abierto
  if (map) {
    map.closePopup();
  }
};

// ==========================================
// INSPECCIÓN VIRTUAL 360° Y CÁLCULO SOLAR
// ==========================================
window.abrirStreetView = function(codigo, lat, lng) {
  const modal = document.getElementById('modal-streetview');
  const titulo = document.getElementById('modal-sv-titulo');
  const iframe = document.getElementById('iframe-streetview');
  const solarContainer = document.getElementById('widget-solar-info');
  const btnCerrar = document.getElementById('modal-sv-cerrar');
  const btnExt = document.getElementById('btn-abrir-maps-ext');

  if (!modal) return;

  titulo.textContent = `📍 Inspección Virtual: ${codigo}`;

  // Botón externo de respaldo por si el tramo no tiene cobertura 360° en iframe
  if (btnExt) {
    btnExt.href = `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${lat},${lng}`;
  }

  // 1. Cálculo solar dinámico con SunCalc
  if (typeof SunCalc !== 'undefined') {
    const hoy = new Date();
    const tiempos = SunCalc.getTimes(hoy, lat, lng);
    const formatoHora = (f) => f ? f.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }) : '--:--';

    const milisegundosNoche = (24 * 60 * 60 * 1000) - (tiempos.sunset - tiempos.sunrise);
    const horasNoche = (milisegundosNoche / (1000 * 60 * 60)).toFixed(1);

    solarContainer.innerHTML = `
      <div class="item-solar">
        <strong>🌅 Amanecer (Apagado)</strong>
        <span>${formatoHora(tiempos.sunrise)}</span>
      </div>
      <div class="item-solar">
        <strong>🌇 Ocaso (Encendido)</strong>
        <span>${formatoHora(tiempos.sunset)}</span>
      </div>
      <div class="item-solar">
        <strong>🌙 Tiempo Nocturno Activo</strong>
        <span>${horasNoche} horas / noche</span>
      </div>
      <div class="item-solar">
        <strong>⚡ Estatus Fotocelda</strong>
        <span>${hoy > tiempos.sunset || hoy < tiempos.sunrise ? '🌙 Debería estar ON' : '☀️ Debería estar OFF'}</span>
      </div>
    `;
  }

  // 2. Parámetros específicos de panorama 360° para Google Maps Embed
  iframe.src = `https://maps.google.com/maps?layer=c&cbll=${lat},${lng}&cbp=12,0,,0,0&output=svembed`;

  modal.classList.add('activo');

  const cerrar = () => {
    modal.classList.remove('activo');
    iframe.src = '';
  };

  btnCerrar.onclick = cerrar;
  modal.onclick = (e) => {
    if (e.target === modal) cerrar();
  };
};