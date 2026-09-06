const axios = require('axios');
const cheerio = require('cheerio');
const puppeteer = require('puppeteer');

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

const NACIONAL_CALENDARIO_URL = 'https://nacional.uy/futbol/primer-equipo/calendario';
const ESPN_URL = 'https://www.espn.com.uy/futbol/equipo/calendario/_/id/2684/nacional';

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
    console.log('Notificación enviada a Telegram.');
  } catch (error) {
    console.error('Error al enviar a Telegram:', error.message);
  }
}

// Helper para obtener la fecha de hoy formateada como (DD/MM)
function obtenerFechaTexto() {
  const hoy = new Date();
  const dia = String(hoy.getDate()).padStart(2, '0');
  const mes = String(hoy.getMonth() + 1).padStart(2, '0');
  return `Hoy (${dia}/${mes})`;
}

// 1. Consulta Sitio Oficial de Nacional (PLAN A)
async function consultarNacionalOficial() {
  console.log('Consultando sitio oficial de Nacional (Plan A)...');
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });

    const page = await browser.newPage();
    await page.goto(NACIONAL_CALENDARIO_URL, { waitUntil: 'networkidle2', timeout: 30000 });

    const hoyObj = new Date();
    const diaNum = String(hoyObj.getDate()).padStart(2, '0');
    const mesesOficial = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    const mesNombre = mesesOficial[hoyObj.getMonth()];

    const partidoDeHoy = await page.evaluate((diaNum, mesNombre) => {
      const textoPagina = document.body.innerText || '';

      const tieneFechaHoy = textoPagina.toLowerCase().includes(`${diaNum} ${mesNombre.toLowerCase()}`) || 
                             textoPagina.includes(`${diaNum}/`);
                             
      const esEnElParque = textoPagina.toUpperCase().includes('GRAN PARQUE CENTRAL');

      if (tieneFechaHoy && esEnElParque) {
        // Extraer Hora limpia
        const matchHora = textoPagina.match(/\d{1,2}[\s\n]*:[\s\n]*\d{2}/);
        let horaStr = 'A confirmar';
        if (matchHora) {
          horaStr = matchHora[0].replace(/[\r\n\s]+/g, '');
        }

        // Extraer Torneo dinámicamente
        let torneoStr = 'A confirmar / Desconocido';
        const lineas = textoPagina.split('\n').map(l => l.trim()).filter(Boolean);
        
        const lineaTorneo = lineas.find(l => 
          /liga|copa|torneo|campeonato/i.test(l) && !l.toLowerCase().includes('todos los')
        );

        if (lineaTorneo) {
          torneoStr = lineaTorneo;
        }

        return { esLocal: true, hora: horaStr, torneo: torneoStr };
      }

      return null;
    }, diaNum, mesNombre);

    if (partidoDeHoy && partidoDeHoy.esLocal) {
      const fechaTexto = obtenerFechaTexto();
      const mensaje = 
        `🚨 <b>ALERTA DE TRÁFICO Y ZONA: PARTIDO EN EL PARQUE</b>\n\n` +
        `📅 <b>Fecha:</b> ${fechaTexto}\n` +
        `⏰ <b>Hora fijada:</b> ${partidoDeHoy.hora} hs\n` +
        `🏆 <b>Torneo:</b> ${partidoDeHoy.torneo}\n` +
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

// 2. Consulta ESPN (PLAN B - Alternativa)
async function consultarESPN() {
  console.log('Consultando ESPN (Plan B)...');
  const { data } = await axios.get(ESPN_URL, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
    timeout: 10000
  });

  const $ = cheerio.load(data);
  let partidoDetectado = false;

  const hoyObj = new Date();
  const diaNum = hoyObj.getDate();
  const mesesEspn = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const mesTexto = mesesEspn[hoyObj.getMonth()];

  $('tr').each((_, element) => {
    const textoFila = $(element).text().replace(/\./g, '').replace(/\s+/g, ' ').toLowerCase().trim();
    
    const coincideDia = new RegExp(`\\b${diaNum}\\b`).test(textoFila);
    const coincideMes = new RegExp(`\\b${mesTexto}\\b`).test(textoFila);
    const esLocal = /\bnac\b.*?\bv\b/.test(textoFila);

    if (coincideDia && coincideMes && esLocal) {
      const matchHora = textoFila.match(/(\d{1,2}:\d{2}\s*(?:am|pm)?)/);
      const horaPartido = matchHora ? matchHora[1].toUpperCase().trim() : 'A confirmar';

      const celdas = $(element).find('td');
      let torneoStr = 'A confirmar / Desconocido';
      if (celdas.length >= 4) {
        const txtCelda = $(celdas[celdas.length - 1]).text().trim();
        if (txtCelda) torneoStr = txtCelda;
      }

      const fechaTexto = obtenerFechaTexto();
      const mensaje = 
        `🚨 <b>ALERTA DE TRÁFICO Y ZONA: PARTIDO EN EL PARQUE</b>\n\n` +
        `📅 <b>Fecha:</b> ${fechaTexto}\n` +
        `⏰ <b>Hora fijada:</b> ${horaPartido}\n` +
        `🏆 <b>Torneo:</b> ${torneoStr}\n` +
        `🏟️ <b>Lugar:</b> Gran Parque Central\n` +
        `📌 <b>Fuente:</b> ESPN\n\n` +
        `⚠️ <i>Tomar precauciones por cortes de calle, desvíos de ómnibus y congestión en La Blanqueada.</i>`;

      enviarMensajeTelegram(mensaje);
      partidoDetectado = true;
      return false;
    }
  });

  return partidoDetectado;
}

async function ejecutar() {
  let errorOficial = null;
  let errorESPN = null;

  try {
    if (await consultarNacionalOficial()) return;
  } catch (err) {
    errorOficial = err.message;
  }

  try {
    if (await consultarESPN()) return;
  } catch (err) {
    errorESPN = err.message;
  }

  if (errorOficial && errorESPN) {
    await enviarMensajeTelegram(
      `⚠️ <b>ALERTA TÉCNICA - BOT NACIONAL</b>\n\n` +
      `No se pudo consultar la información en ninguna fuente:\n` +
      `• Web Oficial: ${errorOficial}\n` +
      `• ESPN: ${errorESPN}`
    );
  }
}

ejecutar();
