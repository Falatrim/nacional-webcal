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

// 1. Consulta en ESPN
async function consultarESPN() {
  console.log('Consultando ESPN...');
  const { data } = await axios.get(ESPN_URL, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
    timeout: 10000
  });

  const $ = cheerio.load(data);
  let partidoDetectado = false;

  const hoyObj = new Date();
  const diaNum = hoyObj.getDate();

  $('tr').each((_, element) => {
    const textoFila = $(element).text().replace(/\s+/g, ' ').trim();
    const coincideDia = new RegExp(`\\b${diaNum}\\b`).test(textoFila);
    const esLocal = /\bNAC\b.*?\bv\b/i.test(textoFila);

    if (coincideDia && esLocal) {
      const matchHora = textoFila.match(/(\d{1,2}:\d{2}\s*(?:AM|PM)?)/i);
      const horaPartido = matchHora ? matchHora[1].replace(/\s+/g, ' ').trim() : '16:30 hs';

      // Extraer nombre de la competición si está disponible en la fila
      const celdas = $(element).find('td');
      const torneoStr = celdas.length >= 4 ? $(celdas[celdas.length - 1]).text().trim() : 'Liga AUF Uruguaya';

      const mensaje = 
        `🚨 <b>ALERTA DE TRÁFICO Y ZONA: PARTIDO EN EL PARQUE</b>\n\n` +
        `📅 <b>Fecha:</b> Hoy\n` +
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

// 2. Consulta en Sitio Oficial de Nacional
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
    const diaNum = String(hoyObj.getDate()).padStart(2, '0');

    const partidoDeHoy = await page.evaluate((diaNum) => {
      const textoPagina = document.body.innerText || '';

      const tieneFechaHoy = textoPagina.includes(`${diaNum} Septiembre`) || textoPagina.includes(`${diaNum}/`) || textoPagina.toLowerCase().includes('domingo, 06');
      const esEnElParque = textoPagina.toUpperCase().includes('GRAN PARQUE CENTRAL');

      if (tieneFechaHoy && esEnElParque) {
        // Extraer hora limpia
        const matchHora = textoPagina.match(/\d{1,2}[\s\n]*:[\s\n]*\d{2}/);
        let horaStr = '16:30';
        if (matchHora) {
          horaStr = matchHora[0].replace(/[\r\n\s]+/g, '');
        }

        // Extraer torneo si figura en la pantalla
        let torneo = 'Liga AUF Uruguaya';
        if (textoPagina.toLowerCase().includes('torneo clausura')) {
          torneo = 'Liga AUF Uruguaya - Torneo Clausura';
        } else if (textoPagina.toLowerCase().includes('copa libertadores')) {
          torneo = 'Copa Libertadores';
        }

        return { esLocal: true, hora: horaStr, torneo };
      }

      return null;
    }, diaNum);

    if (partidoDeHoy && partidoDeHoy.esLocal) {
      const mensaje = 
        `🚨 <b>ALERTA DE TRÁFICO Y ZONA: PARTIDO EN EL PARQUE</b>\n\n` +
        `📅 <b>Fecha:</b> Hoy\n` +
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
