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

  // Elementos de la Búsqueda y Asistente IA
  const inputBusqueda = document.getElementById('input-busqueda');
  const btnLimpiar = document.getElementById('btn-limpiar-busqueda');
  const resultadosBusqueda = document.getElementById('resultados-busqueda');
  const aiRespuestaBox = document.getElementById('ai-respuesta-box');

  // Elementos del Modo Recorrido (GPS)
  const toggleGPSMode = document.getElementById('toggle-gps-mode');
  const statusGPSMode = document.getElementById('status-gps-mode');
  const btnGPS = document.getElementById('btn-gps');

  const pajacuaranCoords = [20.1220, -102.5617];
  let contadorPostes = 1;

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

 function crearIconoTactico(estado) {
    const esOperativa = estado === 'operativa';
    const clasePulso = esOperativa ? 'beacon-operativa' : 'beacon-fallando';
    
    // Microbaliza de 12px con núcleo brillante y anillo de difusión
    const htmlMarker = `
      <div class="beacon-wrapper">
        <div class="beacon-halo ${clasePulso}"></div>
        <div class="beacon-dot ${clasePulso}"></div>
      </div>
    `;

    return L.divIcon({
      className: 'marker-tactico-container',
      html: htmlMarker,
      iconSize: [24, 24],
      iconAnchor: [12, 12],
      popupAnchor: [0, -14]
    });
  }

  const iconOperativa = crearIconoTactico('operativa');
  const iconFallando = crearIconoTactico('fallando');

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

  // ==========================================================
  // MOTOR DE LENGUAJE NATURAL COLOQUIAL / ASISTENTE MUNICIPAL
  // ==========================================================
  function limpiarFrase(str) {
    if (!str) return '';
    return str
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function similitudPalabras(a, b) {
    if (a === b) return 1;
    if (a.length === 0 || b.length === 0) return 0;

    const matriz = Array.from({ length: a.length + 1 }, () => []);
    for (let i = 0; i <= a.length; i++) matriz[i][0] = i;
    for (let j = 0; j <= b.length; j++) matriz[0][j] = j;

    for (let i = 1; i <= a.length; i++) {
      for (let j = 1; j <= b.length; j++) {
        const costo = a[i - 1] === b[j - 1] ? 0 : 1;
        matriz[i][j] = Math.min(
          matriz[i - 1][j] + 1,
          matriz[i][j - 1] + 1,
          matriz[i - 1][j - 1] + 1
        );
      }
    }
    const dist = matriz[a.length][b.length];
    return 1 - dist / Math.max(a.length, b.length);
  }

  const DICCIONARIO_MODISMOS = {
    fallando: [
      'no jala', 'no jalan', 'no sirve', 'no sirven', 'sin luz', 'a oscuras', 
      'oscuras', 'no prende', 'no prenden', 'parpadea', 'parpadeando', 'trono', 
      'tronaron', 'fundio', 'fundida', 'fundidas', 'fundidos', 'quemada', 
      'quemadas', 'quemado', 'descompuesta', 'descompuestas', 'descompuesto', 
      'fregada', 'fregadas', 'chingada', 'chingadas', 'desmadro', 'desmadrada', 
      'daniada', 'daniadas', 'danada', 'danadas', 'rota', 'rotas', 'fallando', 
      'falla', 'fallas', 'averiada', 'averiadas', 'reparar', 'apago', 'apagada', 
      'apagadas', 'apagados', 'muerta', 'muertas'
    ],
    operativa: [
      'si jala', 'si jalan', 'jala bien', 'jalan bien', 'al 100', 'al tiro', 
      'buenas', 'buena', 'buenos', 'sirven', 'sirve', 'prende', 'prenden', 
      'prendida', 'prendidas', 'encendida', 'encendidas', 'funcionando', 
      'funciona', 'funcionan', 'operativa', 'operativas', 'activas', 'activa', 
      'sanas', 'arregladas', 'correctas'
    ],
    conteo: [
      'cuantas', 'cuantos', 'cuanto', 'total', 'resumen', 'porcentaje', 
      'dime cuantas', 'cuantas van', 'numero de', 'suma', 'estadistica'
    ],
    tipos: {
      'led': ['led', 'leds', 'blanca', 'blancas'],
      'sodio': ['sodio', 'vapor', 'amarilla', 'amarillas', 'naranja'],
      '100w': ['100w', '100 w', '100 watts', '100vatios'],
      '70w': ['70w', '70 w', '70 watts'],
      '50w': ['50w', '50 w', '50 watts']
    }
  };

  const PALABRAS_VACIAS = [
    'dame', 'las', 'los', 'el', 'la', 'un', 'una', 'unos', 'unas', 'que', 'en', 'de', 
    'del', 'por', 'favor', 'poste', 'postes', 'farola', 'farolas', 'foco', 'focos', 
    'lampara', 'lamparas', 'luz', 'luces', 'luminaria', 'luminarias', 'donde', 'estan', 
    'esta', 'muestrame', 'ensename', 'checates', 'checame', 'sacame', 'quiero', 'ver', 
    'cuales', 'hay', 'todos', 'todas', 'porfa', 'calle', 'avenida', 'andador'
  ];

  function interpretarPreguntaPopular(fraseOriginal) {
    const texto = limpiarFrase(fraseOriginal);

    let estadoDetectado = null;
    for (const claveFalla of DICCIONARIO_MODISMOS.fallando) {
      if (texto.includes(claveFalla)) {
        estadoDetectado = 'fallando';
        break;
      }
    }
    if (!estadoDetectado) {
      for (const claveOk of DICCIONARIO_MODISMOS.operativa) {
        if (texto.includes(claveOk)) {
          estadoDetectado = 'operativa';
          break;
        }
      }
    }

    let tipoDetectado = null;
    for (const [tipo, patrones] of Object.entries(DICCIONARIO_MODISMOS.tipos)) {
      if (patrones.some(p => texto.includes(p))) {
        tipoDetectado = tipo;
        break;
      }
    }

    const esPreguntaConteo = DICCIONARIO_MODISMOS.conteo.some(c => texto.includes(c));

    const tokens = texto.split(' ').filter(token => {
      if (token.length <= 2) return false;
      if (PALABRAS_VACIAS.includes(token)) return false;
      if (DICCIONARIO_MODISMOS.fallando.some(f => f.includes(token))) return false;
      if (DICCIONARIO_MODISMOS.operativa.some(o => o.includes(token))) return false;
      if (DICCIONARIO_MODISMOS.conteo.some(c => c.includes(token))) return false;
      return true;
    });

    const posibleUbicacion = tokens.join(' ').trim();

    return {
      estado: estadoDetectado,
      tipo: tipoDetectado,
      esConteo: esPreguntaConteo,
      ubicacion: posibleUbicacion,
      textoLimpio: texto
    };
  }

  // ==========================================================
  // MOTOR DE IA MUNICIPAL AVANZADO: LENGUAJE NATURAL + GEOMETRÍA
  // ==========================================================
  async function ejecutarAsistenteInteligente(pregunta) {
    if (!pregunta || pregunta.trim().length < 2) return;

    if (resultadosBusqueda) resultadosBusqueda.style.display = 'none';

    // 1. Detección de tramo entre cruces (ej. "Mina entre Alameda y Ávila Camacho")
    const matchEntre = pregunta.match(/(.+?)\s+entre\s+(.+?)\s+y\s+(.+)/i);
    if (matchEntre) {
      const callePrin = matchEntre[1].replace(/(postes|farolas|focos|luminarias|en|la|calle)\s+/gi, '').trim();
      const cruce1 = matchEntre[2].trim();
      const cruce2 = matchEntre[3].trim();

      mostrarCajaAsistente('⏳ Analizando Tramo Espacial...', `Delimitando segmento de <b>${callePrin}</b> entre <b>${cruce1}</b> y <b>${cruce2}</b>...`, []);

      try {
        const url = `/api/luminarias-entre-calles?callePrincipal=${encodeURIComponent(callePrin)}&cruce1=${encodeURIComponent(cruce1)}&cruce2=${encodeURIComponent(cruce2)}`;
        const res = await fetch(url);
        const data = await res.json();

        if (res.ok && data.tramo_geojson) {
          if (capaResaltadoTramo && map.hasLayer(capaResaltadoTramo)) {
            map.removeLayer(capaResaltadoTramo);
          }

          const geom = JSON.parse(data.tramo_geojson);
          capaResaltadoTramo = L.geoJSON(geom, {
            style: { color: '#68181A', weight: 4, fillColor: '#E8B024', fillOpacity: 0.3 }
          }).addTo(map);

          map.fitBounds(capaResaltadoTramo.getBounds(), { padding: [50, 50], maxZoom: 18 });

          const lumsTramo = data.luminarias || [];
          mostrarCajaAsistente(
            '📍 Tramo Delimitado con Éxito',
            `Se detectaron <b>${lumsTramo.length} luminarias</b> en el tramo de <b>${callePrin}</b> (entre ${cruce1} y ${cruce2}).`,
            lumsTramo
          );
          return;
        }
      } catch (err) {
        console.warn('Fallo en tramo automático:', err);
      }
    }

    const intencion = interpretarPreguntaPopular(pregunta);

    // 2. Conteo y estadísticas globales
    if (intencion.esConteo && !intencion.ubicacion) {
      const totalPostes = todasLasLuminarias.length;
      const activas = todasLasLuminarias.filter(l => l.estado === 'operativa').length;
      const descompuestas = todasLasLuminarias.filter(l => l.estado === 'fallando').length;
      const porc = totalPostes > 0 ? ((activas / totalPostes) * 100).toFixed(1) : 0;

      const mensaje = `Actualmente hay <b>${totalPostes} luminarias registradas</b> en Pajacuarán:<br>
        • <b>${activas}</b> operativas (${porc}% del total).<br>
        • <b>${descompuestas}</b> con reporte de falla activo.`;

      mostrarCajaAsistente('📊 Balance Municipal', mensaje, todasLasLuminarias);
      centrarEnMapa(todasLasLuminarias);
      return;
    }

    // 3. Análisis de ubicación: cruce de texto y proximidad geográfica
    if (intencion.ubicacion && intencion.ubicacion.length >= 3) {
      try {
        const res = await fetch(`/api/buscar-calles?q=${encodeURIComponent(intencion.ubicacion)}`);
        const callesBD = await res.json();

        if (Array.isArray(callesBD) && callesBD.length > 0) {
          const calleEncontrada = callesBD[0];
          const centroCalle = L.latLng(parseFloat(calleEncontrada.latitud), parseFloat(calleEncontrada.longitud));

          // A) Detección por cercanía espacial al trazo de la calle
          let postesCercanos = todasLasLuminarias.filter(lum => {
            const pCoord = L.latLng(parseFloat(lum.latitud), parseFloat(lum.longitud));
            return centroCalle.distanceTo(pCoord) <= 120;
          });

          // B) Detección por concordancia de texto en el registro
          todasLasLuminarias.forEach(lum => {
            const dir = limpiarFrase(lum.direccion);
            const cod = limpiarFrase(lum.codigo);
            if ((dir.includes(intencion.ubicacion) || cod.includes(intencion.ubicacion)) && !postesCercanos.some(p => p.id === lum.id)) {
              postesCercanos.push(lum);
            }
          });

          // C) Filtrar por estado si la consulta lo requería
          if (intencion.estado) {
            postesCercanos = postesCercanos.filter(l => l.estado === intencion.estado);
          }

          if (postesCercanos.length > 0) {
            let detalle = `Se detectaron automáticamente <b>${postesCercanos.length} poste(s)</b> vinculados a <b>${calleEncontrada.nombre}</b>`;
            if (intencion.estado) detalle += ` con estado <b>${intencion.estado.toUpperCase()}</b>`;

            mostrarCajaAsistente('📍 Postes Localizados', detalle, postesCercanos);
            centrarEnMapa(postesCercanos);
            return;
          } else {
            map.flyTo(centroCalle, 18, { duration: 1.2 });
            mostrarCajaAsistente(
              '🗺️ Calle Localizada',
              `Se ubicó <b>${calleEncontrada.nombre}</b> en el mapa. Actualmente no hay postes registrados con esos criterios en su perímetro.`,
              []
            );
            return;
          }
        }
      } catch (err) {
        console.warn('Error en análisis espacial de calle:', err);
      }
    }

    // 4. Filtrado en memoria por estado o tecnología
    let candidatos = [...todasLasLuminarias];

    if (intencion.estado) {
      candidatos = candidatos.filter(l => l.estado === intencion.estado);
    }
    if (intencion.tipo) {
      candidatos = candidatos.filter(l => limpiarFrase(l.tipo_lampara).includes(intencion.tipo));
    }

    if (candidatos.length > 0 && (intencion.estado || intencion.tipo)) {
      mostrarCajaAsistente(
        '💡 Estado de Luminarias',
        `Se localizaron <b>${candidatos.length} luminaria(s)</b> bajo los parámetros solicitados.`,
        candidatos
      );
      centrarEnMapa(candidatos);
      return;
    }

    // 5. Tolerancia léxica amplia sobre códigos o referencias
    const lumsPorTexto = todasLasLuminarias.filter(l => {
      const dir = limpiarFrase(l.direccion);
      const cod = limpiarFrase(l.codigo);
      return dir.includes(intencion.textoLimpio) || cod.includes(intencion.textoLimpio);
    });

    if (lumsPorTexto.length > 0) {
      mostrarCajaAsistente('💡 Luminaria Localizada', `Se encontraron coincidencias para <b>"${pregunta}"</b>:`, lumsPorTexto);
      centrarEnMapa(lumsPorTexto);
      return;
    }

    // 6. Sin resultados
    mostrarCajaAsistente(
      '🤔 Sin coincidencias',
      `No se encontraron elementos para <i>"${pregunta}"</i>. Prueba con: <b>"postes en Javier Mina"</b>, <b>"cuántas sirven"</b> o <b>"las que no jalan"</b>.`,
      []
    );
  }

  function centrarEnMapa(lista) {
    if (!lista || lista.length === 0) return;

    if (lista.length === 1) {
      const p = lista[0];
      map.flyTo([parseFloat(p.latitud), parseFloat(p.longitud)], 19, { duration: 1.2 });
      if (marcadoresPorId[p.id]) marcadoresPorId[p.id].openPopup();
    } else {
      const bounds = L.latLngBounds(lista.map(p => [parseFloat(p.latitud), parseFloat(p.longitud)]));
      map.fitBounds(bounds, { padding: [60, 60], maxZoom: 18 });
    }
  }

  function mostrarCajaAsistente(titulo, textoHtml, postes) {
    if (!aiRespuestaBox) return;

    let listaHtml = '';
    if (postes && postes.length > 0) {
      listaHtml = `
        <div style="margin-top: 10px; max-height: 150px; overflow-y: auto; border-top: 1px solid #f1f5f9; padding-top: 6px;">
          ${postes.slice(0, 10).map(p => `
            <div class="ai-item-poste" onclick="map.flyTo([${p.latitud}, ${p.longitud}], 19); if(marcadoresPorId[${p.id}]) marcadoresPorId[${p.id}].openPopup();">
              <span><b>${p.codigo}</b> - <small>${p.direccion}</small></span>
              <span class="badge-estado-mini ${p.estado}">${p.estado.toUpperCase()}</span>
            </div>
          `).join('')}
          ${postes.length > 10 ? `<small style="color:#888; display:block; text-align:center; margin-top:4px;">...y otros ${postes.length - 10} postes más en el mapa</small>` : ''}
        </div>
      `;
    }

    aiRespuestaBox.innerHTML = `
      <div class="ai-header">
        <span>✨ ${titulo}</span>
        <button class="ai-cerrar" onclick="document.getElementById('ai-respuesta-box').style.display='none'">&times;</button>
      </div>
      <div class="ai-texto-resultado">${textoHtml}</div>
      ${listaHtml}
    `;
    aiRespuestaBox.style.display = 'block';
  }

  // Eventos del buscador inteligente
  if (inputBusqueda) {
    inputBusqueda.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        ejecutarAsistenteInteligente(inputBusqueda.value.trim());
      }
    });

    inputBusqueda.addEventListener('input', (e) => {
      if (btnLimpiar) {
        btnLimpiar.style.display = e.target.value.length > 0 ? 'block' : 'none';
      }
    });

    if (btnLimpiar) {
      btnLimpiar.addEventListener('click', () => {
        inputBusqueda.value = '';
        if (aiRespuestaBox) aiRespuestaBox.style.display = 'none';
        if (resultadosBusqueda) resultadosBusqueda.style.display = 'none';
        btnLimpiar.style.display = 'none';
      });
    }
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

  const elemPrincipal = document.getElementById('busqPrincipal');
  const elemC1 = document.getElementById('busqCruce1');
  const elemC2 = document.getElementById('busqCruce2');

  if (elemPrincipal) elemPrincipal.value = '';
  if (elemC1) elemC1.value = '';
  if (elemC2) elemC2.value = '';

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

  if (btnExt) {
    btnExt.href = `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${lat},${lng}`;
  }

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