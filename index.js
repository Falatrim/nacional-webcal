const axios = require('axios');
const puppeteer = require('puppeteer');

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

const NACIONAL_CALENDARIO_URL = 'https://nacional.uy/futbol/primer-equipo/calendario';

async function enviarMensajeTelegram(texto) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    console.error('Error: Faltan variables TELEGRAM_BOT_TOKEN o TELEGRAM_CHAT_ID');
    return;
  }
  try {
    await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      chat_id: TELEGRAM_CHAT_ID,
      text: texto,
      parse_mode: 'HTML'
    });
    console.log('Notificación enviada a Telegram con éxito.');
  } catch (error) {
    console.error('Error al enviar a Telegram:', error.message);
  }
}

// Genera el objeto de fecha para hoy o mañana en Montevideo
function obtenerFechaUruguay(diasSumados = 0) {
  const fecha = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Montevideo" }));
  fecha.setDate(fecha.getDate() + diasSumados);
  return fecha;
}

function formatearTextoFecha(fecha, esManana) {
  const dia = String(fecha.getDate()).padStart(2, '0');
  const mes = String(fecha.getMonth() + 1).padStart(2, '0');
  const prefijo = esManana ? 'Mañana' : 'Hoy';
  return `${prefijo} (${dia}/${mes})`;
}

async function consultarNacionalOficial(fechaObjetivo, esManana) {
  let browser;
  try {
    console.log(`Consultando web oficial para ${esManana ? 'MAÑANA' : 'HOY'}...`);
    
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });

    const page = await browser.newPage();
    await page.emulateTimezone('America/Montevideo');
    await page.goto(NACIONAL_CALENDARIO_URL, { waitUntil: 'networkidle2', timeout: 30000 });

    const diaNum = String(fechaObjetivo.getDate()).padStart(2, '0');
    const mesesOficial = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    const mesNombre = mesesOficial[fechaObjetivo.getMonth()];

    const partidoDetectado = await page.evaluate((diaNum, mesNombre) => {
      const textoPagina = document.body.innerText || '';

      const tieneFecha = textoPagina.toLowerCase().includes(`${diaNum} ${mesNombre.toLowerCase()}`) || 
                         textoPagina.includes(`${diaNum}/`);
                             
      const esEnElParque = textoPagina.toUpperCase().includes('GRAN PARQUE CENTRAL');

      if (tieneFecha && esEnElParque) {
        const matchHora = textoPagina.match(/\d{1,2}[\s\n]*:[\s\n]*\d{2}/);
        let horaStr = 'A confirmar';
        if (matchHora) {
          horaStr = matchHora[0].replace(/[\r\n\s]+/g, '');
        }

        let torneoStr = 'A confirmar / Desconocido';
        const lineas = textoPagina.split('\n').map(l => l.trim()).filter(Boolean);
        const lineaTorneo = lineas.find(l => 
          /liga|copa|torneo|campeonato/i.test(l) && !l.toLowerCase().includes('todos los')
        );

        if (lineaTorneo) torneoStr = lineaTorneo;

        return { esLocal: true, hora: horaStr, torneo: torneoStr };
      }

      return null;
    }, diaNum, mesNombre);

    if (partidoDetectado && partidoDetectado.esLocal) {
      const fechaTexto = formatearTextoFecha(fechaObjetivo, esManana);
      const tituloHeader = esManana ? 'PARTIDO MAÑANA EN EL PARQUE' : 'PARTIDO HOY EN EL PARQUE';
      
      const mensaje = 
        `🚨 <b>ALERTA DE TRÁFICO Y ZONA: ${tituloHeader}</b>\n\n` +
        `📅 <b>Fecha:</b> ${fechaTexto}\n` +
        `⏰ <b>Hora fijada:</b> ${partidoDetectado.hora} hs\n` +
        `🏆 <b>Torneo:</b> ${partidoDetectado.torneo}\n` +
        `🏟️ <b>Lugar:</b> Gran Parque Central\n` +
        `📌 <b>Fuente:</b> Sitio Oficial (nacional.uy)\n\n` +
        `⚠️ <i>Tomar precauciones por cortes de calle, desvíos de ómnibus y congestión en La Blanqueada.</i>`;

      await enviarMensajeTelegram(mensaje);
      return true;
    }

    return false;
  } catch (error) {
    console.error(`Error al consultar la web oficial: ${error.message}`);
    throw error;
  } finally {
    if (browser) await browser.close();
  }
}

async function ejecutar() {
  const hoy = obtenerFechaUruguay(0);
  const manana = obtenerFechaUruguay(1);

  try {
    // 1. Revisa si hay partido HOY
    const hayHoy = await consultarNacionalOficial(hoy, false);

    // 2. Si no hay partido hoy, revisa si hay partido MAÑANA
    if (!hayHoy) {
      await consultarNacionalOficial(manana, true);
    }
  } catch (err) {
    await enviarMensajeTelegram(
      `⚠️ <b>ALERTA TÉCNICA - BOT NACIONAL</b>\n\n` +
      `No se pudo consultar el sitio oficial de Nacional:\n` +
      `• Error: ${err.message}`
    );
  }
}

ejecutar();
