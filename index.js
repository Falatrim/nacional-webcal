const axios = require('axios');
const cheerio = require('cheerio');
const puppeteer = require('puppeteer');

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

const ESPN_URL = 'https://www.espn.com.uy/futbol/equipo/calendario/_/id/2684/nacional';
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
    console.log('Notificación enviada a Telegram.');
  } catch (error) {
    console.error('Error al enviar a Telegram:', error.message);
  }
}

// 1. Consulta ESPN adaptada a la sigla "NAC" y formato "Sep. 6"
async function consultarESPN() {
  console.log('Consultando ESPN...');
  const { data } = await axios.get(ESPN_URL, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
    timeout: 10000
  });

  const $ = cheerio.load(data);
  let partidoDetectado = false;

  const hoyObj = new Date();
  const diaNum = hoyObj.getDate(); // Ej: 6

  $('tr').each((_, element) => {
    const textoFila = $(element).text().replace(/\s+/g, ' ').trim();

    // Revisa si la fila contiene el número del día de hoy y el mes actual
    const coincideDia = new RegExp(`\\b${diaNum}\\b`).test(textoFila);
    
    // En la tabla de ESPN (Imagen 1), si juega de local, la sigla 'NAC' aparece ANTES de la 'v'
    const esLocal = /\bNAC\b.*?\bv\b/i.test(textoFila);

    if (coincideDia && esLocal) {
      // Extrae hora (ej: 4:30 PM o 16:30)
      const matchHora = textoFila.match(/(\d{1,2}:\d{2}\s*(?:AM|PM)?)/i);
      const horaPartido = matchHora ? matchHora[1] : '16:30';

      const mensaje = 
        `🚨 <b>ALERTA DE TRÁFICO Y ZONA: PARTIDO EN EL PARQUE</b>\n\n` +
        `📅 <b>Fecha:</b> Hoy\n` +
        `⏰ <b>Hora fijada:</b> ${horaPartido}\n` +
        `🏟️ <b>Lugar:</b> Gran Parque Central\n\n` +
        `⚠️ <i>Tomar precauciones por cortes de calle, desvíos de ómnibus y congestión en La Blanqueada.</i>`;

      enviarMensajeTelegram(mensaje);
      partidoDetectado = true;
      return false;
    }
  });

  return partidoDetectado;
}

// 2. Consulta Sitio Oficial adaptada a "Domingo, 06 Septiembre" y "GRAN PARQUE CENTRAL"
async function consultarNacionalOficial() {
  console.log('Consultando sitio oficial de Nacional...');
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });

    const page = await browser.newPage();
    await page.goto(NACIONAL_CALENDARIO_URL, { waitUntil: 'networkidle2', timeout: 30000 });

    const hoyObj = new Date();
    const diaNum = String(hoyObj.getDate()).padStart(2, '0'); // Convierte 6 a "06"

    const partidoDeHoy = await page.evaluate((diaNum) => {
      const textoPagina = document.body.innerText || '';

      // Busca "06 Septiembre" o la etiqueta de Gran Parque Central
      const tieneFechaHoy = textoPagina.includes(`${diaNum} Septiembre`) || textoPagina.includes(`${diaNum}/`) || textoPagina.toLowerCase().includes('domingo, 06');
      const esEnElParque = textoPagina.toUpperCase().includes('GRAN PARQUE CENTRAL');

      if (tieneFechaHoy && esEnElParque) {
        // Extrae la hora exacta del marcador/tarjeta (ej: "16:30")
        const matchHora = textoPagina.match(/(\d{2}\s*:\s*\d{2})/);
        const horaStr = matchHora ? matchHora[1] : '16:30';

        return { esLocal: true, hora: horaStr };
      }

      return null;
    }, diaNum);

    if (partidoDeHoy && partidoDeHoy.esLocal) {
      const mensaje = 
        `🚨 <b>ALERTA DE TRÁFICO Y ZONA: PARTIDO EN EL PARQUE (Web Oficial)</b>\n\n` +
        `📅 <b>Fecha:</b> Hoy\n` +
        `⏰ <b>Hora fijada:</b> ${partidoDeHoy.hora} hs\n` +
        `🏟️ <b>Lugar:</b> Gran Parque Central\n\n` +
        `⚠️ <i>Tomar precauciones por cortes de calle, desvíos de ómnibus y congestión en La Blanqueada.</i>`;

      await enviarMensajeTelegram(mensaje);
      return true;
    }

    return false;

  } finally {
    if (browser) await browser.close();
  }
}

async function ejecutar() {
  let errorESPN = null;
  let errorOficial = null;

  try {
    if (await consultarESPN()) return;
  } catch (err) {
    errorESPN = err.message;
  }

  try {
    if (await consultarNacionalOficial()) return;
  } catch (err) {
    errorOficial = err.message;
  }

  if (errorESPN && errorOficial) {
    await enviarMensajeTelegram(
      `⚠️ <b>ALERTA TÉCNICA - BOT NACIONAL</b>\n\n` +
      `No se pudo consultar la información:\n` +
      `• ESPN: ${errorESPN}\n` +
      `• Web Oficial: ${errorOficial}`
    );
  }
}

ejecutar();
