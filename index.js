const axios = require('axios');
const puppeteer = require('puppeteer');

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

const NACIONAL_CALENDARIO_URL = 'https://nacional.uy/futbol/primer-equipo/calendario';
const ESPN_URL = 'https://www.espn.com.uy/futbol/equipo/calendario/_/id/2684/nacional';

async function enviarMensajeTelegram(texto) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return;
  try {
    await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      chat_id: TELEGRAM_CHAT_ID,
      text: texto,
      parse_mode: 'HTML'
    });
    console.log('Notificación enviada a Telegram.');
  } catch (error) {
    console.error('Error enviando a Telegram:', error.message);
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

// 1. PLAN A: Sitio Oficial
async function consultarNacionalOficial(fechaObjetivo, esManana) {
  let browser;
  try {
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
  } finally {
    if (browser) await browser.close();
  }
}

// 2. PLAN B: ESPN
async function consultarESPN(fechaObjetivo, esManana) {
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });

    const page = await browser.newPage();
    await page.emulateTimezone('America/Montevideo');
    await page.goto(ESPN_URL, { waitUntil: 'networkidle2', timeout: 30000 });

    const diaNum = fechaObjetivo.getDate();

    const partidoDetectado = await page.evaluate((diaNum) => {
      const filas = Array.from(document.querySelectorAll('tr'));
      
      for (const fila of filas) {
        const textoOriginal = fila.innerText || '';
        const txt = textoOriginal.replace(/\s+/g, ' ').trim();

        const coincideDia = new RegExp(`\\b${diaNum}\\b`).test(txt);
        const esLocal = /Nacional\s+v\s+/i.test(txt);

        if (coincideDia && esLocal) {
          const matchHora = txt.match(/(\d{1,2}:\d{2}\s*(?:AM|PM)?)/i);
          const horaStr = matchHora ? matchHora[1].toUpperCase() : 'A confirmar';

          let torneoStr = 'A confirmar / Desconocido';
          const celdas = Array.from(fila.querySelectorAll('td'));
          if (celdas.length > 0) {
            const textosCeldas = celdas.map(c => c.innerText.trim()).filter(Boolean);
            if (textosCeldas.length > 0) torneoStr = textosCeldas[textosCeldas.length - 1];
          }

          return { hora: horaStr, torneo: torneoStr };
        }
      }
      return null;
    }, diaNum);

    if (partidoDetectado) {
      const fechaTexto = formatearTextoFecha(fechaObjetivo, esManana);
      const tituloHeader = esManana ? 'PARTIDO MAÑANA EN EL PARQUE' : 'PARTIDO HOY EN EL PARQUE';

      const mensaje = 
        `🚨 <b>ALERTA DE TRÁFICO Y ZONA: ${tituloHeader}</b>\n\n` +
        `📅 <b>Fecha:</b> ${fechaTexto}\n` +
        `⏰ <b>Hora fijada:</b> ${partidoDetectado.hora}\n` +
        `🏆 <b>Torneo:</b> ${partidoDetectado.torneo}\n` +
        `🏟️ <b>Lugar:</b> Gran Parque Central\n` +
        `📌 <b>Fuente:</b> ESPN\n\n` +
        `⚠️ <i>Tomar precauciones por cortes de calle, desvíos de ómnibus y congestión en La Blanqueada.</i>`;

      await enviarMensajeTelegram(mensaje);
      return true;
    }

    return false;
  } finally {
    if (browser) await browser.close();
  }
}

async function verificarFecha(fechaObjetivo, esManana) {
  try {
    if (await consultarNacionalOficial(fechaObjetivo, esManana)) return true;
  } catch (e) {
    console.error(`Error en oficial (${esManana ? 'Mañana' : 'Hoy'}):`, e.message);
  }

  try {
    if (await consultarESPN(fechaObjetivo, esManana)) return true;
  } catch (e) {
    console.error(`Error en ESPN (${esManana ? 'Mañana' : 'Hoy'}):`, e.message);
  }

  return false;
}

async function ejecutar() {
  const hoy = obtenerFechaUruguay(0);
  const manana = obtenerFechaUruguay(1);

  // 1. Busca si hay partido HOY
  const hayHoy = await verificarFecha(hoy, false);

  // 2. Si no hay hoy, busca si hay partido MAÑANA
  if (!hayHoy) {
    await verificarFecha(manana, true);
  }
}

ejecutar();
