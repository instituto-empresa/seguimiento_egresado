/**
 * ==============================================================================
 * GOOGLE APPS SCRIPT - INSTITUTO DE LA EMPRESA (IEMPRESA)
 * Módulo de Envío de Correos Institucionales
 * (OTP, Credenciales Administrativas y Convocatoria de Egresados)
 * ==============================================================================
 */

// Configuración de Identidad Institucional
const REMITENTE_NOMBRE = "Instituto de la Empresa - IEmpresa";
const CORREO_SOPORTE = "reservas@iempresa.edu.pe";

/**
 * Endpoint GET para verificar estado del Webhook y cuota disponible
 */
function doGet(e) {
  return ContentService.createTextOutput(JSON.stringify({
    status: "online",
    service: "Servicio de Notificaciones y OTP - IEmpresa Egresados",
    cuotaRestante: MailApp.getRemainingDailyQuota(),
    timestamp: new Date().toISOString()
  })).setMimeType(ContentService.MimeType.JSON);
}

/**
 * Endpoint POST para recepción de solicitudes
 */
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const action = data.action;

    // 1. ENVÍO DE CÓDIGO OTP DE VERIFICACIÓN AL SUPERADMIN / ADMIN
    if (action === "send_otp") {
      const email = data.email;
      const otp = data.otp;
      const nombre = data.nombre || "Administrador";

      enviarCorreoOtp(email, nombre, otp);

      return responderJSON({
        success: true,
        message: `Código OTP enviado exitosamente a ${email}`
      });
    }

    // 2. ENVÍO DE CREDENCIALES DE ACCESO AL PANEL ADMINISTRATIVO
    else if (action === "send_admin_credentials") {
      const email = data.email;
      const nombre = data.nombre || "Usuario Administrativo";
      const rol = data.rol || "Administrador";
      const password = data.password;
      const urlLogin = data.urlLogin || "";

      enviarCredencialesAdminEmail(email, nombre, rol, password, urlLogin);

      return responderJSON({
        success: true,
        message: `Credenciales de acceso enviadas exitosamente a ${email}`
      });
    }

    // 3. ENVÍO DE INVITACIÓN INDIVIDUAL AL EGRESADO
    else if (action === "send_invitation") {
      const email = data.email;
      const nombre = data.nombre;
      const dni = data.dni;
      const carrera = data.carrera;
      const urlPortal = data.urlPortal || "";
      const asunto = data.asunto;
      const htmlBody = data.htmlBody;

      enviarInvitacionEgresado(email, nombre, dni, carrera, urlPortal, asunto, htmlBody);

      return responderJSON({
        success: true,
        message: `Invitación enviada a ${email}`
      });
    }

    // 4. ENVÍO POR LOTE (BATCH) DE INVITACIONES
    else if (action === "send_batch_invitations") {
      const lista = data.destinatarios || [];
      const urlBase = data.urlBase || "";
      let enviados = 0;
      let errores = [];

      for (let i = 0; i < lista.length; i++) {
        const item = lista[i];
        if (item.email && item.dni) {
          try {
            enviarInvitacionEgresado(
              item.email, 
              item.nombre, 
              item.dni, 
              item.carrera, 
              urlBase, 
              item.asunto, 
              item.htmlBody
            );
            enviados++;
          } catch(errItem) {
            console.error(`Error al enviar a ${item.email}:`, errItem);
            errores.push({ email: item.email, error: errItem.toString() });
          }
        }
      }

      return responderJSON({
        success: true,
        enviados: enviados,
        total: lista.length,
        errores: errores
      });
    }

    else {
      return responderJSON({ success: false, message: "Acción no reconocida." });
    }

  } catch (err) {
    console.error("Error en doPost:", err);
    return responderJSON({ success: false, error: err.toString() });
  }
}

/**
 * Función: Envío de Correo OTP al Superadmin / Admin
 */
function enviarCorreoOtp(email, nombre, otp) {
  const asunto = `Tu Código de Verificación OTP: ${otp} - IEmpresa`;

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: 'Segoe UI', Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 20px; color: #0B2545; }
        .card { max-width: 520px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 4px 15px rgba(0,0,0,0.05); }
        .header { background: #0B2545; padding: 26px; text-align: center; color: white; border-bottom: 4px solid #FF5A00; }
        .header h1 { margin: 0; font-size: 20px; font-weight: 800; letter-spacing: -0.3px; color: #ffffff; }
        .content { padding: 30px; line-height: 1.5; font-size: 14px; text-align: center; color: #334155; }
        .otp-box { background: #fff7ed; border: 2px dashed #FF5A00; border-radius: 8px; font-size: 32px; font-weight: 800; letter-spacing: 8px; color: #FF5A00; padding: 16px; margin: 24px 0; text-align: center; }
        .footer { background: #f8fafc; padding: 18px; text-align: center; font-size: 11px; color: #64748b; border-top: 1px solid #e2e8f0; }
      </style>
    </head>
    <body>
      <div class="card">
        <div class="header">
          <h1>INSTITUTO DE LA EMPRESA</h1>
          <p style="margin: 4px 0 0; color: #cbd5e1; font-size: 12px;">Seguridad y Control de Acceso Administrativo</p>
        </div>
        <div class="content">
          <p>Hola <strong>${nombre}</strong>,</p>
          <p>Has solicitado ingresar o restablecer tu acceso al <strong>Panel de Administración de Egresados</strong>. Usa el siguiente código de verificación de 6 dígitos:</p>
          
          <div class="otp-box">${otp}</div>

          <p style="font-size: 12px; color: #64748b; margin: 0;">
            Este código es de uso personal y expira en <strong>10 minutos</strong>.<br>
            Si no solicitaste este acceso, comunícate con soporte técnico.
          </p>
        </div>
        <div class="footer">
          &copy; ${new Date().getFullYear()} Instituto de la Empresa &bull; Plataforma Oficial<br>
          ${CORREO_SOPORTE}
        </div>
      </div>
    </body>
    </html>
  `;

  GmailApp.sendEmail(email, asunto, `Tu código de verificación OTP es: ${otp}`, {
    htmlBody: html,
    name: REMITENTE_NOMBRE,
    replyTo: CORREO_SOPORTE
  });
}

/**
 * Función: Envío de Credenciales de Acceso para Usuarios Administrativos
 */
function enviarCredencialesAdminEmail(email, nombre, rol, password, urlLogin) {
  const asunto = `Acceso al Panel de Administración de Egresados - IEmpresa`;

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: 'Segoe UI', Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 20px; color: #0B2545; }
        .card { max-width: 540px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 4px 15px rgba(0,0,0,0.05); }
        .header { background: #0B2545; padding: 26px; text-align: center; color: white; border-bottom: 4px solid #FF5A00; }
        .header h1 { margin: 0; font-size: 19px; font-weight: 800; letter-spacing: -0.3px; color: #ffffff; }
        .badge-rol { display: inline-block; background: #FF5A00; color: #ffffff; font-size: 11px; font-weight: 700; padding: 3px 12px; border-radius: 12px; text-transform: uppercase; margin-top: 8px; letter-spacing: 0.5px; }
        .content { padding: 30px; line-height: 1.6; font-size: 14px; color: #334155; }
        .cred-box { background: #f8fafc; border: 1px solid #e2e8f0; border-left: 4px solid #FF5A00; border-radius: 8px; padding: 16px 20px; margin: 20px 0; }
        .cred-item { margin: 8px 0; font-size: 13.5px; }
        .cred-label { color: #64748b; font-weight: 600; display: inline-block; width: 110px; }
        .cred-value { color: #0B2545; font-weight: 700; font-family: monospace; font-size: 14.5px; }
        .btn-container { text-align: center; margin: 26px 0 16px 0; }
        .btn { display: inline-block; background: #FF5A00; color: #ffffff !important; text-decoration: none; padding: 13px 32px; border-radius: 8px; font-weight: 700; font-size: 14px; box-shadow: 0 3px 10px rgba(255, 90, 0, 0.25); }
        .footer { background: #f8fafc; padding: 18px; text-align: center; font-size: 11px; color: #64748b; border-top: 1px solid #e2e8f0; }
      </style>
    </head>
    <body>
      <div class="card">
        <div class="header">
          <h1>INSTITUTO DE LA EMPRESA</h1>
          <p style="margin: 4px 0 0; color: #cbd5e1; font-size: 12px;">Plataforma de Seguimiento de Egresados</p>
          <div class="badge-rol">${rol}</div>
        </div>
        <div class="content">
          <p>Estimado(a) <strong>${nombre}</strong>,</p>
          <p>Se te ha habilitado una cuenta de acceso para la gestión del sistema de egresados. A continuación encontrarás tus credenciales oficiales de acceso:</p>
          
          <div class="cred-box">
            <div class="cred-item">
              <span class="cred-label">Usuario / Email:</span>
              <span class="cred-value" style="font-family: inherit;">${email}</span>
            </div>
            <div class="cred-item">
              <span class="cred-label">Contraseña:</span>
              <span class="cred-value">${password}</span>
            </div>
            <div class="cred-item">
              <span class="cred-label">Rol asignado:</span>
              <span class="cred-value" style="font-family: inherit; color: #FF5A00;">${rol}</span>
            </div>
          </div>

          <div class="btn-container">
            <a href="${urlLogin}" class="btn" target="_blank">INGRESAR AL PANEL</a>
          </div>

          <p style="font-size: 12px; color: #64748b; margin-top: 24px; text-align: center;">
            Por motivos de seguridad, te recomendamos cambiar tu contraseña tras iniciar sesión por primera vez.<br>
            Si tienes inconvenientes para ingresar, comunícate a ${CORREO_SOPORTE}.
          </p>
        </div>
        <div class="footer">
          &copy; ${new Date().getFullYear()} Instituto de la Empresa &bull; Plataforma Oficial<br>
          ${CORREO_SOPORTE}
        </div>
      </div>
    </body>
    </html>
  `;

  GmailApp.sendEmail(email, asunto, `Hola ${nombre}, tus credenciales de acceso al panel son: Usuario: ${email} | Contraseña: ${password} | Ingreso: ${urlLogin}`, {
    htmlBody: html,
    name: REMITENTE_NOMBRE,
    replyTo: CORREO_SOPORTE
  });
}

/**
 * Función: Envío de Invitación Oficial al Egresado
 */
function enviarInvitacionEgresado(email, nombre, dni, carrera, urlBase, asuntoCustom, htmlCustom) {
  const urlAcceso = urlBase.includes('?') ? `${urlBase}&dni=${dni}` : `${urlBase}?dni=${dni}`;
  const asuntoFinal = asuntoCustom || `Actualización de Datos de Egresados - Instituto de la Empresa`;

  // Plantilla HTML de respaldo oficial para IEmpresa
  const htmlFallback = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        body { font-family: 'Segoe UI', Arial, sans-serif; background-color: #f1f5f9; margin: 0; padding: 24px 12px; color: #1e293b; }
        .card { max-width: 680px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 4px 18px rgba(15, 23, 42, 0.05); }
        .header { background: #0B2545; padding: 28px 24px 20px 24px; text-align: center; border-bottom: 4px solid #FF5A00; }
        .header h1 { margin: 8px 0 3px 0; font-size: 19px; font-weight: 800; color: #ffffff; letter-spacing: -0.2px; }
        .header p { margin: 0; color: #cbd5e1; font-size: 12px; font-weight: 500; }
        .content { padding: 32px 30px; line-height: 1.65; font-size: 14.5px; color: #334155; }
        .card-benefit { background: #fff7ed; border: 1px solid #fed7aa; border-left: 4px solid #FF5A00; padding: 16px 18px; margin: 20px 0; border-radius: 6px; }
        .btn { display: inline-block; background: #FF5A00; color: #ffffff !important; text-decoration: none; padding: 14px 36px; border-radius: 8px; font-weight: 700; font-size: 14px; letter-spacing: 0.3px; box-shadow: 0 3px 12px rgba(255, 90, 0, 0.3); }
        .footer { background: #f8fafc; padding: 20px 24px; text-align: center; font-size: 11px; color: #64748b; border-top: 1px solid #e2e8f0; line-height: 1.55; }
      </style>
    </head>
    <body>
      <div class="card">
        <div class="header">
          <h1>INSTITUTO DE LA EMPRESA</h1>
          <p>Red Oficial de Egresados y Graduados | Convocatoria Oficial</p>
        </div>
        <div class="content">
          <h2 style="font-size: 16px; font-weight: 700; color: #0B2545; margin-top: 0;">Estimado(a) <strong>${nombre || 'Egresado(a)'}</strong>,</h2>
          <p>Esperamos que te encuentres muy bien. Como graduado(a) del programa de <strong>${carrera || 'Carrera Profesional'}</strong>, queremos invitarte a mantener actualizada tu información de contacto y trayectoria profesional para acceder a convocatorias laborales exclusivas, capacitaciones y beneficios de nuestra red institucional.</p>
          <div class="card-benefit">
            <strong style="color: #0B2545; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Beneficios de la Red de Egresados</strong>
            <p style="margin: 6px 0 0 0; font-size: 12.5px; color: #475569;">Al completar tu actualización oficial de datos podrás acceder a la Bolsa de Trabajo institucional, convocatorias laborales exclusivas, capacitaciones de empleabilidad y convenios de perfeccionamiento profesional.</p>
          </div>
          <div style="text-align: center; margin: 28px 0 18px 0;">
            <a href="${urlAcceso}" class="btn" target="_blank">ACTUALIZAR MIS DATOS AQUÍ</a>
          </div>
          ${dni ? `<p style="font-size: 11.5px; color: #64748b; text-align: center; margin: 0;">
            O ingresa directamente con tu DNI: <strong style="color: #0B2545;">${dni}</strong> en nuestro portal oficial.
          </p>` : ''}
        </div>
        <div class="footer">
          Instituto de la Empresa &bull; Sistema Oficial de Seguimiento al Egresado<br>
          Consultas: ${CORREO_SOPORTE}
        </div>
      </div>
    </body>
    </html>
  `;

  const htmlDefinitivo = (htmlCustom && htmlCustom.length > 50) ? htmlCustom : htmlFallback;

  GmailApp.sendEmail(email, asuntoFinal, `Hola ${nombre}, actualiza tus datos de egresado aquí: ${urlAcceso}`, {
    htmlBody: htmlDefinitivo,
    name: REMITENTE_NOMBRE,
    replyTo: CORREO_SOPORTE
  });
}

function responderJSON(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
