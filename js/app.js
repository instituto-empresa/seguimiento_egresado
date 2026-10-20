// ==============================================================================
// LÓGICA GENERAL - SISTEMA DE SEGUIMIENTO AL EGRESADO NEUMANN
// Conexión Supabase, Padrón, Mailing y Gamificación
// ==============================================================================

// Estado en memoria
var egresadosData = [];
window.egresadosData = egresadosData;
var referidosData = [];
window.referidosData = referidosData;
var premiosData = [
  { id: 'p1', nombre_premio: 'Pack IEmpresa', puntos_requeridos: 50, limite_anual: 4, stock_disponible: 4 },
  { id: 'p2', nombre_premio: 'Polo IEmpresa', puntos_requeridos: 50, limite_anual: 4, stock_disponible: 4 },
  { id: 'p3', nombre_premio: 'Polera IEmpresa', puntos_requeridos: 100, limite_anual: 4, stock_disponible: 4 },
  { id: 'p4', nombre_premio: 'Descuento 10% Especializaciones', puntos_requeridos: 1000, limite_anual: 4, stock_disponible: 4 }
];

// 1. UTILIDAD DE TOASTS
function mostrarToast(mensaje, tipo = 'purple') {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast-neumann ${tipo}`;
  
  let icon = 'bi-info-circle-fill text-primary';
  if (tipo === 'success') icon = 'bi-check-circle-fill text-success';
  if (tipo === 'danger') icon = 'bi-exclamation-triangle-fill text-danger';
  if (tipo === 'warning') icon = 'bi-bell-fill text-warning';

  toast.innerHTML = `
    <i class="bi ${icon}" style="font-size: 1.2rem;"></i>
    <div style="flex: 1; font-size: 12px;">${mensaje}</div>
    <button type="button" style="background:none;border:none;color:#94a3b8;cursor:pointer;" onclick="this.parentElement.remove()">
      <i class="bi bi-x"></i>
    </button>
  `;

  container.appendChild(toast);
  setTimeout(() => {
    toast.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    setTimeout(() => toast.remove(), 300);
  }, 4500);
}

// 2. OBTENER EGRESADOS (Desde Supabase con fallback local)
async function cargarEgresadosDesdeBD() {
  if (!supabaseClient) {
    console.warn('Supabase no configurado o sin conexion. Usando almacenamiento local.');
    return egresadosData || [];
  }

  try {
    let todosLosEgresados = [];
    let desde = 0;
    const limitePorLote = 1000;
    let hayMas = true;

    // Supabase limita las consultas a 1000 registros por llamada.
    // Este bucle obtiene todos los registros completos sin importar el total.
    while (hayMas) {
      const { data, error } = await supabaseClient
        .from('egresados')
        .select('*')
        .order('apellidos', { ascending: true })
        .range(desde, desde + limitePorLote - 1);

      if (error) throw error;

      if (data && data.length > 0) {
        todosLosEgresados = todosLosEgresados.concat(data);
        desde += limitePorLote;
        if (data.length < limitePorLote) {
          hayMas = false;
        }
      } else {
        hayMas = false;
      }
    }

    egresadosData = todosLosEgresados;
    window.egresadosData = todosLosEgresados;
    return todosLosEgresados;
  } catch (err) {
    console.error('Error al cargar de Supabase:', err.message);
  }
  return egresadosData || [];
}

// 3. BUSCAR EGRESADO POR DNI
async function buscarEgresadoPorDni(dni) {
  const dniLimpio = String(dni).trim();
  if (supabaseClient) {
    try {
      const { data, error } = await supabaseClient
        .from('egresados')
        .select('*')
        .eq('dni', dniLimpio)
        .maybeSingle();

      if (!error && data) return data;
    } catch (e) {
      console.warn('Búsqueda remota falló, buscando en memoria...');
    }
  }

  // Fallback memoria
  return egresadosData.find(e => String(e.dni).trim() === dniLimpio) || null;
}

// 4. ACTUALIZACIÓN INTEGRAL DEL EGRESADO
async function registrarActualizacionEgresado(egresadoId, datosActualizados, datosLaborales, encuesta, referidos = []) {
  try {
    // A) Actualizar datos personales y contacto en egresados
    if (supabaseClient) {
      const payloadBase = {
        correo_alternativo: datosActualizados.correo_alternativo || datosActualizados.correo,
        telefono: datosActualizados.telefono,
        usa_correo_institucional: datosActualizados.usa_correo_institucional !== undefined ? datosActualizados.usa_correo_institucional : true,
        datos_actualizados: true,
        estado_contacto: 'contactado_exitoso',
        fecha_ultimo_contacto: new Date().toISOString()
      };
      if (datosActualizados.correo) {
        payloadBase.correo = datosActualizados.correo;
      }

      // Intentar actualizar incluyendo columnas extendidas si vienen en el payload
      let payloadCompleto = { ...payloadBase };
      if (datosActualizados.sexo) payloadCompleto.sexo = datosActualizados.sexo;
      if (datosActualizados.edad) payloadCompleto.edad = datosActualizados.edad;
      if (datosActualizados.grado_instruccion) payloadCompleto.grado_instruccion = datosActualizados.grado_instruccion;

      let { error: errEgresado } = await supabaseClient
        .from('egresados')
        .update(payloadCompleto)
        .eq('id', egresadoId);

      // Si falla porque las columnas extendidas aún no existen en la BD (error 42703), fallback a payload estándar
      if (errEgresado && (errEgresado.code === '42703' || String(errEgresado.message || '').includes('column'))) {
        console.warn('Columnas opcionales no encontradas en tabla egresados, guardando payload estándar:', errEgresado.message);
        const { error: errRetry } = await supabaseClient
          .from('egresados')
          .update(payloadBase)
          .eq('id', egresadoId);
        if (errRetry) throw errRetry;
      } else if (errEgresado) {
        throw errEgresado;
      }

      // B) Insertar seguimiento laboral
      if (datosLaborales) {
        await supabaseClient.from('seguimiento_laboral').insert({
          egresado_id: egresadoId,
          situacion_laboral: datosLaborales.situacion_laboral,
          rubro_negocio: datosLaborales.rubro_negocio || null,
          empresa: datosLaborales.empresa || null,
          cargo: datosLaborales.cargo || null,
          tipo_empresa: datosLaborales.tipo_empresa || null,
          rango_sueldo: datosLaborales.rango_sueldo || null,
          condicion_laboral: datosLaborales.condicion_laboral || null,
          recibio_ascenso: datosLaborales.recibio_ascenso || false,
          motivo_no_trabaja: datosLaborales.motivo_no_trabaja || null,
          jefe_nombre: datosLaborales.jefe_nombre || null,
          jefe_cargo: datosLaborales.jefe_cargo || null,
          jefe_correo: datosLaborales.jefe_correo || null,
          capturado_por: 'portal_web'
        });
      }

      // C) Insertar encuesta si se completó
      if (encuesta) {
        await supabaseClient.from('encuestas_satisfaccion').insert({
          egresado_id: egresadoId,
          calificacion_formacion: encuesta.calificacion_formacion,
          nps_recomendacion: encuesta.nps_recomendacion,
          promocion_insercion: encuesta.promocion_insercion,
          pertinencia_carrera: encuesta.pertinencia_carrera,
          sugerencias_mejora: encuesta.sugerencias_mejora
        });
      }

      // D) Registrar referidos
      if (referidos && referidos.length > 0) {
        for (const ref of referidos) {
          if (ref.nombre && ref.telefono) {
            await supabaseClient.from('referidos_egresados').insert({
              egresado_referente_id: egresadoId,
              nombre_referido: ref.nombre,
              telefono_referido: ref.telefono,
              carrera_referido: ref.carrera || null,
              estado_validacion: 'pendiente'
            });
          }
        }
      }
    }

    // Actualizar copia en memoria
    const index = egresadosData.findIndex(e => e.id === egresadoId);
    if (index !== -1) {
      egresadosData[index] = {
        ...egresadosData[index],
        ...datosActualizados,
        datos_actualizados: true,
        estado_contacto: 'contactado_exitoso'
      };
    }

    return { success: true };
  } catch (error) {
    console.error('Error al actualizar datos:', error);
    return { success: false, error: error.message };
  }
}

// 5. IMPORTAR CSV A SUPABASE
async function importarCsvASupabase(csvText) {
  const lineas = csvText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  if (lineas.length < 2) throw new Error('El archivo CSV está vacío.');

  const headers = lineas[0].split(',').map(h => h.trim());
  const registros = [];

  for (let i = 1; i < lineas.length; i++) {
    // Regex para respetar comas dentro de comillas (ej. "16,7")
    const regex = /(?:,|\n|^)("(?:(?:"")*[^"]*)*"|[^",\n]*|(?:\n|$))/g;
    const valores = [];
    let match;
    while ((match = regex.exec(lineas[i])) !== null) {
      let val = match[1] || '';
      if (val.startsWith('"') && val.endsWith('"')) {
        val = val.slice(1, -1).replace(/""/g, '"');
      }
      valores.push(val.trim());
      if (regex.lastIndex >= lineas[i].length) break;
    }

    if (valores.length >= 3 && valores[2]) {
      const notaStr = valores[13] ? valores[13].replace(',', '.') : null;
      const notaNum = notaStr && !isNaN(parseFloat(notaStr)) ? parseFloat(notaStr) : null;
      const anioNum = valores[11] && !isNaN(parseInt(valores[11])) ? parseInt(valores[11]) : null;

      registros.push({
        nombres: valores[0] || 'Sin Nombre',
        apellidos: valores[1] || 'Sin Apellido',
        dni: valores[2],
        correo: valores[3] || null,
        correo_alternativo: valores[4] || null,
        telefono: valores[5] || null,
        programa_estudios: valores[6] || 'General',
        modalidad: valores[7] || 'Online',
        curricula: valores[8] || null,
        periodo_inicial: valores[9] || null,
        periodo_final: valores[10] || null,
        anio_egreso: anioNum,
        aprobo_titulacion: String(valores[12]).toLowerCase() === 'si',
        promedio: notaNum,
        datos_actualizados: false,
        estado_contacto: 'pendiente'
      });
    }
  }

  if (supabaseClient) {
    // Insertar por lotes de 50 en Supabase
    const chunkSize = 50;
    for (let i = 0; i < registros.length; i += chunkSize) {
      const chunk = registros.slice(i, i + chunkSize);
      const { error } = await supabaseClient
        .from('egresados')
        .upsert(chunk, { onConflict: 'dni' });
      if (error) console.error('Error al insertar bloque:', error);
    }
  }

  // Refrescar memoria
  egresadosData = registros;
  return registros.length;
}

// 6. GENERADOR DE MAILING (Plantilla Oficial Neumann)
// 5. CONFIGURACIÓN Y GENERACIÓN DE PLANTILLA DE CORREO (Personalizable y sin rosado)
function obtenerPlantillaConfig() {
  const defaultConfig = {
    asunto: "Actualización de Datos de Egresados - Instituto de la Empresa",
    titulo: "INSTITUTO DE LA EMPRESA",
    subtitulo: "Red Oficial de Egresados y Graduados | Convocatoria Oficial",
    saludo: "Estimado(a) {{nombre}},",
    cuerpo: "Esperamos que te encuentres muy bien. Como graduado(a) del programa de {{carrera}}, queremos invitarte a mantener actualizada tu información de contacto y trayectoria profesional para acceder a convocatorias laborales exclusivas, capacitaciones y beneficios de nuestra red institucional.",
    incluirBeneficios: true,
    beneficioTitulo: "★ Beneficios de la Red de Egresados",
    beneficioTexto: "Al completar tu actualización oficial de datos podrás acceder a la Bolsa de Trabajo institucional, convocatorias laborales exclusivas, capacitaciones de empleabilidad y convenios de perfeccionamiento profesional.",
    botonTexto: "ACTUALIZAR MIS DATOS AQUÍ",
    botonUrl: "{{url_acceso}}",
    colorTema: "blanco", // blanco (elegante con logo), navy, royal, indigo
    footer: "Instituto de la Empresa • Sistema Oficial de Seguimiento al Egresado\nConsultas: reservas@iempresa.edu.pe"
  };

  try {
    const guardada = localStorage.getItem('iempresa_plantilla_custom') || localStorage.getItem('neumann_plantilla_custom');
    if (guardada) {
      return { ...defaultConfig, ...JSON.parse(guardada) };
    }
  } catch (e) {
    console.warn('Error leyendo plantilla custom:', e);
  }
  return defaultConfig;
}

function generarPlantillaCorreo(egresado, canalCorreo = 'institucional') {
  const correoDestino = (canalCorreo === 'institucional')
    ? (egresado.correo || egresado.correo_alternativo || `${egresado.dni}@empresa.global`)
    : (egresado.correo_alternativo || egresado.correo || `${egresado.dni}@empresa.global`);

  const origin = (window.location.origin && window.location.origin !== 'null' && !window.location.origin.startsWith('file'))
    ? window.location.origin
    : 'https://iempresa.edu.pe';
  
  let pathname = window.location.pathname || '';
  let basePath = '/egresados/';
  if (pathname.includes('/egresados')) {
    basePath = '/egresados/';
  } else {
    basePath = pathname.substring(0, pathname.lastIndexOf('/') + 1) || '/';
  }
  const urlAcceso = (egresado.dni && String(egresado.dni).trim())
    ? `${origin}${basePath}portal-egresado.html?dni=${encodeURIComponent(String(egresado.dni).trim())}`
    : `${origin}${basePath}portal-egresado.html`;

  const cfg = obtenerPlantillaConfig();

  // Esquemas de color elegante IEmpresa
  const colores = {
    blanco: { headerBg: '#ffffff', headerBorder: '#fed7aa', btnBg: '#FF5A00', btnText: '#ffffff', accent: '#FF5A00', isDark: false },
    navy: { headerBg: '#0B2545', headerBorder: '#FF5A00', btnBg: '#FF5A00', btnText: '#ffffff', accent: '#FF5A00', isDark: true },
    royal: { headerBg: '#1e3a8a', headerBorder: '#3b82f6', btnBg: '#FF5A00', btnText: '#ffffff', accent: '#3b82f6', isDark: true },
    indigo: { headerBg: '#312e81', headerBorder: '#818cf8', btnBg: '#FF5A00', btnText: '#ffffff', accent: '#6366f1', isDark: true }
  };
  const theme = colores[cfg.colorTema] || colores.blanco;

  const nombreFinal = (egresado.nombre && egresado.nombre.trim())
    ? egresado.nombre.trim()
    : [egresado.nombres, egresado.apellidos].filter(Boolean).join(' ').trim() || 'Egresado(a)';
  const carreraFinal = egresado.programa_estudios || egresado.carrera || 'Carrera Profesional';
  const dniFinal = String(egresado.dni || '');

  const reemplazarVars = (txt) => {
    if (!txt) return '';
    return txt
      .replace(/{{nombre}}/g, nombreFinal)
      .replace(/{{carrera}}/g, carreraFinal)
      .replace(/{{dni}}/g, dniFinal)
      .replace(/{{url_acceso}}/g, urlAcceso);
  };

  const asunto = reemplazarVars(cfg.asunto);
  const titulo = reemplazarVars(cfg.titulo);
  const subtitulo = reemplazarVars(cfg.subtitulo);
  const saludo = reemplazarVars(cfg.saludo || 'Estimado(a) {{nombre}},');
  const cuerpo = reemplazarVars(cfg.cuerpo);
  const beneficioTitulo = reemplazarVars(cfg.beneficioTitulo);
  const beneficioTexto = reemplazarVars(cfg.beneficioTexto);
  const botonTexto = reemplazarVars(cfg.botonTexto);
  const footerTxt = reemplazarVars(cfg.footer).replace(/\n/g, '<br>');
  const urlFinalBoton = (cfg.botonUrl && cfg.botonUrl.trim() && cfg.botonUrl.trim() !== '{{url_acceso}}')
    ? reemplazarVars(cfg.botonUrl.trim())
    : urlAcceso;

  const bloqueBeneficiosHtml = cfg.incluirBeneficios ? `
    <div style="background: #fff7ed; border: 1px solid #fed7aa; border-left: 4px solid ${theme.accent}; padding: 20px 24px; margin: 24px 0; border-radius: 8px;">
      <span style="font-size: 12.5px; font-weight: 700; color: #0B2545; text-transform: uppercase; letter-spacing: 0.5px; display: inline-block;">
        ${beneficioTitulo}
      </span>
      <p style="margin: 8px 0 0; font-size: 14px; color: #475569; line-height: 1.6;">
        ${beneficioTexto}
      </p>
    </div>
  ` : '';

  // Cabecera según tema (con logo o branding IEmpresa)
  let headerInnerHtml = '';
  if (!theme.isDark) {
    headerInnerHtml = `
      <div style="margin-bottom: 12px;">
        <img src="https://cdn.bitrix24.es/b15495391/landing/7a8/7a88860fb02485c824de9be805faee6d/ie_1x.png" 
             alt="Instituto de la Empresa" 
             style="height: 52px; max-width: 250px; object-fit: contain; display: inline-block;">
      </div>
      <h1 style="margin: 10px 0 4px 0; font-size: 21px; font-weight: 800; color: #0B2545; letter-spacing: -0.2px;">
        ${titulo}
      </h1>
      <p style="margin: 0; color: #64748b; font-size: 13.5px; font-weight: 500;">
        ${subtitulo}
      </p>
    `;
  } else {
    headerInnerHtml = `
      <h1 style="margin: 0; font-size: 20px; font-weight: 800; color: #ffffff;">
        ${titulo}
      </h1>
      <p style="margin: 4px 0 0 0; color: #cbd5e1; font-size: 12.5px;">
        ${subtitulo}
      </p>
    `;
  }

  const htmlCorreo = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body {
      font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, Roboto, Arial, sans-serif;
      background-color: #f1f5f9;
      margin: 0;
      padding: 24px 12px;
      color: #1e293b;
      -webkit-font-smoothing: antialiased;
    }
    .email-wrapper {
      max-width: 720px; width: 100%;
      margin: 0 auto;
      background: #ffffff;
      border-radius: 12px;
      overflow: hidden;
      border: 1px solid #e2e8f0;
      box-shadow: 0 4px 18px rgba(15, 23, 42, 0.05);
    }
    .email-header {
      background: ${theme.headerBg};
      padding: 28px 24px 20px 24px;
      text-align: center;
      border-bottom: 2px solid ${theme.headerBorder};
    }
    .email-content {
      padding: 34px 38px;
      line-height: 1.7;
      font-size: 15.5px;
      color: #334155;
    }
    .email-content h2 {
      font-size: 19px;
      font-weight: 700;
      color: #0f172a;
      margin-top: 0;
      margin-bottom: 12px;
    }
    .btn-action-primary {
      display: inline-block;
      background: ${theme.btnBg};
      color: ${theme.btnText} !important;
      text-decoration: none;
      padding: 16px 42px;
      border-radius: 10px;
      font-weight: 700;
      font-size: 15px;
      letter-spacing: 0.3px;
      box-shadow: 0 3px 12px rgba(2, 132, 199, 0.3);
    }
    .email-footer {
      background: #f8fafc;
      padding: 26px 34px;
      text-align: center;
      font-size: 12.5px;
      color: #64748b;
      border-top: 1px solid #e2e8f0;
      line-height: 1.6;
    }
  </style>
</head>
<body>
  <div class="email-wrapper">
    <div class="email-header">
      ${headerInnerHtml}
    </div>
    <div class="email-content">
      <h2>${saludo}</h2>
      <p style="margin: 0 0 16px 0;">
        ${cuerpo}
      </p>

      ${bloqueBeneficiosHtml}

      <div style="text-align: center; margin: 26px 0 16px 0;">
        <a href="${urlFinalBoton}" class="btn-action-primary" target="_blank">
          ${botonTexto}
        </a>
      </div>
      <p style="font-size: 11.5px; color: #64748b; text-align: center; margin: 0;">
        O ingresa directamente con tu DNI: <strong style="color: #0f172a;">${egresado.dni}</strong> en nuestro portal oficial.
      </p>
    </div>
    <div class="email-footer">
      ${footerTxt}
    </div>
  </div>
</body>
</html>`;

  return {
    destinatario: correoDestino,
    nombre: `${egresado.nombres} ${egresado.apellidos}`,
    asunto: asunto,
    enlace: urlAcceso,
    html: htmlCorreo
  };
}

// 7. ENVÍO REAL DE CORREOS MEDIANTE GOOGLE APPS SCRIPT WEBHOOK
async function enviarOtpViaWebhook(email, nombre, otp) {
  if (!APPS_SCRIPT_URL) return { success: false, error: 'APPS_SCRIPT_URL no configurado' };
  try {
    const res = await fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // text/plain evita preflight CORS estricto en Apps Script
      body: JSON.stringify({
        action: 'send_otp',
        email: email,
        nombre: nombre,
        otp: otp
      })
    });
    return await res.json();
  } catch (err) {
    console.error('Error enviando OTP por Apps Script:', err);
    return { success: false, error: err.message };
  }
}

async function enviarLoteInvitacionesViaWebhook(listaDestinatarios, urlPortal, canal = 'institucional') {
  if (!APPS_SCRIPT_URL) return { success: false, error: 'APPS_SCRIPT_URL no configurado' };
  try {
    // Adjuntar la plantilla HTML personalizada para cada egresado
    const destinatariosConHtml = listaDestinatarios.map(d => {
      const plantilla = generarPlantillaCorreo(d, canal);
      return {
        dni: d.dni,
        nombre: d.nombre,
        email: d.email,
        carrera: d.carrera,
        asunto: plantilla.asunto,
        htmlBody: plantilla.html
      };
    });

    const res = await fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        action: 'send_batch_invitations',
        destinatarios: destinatariosConHtml,
        urlBase: urlPortal
      })
    });
    return await res.json();
  } catch (err) {
    console.error('Error enviando invitaciones por Apps Script:', err);
    return { success: false, error: err.message };
  }
}

